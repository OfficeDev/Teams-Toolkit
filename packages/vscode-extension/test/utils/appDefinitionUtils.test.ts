import * as appDefinitionUtils from "../../src/utils/appDefinitionUtils";
import * as globalVariables from "../../src/globalVariables";
import { MockCore } from "../mocks/mockCore";
import { Uri } from "vscode";
import { UserError, err, ok } from "@microsoft/teamsfx-api";
import { envUtil, metadataUtil, pathUtils } from "@microsoft/teamsfx-core";
import { vi, expect } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";

describe("AppDefinitionUtils", () => {
  describe("getAppName", async () => {
    const core = new MockCore();

    beforeEach(() => {
      mockValue(globalVariables, "core", core);
    });

    it("happy path", async () => {
      vi.spyOn(core, "getTeamsAppName").mockResolvedValue(ok("mock-app-name"));
      mockValue(globalVariables, "workspaceUri", Uri.file("."));
      const result = await appDefinitionUtils.getAppName();
      expect(result).equals("mock-app-name");
    });

    it("workspaceUri is undefined", async () => {
      mockValue(globalVariables, "workspaceUri", undefined);
      const result = await appDefinitionUtils.getAppName();
      expect(result).equals(undefined);
    });

    it("return error", async () => {
      mockValue(globalVariables, "workspaceUri", Uri.file("."));
      vi.spyOn(core, "getTeamsAppName").mockResolvedValue(err(new UserError({})));
      const result = await appDefinitionUtils.getAppName();
      expect(result).equals(undefined);
    });

    it("throw error", async () => {
      mockValue(globalVariables, "workspaceUri", Uri.file("."));
      vi.spyOn(core, "getTeamsAppName").mockRejectedValue(new UserError({}));
      const result = await appDefinitionUtils.getAppName();
      expect(result).equals(undefined);
    });

    it("should return undefined if getTeamsAppName returns empty string", async () => {
      mockValue(globalVariables, "workspaceUri", Uri.file("."));
      vi.spyOn(core, "getTeamsAppName").mockResolvedValue(ok(""));
      const result = await appDefinitionUtils.getAppName();
      expect(result).equals(undefined);
    });
  });

  describe("getV3TeamsAppId", () => {
    it("returns teamsAppId successfully", async () => {
      mockValue(globalVariables, "workspaceUri", Uri.file("test"));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("test.yml");
      vi.spyOn(metadataUtil, "parse").mockResolvedValue(
        ok({
          provision: {
            driverDefs: [
              { uses: "teamsApp/create", writeToEnvironmentFile: { teamsAppId: "TeamsAppId" } },
            ],
          },
        } as any)
      );
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({ TeamsAppId: "testId" } as any));

      const result = await appDefinitionUtils.getV3TeamsAppId("testProjectPath", "test");
      expect(result).equals("testId");
    });

    it("readEnv throws error", async () => {
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(err("error") as any);

      appDefinitionUtils.getV3TeamsAppId("testProjectPath", "test").catch((e) => {
        expect(e).equals("error");
      });
    });

    it("throws error if Teams app id is missing", async () => {
      mockValue(globalVariables, "workspaceUri", Uri.file("test"));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("test.yml");
      vi.spyOn(metadataUtil, "parse").mockResolvedValue(
        ok({
          provision: {
            driverDefs: [
              { uses: "teamsApp/create", writeToEnvironmentFile: { teamsAppId: "NonExist" } },
            ],
          },
        } as any)
      );
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({ TeamsAppId: "testId" } as any));

      appDefinitionUtils.getV3TeamsAppId("testProjectPath", "test").catch((e) => {
        expect(e).to.be.an.instanceOf(UserError);
        expect(e.message).equals("TEAMS_APP_ID is missing in test environment.");
      });
    });
  });

  describe("getTeamsAppKeyName", () => {
    it("returns teamsAppId successfully", async () => {
      mockValue(globalVariables, "workspaceUri", Uri.file("test"));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("test.yml");
      vi.spyOn(metadataUtil, "parse").mockResolvedValue(
        ok({
          provision: {
            driverDefs: [
              { uses: "teamsApp/create", writeToEnvironmentFile: { teamsAppId: "TeamsAppId" } },
            ],
          },
        } as any)
      );

      const result = await appDefinitionUtils.getTeamsAppKeyName("test");
      expect(result).equals("TeamsAppId");
    });

    it("returns undefined if failed to parse", async () => {
      mockValue(globalVariables, "workspaceUri", Uri.file("test"));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("test.yml");
      vi.spyOn(metadataUtil, "parse").mockResolvedValue(err({ error: "error" } as any));

      const result = await appDefinitionUtils.getTeamsAppKeyName("test");
      expect(result).is.undefined;
    });

    it("returns undefined if no driverDefs", async () => {
      mockValue(globalVariables, "workspaceUri", Uri.file("test"));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("test.yml");
      vi.spyOn(metadataUtil, "parse").mockResolvedValue(
        ok({
          provision: {
            driverDefs: [],
          },
        } as any)
      );

      const result = await appDefinitionUtils.getTeamsAppKeyName("test");
      expect(result).is.undefined;
    });

    it("returns undefined if no teamsApp/create in driverDefs", async () => {
      mockValue(globalVariables, "workspaceUri", Uri.file("test"));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("test.yml");
      vi.spyOn(metadataUtil, "parse").mockResolvedValue(
        ok({
          provision: {
            driverDefs: [
              { uses: "teamsApp/fake", writeToEnvironmentFile: { teamsAppId: "TeamsAppId" } },
            ],
          },
        } as any)
      );

      const result = await appDefinitionUtils.getTeamsAppKeyName("test");
      expect(result).is.undefined;
    });

    it("returns undefined if no writeToEnvironmentFile is defined", async () => {
      mockValue(globalVariables, "workspaceUri", Uri.file("test"));
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("test.yml");
      vi.spyOn(metadataUtil, "parse").mockResolvedValue(
        ok({
          provision: {
            driverDefs: [{ uses: "teamsApp/create" }],
          },
        } as any)
      );

      const result = await appDefinitionUtils.getTeamsAppKeyName("test");
      expect(result).is.undefined;
    });
  });
});
