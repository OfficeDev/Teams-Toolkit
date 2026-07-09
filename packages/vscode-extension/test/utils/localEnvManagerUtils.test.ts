import { LocalEnvManager } from "@microsoft/teamsfx-core";
import * as globalVariables from "../../src/globalVariables";
import { getNpmInstallLogInfo, getTestToolLogInfo } from "../../src/utils/localEnvManagerUtils";
import { vi, expect } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";

describe("LocalEnvUtils", () => {
  it("Get NPM Install Log Info", async () => {
    const fakeNpmInstallLogInfo = {
      logFile: "NPM Install Log File",
      timestamp: new Date(),
      nodeVersion: undefined,
      npmVersion: undefined,
      cwd: undefined,
      exitCode: undefined,
      errorMessage: undefined,
    };
    vi.spyOn(LocalEnvManager.prototype, "getNpmInstallLogInfo").mockResolvedValue(
      fakeNpmInstallLogInfo
    );
    const result = await getNpmInstallLogInfo();
    expect(result).to.deep.equal(fakeNpmInstallLogInfo);
  });

  it("Get Test Tool Log Info", async () => {
    const fakeTestToolLogInfo = "Test Tool Log Info";
    mockValue(globalVariables, "workspaceUri", { fsPath: "C:\\fakePath" });
    vi.spyOn(LocalEnvManager.prototype, "getTestToolLogInfo").mockResolvedValue(
      fakeTestToolLogInfo
    );
    const result = await getTestToolLogInfo();
    expect(result).to.equal(fakeTestToolLogInfo);
  });

  it("Get Test Tool Log Info and Return Undefined", async () => {
    const fakeTestToolLogInfo = "Test Tool Log Info";
    mockValue(globalVariables, "workspaceUri", undefined);
    vi.spyOn(LocalEnvManager.prototype, "getTestToolLogInfo").mockResolvedValue(
      fakeTestToolLogInfo
    );
    const result = await getTestToolLogInfo();
    expect(result).to.be.undefined;
  });
});
