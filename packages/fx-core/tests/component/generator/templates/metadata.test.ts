// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Platform } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as path from "path";
import { featureFlagManager } from "../../../../src/common/featureFlags";
import * as templateHelper from "../../../../src/component/generator/templateHelper";
import {
  getAllTemplatesOnPlatform,
  getDefaultTemplatesOnPlatform,
} from "../../../../src/component/generator/templates/metadata";
import { Template } from "../../../../src/component/generator/templates/metadata/interface";
import * as folder from "../../../../src/folder";
import { assert, vi } from "vitest";

const mockTemplates: Template[] = [
  { id: "t1", name: "TypeScript Bot", language: "typescript", description: "A TS bot" },
  { id: "t2", name: "CSharp Bot", language: "csharp", description: "A C# bot" },
  { id: "t3", name: "JavaScript Tab", language: "javascript", description: "A JS tab" },
];

function firstCheckedPathContaining(
  pathExistsStub: ReturnType<typeof vi.spyOn>,
  fragment: string
): string {
  const checkedPath = pathExistsStub.mock.calls
    .map((call) => String(call[0]))
    .find((value) => value.includes(fragment));
  assert.isDefined(checkedPath);
  return checkedPath;
}

describe("metadata platform routing", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getAllTemplatesOnPlatform", () => {
    it("reads from vs-metadata subdir when cache exists for Platform.VS", () => {
      vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
      vi.spyOn(folder, "getTemplatesFolder").mockReturnValue("/bundled");
      const pathExistsStub = vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockTemplates));

      getAllTemplatesOnPlatform(Platform.VS);

      const checkedPath = pathExistsStub.mock.calls[0][0] as string;
      assert.include(checkedPath, "vs-metadata");
      assert.include(checkedPath, "allTemplates.json");
    });

    it("reads from metadata subdir when cache exists for Platform.VSCode", () => {
      vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
      vi.spyOn(folder, "getTemplatesFolder").mockReturnValue("/bundled");
      const pathExistsStub = vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockTemplates));

      getAllTemplatesOnPlatform(Platform.VSCode);

      const checkedPath = firstCheckedPathContaining(pathExistsStub, "allTemplates.json");
      assert.notInclude(checkedPath, "vs-metadata");
      assert.include(checkedPath, path.join(".fx", "metadata"));
      assert.include(checkedPath, "allTemplates.json");
    });

    it("reads from metadata subdir when cache exists for Platform.CLI", () => {
      vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
      vi.spyOn(folder, "getTemplatesFolder").mockReturnValue("/bundled");
      const pathExistsStub = vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockTemplates));

      getAllTemplatesOnPlatform(Platform.CLI);

      const checkedPath = pathExistsStub.mock.calls[0][0] as string;
      assert.notInclude(checkedPath, "vs-metadata");
    });

    it("falls back to bundled path when cache does not exist", () => {
      vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
      vi.spyOn(folder, "getTemplatesFolder").mockReturnValue(path.resolve("/bundled"));
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(false);
      const readFileSyncStub = vi
        .spyOn(fs, "readFileSync")
        .mockReturnValue(JSON.stringify(mockTemplates));

      getAllTemplatesOnPlatform(Platform.VS);

      const readPath = readFileSyncStub.mock.calls[0][0] as string;
      assert.include(readPath, path.join("metadata", "allTemplates.json"));
    });

    it("falls back to bundled path when useLocalTemplate is true", () => {
      vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(true);
      vi.spyOn(folder, "getTemplatesFolder").mockReturnValue(path.resolve("/bundled"));
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      const readFileSyncStub = vi
        .spyOn(fs, "readFileSync")
        .mockReturnValue(JSON.stringify(mockTemplates));

      getAllTemplatesOnPlatform(Platform.VS);

      const readPath = readFileSyncStub.mock.calls[0][0] as string;
      assert.include(readPath, path.join("metadata", "allTemplates.json"));
    });

    it("falls back to bundled path when v4 channel forces bundled metadata even if cache exists", () => {
      vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
      vi.spyOn(fs, "pathExistsSync").mockImplementation((p: fs.PathLike) => {
        const value = String(p);
        // Simulate v4 channel with no downloaded v4 cache marker.
        if (value.endsWith("template-version-v4.txt")) {
          return false;
        }
        return true;
      });
      const readFileSyncStub = vi
        .spyOn(fs, "readFileSync")
        .mockReturnValue(JSON.stringify(mockTemplates));

      getAllTemplatesOnPlatform(Platform.VSCode);

      const readPath = readFileSyncStub.mock.calls[0][0] as string;
      assert.notInclude(readPath, ".fx");
      assert.include(readPath, path.join("metadata", "allTemplates.json"));
    });

    it("keeps reading the VS cache even when v4 channel forces bundled metadata", () => {
      vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
      vi.spyOn(templateHelper, "useBundledMetadataForV4").mockReturnValue(true);
      vi.spyOn(folder, "getTemplatesFolder").mockReturnValue("/bundled");
      const pathExistsStub = vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockTemplates));

      getAllTemplatesOnPlatform(Platform.VS);

      // The v4 migration covers only VSC/CLI; VS keeps its v3 vs-metadata cache.
      const checkedPath = pathExistsStub.mock.calls[0][0] as string;
      assert.include(checkedPath, "vs-metadata");
    });

    it("returns only csharp templates for Platform.VS", () => {
      vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
      vi.spyOn(folder, "getTemplatesFolder").mockReturnValue("/bundled");
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockTemplates));

      const result = getAllTemplatesOnPlatform(Platform.VS);

      assert.deepEqual(result, [mockTemplates[1]]);
    });

    it("returns only non-csharp templates for Platform.VSCode", () => {
      vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
      vi.spyOn(folder, "getTemplatesFolder").mockReturnValue("/bundled");
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockTemplates));

      const result = getAllTemplatesOnPlatform(Platform.VSCode);

      assert.deepEqual(result, [mockTemplates[0], mockTemplates[2]]);
    });

    it("returns all templates for Platform.CLI", () => {
      vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
      vi.spyOn(folder, "getTemplatesFolder").mockReturnValue("/bundled");
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockTemplates));

      const result = getAllTemplatesOnPlatform(Platform.CLI);

      assert.deepEqual(result, mockTemplates);
    });

    it("returns empty array for unknown platform", () => {
      vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
      vi.spyOn(folder, "getTemplatesFolder").mockReturnValue("/bundled");
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockTemplates));

      const result = getAllTemplatesOnPlatform("unknown" as Platform);

      assert.deepEqual(result, []);
    });
  });

  describe("getDefaultTemplatesOnPlatform", () => {
    it("reads from vs-metadata subdir when cache exists for Platform.VS", () => {
      vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
      vi.spyOn(folder, "getTemplatesFolder").mockReturnValue("/bundled");
      const pathExistsStub = vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockTemplates));

      getDefaultTemplatesOnPlatform(Platform.VS);

      const checkedPath = pathExistsStub.mock.calls[0][0] as string;
      assert.include(checkedPath, "vs-metadata");
      assert.include(checkedPath, "defaultGeneratorTemplates.json");
    });

    it("reads from metadata subdir when cache exists for Platform.VSCode", () => {
      vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
      vi.spyOn(folder, "getTemplatesFolder").mockReturnValue("/bundled");
      const pathExistsStub = vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockTemplates));

      getDefaultTemplatesOnPlatform(Platform.VSCode);

      const checkedPath = firstCheckedPathContaining(
        pathExistsStub,
        "defaultGeneratorTemplates.json"
      );
      assert.notInclude(checkedPath, "vs-metadata");
      assert.include(checkedPath, "defaultGeneratorTemplates.json");
    });

    it("returns only csharp templates for Platform.VS", () => {
      vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
      vi.spyOn(folder, "getTemplatesFolder").mockReturnValue("/bundled");
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockTemplates));

      const result = getDefaultTemplatesOnPlatform(Platform.VS);

      assert.deepEqual(result, [mockTemplates[1]]);
    });

    it("returns only non-csharp templates for Platform.VSCode", () => {
      vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
      vi.spyOn(folder, "getTemplatesFolder").mockReturnValue("/bundled");
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockTemplates));

      const result = getDefaultTemplatesOnPlatform(Platform.VSCode);

      assert.deepEqual(result, [mockTemplates[0], mockTemplates[2]]);
    });

    it("returns all templates for Platform.CLI", () => {
      vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
      vi.spyOn(folder, "getTemplatesFolder").mockReturnValue("/bundled");
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockTemplates));

      const result = getDefaultTemplatesOnPlatform(Platform.CLI);

      assert.deepEqual(result, mockTemplates);
    });

    it("returns empty array for unknown platform", () => {
      vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
      vi.spyOn(folder, "getTemplatesFolder").mockReturnValue("/bundled");
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockTemplates));

      const result = getDefaultTemplatesOnPlatform("unknown" as Platform);

      assert.deepEqual(result, []);
    });
  });
});

describe("useBundledMetadataForV4", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when the v4 flag is off", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    const pathExistsStub = vi.spyOn(fs, "pathExistsSync").mockReturnValue(false);

    assert.isFalse(templateHelper.useBundledMetadataForV4());
    // Short-circuits before touching the filesystem.
    assert.isFalse(pathExistsStub.mock.calls.length > 0);
  });

  it("returns false (read the downloaded v4 cache) when the v4 version file exists", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
    const pathExistsStub = vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);

    assert.isFalse(templateHelper.useBundledMetadataForV4());
    const checkedPath = pathExistsStub.mock.calls[0][0] as string;
    assert.include(checkedPath, "template-version-v4.txt");
  });

  it("returns true (read bundled) when the v4 version file is absent", () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(false);

    assert.isTrue(templateHelper.useBundledMetadataForV4());
  });
});
