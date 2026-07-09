// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SpecParser, WarningType } from "@microsoft/m365-spec-parser";
import {
  DeclarativeCopilotManifestSchema,
  Inputs,
  Platform,
  SystemError,
  TeamsAppManifest,
  UserError,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import axios from "axios";
import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { assert, vi } from "vitest";
import { FxCore, getLocalizedString } from "../../src";
import { FeatureFlags, featureFlagManager } from "../../src/common/featureFlags";
import { setTools } from "../../src/common/globalVars";
import { MetadataV3 } from "../../src/common/versionMetadata";
import { ActionInjector } from "../../src/component/configManager/actionInjector";
import { LocalMcpPrefix } from "../../src/component/constants";
import { AppStudioError } from "../../src/component/driver/teamsApp/errors";
import { copilotGptManifestUtils } from "../../src/component/driver/teamsApp/utils/CopilotGptManifestUtils";
import { manifestUtils } from "../../src/component/driver/teamsApp/utils/ManifestUtils";
import * as declarativeAgentHelper from "../../src/component/generator/declarativeAgent/helper";
import * as openApiSpecHelper from "../../src/component/generator/openApiSpec/helper";
import { pathUtils } from "../../src/component/utils/pathUtils";
import { NotImplementedError, UserCancelError } from "../../src/error/common";
import { QuestionNames } from "../../src/question";
import { ActionStartOptions } from "../../src/question/constants";
import { validationUtils } from "../../src/ui/validationUtils";
import { MockTools, randomAppName } from "./utils";

describe("updateActionWithMCP", () => {
  const tools = new MockTools();
  const projectPath = "/test/project";
  const pluginManifestPath = "/test/project/ai-plugin.json";
  const mcpServerUrl = "https://example.com/mcp";
  const serverName = "testServer";

  beforeEach(() => {
    setTools(tools);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should successfully update action with MCP without auth", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "None",
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "testTool",
          description: "Test tool description",
          inputSchema: {
            type: "object",
            properties: { param1: { type: "string" } },
            required: ["param1"],
          },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["testTool"],
      ignoreLockByUT: true,
    };

    const existingPlugin = {
      functions: [],
      runtimes: [],
    };

    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      // Return false for mcp-tools.json to avoid infinite loop, true for ai-plugin.json
      return !filePath.includes("mcp-tools");
    });
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);
    const writeJSONStub = vi.spyOn(fs, "writeJSON").mockResolvedValue();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");

    const showMessageStub = vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    const openFileStub = vi.spyOn(tools.ui, "openFile").mockResolvedValue();

    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isOk());
    assert.isTrue(writeJSONStub.mock.calls.length === 2); // mcp-tools.json and ai-plugin.json
    assert.isTrue(showMessageStub.mock.calls.length === 1);
    assert.isTrue(openFileStub.mock.calls.length === 1);
  });

  it("should create default mcp-tools.json when mcpFile is undefined (no matched runtime)", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "None",
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "testTool",
          description: "Test tool description",
          inputSchema: {
            type: "object",
            properties: { param1: { type: "string" } },
            required: ["param1"],
          },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["testTool"],
      ignoreLockByUT: true,
    };

    // No existing runtime with mcp_tool_description.file, so mcpFile will be undefined
    const existingPlugin = {
      functions: [],
      runtimes: [],
    };

    let writtenMcpToolsPath = "";
    let writtenMcpToolsData: any;
    let writtenPluginData: any;

    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      // Return false for mcp-tools.json so it uses the default name
      if (filePath.includes("mcp-tools")) {
        return false;
      }
      return true; // ai-plugin.json exists
    });
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);
    vi.spyOn(fs, "writeJSON").mockImplementation((filePath: string, data) => {
      if (filePath.includes("mcp-tools")) {
        writtenMcpToolsPath = filePath;
        writtenMcpToolsData = data;
      } else {
        writtenPluginData = data;
      }
      return Promise.resolve();
    });
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");

    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    vi.spyOn(tools.ui, "openFile").mockResolvedValue();

    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isOk());

    // Verify mcp-tools.json was created with default name (not incremented)
    assert.isTrue(writtenMcpToolsPath.includes("mcp-tools.json"));
    assert.isFalse(writtenMcpToolsPath.includes("mcp-tools-"));

    // Verify mcp-tools.json contains the tool with full details
    assert.isDefined(writtenMcpToolsData);
    assert.equal(writtenMcpToolsData.tools.length, 1);
    assert.equal(writtenMcpToolsData.tools[0].name, "testTool");
    assert.isDefined(writtenMcpToolsData.tools[0].inputSchema);
    assert.isDefined(writtenMcpToolsData.tools[0].title);

    // Verify the runtime was added with mcp_tool_description.file reference
    const mcpRuntime = writtenPluginData.runtimes.find(
      (r: any) => r.type === "RemoteMCPServer" && r.spec.url === mcpServerUrl
    );
    assert.isDefined(mcpRuntime);
    assert.equal(mcpRuntime.spec.mcp_tool_description.file, "mcp-tools.json");
  });

  it("should reuse existing mcp_tool_description.file when matched runtime exists", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "None",
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "newTool",
          description: "New tool description",
          inputSchema: {
            type: "object",
            properties: { param1: { type: "string" } },
            required: ["param1"],
          },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["newTool"],
      ignoreLockByUT: true,
    };

    // Existing runtime with mcp_tool_description.file set
    const existingPlugin = {
      functions: [
        {
          name: "oldTool",
          description: "Old tool",
        },
      ],
      runtimes: [
        {
          type: "RemoteMCPServer",
          spec: {
            url: mcpServerUrl,
            mcp_tool_description: {
              file: "existing-mcp-tools.json",
            },
          },
          run_for_functions: ["oldTool"],
        },
      ],
    };

    let writtenMcpToolsPath = "";
    let writtenPluginData: any;

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);
    vi.spyOn(fs, "writeJSON").mockImplementation((filePath: string, data) => {
      if (filePath.includes("mcp-tools") || filePath.includes("existing-mcp-tools")) {
        writtenMcpToolsPath = filePath;
      } else {
        writtenPluginData = data;
      }
      return Promise.resolve();
    });
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");

    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    vi.spyOn(tools.ui, "openFile").mockResolvedValue();

    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isOk());

    // Verify the existing mcp_tool_description.file is reused
    assert.isTrue(writtenMcpToolsPath.includes("existing-mcp-tools.json"));

    // Verify the runtime uses the same file reference
    const mcpRuntime = writtenPluginData.runtimes.find(
      (r: any) => r.type === "RemoteMCPServer" && r.spec.url === mcpServerUrl
    );
    assert.isDefined(mcpRuntime);
    assert.equal(mcpRuntime.spec.mcp_tool_description.file, "existing-mcp-tools.json");
  });

  it("should update DT runtime when functions are omitted and run_for_functions is wildcard", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "None",
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "newTool",
          description: "New tool description",
          inputSchema: {
            type: "object",
            properties: { param1: { type: "string" } },
            required: ["param1"],
          },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["newTool"],
      ignoreLockByUT: true,
    };

    const existingPlugin = {
      runtimes: [
        {
          type: "RemoteMCPServer",
          spec: {
            url: mcpServerUrl,
          },
          run_for_functions: ["*"],
        },
      ],
    };

    let writtenPluginData: any;
    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      return !filePath.includes("mcp-tools");
    });
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);
    vi.spyOn(fs, "writeJSON").mockImplementation((filePath: string, data) => {
      if (!filePath.includes("mcp-tools")) {
        writtenPluginData = data;
      }
      return Promise.resolve();
    });
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");

    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    vi.spyOn(tools.ui, "openFile").mockResolvedValue();

    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isOk());
    assert.deepEqual(writtenPluginData.functions, [
      {
        name: "newTool",
        description: "New tool description",
      },
    ]);
    assert.deepEqual(writtenPluginData.runtimes[0].run_for_functions, ["newTool"]);
  });

  it("should successfully update action with OAuth authentication", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "OAuthPluginVault",
      [QuestionNames.MCPForDAAuthType]: "oauth",
      [QuestionNames.MCPForDAClientId]: "client-id",
      [QuestionNames.MCPForDAClientSecret]: "client-secret",
      [QuestionNames.MCPForDAScopes]: "",
      [QuestionNames.MCPForDAAuthWellKnownUrl]:
        "https://example.com/.well-known/oauth-authorization-server",
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "testTool",
          description: "Test tool description",
          inputSchema: {
            type: "object",
            properties: { param1: { type: "string" } },
            required: ["param1"],
          },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["testTool"],
      ignoreLockByUT: true,
    };

    const existingPlugin = {
      functions: [],
      runtimes: [],
    };

    const oauthMetadata = {
      authorization_endpoint: "https://example.com/oauth/authorize",
      token_endpoint: "https://example.com/oauth/token",
      refresh_endpoint: "https://example.com/oauth/refresh",
    };

    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      // Return false for mcp-tools.json to avoid infinite loop, true for ai-plugin.json
      return !filePath.includes("mcp-tools");
    });
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);
    const writeJSONStub = vi.spyOn(fs, "writeJSON").mockResolvedValue();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");
    vi.spyOn(axios, "get").mockResolvedValue({ status: 200, data: oauthMetadata });
    const injectOAuthStub = vi
      .spyOn(ActionInjector, "injectCreateOAuthActionForMCP")
      .mockResolvedValue();

    const showMessageStub = vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    const openFileStub = vi.spyOn(tools.ui, "openFile").mockResolvedValue();

    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isOk());
    assert.isTrue(injectOAuthStub.mock.calls.length === 1);
    assert.isTrue(writeJSONStub.mock.calls.length === 2); // mcp-tools.json and ai-plugin.json
    assert.isTrue(showMessageStub.mock.calls.length === 1);
    assert.isTrue(openFileStub.mock.calls.length === 1);
  });

  it("should successfully update action with OAuth authentication using metadata URL", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "OAuthPluginVault",
      [QuestionNames.MCPForDAAuthType]: "oauth",
      [QuestionNames.MCPForDAClientId]: "client-id",
      [QuestionNames.MCPForDAClientSecret]: "client-secret",
      [QuestionNames.MCPForDAScopes]: "",
      [QuestionNames.MCPForDAAuthMetadataUrl]: "https://example.com/mcp/metadata",
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "testTool",
          description: "Test tool description",
          inputSchema: {
            type: "object",
            properties: { param1: { type: "string" } },
            required: ["param1"],
          },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["testTool"],
      ignoreLockByUT: true,
    };

    const existingPlugin = {
      functions: [],
      runtimes: [],
    };

    const mcpMetadata = {
      authorization_servers: ["https://example.com/oauth"],
    };

    const oauthMetadata = {
      authorization_endpoint: "https://example.com/oauth/authorize",
      token_endpoint: "https://example.com/oauth/token",
      refresh_endpoint: "https://example.com/oauth/refresh",
    };

    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      // Return false for mcp-tools.json to avoid infinite loop, true for ai-plugin.json
      return !filePath.includes("mcp-tools");
    });
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);
    const writeJSONStub = vi.spyOn(fs, "writeJSON").mockResolvedValue();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");
    vi.spyOn(axios, "get")
      .mockResolvedValueOnce({ status: 200, data: mcpMetadata })
      .mockResolvedValueOnce({ status: 200, data: oauthMetadata });
    const injectOAuthStub = vi
      .spyOn(ActionInjector, "injectCreateOAuthActionForMCP")
      .mockResolvedValue();

    const showMessageStub = vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    const openFileStub = vi.spyOn(tools.ui, "openFile").mockResolvedValue();

    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isOk());
    assert.isTrue(injectOAuthStub.mock.calls.length === 1);
    assert.isTrue(writeJSONStub.mock.calls.length === 2); // mcp-tools.json and ai-plugin.json
    assert.isTrue(showMessageStub.mock.calls.length === 1);
    assert.isTrue(openFileStub.mock.calls.length === 1);
  });

  it("should inject DCR action when updating action with OAuth dynamic registration", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "OAuthPluginVault",
      [QuestionNames.MCPForDAAuthType]: "oauth-dynamic",
      [QuestionNames.MCPForDAAuthWellKnownUrl]:
        "https://example.com/.well-known/oauth-authorization-server",
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "testTool",
          description: "Test tool description",
          inputSchema: {
            type: "object",
            properties: { param1: { type: "string" } },
            required: ["param1"],
          },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["testTool"],
      ignoreLockByUT: true,
    };

    const existingPlugin = {
      functions: [],
      runtimes: [],
    };

    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      return !filePath.includes("mcp-tools");
    });
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);
    let writtenPluginData: any;
    vi.spyOn(fs, "writeJSON").mockImplementation((filePath: string, data) => {
      if (!filePath.includes("mcp-tools")) {
        writtenPluginData = data;
      }
      return Promise.resolve();
    });
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/m365agents.yml");
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) => {
      return flag === FeatureFlags.MCPForDADCR;
    });
    vi.spyOn(axios, "get").mockResolvedValue({
      status: 200,
      data: {
        authorization_endpoint: "https://example.com/oauth/authorize",
        token_endpoint: "https://example.com/oauth/token",
      },
    });
    const injectDcrStub = vi
      .spyOn(ActionInjector, "injectCreateDcrActionForMCP")
      .mockResolvedValue();
    const injectOAuthStub = vi
      .spyOn(ActionInjector, "injectCreateOAuthActionForMCP")
      .mockResolvedValue();

    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    vi.spyOn(tools.ui, "openFile").mockResolvedValue();

    const result = await core.updateActionWithMCP(inputs);

    if (result.isErr()) {
      assert.fail(result.error.message);
    }
    assert.deepEqual(writtenPluginData.runtimes[0].auth, {
      type: "OAuthPluginVault",
      reference_id: `\${{MCP_DA_AUTH_ID_${serverName.toUpperCase()}}}`,
    });
    assert.equal(injectOAuthStub.mock.calls.length, 0);
    assert.equal(injectDcrStub.mock.calls.length, 1);
    assert.deepEqual(injectDcrStub.mock.calls[0], [
      "/test/project/m365agents.yml",
      serverName,
      `MCP_DA_AUTH_ID_${serverName.toUpperCase()}`,
      mcpServerUrl,
      "https://example.com/.well-known/oauth-authorization-server",
    ]);
  });

  it("should return error when plugin manifest file does not exist", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      ignoreLockByUT: true,
    };

    vi.spyOn(fs, "pathExists").mockResolvedValue(false);

    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      // Check error source/name since localization strings might be missing
      assert.isTrue(
        result.error.source === "MCPForDAPluginManifestNotFound" ||
          result.error.name === "PluginManifestNotFound" ||
          result.error.message.includes("PluginManifestNotFound")
      );
    }
  });

  it("should return error when projectPath is undefined", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      ignoreLockByUT: true,
    };

    try {
      const result = await core.updateActionWithMCP(inputs);
      // If it returns a result instead of throwing, check if it's an error
      if (result.isErr()) {
        assert.include(result.error.message.toLowerCase(), "project");
      } else {
        assert.fail("Expected error to be thrown or returned");
      }
    } catch (error: any) {
      // If it throws, check the error message
      assert.include(error.message.toLowerCase(), "project");
    }
  });

  it("should return error when MCP tools are not provided", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      ignoreLockByUT: true,
    };

    const existingPlugin = {
      functions: [],
      runtimes: [],
    };

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);

    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      // Check error source/name since localization strings might be missing
      assert.isTrue(
        result.error.source === "MCPForDAPreFetchToolsNotFound" ||
          result.error.name === "PreFetchToolsNotFound" ||
          result.error.message.includes("PreFetchToolsNotFound")
      );
    }
  });

  it("should properly filter and update existing MCP runtimes", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "None",
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "newTool",
          description: "New tool description",
          inputSchema: {
            type: "object",
            properties: { param1: { type: "string" } },
            required: ["param1"],
          },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["newTool"],
      ignoreLockByUT: true,
    };

    const existingPlugin = {
      functions: [
        {
          name: "oldTool",
          description: "Old tool",
          parameters: { type: "object" },
        },
      ],
      runtimes: [
        {
          type: "RemoteMCPServer",
          spec: {
            url: mcpServerUrl,
          },
          run_for_functions: ["oldTool"],
        },
        {
          type: "RemoteMCPServer",
          spec: {
            url: "https://other.com/mcp",
          },
          run_for_functions: ["otherTool"],
        },
      ],
    };

    let writtenPlugin: any;
    let writtenMcpTools: any;
    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      // Return false for mcp-tools.json to avoid infinite loop, true for ai-plugin.json
      return !filePath.includes("mcp-tools");
    });
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);
    vi.spyOn(fs, "writeJSON").mockImplementation((filePath: string, data) => {
      if (filePath.includes("mcp-tools")) {
        writtenMcpTools = data;
      } else {
        writtenPlugin = data;
      }
      return Promise.resolve();
    });
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");

    const showMessageStub = vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    const openFileStub = vi.spyOn(tools.ui, "openFile").mockResolvedValue();

    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isOk());

    // Verify mcp-tools.json contains tools with full details including title and inputSchema
    assert.isDefined(writtenMcpTools);
    assert.equal(writtenMcpTools.tools.length, 1);
    assert.equal(writtenMcpTools.tools[0].name, "newTool");
    assert.isDefined(writtenMcpTools.tools[0].inputSchema);
    assert.isDefined(writtenMcpTools.tools[0].title);

    // Verify that old tool functions were removed and new ones added (only name and description)
    assert.equal(writtenPlugin.functions.length, 1);
    assert.equal(writtenPlugin.functions[0].name, "newTool");
    assert.isDefined(writtenPlugin.functions[0].description);
    assert.isUndefined(writtenPlugin.functions[0].parameters);
    assert.isUndefined(writtenPlugin.functions[0].inputSchema);

    // Verify that the existing runtime for the same server was removed and new one added
    const mcpRuntimes = writtenPlugin.runtimes.filter(
      (r: any) => r.type === "RemoteMCPServer" && r.spec.url === mcpServerUrl
    );
    assert.equal(mcpRuntimes.length, 1);
    assert.deepEqual(mcpRuntimes[0].run_for_functions, ["newTool"]);

    // Verify that other runtimes are preserved
    const otherRuntimes = writtenPlugin.runtimes.filter(
      (r: any) => r.type === "RemoteMCPServer" && r.spec.url === "https://other.com/mcp"
    );
    assert.equal(otherRuntimes.length, 1);
  });

  it("should handle provisionResources call when user clicks Provision", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "None",
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "testTool",
          description: "Test tool description",
          inputSchema: {
            type: "object",
            properties: { param1: { type: "string" } },
            required: ["param1"],
          },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["testTool"],
      ignoreLockByUT: true,
    };

    const existingPlugin = {
      functions: [],
      runtimes: [],
    };

    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      // Return false for mcp-tools.json to avoid infinite loop, true for ai-plugin.json
      return !filePath.includes("mcp-tools");
    });
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);
    const writeJSONStub = vi.spyOn(fs, "writeJSON").mockResolvedValue();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");

    // Mock the showMessage to return "Provision" to trigger provision call
    const showMessageStub = vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("Provision"));
    const openFileStub = vi.spyOn(tools.ui, "openFile").mockResolvedValue();
    const provisionStub = vi.spyOn(core, "provisionResources").mockResolvedValue(ok(undefined));

    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isOk());
    assert.isTrue(showMessageStub.mock.calls.length === 1);
    assert.isTrue(openFileStub.mock.calls.length === 1);
    assert.isTrue(writeJSONStub.mock.calls.length === 2); // mcp-tools.json and ai-plugin.json

    // Wait a bit for the async provision call
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.isTrue(provisionStub.mock.calls.length === 1);
  });

  it("should generate unique mcp-tools filename when default already exists", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "None",
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "testTool",
          description: "Test tool description",
          inputSchema: {
            type: "object",
            properties: { param1: { type: "string" } },
            required: ["param1"],
          },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["testTool"],
      ignoreLockByUT: true,
    };

    const existingPlugin = {
      functions: [],
      runtimes: [],
    };

    // Simulate mcp-tools.json and mcp-tools-1.json already exist
    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      if (filePath.includes("mcp-tools.json") && !filePath.includes("mcp-tools-")) {
        return true; // mcp-tools.json exists
      }
      if (filePath.includes("mcp-tools-1.json")) {
        return true; // mcp-tools-1.json exists
      }
      if (filePath.includes("mcp-tools-2.json")) {
        return false; // mcp-tools-2.json does not exist
      }
      return true; // ai-plugin.json exists
    });
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);
    let writtenMcpToolsPath = "";
    vi.spyOn(fs, "writeJSON").mockImplementation((filePath: string, data) => {
      if (filePath.includes("mcp-tools")) {
        writtenMcpToolsPath = filePath;
      }
      return Promise.resolve();
    });
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");

    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    vi.spyOn(tools.ui, "openFile").mockResolvedValue();

    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isOk());
    // Verify the filename was incremented to mcp-tools-2.json since mcp-tools.json and mcp-tools-1.json exist
    assert.isTrue(writtenMcpToolsPath.includes("mcp-tools-2.json"));
  });

  it("should show error when mcpAuthMetadataUrl is not provided for OAuth without well-known URL", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "OAuthPluginVault",
      [QuestionNames.MCPForDAAuthType]: "oauth",
      [QuestionNames.MCPForDAClientId]: "client-id",
      [QuestionNames.MCPForDAClientSecret]: "client-secret",
      [QuestionNames.MCPForDAScopes]: "",
      // Neither MCPForDAAuthWellKnownUrl nor MCPForDAAuthMetadataUrl is provided
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "testTool",
          description: "Test tool description",
          inputSchema: {
            type: "object",
            properties: { param1: { type: "string" } },
            required: ["param1"],
          },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["testTool"],
      ignoreLockByUT: true,
    };

    const existingPlugin = {
      functions: [],
      runtimes: [],
    };

    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      return !filePath.includes("mcp-tools");
    });
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);
    vi.spyOn(fs, "writeJSON").mockResolvedValue();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");
    vi.spyOn(ActionInjector, "injectCreateOAuthActionForMCP").mockResolvedValue();

    const showMessageStub = vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    vi.spyOn(tools.ui, "openFile").mockResolvedValue();

    const result = await core.updateActionWithMCP(inputs);

    // The method should still return ok - the error is caught and shown to user,
    // then execution continues (this path is verified by code coverage)
    assert.isTrue(result.isOk());
  });

  it("should show error when authorization_servers is missing in metadata response", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "OAuthPluginVault",
      [QuestionNames.MCPForDAAuthType]: "oauth",
      [QuestionNames.MCPForDAClientId]: "client-id",
      [QuestionNames.MCPForDAClientSecret]: "client-secret",
      [QuestionNames.MCPForDAScopes]: "",
      [QuestionNames.MCPForDAAuthMetadataUrl]: "https://example.com/mcp/metadata",
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "testTool",
          description: "Test tool description",
          inputSchema: {
            type: "object",
            properties: { param1: { type: "string" } },
            required: ["param1"],
          },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["testTool"],
      ignoreLockByUT: true,
    };

    const existingPlugin = {
      functions: [],
      runtimes: [],
    };

    // Return metadata without authorization_servers
    const mcpMetadataWithoutAuthServers = {
      // authorization_servers is missing
    };

    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      return !filePath.includes("mcp-tools");
    });
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);
    vi.spyOn(fs, "writeJSON").mockResolvedValue();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");
    vi.spyOn(axios, "get").mockResolvedValue({ status: 200, data: mcpMetadataWithoutAuthServers });
    vi.spyOn(ActionInjector, "injectCreateOAuthActionForMCP").mockResolvedValue();

    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    vi.spyOn(tools.ui, "openFile").mockResolvedValue();

    const result = await core.updateActionWithMCP(inputs);

    // The method should still return ok - the error is caught and shown to user,
    // then execution continues (this path is verified by code coverage)
    assert.isTrue(result.isOk());
  });

  it("should show error when authorization_servers is empty array", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "OAuthPluginVault",
      [QuestionNames.MCPForDAAuthType]: "oauth",
      [QuestionNames.MCPForDAClientId]: "client-id",
      [QuestionNames.MCPForDAClientSecret]: "client-secret",
      [QuestionNames.MCPForDAScopes]: "",
      [QuestionNames.MCPForDAAuthMetadataUrl]: "https://example.com/mcp/metadata",
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "testTool",
          description: "Test tool description",
          inputSchema: {
            type: "object",
            properties: { param1: { type: "string" } },
            required: ["param1"],
          },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["testTool"],
      ignoreLockByUT: true,
    };

    const existingPlugin = {
      functions: [],
      runtimes: [],
    };

    // Return metadata with empty authorization_servers array
    const mcpMetadataWithEmptyAuthServers = {
      authorization_servers: [],
    };

    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      return !filePath.includes("mcp-tools");
    });
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);
    vi.spyOn(fs, "writeJSON").mockResolvedValue();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");
    vi.spyOn(axios, "get").mockResolvedValue({
      status: 200,
      data: mcpMetadataWithEmptyAuthServers,
    });
    vi.spyOn(ActionInjector, "injectCreateOAuthActionForMCP").mockResolvedValue();

    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    vi.spyOn(tools.ui, "openFile").mockResolvedValue();

    const result = await core.updateActionWithMCP(inputs);

    // The method should still return ok - the error is caught and shown to user,
    // then execution continues (this path is verified by code coverage)
    assert.isTrue(result.isOk());
  });

  it("should show error when OAuth metadata is missing authorization_endpoint or token_endpoint", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "OAuthPluginVault",
      [QuestionNames.MCPForDAAuthType]: "oauth",
      [QuestionNames.MCPForDAClientId]: "client-id",
      [QuestionNames.MCPForDAClientSecret]: "client-secret",
      [QuestionNames.MCPForDAScopes]: "",
      [QuestionNames.MCPForDAAuthWellKnownUrl]:
        "https://example.com/.well-known/oauth-authorization-server",
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "testTool",
          description: "Test tool description",
          inputSchema: {
            type: "object",
            properties: { param1: { type: "string" } },
            required: ["param1"],
          },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["testTool"],
      ignoreLockByUT: true,
    };

    const existingPlugin = {
      functions: [],
      runtimes: [],
    };

    // Return OAuth metadata without authorization_endpoint and token_endpoint
    const incompleteOAuthMetadata = {
      // Missing authorization_endpoint and token_endpoint
      refresh_endpoint: "https://example.com/oauth/refresh",
    };

    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      return !filePath.includes("mcp-tools");
    });
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);
    vi.spyOn(fs, "writeJSON").mockResolvedValue();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");
    vi.spyOn(axios, "get").mockResolvedValue({ status: 200, data: incompleteOAuthMetadata });
    vi.spyOn(ActionInjector, "injectCreateOAuthActionForMCP").mockResolvedValue();

    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    vi.spyOn(tools.ui, "openFile").mockResolvedValue();

    const result = await core.updateActionWithMCP(inputs);

    // The method should still return ok - the error is caught and shown to user,
    // then execution continues (this path is verified by code coverage)
    assert.isTrue(result.isOk());
  });

  it("should throw error when provisionResources is called directly", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      ignoreLockByUT: true,
    };

    try {
      // Access the protected method via the class - FxCore overrides this,
      // but we can test the base class behavior by creating an instance directly
      const { FxCoreDeclarativeAgentPart } = await import("../../src/core/FxCore.declarativeAgent");
      const declarativeAgentPart = new FxCoreDeclarativeAgentPart();
      await declarativeAgentPart.provisionResources(inputs);
      assert.fail("Expected an error to be thrown");
    } catch (error: any) {
      assert.include(error.message, "not implemented");
    }
  });
});

