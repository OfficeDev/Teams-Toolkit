import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";

import { ok } from "@microsoft/teamsfx-api";
import { environmentManager } from "@microsoft/teamsfx-core";
import * as projectSettingsHelper from "@microsoft/teamsfx-core/build/common/projectSettingsHelper";

import * as globalVariables from "../../src/globalVariables";
import EnvironmentTreeViewProvider from "../../src/treeview/environmentTreeViewProvider";

describe("EnvironmentTreeViewProvider", () => {
  it("reloadEnvironments", async () => {
    vi.spyOn(projectSettingsHelper, "isValidProject").mockReturnValue(true);
    mockValue(globalVariables, "workspaceUri", { fsPath: "test" });

    const result = await EnvironmentTreeViewProvider.reloadEnvironments();

    assert.isTrue(result.isOk());
  });

  it("getChildren", async () => {
    mockValue(globalVariables, "workspaceUri", { fsPath: "test" });
    vi.spyOn(environmentManager, "listRemoteEnvConfigs").mockReturnValue(
      Promise.resolve(ok(["test"]))
    );
    vi.spyOn(environmentManager, "getExistingNonRemoteEnvs").mockReturnValue(
      Promise.resolve(["test"])
    );

    const children = await EnvironmentTreeViewProvider.getChildren();

    assert.equal(children?.length, 2);
  });
});
