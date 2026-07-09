import * as vscode from "vscode";
import { GlobalKey } from "../../src/constants";
import { updateAutoOpenGlobalKey } from "../../src/utils/globalStateUtils";
import { vi, assert } from "vitest";
import * as telemetryUtils from "../../src/utils/telemetryUtils";
import * as globalVariables from "../../src/globalVariables";
import * as globalState from "@microsoft/teamsfx-core/build/common/globalState";

describe("GlobalStateUtils", () => {
  it("updateAutoOpenGlobalKey", async () => {
    vi.spyOn(telemetryUtils, "isTriggerFromWalkThrough").mockReturnValue(true);
    vi.spyOn(globalVariables, "checkIsSPFx").mockReturnValue(true);
    const globalStateUpdateStub = vi
      .spyOn(globalState, "globalStateUpdate")
      .mockResolvedValue(undefined as any);

    await updateAutoOpenGlobalKey(false, vscode.Uri.file("test"), [
      { type: "type", content: "content" },
    ]);

    assert.isTrue(globalStateUpdateStub.calledWith(GlobalKey.OpenWalkThrough, true));
    assert.isTrue(globalStateUpdateStub.calledWith(GlobalKey.OpenReadMe, ""));
    assert.isTrue(globalStateUpdateStub.calledWith(GlobalKey.CreateWarnings, expect.any(String)));
    assert.isTrue(globalStateUpdateStub.calledWith(GlobalKey.AutoInstallDependency, true));
  });
});
