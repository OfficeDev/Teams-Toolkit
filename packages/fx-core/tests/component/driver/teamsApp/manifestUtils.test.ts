import {
  err,
  IBot,
  InputsWithProjectPath,
  ManifestCapability,
  ok,
  Platform,
  TeamsAppManifest,
  UserError,
} from "@microsoft/teamsfx-api";
import { assert } from "chai";
import fs from "fs-extra";
import mockedEnv, { RestoreFn } from "mocked-env";
import os from "os";
import path from "path";
import * as sinon from "sinon";
import {
  getBotsTplBasedOnVersion,
  getBotsTplExistingAppBasedOnVersion,
  getBotsTplForCommandAndResponseBasedOnVersion,
  getBotsTplForNotificationBasedOnVersion,
  getConfigurableTabsTplBasedOnVersion,
  getConfigurableTabsTplExistingAppBasedOnVersion,
} from "../../../../src/component/driver/teamsApp/constants";
import { AppStudioError } from "../../../../src/component/driver/teamsApp/errors";
import {
  manifestUtils,
  ManifestUtils,
  manifestUtilsDeps,
  SharePointAppId,
} from "../../../../src/component/driver/teamsApp/utils/ManifestUtils";
import { FileNotFoundError, JSONSyntaxError, ReadFileError } from "../../../../src/error";

const latestManifestVersion = "1.17";
const oldManifestVersion = "1.16";