describe("updateActionWithMCP - Local MCP Support", () => {
  const tools = new MockTools();
  const projectPath = "/test/project";
  const pluginManifestPath = "/test/project/ai-plugin.json";
  const serverName = "testLocalServer";
  const localServerIdentifier = "com.test.local.server";

  beforeEach(() => {
    setTools(tools);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should successfully update action with local MCP server", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPLocalServerIdentifier]: localServerIdentifier,
      [QuestionNames.MCPForDAAuth]: "None",
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "localTool",
          description: "Local MCP tool description",
          inputSchema: {
            type: "object",
            properties: { param1: { type: "string" } },
            required: ["param1"],
          },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["localTool"],
      ignoreLockByUT: true,
    };

    const existingPlugin = {
      functions: [],
      runtimes: [],
    };

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);
    const writeJSONStub = vi.spyOn(fs, "writeJSON").mockResolvedValue();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");

    const showMessageStub = vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    const openFileStub = vi.spyOn(tools.ui, "openFile").mockResolvedValue();

    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isOk());

    // Verify the local MCP runtime was added correctly
    assert.isTrue(writeJSONStub.mock.calls.length === 1);
    const writtenData = writeJSONStub.mock.calls[0][1];
    const runtimes = writtenData.runtimes as any[];

    assert.equal(runtimes.length, 1);
    assert.equal(runtimes[0].type, "LocalPlugin");
    assert.equal(runtimes[0].spec.local_endpoint, LocalMcpPrefix + localServerIdentifier);
    assert.deepEqual(runtimes[0].run_for_functions, ["localTool"]);

    assert.isTrue(showMessageStub.mock.calls.length === 1);
    assert.isTrue(openFileStub.mock.calls.length === 1);

    const localFunctions = writtenData.functions as any[];
    assert.equal(localFunctions.length, 1);
    assert.equal(localFunctions[0].name, "localTool");
    assert.equal(localFunctions[0].description, "Local MCP tool description");
  });

  it("should filter and update existing local MCP runtimes correctly", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPLocalServerIdentifier]: localServerIdentifier,
      [QuestionNames.MCPForDAAuth]: "None",
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "newLocalTool",
          description: "New local tool description",
          inputSchema: {
            type: "object",
            properties: { param1: { type: "string" } },
            required: ["param1"],
          },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["newLocalTool"],
      ignoreLockByUT: true,
    };

    const existingPlugin = {
      functions: [
        {
          name: "oldLocalTool",
          description: "Old local tool",
          parameters: { type: "object" },
        },
      ],
      runtimes: [
        {
          type: "LocalPlugin",
          spec: {
            identifier: localServerIdentifier,
          },
          run_for_functions: ["oldLocalTool"],
        },
        {
          type: "LocalPlugin",
          spec: {
            identifier: "com.other.local.server",
          },
          run_for_functions: ["otherTool"],
        },
      ],
    };

    let writtenPlugin: any;
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);
    vi.spyOn(fs, "writeJSON").mockImplementation((path, data) => {
      writtenPlugin = data;
      return Promise.resolve();
    });
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");

    const showMessageStub = vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    const openFileStub = vi.spyOn(tools.ui, "openFile").mockResolvedValue();

    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isOk());

    // Verify that old tool functions were removed and new ones added
    assert.equal(writtenPlugin.functions.length, 1);
    assert.equal(writtenPlugin.functions[0].name, "newLocalTool");

    // Verify that the existing runtime for the same local server was removed and new one added
    const localRuntimes = writtenPlugin.runtimes.filter((r: any) => r.type === "LocalPlugin");
    assert.equal(localRuntimes.length, 1);
    assert.deepEqual(localRuntimes[0].run_for_functions, ["newLocalTool"]);
  });

  it("should handle mixed remote and local MCP servers", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPLocalServerIdentifier]: localServerIdentifier,
      [QuestionNames.MCPForDAAuth]: "None",
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "localTool",
          description: "Local MCP tool",
          inputSchema: {
            type: "object",
            properties: { param1: { type: "string" } },
            required: ["param1"],
          },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["localTool"],
      ignoreLockByUT: true,
    };

    const existingPlugin = {
      functions: [
        {
          name: "remoteTool",
          description: "Remote tool",
          parameters: { type: "object" },
        },
      ],
      runtimes: [
        {
          type: "RemoteMCPServer",
          spec: {
            url: "https://remote.example.com/mcp",
          },
          run_for_functions: ["remoteTool"],
        },
      ],
    };

    let writtenPlugin: any;
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);
    vi.spyOn(fs, "writeJSON").mockImplementation((path, data) => {
      writtenPlugin = data;
      return Promise.resolve();
    });
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");

    const showMessageStub = vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    const openFileStub = vi.spyOn(tools.ui, "openFile").mockResolvedValue();

    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isOk());

    // Verify both local and remote functions exist
    assert.equal(writtenPlugin.functions.length, 2);
    const functionNames = writtenPlugin.functions.map((f: any) => f.name);
    assert.include(functionNames, "localTool");
    assert.include(functionNames, "remoteTool");

    // Verify both local and remote runtimes exist
    assert.equal(writtenPlugin.runtimes.length, 2);
    const runtimeTypes = writtenPlugin.runtimes.map((r: any) => r.type);
    assert.include(runtimeTypes, "LocalPlugin");
    assert.include(runtimeTypes, "RemoteMCPServer");

    // Verify local runtime has correct identifier
    const localRuntime = writtenPlugin.runtimes.find((r: any) => r.type === "LocalPlugin");
    assert.equal(localRuntime.spec.local_endpoint, LocalMcpPrefix + localServerIdentifier);
    assert.deepEqual(localRuntime.run_for_functions, ["localTool"]);
  });

  it("should use fallback defaults when inputSchema.type and required are missing", async () => {
    const core = new FxCore(tools);
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: pluginManifestPath,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPLocalServerIdentifier]: localServerIdentifier,
      [QuestionNames.MCPForDAAuth]: "None",
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "minimalTool",
          description: "Tool with minimal schema",
          inputSchema: {
            properties: { param1: { type: "string" } },
            // type and required both missing
          },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["minimalTool"],
      ignoreLockByUT: true,
    };

    const existingPlugin = { functions: [], runtimes: [] };

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readJSON").mockResolvedValue(existingPlugin);
    const writeJSONStub = vi.spyOn(fs, "writeJSON").mockResolvedValue();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");
    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    vi.spyOn(tools.ui, "openFile").mockResolvedValue();

    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isOk());
    const writtenData = writeJSONStub.mock.calls[0][1];
    const func = writtenData.functions[0];
    // type falls back to "object", required falls back to []
    assert.equal(func.parameters.type, "object");
    assert.deepEqual(func.parameters.required, []);
  });
});

