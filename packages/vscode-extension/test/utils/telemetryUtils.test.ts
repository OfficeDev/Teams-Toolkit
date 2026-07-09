import { Uri } from "vscode";
import { err, Inputs, ok, UserError } from "@microsoft/teamsfx-api";
import * as globalVariables from "../../src/globalVariables";
import { vi, expect, assert } from "vitest";
import {
  getPackageVersion,
  getProjectId,
  getTriggerFromProperty,
  isTriggerFromWalkThrough,
  getTeamsAppTelemetryInfoByEnv,
  getSettingsVersion,
} from "../../src/utils/telemetryUtils";
import * as systemEnvUtils from "../../src/utils/systemEnvUtils";
import { MockCore } from "../mocks/mockCore";
import { TelemetryProperty, TelemetryTriggerFrom } from "../../src/telemetry/extTelemetryEvents";
import { VersionCheckRes } from "@microsoft/teamsfx-core";
import { mockValue } from "../mocks/vitestMockUtils";

describe("TelemetryUtils", () => {
  describe("getPackageVersion", () => {
    it("alpha version", () => {
      const version = "1.1.1-alpha.4";

      expect(getPackageVersion(version)).equals("alpha");
    });

    it("beta version", () => {
      const version = "1.1.1-beta.2";

      expect(getPackageVersion(version)).equals("beta");
    });

    it("rc version", () => {
      const version = "1.0.0-rc.3";

      expect(getPackageVersion(version)).equals("rc");
    });

    it("formal version", () => {
      const version = "4.6.0";

      expect(getPackageVersion(version)).equals("formal");
    });
  });

  describe("getProjectId", async () => {
    const core = new MockCore();

    beforeEach(() => {
      mockValue(globalVariables, "core", core as any);
    });

    it("happy path", async () => {
      mockValue(globalVariables, "workspaceUri", Uri.file("."));
      vi.spyOn(core, "getProjectId").mockResolvedValue(ok("mock-project-id"));
      const result = await getProjectId();
      expect(result).equals("mock-project-id");
    });
    it("workspaceUri is undefined", async () => {
      mockValue(globalVariables, "workspaceUri", undefined as any);
      const result = await getProjectId();
      expect(result).equals(undefined);
    });
    it("return error", async () => {
      mockValue(globalVariables, "workspaceUri", Uri.file("."));
      vi.spyOn(core, "getProjectId").mockResolvedValue(err(new UserError({})));
      const result = await getProjectId();
      expect(result).equals(undefined);
    });
    it("throw error", async () => {
      mockValue(globalVariables, "workspaceUri", Uri.file("."));
      vi.spyOn(core, "getProjectId").mockRejectedValue(new UserError({}));
      const result = await getProjectId();
      expect(result).equals(undefined);
    });
  });

  describe("getTriggerFromProperty", () => {
    it("Should return cmp with no args", () => {
      const props = getTriggerFromProperty();

      expect(props).to.deep.equal({
        [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.CommandPalette,
      });
    });

    it("Should return cmp with empty args", () => {
      const props = getTriggerFromProperty([]);

      expect(props).to.deep.equal({
        [TelemetryProperty.TriggerFrom]: TelemetryTriggerFrom.CommandPalette,
      });
    });

    for (const triggerFrom of [
      TelemetryTriggerFrom.Auto,
      TelemetryTriggerFrom.CodeLens,
      TelemetryTriggerFrom.EditorTitle,
      TelemetryTriggerFrom.ExternalUrl,
      TelemetryTriggerFrom.CopilotChat,
      TelemetryTriggerFrom.CreateAppQuestionFlow,
      TelemetryTriggerFrom.Webview,
      TelemetryTriggerFrom.Notification,
      TelemetryTriggerFrom.Other,
      TelemetryTriggerFrom.QuickPick,
      TelemetryTriggerFrom.SideBar,
      TelemetryTriggerFrom.TreeView,
      TelemetryTriggerFrom.Unknow,
      TelemetryTriggerFrom.ViewTitleNavigation,
      TelemetryTriggerFrom.WalkThrough,
    ]) {
      it(`Should return ${triggerFrom.toString()}`, () => {
        const props = getTriggerFromProperty([triggerFrom]);

        expect(props).to.deep.equal({
          [TelemetryProperty.TriggerFrom]: triggerFrom,
        });
      });
    }
  });

  describe("isTriggerFromWalkThrough", () => {
    it("Should return false with no args", () => {
      const isFromWalkthrough = isTriggerFromWalkThrough();

      assert.equal(isFromWalkthrough, false);
    });

    it("Should return false with empty args", () => {
      const isFromWalkthrough = isTriggerFromWalkThrough([]);

      assert.equal(isFromWalkthrough, false);
    });

    it("Should return true with walkthrough args", () => {
      const isFromWalkthrough = isTriggerFromWalkThrough([TelemetryTriggerFrom.WalkThrough]);

      assert.equal(isFromWalkthrough, true);
    });

    it("Should return true with notification args", () => {
      const isFromWalkthrough = isTriggerFromWalkThrough([TelemetryTriggerFrom.Notification]);

      assert.equal(isFromWalkthrough, true);
    });

    it("Should return false with other args", () => {
      const isFromWalkthrough = isTriggerFromWalkThrough([TelemetryTriggerFrom.Other]);

      assert.equal(isFromWalkthrough, false);
    });
  });

  // eslint-disable-next-line no-secrets/no-secrets
  describe("getTeamsAppTelemetryInfoByEnv", async () => {
    it("happy path", async () => {
      const info = {
        projectId: "mock-project-id",
        teamsAppId: "mock-app-id",
        teamsAppName: "mock-app-name",
        m365TenantId: "mock-tenant-id",
      };
      const mockCore = {
        getProjectInfo: vi.fn().mockResolvedValue(ok(info)),
      };
      mockValue(globalVariables, "workspaceUri", Uri.file("."));
      mockValue(globalVariables, "core", mockCore as any);

      const result = await getTeamsAppTelemetryInfoByEnv("dev", () => true);
      expect(result).deep.equals({
        appId: "mock-app-id",
        tenantId: "mock-tenant-id",
      });
    });
    it("isValidProject is false", async () => {
      mockValue(globalVariables, "workspaceUri", Uri.file("."));
      const result = await getTeamsAppTelemetryInfoByEnv("dev", () => false);
      expect(result).equals(undefined);
    });
    it("return error", async () => {
      const mockCore = {
        getProjectInfo: vi.fn().mockResolvedValue(err(new UserError({}))),
      };
      mockValue(globalVariables, "workspaceUri", Uri.file("."));
      mockValue(globalVariables, "core", mockCore as any);

      const result = await getTeamsAppTelemetryInfoByEnv("dev", () => true);
      expect(result).equals(undefined);
    });
    it("throw error", async () => {
      const mockCore = {
        getProjectInfo: vi.fn().mockRejectedValue(new UserError({})),
      };
      mockValue(globalVariables, "workspaceUri", Uri.file("."));
      mockValue(globalVariables, "core", mockCore as any);

      const result = await getTeamsAppTelemetryInfoByEnv("dev", () => true);
      expect(result).equals(undefined);
    });
  });

  describe("getSettingsVersion", async () => {
    it("happy path", async () => {
      const core = new MockCore();
      mockValue(globalVariables, "core", core as any);
      vi.spyOn(systemEnvUtils, "getSystemInputs").mockReturnValue({} as Inputs);
      vi.spyOn(core, "projectVersionCheck").mockResolvedValue(
        ok({ currentVersion: "3.0.0" } as VersionCheckRes)
      );
      const res = await getSettingsVersion();
      assert.equal(res, "3.0.0");
    });

    it("core is undefined", async () => {
      mockValue(globalVariables, "core", undefined as any);
      const res = await getSettingsVersion();
      assert.equal(res, undefined);
    });

    it("return error", async () => {
      const core = new MockCore();
      mockValue(globalVariables, "core", core as any);
      vi.spyOn(systemEnvUtils, "getSystemInputs").mockReturnValue({} as Inputs);
      vi.spyOn(core, "projectVersionCheck").mockResolvedValue(err(new UserError({})));
      const res = await getSettingsVersion();
      assert.equal(res, undefined);
    });
  });
});