describe("ManifestUtils", () => {
  let manifestUtils: ManifestUtils;

  beforeEach(() => {
    manifestUtils = new ManifestUtils();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should add a staticTab capability", async () => {
    mockInputManifestFile(manifestUtils, latestManifestVersion);
    sinon.stub(fs, "writeFile").callsFake((path: any, data: string) => {
      const writtenManifest = JSON.parse(data) as TeamsAppManifest;
      assert.isArray(writtenManifest.staticTabs);
      assert.isNotEmpty(writtenManifest.staticTabs);
      return Promise.resolve();
    });
    const inputs: InputsWithProjectPath = {
      projectPath: "path/to/project",
      addManifestPath: "path/to/manifest.json",
      platform: Platform.CLI,
    };
    const capabilities: ManifestCapability[] = [{ name: "staticTab" }];
    const result = await manifestUtils.addCapabilities(inputs, capabilities);
    assert.isTrue(result.isOk());
  });
  it("should add a configurable tabs capability", async () => {
    mockInputManifestFile(manifestUtils, latestManifestVersion);
    sinon.stub(fs, "writeFile").callsFake((path: any, data: string) => {
      const writtenManifest = JSON.parse(data) as TeamsAppManifest;
      assert.isArray(writtenManifest.configurableTabs);
      assert.isNotEmpty(writtenManifest.configurableTabs);
      assert.deepEqual(
        writtenManifest.configurableTabs![0].scopes,
        getConfigurableTabsTplBasedOnVersion(writtenManifest.manifestVersion)[0].scopes
      );
      return Promise.resolve();
    });
    const inputs: InputsWithProjectPath = {
      projectPath: "path/to/project",
      addManifestPath: "path/to/manifest.json",
      platform: Platform.CLI,
    };
    const capabilities: ManifestCapability[] = [{ name: "configurableTab" }];
    const result = await manifestUtils.addCapabilities(inputs, capabilities);
    assert.isTrue(result.isOk());
  });
  it("should add a configurable tabs capability - exceed limit", async () => {
    mockInputManifestFileExceedLimit(manifestUtils, latestManifestVersion);
    const inputs: InputsWithProjectPath = {
      projectPath: "path/to/project",
      addManifestPath: "path/to/manifest.json",
      platform: Platform.CLI,
    };
    const capabilities: ManifestCapability[] = [{ name: "configurableTab" }];
    const result = await manifestUtils.addCapabilities(inputs, capabilities);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.isTrue(result.error.name.includes(AppStudioError.CapabilityExceedLimitError.name));
    }
  });
  it("should add a configurable tabs capability - existing app", async () => {
    mockInputManifestFile(manifestUtils, latestManifestVersion);
    sinon.stub(fs, "writeFile").callsFake((path: any, data: string) => {
      const writtenManifest = JSON.parse(data) as TeamsAppManifest;
      assert.isArray(writtenManifest.configurableTabs);
      assert.isNotEmpty(writtenManifest.configurableTabs);
      assert.deepEqual(
        writtenManifest.configurableTabs![0].scopes,
        getConfigurableTabsTplExistingAppBasedOnVersion(writtenManifest.manifestVersion)[0].scopes
      );
      return Promise.resolve();
    });
    const inputs: InputsWithProjectPath = {
      projectPath: "path/to/project",
      addManifestPath: "path/to/manifest.json",
      platform: Platform.CLI,
    };
    const capabilities: ManifestCapability[] = [{ name: "configurableTab", existingApp: true }];
    const result = await manifestUtils.addCapabilities(inputs, capabilities);
    assert.isTrue(result.isOk());
  });
  it("should add a configurable tabs capability - old version", async () => {
    mockInputManifestFile(manifestUtils, oldManifestVersion);
    sinon.stub(fs, "writeFile").callsFake((path: any, data: string) => {
      const writtenManifest = JSON.parse(data) as TeamsAppManifest;
      assert.isArray(writtenManifest.configurableTabs);
      assert.isNotEmpty(writtenManifest.configurableTabs);
      assert.deepEqual(
        writtenManifest.configurableTabs![0].scopes,
        getConfigurableTabsTplBasedOnVersion(writtenManifest.manifestVersion)[0].scopes
      );
      return Promise.resolve();
    });
    const inputs: InputsWithProjectPath = {
      projectPath: "path/to/project",
      addManifestPath: "path/to/manifest.json",
      platform: Platform.CLI,
    };
    const capabilities: ManifestCapability[] = [{ name: "configurableTab" }];
    const result = await manifestUtils.addCapabilities(inputs, capabilities);
    assert.isTrue(result.isOk());
  });
  it("should add a bot capability", async () => {
    mockInputManifestFile(manifestUtils, latestManifestVersion);
    sinon.stub(fs, "writeFile").callsFake((path: any, data: string) => {
      const writtenManifest = JSON.parse(data) as TeamsAppManifest;
      assert.isArray(writtenManifest.bots);
      assert.isNotEmpty(writtenManifest.bots);
      assert.deepEqual(
        writtenManifest.bots![0].scopes,
        getBotsTplBasedOnVersion(writtenManifest.manifestVersion)[0].scopes
      );
      return Promise.resolve();
    });
    const inputs: InputsWithProjectPath = {
      projectPath: "path/to/project",
      addManifestPath: "path/to/manifest.json",
      platform: Platform.CLI,
    };
    const capabilities: ManifestCapability[] = [{ name: "Bot" }];
    const result = await manifestUtils.addCapabilities(inputs, capabilities);
    assert.isTrue(result.isOk());
  });
  it("should add a bot capability - snippet", async () => {
    mockInputManifestFile(manifestUtils, latestManifestVersion);
    const snippet: IBot = {
      botId: "test",
      scopes: ["personal"],
    };
    sinon.stub(fs, "writeFile").callsFake((path: any, data: string) => {
      const writtenManifest = JSON.parse(data) as TeamsAppManifest;
      assert.isArray(writtenManifest.bots);
      assert.isNotEmpty(writtenManifest.bots);
      assert.deepEqual(writtenManifest.bots![0], snippet);
      return Promise.resolve();
    });
    const inputs: InputsWithProjectPath = {
      projectPath: "path/to/project",
      addManifestPath: "path/to/manifest.json",
      platform: Platform.CLI,
    };
    const capabilities: ManifestCapability[] = [{ name: "Bot", snippet: snippet }];
    const result = await manifestUtils.addCapabilities(inputs, capabilities);
    assert.isTrue(result.isOk());
  });
  it("should add a bot capability - existing app", async () => {
    mockInputManifestFile(manifestUtils, latestManifestVersion);
    sinon.stub(fs, "writeFile").callsFake((path: any, data: string) => {
      const writtenManifest = JSON.parse(data) as TeamsAppManifest;
      assert.isArray(writtenManifest.bots);
      assert.isNotEmpty(writtenManifest.bots);
      assert.deepEqual(
        writtenManifest.bots![0].scopes,
        getBotsTplExistingAppBasedOnVersion(writtenManifest.manifestVersion)[0].scopes
      );
      return Promise.resolve();
    });
    const inputs: InputsWithProjectPath = {
      projectPath: "path/to/project",
      addManifestPath: "path/to/manifest.json",
      platform: Platform.CLI,
    };
    const capabilities: ManifestCapability[] = [{ name: "Bot", existingApp: true }];
    const result = await manifestUtils.addCapabilities(inputs, capabilities);
    assert.isTrue(result.isOk());
  });
  it("should add a bot capability - command bot", async () => {
    mockInputManifestFile(manifestUtils, latestManifestVersion);
    sinon.stub(fs, "writeFile").callsFake((path: any, data: string) => {
      const writtenManifest = JSON.parse(data) as TeamsAppManifest;
      assert.isArray(writtenManifest.bots);
      assert.isNotEmpty(writtenManifest.bots);
      assert.deepEqual(
        writtenManifest.bots![0].scopes,
        getBotsTplForCommandAndResponseBasedOnVersion(writtenManifest.manifestVersion)[0].scopes
      );
      assert.deepEqual(
        writtenManifest.bots![0].commandLists,
        getBotsTplForCommandAndResponseBasedOnVersion(writtenManifest.manifestVersion)[0]
          .commandLists
      );
      return Promise.resolve();
    });
    const inputs: InputsWithProjectPath = {
      projectPath: "path/to/project",
      addManifestPath: "path/to/manifest.json",
      platform: Platform.CLI,
      features: "command-bot",
    };
    const capabilities: ManifestCapability[] = [{ name: "Bot" }];
    const result = await manifestUtils.addCapabilities(inputs, capabilities);
    assert.isTrue(result.isOk());
  });
  it("should add a bot capability - notification bot", async () => {
    mockInputManifestFile(manifestUtils, latestManifestVersion);
    sinon.stub(fs, "writeFile").callsFake((path: any, data: string) => {
      const writtenManifest = JSON.parse(data) as TeamsAppManifest;
      assert.isArray(writtenManifest.bots);
      assert.isNotEmpty(writtenManifest.bots);
      assert.deepEqual(
        writtenManifest.bots![0].scopes,
        getBotsTplForNotificationBasedOnVersion(writtenManifest.manifestVersion)[0].scopes
      );
      assert.deepEqual(
        writtenManifest.bots![0].commandLists,
        getBotsTplForNotificationBasedOnVersion(writtenManifest.manifestVersion)[0].commandLists
      );
      return Promise.resolve();
    });
    const inputs: InputsWithProjectPath = {
      projectPath: "path/to/project",
      addManifestPath: "path/to/manifest.json",
      platform: Platform.CLI,
      features: "notification",
    };
    const capabilities: ManifestCapability[] = [{ name: "Bot" }];
    const result = await manifestUtils.addCapabilities(inputs, capabilities);
    assert.isTrue(result.isOk());
  });
  it("getPluginFilePath success", async () => {
    const mockManifest = {
      copilotAgents: {
        plugins: [
          {
            id: "id-fake",
            file: "fake",
          },
        ],
      },
    };
    sinon.stub(manifestUtils, "_readAppManifest").resolves(ok(mockManifest as any));
    sinon.stub(fs, "pathExists").resolves(true);
    const res = await manifestUtils.getPluginFilePath(mockManifest as any, "fake");
    assert.isTrue(res.isOk());
  });
  it("getPluginFilePath error 1", async () => {
    const mockManifest = {};
    sinon.stub(manifestUtils, "_readAppManifest").resolves(ok(mockManifest as any));
    const res = await manifestUtils.getPluginFilePath(mockManifest as any, "fake");
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof UserError);
    }
  });
  it("getPluginFilePath error 2", async () => {
    const mockManifest = {
      copilotAgents: {},
    };
    sinon.stub(manifestUtils, "_readAppManifest").resolves(ok(mockManifest as any));
    const res = await manifestUtils.getPluginFilePath(mockManifest as any, "fake");
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof UserError);
    }
  });
  it("getPluginFilePath error 3", async () => {
    const mockManifest = {
      copilotAgents: {
        plugins: [],
      },
    };
    sinon.stub(manifestUtils, "_readAppManifest").resolves(ok(mockManifest as any));
    const res = await manifestUtils.getPluginFilePath(mockManifest as any, "fake");
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof UserError);
    }
  });
  it("getPluginFilePath error 4", async () => {
    const mockManifest = {
      copilotAgents: {
        plugins: [undefined],
      },
    };
    sinon.stub(manifestUtils, "_readAppManifest").resolves(ok(mockManifest as any));
    const res = await manifestUtils.getPluginFilePath(mockManifest as any, "fake");
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof UserError);
    }
  });
  it("getPluginFilePath error 5", async () => {
    const mockManifest = {
      copilotExtensions: {},
    };
    sinon.stub(manifestUtils, "_readAppManifest").resolves(ok(mockManifest as any));
    const res = await manifestUtils.getPluginFilePath(mockManifest as any, "fake");
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof UserError);
    }
  });
  it("getPluginFilePath error 6", async () => {
    const mockManifest = {
      copilotExtensions: {
        plugins: [],
      },
    };
    sinon.stub(manifestUtils, "_readAppManifest").resolves(ok(mockManifest as any));
    const res = await manifestUtils.getPluginFilePath(mockManifest as any, "fake");
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof UserError);
    }
  });
});