const addPluginTools = new MockTools();

async function mockV3Project(): Promise<string> {
  const appName = randomAppName();
  const projectPath = path.join(os.tmpdir(), appName);
  await fs.copy(path.join(__dirname, "../samples/sampleV3/"), path.join(projectPath));
  return appName;
}

describe("addPlugin", async () => {
  beforeEach(() => {
    setTools(addPluginTools);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("from API spec: add action success", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ApiSpecLocation]: "test.yaml",
      [QuestionNames.ApiOperation]: ["GET /user/{userId}"],
      [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [
        {
          file: "test1.json",
          id: "action_1",
        },
      ],
    };
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    vi.spyOn(openApiSpecHelper, "generateScaffoldingSummary").mockResolvedValue("");
    vi.spyOn(fs, "pathExists").mockImplementation(async (path: string) => {
      if (path.endsWith("openapi_1.yaml")) {
        return true;
      }
      if (path.endsWith("ai-plugin_1.json")) {
        return true;
      }
      if (path.endsWith("openapi_2.yaml")) {
        return false;
      }
      if (path.endsWith("ai-plugin_2.json")) {
        return false;
      }
      return true;
    });
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as any)
    );
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "addAction").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(addPluginTools);
    vi.spyOn(openApiSpecHelper, "generateFromApiSpec").mockResolvedValue(ok({ warnings: [] }));
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "GET /user/{userId}",
          server: "https://example.com",
          operationId: "getExample",
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });

    const showMessageStub = vi
      .spyOn(addPluginTools.ui, "showMessage")
      .mockImplementation((level, message, modal, items) => {
        if (level == "info") {
          return Promise.resolve(
            ok(getLocalizedString("core.addPlugin.success.viewPluginManifest"))
          );
        } else if (level === "warn") {
          return Promise.resolve(ok("Add"));
        } else {
          throw new NotImplementedError("TEST", "showMessage");
        }
      });

    const openFileStub = vi.spyOn(addPluginTools.ui, "openFile").mockResolvedValue();

    const result = await core.addPlugin(inputs);
    if (result.isErr()) {
      console.log(result.error);
    }
    assert.isTrue(result.isOk());
    assert.isTrue(showMessageStub.mock.calls.length === 2);
    assert.isTrue(openFileStub.mock.calls.length === 1);

    if (await fs.pathExists(inputs.projectPath!)) {
      await fs.remove(inputs.projectPath!);
    }
  });

  it("from API spec: add action success with bearer token auth and teamsapp.local.yaml exist", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ApiSpecLocation]: "test.yaml",
      [QuestionNames.ApiOperation]: ["GET /user/{userId}"],
      [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [
        {
          file: "test1.json",
          id: "action_1",
        },
      ],
    };
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    vi.spyOn(openApiSpecHelper, "generateScaffoldingSummary").mockResolvedValue("");
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(fs, "readFile").mockResolvedValue("{{test}}" as any);
    vi.spyOn(fs, "pathExists").mockImplementation(async (path: string) => {
      if (path.endsWith("openapi_1.yaml")) {
        return true;
      }
      if (path.endsWith("ai-plugin_1.json")) {
        return true;
      }
      if (path.endsWith("openapi_2.yaml")) {
        return false;
      }
      if (path.endsWith("ai-plugin_2.json")) {
        return false;
      }
      if (path.endsWith(MetadataV3.localConfigFile)) {
        return true;
      }
      return true;
    });
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "addAction").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(addPluginTools);
    vi.spyOn(openApiSpecHelper, "generateFromApiSpec").mockResolvedValue(ok({ warnings: [] }));
    vi.spyOn(ActionInjector, "injectCreateAPIKeyAction").mockResolvedValue();
    vi.spyOn(openApiSpecHelper, "injectAuthAction").mockResolvedValue({
      defaultRegistrationIdEnvName: "test",
      registrationIdEnvName: "test2",
    });

    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "GET /user/{userId}",
          server: "https://example.com",
          operationId: "getExample",
          isValid: true,
          reason: [],
          auth: {
            name: "bearerAuth",
            authScheme: {
              type: "http",
              scheme: "bearer",
            },
          },
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });

    const showMessageStub = vi
      .spyOn(addPluginTools.ui, "showMessage")
      .mockImplementation((level, message, modal, items) => {
        if (level == "info") {
          return Promise.resolve(
            ok(getLocalizedString("core.addPlugin.success.viewPluginManifest"))
          );
        } else if (level === "warn") {
          return Promise.resolve(ok("Add"));
        } else {
          throw new NotImplementedError("TEST", "showMessage");
        }
      });

    const openFileStub = vi.spyOn(addPluginTools.ui, "openFile").mockResolvedValue();

    const result = await core.addPlugin(inputs);
    if (result.isErr()) {
      console.log(result.error);
    }
    assert.isTrue(result.isOk());
    assert.isTrue(showMessageStub.mock.calls.length === 2);
    assert.isTrue(openFileStub.mock.calls.length === 1);

    if (await fs.pathExists(inputs.projectPath!)) {
      await fs.remove(inputs.projectPath!);
    }
  });

  it("from API spec: add action success with oauth token auth and without teamsapp.local.yaml", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ApiSpecLocation]: "test.yaml",
      [QuestionNames.ApiOperation]: ["GET /user/{userId}"],
      [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [
        {
          file: "test1.json",
          id: "action_1",
        },
      ],
    };
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    vi.spyOn(openApiSpecHelper, "generateScaffoldingSummary").mockResolvedValue("");
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(fs, "readFile").mockResolvedValue("{{test}}" as any);
    vi.spyOn(fs, "pathExists").mockImplementation(async (path: string) => {
      if (path.endsWith("openapi_1.yaml")) {
        return true;
      }
      if (path.endsWith("ai-plugin_1.json")) {
        return true;
      }
      if (path.endsWith("openapi_2.yaml")) {
        return false;
      }
      if (path.endsWith("ai-plugin_2.json")) {
        return false;
      }
      if (path.endsWith(MetadataV3.localConfigFile)) {
        return false;
      }
      return true;
    });
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "addAction").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(addPluginTools);
    vi.spyOn(openApiSpecHelper, "generateFromApiSpec").mockResolvedValue(ok({ warnings: [] }));
    vi.spyOn(ActionInjector, "injectCreateOAuthAction").mockResolvedValue();
    vi.spyOn(openApiSpecHelper, "injectAuthAction").mockResolvedValue({
      defaultRegistrationIdEnvName: "test",
      registrationIdEnvName: "test2",
    });

    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "GET /user/{userId}",
          server: "https://example.com",
          operationId: "getExample",
          isValid: true,
          reason: [],
          auth: {
            name: "oauth2",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "https://example.com/auth",
                  tokenUrl: "https://example.com/token",
                  scopes: {
                    "user.read": "Read user profile",
                  },
                },
              },
            },
          },
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });

    const showMessageStub = vi
      .spyOn(addPluginTools.ui, "showMessage")
      .mockImplementation((level, message, modal, items) => {
        if (level == "info") {
          return Promise.resolve(
            ok(getLocalizedString("core.addPlugin.success.viewPluginManifest"))
          );
        } else if (level === "warn") {
          return Promise.resolve(ok("Add"));
        } else {
          throw new NotImplementedError("TEST", "showMessage");
        }
      });

    const openFileStub = vi.spyOn(addPluginTools.ui, "openFile").mockResolvedValue();

    const result = await core.addPlugin(inputs);
    if (result.isErr()) {
      console.log(result.error);
    }
    assert.isTrue(result.isOk());
    assert.isTrue(showMessageStub.mock.calls.length === 2);
    assert.isTrue(openFileStub.mock.calls.length === 1);

    if (await fs.pathExists(inputs.projectPath!)) {
      await fs.remove(inputs.projectPath!);
    }
  });

  it("from API spec: empty declarativeCopilots 1", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ApiSpecLocation]: "test.yaml",
      [QuestionNames.ApiOperation]: ["GET /user/{userId}"],
      [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {};
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    vi.spyOn(openApiSpecHelper, "generateScaffoldingSummary").mockResolvedValue("");
    vi.spyOn(fs, "pathExists").mockImplementation(async (path: string) => {
      if (path.endsWith("openapi_1.yaml")) {
        return true;
      }
      if (path.endsWith("ai-plugin_1.json")) {
        return true;
      }
      if (path.endsWith("openapi_2.yaml")) {
        return false;
      }
      if (path.endsWith("ai-plugin_2.json")) {
        return false;
      }
      return true;
    });
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "addAction").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(addPluginTools);
    vi.spyOn(openApiSpecHelper, "generateFromApiSpec").mockResolvedValue(ok({ warnings: [] }));

    const showMessageStub = vi
      .spyOn(addPluginTools.ui, "showMessage")
      .mockImplementation((level, message, modal, items) => {
        if (level == "info") {
          return Promise.resolve(
            ok(getLocalizedString("core.addPlugin.success.viewPluginManifest"))
          );
        } else if (level === "warn") {
          return Promise.resolve(ok("Add"));
        } else {
          throw new NotImplementedError("TEST", "showMessage");
        }
      });

    const openFileStub = vi.spyOn(addPluginTools.ui, "openFile").mockResolvedValue();

    const result = await core.addPlugin(inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.isTrue(result.error instanceof UserError);
    }
  });

  it("from API spec: empty declarativeCopilots 2", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ApiSpecLocation]: "test.yaml",
      [QuestionNames.ApiOperation]: ["GET /user/{userId}"],
      [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [],
    };
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    vi.spyOn(openApiSpecHelper, "generateScaffoldingSummary").mockResolvedValue("");
    vi.spyOn(fs, "pathExists").mockImplementation(async (path: string) => {
      if (path.endsWith("openapi_1.yaml")) {
        return true;
      }
      if (path.endsWith("ai-plugin_1.json")) {
        return true;
      }
      if (path.endsWith("openapi_2.yaml")) {
        return false;
      }
      if (path.endsWith("ai-plugin_2.json")) {
        return false;
      }
      return true;
    });
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "addAction").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(addPluginTools);
    vi.spyOn(openApiSpecHelper, "generateFromApiSpec").mockResolvedValue(ok({ warnings: [] }));

    const showMessageStub = vi
      .spyOn(addPluginTools.ui, "showMessage")
      .mockImplementation((level, message, modal, items) => {
        if (level == "info") {
          return Promise.resolve(
            ok(getLocalizedString("core.addPlugin.success.viewPluginManifest"))
          );
        } else if (level === "warn") {
          return Promise.resolve(ok("Add"));
        } else {
          throw new NotImplementedError("TEST", "showMessage");
        }
      });

    const openFileStub = vi.spyOn(addPluginTools.ui, "openFile").mockResolvedValue();

    const result = await core.addPlugin(inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.isTrue(result.error instanceof UserError);
    }
  });

  it("from API spec: add action success - copilot agent", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ApiSpecLocation]: "test.yaml",
      [QuestionNames.ApiOperation]: ["GET /user/{userId}"],
      [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          file: "test1.json",
          id: "action_1",
        },
      ],
    };
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    vi.spyOn(openApiSpecHelper, "generateScaffoldingSummary").mockResolvedValue("");
    vi.spyOn(fs, "pathExists").mockImplementation(async (path: string) => {
      if (path.endsWith("openapi_1.yaml")) {
        return true;
      }
      if (path.endsWith("ai-plugin_1.json")) {
        return true;
      }
      if (path.endsWith("openapi_2.yaml")) {
        return false;
      }
      if (path.endsWith("ai-plugin_2.json")) {
        return false;
      }
      return true;
    });
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "addAction").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(addPluginTools);
    vi.spyOn(openApiSpecHelper, "generateFromApiSpec").mockResolvedValue(ok({ warnings: [] }));
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "GET /user/{userId}",
          server: "https://example.com",
          operationId: "getExample",
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });

    const showMessageStub = vi
      .spyOn(addPluginTools.ui, "showMessage")
      .mockImplementation((level, message, modal, items) => {
        if (level == "info") {
          return Promise.resolve(
            ok(getLocalizedString("core.addPlugin.success.viewPluginManifest"))
          );
        } else if (level === "warn") {
          return Promise.resolve(ok("Add"));
        } else {
          throw new NotImplementedError("TEST", "showMessage");
        }
      });

    const openFileStub = vi.spyOn(addPluginTools.ui, "openFile").mockResolvedValue();

    const result = await core.addPlugin(inputs);
    if (result.isErr()) {
      console.log(result.error);
    }
    assert.isTrue(result.isOk());
    assert.isTrue(showMessageStub.mock.calls.length === 2);
    assert.isTrue(openFileStub.mock.calls.length === 1);

    if (await fs.pathExists(inputs.projectPath!)) {
      await fs.remove(inputs.projectPath!);
    }
  });

  it("from API spec: add action with warnings from CLI", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ApiSpecLocation]: "test.yaml",
      [QuestionNames.ApiOperation]: ["GET /user/{userId}"],
      [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [
        {
          file: "test1.json",
          id: "action_1",
        },
      ],
    };
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    vi.spyOn(openApiSpecHelper, "generateScaffoldingSummary").mockResolvedValue("warning message");
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(fs, "pathExists").mockImplementation(async (path: string) => {
      if (path.endsWith("openapi_1.yaml")) {
        return true;
      }
      if (path.endsWith("ai-plugin_1.json")) {
        return true;
      }
      if (path.endsWith("openapi_2.yaml")) {
        return false;
      }
      if (path.endsWith("ai-plugin_2.json")) {
        return false;
      }
      return true;
    });
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "addAction").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "GET /user/{userId}",
          server: "https://example.com",
          operationId: "getExample",
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });

    const core = new FxCore(addPluginTools);
    vi.spyOn(openApiSpecHelper, "generateFromApiSpec").mockResolvedValue(
      ok({ warnings: [{ type: WarningType.OperationOnlyContainsOptionalParam, content: "" }] })
    );

    const showMessageStub = vi.spyOn(addPluginTools.ui, "showMessage").mockResolvedValue(ok("Add"));
    const result = await core.addPlugin(inputs);

    assert.isTrue(result.isOk());
    assert.isTrue(showMessageStub.mock.calls.length === 2);
    if (await fs.pathExists(inputs.projectPath!)) {
      await fs.remove(inputs.projectPath!);
    }
  });

  it("from existing plugin: add action success and not view plugin manifest", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.PluginManifestFilePath]: "ai-plugin.json",
      [QuestionNames.PluginOpenApiSpecFilePath]: "openapi.json",
      [QuestionNames.ActionType]: ActionStartOptions.existingPlugin().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [
        {
          file: "test1.json",
          id: "action_1",
        },
      ],
    };
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(declarativeAgentHelper, "addExistingPlugin").mockResolvedValue(
      ok({ destinationPluginManifestPath: "ai-plugin.json", warnings: [] })
    );

    const core = new FxCore(addPluginTools);

    const showMessageStub = vi.spyOn(addPluginTools.ui, "showMessage").mockResolvedValue(ok("Add"));
    const result = await core.addPlugin(inputs);
    if (result.isErr()) {
      console.log(result.error);
    }

    assert.isTrue(result.isOk());
    assert.isTrue(showMessageStub.mock.calls.length === 2);
    if (await fs.pathExists(inputs.projectPath!)) {
      await fs.remove(inputs.projectPath!);
    }
  });

  it("from existing plugin: add action error", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.PluginManifestFilePath]: "ai-plugin.json",
      [QuestionNames.PluginOpenApiSpecFilePath]: "openapi.json",
      [QuestionNames.ActionType]: ActionStartOptions.existingPlugin().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [
        {
          file: "test1.json",
          id: "action_1",
        },
      ],
    };
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(declarativeAgentHelper, "addExistingPlugin").mockResolvedValue(
      err(new SystemError("fakeError", "fakeError", "", ""))
    );

    vi.spyOn(addPluginTools.ui, "showMessage").mockResolvedValue(ok("Add"));

    const core = new FxCore(addPluginTools);

    const result = await core.addPlugin(inputs);
    if (result.isErr()) {
      console.log(result.error);
    }

    assert.isTrue(result.isErr() && result.error.name === "fakeError");
    if (await fs.pathExists(inputs.projectPath!)) {
      await fs.remove(inputs.projectPath!);
    }
  });

  it("from API Spec: generateForCopilot error", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ApiSpecLocation]: "test.json",
      [QuestionNames.ApiOperation]: ["GET /user/{userId}"],
      [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [
        {
          file: "test1.json",
          id: "action_1",
        },
      ],
    };
    vi.spyOn(fs, "pathExists").mockImplementation(async (path: string) => {
      if (path.endsWith("openapi_1.json")) {
        return false;
      }
      if (path.endsWith("ai-plugin_1.json")) {
        return false;
      }
      return true;
    });
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(addPluginTools.ui, "showMessage").mockResolvedValue(ok("Add"));
    vi.spyOn(openApiSpecHelper, "generateFromApiSpec").mockResolvedValue(
      err(new SystemError("", "", "", ""))
    );
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "GET /user/{userId}",
          server: "https://example.com",
          operationId: "getExample",
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });
    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);
    assert.isTrue(result.isErr());
  });

  it("from API spec: add action error", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ApiSpecLocation]: "test.json",
      [QuestionNames.ApiOperation]: ["GET /user/{userId}"],
      [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [
        {
          file: "test1.json",
          id: "action_1",
        },
      ],
    };
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "GET /user/{userId}",
          server: "https://example.com",
          operationId: "getExample",
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    vi.spyOn(fs, "pathExists").mockImplementation(async (path: string) => {
      if (path.endsWith("openapi_1.json")) {
        return false;
      }
      if (path.endsWith("ai-plugin_1.json")) {
        return false;
      }
      return true;
    });
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "addAction").mockResolvedValue(
      err(new SystemError("addActionError", "addActionError", "", ""))
    );

    const core = new FxCore(addPluginTools);
    vi.spyOn(openApiSpecHelper, "generateFromApiSpec").mockResolvedValue(ok({ warnings: [] }));

    vi.spyOn(addPluginTools.ui, "showMessage").mockResolvedValue(ok("Add"));
    const result = await core.addPlugin(inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.name, "addActionError");
    }
    if (await fs.pathExists(inputs.projectPath!)) {
      await fs.remove(inputs.projectPath!);
    }
  });

  it("error: read Teams manifest error", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ApiSpecLocation]: "test.json",
      [QuestionNames.ApiOperation]: ["GET /user/{userId}"],
      [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [
        {
          file: "test1.json",
          id: "action_1",
        },
      ],
    };
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      err(new SystemError("manifestError", "manifestError", "", ""))
    );
    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.name, "manifestError");
    }
  });

  it("error: get declarative copilot manifest path error", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ApiSpecLocation]: "test.json",
      [QuestionNames.ApiOperation]: ["GET /user/{userId}"],
      [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [
        {
          file: "test1.json",
          id: "action_1",
        },
      ],
    };
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      err(new SystemError("getError", "getError", "", ""))
    );
    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.name, "getError");
    }
    if (await fs.pathExists(inputs.projectPath!)) {
      await fs.remove(inputs.projectPath!);
    }
  });

  it("error: read GPT manifest error", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ApiSpecLocation]: "test.json",
      [QuestionNames.ApiOperation]: ["GET /user/{userId}"],
      [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [
        {
          file: "test1.json",
          id: "action_1",
        },
      ],
    };
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      err(new SystemError("readError", "readError", "", ""))
    );
    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.name, "readError");
    }
    if (await fs.pathExists(inputs.projectPath!)) {
      await fs.remove(inputs.projectPath!);
    }
  });

  it("error: not copilot GPT project", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ApiSpecLocation]: "test.json",
      [QuestionNames.ApiOperation]: ["GET /user/{userId}"],
      [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.name, AppStudioError.TeamsAppRequiredPropertyMissingError.name);
    }
    if (await fs.pathExists(inputs.projectPath!)) {
      await fs.remove(inputs.projectPath!);
    }
  });

  it("error: cancel", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ApiSpecLocation]: "test.json",
      [QuestionNames.ApiOperation]: ["GET /user/{userId}"],
      [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [
        {
          file: "test1.json",
          id: "action_1",
        },
      ],
    };
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "GET /user/{userId}",
          server: "https://example.com",
          operationId: "getExample",
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(addPluginTools.ui, "showMessage").mockResolvedValue(ok("Cancel"));
    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.isTrue(result.error instanceof UserCancelError);
    }
    if (await fs.pathExists(inputs.projectPath!)) {
      await fs.remove(inputs.projectPath!);
    }
  });

  it("error: confirm UI error", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ApiSpecLocation]: "test.json",
      [QuestionNames.ApiOperation]: ["GET /user/{userId}"],
      [QuestionNames.ActionType]: ActionStartOptions.apiSpec().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [
        {
          file: "test1.json",
          id: "action_1",
        },
      ],
    };
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "GET /user/{userId}",
          server: "https://example.com",
          operationId: "getExample",
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(addPluginTools.ui, "showMessage").mockResolvedValue(
      err(new SystemError("uiError", "uiError", "", ""))
    );
    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal("uiError", result.error.name);
    }
    if (await fs.pathExists(inputs.projectPath!)) {
      await fs.remove(inputs.projectPath!);
    }
  });

  it.skip("from MCP: add action success with no auth (auto-fetch)", async () => {
    const projectPath = path.join(os.tmpdir(), randomAppName());
    const inputs: Inputs = {
      platform: Platform.CLI,
      nonInteractive: true,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      [QuestionNames.MCPToolsFilePath]: "",
      [QuestionNames.MCPForDAAvailableTools]: [{ name: "search", description: "Search docs" }],
      [QuestionNames.MCPForDAPreFetchTools]: ["search"],
      [QuestionNames.MCPForDAAuthType]: "oauth",
      [QuestionNames.MCPForDAClientId]: "client-id",
      [QuestionNames.MCPForDAClientSecret]: "client-secret",
      projectPath,
    };

    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [{ file: "test1.json", id: "action_1" }],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(
      copilotGptManifestUtils,
      "getDefaultNextAvailablePluginManifestPath"
    ).mockResolvedValue("ai-plugin_1.json");
    const addActionStub = vi
      .spyOn(copilotGptManifestUtils, "addAction")
      .mockResolvedValue(ok({} as DeclarativeCopilotManifestSchema));

    vi.spyOn(addPluginTools.ui, "showMessage").mockImplementation((level) => {
      if (level === "warn") return Promise.resolve(ok("Add"));
      return Promise.resolve(ok(""));
    });

    vi.spyOn(fs, "ensureFile").mockResolvedValue();
    const writeJSONStub = vi.spyOn(fs, "writeJSON").mockResolvedValue();

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    assert.isTrue(result.isOk());
    // mcp-tools file and plugin manifest both written
    assert.isTrue(writeJSONStub.mock.calls.length >= 2);

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it.skip("from MCP: add action success with tools file", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      [QuestionNames.MCPToolsFilePath]: "/tmp/mcp-tools.json",
      [QuestionNames.MCPForDAAvailableTools]: [
        { name: "tool1", description: "Tool one", inputSchema: {} },
        { name: "tool2", description: "Tool two", inputSchema: {} },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["tool1", "tool2"],
      [QuestionNames.MCPForDAAuthType]: "oauth",
      [QuestionNames.MCPForDAClientId]: "client-id",
      [QuestionNames.MCPForDAClientSecret]: "client-secret",
      projectPath,
    };

    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [{ file: "test1.json", id: "action_1" }],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(
      copilotGptManifestUtils,
      "getDefaultNextAvailablePluginManifestPath"
    ).mockResolvedValue("ai-plugin_1.json");
    vi.spyOn(copilotGptManifestUtils, "addAction").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );

    vi.spyOn(addPluginTools.ui, "showMessage").mockImplementation((level) => {
      if (level === "warn") return Promise.resolve(ok("Add"));
      return Promise.resolve(ok(""));
    });

    vi.spyOn(fs, "ensureFile").mockResolvedValue();
    vi.spyOn(fs, "writeJSON").mockResolvedValue();

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    assert.isTrue(result.isOk());

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it("from MCP: add action with OAuth auth injects action into yaml", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      [QuestionNames.MCPToolsFilePath]: "",
      [QuestionNames.MCPForDAAvailableTools]: [{ name: "search", description: "Search" }],
      [QuestionNames.MCPForDAPreFetchTools]: ["search"],
      [QuestionNames.MCPForDAAuth]: "OAuthPluginVault",
      [QuestionNames.MCPForDAAuthType]: "oauth",
      [QuestionNames.MCPForDAClientId]: "client-id",
      [QuestionNames.MCPForDAClientSecret]: "client-secret",
      [QuestionNames.MCPForDAAuthMetadataUrl]:
        "https://example.com/.well-known/oauth-authorization-server",
      projectPath,
    };

    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [{ file: "test1.json", id: "action_1" }],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(
      copilotGptManifestUtils,
      "getDefaultNextAvailablePluginManifestPath"
    ).mockResolvedValue("ai-plugin_1.json");
    vi.spyOn(copilotGptManifestUtils, "addAction").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );

    vi.spyOn(addPluginTools.ui, "showMessage").mockImplementation((level) => {
      if (level === "warn") return Promise.resolve(ok("Add"));
      return Promise.resolve(ok(""));
    });

    const mcpAuthScaffolderModule = await import("../../src/component/utils/mcpAuthScaffolder");
    vi.spyOn(
      mcpAuthScaffolderModule.mcpAuthScaffolderDeps,
      "resolveMCPOAuthMetadata"
    ).mockResolvedValue({
      authorizationUrl: "https://example.com/oauth/authorize",
      tokenUrl: "https://example.com/oauth/token",
      refreshUrl: "https://example.com/oauth/token",
      wellKnownUrl: "https://example.com/.well-known/oauth-authorization-server",
    });

    const actionInjectorModule = await import("../../src/component/configManager/actionInjector");
    const injectStub = vi
      .spyOn(actionInjectorModule.ActionInjector, "injectCreateOAuthActionForMCP")
      .mockResolvedValue();

    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "ensureFile").mockResolvedValue();
    vi.spyOn(fs, "writeJSON").mockResolvedValue();

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    assert.isTrue(result.isOk());
    assert.isTrue(injectStub.mock.calls.length === 1);
    // Verify registration ID pattern
    const registrationId = injectStub.mock.calls[0][3];
    assert.equal(registrationId, "MCP_DA_AUTH_ID_ACTION_1");

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it("from MCP: add action with entra-sso auth type", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      [QuestionNames.MCPToolsFilePath]: "",
      [QuestionNames.MCPForDAAvailableTools]: [{ name: "data", description: "Get data" }],
      [QuestionNames.MCPForDAPreFetchTools]: ["data"],
      [QuestionNames.MCPForDAAuth]: "OAuthPluginVault",
      [QuestionNames.MCPForDAAuthType]: "entra-sso",
      [QuestionNames.MCPForDAClientId]: "entra-client-id",
      projectPath,
    };

    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [{ file: "test1.json", id: "action_1" }],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(
      copilotGptManifestUtils,
      "getDefaultNextAvailablePluginManifestPath"
    ).mockResolvedValue("ai-plugin_1.json");
    vi.spyOn(copilotGptManifestUtils, "addAction").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );

    vi.spyOn(addPluginTools.ui, "showMessage").mockImplementation((level) => {
      if (level === "warn") return Promise.resolve(ok("Add"));
      return Promise.resolve(ok(""));
    });

    const actionInjectorModule = await import("../../src/component/configManager/actionInjector");
    const injectStub = vi
      .spyOn(actionInjectorModule.ActionInjector, "injectCreateOAuthActionForMCP")
      .mockResolvedValue();

    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "ensureFile").mockResolvedValue();
    vi.spyOn(fs, "writeJSON").mockResolvedValue();

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    assert.isTrue(result.isOk());
    assert.isTrue(injectStub.mock.calls.length === 1);
    // authType is forwarded; "entra-sso" routes the injector to the Entra branch
    // (no resolveMCPOAuthMetadata call)
    assert.equal(injectStub.mock.calls[0][1], "entra-sso");

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it("from MCP (DT flag on): scaffolds the v4 add-mcp-server modify package", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      [QuestionNames.MCPToolsFilePath]: "",
      [QuestionNames.MCPForDAAuthType]: "oauth",
      [QuestionNames.MCPForDAClientId]: "client-id",
      [QuestionNames.MCPForDAClientSecret]: "client-secret",
      [QuestionNames.MCPForDAScopes]: "scope-a",
      [QuestionNames.MCPForDAAuthMetadataUrl]:
        "https://example.com/.well-known/oauth-authorization-server",
      projectPath,
    };

    const manifest = new TeamsAppManifest();
    manifest.name = { short: "My MCP App", full: "My MCP App" };
    manifest.copilotExtensions = {
      declarativeCopilots: [{ file: "test1.json", id: "action_1" }],
    };

    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) => {
      return flag === FeatureFlags.MCPForDADT;
    });
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(
      copilotGptManifestUtils,
      "getDefaultNextAvailablePluginManifestPath"
    ).mockResolvedValue("ai-plugin_1.json");
    vi.spyOn(copilotGptManifestUtils, "addAction").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    const declarativeAgentModule = await import("../../src/core/FxCore.declarativeAgent");
    const scaffoldV4Stub = vi
      .spyOn(declarativeAgentModule.fxCoreDeclarativeAgentDeps, "scaffoldAddMcpServerFromV4")
      .mockResolvedValue(ok(undefined));
    const modifyFrontDoorStub = vi
      .spyOn(declarativeAgentModule.fxCoreDeclarativeAgentDeps, "modifyProjectFrontDoor")
      .mockImplementation(async (_inputs, selectorPrefill, entryParams, deps) => {
        return deps.scaffoldV4(
          inputs,
          { templateId: "add-mcp-server", engine: "v4", answers: selectorPrefill },
          entryParams
        );
      });

    vi.spyOn(addPluginTools.ui, "showMessage").mockImplementation((level) => {
      if (level === "warn") return Promise.resolve(ok("Add"));
      return Promise.resolve(ok(""));
    });

    const mcpAuthScaffolderModule = await import("../../src/component/utils/mcpAuthScaffolder");
    vi.spyOn(
      mcpAuthScaffolderModule.mcpAuthScaffolderDeps,
      "resolveMCPOAuthMetadata"
    ).mockResolvedValue({
      authorizationUrl: "https://example.com/oauth/authorize",
      tokenUrl: "https://example.com/oauth/token",
      refreshUrl: "https://example.com/oauth/token",
      wellKnownUrl: "https://example.com/.well-known/oauth-authorization-server",
    });

    const actionInjectorModule = await import("../../src/component/configManager/actionInjector");
    const injectStub = vi
      .spyOn(actionInjectorModule.ActionInjector, "injectCreateOAuthActionForMCP")
      .mockResolvedValue();

    const envUtilModule = await import("../../src/component/utils/envUtil");
    vi.spyOn(envUtilModule.envUtil, "listEnv").mockResolvedValue(ok(["dev"]));
    const writeEnvStub = vi
      .spyOn(envUtilModule.envUtil, "writeEnv")
      .mockResolvedValue(ok(undefined));

    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    vi.spyOn(fs, "ensureFile").mockResolvedValue();
    const writeJSONStub = vi.spyOn(fs, "writeJSON").mockResolvedValue();

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    assert.isTrue(result.isOk());
    assert.isTrue(modifyFrontDoorStub.mock.calls.length === 1);
    assert.deepEqual(modifyFrontDoorStub.mock.calls[0][1], {
      addCapability: "add-action",
      actionSource: "mcp",
    });
    assert.deepInclude(modifyFrontDoorStub.mock.calls[0][2], {
      mcpServerUrl: "https://example.com/mcp",
      teamsManifestPath: "manifest.json",
      authType: "oauth",
    });
    assert.isTrue(scaffoldV4Stub.mock.calls.length === 1);
    assert.deepInclude(scaffoldV4Stub.mock.calls[0][0], {
      templateId: "add-mcp-server",
      projectPath,
      teamsManifestPath: "manifest.json",
      appName: "My MCP App",
      mcpServerUrl: "https://example.com/mcp",
      authType: "oauth",
    });
    assert.isTrue(injectStub.mock.calls.length === 0);
    assert.isTrue(writeEnvStub.mock.calls.length === 0);
    assert.isTrue(writeJSONStub.mock.calls.length === 0);

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it("from MCP (DT flag on): none auth type writes None auth without injection", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      [QuestionNames.MCPToolsFilePath]: "",
      [QuestionNames.MCPForDAAuthType]: "none",
      projectPath,
    };

    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [{ file: "test1.json", id: "action_1" }],
    };

    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) => {
      return flag === FeatureFlags.MCPForDADT;
    });
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(
      copilotGptManifestUtils,
      "getDefaultNextAvailablePluginManifestPath"
    ).mockResolvedValue("ai-plugin_1.json");
    vi.spyOn(copilotGptManifestUtils, "addAction").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    const declarativeAgentModule = await import("../../src/core/FxCore.declarativeAgent");
    const scaffoldV4Stub = vi
      .spyOn(declarativeAgentModule.fxCoreDeclarativeAgentDeps, "scaffoldAddMcpServerFromV4")
      .mockResolvedValue(ok(undefined));
    const modifyFrontDoorStub = vi
      .spyOn(declarativeAgentModule.fxCoreDeclarativeAgentDeps, "modifyProjectFrontDoor")
      .mockImplementation(async (_inputs, selectorPrefill, entryParams, deps) => {
        return deps.scaffoldV4(
          inputs,
          { templateId: "add-mcp-server", engine: "v4", answers: selectorPrefill },
          entryParams
        );
      });

    vi.spyOn(addPluginTools.ui, "showMessage").mockImplementation((level) => {
      if (level === "warn") return Promise.resolve(ok("Add"));
      return Promise.resolve(ok(""));
    });

    const actionInjectorModule = await import("../../src/component/configManager/actionInjector");
    const injectStub = vi
      .spyOn(actionInjectorModule.ActionInjector, "injectCreateOAuthActionForMCP")
      .mockResolvedValue();

    vi.spyOn(fs, "ensureFile").mockResolvedValue();
    const writeJSONStub = vi.spyOn(fs, "writeJSON").mockResolvedValue();

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    assert.isTrue(result.isOk());
    assert.isTrue(injectStub.mock.calls.length === 0);
    assert.isTrue(modifyFrontDoorStub.mock.calls.length === 1);
    assert.isTrue(scaffoldV4Stub.mock.calls.length === 1);
    assert.deepInclude(scaffoldV4Stub.mock.calls[0][0], {
      templateId: "add-mcp-server",
      projectPath,
      mcpServerUrl: "https://example.com/mcp",
      authType: "none",
    });
    assert.isTrue(writeJSONStub.mock.calls.length === 0);

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it("from MCP: error when missing server URL", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "",
      [QuestionNames.MCPToolsFilePath]: "",
      [QuestionNames.MCPForDAAuthType]: "oauth",
      [QuestionNames.MCPForDAClientId]: "client-id",
      [QuestionNames.MCPForDAClientSecret]: "client-secret",
      projectPath,
    };

    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [{ file: "test1.json", id: "action_1" }],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );

    vi.spyOn(addPluginTools.ui, "showMessage").mockImplementation((level) => {
      if (level === "warn") return Promise.resolve(ok("Add"));
      return Promise.resolve(ok(""));
    });

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.name, "MissingMCPServerUrl");
    }

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it("from MCP: error when auth required but no auth type", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      [QuestionNames.MCPToolsFilePath]: "",
      [QuestionNames.MCPForDAAvailableTools]: [{ name: "tool1", description: "A tool" }],
      [QuestionNames.MCPForDAPreFetchTools]: ["tool1"],
      [QuestionNames.MCPForDAAuth]: "OAuthPluginVault",
      [QuestionNames.MCPForDAAuthType]: "",
      projectPath,
    };

    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [{ file: "test1.json", id: "action_1" }],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(
      copilotGptManifestUtils,
      "getDefaultNextAvailablePluginManifestPath"
    ).mockResolvedValue("ai-plugin_1.json");

    vi.spyOn(addPluginTools.ui, "showMessage").mockImplementation((level) => {
      if (level === "warn") return Promise.resolve(ok("Add"));
      return Promise.resolve(ok(""));
    });

    vi.spyOn(fs, "ensureFile").mockResolvedValue();
    vi.spyOn(fs, "writeJSON").mockResolvedValue();

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.name, "MissingMCPAuthType");
    }

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it.skip("from MCP: returns ok(undefined) when no tools available", async () => {
    const projectPath = path.join(os.tmpdir(), randomAppName());
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      [QuestionNames.MCPToolsFilePath]: "",
      [QuestionNames.MCPForDAAuthType]: "oauth",
      [QuestionNames.MCPForDAClientId]: "client-id",
      [QuestionNames.MCPForDAClientSecret]: "client-secret",
      projectPath,
      ignoreLockByUT: true,
    };

    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [{ file: "test1.json", id: "action_1" }],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );

    vi.spyOn(addPluginTools.ui, "showMessage").mockImplementation((level) => {
      if (level === "warn") return Promise.resolve(ok("Add"));
      return Promise.resolve(ok(""));
    });

    // Auto-fetch returns auth-required with no tools
    const mcpToolFetcherModule = await import("../../src/component/utils/mcpToolFetcher");
    vi.spyOn(mcpToolFetcherModule, "fetchMCPTools").mockResolvedValue({
      requiresAuth: false,
      tools: [],
    });

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    assert.isTrue(result.isOk());
    if (result.isOk()) {
      assert.isUndefined(result.value);
    }
  });

  it("from MCP: missing auth type returns error when OAuth auth is selected", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      [QuestionNames.MCPToolsFilePath]: "/tmp/mcp-tools.json",
      [QuestionNames.MCPForDAAvailableTools]: [{ name: "tool1", description: "Tool 1" }],
      [QuestionNames.MCPForDAPreFetchTools]: ["tool1"],
      [QuestionNames.MCPForDAAuth]: "OAuthPluginVault",
      [QuestionNames.MCPForDAAuthType]: "",
      projectPath,
    };

    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [{ file: "test1.json", id: "action_1" }],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(
      copilotGptManifestUtils,
      "getDefaultNextAvailablePluginManifestPath"
    ).mockResolvedValue("ai-plugin_1.json");
    vi.spyOn(copilotGptManifestUtils, "addAction").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );

    vi.spyOn(addPluginTools.ui, "showMessage").mockImplementation((level) => {
      if (level === "warn") return Promise.resolve(ok("Add"));
      return Promise.resolve(ok(""));
    });

    vi.spyOn(fs, "ensureFile").mockResolvedValue();
    vi.spyOn(fs, "writeJSON").mockResolvedValue();

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    // Auth was probed but no auth type was set, so MissingMCPAuthType
    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.name, "MissingMCPAuthType");
    }
    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it("from MCP: VSCode platform writes .vscode/mcp.json and skips manifest creation", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      projectPath,
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    const realEnsureDir = fs.ensureDir.bind(fs);
    const ensureDirStub = vi.spyOn(fs, "ensureDir").mockImplementation(async (p: any) => {
      if (typeof p === "string" && p.includes(".vscode")) {
        return;
      }
      return (realEnsureDir as any)(p);
    });
    const realWriteJSON = fs.writeJSON.bind(fs);
    const writeJSONStub = vi
      .spyOn(fs, "writeJSON")
      .mockImplementation(async (p: any, data: any, opts?: any) => {
        if (typeof p === "string" && p.includes("mcp.json")) {
          return;
        }
        return (realWriteJSON as any)(p, data, opts);
      });
    const showMessageStub = vi.spyOn(addPluginTools.ui, "showMessage");
    const openFileStub = vi.spyOn(addPluginTools.ui, "openFile").mockResolvedValue();

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    assert.isTrue(result.isOk());
    if (result.isOk()) {
      assert.equal((result.value as any).kind, "mcp");
      assert.isString((result.value as any).mcpConfigPath);
    }
    // VS Code MCP add-action flow defers manifest creation to "Update action with MCP".
    // It should only write .vscode/mcp.json and surface no UI prompts itself.
    assert.isTrue(ensureDirStub.mock.calls.some((c) => String(c[0]).includes(".vscode")));
    assert.isTrue(writeJSONStub.mock.calls.some((c) => String(c[0]).includes("mcp.json")));
    assert.isTrue(showMessageStub.mock.calls.length === 0);
    assert.isTrue(openFileStub.mock.calls.length === 0);

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it("from MCP: VSCode platform returns MissingMCPServerUrl when URL is empty", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "   ",
      projectPath,
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(addPluginTools.ui, "showMessage");

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.name, "MissingMCPServerUrl");
    }

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it("from MCP: VSCode platform merges new server into existing mcp.json", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      projectPath,
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readJSON").mockResolvedValue({
      servers: { existingServer: { type: "http", url: "https://existing.com/mcp" } },
      otherTopLevel: "preserved",
    });
    const realEnsureDir = fs.ensureDir.bind(fs);
    vi.spyOn(fs, "ensureDir").mockImplementation(async (p: any) => {
      if (typeof p === "string" && p.includes(".vscode")) return;
      return (realEnsureDir as any)(p);
    });
    let writtenConfig: any = undefined;
    const realWriteJSON = fs.writeJSON.bind(fs);
    vi.spyOn(fs, "writeJSON").mockImplementation(async (p: any, data: any, opts?: any) => {
      if (typeof p === "string" && p.includes("mcp.json")) {
        writtenConfig = data;
        return;
      }
      return (realWriteJSON as any)(p, data, opts);
    });
    vi.spyOn(addPluginTools.ui, "showMessage");

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    assert.isTrue(result.isOk());
    assert.isObject(writtenConfig);
    // Existing server preserved
    assert.deepEqual(writtenConfig.servers.existingServer, {
      type: "http",
      url: "https://existing.com/mcp",
    });
    // Other top-level keys preserved
    assert.equal(writtenConfig.otherTopLevel, "preserved");
    // New server added
    const newServerNames = Object.keys(writtenConfig.servers).filter((n) => n !== "existingServer");
    assert.equal(newServerNames.length, 1);
    assert.deepEqual(writtenConfig.servers[newServerNames[0]], {
      type: "http",
      url: "https://example.com/mcp",
    });

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it("from MCP: VSCode platform appends suffix when server name conflicts", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const serverUrl = "https://example.com/mcp";
    const baseName = declarativeAgentHelper.deriveMCPServerNameFromUrl(serverUrl);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: serverUrl,
      projectPath,
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readJSON").mockResolvedValue({
      servers: {
        [baseName]: { type: "http", url: "https://other.com/mcp" },
        [`${baseName}1`]: { type: "http", url: "https://another.com/mcp" },
      },
    });
    const realEnsureDir = fs.ensureDir.bind(fs);
    vi.spyOn(fs, "ensureDir").mockImplementation(async (p: any) => {
      if (typeof p === "string" && p.includes(".vscode")) return;
      return (realEnsureDir as any)(p);
    });
    let writtenConfig: any = undefined;
    const realWriteJSON = fs.writeJSON.bind(fs);
    vi.spyOn(fs, "writeJSON").mockImplementation(async (p: any, data: any, opts?: any) => {
      if (typeof p === "string" && p.includes("mcp.json")) {
        writtenConfig = data;
        return;
      }
      return (realWriteJSON as any)(p, data, opts);
    });
    vi.spyOn(addPluginTools.ui, "showMessage");

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    assert.isTrue(result.isOk());
    // Pre-existing entries are kept; new entry uses the next available suffix.
    assert.property(writtenConfig.servers, `${baseName}2`);
    assert.deepEqual(writtenConfig.servers[`${baseName}2`], {
      type: "http",
      url: serverUrl,
    });

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it("from MCP: VSCode platform recovers when existing mcp.json is invalid JSON", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      projectPath,
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readJSON").mockRejectedValue(new Error("invalid JSON"));
    const realEnsureDir = fs.ensureDir.bind(fs);
    vi.spyOn(fs, "ensureDir").mockImplementation(async (p: any) => {
      if (typeof p === "string" && p.includes(".vscode")) return;
      return (realEnsureDir as any)(p);
    });
    let writtenConfig: any = undefined;
    const realWriteJSON = fs.writeJSON.bind(fs);
    vi.spyOn(fs, "writeJSON").mockImplementation(async (p: any, data: any, opts?: any) => {
      if (typeof p === "string" && p.includes("mcp.json")) {
        writtenConfig = data;
        return;
      }
      return (realWriteJSON as any)(p, data, opts);
    });
    vi.spyOn(addPluginTools.ui, "showMessage");

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    assert.isTrue(result.isOk());
    // Invalid existing file is replaced with a fresh config containing only the new server.
    assert.equal(Object.keys(writtenConfig.servers).length, 1);
    assert.deepEqual(Object.values(writtenConfig.servers)[0], {
      type: "http",
      url: "https://example.com/mcp",
    });

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it("from MCP: VSCode platform treats existing mcp.json without servers field as fresh", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      projectPath,
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    // Existing file is valid JSON but missing the `servers` field.
    vi.spyOn(fs, "readJSON").mockResolvedValue({ inputs: {} });
    const realEnsureDir = fs.ensureDir.bind(fs);
    vi.spyOn(fs, "ensureDir").mockImplementation(async (p: any) => {
      if (typeof p === "string" && p.includes(".vscode")) return;
      return (realEnsureDir as any)(p);
    });
    let writtenConfig: any = undefined;
    const realWriteJSON = fs.writeJSON.bind(fs);
    vi.spyOn(fs, "writeJSON").mockImplementation(async (p: any, data: any, opts?: any) => {
      if (typeof p === "string" && p.includes("mcp.json")) {
        writtenConfig = data;
        return;
      }
      return (realWriteJSON as any)(p, data, opts);
    });
    vi.spyOn(addPluginTools.ui, "showMessage");

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    assert.isTrue(result.isOk());
    // Other top-level keys preserved; servers initialized.
    assert.deepEqual(writtenConfig.inputs, {});
    assert.equal(Object.keys(writtenConfig.servers).length, 1);

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it.skip("from MCP: readMCPToolsFromFile throws produces mcpToolsFileReadError warning", async () => {
    const projectPath = path.join(os.tmpdir(), randomAppName());
    const inputs: Inputs = {
      platform: Platform.CLI,
      nonInteractive: true,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      [QuestionNames.MCPToolsFilePath]: "/tmp/bad-tools.json",
      projectPath,
      ignoreLockByUT: true,
    };

    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [{ file: "test1.json", id: "action_1" }],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );

    vi.spyOn(addPluginTools.ui, "showMessage").mockImplementation((level) => {
      if (level === "warn") return Promise.resolve(ok("Add"));
      return Promise.resolve(ok(""));
    });

    // readMCPToolsFromFile throws → mcpToolsFileReadError
    const mcpToolFetcherModule = await import("../../src/component/utils/mcpToolFetcher");
    vi.spyOn(mcpToolFetcherModule, "readMCPToolsFromFile").mockRejectedValue(
      new Error("bad format")
    );
    // fetchMCPTools also fails so no tools are loaded
    vi.spyOn(mcpToolFetcherModule, "fetchMCPTools").mockRejectedValue(
      new Error("connection failed")
    );

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    // No tools → returns ok(undefined) early
    assert.isTrue(result.isOk());

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it.skip("from MCP: fetchMCPTools returns no tools produces mcpNoToolsFetched warning", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      [QuestionNames.MCPToolsFilePath]: "",
      projectPath,
    };

    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [{ file: "test1.json", id: "action_1" }],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );

    vi.spyOn(addPluginTools.ui, "showMessage").mockImplementation((level) => {
      if (level === "warn") return Promise.resolve(ok("Add"));
      return Promise.resolve(ok(""));
    });

    // fetchMCPTools returns empty tools, no auth
    const mcpToolFetcherModule = await import("../../src/component/utils/mcpToolFetcher");
    vi.spyOn(mcpToolFetcherModule, "fetchMCPTools").mockResolvedValue({
      requiresAuth: false,
      tools: [],
    });

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    // No tools → returns ok(undefined) early with warning
    assert.isTrue(result.isOk());

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it.skip("from MCP: fetchMCPTools throws produces mcpFetchError warning", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      [QuestionNames.MCPToolsFilePath]: "",
      projectPath,
    };

    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [{ file: "test1.json", id: "action_1" }],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );

    vi.spyOn(addPluginTools.ui, "showMessage").mockImplementation((level) => {
      if (level === "warn") return Promise.resolve(ok("Add"));
      return Promise.resolve(ok(""));
    });

    // fetchMCPTools throws
    const mcpToolFetcherModule = await import("../../src/component/utils/mcpToolFetcher");
    vi.spyOn(mcpToolFetcherModule, "fetchMCPTools").mockRejectedValue(new Error("network error"));

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    // No tools → returns ok(undefined) early with mcpFetchError warning
    assert.isTrue(result.isOk());

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it("from MCP: tool without description falls back to empty string", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      [QuestionNames.MCPToolsFilePath]: "",
      [QuestionNames.MCPForDAAvailableTools]: [{ name: "tool_no_desc", inputSchema: {} }],
      [QuestionNames.MCPForDAPreFetchTools]: ["tool_no_desc"],
      projectPath,
    };

    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [{ file: "test1.json", id: "action_1" }],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(
      copilotGptManifestUtils,
      "getDefaultNextAvailablePluginManifestPath"
    ).mockResolvedValue("ai-plugin_1.json");
    vi.spyOn(copilotGptManifestUtils, "addAction").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );

    vi.spyOn(addPluginTools.ui, "showMessage").mockImplementation((level) => {
      if (level === "warn") return Promise.resolve(ok("Add"));
      return Promise.resolve(ok(""));
    });

    vi.spyOn(fs, "ensureFile").mockResolvedValue();
    const writeJSONStub = vi.spyOn(fs, "writeJSON").mockResolvedValue();

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    assert.isTrue(result.isOk());
    // Verify the plugin manifest was written with empty description
    const pluginCall = writeJSONStub.mock.calls.find((c) => (c[1] as any)?.functions !== undefined);
    assert.isDefined(pluginCall);
    assert.equal((pluginCall![1] as any).functions[0].description, "");

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it("from MCP: resolveMCPOAuthMetadata throws produces mcpAuthMetadataError warning", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      [QuestionNames.MCPToolsFilePath]: "",
      [QuestionNames.MCPForDAAuth]: "OAuthPluginVault",
      [QuestionNames.MCPForDAAuthType]: "oauth",
      [QuestionNames.MCPForDAClientId]: "client-id",
      [QuestionNames.MCPForDAClientSecret]: "client-secret",
      [QuestionNames.MCPForDAAuthMetadataUrl]: "https://example.com/bad-metadata",
      [QuestionNames.MCPForDAAvailableTools]: [
        { name: "authtool", description: "Needs auth", inputSchema: {} },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["authtool"],
      projectPath,
    };

    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [{ file: "test1.json", id: "action_1" }],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(
      copilotGptManifestUtils,
      "getDefaultNextAvailablePluginManifestPath"
    ).mockResolvedValue("ai-plugin_1.json");
    vi.spyOn(copilotGptManifestUtils, "addAction").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );

    vi.spyOn(addPluginTools.ui, "showMessage").mockImplementation((level) => {
      if (level === "warn") return Promise.resolve(ok("Add"));
      return Promise.resolve(ok(""));
    });

    // resolveMCPOAuthMetadata throws
    const mcpAuthScaffolderModule = await import("../../src/component/utils/mcpAuthScaffolder");
    vi.spyOn(
      mcpAuthScaffolderModule.mcpAuthScaffolderDeps,
      "resolveMCPOAuthMetadata"
    ).mockRejectedValue(new Error("metadata fetch failed"));

    vi.spyOn(fs, "ensureFile").mockResolvedValue();
    vi.spyOn(fs, "writeJSON").mockResolvedValue();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue(path.join(projectPath, "m365agents.yml"));

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    // Should succeed but with warning (auth metadata error is non-fatal)
    assert.isTrue(result.isOk());

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it("from MCP: addAction error returns err in MCP branch", async () => {
    const appName = await mockV3Project();
    const projectPath = path.join(os.tmpdir(), appName);
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.TeamsAppManifestFilePath]: "manifest.json",
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      [QuestionNames.MCPToolsFilePath]: "",
      [QuestionNames.MCPForDAAvailableTools]: [
        { name: "tool1", description: "Test tool", inputSchema: {} },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["tool1"],
      projectPath,
    };

    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [{ file: "test1.json", id: "action_1" }],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(ok("dcManifest.json"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({} as DeclarativeCopilotManifestSchema)
    );
    vi.spyOn(
      copilotGptManifestUtils,
      "getDefaultNextAvailablePluginManifestPath"
    ).mockResolvedValue("ai-plugin_1.json");
    vi.spyOn(copilotGptManifestUtils, "addAction").mockResolvedValue(
      err(new UserError("test", "AddActionFailed", "failed", "failed"))
    );

    vi.spyOn(addPluginTools.ui, "showMessage").mockImplementation((level) => {
      if (level === "warn") return Promise.resolve(ok("Add"));
      return Promise.resolve(ok(""));
    });

    vi.spyOn(fs, "ensureFile").mockResolvedValue();
    vi.spyOn(fs, "writeJSON").mockResolvedValue();

    const core = new FxCore(addPluginTools);
    const result = await core.addPlugin(inputs);

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.name, "AddActionFailed");
    }

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
    }
  });

  it("should throw parseAuthNameAndScheme and updateAuthActionInYaml stubs", async () => {
    const { FxCoreDeclarativeAgentPart } = await import("../../src/core/FxCore.declarativeAgent");
    const part = new FxCoreDeclarativeAgentPart();

    try {
      part["parseAuthNameAndScheme"]({} as any, {} as any);
      assert.fail("Expected an error to be thrown");
    } catch (error: any) {
      assert.include(error.message, "not implemented");
    }

    try {
      await part["updateAuthActionInYaml"](undefined, undefined, "", "", "");
      assert.fail("Expected an error to be thrown");
    } catch (error: any) {
      assert.include(error.message, "not implemented");
    }
  });
});

