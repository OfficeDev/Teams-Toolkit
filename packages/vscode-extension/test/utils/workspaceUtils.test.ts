import * as globalState from "@microsoft/teamsfx-core";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { Uri, commands } from "vscode";
import { openOfficeDevFolder } from "../../src/utils/workspaceUtils";
import { GlobalKey } from "../../src/constants";
import { vi, expect } from "vitest";

describe("WorkspaceUtils", () => {
  describe("openOfficeDevFolder", () => {
    let inMemoryGlobalState: Map<string, any>;

    beforeEach(async () => {
      inMemoryGlobalState = new Map<string, any>();
      vi.spyOn(globalState, "globalStateGet").mockImplementation(
        async (key: string, defaultValue?: any) => {
          return inMemoryGlobalState.has(key) ? inMemoryGlobalState.get(key) : defaultValue;
        }
      );
      vi.spyOn(globalState, "globalStateUpdate").mockImplementation(
        async (key: string, value: any) => {
          inMemoryGlobalState.set(key, value);
        }
      );

      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(commands, "executeCommand");
      await globalState.globalStateUpdate(GlobalKey.OpenWalkThrough, false);
      await globalState.globalStateUpdate(GlobalKey.AutoInstallDependency, false);
      await globalState.globalStateUpdate(GlobalKey.OpenReadMe, "");
      await globalState.globalStateUpdate(GlobalKey.ShowLocalDebugMessage, false);
      await globalState.globalStateUpdate(GlobalKey.CreateWarnings, "");
    });

    it("triggered from walkthrough with local debug message and warnings", async () => {
      const warnings = [{ type: "type", content: "content" }];
      const folderPath = Uri.file("C:\\fakePath");
      await openOfficeDevFolder(folderPath, true, warnings, ["WalkThrough"]);
      expect(await globalState.globalStateGet(GlobalKey.OpenWalkThrough, true)).equals(false);
      expect(await globalState.globalStateGet(GlobalKey.AutoInstallDependency, false)).equals(true);
      expect(await globalState.globalStateGet(GlobalKey.OpenReadMe, "")).equals("");
      expect(await globalState.globalStateGet(GlobalKey.ShowLocalDebugMessage, false)).equals(true);
      expect(await globalState.globalStateGet(GlobalKey.CreateWarnings, "")).equals(
        JSON.stringify(warnings)
      );
    });

    it("not triggered from walkthrough with no local debug message and warnings", async () => {
      const folderPath = Uri.file("C:\\fakePath");
      await openOfficeDevFolder(folderPath, false, undefined);
      expect(await globalState.globalStateGet(GlobalKey.OpenWalkThrough, true)).equals(false);
      expect(await globalState.globalStateGet(GlobalKey.AutoInstallDependency, false)).equals(true);
      expect(await globalState.globalStateGet(GlobalKey.OpenReadMe, "")).equals(folderPath.fsPath);
    });
  });
});
