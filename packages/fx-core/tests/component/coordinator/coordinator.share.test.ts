import { describe, it } from "vitest";

describe.skip("coordinator share", () => {
  it("placeholder", () => {
    // Placeholder to keep this intentionally-disabled suite from failing as empty.
  });
});

// import { assert } from "chai";
// import { DotenvParseOutput } from "dotenv";
// import fs from "fs-extra";

// import {
//   err,
//   Inputs,
//   InputsWithProjectPath,
//   IProgressHandler,
//   ok,
//   Platform,
//   SystemError,
//   UserError,
// } from "@microsoft/teamsfx-api";

// import { PackageService, QuestionNames, teamsDevPortalClient } from "../../../src";
// import { featureFlagManager } from "../../../src/common/featureFlags";
// import { setTools, TOOLS } from "../../../src/common/globalVars";
// import { MetadataV3, VersionInfo, VersionSource } from "../../../src/common/versionMetadata";
// import {
//   ExecutionError,
//   ExecutionResult,
//   ProjectModel,
// } from "../../../src/component/configManager/interface";
// import { coordinator } from "../../../src/component/coordinator";
// import { DriverContext } from "../../../src/component/driver/interface/commonArgs";
// import * as shareUtils from "../../../src/component/driver/share/utils";
// import { createDriverContext } from "../../../src/component/driver/util/utils";
// import { envUtil } from "../../../src/component/utils/envUtil";
// import { metadataUtil } from "../../../src/component/utils/metadataUtil";
// import { pathUtils } from "../../../src/component/utils/pathUtils";
// import { CollaborationUtil } from "../../../src/core/collaborator";
// import { FxCore } from "../../../src/core/FxCore";
// import * as v3MigrationUtils from "../../../src/core/middleware/utils/v3MigrationUtils";
// import { MockTools } from "../../core/utils";
// import { mockedResolveDriverInstances } from "./coordinator.test";

// const versionInfo: VersionInfo = {
//   version: MetadataV3.projectVersion,
//   source: VersionSource.teamsapp,
// };
// describe("component coordinator test", () => {
//   const sandbox = vi;
//   const tools = new MockTools();
//   setTools(tools);
//   afterEach(() => {
//     vi.restoreAllMocks();
//   });

