// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Inputs, Platform, err, ok } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { assert, vi } from "vitest";
import { teamsDevPortalClient } from "../../src";
import { PackageService } from "../../src/component/m365/packageService";
import { envUtil } from "../../src/component/utils/envUtil";
import { metadataUtil } from "../../src/component/utils/metadataUtil";
import { FxCore } from "../../src/core/FxCore";
import { UserCancelError } from "../../src/error";
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

describe("FxCore.uninstall cancellation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns user cancel for a pre-aborted uninstall", async () => {
    const controller = new AbortController();
    controller.abort();
    const core = new FxCore(tools);
    const uninstallByTitleIdSpy = vi.spyOn(core, "uninstallByTitleId");
    const inputs: UninstallInputs = {
      platform: Platform.CLI,
      projectPath: "project",
      abortSignal: controller.signal,
      [QuestionNames.UninstallMode]: QuestionNames.UninstallModeTitleId,
      [QuestionNames.TitleId]: "title-id",
    };

    const result = await core.uninstall(inputs);

    assert.isTrue(result.isErr() && result.error.name === "UserCancel");
    assert.equal(uninstallByTitleIdSpy.mock.calls.length, 0);
  });

  it("forwards the abort signal when uninstalling by manifest ID", async () => {
    const controller = new AbortController();
    const core = new FxCore(tools);
    const m365Spy = vi.spyOn(core, "uninstallM365App").mockResolvedValue(ok(undefined));
    const botSpy = vi
      .spyOn(core, "uninstallBotFrameworRegistration")
      .mockResolvedValue(ok(undefined));
    const appSpy = vi.spyOn(core, "uninstallAppRegistration").mockResolvedValue(ok(undefined));
    const inputs: UninstallInputs = {
      platform: Platform.CLI,
      projectPath: "project",
      abortSignal: controller.signal,
      [QuestionNames.ManifestId]: "manifest-id",
      [QuestionNames.UninstallOptions]: [
        QuestionNames.UninstallOptionM365,
        QuestionNames.UninstallOptionBot,
        QuestionNames.UninstallOptionTDP,
      ],
    };

    const result = await core.uninstallByManifestId(inputs);

    assert.isTrue(result.isOk());
    assert.deepEqual(m365Spy.mock.calls[0], [undefined, "manifest-id", controller.signal]);
    assert.deepEqual(botSpy.mock.calls[0], [undefined, "manifest-id", controller.signal]);
    assert.deepEqual(appSpy.mock.calls[0], ["manifest-id", controller.signal]);
  });

  it("forwards the abort signal when uninstalling by title ID", async () => {
    const controller = new AbortController();
    const core = new FxCore(tools);
    const m365Spy = vi.spyOn(core, "uninstallM365App").mockResolvedValue(ok(undefined));
    const inputs: UninstallInputs = {
      platform: Platform.CLI,
      projectPath: "project",
      abortSignal: controller.signal,
      [QuestionNames.TitleId]: "title-id",
    };

    const result = await core.uninstallByTitleId(inputs);

    assert.isTrue(result.isOk());
    assert.deepEqual(m365Spy.mock.calls[0], ["title-id", undefined, controller.signal]);
  });

  it("returns user cancel for a pre-aborted M365 uninstall", async () => {
    const controller = new AbortController();
    controller.abort();
    const core = new FxCore(tools);
    const tokenSpy = vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken");

    const result = await core.uninstallM365App("title-id", undefined, controller.signal);

    assert.isTrue(result.isErr() && result.error.name === "UserCancel");
    assert.equal(tokenSpy.mock.calls.length, 0);
  });

  it("returns the token error from M365 uninstall", async () => {
    const expectedError = new UserCancelError("test");
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      err(expectedError)
    );

    const result = await core.uninstallM365App("title-id");

    assert.isTrue(result.isErr() && result.error === expectedError);
  });

  it("forwards the abort signal while resolving and unacquiring an M365 title", async () => {
    const controller = new AbortController();
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mocked-token")
    );
    const retrieveSpy = vi
      .spyOn(PackageService.prototype, "retrieveTitleId")
      .mockResolvedValue("title-id");
    const unacquireSpy = vi
      .spyOn(PackageService.prototype, "unacquire")
      .mockResolvedValue(undefined);

    const result = await core.uninstallM365App(undefined, "manifest-id", controller.signal);

    assert.isTrue(result.isOk());
    assert.deepEqual(retrieveSpy.mock.calls[0], ["mocked-token", "manifest-id", controller.signal]);
    assert.deepEqual(unacquireSpy.mock.calls[0], ["mocked-token", "title-id", controller.signal]);
  });

  it("stops M365 uninstall when aborted after confirmation", async () => {
    const controller = new AbortController();
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mocked-token")
    );
    vi.spyOn(tools.ui, "confirm").mockImplementation(async () => {
      controller.abort();
      return ok({ type: "success", result: true });
    });
    const unacquireSpy = vi.spyOn(PackageService.prototype, "unacquire");

    const result = await core.uninstallM365App("title-id", undefined, controller.signal);

    assert.isTrue(result.isErr() && result.error.name === "UserCancel");
    assert.equal(unacquireSpy.mock.calls.length, 0);
  });

  it("returns user cancel for a pre-aborted app registration uninstall", async () => {
    const controller = new AbortController();
    controller.abort();
    const core = new FxCore(tools);
    const tokenSpy = vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken");

    const result = await core.uninstallAppRegistration("manifest-id", controller.signal);

    assert.isTrue(result.isErr() && result.error.name === "UserCancel");
    assert.equal(tokenSpy.mock.calls.length, 0);
  });

  it("stops app registration uninstall when aborted after confirmation", async () => {
    const controller = new AbortController();
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mocked-token")
    );
    vi.spyOn(tools.ui, "confirm").mockImplementation(async () => {
      controller.abort();
      return ok({ type: "success", result: true });
    });
    const deleteSpy = vi.spyOn(teamsDevPortalClient, "deleteApp");

    const result = await core.uninstallAppRegistration("manifest-id", controller.signal);

    assert.isTrue(result.isErr() && result.error.name === "UserCancel");
    assert.equal(deleteSpy.mock.calls.length, 0);
  });

  it("stops app registration uninstall when aborted by deletion", async () => {
    const controller = new AbortController();
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mocked-token")
    );
    vi.spyOn(teamsDevPortalClient, "deleteApp").mockImplementation(async () => {
      controller.abort();
      return true;
    });

    const result = await core.uninstallAppRegistration("manifest-id", controller.signal);

    assert.isTrue(result.isErr() && result.error.name === "UserCancel");
  });

  it("returns user cancel for a pre-aborted bot uninstall", async () => {
    const controller = new AbortController();
    controller.abort();
    const core = new FxCore(tools);
    const tokenSpy = vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken");

    const result = await core.uninstallBotFrameworRegistration(
      "bot-id",
      undefined,
      controller.signal
    );

    assert.isTrue(result.isErr() && result.error.name === "UserCancel");
    assert.equal(tokenSpy.mock.calls.length, 0);
  });

  it("stops bot uninstall when aborted after confirmation", async () => {
    const controller = new AbortController();
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mocked-token")
    );
    vi.spyOn(tools.ui, "confirm").mockImplementation(async () => {
      controller.abort();
      return ok({ type: "success", result: true });
    });
    const deleteSpy = vi.spyOn(teamsDevPortalClient, "deleteBot");

    const result = await core.uninstallBotFrameworRegistration(
      "bot-id",
      undefined,
      controller.signal
    );

    assert.isTrue(result.isErr() && result.error.name === "UserCancel");
    assert.equal(deleteSpy.mock.calls.length, 0);
  });

  it("stops bot uninstall when aborted by deletion", async () => {
    const controller = new AbortController();
    const core = new FxCore(tools);
    vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("mocked-token")
    );
    vi.spyOn(teamsDevPortalClient, "deleteBot").mockImplementation(async () => {
      controller.abort();
    });

    const result = await core.uninstallBotFrameworRegistration(
      "bot-id",
      undefined,
      controller.signal
    );

    assert.isTrue(result.isErr() && result.error.name === "UserCancel");
  });
});