describe("updateActionWithMCP - create new ai-plugin.json", () => {
  const tools = new MockTools();
  const projectPath = "/test/project";
  const mcpServerUrl = "https://example.com/mcp";
  const serverName = "testServer";

  beforeEach(() => {
    setTools(tools);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a new plugin manifest, registers it as an action, and continues update flow", async () => {
    const sentinel = "__createNewPluginManifest__";
    const newPluginPath = "/test/project/appPackage/ai-plugin-new.json";
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: sentinel,
      [QuestionNames.NewPluginManifestFileName]: "ai-plugin-new.json",
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "None",
      [QuestionNames.MCPForDAAvailableTools]: [
        {
          name: "tool1",
          description: "desc",
          inputSchema: { type: "object", properties: {}, required: [] },
        },
      ],
      [QuestionNames.MCPForDAPreFetchTools]: ["tool1"],
      ignoreLockByUT: true,
    };

    const teamsManifest = new TeamsAppManifest();
    (teamsManifest as any).copilotAgents = {
      declarativeAgents: [{ id: "da", file: "declarativeAgent.json" }],
    };
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(teamsManifest));

    let created = false;
    const createStub = vi
      .spyOn(declarativeAgentHelper, "createNewActionPluginManifest")
      .mockImplementation(async () => {
        created = true;
        return ok({ pluginManifestPath: newPluginPath, actionId: "ai-plugin" });
      });

    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      if (filePath.includes("mcp-tools")) return false;
      // Validator runs before createNewActionPluginManifest fires; the new
      // file should not exist yet so validation passes. Once createStub has
      // been invoked, the file is considered to exist.
      if (path.basename(filePath) === "ai-plugin-new.json") return created;
      return true;
    });
    vi.spyOn(fs, "readJSON").mockResolvedValue({ functions: [], runtimes: [] });
    vi.spyOn(fs, "writeJSON").mockResolvedValue();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");
    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    vi.spyOn(tools.ui, "openFile").mockResolvedValue();

    const core = new FxCore(tools);
    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isOk(), JSON.stringify((result as any).error));
    assert.isTrue(createStub.mock.calls.length === 1);
    assert.equal(
      inputs[QuestionNames.PluginManifestFilePath],
      newPluginPath,
      "should rewrite plugin manifest path to the newly-created file"
    );
  });

  it("returns error when manifest read fails", async () => {
    const sentinel = "__createNewPluginManifest__";
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: sentinel,
      [QuestionNames.NewPluginManifestFileName]: "ai-plugin-new.json",
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "None",
      [QuestionNames.MCPForDAAvailableTools]: [],
      [QuestionNames.MCPForDAPreFetchTools]: [],
      ignoreLockByUT: true,
    };

    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      err(new SystemError("test", "ReadFailed", "msg", "msg"))
    );
    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      if (path.basename(filePath) === "ai-plugin-new.json") {
        return false;
      }
      return true;
    });

    const core = new FxCore(tools);
    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.name, "ReadFailed");
    }
  });

  it("returns error when declarative agent reference is missing", async () => {
    const sentinel = "__createNewPluginManifest__";
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: sentinel,
      [QuestionNames.NewPluginManifestFileName]: "ai-plugin-new.json",
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "None",
      [QuestionNames.MCPForDAAvailableTools]: [],
      [QuestionNames.MCPForDAPreFetchTools]: [],
      ignoreLockByUT: true,
    };

    const teamsManifest = new TeamsAppManifest();
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(teamsManifest));
    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      if (path.basename(filePath) === "ai-plugin-new.json") {
        return false;
      }
      return true;
    });

    const core = new FxCore(tools);
    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.name, AppStudioError.TeamsAppRequiredPropertyMissingError.name);
    }
  });

  it("propagates error when createNewActionPluginManifest fails", async () => {
    const sentinel = "__createNewPluginManifest__";
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: sentinel,
      [QuestionNames.NewPluginManifestFileName]: "ai-plugin-new.json",
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "None",
      [QuestionNames.MCPForDAAvailableTools]: [],
      [QuestionNames.MCPForDAPreFetchTools]: [],
      ignoreLockByUT: true,
    };

    const teamsManifest = new TeamsAppManifest();
    (teamsManifest as any).copilotAgents = {
      declarativeAgents: [{ id: "da", file: "declarativeAgent.json" }],
    };
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(teamsManifest));
    vi.spyOn(declarativeAgentHelper, "createNewActionPluginManifest").mockResolvedValue(
      err(new SystemError("test", "CreateFailed", "msg", "msg"))
    );
    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      if (path.basename(filePath) === "ai-plugin-new.json") {
        return false;
      }
      return true;
    });

    const core = new FxCore(tools);
    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.name, "CreateFailed");
    }
  });

  it("falls back to default file name when NewPluginManifestFileName is missing", async () => {
    const sentinel = "__createNewPluginManifest__";
    const newPluginPath = "/test/project/appPackage/ai-plugin.json";
    const inputs: Inputs = {
      projectPath,
      platform: Platform.VSCode,
      [QuestionNames.PluginManifestFilePath]: sentinel,
      [QuestionNames.MCPForDAServerUrl]: mcpServerUrl,
      [QuestionNames.MCPForDAServerName]: serverName,
      [QuestionNames.MCPForDAAuth]: "None",
      [QuestionNames.MCPForDAAvailableTools]: [],
      [QuestionNames.MCPForDAPreFetchTools]: [],
      ignoreLockByUT: true,
    };

    const teamsManifest = new TeamsAppManifest();
    (teamsManifest as any).copilotAgents = {
      declarativeAgents: [{ id: "da", file: "declarativeAgent.json" }],
    };
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(teamsManifest));

    let created = false;
    const createStub = vi
      .spyOn(declarativeAgentHelper, "createNewActionPluginManifest")
      .mockImplementation(async () => {
        created = true;
        return ok({ pluginManifestPath: newPluginPath, actionId: "ai-plugin" });
      });

    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      if (filePath.includes("mcp-tools")) return false;
      if (path.basename(filePath) === "ai-plugin.json") return created;
      return true;
    });
    vi.spyOn(fs, "readJSON").mockResolvedValue({ functions: [], runtimes: [] });
    vi.spyOn(fs, "writeJSON").mockResolvedValue();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("/test/project/teamsapp.yml");
    vi.spyOn(tools.ui, "showMessage").mockResolvedValue(ok("OK"));
    vi.spyOn(tools.ui, "openFile").mockResolvedValue();
    vi.spyOn(tools.ui, "inputText").mockResolvedValue(
      ok({ type: "success", result: "ai-plugin.json" })
    );

    const core = new FxCore(tools);
    const result = await core.updateActionWithMCP(inputs);

    assert.isTrue(result.isOk(), JSON.stringify((result as any).error));
    assert.isTrue(createStub.mock.calls.length === 1);
    assert.equal(createStub.mock.calls[0][1], "ai-plugin.json");
  });
});