function mockInputManifestFile(manifestUtils: ManifestUtils, manifestVersion: string) {
  const mockManifest: TeamsAppManifest = {
    $schema:
      "https://developer.microsoft.com/en-us/json-schemas/teams/v1.17/MicrosoftTeams.schema.json",
    manifestVersion: manifestVersion,
    version: "1.0.0",
    id: "test-id",
    developer: {
      name: "Test Name",
      websiteUrl: "https://your-website.com",
      privacyUrl: "https://your-privacy-url.com",
      termsOfUseUrl: "https://your-terms-of-use-url.com",
    },
    name: { short: "Test App Name" },
    description: { short: "Test app description" },
    icons: {
      color: "https://your-app-color-icon.png",
      outline: "https://your-app-outline-icon.png",
    },
    accentColor: "#FFFFFF",
  };
  sinon.stub(manifestUtils, "_readAppManifest").resolves(ok(mockManifest));
}

function mockInputManifestFileExceedLimit(manifestUtils: ManifestUtils, manifestVersion: string) {
  const mockManifest: TeamsAppManifest = {
    $schema:
      "https://developer.microsoft.com/en-us/json-schemas/teams/v1.17/MicrosoftTeams.schema.json",
    manifestVersion: manifestVersion,
    version: "1.0.0",
    id: "test-id",
    developer: {
      name: "Test Name",
      websiteUrl: "https://your-website.com",
      privacyUrl: "https://your-privacy-url.com",
      termsOfUseUrl: "https://your-terms-of-use-url.com",
    },
    name: { short: "Test App Name" },
    description: { short: "Test app description" },
    icons: {
      color: "https://your-app-color-icon.png",
      outline: "https://your-app-outline-icon.png",
    },
    accentColor: "#FFFFFF",
    configurableTabs: [
      {
        configurationUrl: "https://test.com",
        scopes: ["team"],
      },
    ],
  };
  sinon.stub(manifestUtils, "_readAppManifest").resolves(ok(mockManifest));
}

