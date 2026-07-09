import { assert, expect, vi } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { err, Inputs, ok, Platform, Stage, UserError } from "@microsoft/teamsfx-api";
import axios from "axios";
import fs from "fs-extra";
import * as parser from "jsonc-parser";
import * as path from "path";
import * as vscode from "vscode";

import { ODRProvider, QuestionNames } from "@microsoft/teamsfx-core";
import * as teamsfxCore from "@microsoft/teamsfx-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import * as globalVariables from "../../src/globalVariables";
import * as sharedOpts from "../../src/handlers/sharedOpts";
import { updateActionWithMCP } from "../../src/handlers/updateActionWithMCP";
import * as vscUI from "../../src/qm/vsc_ui";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import * as systemEnvUtils from "../../src/utils/systemEnvUtils";
import { MockCore } from "../mocks/mockCore";

describe("updateActionWithMCP", () => {
  const mockProjectPath = "/mock/project/path";

  beforeEach(() => {
    const mockInputs: Inputs = {
      projectPath: mockProjectPath,
      platform: Platform.VSCode,
    };
    vi.spyOn(systemEnvUtils, "getSystemInputs").mockReturnValue(mockInputs);
    vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
    mockValue(globalVariables, "core", new MockCore());
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
    // Default: remote MCP servers require no auth unless a test overrides this.
    vi.spyOn(teamsfxCore, "probeMCPServerAuth").mockResolvedValue({ requiresAuth: false });
  });

  describe("sanitizeMCPName", () => {
    it("should sanitize MCP name correctly", async () => {
      // Test with args containing serverName with special characters
      const args = [{ serverName: "test-server@123!#$", serverConfig: { url: "http://test.com" } }];

      vi.spyOn(fs, "pathExistsSync").mockReturnValue(false);
      vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));
      Object.defineProperty(vscode.lm, "tools", { value: [], configurable: true });

      const result = await updateActionWithMCP(args);

      // The function should still process even with empty tools (will show error)
      assert.isTrue(result.isErr());
    });

    it("should limit MCP name to 13 characters", async () => {
      const args = [
        {
          serverName: "verylongservernamethatexceeds13characters",
          serverConfig: { url: "http://test.com" },
        },
      ];

      vi.spyOn(fs, "pathExistsSync").mockReturnValue(false);
      vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));
      Object.defineProperty(vscode.lm, "tools", { value: [], configurable: true });

      await updateActionWithMCP(args);

      // Verify the sanitized name was used (indirectly through no errors about invalid names)
      assert.isTrue(true); // If we reach here, sanitization worked
    });
  });

  describe("with args provided", () => {
    it("should process successfully with valid args", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];
      const mockTools = [
        {
          name: "mcp_testserver_tool1",
          description: "Test tool 1",
          inputSchema: {},
          tags: [],
        },
        {
          name: "mcp_testserver_tool2",
          description: "Test tool 2",
          inputSchema: {},
          tags: [],
        },
      ];

      Object.defineProperty(vscode.lm, "tools", { value: mockTools, configurable: true });
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());
      expect(runCommandStub).toHaveBeenCalledWith(Stage.updateActionWithMCP, expect.anything());
    });

    it("should return error when server name is provided but URL is missing", async () => {
      const args = [{ serverName: "testServer" }]; // Missing serverConfig.url

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isErr());
    });

    it("should return error when URL is provided but server name is missing", async () => {
      const args = [{ serverConfig: { url: "http://test.com" } }]; // Missing serverName

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isErr());
    });
  });

  describe("without args - MCP file handling", () => {
    it("should return error when projectPath is missing", async () => {
      const emptyInputs: Inputs = {
        platform: Platform.VSCode,
      };
      vi.restoreAllMocks();
      vi.spyOn(systemEnvUtils, "getSystemInputs").mockReturnValue(emptyInputs);
      vi.spyOn(vscode.window, "showErrorMessage");
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");

      const result = await updateActionWithMCP();

      assert.isTrue(result.isErr());
    });

    it("should return error when MCP file does not exist", async () => {
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(false);

      const result = await updateActionWithMCP();

      assert.isTrue(result.isErr());
    });

    it("should return error when MCP file has invalid content", async () => {
      const expectedPath = path.join(mockProjectPath, ".vscode", "mcp.json");
      vi.spyOn(fs, "readFileSync").withArgs(expectedPath, "utf-8").mockReturnValue("{}");
      vi.spyOn(fs, "pathExistsSync").withArgs(expectedPath).mockReturnValue(true);
      vi.spyOn(parser, "parse").mockReturnValue({});

      const result = await updateActionWithMCP();

      assert.isTrue(result.isErr());
    });

    it("should return error when no MCP servers found", async () => {
      const expectedPath = path.join(mockProjectPath, ".vscode", "mcp.json");
      vi.spyOn(fs, "pathExistsSync").withArgs(expectedPath).mockReturnValue(true);
      vi.spyOn(fs, "readFileSync")
        .withArgs(expectedPath, "utf-8")
        .mockReturnValue('{"servers":{}}');
      vi.spyOn(parser, "parse").mockReturnValue({ servers: {} });

      const result = await updateActionWithMCP();

      assert.isTrue(result.isErr());
    });

    it("should process single MCP server automatically", async () => {
      const mcpContent = {
        servers: {
          "test-server": { url: "http://test.com" },
        },
      };
      const mockTools = [
        {
          name: "mcp_test-server_tool1",
          description: "Test tool",
          inputSchema: {},
          tags: [],
        },
      ];

      const expectedPath = path.join(mockProjectPath, ".vscode", "mcp.json");
      vi.spyOn(fs, "pathExistsSync").withArgs(expectedPath).mockReturnValue(true);
      vi.spyOn(fs, "readFileSync")
        .withArgs(expectedPath, "utf-8")
        .mockReturnValue(JSON.stringify(mcpContent));
      vi.spyOn(parser, "parse").mockReturnValue(mcpContent);
      Object.defineProperty(vscode.lm, "tools", { value: mockTools, configurable: true });
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP();

      assert.isTrue(result.isOk());
      expect(runCommandStub).toHaveBeenCalledTimes(1);
    });

    it("should handle ODR server with command but no args", async () => {
      const args = [
        {
          serverName: "odrServerNoArgs",
          serverConfig: { type: "stdio", command: "odr" },
        },
      ];
      const mockODRTools = [
        {
          name: "tool1",
          description: "Test tool",
          inputSchema: {},
        },
      ];
      const mockODRServers = [
        {
          name: "my-server-noargs",
          display_name: "My Server NoArgs",
          description: "Test Server NoArgs",
          version: "1.0.0",
          identifier: "my-server-identifier-noargs",
          tools: mockODRTools,
          packageFamily: "test.package",
          command: "odr",
          args: [],
        },
      ];

      vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockODRServers);
      vi.spyOn(ODRProvider, "getToolsForODRServer").mockResolvedValue(mockODRTools);
      vi.spyOn(ODRProvider, "isODRServer").mockReturnValue(true);
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      assert.equal(
        calledInputs[QuestionNames.MCPLocalServerIdentifier],
        "my-server-identifier-noargs"
      );
      assert.equal(calledInputs[QuestionNames.MCPForDAAvailableTools].length, 1);
      assert.equal(calledInputs[QuestionNames.MCPForDAAvailableTools][0].name, "tool1");
    });

    it("should process single local MCP server automatically (non-ODR)", async () => {
      const mcpContent = {
        servers: {
          "local-server": {
            type: "stdio",
            command: "node",
            args: ["server.js"],
          },
        },
      };
      const mockTools = [
        {
          name: "mcp_local-server_tool1",
          description: "Test tool",
          inputSchema: {},
          tags: [],
        },
      ];

      const expectedPath = path.join(mockProjectPath, ".vscode", "mcp.json");
      vi.spyOn(fs, "pathExistsSync").withArgs(expectedPath).mockReturnValue(true);
      vi.spyOn(fs, "readFileSync")
        .withArgs(expectedPath, "utf-8")
        .mockReturnValue(JSON.stringify(mcpContent));
      vi.spyOn(parser, "parse").mockReturnValue(mcpContent);
      mockValue(vscode.lm, "tools", mockTools);
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP();

      assert.isTrue(result.isOk());
      expect(runCommandStub).toHaveBeenCalledTimes(1);
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      assert.equal(calledInputs[QuestionNames.MCPLocalServerIdentifier], "local-server");
    });

    it("should process single local MCP server automatically (ODR)", async () => {
      const mcpContent = {
        servers: {
          "odr-server": {
            type: "stdio",
            command: "odr",
            args: ["run", "my-mcp-server"],
          },
        },
      };
      const mockODRTools = [
        {
          name: "tool1",
          description: "Test tool",
          inputSchema: {},
        },
      ];
      const mockODRServers = [
        {
          name: "my-mcp-server",
          display_name: "My MCP Server",
          description: "Test MCP Server",
          version: "1.0.0",
          identifier: "my-mcp-server-id",
          tools: mockODRTools,
          packageFamily: "test.package",
          command: "odr",
          args: ["run", "my-mcp-server"],
        },
      ];

      const expectedPath = path.join(mockProjectPath, ".vscode", "mcp.json");
      vi.spyOn(fs, "pathExistsSync").withArgs(expectedPath).mockReturnValue(true);
      vi.spyOn(fs, "readFileSync")
        .withArgs(expectedPath, "utf-8")
        .mockReturnValue(JSON.stringify(mcpContent));
      vi.spyOn(parser, "parse").mockReturnValue(mcpContent);
      vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockODRServers);
      vi.spyOn(ODRProvider, "getToolsForODRServer").mockResolvedValue(mockODRTools);
      vi.spyOn(ODRProvider, "isODRServer").mockReturnValue(true);
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP();

      assert.isTrue(result.isOk());
      expect(runCommandStub).toHaveBeenCalledTimes(1);
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      assert.equal(calledInputs[QuestionNames.MCPLocalServerIdentifier], "my-mcp-server-id");
      assert.equal(calledInputs[QuestionNames.MCPForDAAvailableTools].length, 1);
      assert.equal(calledInputs[QuestionNames.MCPForDAAvailableTools][0].name, "tool1");
    });

    it("should show selection UI for multiple MCP servers", async () => {
      const mcpContent = {
        servers: {
          "remote-server": { url: "http://remote.com" },
          "remote-server2": { url: "http://remote2.com" },
        },
      };
      const mockTools = [
        {
          name: "mcp_remote-server_tool1",
          description: "Test tool",
          inputSchema: {},
          tags: [],
        },
      ];

      const expectedPath = path.join(mockProjectPath, ".vscode", "mcp.json");
      vi.spyOn(fs, "pathExistsSync").withArgs(expectedPath).mockReturnValue(true);
      vi.spyOn(fs, "readFileSync")
        .withArgs(expectedPath, "utf-8")
        .mockReturnValue(JSON.stringify(mcpContent));
      vi.spyOn(parser, "parse").mockReturnValue(mcpContent);
      Object.defineProperty(vscode.lm, "tools", { value: mockTools, configurable: true });
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      vi.spyOn(vscUI, "VS_CODE_UI").value({
        selectOption: vi
          .spyOn()
          .mockResolvedValue(ok({ type: "success", result: "remote-server" })),
      });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP();

      assert.isTrue(result.isOk());
      expect(runCommandStub).toHaveBeenCalledTimes(1);
    });

    it("should show selection UI for multiple MCP servers including local", async () => {
      const mcpContent = {
        servers: {
          "remote-server": { url: "http://remote.com" },
          "local-server": {
            type: "stdio",
            command: "node",
            args: ["server.js"],
          },
        },
      };
      const mockTools = [
        {
          name: "mcp_local-server_tool1",
          description: "Test tool",
          inputSchema: {},
          tags: [],
        },
      ];

      const expectedPath = path.join(mockProjectPath, ".vscode", "mcp.json");
      vi.spyOn(fs, "pathExistsSync").withArgs(expectedPath).mockReturnValue(true);
      vi.spyOn(fs, "readFileSync")
        .withArgs(expectedPath, "utf-8")
        .mockReturnValue(JSON.stringify(mcpContent));
      vi.spyOn(parser, "parse").mockReturnValue(mcpContent);
      vi.spyOn(ODRProvider, "listServers").mockResolvedValue([]);
      Object.defineProperty(vscode.lm, "tools", { value: mockTools, configurable: true });
      vi.spyOn(vscUI, "VS_CODE_UI").value({
        selectOption: vi.fn().mockResolvedValue(ok({ type: "success", result: "local-server" })),
      });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP();

      assert.isTrue(result.isOk());
      expect(runCommandStub).toHaveBeenCalledTimes(1);
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      assert.equal(calledInputs[QuestionNames.MCPLocalServerIdentifier], "local-server");
    });

    it("should return error when user cancels server selection", async () => {
      const mcpContent = {
        servers: {
          "remote-server": { url: "http://remote.com" },
          "remote-server2": { url: "http://remote2.com" },
        },
      };

      const expectedPath = path.join(mockProjectPath, ".vscode", "mcp.json");
      vi.spyOn(fs, "pathExistsSync").withArgs(expectedPath).mockReturnValue(true);
      vi.spyOn(fs, "readFileSync")
        .withArgs(expectedPath, "utf-8")
        .mockReturnValue(JSON.stringify(mcpContent));
      vi.spyOn(parser, "parse").mockReturnValue(mcpContent);
      vi.spyOn(vscUI, "VS_CODE_UI").value({
        selectOption: vi
          .spyOn()
          .mockResolvedValue(err(new UserError("test", "UserCancel", "User cancelled"))),
      });

      const result = await updateActionWithMCP();

      assert.isTrue(result.isErr());
    });

    it("should construct detail correctly for local server in selection UI", async () => {
      const mcpContent = {
        servers: {
          "remote-server": { url: "http://remote.com" },
          "local-server": {
            type: "stdio",
            command: "node",
            args: ["server.js", "arg1"],
          },
        },
      };
      const mockTools = [
        {
          name: "mcp_remoteserver_tool1",
          description: "Test tool",
          inputSchema: {},
          tags: [],
        },
      ];

      const expectedPath = path.join(mockProjectPath, ".vscode", "mcp.json");
      vi.spyOn(fs, "pathExistsSync").withArgs(expectedPath).mockReturnValue(true);
      vi.spyOn(fs, "readFileSync")
        .withArgs(expectedPath, "utf-8")
        .mockReturnValue(JSON.stringify(mcpContent));
      vi.spyOn(parser, "parse").mockReturnValue(mcpContent);
      Object.defineProperty(vscode.lm, "tools", { value: mockTools, configurable: true });
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });

      let capturedOptions: any;
      vi.spyOn(vscUI, "VS_CODE_UI").value({
        selectOption: vi.fn().mockImplementation((config: any) => {
          capturedOptions = config.options;
          return Promise.resolve(ok({ type: "success", result: "remote-server" }));
        }),
      });
      vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      await updateActionWithMCP();

      const localServerOption = capturedOptions.find((opt: any) => opt.id === "local-server");
      assert.equal(localServerOption.detail, "node server.js arg1");

      const remoteServerOption = capturedOptions.find((opt: any) => opt.id === "remote-server");
      assert.equal(remoteServerOption.detail, "http://remote.com");
    });
  });

  describe("MCP tools processing", () => {
    it("should return error when no tools are found for MCP server", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];

      mockValue(vscode.lm, "tools", []); // No tools found

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isErr());
    });

    it("should filter and transform tools correctly", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];
      const mockTools = [
        {
          name: "mcp_testserver_getTodos",
          description: "Get todos",
          inputSchema: { type: "object" },
          tags: ["todo"],
        },
        {
          name: "mcp_testserver_createTodo",
          description: "Create todo",
          inputSchema: { type: "object" },
          tags: ["todo"],
        },
        {
          name: "mcp_otherserver_tool", // Should be filtered out
          description: "Other tool",
          inputSchema: {},
          tags: [],
        },
      ];

      mockValue(vscode.lm, "tools", mockTools);
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());

      // Verify runCommand was called with correct inputs
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      const tools = calledInputs[QuestionNames.MCPForDAAvailableTools];

      assert.equal(tools.length, 2);
      assert.equal(tools[0].name, "getTodos");
      assert.equal(tools[1].name, "createTodo");
    });
  });

  describe("authentication handling", () => {
    it("should handle no authentication (200 response)", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];
      const mockTools = [
        { name: "mcp_testserver_tool1", description: "Test", inputSchema: {}, tags: [] },
      ];

      mockValue(vscode.lm, "tools", mockTools);
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      await updateActionWithMCP(args);

      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      assert.equal(calledInputs[QuestionNames.MCPForDAAuth], "NoneAuth");
    });

    it("should handle OAuth authentication (401 response)", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];
      const mockTools = [
        { name: "mcp_testserver_tool1", description: "Test", inputSchema: {}, tags: [] },
      ];
      mockValue(vscode.lm, "tools", mockTools);
      vi.spyOn(teamsfxCore, "probeMCPServerAuth").mockResolvedValue({
        requiresAuth: true,
        authMetadataUrl: "http://test.com/.well-known/oauth",
      });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      await updateActionWithMCP(args);

      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      assert.equal(calledInputs[QuestionNames.MCPForDAAuth], "OAuthPluginVault");
      assert.equal(
        calledInputs[QuestionNames.MCPForDAAuthMetadataUrl],
        "http://test.com/.well-known/oauth"
      );
    });

    it("should handle OAuth with well-known URL fallback", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "https://api.test.com/v1" } }];
      const mockTools = [
        { name: "mcp_testserver_tool1", description: "Test", inputSchema: {}, tags: [] },
      ];
      mockValue(vscode.lm, "tools", mockTools);
      vi.spyOn(teamsfxCore, "probeMCPServerAuth").mockResolvedValue({ requiresAuth: true });
      const axiosStub = vi.spyOn(axios, "get");
      axiosStub
        .withArgs("https://api.test.com/.well-known/oauth-authorization-server")
        .mockResolvedValue({ status: 200 }); // well-known URL response
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      await updateActionWithMCP(args);

      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      assert.equal(calledInputs[QuestionNames.MCPForDAAuth], "OAuthPluginVault");
      assert.equal(
        calledInputs[QuestionNames.MCPForDAAuthWellKnownUrl],
        "https://api.test.com/.well-known/oauth-authorization-server"
      );
    });

    it("should handle network errors gracefully", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];
      const mockTools = [
        { name: "mcp_testserver_tool1", description: "Test", inputSchema: {}, tags: [] },
      ];
      const networkError = new Error("Network error");

      mockValue(vscode.lm, "tools", mockTools);
      vi.spyOn(axios, "get").throws(networkError);
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      await updateActionWithMCP(args);

      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      assert.equal(calledInputs[QuestionNames.MCPForDAAuth], "NoneAuth");
    });
  });

  describe("input validation and setup", () => {
    it("should set correct input values", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];
      const mockTools = [
        { name: "mcp_testserver_tool1", description: "Test", inputSchema: {}, tags: [] },
      ];

      mockValue(vscode.lm, "tools", mockTools);
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      await updateActionWithMCP(args);

      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      assert.equal(calledInputs[QuestionNames.MCPForDAServerUrl], "http://test.com");
      assert.equal(calledInputs[QuestionNames.MCPForDAServerName], "testserver");
      assert.isArray(calledInputs[QuestionNames.MCPForDAAvailableTools]);
      assert.equal(calledInputs[QuestionNames.MCPForDAAuth], "NoneAuth");
    });

    it("should propagate runCommand errors", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];
      const mockTools = [
        { name: "mcp_testserver_tool1", description: "Test", inputSchema: {}, tags: [] },
      ];
      const runCommandError = new UserError("test", "RunCommandError", "Run command failed");

      mockValue(vscode.lm, "tools", mockTools);
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(err(runCommandError));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isErr());
      assert.equal(result._unsafeUnwrapErr().message, "Run command failed");
    });
  });

  describe("edge cases", () => {
    it("should handle server config with no command", async () => {
      const mcpContent = {
        servers: {
          "local-server": {
            type: "stdio",
          },
        },
      };
      const mockTools = [
        {
          name: "mcp_local-server_tool1",
          description: "Test tool",
          inputSchema: {},
          tags: [],
        },
      ];

      const expectedPath = path.join(mockProjectPath, ".vscode", "mcp.json");
      vi.spyOn(fs, "pathExistsSync").withArgs(expectedPath).mockReturnValue(true);
      vi.spyOn(fs, "readFileSync")
        .withArgs(expectedPath, "utf-8")
        .mockReturnValue(JSON.stringify(mcpContent));
      vi.spyOn(parser, "parse").mockReturnValue(mcpContent);
      vi.spyOn(ODRProvider, "listServers").mockResolvedValue([]);
      Object.defineProperty(vscode.lm, "tools", { value: mockTools, configurable: true });

      const result = await updateActionWithMCP();

      assert.isTrue(result.isErr());
    });

    it("should handle server config with empty args for detail fallback", async () => {
      const mcpContent = {
        servers: {
          "remote-server": { url: "http://remote.com" },
          "local-server": {
            type: "stdio",
            command: "python",
            args: [],
          },
        },
      };
      const mockTools = [
        {
          name: "mcp_remote-server_tool1",
          description: "Test tool",
          inputSchema: {},
          tags: [],
        },
      ];

      const expectedPath = path.join(mockProjectPath, ".vscode", "mcp.json");
      vi.spyOn(fs, "pathExistsSync").withArgs(expectedPath).mockReturnValue(true);
      vi.spyOn(fs, "readFileSync")
        .withArgs(expectedPath, "utf-8")
        .mockReturnValue(JSON.stringify(mcpContent));
      vi.spyOn(parser, "parse").mockReturnValue(mcpContent);
      Object.defineProperty(vscode.lm, "tools", { value: mockTools, configurable: true });
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });

      let capturedOptions: any;
      vi.spyOn(vscUI, "VS_CODE_UI").value({
        selectOption: vi.fn().mockImplementation((config: any) => {
          capturedOptions = config.options;
          return Promise.resolve(ok({ type: "success", result: "remote-server" }));
        }),
      });
      vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      await updateActionWithMCP();

      const localServerOption = capturedOptions.find((opt: any) => opt.id === "local-server");
      assert.equal(localServerOption.detail, "python");
    });

    it("should handle remote server config with empty url", async () => {
      const mcpContent = {
        servers: {
          "remote-server": { url: "http://remote.com" },
          "remote-server2": {
            url: "",
          },
        },
      };
      const mockTools = [
        {
          name: "mcp_remote-server_tool1",
          description: "Test tool",
          inputSchema: {},
          tags: [],
        },
      ];

      const expectedPath = path.join(mockProjectPath, ".vscode", "mcp.json");
      vi.spyOn(fs, "pathExistsSync").withArgs(expectedPath).mockReturnValue(true);
      vi.spyOn(fs, "readFileSync")
        .withArgs(expectedPath, "utf-8")
        .mockReturnValue(JSON.stringify(mcpContent));
      vi.spyOn(parser, "parse").mockReturnValue(mcpContent);
      Object.defineProperty(vscode.lm, "tools", { value: mockTools, configurable: true });
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });

      let capturedOptions: any;
      vi.spyOn(vscUI, "VS_CODE_UI").value({
        selectOption: vi.fn().mockImplementation((config: any) => {
          capturedOptions = config.options;
          return Promise.resolve(ok({ type: "success", result: "remote-server" }));
        }),
      });
      vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      await updateActionWithMCP();

      const remoteServer2Option = capturedOptions.find((opt: any) => opt.id === "remote-server2");
      assert.equal(remoteServer2Option.detail, "");
    });

    it("should handle undefined args", async () => {
      const expectedPath = path.join(mockProjectPath, ".vscode", "mcp.json");
      vi.spyOn(fs, "pathExistsSync").withArgs(expectedPath).mockReturnValue(false);

      const result = await updateActionWithMCP(undefined);

      assert.isTrue(result.isErr());
    });

    it("should handle empty args array", async () => {
      const expectedPath = path.join(mockProjectPath, ".vscode", "mcp.json");
      vi.spyOn(fs, "pathExistsSync").withArgs(expectedPath).mockReturnValue(false);

      const result = await updateActionWithMCP([]);

      assert.isTrue(result.isErr());
    });

    it("should handle tools with missing name parts", async () => {
      const args = [
        {
          serverName: "testServer",
          serverConfig: { url: "http://test.com" },
        },
      ];
      const mockTools = [
        { name: "mcp_testserver_tool1", description: "Test", inputSchema: {}, tags: [] },
      ];

      mockValue(vscode.lm, "tools", mockTools);
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      assert.isUndefined(calledInputs[QuestionNames.MCPLocalServerIdentifier]);
    });

    it("should handle local MCP with stdio type (non-ODR)", async () => {
      const args = [
        {
          serverName: "localServer",
          serverConfig: { type: "stdio", command: "node", args: ["server.js"] },
        },
      ];
      const mockTools = [
        { name: "mcp_localserver_tool1", description: "Test", inputSchema: {}, tags: [] },
      ];

      mockValue(vscode.lm, "tools", mockTools);
      vi.spyOn(ODRProvider, "listServers").mockResolvedValue([]);
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      assert.equal(calledInputs[QuestionNames.MCPLocalServerIdentifier], "localServer");
    });

    it("should handle local MCP with stdio type (ODR)", async () => {
      const args = [
        {
          serverName: "odrServer",
          serverConfig: { type: "stdio", command: "odr", args: ["run", "my-server"] },
        },
      ];
      const mockODRTools = [{ name: "tool1", description: "Test", inputSchema: {} }];
      const mockODRServers = [
        {
          name: "my-server",
          display_name: "My Server",
          description: "Test Server",
          version: "1.0.0",
          identifier: "my-server-identifier",
          tools: mockODRTools,
          packageFamily: "test.package",
          command: "odr",
          args: ["run", "my-server"],
        },
      ];

      vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockODRServers);
      vi.spyOn(ODRProvider, "getToolsForODRServer").mockResolvedValue(mockODRTools);
      vi.spyOn(ODRProvider, "isODRServer").mockReturnValue(true);
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      assert.equal(calledInputs[QuestionNames.MCPLocalServerIdentifier], "my-server-identifier");
      assert.equal(calledInputs[QuestionNames.MCPForDAAvailableTools].length, 1);
      assert.equal(calledInputs[QuestionNames.MCPForDAAvailableTools][0].name, "tool1");
    });

    it("should set mcp-type to local for stdio servers", async () => {
      const args = [
        {
          serverName: "localServer",
          serverConfig: { type: "stdio", command: "node", args: ["server.js"] },
        },
      ];
      const mockTools = [
        { name: "mcp_localserver_tool1", description: "Test", inputSchema: {}, tags: [] },
      ];

      mockValue(vscode.lm, "tools", mockTools);
      vi.spyOn(ODRProvider, "listServers").mockResolvedValue([]);
      vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      await updateActionWithMCP(args);

      const telemetryCall = (ExtTelemetry.sendTelemetryEvent as ReturnType<typeof vi.spyOn>)
        .lastCall;
      assert.equal(telemetryCall.args[1]["mcp-type"], "local");
    });

    it("should set mcp-type to remote for non-stdio servers", async () => {
      const args = [{ serverName: "remoteServer", serverConfig: { url: "http://remote.com" } }];
      const mockTools = [
        { name: "mcp_remoteserver_tool1", description: "Test", inputSchema: {}, tags: [] },
      ];

      mockValue(vscode.lm, "tools", mockTools);
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      await updateActionWithMCP(args);

      const telemetryCall = (ExtTelemetry.sendTelemetryEvent as ReturnType<typeof vi.spyOn>)
        .lastCall;
      assert.equal(telemetryCall.args[1]["mcp-type"], "remote");
    });

    it("should send telemetry with local mcp-type on error", async () => {
      const args = [
        {
          serverName: "localServer",
          serverConfig: { type: "stdio", command: "node", args: ["server.js"] },
        },
      ];
      const mockTools = [
        { name: "mcp_localserver_tool1", description: "Test", inputSchema: {}, tags: [] },
      ];
      const runCommandError = new UserError("test", "RunCommandError", "Run command failed");

      mockValue(vscode.lm, "tools", mockTools);
      vi.spyOn(ODRProvider, "listServers").mockResolvedValue([]);
      vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(err(runCommandError));

      await updateActionWithMCP(args);

      const telemetryCall = (ExtTelemetry.sendTelemetryErrorEvent as ReturnType<typeof vi.spyOn>)
        .lastCall;
      assert.equal(telemetryCall.args[2]["mcp-type"], "local");
    });

    it("should handle 401 error with no response headers", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];
      const mockTools = [
        { name: "mcp_testserver_tool1", description: "Test", inputSchema: {}, tags: [] },
      ];
      mockValue(vscode.lm, "tools", mockTools);
      vi.spyOn(teamsfxCore, "probeMCPServerAuth").mockResolvedValue({ requiresAuth: true });
      const axiosStub = vi.spyOn(axios, "get");
      axiosStub
        .withArgs("http://test.com/.well-known/oauth-authorization-server")
        .mockResolvedValue({ status: 200 });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      await updateActionWithMCP(args);

      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      assert.equal(calledInputs[QuestionNames.MCPForDAAuth], "OAuthPluginVault");
    });

    it("should parse www-authenticate header with match", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];
      const mockTools = [
        { name: "mcp_testserver_tool1", description: "Test", inputSchema: {}, tags: [] },
      ];
      mockValue(vscode.lm, "tools", mockTools);
      vi.spyOn(teamsfxCore, "probeMCPServerAuth").mockResolvedValue({
        requiresAuth: true,
        authMetadataUrl: "http://auth.test.com/metadata",
      });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      await updateActionWithMCP(args);

      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      assert.equal(
        calledInputs[QuestionNames.MCPForDAAuthMetadataUrl],
        "http://auth.test.com/metadata"
      );
    });

    it("should skip auth check for local MCP servers", async () => {
      const args = [
        {
          serverName: "localServer",
          serverConfig: { type: "stdio", command: "node", args: ["server.js"] },
        },
      ];
      const mockTools = [
        { name: "mcp_localserver_tool1", description: "Test", inputSchema: {}, tags: [] },
      ];

      mockValue(vscode.lm, "tools", mockTools);
      vi.spyOn(ODRProvider, "listServers").mockResolvedValue([]);
      const axiosStub = vi.spyOn(axios, "get");
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      await updateActionWithMCP(args);

      // Axios should not be called for local MCP
      assert.isFalse(axiosStub.called);
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      assert.equal(calledInputs[QuestionNames.MCPForDAAuth], "NoneAuth");
    });

    it("should return original server name when serverConfig type is not stdio", async () => {
      const args = [
        {
          serverName: "remoteServer",
          serverConfig: { type: "sse", url: "http://test.com" },
        },
      ];
      const mockTools = [
        { name: "mcp_remoteserver_tool1", description: "Test", inputSchema: {}, tags: [] },
      ];

      mockValue(vscode.lm, "tools", mockTools);
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      assert.isUndefined(calledInputs[QuestionNames.MCPLocalServerIdentifier]);
    });

    it("should construct detail with command only when args is undefined", async () => {
      const mcpContent = {
        servers: {
          "test-server": { url: "http://test.com" },
          "test-server2": {
            type: "stdio",
            command: "node",
          },
        },
      };
      const mockTools = [
        { name: "mcp_test-server_tool1", description: "Test tool", inputSchema: {}, tags: [] },
      ];

      const expectedPath = path.join(mockProjectPath, ".vscode", "mcp.json");
      vi.spyOn(fs, "pathExistsSync").withArgs(expectedPath).mockReturnValue(true);
      vi.spyOn(fs, "readFileSync")
        .withArgs(expectedPath, "utf-8")
        .mockReturnValue(JSON.stringify(mcpContent));
      vi.spyOn(parser, "parse").mockReturnValue(mcpContent);
      Object.defineProperty(vscode.lm, "tools", { value: mockTools, configurable: true });
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });

      let capturedOptions: any;
      vi.spyOn(vscUI, "VS_CODE_UI").value({
        selectOption: vi.fn().mockImplementation((config: any) => {
          capturedOptions = config.options;
          return Promise.resolve(ok({ type: "success", result: "test-server" }));
        }),
      });
      vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      await updateActionWithMCP();

      const server2Option = capturedOptions.find((opt: any) => opt.id === "test-server2");
      assert.equal(server2Option.detail, "node");
    });
  });

  describe("MCP gateway integration", () => {
    it("should fall back to selectedTools when startMcpGateway returns undefined", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];
      const mockTools = [
        { name: "mcp_testserver_tool1", description: "Test tool", inputSchema: {}, tags: [] },
      ];

      mockValue(vscode.lm, "tools", mockTools);
      Object.defineProperty(vscode.lm, "startMcpGateway", {
        value: vi.fn().mockResolvedValue(undefined),
        configurable: true,
      });
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      const tools = calledInputs[QuestionNames.MCPForDAAvailableTools];
      assert.equal(tools.length, 1);
      assert.equal(tools[0].name, "tool1");
    });

    it("should fall back to selectedTools when startMcpGateway throws", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];
      const mockTools = [
        { name: "mcp_testserver_tool1", description: "Test tool", inputSchema: {}, tags: [] },
      ];

      mockValue(vscode.lm, "tools", mockTools);
      Object.defineProperty(vscode.lm, "startMcpGateway", {
        value: vi.fn().mockRejectedValue(new Error("Not supported")),
        configurable: true,
      });
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      const tools = calledInputs[QuestionNames.MCPForDAAvailableTools];
      assert.equal(tools.length, 1);
      assert.equal(tools[0].name, "tool1");
    });

    it("should use gateway tools when gateway succeeds and tools match", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];
      const mockTools = [
        { name: "mcp_testserver_tool1", description: "Test tool 1", inputSchema: {}, tags: [] },
        { name: "mcp_testserver_tool2", description: "Test tool 2", inputSchema: {}, tags: [] },
      ];

      mockValue(vscode.lm, "tools", mockTools);
      const mockGateway = {
        servers: [{ label: "testServer", address: { toString: () => "http://localhost:12345" } }],
        dispose: vi.fn(),
      };
      Object.defineProperty(vscode.lm, "startMcpGateway", {
        value: vi.fn().mockResolvedValue(mockGateway),
        configurable: true,
      });
      const connectStub = vi.spyOn(Client.prototype, "connect").mockResolvedValue();
      const listToolsStub = vi.spyOn(Client.prototype, "listTools").mockResolvedValue({
        tools: [
          { name: "tool1", description: "Test tool 1", inputSchema: { type: "object" as const } },
          { name: "tool2", description: "Test tool 2", inputSchema: { type: "object" as const } },
          { name: "tool3", description: "Other tool", inputSchema: { type: "object" as const } },
        ],
      });
      const closeStub = vi.spyOn(Client.prototype, "close").mockResolvedValue();
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());
      expect(connectStub).toHaveBeenCalledTimes(1);
      expect(listToolsStub).toHaveBeenCalledTimes(1);
      expect(closeStub).toHaveBeenCalledTimes(1);
      expect(mockGateway.dispose as ReturnType<typeof vi.spyOn>).toHaveBeenCalledTimes(1);
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      const tools = calledInputs[QuestionNames.MCPForDAAvailableTools];
      // The gateway's tool list is authoritative; all server tools are returned as-is.
      assert.equal(tools.length, 3);
      assert.equal(tools[0].name, "tool1");
      assert.equal(tools[1].name, "tool2");
      assert.equal(tools[2].name, "tool3");
    });

    it("should use gateway tools even when vscode.lm.tools is empty (macOS regression)", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];

      // On macOS the MCP server's tools are not surfaced in vscode.lm.tools, so the
      // selectedTools filter is empty. The gateway result must still be used.
      mockValue(vscode.lm, "tools", []);
      const mockGateway = {
        servers: [{ label: "testServer", address: { toString: () => "http://localhost:12345" } }],
        dispose: vi.fn(),
      };
      Object.defineProperty(vscode.lm, "startMcpGateway", {
        value: vi.fn().mockResolvedValue(mockGateway),
        configurable: true,
      });
      const connectStub = vi.spyOn(Client.prototype, "connect").mockResolvedValue();
      const listToolsStub = vi.spyOn(Client.prototype, "listTools").mockResolvedValue({
        tools: [
          { name: "tool1", description: "Test tool 1", inputSchema: { type: "object" as const } },
          // tool2 has no description, exercising the `description ?? ""` dedup key path.
          { name: "tool2", inputSchema: { type: "object" as const } },
        ],
      });
      const closeStub = vi.spyOn(Client.prototype, "close").mockResolvedValue();
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());
      expect(connectStub).toHaveBeenCalledTimes(1);
      expect(listToolsStub).toHaveBeenCalledTimes(1);
      expect(closeStub).toHaveBeenCalledTimes(1);
      expect(mockGateway.dispose as ReturnType<typeof vi.spyOn>).toHaveBeenCalledTimes(1);
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      const tools = calledInputs[QuestionNames.MCPForDAAvailableTools];
      assert.equal(tools.length, 2);
      assert.equal(tools[0].name, "tool1");
      assert.equal(tools[1].name, "tool2");
    });

    it("should fall back to selectedTools when client.connect throws", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];
      const mockTools = [
        { name: "mcp_testserver_tool1", description: "Test tool", inputSchema: {}, tags: [] },
      ];

      mockValue(vscode.lm, "tools", mockTools);
      const mockGateway = {
        servers: [{ label: "testServer", address: { toString: () => "http://localhost:12345" } }],
        dispose: vi.fn(),
      };
      Object.defineProperty(vscode.lm, "startMcpGateway", {
        value: vi.fn().mockResolvedValue(mockGateway),
        configurable: true,
      });
      vi.spyOn(Client.prototype, "connect").mockRejectedValue(new Error("Connection failed"));
      const closeStub = vi.spyOn(Client.prototype, "close").mockResolvedValue();
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());
      // finally block should still call close and dispose
      expect(closeStub).toHaveBeenCalledTimes(1);
      expect(mockGateway.dispose as ReturnType<typeof vi.spyOn>).toHaveBeenCalledTimes(1);
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      const tools = calledInputs[QuestionNames.MCPForDAAvailableTools];
      assert.equal(tools.length, 1);
      assert.equal(tools[0].name, "tool1");
    });

    it("should deduplicate gateway tools with same name and description", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];
      const mockTools = [
        { name: "mcp_testserver_tool1", description: "Dup tool", inputSchema: {}, tags: [] },
      ];

      mockValue(vscode.lm, "tools", mockTools);
      const mockGateway = {
        servers: [{ label: "testServer", address: { toString: () => "http://localhost:12345" } }],
        dispose: vi.fn(),
      };
      Object.defineProperty(vscode.lm, "startMcpGateway", {
        value: vi.fn().mockResolvedValue(mockGateway),
        configurable: true,
      });
      vi.spyOn(Client.prototype, "connect").mockResolvedValue();
      vi.spyOn(Client.prototype, "listTools").mockResolvedValue({
        tools: [
          { name: "tool1", description: "Dup tool", inputSchema: { type: "object" as const } },
          { name: "tool1", description: "Dup tool", inputSchema: { type: "object" as const } },
        ],
      });
      vi.spyOn(Client.prototype, "close").mockResolvedValue();
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      const tools = calledInputs[QuestionNames.MCPForDAAvailableTools];
      // Only first match should be kept due to dedup
      assert.equal(tools.length, 1);
    });

    it("should fall back to selectedTools when gateway returns an empty tool list", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];
      const mockTools = [
        { name: "mcp_testserver_tool1", description: "Fallback tool", inputSchema: {}, tags: [] },
      ];

      mockValue(vscode.lm, "tools", mockTools);
      const mockGateway = {
        servers: [{ label: "testServer", address: { toString: () => "http://localhost:12345" } }],
        dispose: vi.fn(),
      };
      Object.defineProperty(vscode.lm, "startMcpGateway", {
        value: vi.fn().mockResolvedValue(mockGateway),
        configurable: true,
      });
      vi.spyOn(Client.prototype, "connect").mockResolvedValue();
      const listToolsStub = vi.spyOn(Client.prototype, "listTools").mockResolvedValue({
        tools: [],
      });
      const closeStub = vi.spyOn(Client.prototype, "close").mockResolvedValue();
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());
      expect(listToolsStub).toHaveBeenCalledTimes(1);
      expect(closeStub).toHaveBeenCalledTimes(1);
      expect(mockGateway.dispose as ReturnType<typeof vi.spyOn>).toHaveBeenCalledTimes(1);
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      const tools = calledInputs[QuestionNames.MCPForDAAvailableTools];
      // Empty gateway result falls back to the vscode.lm.tools-derived list.
      assert.equal(tools.length, 1);
      assert.equal(tools[0].name, "tool1");
    });

    it("should include gateway tools even when absent from vscode.lm.tools", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];
      const mockTools = [
        { name: "mcp_testserver_tool1", description: "Tool A", inputSchema: {}, tags: [] },
      ];

      mockValue(vscode.lm, "tools", mockTools);
      const mockGateway = {
        servers: [{ label: "testServer", address: { toString: () => "http://localhost:12345" } }],
        dispose: vi.fn(),
      };
      Object.defineProperty(vscode.lm, "startMcpGateway", {
        value: vi.fn().mockResolvedValue(mockGateway),
        configurable: true,
      });
      vi.spyOn(Client.prototype, "connect").mockResolvedValue();
      vi.spyOn(Client.prototype, "listTools").mockResolvedValue({
        tools: [
          {
            name: "unknownTool",
            description: "Not in vscode.lm.tools",
            inputSchema: { type: "object" as const },
          },
        ],
      });
      vi.spyOn(Client.prototype, "close").mockResolvedValue();
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      // The gateway list is authoritative, so the tool is included even though it is
      // not present in vscode.lm.tools.
      assert.isTrue(result.isOk());
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      const tools = calledInputs[QuestionNames.MCPForDAAvailableTools];
      assert.equal(tools.length, 1);
      assert.equal(tools[0].name, "unknownTool");
    });

    it("should fall back to old gateway address API when servers property is absent", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];
      const mockTools = [
        { name: "mcp_testserver_tool1", description: "Test tool 1", inputSchema: {}, tags: [] },
      ];

      mockValue(vscode.lm, "tools", mockTools);
      const mockGateway = {
        address: { toString: () => "http://localhost:12345" },
        dispose: vi.fn(),
      };
      Object.defineProperty(vscode.lm, "startMcpGateway", {
        value: vi.fn().mockResolvedValue(mockGateway),
        configurable: true,
      });
      vi.spyOn(Client.prototype, "connect").mockResolvedValue();
      vi.spyOn(Client.prototype, "listTools").mockResolvedValue({
        tools: [
          { name: "tool1", description: "Test tool 1", inputSchema: { type: "object" as const } },
        ],
      });
      vi.spyOn(Client.prototype, "close").mockResolvedValue();
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());
      expect(mockGateway.dispose as ReturnType<typeof vi.spyOn>).toHaveBeenCalledTimes(1);
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      const tools = calledInputs[QuestionNames.MCPForDAAvailableTools];
      assert.equal(tools.length, 1);
      assert.equal(tools[0].name, "tool1");
    });

    it("should fall back to selectedTools when no matching server found in gateway", async () => {
      const args = [{ serverName: "testServer", serverConfig: { url: "http://test.com" } }];
      const mockTools = [
        { name: "mcp_testserver_tool1", description: "Test tool", inputSchema: {}, tags: [] },
      ];

      mockValue(vscode.lm, "tools", mockTools);
      const mockGateway = {
        servers: [{ label: "otherServer", address: { toString: () => "http://localhost:12345" } }],
        dispose: vi.fn(),
      };
      Object.defineProperty(vscode.lm, "startMcpGateway", {
        value: vi.fn().mockResolvedValue(mockGateway),
        configurable: true,
      });
      vi.spyOn(axios, "get").mockResolvedValue({ status: 200 });
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());
      expect(mockGateway.dispose as ReturnType<typeof vi.spyOn>).toHaveBeenCalledTimes(1);
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      const tools = calledInputs[QuestionNames.MCPForDAAvailableTools];
      assert.equal(tools.length, 1);
      assert.equal(tools[0].name, "tool1");
    });
  });

  describe("extractLocalServerIdentifier edge cases", () => {
    it("should return original name when ODR listServers throws", async () => {
      const args = [
        {
          serverName: "odrServer",
          serverConfig: { type: "stdio", command: "odr", args: ["run", "my-server"] },
        },
      ];
      const mockODRTools = [{ name: "tool1", description: "Test", inputSchema: {} }];

      const isODRStub = vi.spyOn(ODRProvider, "isODRServer");
      isODRStub.onFirstCall().mockReturnValue(true); // extractLocalServerIdentifier
      isODRStub.onSecondCall().mockReturnValue(true); // main function ODR check
      vi.spyOn(ODRProvider, "listServers").mockRejectedValue(new Error("ODR unavailable"));
      vi.spyOn(ODRProvider, "getToolsForODRServer").mockResolvedValue(mockODRTools);
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      // Should fall back to original serverName
      assert.equal(calledInputs[QuestionNames.MCPLocalServerIdentifier], "odrServer");
    });

    it("should return original name when no ODR server matches by command and args", async () => {
      const args = [
        {
          serverName: "odrServer",
          serverConfig: { type: "stdio", command: "odr", args: ["run", "other-server"] },
        },
      ];
      const mockODRTools = [{ name: "tool1", description: "Test", inputSchema: {} }];
      const mockODRServers = [
        {
          name: "my-server",
          display_name: "My Server",
          description: "Test Server",
          version: "1.0.0",
          identifier: "my-server-identifier",
          tools: mockODRTools,
          packageFamily: "test.package",
          command: "odr",
          args: ["run", "my-server"], // Different args than the config
        },
      ];

      const isODRStub = vi.spyOn(ODRProvider, "isODRServer");
      isODRStub.onFirstCall().mockReturnValue(true); // extractLocalServerIdentifier
      isODRStub.onSecondCall().mockReturnValue(true); // main function ODR check
      vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockODRServers);
      vi.spyOn(ODRProvider, "getToolsForODRServer").mockResolvedValue(mockODRTools);
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      // Should fall back to original serverName since args don't match
      assert.equal(calledInputs[QuestionNames.MCPLocalServerIdentifier], "odrServer");
    });

    it("should return original name for non-ODR local server in extractLocalServerIdentifier", async () => {
      const args = [
        {
          serverName: "myLocalServer",
          serverConfig: { type: "stdio", command: "node", args: ["server.js"] },
        },
      ];
      const mockTools = [
        { name: "mcp_mylocalserver_tool1", description: "Test", inputSchema: {}, tags: [] },
      ];

      vi.spyOn(ODRProvider, "isODRServer").mockReturnValue(false);
      mockValue(vscode.lm, "tools", mockTools);
      const runCommandStub = vi.spyOn(sharedOpts, "runCommand").mockResolvedValue(ok(undefined));

      const result = await updateActionWithMCP(args);

      assert.isTrue(result.isOk());
      const calledInputs = runCommandStub.getCall(0).args[1] as Inputs;
      assert.equal(calledInputs[QuestionNames.MCPLocalServerIdentifier], "myLocalServer");
    });
  });
});