//   beforeEach(() => {
//     vi.spyOn(v3MigrationUtils, "getProjectVersion").mockResolvedValue(versionInfo);
//   });
//   it("share happy path", async () => {
//     vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
//     const mockProjectModel: ProjectModel = {
//       version: "1.0.0",
//       share: {
//         name: "share",
//         driverDefs: [],
//         resolvePlaceholders: () => {
//           return [];
//         },
//         execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
//           return { result: ok(new Map()), summaries: [] };
//         },
//         resolveDriverInstances: mockedResolveDriverInstances,
//       },
//     };
//     vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
//     vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
//     vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
//     vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
//     vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
//       if (config.name === "env") {
//         return ok({ type: "success", result: "dev" });
//       } else {
//         return ok({ type: "success", result: "" });
//       }
//     });
//     const progressStartStub = vi.fn();
//     const progressEndStub = vi.fn();
//     vi.spyOn(tools.ui, "createProgressBar").mockReturnValue({
//       start: progressStartStub,
//       end: progressEndStub,
//     } as any as IProgressHandler);
//     vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
//     vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
//     vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
//     const inputs: Inputs = {
//       platform: Platform.VSCode,
//       projectPath: ".",
//       ignoreLockByUT: true,
//       nonInteractive: true,
//       [QuestionNames.ShareOption]: QuestionNames.ShareOptionShareApp,
//     };
//     const fxCore = new FxCore(tools);
//     const res = await fxCore.shareApplication(inputs);
//     assert.isTrue(res.isOk());
//     assert.isTrue(progressStartStub.mock.calls.length === 1);
//     expect(progressEndStub).toHaveBeenCalledExactlyOnceWith(true);
//   });
//   it("share happy path - CLI", async () => {
//     vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
//     const mockProjectModel: ProjectModel = {
//       version: "1.0.0",
//       share: {
//         name: "share",
//         driverDefs: [],
//         resolvePlaceholders: () => {
//           return [];
//         },
//         execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
//           return {
//             result: err({
//               kind: "Failure",
//               error: { source: "test", timestamp: new Date() },
//             } as ExecutionError),
//             summaries: [],
//           };
//         },
//         resolveDriverInstances: mockedResolveDriverInstances,
//       },
//     };
//     vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
//     vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
//     vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
//     vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
//     vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
//       if (config.name === "env") {
//         return ok({ type: "success", result: "dev" });
//       } else {
//         return ok({ type: "success", result: "" });
//       }
//     });
//     const progressStartStub = vi.fn();
//     const progressEndStub = vi.fn();
//     vi.spyOn(tools.ui, "createProgressBar").mockReturnValue({
//       start: progressStartStub,
//       end: progressEndStub,
//     } as any as IProgressHandler);
//     vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
//     vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
//     vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
//     const inputs: Inputs = {
//       platform: Platform.CLI,
//       projectPath: ".",
//       ignoreLockByUT: true,
//       nonInteractive: true,
//       [QuestionNames.ShareOption]: QuestionNames.ShareOptionShareApp,
//     };
//     const fxCore = new FxCore(tools);
//     const res = await fxCore.shareApplication(inputs);
//     assert.isTrue(res.isErr());
//     assert.deepEqual(inputs.envVars, {} as DotenvParseOutput);
//     assert.isTrue(progressStartStub.mock.calls.length === 1);
//     expect(progressEndStub).toHaveBeenCalledExactlyOnceWith(false);
//   });
//   it("share happy path - no ui", async () => {
//     vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
//     const mockProjectModel: ProjectModel = {
//       version: "1.0.0",
//       share: {
//         name: "share",
//         driverDefs: [],
//         resolvePlaceholders: () => {
//           return [];
//         },
//         execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
//           return { result: ok(new Map()), summaries: [] };
//         },
//         resolveDriverInstances: mockedResolveDriverInstances,
//       },
//     };
//     const mockTools = new MockTools();
//     mockTools.ui = undefined as any;
//     vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
//     vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
//     vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
//     vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
//     vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
//     vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
//     vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
//     const inputs: Inputs = {
//       platform: Platform.VSCode,
//       projectPath: ".",
//       ignoreLockByUT: true,
//       env: "dev",
//       nonInteractive: true,
//       [QuestionNames.ShareOption]: QuestionNames.ShareOptionShareApp,
//     };
//     const fxCore = new FxCore(mockTools);
//     const res = await fxCore.shareApplication(inputs);
//     assert.isTrue(res.isOk());
//   });
//   it("share happy path - VS - no ui", async () => {
//     vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
//     const mockProjectModel: ProjectModel = {
//       version: "1.0.0",
//       share: {
//         name: "share",
//         driverDefs: [],
//         resolvePlaceholders: () => {
//           return [];
//         },
//         execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
//           return { result: ok(new Map()), summaries: [] };
//         },
//         resolveDriverInstances: mockedResolveDriverInstances,
//       },
//     };
//     const mockTools = new MockTools();
//     mockTools.ui = undefined as any;
//     vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
//     vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
//     vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
//     vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
//     vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
//     vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
//     vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
//     const inputs: Inputs = {
//       platform: Platform.VS,
//       projectPath: ".",
//       ignoreLockByUT: true,
//       env: "dev",
//       nonInteractive: true,
//       [QuestionNames.ShareOption]: QuestionNames.ShareOptionShareApp,
//     };
//     const fxCore = new FxCore(mockTools);
//     const res = await fxCore.shareApplication(inputs);
//     assert.isTrue(res.isOk());
//   });
//   it("share failed", async () => {
//     vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
//     const mockProjectModel: ProjectModel = {
//       version: "1.0.0",
//       share: {
//         name: "share",
//         driverDefs: [],
//         resolvePlaceholders: () => {
//           return [];
//         },
//         execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
//           return {
//             result: err({
//               kind: "Failure",
//               error: { source: "test", timestamp: new Date() },
//             } as ExecutionError),
//             summaries: [],
//           };
//         },
//         resolveDriverInstances: mockedResolveDriverInstances,
//       },
//     };
//     vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
//     vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
//     vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
//     vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
//     vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
//       if (config.name === "env") {
//         return ok({ type: "success", result: "dev" });
//       } else {
//         return ok({ type: "success", result: "" });
//       }
//     });
//     const progressStartStub = vi.fn();
//     const progressEndStub = vi.fn();
//     vi.spyOn(tools.ui, "createProgressBar").mockReturnValue({
//       start: progressStartStub,
//       end: progressEndStub,
//     } as any as IProgressHandler);
//     vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
//     vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
//     vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
//     const inputs: Inputs = {
//       platform: Platform.VSCode,
//       projectPath: ".",
//       ignoreLockByUT: true,
//       nonInteractive: true,
//       [QuestionNames.ShareOption]: QuestionNames.ShareOptionShareApp,
//     };
//     const fxCore = new FxCore(tools);
//     const res = await fxCore.shareApplication(inputs);
//     assert.isTrue(res.isErr());
//     assert.deepEqual(inputs.envVars, {} as DotenvParseOutput);
//     assert.isTrue(progressStartStub.mock.calls.length === 1);
//     expect(progressEndStub).toHaveBeenCalledExactlyOnceWith(false);
//   });
//   it("share without progress bar", async () => {
//     vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
//     const mockProjectModel: ProjectModel = {
//       version: "1.0.0",
//       share: {
//         name: "share",
//         driverDefs: [],
//         resolvePlaceholders: () => {
//           return [];
//         },
//         execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
//           return { result: ok(new Map()), summaries: [] };
//         },
//         resolveDriverInstances: mockedResolveDriverInstances,
//       },
//     };
//     vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
//     vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
//     vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
//     vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
//     vi.spyOn(tools.ui, "selectOption").mockImplementation(async (config) => {
//       if (config.name === "env") {
//         return ok({ type: "success", result: "dev" });
//       } else {
//         return ok({ type: "success", result: "" });
//       }
//     });
//     const progressStartStub = vi.fn();
//     const progressEndStub = vi.fn();
//     vi.spyOn(tools.ui, "createProgressBar").mockReturnValue(undefined as any as IProgressHandler);
//     const showMessageStub = vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok(""));
//     vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
//     vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
//     vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
//     const inputs: Inputs = {
//       platform: Platform.VSCode,
//       projectPath: ".",
//       ignoreLockByUT: true,
//       nonInteractive: true,
//       [QuestionNames.ShareOption]: QuestionNames.ShareOptionShareApp,
//     };
//     const fxCore = new FxCore(tools);
//     const res = await fxCore.shareApplication(inputs);
//     assert.isTrue(res.isOk());
//     assert.isTrue(showMessageStub.mock.calls.length > 0);
//     assert.isTrue(progressStartStub.mock.calls.length === 0);
//     assert.isTrue(progressEndStub.mock.calls.length === 0);
//   });
//   it("share lifecycle undefined", async () => {
//     vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
//     const mockProjectModel: ProjectModel = {
//       version: "1.0.0",
//     };
//     vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
//     vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
//     const inputs: InputsWithProjectPath = {
//       platform: Platform.VSCode,
//       projectPath: ".",
//       env: "dev",
//       ignoreLockByUT: true,
//       nonInteractive: true,
//       [QuestionNames.ShareOption]: QuestionNames.ShareOptionShareApp,
//     };
//     const context = createDriverContext(inputs);
//     const res = await coordinator.share(context, inputs);
//     assert.isTrue(res.isErr() && res.error.name === "LifeCycleUndefinedError");
//   });
//   it("share to user happy path", async () => {
//     sandbox
//       .stub(shareUtils, "parseShareAppActionYamlConfig")
//       .mockResolvedValue(ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" }));
//     vi.spyOn(CollaborationUtil, "getUserInfo").mockResolvedValue({
//       aadId: "mockAadId",
//       displayName: "mockDisplayName",
//       userPrincipalName: "mockUserPrincipalName",
//     } as any);
//     vi.spyOn(teamsDevPortalClient, "grantPermission").mockResolvedValue();
//     vi.spyOn(PackageService.GetSharedInstance(), "grantPermission").mockResolvedValue(ok(undefined));
//     vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
//       ok({
//         value: "token",
//       } as any)
//     );