describe("readAppManifestSync", () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => {
    sandbox.restore();
  });

  it("Success", () => {
    const teamsManifest = new TeamsAppManifest();
    sandbox.stub(fs, "existsSync").callsFake(() => {
      return true;
    });
    sandbox.stub(fs, "readFileSync").returns(JSON.stringify(teamsManifest));

    const res = manifestUtils.readAppManifestSync("projectPath");
    assert.isTrue(res.isOk());
  });

  it("Return false if cannot find the manifest", () => {
    sandbox.stub(fs, "existsSync").returns(false);

    const res = manifestUtils.readAppManifestSync("projectPath");
    assert.isTrue(res.isErr() && res.error instanceof FileNotFoundError);
  });

  it("Return false if pasring json failed", () => {
    sandbox.stub(fs, "existsSync").returns(true);
    sandbox.stub(fs, "readFileSync").returns("");

    const res = manifestUtils.readAppManifestSync("projectPath");
    assert.isTrue(res.isErr() && res.error instanceof JSONSyntaxError);
  });

  it("Return false if read file failed", () => {
    sandbox.stub(fs, "existsSync").returns(true);
    sandbox.stub(fs, "readFileSync").throws("error");

    const res = manifestUtils.readAppManifestSync("projectPath");
    assert.isTrue(res.isErr() && res.error instanceof ReadFileError);
  });
});

