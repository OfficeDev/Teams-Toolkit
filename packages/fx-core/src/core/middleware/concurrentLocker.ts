// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

import { HookContext, Middleware, NextFunction } from "@feathersjs/hooks";
import {
  ConfigFolderName,
  CoreCallbackEvent,
  Func,
  Inputs,
  ProductName,
  err,
} from "@microsoft/teamsfx-api";
import crypto from "crypto";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as properLock from "proper-lockfile";
import { TOOLS } from "../../common/globalVars";
import * as projectSettingsHelper from "../../common/projectSettingsHelper";
import { sendTelemetryErrorEvent } from "../../common/telemetry";
import * as commonUtils from "../../common/utils";
import {
  ConcurrentError,
  CoreSource,
  FileNotFoundError,
  InvalidProjectError,
  NoProjectOpenedError,
} from "../../error/common";
import { CallbackRegistry } from "../callback";
import { shouldIgnored } from "./projectSettingsLoader";

let doingTask: string | undefined = undefined;
export const ConcurrentLockerMW: Middleware = async (ctx: HookContext, next: NextFunction) => {
  const inputs = ctx.arguments[ctx.arguments.length - 1] as Inputs;
  if (shouldIgnored(ctx)) {
    await next();
    return;
  }
  if (!inputs.projectPath) {
    ctx.result = err(new NoProjectOpenedError());
    return;
  }
  if (!(await fs.pathExists(inputs.projectPath))) {
    ctx.result = err(new FileNotFoundError("ConcurrentLockerMW", inputs.projectPath));
    return;
  }
  let configFolder = "";
  if (projectSettingsHelper.isValidProjectV3(inputs.projectPath)) {
    configFolder = path.join(inputs.projectPath);
  } else {
    ctx.result = err(new InvalidProjectError(inputs.projectPath));
    return;
  }

  const lockFileDir = getLockFolder(inputs.projectPath);
  const lockfilePath = path.join(lockFileDir, `${ConfigFolderName}.lock`);
  await fs.ensureDir(lockFileDir);

  const taskName = `${ctx.method}${
    ctx.method === "executeUserTask" || ctx.method === "executeUserTaskOld"
      ? ` ${(ctx.arguments[0] as Func).method}`
      : ""
  }`;
  let acquired = false;
  let retryNum = 0;
  for (let i = 0; i < 10; ++i) {
    try {
      await properLock.lock(configFolder, { lockfilePath: lockfilePath });
      acquired = true;
      for (const f of CallbackRegistry.get(CoreCallbackEvent.lock)) {
        await f(taskName);
      }
      try {
        doingTask = taskName;
        if (retryNum > 0) {
          // failed for some try and finally success
          sendTelemetryErrorEvent(
            CoreSource,
            "concurrent-operation",
            new ConcurrentError(CoreSource),

            { retry: retryNum + "", acquired: "true", doing: doingTask, todo: taskName }
          );
        }
        await next();
      } finally {
        await properLock.unlock(configFolder, { lockfilePath: lockfilePath });
        for (const f of CallbackRegistry.get(CoreCallbackEvent.unlock)) {
          await f(taskName);
        }
        doingTask = undefined;
      }
      break;
    } catch (e) {
      if (e["code"] === "ELOCKED") {
        await commonUtils.waitSeconds(1);
        ++retryNum;
        continue;
      }
      throw e;
    }
  }
  if (!acquired) {
    const log = `Failed to acquire lock for task ${taskName} on: ${configFolder}`;
    TOOLS?.logProvider?.error(log);
    // failed for 10 times and finally failed
    sendTelemetryErrorEvent(CoreSource, "concurrent-operation", new ConcurrentError(CoreSource), {
      retry: retryNum + "",
      acquired: "false",
      doing: doingTask || "",
      todo: taskName,
    });
    ctx.result = err(new ConcurrentError(CoreSource));
  }
};

export function getLockFolder(projectPath: string): string {
  return path.join(
    os.tmpdir(),
    `${ProductName}-${crypto.createHash("sha256").update(projectPath).digest("hex")}`
  );
}
