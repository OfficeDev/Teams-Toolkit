// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks/lib";
import {
  ConfigFolderName,
  CoreCallbackEvent,
  FxError,
  Inputs,
  ok,
  Platform,
  Result,
  SettingsFolderName,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { assert, chai, vi } from "vitest";
import * as projectSettingsHelper from "../../../src/common/projectSettingsHelper";
import * as commonUtils from "../../../src/common/utils";
import { CallbackRegistry } from "../../../src/core/callback";
import { ConcurrentLockerMW, getLockFolder } from "../../../src/core/middleware/concurrentLocker";
import { CoreSource, NoProjectOpenedError } from "../../../src/error";
import {
  ConcurrentError,
  FileNotFoundError,
  InvalidProjectError,
  UserCancelError,
} from "../../../src/error/common";
import { randomAppName } from "../utils";

describe("Middleware - ConcurrentLockerMW", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("check lock file existence", async () => {
    class MyClass1 {
      async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
        const lockFileDir = getLockFolder(inputs.projectPath!);
        const lockfilePath = path.join(lockFileDir, `${ConfigFolderName}.lock`);
        const exist = await fs.pathExists(lockfilePath);
        assert.isTrue(exist);
        return ok("");
      }
    }
    hooks(MyClass1, {
      myMethod: [ConcurrentLockerMW],
    });
    const my = new MyClass1();
    const inputs: Inputs = { platform: Platform.VSCode };
    inputs.projectPath = path.join(os.tmpdir(), randomAppName());
    const lockFileDir = getLockFolder(inputs.projectPath!);
    try {
      await fs.ensureDir(inputs.projectPath);
      await fs.ensureDir(path.join(inputs.projectPath, `.${ConfigFolderName}`));
      await my.myMethod(inputs);
      const lockfilePath = path.join(lockFileDir, `${ConfigFolderName}.lock`);
      const exist = await fs.pathExists(lockfilePath);
      assert.isFalse(exist);
    } finally {
      await fs.remove(inputs.projectPath!);
    }
  });

  class MyClass {
    count = 0;
    async methodReturnOK(inputs: Inputs): Promise<Result<any, FxError>> {
      this.count++;
      return ok("");
    }
    async methodThrowError(inputs: Inputs): Promise<Result<any, FxError>> {
      this.count++;
      throw new UserCancelError();
    }
    async methodCallSelf(inputs: Inputs): Promise<Result<any, FxError>> {
      this.count++;
      const res = await this.methodCallSelf(inputs);
      assert.isTrue(res.isErr() && res.error.name === new ConcurrentError(CoreSource).name);
      const res2 = await this.methodCallSelf(inputs);
      assert.isTrue(res2.isErr() && res2.error.name === new ConcurrentError(CoreSource).name);
      return ok("");
    }
  }
  hooks(MyClass, {
    methodReturnOK: [ConcurrentLockerMW],
    methodThrowError: [ConcurrentLockerMW],
    methodCallSelf: [ConcurrentLockerMW],
  });

  it("sequence: ok", async () => {
    const inputs: Inputs = { platform: Platform.VSCode };
    vi.spyOn(projectSettingsHelper, "isValidProjectV3").mockReturnValue(true);
    inputs.projectPath = path.join(os.tmpdir(), randomAppName());
    try {
      const settingDir = path.join(inputs.projectPath, `.${ConfigFolderName}`, "configs");
      await fs.ensureDir(settingDir);
      const my = new MyClass();
      await my.methodReturnOK(inputs);
      await my.methodReturnOK(inputs);
      assert.isTrue(my.count === 2);
    } finally {
      await fs.remove(inputs.projectPath!);
    }
  });

  it("single: throw error", async () => {
    const inputs: Inputs = { platform: Platform.VSCode };
    inputs.projectPath = path.join(os.tmpdir(), randomAppName());
    try {
      await fs.ensureDir(inputs.projectPath);
      await fs.ensureDir(path.join(inputs.projectPath, `.${ConfigFolderName}`));
      const my = new MyClass();
      await my.methodThrowError(inputs);
    } catch (e) {
      assert.isTrue(e instanceof UserCancelError);
    } finally {
      await fs.remove(inputs.projectPath!);
    }
  });

  it("single: invalid NoProjectOpenedError", async () => {
    const inputs: Inputs = { platform: Platform.VSCode };
    inputs.projectPath = undefined;
    const my = new MyClass();
    const res = await my.methodReturnOK(inputs);
    assert.isTrue(res.isErr() && res.error instanceof NoProjectOpenedError);
    assert.isTrue(my.count === 0);
  });

  it("single: invalid FileNotFoundError", async () => {
    const my = new MyClass();
    const inputs: Inputs = { platform: Platform.VSCode };
    inputs.projectPath = path.join(os.tmpdir(), randomAppName());
    const res = await my.methodReturnOK(inputs);
    assert.isTrue(res.isErr() && res.error instanceof FileNotFoundError);
    assert.isTrue(my.count === 0);
  });

  it("single: invalid InvalidProjectError", async () => {
    const my = new MyClass();
    const inputs: Inputs = { platform: Platform.VSCode };
    inputs.projectPath = path.join(os.tmpdir(), randomAppName());
    try {
      // Ensure isValidProjectV3 returns false for this test
      vi.spyOn(projectSettingsHelper, "isValidProjectV3").mockReturnValue(false);
      await fs.ensureDir(inputs.projectPath);
      const res = await my.methodReturnOK(inputs);
      assert.isTrue(res.isErr() && res.error instanceof InvalidProjectError);
    } finally {
      await fs.remove(inputs.projectPath!);
    }
    assert.isTrue(my.count === 0);
  });

  it("concurrent: fail to get lock", async () => {
    const inputs: Inputs = { platform: Platform.VSCode };
    const my = new MyClass();
    vi.spyOn(commonUtils, "waitSeconds").mockResolvedValue(undefined);
    try {
      inputs.projectPath = path.join(os.tmpdir(), randomAppName());
      vi.spyOn(projectSettingsHelper, "isValidProjectV3").mockReturnValue(true);
      await fs.ensureDir(inputs.projectPath);
      await fs.ensureDir(path.join(inputs.projectPath, `${SettingsFolderName}`));
      await my.methodCallSelf(inputs);
    } finally {
      await fs.remove(inputs.projectPath!);
    }
    assert.isTrue(my.count === 1);
  });

  it("callback should work", async () => {
    class MyClass {
      async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
        return ok("");
      }
    }
    let d = 0;
    let functionName = "";
    const lockCb = (operation: string) => {
      functionName = operation;
      d++;
    };
    const unlockCb = () => {
      d--;
    };

    CallbackRegistry.set(CoreCallbackEvent.lock, lockCb);
    CallbackRegistry.set(CoreCallbackEvent.lock, lockCb);
    CallbackRegistry.set(CoreCallbackEvent.unlock, unlockCb);

    hooks(MyClass, {
      myMethod: [ConcurrentLockerMW],
    });

    const my = new MyClass();
    const inputs: Inputs = { platform: Platform.VSCode };
    inputs.projectPath = path.join(os.tmpdir(), randomAppName());
    try {
      vi.spyOn(projectSettingsHelper, "isValidProjectV3").mockReturnValue(true);
      await fs.ensureDir(inputs.projectPath);
      await fs.ensureDir(path.join(inputs.projectPath, `.${ConfigFolderName}`));
      await my.myMethod(inputs);
      chai.expect(d).eql(1);
      chai.expect(functionName).eql("myMethod");
    } finally {
      await fs.remove(inputs.projectPath!);
    }
  });
});
