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
import fs from "fs-extra";
import mockedEnv, { RestoreFn } from "mocked-env";
import path from "path";
import { assert, vi } from "vitest";
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
  SharePointAppId,
} from "../../../../src/component/driver/teamsApp/utils/ManifestUtils";
import * as envFunctionUtils from "../../../../src/component/utils/envFunctionUtils";
import { FileNotFoundError, JSONSyntaxError, ReadFileError } from "../../../../src/error";

const latestManifestVersion = "1.17";
const oldManifestVersion = "1.16";

describe("ManifestUtils", () => {
  let manifestUtils: ManifestUtils;

  beforeEach(() => {
    manifestUtils = new ManifestUtils();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should add a staticTab capability", async () => {
    mockInputManifestFile(manifestUtils, latestManifestVersion);
    vi.spyOn(fs, "writeFile").mockImplementation((path: any, data: string) => {
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
    vi.spyOn(fs, "writeFile").mockImplementation((path: any, data: string) => {
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
    vi.spyOn(fs, "writeFile").mockImplementation((path: any, data: string) => {
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
    vi.spyOn(fs, "writeFile").mockImplementation((path: any, data: string) => {
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
    vi.spyOn(fs, "writeFile").mockImplementation((path: any, data: string) => {
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
    vi.spyOn(fs, "writeFile").mockImplementation((path: any, data: string) => {
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
    vi.spyOn(fs, "writeFile").mockImplementation((path: any, data: string) => {
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
    vi.spyOn(fs, "writeFile").mockImplementation((path: any, data: string) => {
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
    vi.spyOn(fs, "writeFile").mockImplementation((path: any, data: string) => {
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
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(mockManifest as any));
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    const res = await manifestUtils.getPluginFilePath(mockManifest as any, "fake");
    assert.isTrue(res.isOk());
  });
  it("getPluginFilePath error 1", async () => {
    const mockManifest = {};
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(mockManifest as any));
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
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(mockManifest as any));
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
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(mockManifest as any));
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
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(mockManifest as any));
    const res = await manifestUtils.getPluginFilePath(mockManifest as any, "fake");
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof UserError);
    }
  });
  it("getPluginFilePath error 5", async () => {
    const mockManifest = {
      copilotAgents: {},
    };
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(mockManifest as any));
    const res = await manifestUtils.getPluginFilePath(mockManifest as any, "fake");
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof UserError);
    }
  });
  it("getPluginFilePath error 6", async () => {
    const mockManifest = {
      copilotAgents: {
        plugins: [],
      },
    };
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(mockManifest as any));
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
  vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(mockManifest));
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
  vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(mockManifest));
}

describe("readAppManifestSync", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Success", () => {
    const teamsManifest = new TeamsAppManifest();
    vi.spyOn(fs, "existsSync").mockImplementation(() => {
      return true;
    });
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(teamsManifest));

    const res = manifestUtils.readAppManifestSync("projectPath");
    assert.isTrue(res.isOk());
  });

  it("Return false if cannot find the manifest", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const res = manifestUtils.readAppManifestSync("projectPath");
    assert.isTrue(res.isErr() && res.error instanceof FileNotFoundError);
  });

  it("Return false if pasring json failed", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("");

    const res = manifestUtils.readAppManifestSync("projectPath");
    assert.isTrue(res.isErr() && res.error instanceof JSONSyntaxError);
  });

  it("Return false if read file failed", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw "error";
    });

    const res = manifestUtils.readAppManifestSync("projectPath");
    assert.isTrue(res.isErr() && res.error instanceof ReadFileError);
  });
});

describe("getTeamsAppManifestPath", () => {
  const sandbox = vi;
  const projectPath = "projectPath";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("return manifest path under appManifest", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const res = manifestUtils.getTeamsAppManifestPath(projectPath);
    assert.equal(res, path.join(projectPath, "appManifest", "manifest.json"));
  });

  it("return manifest path under root directory", () => {
    vi.spyOn(fs, "existsSync").mockImplementation((inputPath) => {
      if (inputPath === path.join(projectPath, "appManifest", "manifest.json")) {
        return false;
      }
      return true;
    });
    const res = manifestUtils.getTeamsAppManifestPath(projectPath);
    assert.equal(res, path.join(projectPath, "manifest.json"));
  });

  it("return manifest path under appPackage", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    const res = manifestUtils.getTeamsAppManifestPath(projectPath);
    assert.equal(res, path.join(projectPath, "appPackage", "manifest.json"));
  });
});

