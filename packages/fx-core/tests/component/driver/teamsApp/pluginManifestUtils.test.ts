// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  AppManifestUtils,
  Colors,
  Platform,
  PluginManifestSchema,
  SystemError,
  TeamsAppManifest,
  err,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import mockedEnv, { RestoreFn } from "mocked-env";
import path from "path";
import { chai, vi } from "vitest";
import {
  FileNotFoundError,
  JSONSyntaxError,
  MissingEnvironmentVariablesError,
} from "../../../../src";
import { createContext, setTools } from "../../../../src/common/globalVars";
import * as commonUtils from "../../../../src/common/utils";
import { AppStudioError } from "../../../../src/component/driver/teamsApp/errors";
import { PluginManifestValidationResult } from "../../../../src/component/driver/teamsApp/interfaces/ValidationResult";
import { pluginManifestUtils } from "../../../../src/component/driver/teamsApp/utils/PluginManifestUtils";
import { WrapDriverContext } from "../../../../src/component/driver/util/wrapUtil";
import { ODRProvider } from "../../../../src/component/utils/odrProvider";
import { MockTools } from "../../../core/utils";
import { MockedLogProvider, MockedTelemetryReporter } from "../../../plugins/solution/util";

describe("pluginManifestUtils", () => {
  const sandbox = vi;
  let mockedEnvRestore: RestoreFn;
  const originalPlatform = process.platform;

  afterEach(async () => {
    vi.restoreAllMocks();
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    if (mockedEnvRestore) {
      mockedEnvRestore();
    }
  });

  const pluginManifest: PluginManifestSchema = {
    schema_version: "2.0",
    name_for_human: "test",
    description_for_human: "test",
    runtimes: [
      {
        type: "OpenApi",
        auth: { type: "None" },
        spec: {
          url: "openapi.yaml",
        },
      },
      {
        type: "LocalPlugin",
        spec: {
          local_endpoint: "localEndpoint",
        },
        runs_for_functions: ["add_todo"],
      },
    ],
  };

  const teamsManifest: TeamsAppManifest = {
    $schema:
      "https://developer.microsoft.com/en-us/json-schemas/teams/v1.9/MicrosoftTeams.schema.json",
    manifestVersion: "1.9",
    version: "1.0.0",
    id: "test",
    packageName: "test",
    developer: {
      name: "test",
      websiteUrl: "https://test.com",
      privacyUrl: "https://test.com/privacy",
      termsOfUseUrl: "https://test.com/termsofuse",
    },
    icons: {
      color: "icon-color.png",
      outline: "icon-outline.png",
    },
    name: {
      short: "test",
      full: "test",
    },
    description: {
      short: "test",
      full: "test",
    },
    accentColor: "#FFFFFF",
    bots: [],
    composeExtensions: [],
    configurableTabs: [],
    staticTabs: [],
    permissions: [],
    validDomains: [],
    copilotExtensions: {
      plugins: [
        {
          file: "resources/plugin.json",
          id: "plugin1",
        },
      ],
    },
  };

  it("readPluginManifestFile success", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(pluginManifest) as any);

    const result = await pluginManifestUtils.readPluginManifestFile("path");
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value, pluginManifest);
    }
  });

  it("readPluginManifestFile error: JsonSyntaxError", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue("invalid json" as any);

    const result = await pluginManifestUtils.readPluginManifestFile("path");
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof JSONSyntaxError);
    }
  });

  it("readPluginManifestFile error: file does not exist", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);

    const result = await pluginManifestUtils.readPluginManifestFile("path");
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof FileNotFoundError);
    }
  });

  it("getApiSpecFilePathFromTeamsManifest sucess", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(pluginManifest) as any);
    const res = await pluginManifestUtils.getApiSpecFilePathFromTeamsManifest(
      teamsManifest,
      "/test/path"
    );
    chai.assert.isTrue(res.isOk());

    if (res.isOk()) {
      chai.assert.isTrue(res.value.length === 1);
      chai.assert.equal(res.value[0], path.resolve("/test/resources/openapi.yaml"));
    }
  });

  it("getApiSpecFilePathFromTeamsManifest error: plugin file not exist", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    const readPlugin = vi
      .spyOn(fs, "readFile")
      .mockResolvedValue(JSON.stringify(pluginManifest) as any);
    const res = await pluginManifestUtils.getApiSpecFilePathFromTeamsManifest(
      teamsManifest,
      "path"
    );
    chai.assert.isTrue(res.isErr());

    if (res.isErr()) {
      chai.assert.isTrue(res.error instanceof FileNotFoundError);
      chai.assert.isTrue(readPlugin.mock.calls.length === 0);
    }
  });

  it("getApiSpecFilePathFromTeamsManifest error: invalid plugin node case 1", async () => {
    const testManifest = {
      ...teamsManifest,
      copilotExtensions: { plugins: [] },
    };
    vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(pluginManifest) as any);
    const res = await pluginManifestUtils.getApiSpecFilePathFromTeamsManifest(
      testManifest,
      "/test/path"
    );
    chai.assert.isTrue(res.isErr());

    if (res.isErr()) {
      chai.assert.equal(res.error.name, AppStudioError.TeamsAppRequiredPropertyMissingError.name);
    }
  });

  it("getApiSpecFilePathFromTeamsManifest error: invalid plugin node case 2", async () => {
    const testManifest = {
      $schema:
        "https://developer.microsoft.com/en-us/json-schemas/teams/v1.9/MicrosoftTeams.schema.json",
      manifestVersion: "1.9",
      version: "1.0.0",
      id: "test",
      packageName: "test",
      developer: {
        name: "test",
        websiteUrl: "https://test.com",
        privacyUrl: "https://test.com/privacy",
        termsOfUseUrl: "https://test.com/termsofuse",
      },
      icons: {
        color: "icon-color.png",
        outline: "icon-outline.png",
      },
      name: {
        short: "test",
        full: "test",
      },
      description: {
        short: "test",
        full: "test",
      },
    };
    vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(pluginManifest) as any);
    const res = await pluginManifestUtils.getApiSpecFilePathFromTeamsManifest(
      testManifest as unknown as TeamsAppManifest,
      "/test/path"
    );
    chai.assert.isTrue(res.isErr());

    if (res.isErr()) {
      chai.assert.equal(res.error.name, AppStudioError.TeamsAppRequiredPropertyMissingError.name);
    }
  });

  it("getApiSpecFilePathFromTeamsManifest error: spec file not exist", async () => {
    vi.spyOn(fs, "pathExists").mockImplementation(async (testPath) => {
      if (testPath === path.resolve("/test/resources/openapi.yaml")) {
        return false;
      } else {
        return true;
      }
    });
    vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(pluginManifest) as any);
    const res = await pluginManifestUtils.getApiSpecFilePathFromTeamsManifest(
      teamsManifest,
      "/test/path"
    );
    chai.assert.isTrue(res.isOk());

    if (res.isOk()) {
      chai.assert.equal(res.value.length, 0);
    }
  });

  it("getApiSpecFilePathFromTeamsManifest error: runtime without url", async () => {
    const testPluginManifest = {
      ...pluginManifest,
      runtimes: [
        {
          type: "OpenApi",
          auth: { type: "None" },
          spec: {
            url: "",
          },
        },
      ],
    };
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(testPluginManifest) as any);
    const res = await pluginManifestUtils.getApiSpecFilePathFromTeamsManifest(
      teamsManifest,
      "/test/path"
    );
    chai.assert.isTrue(res.isOk());

    if (res.isOk()) {
      chai.assert.equal(res.value.length, 0);
    }
  });

  it("getApiSpecFilePathFromTeamsManifest error: teams manifest without plugin", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);

    const res = await pluginManifestUtils.getApiSpecFilePathFromTeamsManifest(
      { ...teamsManifest, copilotExtensions: {} },
      "/test/path"
    );
    chai.assert.isTrue(res.isErr());
  });

  describe("logValidationErrors", () => {
    it("skip if no errors", () => {
      const validationRes: PluginManifestValidationResult = {
        id: "1",
        filePath: "testPath",
        validationResult: [],
      };

      const res = pluginManifestUtils.logValidationErrors(validationRes, Platform.VSCode);
      chai.assert.isEmpty(res);
    });
    it("log if VSC", () => {
      const validationRes: PluginManifestValidationResult = {
        id: "1",
        filePath: "testPath",
        validationResult: ["error1", "error2"],
      };

      const res = pluginManifestUtils.logValidationErrors(validationRes, Platform.VSCode) as string;

      chai.assert.isTrue(res.includes("error1"));
      chai.assert.isTrue(res.includes("error2"));
    });

    it("log if CLI", () => {
      const validationRes: PluginManifestValidationResult = {
        id: "1",
        filePath: "testPath",
        validationResult: ["error1", "error2"],
      };

      const res = pluginManifestUtils.logValidationErrors(validationRes, Platform.CLI) as Array<{
        content: string;
        color: Colors;
      }>;

      chai.assert.isTrue(res.find((item) => item.content.includes("error1")) !== undefined);
      chai.assert.isTrue(res.find((item) => item.content.includes("error2")) !== undefined);
    });
  });

  describe("getManifest", async () => {
    setTools(new MockTools());
    const context = commonUtils.generateDriverContext(createContext(), {
      platform: Platform.VSCode,
      projectPath: "",
    });
    const mockedContex = new WrapDriverContext(context, "test", "test");
    const testPluginManifest = {
      ...pluginManifest,
      name_for_human: "name${{APP_NAME_SUFFIX}}",
      runtimes: [
        {
          type: "OpenApi",
          auth: { type: "None" },
          spec: {
            url: "",
          },
        },
      ],
    };
    it("get manifest success", async () => {
      mockedEnvRestore = mockedEnv({
        ["APP_NAME_SUFFIX"]: "test",
      });
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(testPluginManifest) as any);

      const res = await pluginManifestUtils.getManifest("testPath", mockedContex);

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.equal("nametest", res.value.name_for_human);
      }
    });

    it("get manifest error: file not found", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const res = await pluginManifestUtils.getManifest("testPath", mockedContex);
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof FileNotFoundError);
      }
    });

    it("get manifest error: unresolved env error", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(testPluginManifest) as any);

      const res = await pluginManifestUtils.getManifest("testPath", mockedContex);

      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof MissingEnvironmentVariablesError);
      }
    });
  });

  describe("validateAgainstSchema", async () => {
    const driverContext = {
      logProvider: new MockedLogProvider(),
      telemetryReporter: new MockedTelemetryReporter(),
      projectPath: "test",
      addTelemetryProperties: () => {},
    };
    it("validate success", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(pluginManifest) as any);
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);
      vi.spyOn(pluginManifestUtils, "validateLocalMCPPluginRuntimes").mockResolvedValue([]);

      const res = await pluginManifestUtils.validateAgainstSchema(
        { id: "1", file: "file" },
        "testPath",
        driverContext as any
      );
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.deepEqual(res.value, {
          id: "1",
          filePath: "testPath",
          validationResult: [],
        });
      }
    });

    it("validate action error", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(pluginManifest) as any);
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);
      vi.spyOn(pluginManifestUtils, "validateAgainstSchema").mockResolvedValue(
        err(new SystemError("error", "error", "error", "error"))
      );

      const res = await pluginManifestUtils.validateAgainstSchema(
        { id: "1", file: "file" },
        "testPath",
        context as any
      );
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.equal("error", res.error.name);
      }
    });

    it("validate schema error", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(pluginManifest) as any);
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockImplementation(() => {
        throw "error";
      });

      const res = await pluginManifestUtils.validateAgainstSchema(
        { id: "1", file: "file" },
        "testPath",
        driverContext as any
      );
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.equal(AppStudioError.ValidationFailedError.name, res.error.name);
      }
    });

    it("error: cannot get manifest", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);

      const res = await pluginManifestUtils.validateAgainstSchema(
        { id: "1", file: "file" },
        "testPath",
        driverContext as any
      );
      chai.assert.isTrue(res.isErr());
    });
  });

  describe("getDefaultNextAvailableApiSpecPath", async () => {
    it("Json file: success on second try", async () => {
      mockedEnvRestore = mockedEnv({
        TEAMSFX_KIOTA_NPM_INTEGRATION: "false",
      });
      vi.spyOn(fs, "pathExists")
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const res = await pluginManifestUtils.getDefaultNextAvailableApiSpecPath(
        "testPath.json",
        "test"
      );

      chai.assert.equal(res, path.join("test", "openapi_2.json"));
    });

    it("Json file: success on kiota flag open", async () => {
      mockedEnvRestore = mockedEnv({
        TEAMSFX_KIOTA_NPM_INTEGRATION: "true",
      });
      vi.spyOn(fs, "pathExists")
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const res = await pluginManifestUtils.getDefaultNextAvailableApiSpecPath(
        "testPath.json",
        "test"
      );

      chai.assert.equal(res, path.join("test", "openapi_2.yaml"));
    });

    it("Yaml file: success on first try", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      const res = await pluginManifestUtils.getDefaultNextAvailableApiSpecPath(
        "testPath.yaml",
        "test"
      );

      chai.assert.equal(res, path.join("test", "openapi_1.yaml"));
    });

    it("success on third try with ", async () => {
      mockedEnvRestore = mockedEnv({
        TEAMSFX_KIOTA_NPM_INTEGRATION: "false",
      });
      vi.spyOn(commonUtils, "isJsonSpecFile").mockImplementation(() => {
        throw "fail";
      });
      vi.spyOn(fs, "pathExists")
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const res = await pluginManifestUtils.getDefaultNextAvailableApiSpecPath("testPath", "test");

      chai.assert.equal(res, path.join("test", "openapi_3.json"));
    });
  });

  describe("validateLocalMCPPluginRuntimes", () => {
    beforeEach(() => {
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    });

    describe("local_endpoint format", () => {
      it("should pass when local_endpoint starts with 'mcp://' and server exists", async () => {
        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [{ name: "test_func" }],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://test-server" },
              run_for_functions: ["test_func"],
            },
          ],
        };

        const mockServers = [
          {
            name: "test-server",
            display_name: "Test Server",
            description: "Test",
            version: "1.0.0",
            identifier: "test-server",
            packageFamily: "test-pkg",
            command: "odr.exe",
            args: ["mcp", "--proxy", "test-server"],
            tools: [
              {
                name: "test_func",
                description: "",
                inputSchema: { type: "object", properties: {} },
              },
            ],
          },
        ];
        vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockServers);

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isEmpty(errors);
      });

      it("should allow non-MCP local_endpoint formats", async () => {
        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [{ name: "test_func" }],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "http://localhost:3000" },
              run_for_functions: ["test_func"],
            },
          ],
        };

        vi.spyOn(ODRProvider, "listServers").mockResolvedValue([]);

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isEmpty(errors);
      });

      it("should handle empty local_endpoint as non-MCP", async () => {
        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [{ name: "test_func" }],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "" },
              run_for_functions: ["test_func"],
            },
          ],
        };

        vi.spyOn(ODRProvider, "listServers").mockResolvedValue([]);

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isEmpty(errors);
      });

      it("should fail when mcp:// prefix used but server not found", async () => {
        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [{ name: "func1" }, { name: "func2" }],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://server1" },
              run_for_functions: ["func1"],
            },
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "http://localhost:3000" },
              run_for_functions: ["func2"],
            },
          ],
        };

        vi.spyOn(ODRProvider, "listServers").mockResolvedValue([]);

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isNotEmpty(errors);
        chai.assert.include(errors[0], "MCP server");
        chai.assert.include(errors[0], "server1");
        chai.assert.include(errors[0], "not found");
      });
    });

    describe("Functions referenced by runtimes", () => {
      it("should pass when all functions are referenced", async () => {
        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [{ name: "func1" }, { name: "func2" }],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://test-server" },
              run_for_functions: ["func1", "func2"],
            },
          ],
        };

        const mockServers = [
          {
            name: "test-server",
            display_name: "Test Server",
            description: "Test",
            version: "1.0.0",
            identifier: "test-server",
            packageFamily: "test-pkg",
            command: "odr.exe",
            args: ["mcp", "--proxy", "test-server"],
            tools: [
              { name: "func1", description: "", inputSchema: { type: "object", properties: {} } },
              { name: "func2", description: "", inputSchema: { type: "object", properties: {} } },
            ],
          },
        ];
        vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockServers);

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isEmpty(errors);
      });

      it("should fail when functions are not referenced", async () => {
        vi.spyOn(ODRProvider, "listServers").mockResolvedValue([
          {
            name: "test-server",
            display_name: "Test Server",
            description: "Test",
            version: "1.0.0",
            identifier: "test-server",
            packageFamily: "test-pkg",
            command: "odr.exe",
            args: [],
            tools: [
              { name: "func1", description: "Function 1", inputSchema: { properties: {} } },
              { name: "func2", description: "Function 2", inputSchema: { properties: {} } },
              { name: "func3", description: "Function 3", inputSchema: { properties: {} } },
            ],
          },
        ]);

        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [{ name: "func1" }, { name: "func2" }, { name: "func3" }],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://test-server" },
              run_for_functions: ["func1"],
            },
          ],
        };

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isNotEmpty(errors);
        // func2 and func3 exist in MCP server but not in run_for_functions
        chai.assert.include(errors[0], "func2");
        chai.assert.include(errors[0], "not listed in");
      });

      it("should pass when functions are referenced across multiple runtimes", async () => {
        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [{ name: "func1" }, { name: "func2" }],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://server1" },
              run_for_functions: ["func1"],
            },
            {
              type: "OpenApi",
              spec: { url: "openapi.json" },
              run_for_functions: ["func2"],
            },
          ],
        };

        const mockServers = [
          {
            name: "server1",
            display_name: "Server 1",
            description: "Test",
            version: "1.0.0",
            identifier: "server1",
            packageFamily: "server1-pkg",
            command: "odr.exe",
            args: ["mcp", "--proxy", "server1"],
            tools: [
              { name: "func1", description: "", inputSchema: { type: "object", properties: {} } },
            ],
          },
        ];
        vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockServers);

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isEmpty(errors);
      });

      it("should pass when no functions are defined", async () => {
        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://test-server" },
              run_for_functions: [],
            },
          ],
        };

        const mockServers = [
          {
            name: "test-server",
            display_name: "Test Server",
            description: "Test",
            version: "1.0.0",
            identifier: "test-server",
            packageFamily: "test-pkg",
            command: "odr.exe",
            args: ["mcp", "--proxy", "test-server"],
            tools: [],
          },
        ];
        vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockServers);

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isEmpty(errors);
      });

      it("should return early when no LocalPlugin runtimes exist", async () => {
        const odrStub = vi.spyOn(ODRProvider, "listServers");

        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [{ name: "test_function" }],
          runtimes: [
            {
              type: "OpenApi",
              spec: { url: "http://test.com/openapi.json" },
              auth: { type: "None" },
              run_for_functions: ["test_function"],
            },
          ],
        };

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);

        chai.assert.isEmpty(errors);
        // ODRProvider.listServers should not be called since there are no LocalPlugin runtimes
        chai.assert.isFalse(odrStub.mock.calls.length > 0);
      });

      it("should return early when runtimes property is missing", async () => {
        const odrStub = vi.spyOn(ODRProvider, "listServers");

        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
        };

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);

        chai.assert.isEmpty(errors);
        chai.assert.isFalse(odrStub.mock.calls.length > 0);
      });
    });

    describe("MCP Server Validation", () => {
      const mockODRServers = [
        {
          name: "test-server",
          display_name: "Test MCP Server",
          description: "Test server",
          version: "1.0.0",
          identifier: "test-server",
          packageFamily: "test-server-pkg",
          command: "odr.exe",
          args: ["mcp", "--proxy", "test-server"],
          tools: [
            {
              name: "get_weather",
              description: "Get weather information",
              inputSchema: {
                type: "object",
                properties: {
                  location: { type: "string" },
                  units: { type: "string", enum: ["celsius", "fahrenheit"] },
                },
                required: ["location"],
              },
            },
            {
              name: "send_email",
              description: "Send an email",
              inputSchema: {
                type: "object",
                properties: {
                  to: { type: "string" },
                  subject: { type: "string" },
                  body: { type: "string" },
                },
                required: ["to", "subject"],
              },
            },
          ],
        },
      ];

      it("should allow non-MCP LocalPlugins on non-Windows platforms", async () => {
        vi.restoreAllMocks();
        Object.defineProperty(process, "platform", { value: "darwin", configurable: true });

        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [{ name: "get_weather" }],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "http://localhost:3000" },
              run_for_functions: ["get_weather"],
            },
          ],
        };

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isEmpty(errors);
      });

      it("should allow non-MCP LocalPlugins when no MCP servers found", async () => {
        vi.spyOn(ODRProvider, "listServers").mockResolvedValue([]);

        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [{ name: "test_func" }],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "http://localhost:3000" },
              run_for_functions: ["test_func"],
            },
          ],
        };

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isEmpty(errors);
      });

      it("should fail when MCP server identifier not found", async () => {
        vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockODRServers);

        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [{ name: "test_func" }],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://non-existent-server" },
              run_for_functions: ["test_func"],
            },
          ],
        };

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isNotEmpty(errors);
        chai.assert.include(errors[0], "MCP server");
        chai.assert.include(errors[0], "non-existent-server");
        chai.assert.include(errors[0], "not found");
      });

      it("should fail when tool in run_for_functions not found in MCP server", async () => {
        vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockODRServers);

        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [{ name: "non_existent_tool" }],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://test-server" },
              run_for_functions: ["non_existent_tool"],
            },
          ],
        };

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isNotEmpty(errors);
        chai.assert.include(errors[0], "Tool");
        chai.assert.include(errors[0], "non_existent_tool");
        chai.assert.include(errors[0], "not found");
      });

      it("should pass when parameters match MCP tool definition", async () => {
        vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockODRServers);

        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [
            {
              name: "get_weather",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string" },
                  units: { type: "string", enum: ["celsius", "fahrenheit"] },
                },
                required: ["location"],
              },
            },
          ],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://test-server" },
              run_for_functions: ["get_weather"],
            },
          ],
        };

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isEmpty(errors);
      });

      it("should fail when manifest has extra parameters", async () => {
        vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockODRServers);

        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [
            {
              name: "get_weather",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string" },
                  units: { type: "string", enum: ["celsius", "fahrenheit"] },
                  extra_param: { type: "string" },
                },
                required: ["location"],
              },
            },
          ],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://test-server" },
              run_for_functions: ["get_weather"],
            },
          ],
        };

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isNotEmpty(errors);
        chai.assert.include(errors[0], "extra_param");
        chai.assert.include(errors[0], "Parameter not defined in MCP server");
      });

      it("should fail when manifest is missing required parameters", async () => {
        vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockODRServers);

        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [
            {
              name: "get_weather",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string" },
                },
                required: ["location"],
              },
            },
          ],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://test-server" },
              run_for_functions: ["get_weather"],
            },
          ],
        };

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isNotEmpty(errors);
        chai.assert.include(errors[0], "units");
        chai.assert.include(errors[0], "Missing parameter");
      });

      it("should fail when parameter types mismatch", async () => {
        vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockODRServers);

        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [
            {
              name: "get_weather",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "number" },
                  units: { type: "string", enum: ["celsius", "fahrenheit"] },
                },
                required: ["location"],
              },
            },
          ],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://test-server" },
              run_for_functions: ["get_weather"],
            },
          ],
        };

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isNotEmpty(errors);
        chai.assert.include(errors[0], "Type mismatch");
        chai.assert.include(errors[0], "location");
      });

      it("should fail when enum values mismatch", async () => {
        vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockODRServers);

        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [
            {
              name: "get_weather",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string" },
                  units: { type: "string", enum: ["celsius", "kelvin"] },
                },
                required: ["location"],
              },
            },
          ],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://test-server" },
              run_for_functions: ["get_weather"],
            },
          ],
        };

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isNotEmpty(errors);
        chai.assert.include(errors[0], "Enum mismatch");
      });

      it("should fail when required array differs", async () => {
        vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockODRServers);

        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [
            {
              name: "get_weather",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string" },
                  units: { type: "string", enum: ["celsius", "fahrenheit"] },
                },
                required: ["location", "units"],
              },
            },
          ],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://test-server" },
              run_for_functions: ["get_weather"],
            },
          ],
        };

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isNotEmpty(errors);
        chai.assert.include(errors[0], "Extra required parameters");
        chai.assert.include(errors[0], "units");
      });

      it("should handle ODR failures gracefully", async () => {
        vi.spyOn(ODRProvider, "listServers").mockRejectedValue(new Error("ODR command failed"));

        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [{ name: "test_func" }],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://test-server" },
              run_for_functions: ["test_func"],
            },
          ],
        };

        // Should return empty errors when ODR fails
        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isEmpty(errors);
      });
    });

    describe("Edge cases", () => {
      it("should return empty errors for manifest without runtimes", async () => {
        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [{ name: "test_func" }],
        };

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isEmpty(errors);
      });

      it("should only validate LocalPlugin runtimes, ignore others", async () => {
        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [{ name: "func1" }, { name: "func2" }],
          runtimes: [
            {
              type: "OpenApi",
              spec: { url: "invalid-url" },
              run_for_functions: ["func1"],
            },
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://test-server" },
              run_for_functions: ["func2"],
            },
          ],
        };

        const mockServers = [
          {
            name: "test-server",
            display_name: "Test Server",
            description: "Test",
            version: "1.0.0",
            identifier: "test-server",
            packageFamily: "test-pkg",
            command: "odr.exe",
            args: ["mcp", "--proxy", "test-server"],
            tools: [
              { name: "func2", description: "", inputSchema: { type: "object", properties: {} } },
            ],
          },
        ];
        vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockServers);

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isEmpty(errors);
      });

      it("should handle multiple LocalPlugin runtimes with different servers", async () => {
        const mockServers = [
          {
            name: "server1",
            display_name: "Server 1",
            description: "Test",
            version: "1.0.0",
            identifier: "server1",
            packageFamily: "server1-pkg",
            command: "odr.exe",
            args: ["mcp", "--proxy", "server1"],
            tools: [
              { name: "tool1", description: "", inputSchema: { type: "object", properties: {} } },
            ],
          },
          {
            name: "server2",
            display_name: "Server 2",
            description: "Test",
            version: "1.0.0",
            identifier: "server2",
            packageFamily: "server2-pkg",
            command: "odr.exe",
            args: ["mcp", "--proxy", "server2"],
            tools: [
              { name: "tool2", description: "", inputSchema: { type: "object", properties: {} } },
            ],
          },
        ];

        vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockServers);

        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [
            { name: "tool1", parameters: { type: "object", properties: {} } },
            { name: "tool2", parameters: { type: "object", properties: {} } },
          ],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://server1" },
              run_for_functions: ["tool1"],
            },
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://server2" },
              run_for_functions: ["tool2"],
            },
          ],
        };

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        chai.assert.isEmpty(errors);
      });

      it("should handle mixed MCP and non-MCP LocalPlugin runtimes", async () => {
        const mockServers = [
          {
            name: "mcp-server",
            display_name: "MCP Server",
            description: "Test",
            version: "1.0.0",
            identifier: "mcp-server",
            packageFamily: "mcp-server-pkg",
            command: "odr.exe",
            args: ["mcp", "--proxy", "mcp-server"],
            tools: [
              {
                name: "mcp_tool",
                description: "",
                inputSchema: { type: "object", properties: {} },
              },
            ],
          },
        ];

        vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockServers);

        const manifest: PluginManifestSchema = {
          schema_version: "v2.1",
          name_for_human: "Test Plugin",
          description_for_human: "Test",
          functions: [
            { name: "mcp_tool", parameters: { type: "object", properties: {} } },
            { name: "custom_tool" },
          ],
          runtimes: [
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "mcp://mcp-server" },
              run_for_functions: ["mcp_tool"],
            },
            {
              type: "LocalPlugin",
              spec: { local_endpoint: "http://localhost:8080" },
              run_for_functions: ["custom_tool"],
            },
          ],
        };

        const errors = await pluginManifestUtils.validateLocalMCPPluginRuntimes(manifest);
        // Should pass - MCP plugin is valid, non-MCP plugin is ignored
        chai.assert.isEmpty(errors);
      });
    });
  });
});
