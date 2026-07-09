import * as fileSystemUtils from "../../src/utils/fileSystemUtils";
import * as mockfs from "mock-fs";
import fs from "fs-extra";
import * as globalVariables from "../../src/globalVariables";
import { Uri } from "vscode";
import { vi, expect, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";

describe("FileSystemUtils", () => {
  describe("anonymizeFilePaths()", () => {
    afterEach(() => {
      mockfs.restore();
      vi.restoreAllMocks();
    });

    it("undefined", async () => {
      const result = await fileSystemUtils.anonymizeFilePaths();
      assert.equal(result, "");
    });

    it("happy path 1", async () => {
      const result = await fileSystemUtils.anonymizeFilePaths(
        "at Object.require.extensions.<computed> [as .ts] (C:\\Users\\AppData\\Roaming\\npm\\node_modules\\ts-node\\src\\index.ts:1621:12)"
      );
      assert.equal(
        result,
        "at Object.require.extensions.<computed> [as .ts] (<REDACTED: user-file-path>/index.ts:1621:12)"
      );
    });
    it("happy path 2", async () => {
      const result = await fileSystemUtils.anonymizeFilePaths(
        "at Object.require.extensions.<computed> [as .ts] (/user/test/index.ts:1621:12)"
      );
      assert.equal(
        result,
        "at Object.require.extensions.<computed> [as .ts] (<REDACTED: user-file-path>/index.ts:1621:12)"
      );
    });
    it("happy path 3", async () => {
      const result = await fileSystemUtils.anonymizeFilePaths(
        "some user stack trace at (C:/fake_path/fake_file:1:1)"
      );
      assert.equal(result, "some user stack trace at (<REDACTED: user-file-path>/fake_file:1:1)");
    });
  });

  describe("getProvisionResultJson", () => {
    it("returns undefined if no workspace Uri", async () => {
      mockValue(globalVariables, "workspaceUri", undefined);
      const result = await fileSystemUtils.getProvisionResultJson("test");
      expect(result).equals(undefined);
    });

    it("returns undefined if is not TeamsFx project", async () => {
      mockValue(globalVariables, "workspaceUri", Uri.file("test"));
      mockValue(globalVariables, "isTeamsFxProject", false);
      const result = await fileSystemUtils.getProvisionResultJson("test");
      expect(result).deep.equals(undefined);
    });

    it("returns undefined if provision output file does not exists", async () => {
      mockValue(globalVariables, "workspaceUri", Uri.file("test"));
      mockValue(globalVariables, "isTeamsFxProject", true);
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "existsSync").mockReturnValue(false);

      const result = await fileSystemUtils.getProvisionResultJson("test");
      expect(result).equals(undefined);
    });

    it("returns provision output file result", async () => {
      const expectedResult = { test: "test" };
      mockValue(globalVariables, "workspaceUri", Uri.file("test"));
      mockValue(globalVariables, "isTeamsFxProject", true);
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readJSON").mockResolvedValue(expectedResult);

      const result = await fileSystemUtils.getProvisionResultJson("test");
      expect(result).equals(expectedResult);
    });
  });
});