describe("getTeamsAppManifestPath", () => {
  const sandbox = sinon.createSandbox();
  const projectPath = "projectPath";

  afterEach(() => {
    sandbox.restore();
  });

  it("return manifest path under appManifest", () => {
    sandbox.stub(fs, "existsSync").returns(true);
    const res = manifestUtils.getTeamsAppManifestPath(projectPath);
    assert.equal(res, path.join(projectPath, "appManifest", "manifest.json"));
  });

  it("return manifest path under root directory", () => {
    sandbox.stub(fs, "existsSync").callsFake((inputPath) => {
      if (inputPath === path.join(projectPath, "appManifest", "manifest.json")) {
        return false;
      }
      return true;
    });
    const res = manifestUtils.getTeamsAppManifestPath(projectPath);
    assert.equal(res, path.join(projectPath, "manifest.json"));
  });

  it("return manifest path under appPackage", () => {
    sandbox.stub(fs, "existsSync").returns(false);
    const res = manifestUtils.getTeamsAppManifestPath(projectPath);
    assert.equal(res, path.join(projectPath, "appPackage", "manifest.json"));
  });
});

describe("trimManifestShortName", () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => {
    sandbox.restore();
  });

  it("Success", async () => {
    const teamsManifest = new TeamsAppManifest();
    teamsManifest.name.short = "shortname abcdefghijklmn123456${{APP_NAME_SUFFIX}}";
    sandbox.stub(fs, "readJson").resolves(teamsManifest);
    sandbox.stub(fs, "writeFile").resolves();
    sandbox.stub(fs, "pathExistsSync").returns(true);
    const res = await manifestUtils.trimManifestShortName("projectPath");
    assert.isTrue(res.isOk());
    assert.equal(teamsManifest.name.short, "shortnameabcdefghijklmn12${{APP_NAME_SUFFIX}}");
  });
  it("Success no suffix", async () => {
    const teamsManifest = new TeamsAppManifest();
    teamsManifest.name.short = "shortname abcdefghijklmn123456";
    sandbox.stub(fs, "readJson").resolves(teamsManifest);
    sandbox.stub(fs, "writeFile").resolves();
    sandbox.stub(fs, "pathExistsSync").returns(true);
    const res = await manifestUtils.trimManifestShortName("projectPath");
    assert.isTrue(res.isOk());
    assert.equal(teamsManifest.name.short, "shortnameabcdefghijklmn12");
  });
  it("No need to trim", async () => {
    const teamsManifest = new TeamsAppManifest();
    teamsManifest.name.short = "shortname abcdefghijklmn${{APP_NAME_SUFFIX}}";
    const readJsonStub = sandbox.stub(fs, "readJson").resolves(teamsManifest);
    const writeFileStub = sandbox.stub(fs, "writeFile").resolves();
    sandbox.stub(fs, "pathExistsSync").returns(true);
    const res = await manifestUtils.trimManifestShortName("projectPath");
    assert.isTrue(res.isOk());
    assert.isTrue(readJsonStub.calledOnce);
    assert.isTrue(writeFileStub.notCalled);
    assert.equal(teamsManifest.name.short, "shortname abcdefghijklmn${{APP_NAME_SUFFIX}}");
  });
  it("No manifest", async () => {
    const teamsManifest = new TeamsAppManifest();
    teamsManifest.name.short = "shortname abcdefghijklmn${{APP_NAME_SUFFIX}}";
    const readJsonStub = sandbox.stub(fs, "readJson").resolves(teamsManifest);
    const writeFileStub = sandbox.stub(fs, "writeFile").resolves();
    sandbox.stub(fs, "pathExistsSync").returns(false);
    const res = await manifestUtils.trimManifestShortName("projectPath");
    assert.isTrue(res.isOk());
    assert.isTrue(readJsonStub.notCalled);
    assert.isTrue(writeFileStub.notCalled);
  });
  it("Skips paths in temp directory", async () => {
    const teamsManifest = new TeamsAppManifest();
    teamsManifest.name.short = "shortname abcdefghijklmnopqrstuvwxyz${{APP_NAME_SUFFIX}}";
    const readJsonStub = sandbox.stub(fs, "readJson").resolves(teamsManifest);
    const writeFileStub = sandbox.stub(fs, "writeFile").resolves();
    const pathExistsSyncStub = sandbox.stub(fs, "pathExistsSync").returns(true);
    const tempManifestPath = path.join(
      os.tmpdir(),
      `test-manifest-${Date.now()}`,
      "appManifest",
      "manifest.json"
    );
    sandbox.stub(manifestUtils, "getTeamsAppManifestPath").returns(tempManifestPath);

    const res = await manifestUtils.trimManifestShortName("/some/project/path");
    assert.isTrue(res.isOk());
    assert.isTrue(pathExistsSyncStub.notCalled);
    assert.isTrue(readJsonStub.notCalled);
    assert.isTrue(writeFileStub.notCalled);
  });
});