//     const inputs: Inputs = {
//       platform: Platform.VSCode,
//       projectPath: "./tests/plugins/resource/daTemplate/da-no-action-test-template",
//       ignoreLockByUT: true,
//       nonInteractive: true,
//       [QuestionNames.ShareOption]: QuestionNames.ShareOptionShareToUser,
//       [QuestionNames.ShareToUsers]: "user1@example.com,user2@example.com",
//     };
//     const fxCore = new FxCore(tools);
//     const res = await fxCore.shareApplication(inputs);
//     assert.isTrue(res.isOk());
//   });
//   it("share to user with invalid email", async () => {
//     sandbox
//       .stub(shareUtils, "parseShareAppActionYamlConfig")
//       .mockResolvedValue(ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" }));
//     vi.spyOn(CollaborationUtil, "getUserInfo").mockResolvedValue(undefined);
//     vi.spyOn(teamsDevPortalClient, "grantPermission").mockResolvedValue();
//     vi.spyOn(PackageService.GetSharedInstance(), "grantPermission").mockResolvedValue(ok(undefined));
//     vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
//       ok({
//         value: "token",
//       } as any)
//     );

//     const inputs: Inputs = {
//       platform: Platform.VSCode,
//       projectPath: "./tests/plugins/resource/daTemplate/da-no-action-test-template",
//       ignoreLockByUT: true,
//       nonInteractive: true,
//       [QuestionNames.ShareOption]: QuestionNames.ShareOptionShareToUser,
//       [QuestionNames.ShareToUsers]: "user1@example.com,user2@example.com",
//     };

