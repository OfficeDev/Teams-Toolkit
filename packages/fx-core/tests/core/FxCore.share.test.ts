// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  err,
  Inputs,
  IProgressHandler,
  ok,
  Platform,
  SystemError,
  UserError,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { chai, vi } from "vitest";
import { InputValidationError, MAX_EMAIL_NUMBER, teamsDevPortalClient } from "../../src";
import { ProjectModel } from "../../src/component/configManager/interface";
import * as shareUtils from "../../src/component/driver/share/utils";
import { PackageService } from "../../src/component/m365/packageService";
import { envUtil } from "../../src/component/utils/envUtil";
import { metadataUtil } from "../../src/component/utils/metadataUtil";
import { pathUtils } from "../../src/component/utils/pathUtils";
import { CollaborationUtil } from "../../src/core/collaborator";
import { FxCore } from "../../src/core/FxCore";
import * as shareModule from "../../src/core/share";
import { QuestionNames } from "../../src/question/questionNames";
import { ShareOperationOption, ShareScopeOption } from "../../src/question/share";
import { MockLogProvider, MockTools } from "./utils";

const coreSpy = (name: string) => {
  const moduleTarget =
    name === "parseShareAppActionYamlConfig"
      ? (shareUtils as unknown as Record<string, any>)
      : (shareModule as unknown as Record<string, any>);
  const spy = vi.spyOn(moduleTarget, name);
  return {
    resolves: (value: any) => spy.mockResolvedValue(value),
    returns: (value: any) => spy.mockReturnValue(value),
    mockResolvedValue: (value: any) => spy.mockResolvedValue(value),
    mockReturnValue: (value: any) => spy.mockReturnValue(value),
  };
};

const runShareApplicationRaw = async (fxCore: FxCore, inputs: Inputs) => {
  const raw = (fxCore.shareApplication as any).original;
  return raw.call(fxCore, inputs, undefined);
};

const runRemoveSharedAccessRaw = async (fxCore: FxCore, inputs: Inputs) => {
  const raw = (fxCore.removeSharedAccess as any).original;
  return raw.call(fxCore, inputs, undefined);
};