describe("resolveLocFile", () => {
  const sandbox = sinon.createSandbox();
  let mockedEnvRestore: RestoreFn;

  afterEach(() => {
    if (mockedEnvRestore) {
      mockedEnvRestore();
    }
    sandbox.restore();
  });

  it("returns error when loc file doesn't exist", async () => {
    sandbox.stub(fs, "pathExists").resolves(false);

    const locFile = await manifestUtils.resolveLocFile("loc_file_path");

    assert.isTrue(locFile.isErr());
    if (locFile.isErr()) {
      assert.equal(locFile.error.name, "FileNotFoundError");
    }
  });

  it("returns error when there're unresolved env variables", async () => {
    sandbox.stub(fs, "pathExists").resolves(true);
    const fakedLocManifest = new TeamsAppManifest();
    fakedLocManifest.name.short = "shortname ${{APP_NAME_SUFFIX}}";
    sandbox.stub(fs, "readFile").resolves(JSON.stringify(fakedLocManifest) as any);

    const locFile = await manifestUtils.resolveLocFile("loc_file_path");

    assert.isTrue(locFile.isErr());
    if (locFile.isErr()) {
      assert.equal(locFile.error.name, "MissingEnvironmentVariablesError");
    }
  });

  it("happy pass", async () => {
    sandbox.stub(fs, "pathExists").resolves(true);
    const fakedLocManifest = new TeamsAppManifest();
    fakedLocManifest.name.short = "shortname ${{APP_NAME_SUFFIX}}";
    mockedEnvRestore = mockedEnv({
      ["APP_NAME_SUFFIX"]: "- hello world",
    });
    sandbox.stub(fs, "readFile").resolves(JSON.stringify(fakedLocManifest) as any);

    const locFile = await manifestUtils.resolveLocFile("loc_file_path");

    assert.isTrue(locFile.isOk());
    if (locFile.isOk()) {
      assert.equal(
        (JSON.parse(locFile.value) as TeamsAppManifest).name.short,
        "shortname - hello world"
      );
    }
  });

  it("resolves $[file(...)] when context is provided", async () => {
    sandbox.stub(fs, "pathExists").callsFake(async (filePath) => {
      return filePath === "loc_file_path" || filePath === "instruction.txt";
    });
    sandbox.stub(fs, "readFile").callsFake(((filePath: number | fs.PathLike) => {
      if (filePath === "loc_file_path") {
        return Promise.resolve(
          JSON.stringify({
            name: {
              short: "$[file('instruction.txt')]",
            },
          })
        );
      }
      return Promise.resolve("localized short name");
    }) as any);

    const context: any = {
      platform: Platform.VSCode,
      logProvider: {
        error: () => {},
      },
      telemetryReporter: {
        sendTelemetryEvent: () => {},
      },
    };

    const locFile = await manifestUtils.resolveLocFile("loc_file_path", context);

    assert.isTrue(locFile.isOk());
    if (locFile.isOk()) {
      assert.equal(
        (JSON.parse(locFile.value) as TeamsAppManifest).name.short,
        "localized short name"
      );
    }
  });

  it("returns expansion error when $[file(...)] resolution fails", async () => {
    sandbox.stub(fs, "pathExists").resolves(true);
    sandbox.stub(fs, "readFile").resolves(
      JSON.stringify({
        name: {
          short: "$[file('instruction.txt')]",
        },
      }) as any
    );

    const expansionError = new UserError("source", "name", "message");
    sandbox.stub(manifestUtilsDeps, "expandVariableWithFunction").resolves(err(expansionError));

    const context: any = {
      platform: Platform.VSCode,
      logProvider: {
        error: () => {},
      },
      telemetryReporter: {
        sendTelemetryEvent: () => {},
      },
    };

    const locFile = await manifestUtils.resolveLocFile("loc_file_path", context);

    assert.isTrue(locFile.isErr());
    if (locFile.isErr()) {
      assert.equal(locFile.error, expansionError);
    }
  });
});

