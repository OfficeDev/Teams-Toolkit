// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import path from "path";
import { assert, chai, vi } from "vitest";
import { IsDeclarativeAgentManifest } from "../../build/common/projectTypeChecker";
import {
  ProjectTypeResult,
  SPFxKey,
  TeamsfxVersionState,
  getCapabilities,
  isTypeSpecProject,
  projectTypeChecker,
} from "../../src/common/projectTypeChecker";
import { MetadataV2, MetadataV3 } from "../../src/common/versionMetadata";
import { pathUtils } from "../../src/component/utils/pathUtils";

describe("ProjectTypeChecker", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
  });
  describe("scanFolder", () => {
    it("file in ignore list", async () => {
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const callback = async (filePath: string, data: ProjectTypeResult) => {
        return true;
      };
      const res = await projectTypeChecker.scanFolder("dir", ["dir"], result, callback, 2, 0);
      assert.isTrue(res);
    });
    it("file callback return false", async () => {
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const callback = async (filePath: string, data: ProjectTypeResult) => {
        return false;
      };
      const res = await projectTypeChecker.scanFolder("dir", [], result, callback, 2, 0);
      assert.isFalse(res);
    });
    it("is dir and reach max depth", async () => {
      vi.spyOn(fs, "stat").mockResolvedValue({ isDirectory: () => true } as any);
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const callback = async (filePath: string, data: ProjectTypeResult) => {
        return true;
      };
      const res = await projectTypeChecker.scanFolder("dir", [], result, callback, 1, 1);
      assert.isTrue(res);
    });
    it("is dir and sub-call return false", async () => {
      vi.spyOn(fs, "readdir").mockResolvedValue(["sub-dir"] as any);
      vi.spyOn(fs, "stat").mockResolvedValue({ isDirectory: () => true } as any);
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      let index = 0;
      const callback = async (filePath: string, data: ProjectTypeResult) => {
        if (index === 0) {
          index++;
          return true;
        } else {
          return false;
        }
      };
      const res = await projectTypeChecker.scanFolder("dir", [], result, callback, 2, 0);
      assert.isFalse(res);
    });
    it("is dir and sub-call return true", async () => {
      vi.spyOn(fs, "readdir").mockResolvedValue(["sub-dir"] as any);
      vi.spyOn(fs, "stat").mockResolvedValue({ isDirectory: () => true } as any);
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const callback = async (filePath: string, data: ProjectTypeResult) => {
        return true;
      };
      const res = await projectTypeChecker.scanFolder("dir", ["sub-dir"], result, callback, 2, 0);
      assert.isTrue(res);
    });
  });
  describe("getCapabilities", () => {
    it("all capabilities", async () => {
      const manifest = {
        staticTabs: [1],
        configurableTabs: [1],
        bots: [1],
        composeExtensions: [1],
        extensions: [1],
        copilotExtensions: {
          plugins: [1],
          declarativeCopilots: [1],
        },
        copilotAgents: {
          plugins: [1],
          declarativeAgents: [1],
        },
      };
      const capabilities = getCapabilities(manifest);
      assert.deepEqual(capabilities, [
        "staticTab",
        "configurableTab",
        "bot",
        "composeExtension",
        "extension",
        "plugin",
        "copilotGpt",
      ]);
    });
    it("copilot agents", async () => {
      const manifest = {
        copilotAgents: {
          plugins: [1],
          declarativeAgents: [1],
        },
      };
      const capabilities = getCapabilities(manifest);
      assert.deepEqual(capabilities, ["plugin", "copilotGpt"]);
    });
    it("empty manifest", async () => {
      const manifest = {
        staticTabs: [],
        configurableTabs: [],
        bots: [],
        composeExtensions: [],
        extensions: [],
      };
      const capabilities = getCapabilities(manifest);
      assert.deepEqual(capabilities, []);
    });
    it("empty capabilities", async () => {
      const manifest = {};
      const capabilities = getCapabilities(manifest);
      assert.deepEqual(capabilities, []);
    });
  });
  describe("findManifestCallback", () => {
    it("found", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue(
        JSON.stringify({
          $schema:
            "https://developer.microsoft.com/en-us/json-schemas/teams/MicrosoftTeams.schema.json",
        }) as any
      );
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findManifestCallback("./manifest.json", result);
      assert.isFalse(res);
      assert.isTrue(result.hasTeamsManifest);
    });

    it("file name match, but schema is not correct", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify({}) as any);
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findManifestCallback("./manifest.json", result);
      assert.isTrue(res);
      assert.isFalse(result.hasTeamsManifest);
    });

    it("file name match, but throw error", async () => {
      vi.spyOn(fs, "readFile").mockRejectedValue(new Error("error"));
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findManifestCallback("./manifest.json", result);
      assert.isTrue(res);
    });
  });

  describe("findProjectLanguateCallback", () => {
    it("ts", async () => {
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findProjectLanguateCallback("./tsconfig.json", result);
      assert.isFalse(res);
      assert.deepEqual(result.lauguages, ["ts"]);
    });
    it("ts", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify({}) as any);
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findProjectLanguateCallback("./package.json", result);
      assert.isFalse(res);
      assert.deepEqual(result.lauguages, ["ts"]);
    });
    it("js", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify({}) as any);
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findProjectLanguateCallback("./package.json", result);
      assert.isFalse(res);
      assert.deepEqual(result.lauguages, ["js"]);
    });
    it("read package.json throw error", async () => {
      vi.spyOn(fs, "readFile").mockRejectedValue(new Error());
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findProjectLanguateCallback("./package.json", result);
      assert.isTrue(res);
      assert.deepEqual(result.lauguages, []);
    });

    it(".csproj", async () => {
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findProjectLanguateCallback("./abc.csproj", result);
      assert.isFalse(res);
      assert.deepEqual(result.lauguages, ["csharp"]);
    });

    it("java", async () => {
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findProjectLanguateCallback("./pom.xml", result);
      assert.isFalse(res);
      assert.deepEqual(result.lauguages, ["java"]);
    });

    it("java", async () => {
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findProjectLanguateCallback("./build.gradle", result);
      assert.isFalse(res);
      assert.deepEqual(result.lauguages, ["java"]);
    });

    it("c", async () => {
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findProjectLanguateCallback("./makefile", result);
      assert.isFalse(res);
      assert.deepEqual(result.lauguages, ["c"]);
    });

    it("python", async () => {
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findProjectLanguateCallback(
        "./requirements.txt",
        result
      );
      assert.isFalse(res);
      assert.deepEqual(result.lauguages, ["python"]);
    });

    it("python", async () => {
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findProjectLanguateCallback("./pyproject.toml", result);
      assert.isFalse(res);
      assert.deepEqual(result.lauguages, ["python"]);
    });
  });
  describe("findTeamsFxCallback", () => {
    it("isTeamsFx < v5 but invalid projectSettings.json", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJson").mockResolvedValue({
        version: "1.0.0",
        projectId: "xxx-xxx-xxx",
      });
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findTeamsFxCallback(path.resolve("./.fx"), result);
      assert.isFalse(res);
      assert.isTrue(result.isTeamsFx);
      assert.equal(result.teamsfxConfigType, MetadataV2.configFile);
      assert.equal(result.teamsfxConfigVersion, "1.0.0");
      assert.equal(result.teamsfxProjectId, "xxx-xxx-xxx");
      assert.equal(result.teamsfxVersionState, TeamsfxVersionState.Invalid);
    });
    it("isTeamsFx < v5 but version state is unsupported", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJson").mockResolvedValue({
        solutionSettings: {
          activeResourcePlugins: [],
        },
        version: "1.0.0",
        projectId: "xxx-xxx-xxx",
      });
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findTeamsFxCallback(path.resolve("./.fx"), result);
      assert.isFalse(res);
      assert.isTrue(result.isTeamsFx);
      assert.equal(result.teamsfxConfigType, MetadataV2.configFile);
      assert.equal(result.teamsfxConfigVersion, "1.0.0");
      assert.equal(result.teamsfxProjectId, "xxx-xxx-xxx");
      assert.equal(result.teamsfxVersionState, TeamsfxVersionState.Unsupported);
    });
    it("isTeamsFx < v5 but version state is upgradable", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJson").mockResolvedValue({
        solutionSettings: {
          activeResourcePlugins: [],
        },
        version: "2.1.0",
        projectId: "xxx-xxx-xxx",
      });
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findTeamsFxCallback(path.resolve("./.fx"), result);
      assert.isFalse(res);
      assert.isTrue(result.isTeamsFx);
      assert.equal(result.teamsfxConfigType, MetadataV2.configFile);
      assert.equal(result.teamsfxConfigVersion, "2.1.0");
      assert.equal(result.teamsfxProjectId, "xxx-xxx-xxx");
      assert.equal(result.teamsfxVersionState, TeamsfxVersionState.Upgradable);
    });
    it("isTeamsFx = v5 and version state unsupported", async () => {
      const mockYamlContent = `# yaml-language-server: $schema=https://aka.ms/teams-toolkit/1.0.0/yaml.schema.json
      # Visit https://aka.ms/teamsfx-v5.0-guide for details on this file
      # Visit https://aka.ms/teamsfx-actions for details on actions
      version: 2.0.0
      projectId: xxx-xxx-xxx
      `;
      vi.spyOn(fs, "readFile").mockResolvedValue(mockYamlContent as any);
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findTeamsFxCallback(
        path.join("./", MetadataV3.configFile),
        result
      );
      assert.isFalse(res);
      assert.isTrue(result.isTeamsFx);
      assert.equal(result.teamsfxConfigType, MetadataV3.configFile);
      assert.equal(result.teamsfxConfigVersion, "2.0.0");
      assert.equal(result.teamsfxProjectId, "xxx-xxx-xxx");
      assert.equal(result.teamsfxVersionState, TeamsfxVersionState.Unsupported);
    });
    it("isTeamsFx = v5", async () => {
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findTeamsFxCallback(
        path.join("./", MetadataV3.localConfigFile),
        result
      );
      assert.isTrue(res);
      assert.isTrue(result.isTeamsFx);
    });
    it("isTeamsFx = false", async () => {
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findTeamsFxCallback(path.join("./abc.json"), result);
      assert.isTrue(res);
      assert.isFalse(result.isTeamsFx);
    });
  });

  describe("findSPFxCallback", () => {
    it("not found", async () => {
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        isSPFx: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findSPFxCallback(path.join("./abc.json"), result);
      assert.isTrue(res);
      assert.isFalse(result.isSPFx);
    });
    it("found", async () => {
      vi.spyOn(fs, "readJson").mockResolvedValue({
        [SPFxKey]: "xxx-xxx-xxx",
      });
      const result: ProjectTypeResult = {
        isTeamsFx: false,
        hasTeamsManifest: false,
        dependsOnTeamsJs: false,
        isSPFx: false,
        lauguages: [],
      };
      const res = await projectTypeChecker.findSPFxCallback(path.join("./.yo-rc.json"), result);
      assert.isFalse(res);
      assert.isTrue(result.isSPFx);
    });
  });

  describe("checkProjectType", () => {
    it("has manifest and depends on teams-js", async () => {
      vi.spyOn(projectTypeChecker, "scanFolder").mockImplementation(
        async (
          currentPath: string,
          ignoreFolderName: string[],
          data: ProjectTypeResult,
          fileCallback: (filePath: string, data: ProjectTypeResult) => Promise<boolean>,
          maxDepth: number
        ) => {
          data.hasTeamsManifest = true;
          data.dependsOnTeamsJs = true;
          return true;
        }
      );

      const res = await projectTypeChecker.checkProjectType(path.join("./abc.json"));
      assert.isTrue(res.hasTeamsManifest);
      assert.isTrue(res.dependsOnTeamsJs);
    });
    it("has no manifest and not depend on teams-js", async () => {
      vi.spyOn(projectTypeChecker, "scanFolder").mockImplementation(
        async (
          currentPath: string,
          ignoreFolderName: string[],
          data: ProjectTypeResult,
          fileCallback: (filePath: string, data: ProjectTypeResult) => Promise<boolean>,
          maxDepth: number
        ) => {
          return true;
        }
      );

      const res = await projectTypeChecker.checkProjectType(path.join("./abc.json"));
      assert.isFalse(res.hasTeamsManifest);
      assert.isFalse(res.dependsOnTeamsJs);
    });
  });

  describe("isDeclarativeAgentManifest", () => {
    it("is declarative agent manifest", async () => {
      const manifest = {
        copilotAgents: {
          declarativeAgents: [{}],
        },
      };
      const isDeclarativeAgent = IsDeclarativeAgentManifest(manifest);
      assert.isTrue(isDeclarativeAgent);
    });

    it("is not declarative agent manifest", async () => {
      const manifest1 = {};
      let isDeclarativeAgent = IsDeclarativeAgentManifest(manifest1);
      assert.isFalse(isDeclarativeAgent);
      const manifest2 = {
        copilotAgents: {},
      };
      isDeclarativeAgent = IsDeclarativeAgentManifest(manifest2);
      assert.isFalse(isDeclarativeAgent);
      const manifest3 = {
        copilotAgents: {
          declarativeAgents: [],
        },
      };
      isDeclarativeAgent = IsDeclarativeAgentManifest(manifest3);
      assert.isFalse(isDeclarativeAgent);
    });
  });

  describe("isTypeSpecProject", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return true if TypeSpec project", () => {
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "readFileSync").mockReturnValue("provision: typeSpec/compile with: []");
      const result = isTypeSpecProject("test-project-path");
      chai.expect(result).to.be.true;
    });

    it("should return false if no project path", () => {
      const result = isTypeSpecProject(undefined);
      chai.expect(result).to.be.false;
    });

    it("should return false if no yaml file", () => {
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue(undefined);
      const result = isTypeSpecProject("test-project-path");
      chai.expect(result).to.be.false;
    });

    it("should return false if not TypeSpec project", () => {
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "readFileSync").mockReturnValue("provision: aadApp/create with: []");
      const result = isTypeSpecProject("test-project-path");
      chai.expect(result).to.be.false;
    });
  });
});