describe("FxCore.shareApplication", () => {
  const tools = new MockTools();
  const logger = new MockLogProvider();
  const mockProjectModel: ProjectModel = {
    version: "1.10.0",
  };

  beforeEach(() => {});

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Share with tenant users", () => {
    it("share happy path", async () => {
      const shareWithTenantStub = coreSpy("shareWithTenant").mockResolvedValue(ok(undefined));

      coreSpy("parseShareAppActionYamlConfig").mockResolvedValue(
        ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" })
      );
      vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
        if (config.name === "env") {
          return ok({ type: "success", result: "dev" });
        } else {
          return ok({ type: "success", result: "" });
        }
      });
      const progressStartStub = vi.fn();
      const progressEndStub = vi.fn();
      vi.spyOn(tools.ui, "createProgressBar").mockReturnValue({
        start: progressStartStub,
        end: progressEndStub,
      } as any as IProgressHandler);
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
        [QuestionNames.ShareOperation]: ShareOperationOption.ShareWithUsers,
        [QuestionNames.ShareScope]: ShareScopeOption.ShareAppWithTenantUsers,
      };
      const fxCore = new FxCore(tools);
      const res = await runShareApplicationRaw(fxCore, inputs);
      chai.assert.isTrue(res.isOk());
      chai.assert.equal(shareWithTenantStub.mock.calls.length, 1);
    });
  });

  describe("Share with specific users", () => {
    it("share with specific users happy path", async () => {
      const addSharedUsersStub = coreSpy("addSharedUsers").mockResolvedValue(ok(undefined));

      // Setup common stubs
      coreSpy("parseShareAppActionYamlConfig").mockResolvedValue(
        ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" })
      );
      vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
        if (config.name === "env") {
          return ok({ type: "success", result: "dev" });
        } else {
          return ok({ type: "success", result: "" });
        }
      });

      const progressStartStub = vi.fn();
      const progressEndStub = vi.fn();
      vi.spyOn(tools.ui, "createProgressBar").mockReturnValue({
        start: progressStartStub,
        end: progressEndStub,
      } as any as IProgressHandler);
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);

      const emails = "user1@example.com,user2@example.com";
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
        [QuestionNames.ShareOperation]: ShareOperationOption.ShareWithUsers,
        [QuestionNames.ShareScope]: ShareScopeOption.ShareAppWithSpecificUsers,
        [QuestionNames.UserEmail]: emails,
      };

      const fxCore = new FxCore(tools);
      const res = await runShareApplicationRaw(fxCore, inputs);

      chai.assert.isTrue(res.isOk());
      chai.assert.equal(addSharedUsersStub.mock.calls.length, 1);
      chai.assert.equal(addSharedUsersStub.mock.calls[0][1], "mockTitleId");
      chai.assert.deepEqual(addSharedUsersStub.mock.calls[0][2], [
        "user1@example.com",
        "user2@example.com",
      ]);
    });

    it("returns error when emails are invalid", async () => {
      // Setup common stubs
      coreSpy("parseShareAppActionYamlConfig").mockResolvedValue(
        ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" })
      );
      vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
        if (config.name === "env") {
          return ok({ type: "success", result: "dev" });
        } else {
          return ok({ type: "success", result: "" });
        }
      });

      const progressStartStub = vi.fn();
      const progressEndStub = vi.fn();
      vi.spyOn(tools.ui, "createProgressBar").mockReturnValue({
        start: progressStartStub,
        end: progressEndStub,
      } as any as IProgressHandler);
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);

      // Case 1: No emails
      const noEmails: Inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
        [QuestionNames.ShareOperation]: ShareOperationOption.ShareWithUsers,
        [QuestionNames.ShareScope]: ShareScopeOption.ShareAppWithSpecificUsers,
        [QuestionNames.UserEmail]: "",
      };

      const fxCore = new FxCore(tools);
      const res1 = await runShareApplicationRaw(fxCore, noEmails);

      chai.assert.isTrue(res1.isErr());
      if (res1.isErr()) {
        chai.assert.instanceOf(res1.error, InputValidationError);
      }

      // Case 2: Too many emails
      const tooManyEmails: Inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
        [QuestionNames.ShareOperation]: ShareOperationOption.ShareWithUsers,
        [QuestionNames.ShareScope]: ShareScopeOption.ShareAppWithSpecificUsers,
        [QuestionNames.UserEmail]: Array(MAX_EMAIL_NUMBER + 1)
          .fill("user@example.com")
          .join(","),
      };

      const res2 = await runShareApplicationRaw(fxCore, tooManyEmails);

      chai.assert.isTrue(res2.isErr());
      if (res2.isErr()) {
        chai.assert.instanceOf(res2.error, InputValidationError);
      }
    });

    it("raw method returns No emails when parsed email list is empty", async () => {
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
        [QuestionNames.ShareOperation]: ShareOperationOption.RemoveShareAccessFromUsers,
        [QuestionNames.UserEmail]: "   ,  ,",
      };

      const fxCore = new FxCore(tools);
      const shareApplicationRaw = (fxCore.shareApplication as any).original;
      const res = await shareApplicationRaw.call(fxCore, inputs, undefined);

      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.instanceOf(res.error, InputValidationError);
        chai.assert.include(res.error.message, "No emails");
      }
    });
  });

  describe("Remove share access", () => {
    it("removes share access successfully", async () => {
      const removeShareAccessStub = coreSpy("removeShareAccess").mockResolvedValue(ok(undefined));

      // Setup common stubs
      coreSpy("parseShareAppActionYamlConfig").mockResolvedValue(
        ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" })
      );
      vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
        if (config.name === "env") {
          return ok({ type: "success", result: "dev" });
        } else {
          return ok({ type: "success", result: "" });
        }
      });

      const progressStartStub = vi.fn();
      const progressEndStub = vi.fn();
      vi.spyOn(tools.ui, "createProgressBar").mockReturnValue({
        start: progressStartStub,
        end: progressEndStub,
      } as any as IProgressHandler);
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);

      const emails = "user1@example.com,user2@example.com";
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
        [QuestionNames.ShareOperation]: ShareOperationOption.RemoveShareAccessFromUsers,
        [QuestionNames.UserEmail]: emails,
      };

      const fxCore = new FxCore(tools);
      const res = await runShareApplicationRaw(fxCore, inputs);

      chai.assert.isTrue(res.isOk());
      chai.assert.equal(removeShareAccessStub.mock.calls.length, 1);
      chai.assert.equal(removeShareAccessStub.mock.calls[0][1], "mockTitleId");
      chai.assert.deepEqual(removeShareAccessStub.mock.calls[0][2], [
        "user1@example.com",
        "user2@example.com",
      ]);
    });
  });

  describe("Error cases", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("returns error for invalid share option", async () => {
      // Setup common stubs
      coreSpy("parseShareAppActionYamlConfig").mockResolvedValue(
        ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" })
      );
      vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
        if (config.name === "env") {
          return ok({ type: "success", result: "dev" });
        } else {
          return ok({ type: "success", result: "" });
        }
      });

      // Mock token provider
      vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
        ok("mock-token")
      );

      const progressStartStub = vi.fn();
      const progressEndStub = vi.fn();
      vi.spyOn(tools.ui, "createProgressBar").mockReturnValue({
        start: progressStartStub,
        end: progressEndStub,
      } as any as IProgressHandler);
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);

      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
        [QuestionNames.ShareOperation]: ShareOperationOption.ShareWithUsers,
        [QuestionNames.ShareScope]: "invalid-option" as any,
      };

      const fxCore = new FxCore(tools);
      const res = await runShareApplicationRaw(fxCore, inputs);

      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error.message.indexOf("Invalid share option") > -1);
      }
    });

    it("returns error when parse yaml fails", async () => {
      // Setup common stubs
      vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
        if (config.name === "env") {
          return ok({ type: "success", result: "dev" });
        } else {
          return ok({ type: "success", result: "" });
        }
      });
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);

      const parseError = new UserError({
        name: "TestError",
        source: "testSource",
        message: "Failed to parse yaml",
        error: new Error(),
      });

      coreSpy("parseShareAppActionYamlConfig").mockResolvedValue(err(parseError));

      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
        [QuestionNames.ShareOperation]: ShareOperationOption.ShareWithUsers,
        [QuestionNames.ShareScope]: ShareScopeOption.ShareAppWithTenantUsers,
      };

      const fxCore = new FxCore(tools);
      const res = await runShareApplicationRaw(fxCore, inputs);

      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.deepEqual(res.error, parseError);
      }
    });

    it("returns error when token acquisition fails", async () => {
      const tokenError = new UserError({
        name: "TokenError",
        source: "testSource",
        message: "Failed to get token",
        error: new Error(),
      });

      // Setup common stubs
      coreSpy("parseShareAppActionYamlConfig").mockResolvedValue(
        ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" })
      );
      // Setup common stubs
      vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
        if (config.name === "env") {
          return ok({ type: "success", result: "dev" });
        } else {
          return ok({ type: "success", result: "" });
        }
      });
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);

      // Mock token provider to fail
      vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
        err(tokenError)
      );

      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
        [QuestionNames.ShareOperation]: ShareOperationOption.ShareWithUsers,
        [QuestionNames.ShareScope]: ShareScopeOption.ShareAppWithTenantUsers,
      };

      const fxCore = new FxCore(tools);
      const res = await runShareApplicationRaw(fxCore, inputs);

      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.equal(res.error, tokenError);
      }
    });
  });

  describe("FxCore.removeSharedAccess", () => {
    const projectPath = "./tests/plugins/resource/daTemplate/da-no-action-test-template";

    function stubRemoveSharedAccessBase(options?: {
      tokenResult?: ReturnType<typeof ok> | ReturnType<typeof err>;
      currentUserErr?: UserError;
      userInfoUndefined?: boolean;
      sameUser?: boolean;
      removePermissionErr?: UserError;
    }): void {
      const tokenResult = options?.tokenResult ?? ok("mock-token");
      coreSpy("parseShareAppActionYamlConfig").mockResolvedValue(
        ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" })
      );
      if (options?.currentUserErr) {
        vi.spyOn(CollaborationUtil, "getCurrentUserInfo").mockResolvedValue(
          err(options.currentUserErr)
        );
      } else {
        vi.spyOn(CollaborationUtil, "getCurrentUserInfo").mockResolvedValue(
          ok({
            aadId: options?.sameUser ? "target-aad" : "current-aad",
            displayName: "current-user",
            userPrincipalName: "current@example.com",
          } as any)
        );
      }
      vi.spyOn(CollaborationUtil, "getUserInfo").mockResolvedValue(
        options?.userInfoUndefined
          ? (undefined as any)
          : ({
              aadId: "target-aad",
              displayName: "target-user",
              userPrincipalName: "target@example.com",
            } as any)
      );
      vi.spyOn(teamsDevPortalClient, "removePermission").mockResolvedValue(undefined);
      vi.spyOn(PackageService.GetSharedInstance(), "removePermission").mockResolvedValue(
        options?.removePermissionErr ? err(options.removePermissionErr) : ok(undefined)
      );
      vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
        tokenResult as any
      );
    }

    it("remove shared access happy path", async () => {
      stubRemoveSharedAccessBase();
      const core = new FxCore(tools);
      const result = await runRemoveSharedAccessRaw(core, {
        platform: Platform.VSCode,
        projectPath,
        nonInteractive: true,
        [QuestionNames.RemoveUsers]: "user1@example.com,user2@example.com",
      });
      chai.assert.isTrue(result.isOk());
    });

    it("remove shared access - parse error", async () => {
      coreSpy("parseShareAppActionYamlConfig").mockResolvedValue(
        err(new UserError("mockedSource", "mockedError", "mockedMessage"))
      );
      const core = new FxCore(tools);
      const result = await runRemoveSharedAccessRaw(core, {
        platform: Platform.VSCode,
        projectPath,
        nonInteractive: true,
        [QuestionNames.RemoveUsers]: ["user1@example.com"],
      });
      chai.assert.isTrue(result.isErr());
      if (result.isErr()) {
        chai.assert.include(result.error.message, "mockedMessage");
      }
    });

    it("remove shared access - token error", async () => {
      stubRemoveSharedAccessBase({
        tokenResult: err(new SystemError("mockedSource", "mockedError", "mockedMessage")),
      });
      const core = new FxCore(tools);
      const result = await runRemoveSharedAccessRaw(core, {
        platform: Platform.VSCode,
        projectPath,
        nonInteractive: true,
        [QuestionNames.RemoveUsers]: ["user1@example.com"],
      });
      chai.assert.isTrue(result.isErr());
      if (result.isErr()) {
        chai.assert.include(result.error.message, "mockedMessage");
      }
    });

    it("remove shared access - getCurrentUserInfo", async () => {
      stubRemoveSharedAccessBase({
        currentUserErr: new UserError("mockedSource", "mockedError", "mockedMessage"),
      });
      const core = new FxCore(tools);
      const result = await runRemoveSharedAccessRaw(core, {
        platform: Platform.VSCode,
        projectPath,
        nonInteractive: true,
        [QuestionNames.RemoveUsers]: ["user1@example.com"],
      });
      chai.assert.isTrue(result.isErr());
      if (result.isErr()) {
        chai.assert.include(result.error.message, "mockedMessage");
      }
    });

    it("remove shared access - get user info error", async () => {
      stubRemoveSharedAccessBase({ userInfoUndefined: true });
      const core = new FxCore(tools);
      const result = await runRemoveSharedAccessRaw(core, {
        platform: Platform.VSCode,
        projectPath,
        nonInteractive: true,
        [QuestionNames.RemoveUsers]: ["user1@example.com"],
      });
      chai.assert.isTrue(result.isErr());
      if (result.isErr()) {
        chai.assert.include(result.error.message, "Invalid user");
      }
    });

    it("remove shared access - remove current user", async () => {
      stubRemoveSharedAccessBase({ sameUser: true });
      const core = new FxCore(tools);
      const result = await runRemoveSharedAccessRaw(core, {
        platform: Platform.VSCode,
        projectPath,
        nonInteractive: true,
        [QuestionNames.RemoveUsers]: ["user1@example.com"],
      });
      chai.assert.isTrue(result.isErr());
    });

    it("remove shared access - mos grant permission error", async () => {
      stubRemoveSharedAccessBase({
        removePermissionErr: new UserError("mockedSource", "mockedError", "mockedMessage"),
      });
      const core = new FxCore(tools);
      const result = await runRemoveSharedAccessRaw(core, {
        platform: Platform.VSCode,
        projectPath,
        nonInteractive: true,
        [QuestionNames.RemoveUsers]: ["user1@example.com"],
      });
      chai.assert.isTrue(result.isErr());
      if (result.isErr()) {
        chai.assert.include(result.error.message, "mockedMessage");
      }
    });
  });
});