describe("parseCommonTelemetryProperties", () => {
  it("parseCommonTelemetryProperties", async () => {
    const json = {
      $schema:
        "https://developer.microsoft.com/en-us/json-schemas/teams/v1.19/MicrosoftTeams.schema.json",
      manifestVersion: "1.19",
      version: "1.0",
      id: "${{TEAMS_APP_ID}}",
      developer: {
        name: "Teams App, Inc.",
        websiteUrl: "https://www.example.com",
        privacyUrl: "https://www.example.com/privacy",
        termsOfUseUrl: "https://www.example.com/termofuse",
      },
      icons: {
        color: "color.png",
        outline: "outline.png",
      },
      name: {
        short: "huajiecea040906${{APP_NAME_SUFFIX}}",
        full: "full name for huajiecea040906",
      },
      description: {
        short: "Repair Service",
        full: "A simple service to manage repairs",
      },
      accentColor: "#FFFFFF",
      bots: [
        {
          botId: "${{BOT_ID}}",
          scopes: ["personal", "team", "groupChat"],
          supportsFiles: false,
          isNotificationOnly: false,
          commandLists: [
            {
              scopes: ["personal"],
              commands: [
                {
                  title: "List all repairs without auth",
                  description: "List all repairs without auth",
                },
              ],
            },
          ],
        },
      ],
      composeExtensions: [],
      configurableTabs: [],
      staticTabs: [],
      permissions: ["identity", "messageTeamMembers"],
      validDomains: [],
    };
    const res = manifestUtils.parseCommonTelemetryProperties(json as any);
    assert.deepEqual(res, {
      id: "${{TEAMS_APP_ID}}",
      version: "1.0",
      capabilities: "Bot",
      manifestVersion: "1.19",
      isApiME: false,
      isSPFx: false,
      isApiMeAAD: false,
    } as any);
  });
});

describe("parseCommonProperties", () => {
  const sandbox = sinon.createSandbox();
  afterEach(() => {
    sandbox.restore();
  });
  it("happy", async () => {
    const manifest: any = {
      id: "mockid",
      version: "1.0.0",
      manifestVersion: "1.14",
      configurableTabs: [{}],
      webApplicationInfo: {
        id: SharePointAppId,
      },
      composeExtensions: [
        {
          composeExtensionType: "apiBased",
          authorization: {
            authType: "microsoftEntra",
          },
        },
      ],
      copilotAgents: {
        plugins: [
          {
            file: "xxx",
          },
        ],
        declarativeAgents: [{}],
      },
    };
    const res = manifestUtils.parseCommonProperties(manifest);
    assert.isTrue(res.capabilities.includes("configurableTab"));
    assert.isTrue(res.isSPFx);
    assert.isTrue(res.isApiMeAAD);
    assert.isTrue(res.capabilities.includes("plugin"));
    assert.isTrue(res.capabilities.includes("copilotGpt"));
  });

  it("empty 1", async () => {
    const manifest: any = {
      id: "mockid",
      version: "1.0.0",
      manifestVersion: "1.14",
    };
    const res = manifestUtils.parseCommonProperties(manifest);
    assert.isFalse(res.capabilities.includes("configurableTab"));
    assert.isFalse(res.capabilities.includes("plugin"));
    assert.isFalse(res.capabilities.includes("copilotGpt"));
  });

  it("empty 2", async () => {
    const manifest: any = {
      id: "mockid",
      version: "1.0.0",
      manifestVersion: "1.14",
      copilotExtensions: {},
      copilotAgents: {
        declarativeAgents: [],
      },
    };
    const res = manifestUtils.parseCommonProperties(manifest);
    assert.isFalse(res.capabilities.includes("configurableTab"));
    assert.isFalse(res.capabilities.includes("plugin"));
    assert.isFalse(res.capabilities.includes("copilotGpt"));
  });
});