describe("trimManifestShortName", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Success", async () => {
    const teamsManifest = new TeamsAppManifest();
    teamsManifest.name.short = "shortname abcdefghijklmn123456${{APP_NAME_SUFFIX}}";
    vi.spyOn(fs, "readJson").mockResolvedValue(teamsManifest);
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    const res = await manifestUtils.trimManifestShortName("projectPath");
    assert.isTrue(res.isOk());
    assert.equal(teamsManifest.name.short, "shortnameabcdefghijklmn12${{APP_NAME_SUFFIX}}");
  });
  it("Success no suffix", async () => {
    const teamsManifest = new TeamsAppManifest();
    teamsManifest.name.short = "shortname abcdefghijklmn123456";
    vi.spyOn(fs, "readJson").mockResolvedValue(teamsManifest);
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    const res = await manifestUtils.trimManifestShortName("projectPath");
    assert.isTrue(res.isOk());
    assert.equal(teamsManifest.name.short, "shortnameabcdefghijklmn12");
  });
  it("No need to trim", async () => {
    const teamsManifest = new TeamsAppManifest();
    teamsManifest.name.short = "shortname abcdefghijklmn${{APP_NAME_SUFFIX}}";
    const readJsonStub = vi.spyOn(fs, "readJson").mockResolvedValue(teamsManifest);
    const writeFileStub = vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    const res = await manifestUtils.trimManifestShortName("projectPath");
    assert.isTrue(res.isOk());
    assert.isTrue(readJsonStub.mock.calls.length === 1);
    assert.isTrue(writeFileStub.mock.calls.length === 0);
    assert.equal(teamsManifest.name.short, "shortname abcdefghijklmn${{APP_NAME_SUFFIX}}");
  });
  it("No manifest", async () => {
    const teamsManifest = new TeamsAppManifest();
    teamsManifest.name.short = "shortname abcdefghijklmn${{APP_NAME_SUFFIX}}";
    const readJsonStub = vi.spyOn(fs, "readJson").mockResolvedValue(teamsManifest);
    const writeFileStub = vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(false);
    const res = await manifestUtils.trimManifestShortName("projectPath");
    assert.isTrue(res.isOk());
    assert.isTrue(readJsonStub.mock.calls.length === 0);
    assert.isTrue(writeFileStub.mock.calls.length === 0);
  });
});

describe("resolveLocFile", () => {
  const sandbox = vi;
  let mockedEnvRestore: RestoreFn;

  afterEach(() => {
    if (mockedEnvRestore) {
      mockedEnvRestore();
    }
    vi.restoreAllMocks();
    vi.restoreAllMocks();
  });

  it("returns error when loc file doesn't exist", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);

    const locFile = await manifestUtils.resolveLocFile("loc_file_path");

    assert.isTrue(locFile.isErr());
    if (locFile.isErr()) {
      assert.equal(locFile.error.name, "FileNotFoundError");
    }
  });

  it("returns error when there're unresolved env variables", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    const fakedLocManifest = new TeamsAppManifest();
    fakedLocManifest.name.short = "shortname ${{APP_NAME_SUFFIX}}";
    vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(fakedLocManifest) as any);

    const locFile = await manifestUtils.resolveLocFile("loc_file_path");

    assert.isTrue(locFile.isErr());
    if (locFile.isErr()) {
      assert.equal(locFile.error.name, "MissingEnvironmentVariablesError");
    }
  });

  it("happy pass", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    const fakedLocManifest = new TeamsAppManifest();
    fakedLocManifest.name.short = "shortname ${{APP_NAME_SUFFIX}}";
    mockedEnvRestore = mockedEnv({
      ["APP_NAME_SUFFIX"]: "- hello world",
    });
    vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(fakedLocManifest) as any);

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
    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath) => {
      return filePath === "loc_file_path" || filePath === "instruction.txt";
    });
    vi.spyOn(fs, "readFile").mockImplementation(((filePath: number | fs.PathLike) => {
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
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(
      JSON.stringify({
        name: {
          short: "$[file('instruction.txt')]",
        },
      }) as any
    );

    const expansionError = new UserError("source", "name", "message");
    vi.spyOn(envFunctionUtils, "expandVariableWithFunction").mockResolvedValue(err(expansionError));

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
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
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
