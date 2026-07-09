import { UserError, err, ok } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as global from "../../src/globalVariables";
import { checkProjectTypeAndSendTelemetry, isM365Project } from "../../src/utils/projectChecker";
import { MockCore } from "../mocks/mockCore";
import * as vscode from "vscode";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";

describe("projectChecker", () => {
  describe("checkProjectTypeAndSendTelemetry", () => {
    const core = new MockCore();

    it("happy", async () => {
      mockValue(global, "workspaceUri", vscode.Uri.file("./"));
      mockValue(global, "core", core);
      vi.spyOn(core, "checkProjectType").mockResolvedValue(
        ok({
          isTeamsFx: true,
          hasTeamsManifest: true,
          dependsOnTeamsJs: false,
          lauguages: ["ts"],
        })
      );
      vi.spyOn(ExtTelemetry, "addSharedProperty");
      await checkProjectTypeAndSendTelemetry();
    });

    it("error", async () => {
      mockValue(global, "workspaceUri", vscode.Uri.file("./"));
      mockValue(global, "core", core);
      vi.spyOn(core, "checkProjectType").mockResolvedValue(err(new UserError({})));
      await checkProjectTypeAndSendTelemetry();
    });

    it("workspaceUri is undefined", async () => {
      mockValue(global, "workspaceUri", undefined);
      await checkProjectTypeAndSendTelemetry();
    });
  });

  describe("isM365Project", () => {
    afterEach(async () => {
      vi.restoreAllMocks();
    });

    it("projectSettings.json exist", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJson").mockResolvedValue({ isM365: true });
      const res = await isM365Project("testPath");
      assert.isTrue(res);
    });

    it("projectSettings.json not exist", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const res = await isM365Project("testPath");
      assert.isFalse(res);
    });
  });
});
