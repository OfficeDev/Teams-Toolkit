// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Inputs, Platform, ok } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { assert, vi } from "vitest";
import { teamsDevPortalClient } from "../../src";
import { PackageService } from "../../src/component/m365/packageService";
import { envUtil } from "../../src/component/utils/envUtil";
import { metadataUtil } from "../../src/component/utils/metadataUtil";
import { FxCore } from "../../src/core/FxCore";
import { UninstallInputs } from "../../src/question";
import { QuestionNames } from "../../src/question/questionNames";
import { MockTools, randomAppName } from "./utils";

const tools = new MockTools();

async function mockCliUninstallProject(): Promise<string> {
  const appName = randomAppName();
  const projectPath = path.join(os.tmpdir(), appName);
  await fs.copy(path.join(__dirname, "../samples/uninstall/"), path.join(projectPath));
  return appName;
}

async function deleteTestProject(appName: string) {
  await fs.remove(path.join(os.tmpdir(), appName));
}

describe("FxCore.uninstall by env", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uninstall by env - success", async () => {
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mocked-token")
    );
    vi.spyOn(teamsDevPortalClient, "deleteApp").mockResolvedValue(true);
    vi.spyOn(teamsDevPortalClient, "getBotId").mockResolvedValue("mocked-bot-id");
    vi.spyOn(teamsDevPortalClient, "deleteBot").mockResolvedValue(undefined);
    vi.spyOn(PackageService.prototype, "retrieveTitleId").mockResolvedValue("mocked-title-id");
    vi.spyOn(PackageService.prototype, "unacquire").mockResolvedValue(undefined);

    const appName = await mockCliUninstallProject();
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeEnv,
      projectPath: path.join(os.tmpdir(), appName),
      env: "dev",
      [QuestionNames.UninstallOptions]: [
        "m365-app",
        "app-registration",
        "bot-framework-registration",
      ],
      nonInteractive: true,
    };

    const res = await core.uninstall(inputs as UninstallInputs);
    assert.isTrue(res.isOk());

    const envRes = await envUtil.readEnv(path.join(os.tmpdir(), appName), "dev", false);
    assert.isTrue(envRes.isOk());

    await deleteTestProject(appName);
  });

  it("uninstall by env - empty env key name", async () => {
    const core = new FxCore(tools);
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(
      ok({
        provision: {
          name: "provision",
          driverDefs: [
            { uses: "teamsApp/create" },
            { uses: "botFramework/create" },
            { uses: "teamsApp/extendToM365" },
          ],
        },
      } as any)
    );
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mocked-token")
    );
    vi.spyOn(teamsDevPortalClient, "deleteApp").mockResolvedValue(true);
    vi.spyOn(teamsDevPortalClient, "getBotId").mockResolvedValue("mocked-bot-id");
    vi.spyOn(teamsDevPortalClient, "deleteBot").mockResolvedValue(undefined);
    vi.spyOn(PackageService.prototype, "retrieveTitleId").mockResolvedValue("mocked-title-id");
    vi.spyOn(PackageService.prototype, "unacquire").mockResolvedValue(undefined);

    const appName = await mockCliUninstallProject();
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeEnv,
      projectPath: path.join(os.tmpdir(), appName),
      env: "dev",
      [QuestionNames.UninstallOptions]: [
        "m365-app",
        "app-registration",
        "bot-framework-registration",
      ],
      nonInteractive: true,
    };

    const res = await core.uninstall(inputs as UninstallInputs);
    assert.isTrue(res.isOk());

    const envRes = await envUtil.readEnv(path.join(os.tmpdir(), appName), "dev", false);
    assert.isTrue(envRes.isOk());

    await deleteTestProject(appName);
  });
});
