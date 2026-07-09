// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  Context,
  InputsWithProjectPath,
  Platform,
  TokenProvider,
  UserError,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import mockedEnv from "mocked-env";
import os from "os";
import * as path from "path";
import { assert, beforeEach, describe, it, vi } from "vitest";
import { CollaborationState } from "../../src/common/permissionInterface";
import { SolutionError } from "../../src/component/constants";
import * as shareUtils from "../../src/component/driver/share/utils";
import {
  AadCollaboration,
  AgentCollaboration,
  TeamsCollaboration,
} from "../../src/component/feature/collaboration";
import {
  CollaborationConstants,
  CollaborationUtil,
  checkPermission,
  grantPermission,
  listCollaborator,
} from "../../src/core/collaborator";
import { QuestionNames } from "../../src/question/constants";
import { MockedV2Context } from "../plugins/solution/util";
import { MockedAzureAccountProvider, MockedM365Provider, randomAppName } from "./utils";

describe("Collaborator APIs for V3", () => {
  const ctx = new MockedV2Context() as Context;
  const inputs: InputsWithProjectPath = {
    platform: Platform.VSCode,
    projectPath: path.join(os.tmpdir(), randomAppName()),
  };
  const tokenProvider: TokenProvider = {
    azureAccountProvider: new MockedAzureAccountProvider(),
    m365TokenProvider: new MockedM365Provider(),
  };
  ctx.tokenProvider = tokenProvider;
  beforeEach(() => {});
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("listCollaborator", () => {
    let inputs: InputsWithProjectPath;
    beforeEach(() => {
      inputs = {
        platform: Platform.VSCode,
        projectPath: path.join(os.tmpdir(), randomAppName()),
      };
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("should return NotProvisioned state if Teamsfx project hasn't been provisioned", async () => {
      vi.spyOn(CollaborationUtil, "getUserInfo").mockResolvedValue({
        tenantId: "fake_tid",
        aadId: "fake_oid",
        userPrincipalName: "fake_unique_name",
        displayName: "displayName",
        isAdministrator: true,
      });
      const result = await listCollaborator(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk());
    });
    it("should return error if cannot get user info", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(undefined);
      const result = await listCollaborator(ctx, inputs, tokenProvider);
      assert.isTrue(result.isErr() && result.error.name === SolutionError.FailedToRetrieveUserInfo);
    });

    it("should return M365TenantNotMatch state if tenant is not match", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
        ok({
          tid: "fake_tid",
          oid: "fake_oid",
          unique_name: "fake_unique_name",
          name: "fake_name",
        })
      );
      const result = await listCollaborator(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk());
    });

    it("should return error if list collaborator failed", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
        ok({
          tid: "mock_project_tenant_id",
          oid: "fake_oid",
          unique_name: "fake_unique_name",
          name: "fake_name",
        })
      );
      vi.spyOn(TeamsCollaboration.prototype, "listCollaborator").mockResolvedValue(
        err(
          new UserError("AppStudioPlugin", "FailedToListCollaborator", "List collaborator failed.")
        )
      );
      inputs.platform = Platform.CLI;
      const result = await listCollaborator(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk());
    });

    it("happy path", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
        ok({
          tid: "mock_project_tenant_id",
          oid: "fake_oid",
          unique_name: "fake_unique_name",
          name: "fake_name",
        })
      );
      vi.spyOn(TeamsCollaboration.prototype, "listCollaborator").mockResolvedValue(
        ok([
          {
            userObjectId: "fake-aad-user-object-id",
            resourceId: "fake-resource-id",
            displayName: "fake-display-name",
            userPrincipalName: "fake-user-principal-name",
          },
        ])
      );
      vi.spyOn(AadCollaboration.prototype, "listCollaborator").mockResolvedValue(
        ok([
          {
            userObjectId: "fake-aad-user-object-id",
            resourceId: "fake-resource-id",
            displayName: "fake-display-name",
            userPrincipalName: "fake-user-principal-name",
          },
        ])
      );
      const result = await listCollaborator(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk());
    });

    it("happy path without aad", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
        ok({
          tid: "mock_project_tenant_id",
          oid: "fake_oid",
          unique_name: "fake_unique_name",
          name: "fake_name",
        })
      );
      vi.spyOn(TeamsCollaboration.prototype, "listCollaborator").mockResolvedValue(
        ok([
          {
            userObjectId: "fake-aad-user-object-id",
            resourceId: "fake-resource-id",
            displayName: "fake-display-name",
            userPrincipalName: "fake-user-principal-name",
          },
        ])
      );
      const result = await listCollaborator(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk());
    });

    it("happy path with agent", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
        ok({
          tid: "mock_project_tenant_id",
          oid: "fake_oid",
          unique_name: "fake_unique_name",
          name: "fake_name",
        })
      );
      const expectedTitleId = "test-agent-title";
      vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValueOnce(
        ok({ titleId: expectedTitleId, teamsappId: "", appId: "" })
      );
      vi.spyOn(AgentCollaboration.prototype, "listCollaborator").mockResolvedValue(
        ok([
          {
            userObjectId: "fake-agent-user-id",
            resourceId: expectedTitleId,
            displayName: "fake-agent-display-name",
            userPrincipalName: "fake-agent-upn",
          },
        ])
      );
      inputs[QuestionNames.collaborationAppType] = [CollaborationConstants.AgentOptionId];
      const result = await listCollaborator(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk());
    });

    it("should handle failed agent config parse", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
        ok({
          tid: "mock_project_tenant_id",
          oid: "fake_oid",
          unique_name: "fake_unique_name",
          name: "fake_name",
        })
      );
      inputs[QuestionNames.collaborationAppType] = [CollaborationConstants.AgentOptionId];
      vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValueOnce(
        err(new UserError("source", "name", "Failed to parse config"))
      );
      const result = await listCollaborator(ctx, inputs, tokenProvider);
      assert.isTrue(result.isErr());
    });

    it("happy path with agent", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
        ok({
          tid: "mock_project_tenant_id",
          oid: "fake_oid",
          unique_name: "fake_unique_name",
          name: "fake_name",
        })
      );
      inputs[QuestionNames.collaborationAppType] = [CollaborationConstants.AgentOptionId];
      vi.spyOn(TeamsCollaboration.prototype, "listCollaborator").mockResolvedValue(
        ok([
          {
            userObjectId: "fake-aad-user-object-id",
            resourceId: "fake-resource-id",
            displayName: "fake-display-name",
            userPrincipalName: "fake-user-principal-name",
          },
        ])
      );
      const expectedTitleId = "test-agent-title";
      vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValueOnce(
        ok({ titleId: expectedTitleId, teamsappId: "", appId: "" })
      );
      vi.spyOn(AgentCollaboration.prototype, "listCollaborator").mockResolvedValue(
        ok([
          {
            userObjectId: "fake-agent-user-id",
            resourceId: expectedTitleId,
            displayName: "fake-agent-display-name",
            userPrincipalName: "fake-agent-upn",
          },
        ])
      );
      const result = await listCollaborator(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk());
    });

    it("should handle agent config parse error", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
        ok({
          tid: "mock_project_tenant_id",
          oid: "fake_oid",
          unique_name: "fake_unique_name",
          name: "fake_name",
        })
      );
      inputs[QuestionNames.collaborationAppType] = [CollaborationConstants.AgentOptionId];
      vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValueOnce(
        err(new UserError("source", "name", "Failed to parse agent config"))
      );
      const result = await listCollaborator(ctx, inputs, tokenProvider);
      assert.isTrue(result.isErr());
    });

    it("should handle agent list collaborator error", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
        ok({
          tid: "mock_project_tenant_id",
          oid: "fake_oid",
          unique_name: "fake_unique_name",
          name: "fake_name",
        })
      );
      inputs[QuestionNames.collaborationAppType] = [CollaborationConstants.AgentOptionId];
      const expectedTitleId = "test-agent-title";
      vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValueOnce(
        ok({ titleId: expectedTitleId, teamsappId: "", appId: "" })
      );
      vi.spyOn(AgentCollaboration.prototype, "listCollaborator").mockResolvedValue(
        err(new UserError("source", "name", "Failed to list agent collaborators"))
      );
      const result = await listCollaborator(ctx, inputs, tokenProvider);
      assert.isTrue(result.isErr());
    });
  });

  describe("checkPermission", () => {
    it("should return NotProvisioned state if Teamsfx project hasn't been provisioned", async () => {
      vi.spyOn(CollaborationUtil, "getUserInfo").mockResolvedValue({
        tenantId: "fake_tid",
        aadId: "fake_oid",
        userPrincipalName: "fake_unique_name",
        displayName: "displayName",
        isAdministrator: true,
      });
      const result = await checkPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk());
    });

    it("should return error if cannot get user info", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
        err(new UserError("source", "name", "message"))
      );
      const result = await checkPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isErr() && result.error.name === SolutionError.FailedToRetrieveUserInfo);
    });

    it("should return M365TenantNotMatch state if tenant is not match", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
        ok({
          tid: "fake_tid",
          oid: "fake_oid",
          unique_name: "fake_unique_name",
          name: "fake_name",
        })
      );
      const result = await checkPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk() && result.value.state === CollaborationState.OK);
    });

    it("should return error if check permission failed", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
        ok({
          tid: "mock_project_tenant_id",
          oid: "fake_oid",
          unique_name: "fake_unique_name",
          name: "fake_name",
        })
      );
      vi.spyOn(TeamsCollaboration.prototype, "checkPermission").mockResolvedValue(
        err(
          new UserError("AppStudioPlugin", "FailedToCheckPermission", "List collaborator failed.")
        )
      );
      const result = await checkPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk());
    });
    it("happy path", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
        ok({
          tid: "mock_project_tenant_id",
          oid: "fake_oid",
          unique_name: "fake_unique_name",
          name: "fake_name",
        })
      );
      vi.spyOn(TeamsCollaboration.prototype, "checkPermission").mockResolvedValue(
        ok([
          {
            name: "teams_app",
            resourceId: "fake_teams_app_resource_id",
            roles: ["Administrator"],
            type: "M365",
          },
        ])
      );
      vi.spyOn(AadCollaboration.prototype, "checkPermission").mockResolvedValue(
        ok([
          {
            name: "aad_app",
            resourceId: "fake_aad_app_resource_id",
            roles: ["Owner"],
            type: "M365",
          },
        ])
      );
      inputs.platform = Platform.CLI;
      const result = await checkPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk());
    });
  });

  describe("grantPermission", () => {
    let inputs: InputsWithProjectPath;
    beforeEach(() => {
      inputs = {
        platform: Platform.VSCode,
        projectPath: path.join(os.tmpdir(), randomAppName()),
      };
    });
    it("should return NotProvisioned state if Teamsfx project hasn't been provisioned", async () => {
      vi.spyOn(CollaborationUtil, "getUserInfo").mockResolvedValue({
        tenantId: "fake_tid",
        aadId: "fake_oid",
        userPrincipalName: "fake_unique_name",
        displayName: "displayName",
        isAdministrator: true,
      });
      const result = await grantPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isErr());
    });
    it("should return error if cannot get current user info", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
        err(new UserError("source", "name", "message"))
      );
      const result = await grantPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isErr() && result.error.name === SolutionError.FailedToRetrieveUserInfo);
    });
    it("should return M365TenantNotMatch state if tenant is not match", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
        ok({
          tid: "fake_tid",
          oid: "fake_oid",
          unique_name: "fake_unique_name",
          name: "fake_name",
        })
      );
      const result = await grantPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isErr());
    });
    it("should return error if user email is undefined", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject")
        .mockResolvedValueOnce(
          ok({
            tid: "mock_project_tenant_id",
            oid: "fake_oid",
            unique_name: "fake_unique_name",
            name: "fake_name",
          })
        )
        .mockResolvedValueOnce(undefined);
      const result = await grantPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isErr() && result.error.name === SolutionError.EmailCannotBeEmptyOrSame);
    });
    it("should return error if cannot find user from email", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject")
        .mockResolvedValueOnce(
          ok({
            tid: "mock_project_tenant_id",
            oid: "fake_oid",
            unique_name: "fake_unique_name",
            name: "fake_name",
          })
        )
        .mockResolvedValueOnce(undefined);
      inputs.email = "your_collaborator@yourcompany.com";
      const result = await grantPermission(ctx, inputs, tokenProvider);
      assert.isTrue(
        result.isErr() && result.error.name === SolutionError.CannotFindUserInCurrentTenant
      );
    });
    it("should return error if grant permission failed", async () => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject")
        .mockResolvedValueOnce(
          ok({
            tid: "mock_project_tenant_id",
            oid: "fake_oid",
            unique_name: "fake_unique_name",
            name: "fake_name",
          })
        )
        .mockResolvedValueOnce(
          ok({
            tid: "mock_project_tenant_id",
            oid: "fake_oid_2",
            unique_name: "fake_unique_name_2",
            name: "fake_name_2",
          })
        );

      vi.spyOn(CollaborationUtil, "getUserInfo")
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName",
          displayName: "displayName",
          isAdministrator: true,
        })
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName2",
          displayName: "displayName2",
          isAdministrator: true,
        });

      vi.spyOn(TeamsCollaboration.prototype, "grantPermission").mockResolvedValue(
        err(new UserError("AppStudioPlugin", "FailedToGrantPermission", "Grant permission failed."))
      );
      inputs.email = "your_collaborator@yourcompany.com";
      const result = await grantPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk());
    });
    it("happy path", async () => {
      vi.spyOn(CollaborationUtil, "getUserInfo")
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName",
          displayName: "displayName",
          isAdministrator: true,
        })
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName2",
          displayName: "displayName2",
          isAdministrator: true,
        });
      vi.spyOn(TeamsCollaboration.prototype, "grantPermission").mockResolvedValue(
        ok([
          {
            name: "aad_app",
            resourceId: "fake_aad_app_resource_id",
            roles: ["Owner"],
            type: "M365",
          },
        ])
      );
      vi.spyOn(AadCollaboration.prototype, "grantPermission").mockResolvedValue(
        ok([
          {
            name: "teams_app",
            resourceId: "fake_teams_app_resource_id",
            roles: ["Administrator"],
            type: "M365",
          },
        ])
      );
      inputs.email = "your_collaborator@yourcompany.com";
      inputs.platform = Platform.CLI;
      const result = await grantPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk());
    });

    it("happy path without aad", async () => {
      vi.spyOn(CollaborationUtil, "getUserInfo")
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName",
          displayName: "displayName",
          isAdministrator: true,
        })
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName2",
          displayName: "displayName2",
          isAdministrator: true,
        });
      vi.spyOn(TeamsCollaboration.prototype, "grantPermission").mockResolvedValue(
        ok([
          {
            name: "aad_app",
            resourceId: "fake_aad_app_resource_id",
            roles: ["Owner"],
            type: "M365",
          },
        ])
      );
      inputs.email = "your_collaborator@yourcompany.com";
      const result = await grantPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk());
    });

    it("happy path with agent permission", async () => {
      vi.spyOn(CollaborationUtil, "getUserInfo")
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName",
          displayName: "displayName",
          isAdministrator: true,
        })
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId2",
          userPrincipalName: "userPrincipalName2",
          displayName: "displayName2",
          isAdministrator: true,
        });

      const expectedTitleId = "test-agent-title";
      inputs.email = "your_collaborator@yourcompany.com";
      inputs.platform = Platform.CLI;
      inputs[QuestionNames.collaborationAppType] = [CollaborationConstants.AgentOptionId];

      vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValueOnce(
        ok({ titleId: expectedTitleId, teamsappId: "", appId: "" })
      );
      vi.spyOn(AgentCollaboration.prototype, "grantPermission").mockResolvedValue(
        ok([
          {
            name: "agent_app",
            resourceId: expectedTitleId,
            roles: ["Owner"],
            type: "M365",
          },
        ])
      );

      const result = await grantPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk());
      if (result.isOk()) {
        const agentPermission = result.value.permissions?.find((p) => p.name === "agent_app");
        assert.isDefined(agentPermission);
        assert.equal(agentPermission?.resourceId, expectedTitleId);
      }
    });

    it("should handle agent config parse error in grant permission", async () => {
      vi.spyOn(CollaborationUtil, "getUserInfo")
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName",
          displayName: "displayName",
          isAdministrator: true,
        })
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId2",
          userPrincipalName: "userPrincipalName2",
          displayName: "displayName2",
          isAdministrator: true,
        });

      inputs.email = "your_collaborator@yourcompany.com";
      inputs[QuestionNames.collaborationAppType] = [CollaborationConstants.AgentOptionId];

      vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValueOnce(
        err(new UserError("source", "name", "Failed to parse agent config"))
      );

      const result = await grantPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isErr());
    });
  });

  describe("loadDotEnvFile v3", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("happy path", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(
        Buffer.from(
          "AAD_APP_OBJECT_ID=aadObjectId\n TEAMS_APP_ID=teamsAppId\n TEAMS_APP_TENANT_ID=tenantId"
        )
      );

      const result = await CollaborationUtil.loadDotEnvFile("filePath");
      assert.isTrue(result.isOk());
      if (result.isOk()) {
        assert.equal(result.value[CollaborationConstants.TeamsAppIdEnv], "teamsAppId");
        assert.equal(result.value[CollaborationConstants.AadObjectIdEnv], "aadObjectId");
        assert.equal(result.value[CollaborationConstants.TeamsAppTenantIdEnv], "tenantId");
      }
    });

    it("file path error", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const result = await CollaborationUtil.loadDotEnvFile("filepath");
      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.equal(result.error.name, SolutionError.FailedToLoadDotEnvFile);
      }
    });

    it("load env failed", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockImplementation(() => {
        throw new Error("failed to load env");
      });
      const result = await CollaborationUtil.loadDotEnvFile("filepath");
      if (result.isErr()) {
        assert.equal(result.error.name, SolutionError.FailedToLoadDotEnvFile);
      }
    });
  });

  describe("getTeamsAppIdAndAadObjectId v3", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("happy path vsc", async () => {
      inputs[CollaborationConstants.AppType] = [
        CollaborationConstants.TeamsAppQuestionId,
        CollaborationConstants.AadAppQuestionId,
      ];
      inputs[QuestionNames.AadAppManifestFilePath] = "aadManifestPath";
      inputs[QuestionNames.TeamsAppManifestFilePath] = "teamsAppManifestPath";
      vi.spyOn(CollaborationUtil, "loadManifestId").mockImplementation(
        async (manifestFilePath: string) => {
          if (manifestFilePath == "aadManifestPath") {
            return ok("aadObjectId");
          } else {
            return ok("teamsAppId");
          }
        }
      );
      vi.spyOn(CollaborationUtil, "parseManifestId").mockImplementation((appId) => {
        return appId;
      });
      const result = await CollaborationUtil.getTeamsAppIdAndAadObjectId(inputs);
      assert.isTrue(result.isOk());
      if (result.isOk()) {
        const appId = result.value;
        assert.equal(appId.teamsAppId, "teamsAppId");
        assert.equal(appId.aadObjectId, "aadObjectId");
      }
    });

    it("happy path cli: get from parameter", async () => {
      const inputsCli: InputsWithProjectPath = {
        platform: Platform.CLI,
        projectPath: path.join(os.tmpdir(), randomAppName()),
        teamsAppId: "teamsAppId",
        aadObjectId: "aadObjectId",
      };
      const result = await CollaborationUtil.getTeamsAppIdAndAadObjectId(inputsCli);
      assert.isTrue(result.isOk());
      if (result.isOk()) {
        const appId = result.value;
        assert.equal(appId.teamsAppId, "teamsAppId");
        assert.equal(appId.aadObjectId, "aadObjectId");
      }
    });

    it("happy path cli: get from dotenv", async () => {
      const inputsCli: InputsWithProjectPath = {
        platform: Platform.CLI,
        projectPath: path.join(os.tmpdir(), randomAppName()),
        dotEnvFilePath: "filePath",
      };
      vi.spyOn(CollaborationUtil, "loadDotEnvFile").mockResolvedValue(
        ok({
          [CollaborationConstants.TeamsAppIdEnv]: "teamsAppId",
          [CollaborationConstants.AadObjectIdEnv]: "aadObjectId",
        })
      );
      const result = await CollaborationUtil.getTeamsAppIdAndAadObjectId(inputsCli);
      assert.isTrue(result.isOk());
      console.log(result);
      if (result.isOk()) {
        const appId = result.value;
        assert.equal(appId.teamsAppId, "teamsAppId");
        assert.equal(appId.aadObjectId, "aadObjectId");
      }
    });

    it("happy path cli: get from env", async () => {
      const inputsCli: InputsWithProjectPath = {
        platform: Platform.CLI,
        projectPath: path.join(os.tmpdir(), randomAppName()),
      };
      inputsCli[CollaborationConstants.AppType] = [
        CollaborationConstants.TeamsAppQuestionId,
        CollaborationConstants.AadAppQuestionId,
      ];
      inputsCli[QuestionNames.AadAppManifestFilePath] = "aadManifestPath";
      inputsCli[QuestionNames.TeamsAppManifestFilePath] = "teamsAppManifestPath";
      vi.spyOn(CollaborationUtil, "loadManifestId").mockImplementation(
        async (manifestFilePath: string) => {
          if (manifestFilePath == "aadManifestPath") {
            return ok("aadObjectId");
          } else {
            return ok("teamsAppId");
          }
        }
      );
      vi.spyOn(CollaborationUtil, "parseManifestId").mockImplementation((appId) => {
        return appId;
      });
      const result = await CollaborationUtil.getTeamsAppIdAndAadObjectId(inputsCli);
      assert.isTrue(result.isOk());
      if (result.isOk()) {
        const appId = result.value;
        assert.equal(appId.teamsAppId, "teamsAppId");
        assert.equal(appId.aadObjectId, "aadObjectId");
      }
    });

    it("load DotEnv failed", async () => {
      const inputsCli: InputsWithProjectPath = {
        platform: Platform.CLI,
        projectPath: path.join(os.tmpdir(), randomAppName()),
        dotEnvFilePath: "filePath",
      };
      vi.spyOn(CollaborationUtil, "loadDotEnvFile").mockResolvedValue(
        err(new UserError("source", "errorName", "errorMessage"))
      );
      const result = await CollaborationUtil.getTeamsAppIdAndAadObjectId(inputsCli);
      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.equal(result.error.name, "errorName");
      }
    });

    it("load manifest failed in Teams app", async () => {
      inputs[CollaborationConstants.AppType] = [
        CollaborationConstants.TeamsAppQuestionId,
        CollaborationConstants.AadAppQuestionId,
      ];
      inputs[QuestionNames.AadAppManifestFilePath] = "aadManifestPath";
      inputs[QuestionNames.TeamsAppManifestFilePath] = "teamsAppManifestPath";
      vi.spyOn(CollaborationUtil, "loadManifestId").mockResolvedValue(
        err(new UserError("source", "name", "message"))
      );
      const result = await CollaborationUtil.getTeamsAppIdAndAadObjectId(inputs);
      assert.isTrue(result.isErr());
    });

    it("load manifest failed in aad app", async () => {
      inputs[CollaborationConstants.AppType] = [CollaborationConstants.AadAppQuestionId];
      inputs[QuestionNames.AadAppManifestFilePath] = "aadManifestPath";
      vi.spyOn(CollaborationUtil, "loadManifestId").mockResolvedValue(
        err(new UserError("source", "name", "message"))
      );
      const result = await CollaborationUtil.getTeamsAppIdAndAadObjectId(inputs);
      assert.isTrue(result.isErr());
    });

    it("load empty manifest id in Teams app", async () => {
      inputs[CollaborationConstants.AppType] = [CollaborationConstants.TeamsAppQuestionId];
      inputs[QuestionNames.TeamsAppManifestFilePath] = "teamsAppManifestPath";
      vi.spyOn(CollaborationUtil, "loadManifestId").mockImplementation(
        async (manifestFilePath: string) => {
          if (manifestFilePath == "aadManifestPath") {
            return ok("aadObjectId");
          } else {
            return ok("teamsAppId");
          }
        }
      );
      vi.spyOn(CollaborationUtil, "parseManifestId").mockImplementation((appId) => {
        return undefined;
      });
      const result = await CollaborationUtil.getTeamsAppIdAndAadObjectId(inputs);
      assert.isTrue(result.isErr() && result.error.name === "FailedToLoadManifestId");
    });

    it("load empty manifest id in aad app", async () => {
      inputs[CollaborationConstants.AppType] = [CollaborationConstants.AadAppQuestionId];
      inputs[QuestionNames.AadAppManifestFilePath] = "aadAppManifestPath";
      vi.spyOn(CollaborationUtil, "loadManifestId").mockImplementation(
        async (manifestFilePath: string) => {
          if (manifestFilePath == "aadManifestPath") {
            return ok("aadObjectId");
          } else {
            return ok("teamsAppId");
          }
        }
      );
      vi.spyOn(CollaborationUtil, "parseManifestId").mockImplementation((appId) => {
        return undefined;
      });
      const result = await CollaborationUtil.getTeamsAppIdAndAadObjectId(inputs);
      assert.isTrue(result.isErr() && result.error.name === "FailedToLoadManifestId");
    });
  });

  describe("collaboration v3", () => {
    beforeEach(() => {
      vi.spyOn(tokenProvider.m365TokenProvider, "getJsonObject").mockResolvedValue(
        ok({
          tid: "mock_project_tenant_id",
          oid: "fake_oid",
          unique_name: "fake_unique_name",
          name: "fake_name",
        })
      );
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("listCollaborator: happy path", async () => {
      vi.spyOn(TeamsCollaboration.prototype, "listCollaborator").mockResolvedValue(
        ok([
          {
            userObjectId: "fake-aad-user-object-id",
            resourceId: "fake-resource-id",
            displayName: "fake-display-name",
            userPrincipalName: "fake-user-principal-name",
          },
        ])
      );
      vi.spyOn(AadCollaboration.prototype, "listCollaborator").mockResolvedValue(
        ok([
          {
            userObjectId: "fake-aad-user-object-id",
            resourceId: "fake-resource-id",
            displayName: "fake-display-name",
            userPrincipalName: "fake-user-principal-name",
          },
        ])
      );
      vi.spyOn(CollaborationUtil, "getTeamsAppIdAndAadObjectId").mockResolvedValue(
        ok({
          teamsAppId: "teamsAppId",
          aadObjectId: "aadObjectId",
        })
      );

      inputs.platform == Platform.VSCode;
      inputs.env = "dev";

      const result = await listCollaborator(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk());
    });

    it("listCollaborator: happy path with Teams only", async () => {
      vi.spyOn(TeamsCollaboration.prototype, "listCollaborator").mockResolvedValue(
        ok([
          {
            userObjectId: "fake-aad-user-object-id",
            resourceId: "fake-resource-id",
            displayName: "fake-display-name",
            userPrincipalName: "fake-user-principal-name",
          },
        ])
      );
      vi.spyOn(AadCollaboration.prototype, "listCollaborator").mockResolvedValue(
        ok([
          {
            userObjectId: "fake-aad-user-object-id",
            resourceId: "fake-resource-id",
            displayName: "fake-display-name",
            userPrincipalName: "fake-user-principal-name",
          },
        ])
      );
      vi.spyOn(CollaborationUtil, "getTeamsAppIdAndAadObjectId").mockResolvedValue(
        ok({
          teamsAppId: "teamsAppId",
          aadObjectId: undefined,
        })
      );

      inputs.platform == Platform.VSCode;
      inputs.env = "dev";

      const result = await listCollaborator(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk());
    });

    it("listCollaborator: happy path with AAD only", async () => {
      vi.spyOn(TeamsCollaboration.prototype, "listCollaborator").mockResolvedValue(
        ok([
          {
            userObjectId: "fake-aad-user-object-id",
            resourceId: "fake-resource-id",
            displayName: "fake-display-name",
            userPrincipalName: "fake-user-principal-name",
          },
        ])
      );
      vi.spyOn(AadCollaboration.prototype, "listCollaborator").mockResolvedValue(
        ok([
          {
            userObjectId: "fake-aad-user-object-id",
            resourceId: "fake-resource-id",
            displayName: "fake-display-name",
            userPrincipalName: "fake-user-principal-name",
          },
        ])
      );
      vi.spyOn(CollaborationUtil, "getTeamsAppIdAndAadObjectId").mockResolvedValue(
        ok({
          teamsAppId: undefined,
          aadObjectId: "aadObjectId",
        })
      );

      inputs.platform == Platform.VSCode;
      inputs.env = "dev";

      const result = await listCollaborator(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk());
    });

    it("list collaborator: failed to read teams app id", async () => {
      vi.spyOn(TeamsCollaboration.prototype, "listCollaborator").mockResolvedValue(
        ok([
          {
            userObjectId: "fake-aad-user-object-id",
            resourceId: "fake-resource-id",
            displayName: "fake-display-name",
            userPrincipalName: "fake-user-principal-name",
          },
        ])
      );
      vi.spyOn(AadCollaboration.prototype, "listCollaborator").mockResolvedValue(
        ok([
          {
            userObjectId: "fake-aad-user-object-id",
            resourceId: "fake-resource-id",
            displayName: "fake-display-name",
            userPrincipalName: "fake-user-principal-name",
          },
        ])
      );
      vi.spyOn(CollaborationUtil, "getTeamsAppIdAndAadObjectId").mockResolvedValue(
        err(new UserError("source", "errorName", "errorMessage"))
      );

      inputs.platform == Platform.CLI;
      inputs.env = "dev";

      const result = await listCollaborator(ctx, inputs, tokenProvider);
      assert.isTrue(result.isErr() && result.error.name === "errorName");
    });

    it("grantPermission: happy path", async () => {
      vi.spyOn(TeamsCollaboration.prototype, "grantPermission").mockResolvedValue(
        ok([
          {
            name: "aad_app",
            resourceId: "fake_aad_app_resource_id",
            roles: ["Owner"],
            type: "M365",
          },
        ])
      );
      vi.spyOn(AadCollaboration.prototype, "grantPermission").mockResolvedValue(
        ok([
          {
            name: "teams_app",
            resourceId: "fake_teams_app_resource_id",
            roles: ["Administrator"],
            type: "M365",
          },
        ])
      );
      vi.spyOn(CollaborationUtil, "getTeamsAppIdAndAadObjectId").mockResolvedValue(
        ok({
          teamsAppId: "teamsAppId",
          aadObjectId: "aadObjectId",
        })
      );
      vi.spyOn(CollaborationUtil, "getUserInfo")
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName",
          displayName: "displayName",
          isAdministrator: true,
        })
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName2",
          displayName: "displayName2",
          isAdministrator: true,
        });

      inputs.platform == Platform.CLI;
      inputs.email = "your_collaborator@yourcompany.com";
      inputs.env = "dev";

      const result = await grantPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk() && result.value.permissions!.length === 2);
    });

    it("grantPermission: happy path with Teams only", async () => {
      vi.spyOn(TeamsCollaboration.prototype, "grantPermission").mockResolvedValue(
        ok([
          {
            name: "aad_app",
            resourceId: "fake_aad_app_resource_id",
            roles: ["Owner"],
            type: "M365",
          },
        ])
      );
      vi.spyOn(AadCollaboration.prototype, "grantPermission").mockResolvedValue(
        ok([
          {
            name: "teams_app",
            resourceId: "fake_teams_app_resource_id",
            roles: ["Administrator"],
            type: "M365",
          },
        ])
      );
      vi.spyOn(CollaborationUtil, "getTeamsAppIdAndAadObjectId").mockResolvedValue(
        ok({
          teamsAppId: "teamsAppId",
          aadObjectId: undefined,
        })
      );
      vi.spyOn(CollaborationUtil, "getUserInfo")
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName",
          displayName: "displayName",
          isAdministrator: true,
        })
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName2",
          displayName: "displayName2",
          isAdministrator: true,
        });

      inputs.platform == Platform.VSCode;
      inputs.email = "your_collaborator@yourcompany.com";
      inputs.env = "dev";

      const result = await grantPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk() && result.value.permissions!.length === 1);
    });

    it("grantPermission: happy path with AAD only", async () => {
      vi.spyOn(TeamsCollaboration.prototype, "grantPermission").mockResolvedValue(
        ok([
          {
            name: "aad_app",
            resourceId: "fake_aad_app_resource_id",
            roles: ["Owner"],
            type: "M365",
          },
        ])
      );
      vi.spyOn(AadCollaboration.prototype, "grantPermission").mockResolvedValue(
        ok([
          {
            name: "teams_app",
            resourceId: "fake_teams_app_resource_id",
            roles: ["Administrator"],
            type: "M365",
          },
        ])
      );
      vi.spyOn(CollaborationUtil, "getTeamsAppIdAndAadObjectId").mockResolvedValue(
        ok({
          teamsAppId: undefined,
          aadObjectId: "aadObjectId",
        })
      );
      vi.spyOn(CollaborationUtil, "getUserInfo")
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName",
          displayName: "displayName",
          isAdministrator: true,
        })
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName2",
          displayName: "displayName2",
          isAdministrator: true,
        });

      inputs.platform == Platform.VSCode;
      inputs.email = "your_collaborator@yourcompany.com";
      inputs.env = "dev";

      const result = await grantPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk() && result.value.permissions!.length === 1);
    });

    it("grantPermission: failed to read teams app id", async () => {
      vi.spyOn(TeamsCollaboration.prototype, "grantPermission").mockResolvedValue(
        ok([
          {
            name: "aad_app",
            resourceId: "fake_aad_app_resource_id",
            roles: ["Owner"],
            type: "M365",
          },
        ])
      );
      vi.spyOn(AadCollaboration.prototype, "grantPermission").mockResolvedValue(
        ok([
          {
            name: "teams_app",
            resourceId: "fake_teams_app_resource_id",
            roles: ["Administrator"],
            type: "M365",
          },
        ])
      );
      vi.spyOn(CollaborationUtil, "getTeamsAppIdAndAadObjectId").mockResolvedValue(
        err(new UserError("source", "errorName", "errorMessage"))
      );
      vi.spyOn(CollaborationUtil, "getUserInfo")
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName",
          displayName: "displayName",
          isAdministrator: true,
        })
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName2",
          displayName: "displayName2",
          isAdministrator: true,
        });

      inputs.platform == Platform.CLI;
      inputs.env = "dev";
      inputs.email = "your_collaborator@yourcompany.com";

      const result = await grantPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isErr() && result.error.name === "errorName");
    });

    it("checkPermission: happy path", async () => {
      vi.spyOn(TeamsCollaboration.prototype, "checkPermission").mockResolvedValue(
        ok([
          {
            name: "teams_app",
            resourceId: "fake_teams_app_resource_id",
            roles: ["Administrator"],
            type: "M365",
          },
        ])
      );
      vi.spyOn(AadCollaboration.prototype, "checkPermission").mockResolvedValue(
        ok([
          {
            name: "aad_app",
            resourceId: "fake_aad_app_resource_id",
            roles: ["Owner"],
            type: "M365",
          },
        ])
      );
      vi.spyOn(CollaborationUtil, "getTeamsAppIdAndAadObjectId").mockResolvedValue(
        ok({
          teamsAppId: "teamsAppId",
          aadObjectId: "aadObjectId",
        })
      );
      vi.spyOn(CollaborationUtil, "getUserInfo")
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName",
          displayName: "displayName",
          isAdministrator: true,
        })
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName2",
          displayName: "displayName2",
          isAdministrator: true,
        });

      inputs.platform == Platform.CLI;
      inputs.env = "dev";

      const result = await checkPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk() && result.value.permissions!.length === 2);
    });

    it("checkPermission: happy path with Teams only", async () => {
      vi.spyOn(TeamsCollaboration.prototype, "checkPermission").mockResolvedValue(
        ok([
          {
            name: "teams_app",
            resourceId: "fake_teams_app_resource_id",
            roles: ["Administrator"],
            type: "M365",
          },
        ])
      );
      vi.spyOn(AadCollaboration.prototype, "checkPermission").mockResolvedValue(
        ok([
          {
            name: "aad_app",
            resourceId: "fake_aad_app_resource_id",
            roles: ["Owner"],
            type: "M365",
          },
        ])
      );
      vi.spyOn(CollaborationUtil, "getTeamsAppIdAndAadObjectId").mockResolvedValue(
        ok({
          teamsAppId: "teamsAppId",
          aadObjectId: undefined,
        })
      );
      vi.spyOn(CollaborationUtil, "getUserInfo")
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName",
          displayName: "displayName",
          isAdministrator: true,
        })
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName2",
          displayName: "displayName2",
          isAdministrator: true,
        });

      inputs.platform == Platform.CLI;
      inputs.env = "dev";

      const result = await checkPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk() && result.value.permissions!.length === 1);
    });

    it("checkPermission: happy path with AAD only", async () => {
      vi.spyOn(TeamsCollaboration.prototype, "checkPermission").mockResolvedValue(
        ok([
          {
            name: "teams_app",
            resourceId: "fake_teams_app_resource_id",
            roles: ["Administrator"],
            type: "M365",
          },
        ])
      );
      vi.spyOn(AadCollaboration.prototype, "checkPermission").mockResolvedValue(
        ok([
          {
            name: "aad_app",
            resourceId: "fake_aad_app_resource_id",
            roles: ["Owner"],
            type: "M365",
          },
        ])
      );
      vi.spyOn(CollaborationUtil, "getTeamsAppIdAndAadObjectId").mockResolvedValue(
        ok({
          teamsAppId: undefined,
          aadObjectId: "aadObjectId",
        })
      );
      vi.spyOn(CollaborationUtil, "getUserInfo")
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName",
          displayName: "displayName",
          isAdministrator: true,
        })
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName2",
          displayName: "displayName2",
          isAdministrator: true,
        });

      inputs.platform == Platform.CLI;
      inputs.env = "dev";

      const result = await checkPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isOk() && result.value.permissions!.length === 1);
    });

    it("checkPermission: failed to read teams app id", async () => {
      vi.spyOn(TeamsCollaboration.prototype, "checkPermission").mockResolvedValue(
        ok([
          {
            name: "teams_app",
            resourceId: "fake_teams_app_resource_id",
            roles: ["Administrator"],
            type: "M365",
          },
        ])
      );
      vi.spyOn(AadCollaboration.prototype, "checkPermission").mockResolvedValue(
        ok([
          {
            name: "aad_app",
            resourceId: "fake_aad_app_resource_id",
            roles: ["Owner"],
            type: "M365",
          },
        ])
      );
      vi.spyOn(CollaborationUtil, "getTeamsAppIdAndAadObjectId").mockResolvedValue(
        err(new UserError("source", "errorName", "errorMessage"))
      );
      vi.spyOn(CollaborationUtil, "getUserInfo")
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName",
          displayName: "displayName",
          isAdministrator: true,
        })
        .mockResolvedValueOnce({
          tenantId: "mock_project_tenant_id",
          aadId: "aadId",
          userPrincipalName: "userPrincipalName2",
          displayName: "displayName2",
          isAdministrator: true,
        });

      inputs.platform == Platform.CLI;
      inputs.env = "dev";

      const result = await checkPermission(ctx, inputs, tokenProvider);
      assert.isTrue(result.isErr() && result.error.name === "errorName");
    });
  });

  describe("loadManifestId v3", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("happy path", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJson").mockResolvedValue(
        JSON.parse('{"id":"00000000-0000-0000-0000-000000000000"}')
      );
      const res = await CollaborationUtil.loadManifestId("manifest");
      assert.isTrue(res.isOk() && res.value === "00000000-0000-0000-0000-000000000000");
    });

    it("manifest not exist", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const res = await CollaborationUtil.loadManifestId("manifest");
      assert.isTrue(res.isErr() && res.error.name == "FileNotFoundError");
    });

    it("manifestFileNotValid", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJson").mockResolvedValue(
        JSON.parse('{"test":"00000000-0000-0000-0000-000000000000"}')
      );
      const res = await CollaborationUtil.loadManifestId("manifest");
      assert.isTrue(res.isErr() && res.error.name == "InvalidManifestError");
    });

    it("unexpected error", async () => {
      vi.spyOn(fs, "pathExists").mockImplementation(() => {
        throw new Error("error");
      });
      const res = await CollaborationUtil.loadManifestId("manifest");
      assert.isTrue(res.isErr() && res.error.name == "FailedToLoadManifestFile");
    });
  });

  describe("requireEnvQuestion", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("happy path", () => {
      const res = CollaborationUtil.requireEnvQuestion("${{TEAMS_APP_ID}}");
      assert.isTrue(res);
    });

    it("return false when uuid", () => {
      const res = CollaborationUtil.requireEnvQuestion("00000000-0000-0000-0000-000000000000");
      assert.isFalse(res);
    });

    it("return false when invalid", () => {
      const res = CollaborationUtil.requireEnvQuestion("${TEAMS_APP_ID}");
      assert.isFalse(res);
    });
  });

  describe("parseManifestId", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("happy path: hardcode", async () => {
      inputs.env = "dev";
      const res = CollaborationUtil.parseManifestId("00000000-0000-0000-0000-000000000000");
      assert.equal(res, "00000000-0000-0000-0000-000000000000");
    });

    it("happy path: read from env", async () => {
      inputs.env = "dev";
      const mockedEnvRestoreForInput = mockedEnv({ ["TEAMS_APP_ID"]: "teamsAppId" });
      const res = CollaborationUtil.parseManifestId("${{TEAMS_APP_ID}}");
      assert.equal(res, "teamsAppId");
      mockedEnvRestoreForInput();
    });

    it("return undefined when invalid", async () => {
      const res = CollaborationUtil.parseManifestId("TEST");
      assert.isUndefined(res);
    });

    it("return undefined when empty env", async () => {
      inputs.env = "dev";
      const mockedEnvRestoreForInput = mockedEnv({ ["TEAMS_APP_ID"]: undefined });
      const res = CollaborationUtil.parseManifestId("${{TEAMS_APP_ID}}");
      assert.isUndefined(res);
      mockedEnvRestoreForInput();
    });
  });
});