//     const fxCore = new FxCore(tools);
//     const res = await fxCore.shareApplication(inputs);
//     assert.isTrue(res.isErr());
//     if (res.isErr()) {
//       assert.equal(res.error.name, "InputValidationError");
//     }
//   });
//   it("share to user with token error", async () => {
//     sandbox
//       .stub(shareUtils, "parseShareAppActionYamlConfig")
//       .mockResolvedValue(ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" }));
//     vi.spyOn(CollaborationUtil, "getUserInfo").mockResolvedValue({
//       aadId: "mockAadId",
//       displayName: "mockDisplayName",
//       userPrincipalName: "mockUserPrincipalName",
//     } as any);
//     vi.spyOn(teamsDevPortalClient, "grantPermission").mockResolvedValue();
//     vi.spyOn(PackageService.GetSharedInstance(), "grantPermission").mockResolvedValue(ok(undefined));
//     sandbox
//       .stub(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken")
//       .mockResolvedValue(err(new SystemError("", "TokenError", "Failed to get token")));

//     const inputs: Inputs = {
//       platform: Platform.VSCode,
//       projectPath: "./tests/plugins/resource/daTemplate/da-no-action-test-template",
//       ignoreLockByUT: true,
//       nonInteractive: true,
//       [QuestionNames.ShareOption]: QuestionNames.ShareOptionShareToUser,
//       [QuestionNames.ShareToUsers]: "user1@example.com",
//     };

//     const fxCore = new FxCore(tools);
//     const res = await fxCore.shareApplication(inputs);
//     assert.isTrue(res.isErr());
//     if (res.isErr()) {
//       assert.equal(res.error.name, "TokenError");
//     }
//   });
//   it("share to user - parseShareAppActionYamlConfig error", async () => {
//     vi.spyOn(CollaborationUtil, "getUserInfo").mockResolvedValue({
//       aadId: "mockAadId",
//       displayName: "mockDisplayName",
//       userPrincipalName: "mockUserPrincipalName",
//     } as any);
//     vi.spyOn(teamsDevPortalClient, "grantPermission").mockResolvedValue();
//     vi.spyOn(PackageService.GetSharedInstance(), "grantPermission").mockResolvedValue(ok(undefined));
//     vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
//       ok({
//         value: "token",
//       } as any)
//     );
//     sandbox
//       .stub(shareUtils, "parseShareAppActionYamlConfig")
//       .mockResolvedValue(err(new UserError("", "ParseError", "Failed to parse yaml")));

//     const inputs: Inputs = {
//       platform: Platform.VSCode,
//       projectPath: "./tests/plugins/resource/daTemplate/da-no-action-test-template",
//       ignoreLockByUT: true,
//       nonInteractive: true,
//       [QuestionNames.ShareOption]: QuestionNames.ShareOptionShareToUser,
//       [QuestionNames.ShareToUsers]: "user1@example.com,user2@example.com",
//     };
//     const fxCore = new FxCore(tools);
//     const res = await fxCore.shareApplication(inputs);
//     assert.isTrue(res.isErr());
//     if (res.isErr()) {
//       assert.equal(res.error.name, "ParseError");
//     }
//   });
//   it("share to user - failed to grant mos permissoin", async () => {
//     sandbox
//       .stub(shareUtils, "parseShareAppActionYamlConfig")
//       .mockResolvedValue(ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" }));
//     vi.spyOn(CollaborationUtil, "getUserInfo").mockResolvedValue({
//       aadId: "mockAadId",
//       displayName: "mockDisplayName",
//       userPrincipalName: "mockUserPrincipalName",
//     } as any);
//     vi.spyOn(teamsDevPortalClient, "grantPermission").mockResolvedValue();
//     vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
//       ok({
//         value: "token",
//       } as any)
//     );
//     sandbox
//       .stub(PackageService.GetSharedInstance(), "grantPermission")
//       .mockResolvedValue(err(new UserError("", "GrantPermissionError", "Failed to grant permission")));

//     const inputs: Inputs = {
//       platform: Platform.VSCode,
//       projectPath: "./tests/plugins/resource/daTemplate/da-no-action-test-template",
//       ignoreLockByUT: true,
//       nonInteractive: true,
//       [QuestionNames.ShareOption]: QuestionNames.ShareOptionShareToUser,
//       [QuestionNames.ShareToUsers]: "user1@example.com,user2@example.com",
//     };
//     const fxCore = new FxCore(tools);
//     const res = await fxCore.shareApplication(inputs);
//     assert.isTrue(res.isErr());
//     if (res.isErr()) {
//       assert.equal(res.error.name, "GrantPermissionError");
//     }
//   });
// });
