// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { err, ok, UserError } from "@microsoft/teamsfx-api";
import axios from "axios";
import fs from "fs-extra";
import mockFs from "mock-fs";
import * as path from "path";
import { afterEach, beforeEach, chai, vi } from "vitest";
import { pathUtils } from "../../src";
import { GraphClient } from "../../src/client/graphClient";
import { teamsDevPortalClient } from "../../src/client/teamsDevPortalClient";
import { setTools } from "../../src/common/globalVars";
import { getProjectMetadata } from "../../src/common/projectSettingsHelper";
import * as projectTypeChecker from "../../src/common/projectTypeChecker";
import {
  getSideloadingStatus,
  getSPFxToken,
  getTypeSpecArgs,
  isSandboxedEnabled,
  isTestToolEnabledProject,
  listAllTenants,
  listDevTunnels,
  runForTypeSpecProject,
} from "../../src/common/tools";
import { NpmBuildDriver } from "../../src/component/driver/script/npmBuildDriver";
import { TypeSpecCompileDriver } from "../../src/component/driver/typeSpec/compile";
import { WrapDriverContext } from "../../src/component/driver/util/wrapUtil";
import { PackageService } from "../../src/component/m365/packageService";
import { isVideoFilterProject } from "../../src/core/middleware/videoFilterAppBlocker";
import { isUserCancelError } from "../../src/error/common";
import { MockedM365Provider, MockLogProvider, MockTools } from "../core/utils";

vi.mock("../../src/common/projectTypeChecker");

describe("tools", () => {
  describe("getSideloadingStatus()", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("sideloading enabled", async () => {
      vi.spyOn(teamsDevPortalClient, "getSideloadingStatus").mockResolvedValue(true);

      const result = await getSideloadingStatus("fake-token");

      chai.assert.isDefined(result);
      chai.assert.isTrue(result);
    });

    it("sideloading not enabled", async () => {
      vi.spyOn(teamsDevPortalClient, "getSideloadingStatus").mockResolvedValue(false);

      const result = await getSideloadingStatus("fake-token");

      chai.assert.isDefined(result);
      chai.assert.isFalse(result);
    });

    it("sideloading unknown", async () => {
      vi.spyOn(teamsDevPortalClient, "getSideloadingStatus").mockResolvedValue(undefined);

      const result = await getSideloadingStatus("fake-token");

      chai.assert.isUndefined(result);
    });

    it("error and retry", async () => {
      vi.spyOn(teamsDevPortalClient, "getSideloadingStatus").mockResolvedValue(undefined);
      const result = await getSideloadingStatus("fake-token");

      chai.assert.isUndefined(result);
    });
  });

  describe("isSandboxedEnabled", () => {
    const tokenProvider = new MockedM365Provider();

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return true when sandbox sensitivity label matches", async () => {
      vi.spyOn(GraphClient.prototype, "GetTeamsAppSettingsAsync").mockResolvedValue({
        sandboxingConfiguration: {
          isSideloadingEnabled: false,
          sensitivityLabelUsedToIdentifySandboxedContainers: "0fcfd0ff-1cda-407e-bc2b-a350307bd1d5",
        },
      });
      const res = await isSandboxedEnabled(tokenProvider);
      chai.assert.isTrue(res);
    });
  });

  describe("listAllTenants", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("returns empty for invalid token", async () => {
      const tenants = await listAllTenants("");

      chai.assert.equal(tenants.length, 0);
    });

    it("returns empty when API call failure", async () => {
      vi.spyOn(axios, "get").mockImplementation(() => {
        throw { name: 404, message: "failed" };
      });

      const tenants = await listAllTenants("faked token");

      chai.assert.equal(tenants.length, 0);
    });

    it("returns tenant list", async () => {
      const fakedTenants = {
        data: {
          value: [
            {
              tenantId: "0022fd51-06f5-4557-8a34-69be98de6e20",
              countryCode: "SG",
              displayName: "MSFT",
            },
            {
              tenantId: "313ef12c-d7cb-4f01-af90-1b113db5aa9a",
              countryCode: "CN",
              displayName: "Cisco",
            },
          ],
        },
      };
      vi.spyOn(axios, "get").mockResolvedValue(fakedTenants);

      const tenants = await listAllTenants("faked token");

      chai.assert.equal(tenants, fakedTenants.data.value);
    });
  });

  describe("getCopilotStatus", () => {
    const tools = new MockTools();
    beforeEach(() => {
      setTools(tools);
      vi.restoreAllMocks();
    });

    it("copilot status unknown", async () => {
      vi.spyOn(PackageService.GetSharedInstance(), "getCopilotStatus").mockResolvedValue(
        undefined as any
      );

      const result = await PackageService.GetSharedInstance().getCopilotStatus("fake-token");

      chai.assert.isUndefined(result);
    });
  });

  describe("getProjectMetadata", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("happy path V3", async () => {
      try {
        vi.spyOn(fs, "readFileSync").mockImplementation(() => {
          return `version: 1.0.0
projectId: 00000000-0000-0000-0000-000000000000`;
        });
        vi.spyOn(fs, "pathExistsSync").mockImplementation(() => {
          return true;
        });
        const result = getProjectMetadata("root-path");
        chai.assert.isNotEmpty(result);
        chai.assert.equal(result!.projectId, "00000000-0000-0000-0000-000000000000");
      } finally {
      }
    });

    it("project settings not exists", async () => {
      vi.spyOn(fs, "pathExistsSync").mockImplementation(() => {
        return false;
      });
      const result = getProjectMetadata("root-path");
      chai.assert.isUndefined(result);
    });

    it("throw error", async () => {
      vi.spyOn(fs, "pathExistsSync").mockImplementation(() => {
        throw new Error("new error");
      });
      const result = getProjectMetadata("root-path");
      chai.assert.isUndefined(result);
    });

    it("empty root path", async () => {
      const result = getProjectMetadata("");
      chai.assert.isUndefined(result);
    });
  });

  describe("isVideoFilterProject", async () => {
    let sandbox: any;
    const mockProjectRoot = "video-filter";
    beforeEach(() => {});
    afterEach(() => {
      vi.restoreAllMocks();
      mockFs.restore();
    });

    it("Can recognize normal video filter project", async () => {
      // Arrange
      const manifest = {
        meetingExtensionDefinition: {
          videoFiltersConfigurationUrl: "https://a.b.c/",
        },
      };
      mockFs({
        [path.join(mockProjectRoot, "appPackage", "manifest.json")]: JSON.stringify(manifest),
      });

      // Act
      const result = await isVideoFilterProject(mockProjectRoot);

      // Assert
      chai.expect(result.isOk()).to.be.true;
      chai.expect(result._unsafeUnwrap()).to.be.true;
    });

    it("Should not recognize tab project as video filter", async () => {
      // Arrange
      const manifest = {
        $schema:
          "https://developer.microsoft.com/en-us/json-schemas/teams/v1.14/MicrosoftTeams.schema.json",
        manifestVersion: "1.14",
        version: "1.0.0",
        id: "{{state.fx-resource-appstudio.teamsAppId}}",
        packageName: "com.microsoft.teams.extension",
        developer: {
          name: "Teams App, Inc.",
          websiteUrl: "https://www.example.com",
          privacyUrl: "https://www.example.com/termofuse",
          termsOfUseUrl: "https://www.example.com/privacy",
        },
        icons: {
          color: "{{config.manifest.icons.color}}",
          outline: "{{config.manifest.icons.outline}}",
        },
        name: {
          short: "{{config.manifest.appName.short}}",
          full: "{{config.manifest.appName.full}}",
        },
        description: {
          short: "{{config.manifest.description.short}}",
          full: "{{config.manifest.description.full}}",
        },
        accentColor: "#FFFFFF",
        bots: [],
        composeExtensions: [],
        configurableTabs: [
          {
            configurationUrl:
              "{{{state.fx-resource-frontend-hosting.endpoint}}}{{{state.fx-resource-frontend-hosting.indexPath}}}/config",
            canUpdateConfiguration: true,
            scopes: ["team", "groupchat"],
          },
        ],
        staticTabs: [
          {
            entityId: "index0",
            name: "Personal Tab",
            contentUrl:
              "{{{state.fx-resource-frontend-hosting.endpoint}}}{{{state.fx-resource-frontend-hosting.indexPath}}}/tab",
            websiteUrl:
              "{{{state.fx-resource-frontend-hosting.endpoint}}}{{{state.fx-resource-frontend-hosting.indexPath}}}/tab",
            scopes: ["personal"],
          },
        ],
        permissions: ["identity", "messageTeamMembers"],
        validDomains: ["{{state.fx-resource-frontend-hosting.domain}}"],
      };
      mockFs({
        [path.join(mockProjectRoot, "appPackage", "manifest.json")]: JSON.stringify(manifest),
      });

      // Act
      const result = await isVideoFilterProject(mockProjectRoot);

      // Assert
      chai.expect(result.isOk()).to.be.true;
      chai.expect(result._unsafeUnwrap()).to.be.false;
    });
  });

  describe("getSPFxToken", async () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("happy path", async () => {
      const mockTools = new MockTools();
      vi.spyOn(mockTools.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
        ok("xxx")
      );
      vi.spyOn(axios, "get").mockResolvedValue({ data: { webUrl: "122" } });
      const res = await getSPFxToken(mockTools.tokenProvider.m365TokenProvider);
    });
  });

  describe("listDevTunnels", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return an error when the API call fails", async () => {
      const token = "test-token";

      const result = await listDevTunnels(token);
      chai.assert.isTrue(result.isErr());
    });
  });

  describe("listDevTunnels using github token", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return an error when the API call fails", async () => {
      const token = "test-token";

      const result = await listDevTunnels(token, true);
      chai.assert.isTrue(result.isErr());
    });
  });

  describe("isUserCancelError()", () => {
    it("should return true if error is UserCancelError", () => {
      const error = new Error();
      error.name = "UserCancelError";
      chai.expect(isUserCancelError(error)).is.true;
    });
  });

  describe("isTestToolEnabledProject", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("should return true if test tool YAML file exists", () => {
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      const result = isTestToolEnabledProject("test-project-path");
      chai.expect(result).to.be.true;
    });

    it("should return false if test tool YAML file does not exist", () => {
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(false);
      const result = isTestToolEnabledProject("test-project-path");
      chai.expect(result).to.be.false;
    });
  });

  describe("getTypeSpecArgs", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return default args if no yaml file", () => {
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue(undefined);
      const result = getTypeSpecArgs("test-project-path");
      chai.expect(result).to.deep.equal({
        path: "./main.tsp",
        manifestPath: "./appPackage/manifest.json",
        outputDir: "./appPackage/.generated",
        typeSpecConfigPath: "./tspconfig.yaml",
      });
    });

    it("should return default args if no provision node", () => {
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "readFileSync").mockReturnValue("version: 1.0.0");
      const result = getTypeSpecArgs("test-project-path");
      chai.expect(result).to.deep.equal({
        path: "./main.tsp",
        manifestPath: "./appPackage/manifest.json",
        outputDir: "./appPackage/.generated",
        typeSpecConfigPath: "./tspconfig.yaml",
      });
    });

    it("should return default args if no tspCompileAction", () => {
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "readFileSync").mockReturnValue("provision: []");
      const result = getTypeSpecArgs("test-project-path");
      chai.expect(result).to.deep.equal({
        path: "./main.tsp",
        manifestPath: "./appPackage/manifest.json",
        outputDir: "./appPackage/.generated",
        typeSpecConfigPath: "./tspconfig.yaml",
      });
    });

    it("should return args from tspCompileAction", () => {
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "readFileSync").mockReturnValue(
        "provision:\n  - uses: typeSpec/compile\n    with:\n      path: ./custom.tsp\n      manifestPath: ./customManifest.json\n      outputDir: ./customOutputDir\n      typeSpecConfigPath: ./customTspconfig.yaml"
      );
      const result = getTypeSpecArgs("test-project-path");
      chai.expect(result).to.deep.equal({
        path: "./custom.tsp",
        manifestPath: "./customManifest.json",
        outputDir: "./customOutputDir",
        typeSpecConfigPath: "./customTspconfig.yaml",
      });
    });

    it("should return args from default if missing parameter", () => {
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "readFileSync").mockReturnValue(
        "provision:\n  - uses: typeSpec/compile\n    with:\n      path2: ./custom.tsp\n      manifestPath2: ./customManifest.json\n      outputDir2: ./customOutputDir\n      typeSpecConfigPath2: ./customTspconfig.yaml"
      );
      const result = getTypeSpecArgs("test-project-path");
      chai.expect(result).to.deep.equal({
        path: "./main.tsp",
        manifestPath: "./appPackage/manifest.json",
        outputDir: "./appPackage/.generated",
        typeSpecConfigPath: "./tspconfig.yaml",
      });
    });
  });

  describe("runForTypeSpecProject", () => {
    let mockContext: WrapDriverContext;
    beforeEach(() => {
      mockContext = {
        m365TokenProvider: new MockedM365Provider(),
        logProvider: new MockLogProvider(),
        addSummary: vi.fn(),
        summaries: [],
      } as unknown as WrapDriverContext;
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should call npm install and typeSpec compile for TypeSpec project", async () => {
      const mockProjectPath = "mock-project-path";
      const npmInstallStub = vi
        .spyOn(NpmBuildDriver.prototype, "execute")
        .mockResolvedValue({ result: ok(new Map()), summaries: [] });
      const typeSpecCompileStub = vi
        .spyOn(TypeSpecCompileDriver.prototype, "execute")
        .mockResolvedValue({ result: ok(new Map()), summaries: [] });
      vi.mocked(projectTypeChecker.isTypeSpecProject).mockReturnValue(true);
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "readFileSync").mockReturnValue(
        "provision:\n  - uses: typeSpec/compile\n    with:\n      path: ./custom.tsp\n      manifestPath: ./customManifest.json\n      outputDir: ./customOutputDir\n      typeSpecConfigPath: ./customTspconfig.yaml"
      );
      await runForTypeSpecProject(mockProjectPath, mockContext);
      chai.expect(npmInstallStub.mock.calls).lengthOf(1);
      chai.expect(typeSpecCompileStub.mock.calls).lengthOf(1);
    });

    it("should skip for not TypeSpec project", async () => {
      const mockProjectPath = "mock-project-path";
      const npmInstallStub = vi
        .spyOn(NpmBuildDriver.prototype, "execute")
        .mockResolvedValue({ result: ok(new Map()), summaries: [] });
      const typeSpecCompileStub = vi
        .spyOn(TypeSpecCompileDriver.prototype, "execute")
        .mockResolvedValue({ result: ok(new Map()), summaries: [] });
      vi.mocked(projectTypeChecker.isTypeSpecProject).mockReturnValue(false);
      await runForTypeSpecProject(mockProjectPath, mockContext);
      chai.expect(npmInstallStub.mock.calls.length === 0).to.be.true;
      chai.expect(typeSpecCompileStub.mock.calls.length === 0).to.be.true;
    });

    it("should throw error if npm install fails", async () => {
      const mockProjectPath = "mock-project-path";
      vi.mocked(projectTypeChecker.isTypeSpecProject).mockReturnValue(true);
      const typeSpecCompileStub = vi
        .spyOn(TypeSpecCompileDriver.prototype, "execute")
        .mockResolvedValue({ result: ok(new Map()), summaries: [] });
      const npmInstallStub = vi.spyOn(NpmBuildDriver.prototype, "execute").mockResolvedValue({
        result: err(new UserError("source", "NpmInstallError", "NPM install failed")),
        summaries: [],
      });
      try {
        await runForTypeSpecProject(mockProjectPath, mockContext);
      } catch (error) {
        chai.expect(error.error.name).to.equal("NpmInstallError");
      }
    });

    it("should throw error if typespec compile fails", async () => {
      const mockProjectPath = "mock-project-path";
      vi.mocked(projectTypeChecker.isTypeSpecProject).mockReturnValue(true);
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
      vi.spyOn(fs, "readFileSync").mockReturnValue(
        "provision:\n  - uses: typeSpec/compile\n    with:\n      path: ./custom.tsp\n      manifestPath: ./customManifest.json\n      outputDir: ./customOutputDir\n      typeSpecConfigPath: ./customTspconfig.yaml"
      );
      const typeSpecCompileStub = vi
        .spyOn(TypeSpecCompileDriver.prototype, "execute")
        .mockResolvedValue({
          result: err(new UserError("source", "TypeSpecCompileError", "TypeSpec compile failed")),
          summaries: [],
        });
      const npmInstallStub = vi
        .spyOn(NpmBuildDriver.prototype, "execute")
        .mockResolvedValue({ result: ok(new Map()), summaries: [] });
      try {
        await runForTypeSpecProject(mockProjectPath, mockContext);
      } catch (error) {
        chai.expect(error.error.name).to.equal("TypeSpecCompileError");
      }
    });
  });
});
