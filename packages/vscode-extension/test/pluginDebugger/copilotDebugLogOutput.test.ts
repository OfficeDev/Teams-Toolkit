import { LogLevel } from "@microsoft/teamsfx-api";
import * as vscode from "vscode";
import { ANSIColors } from "../../src/debug/common/debugConstants";
import * as globalVariables from "../../src/globalVariables";
import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
import {
  CopilotDebugLog,
  logToDebugConsole,
  writeExecutionDetailsToFile,
} from "../../src/pluginDebugger/copilotDebugLogOutput";

describe("copilotDebugLogOutput", () => {
  const message = "log message";
  const fixedDate = new Date("2023-01-01T00:00:00.000Z");
  const logDateString = fixedDate.toJSON();

  beforeEach(() => {
    (vscode as any).debug = {
      activeDebugConsole: {
        appendLine: () => {},
      },
    };
    sandbox.useFakeTimers(fixedDate.getTime());
  });

  describe("logToDebugConsole", () => {
    it("should log info messages to the debug console", () => {
      const appendLineStub = vi.spyOn(vscode.debug.activeDebugConsole, "appendLine");
      logToDebugConsole(LogLevel.Info, message);
      assert.isTrue(appendLineStub.calledOnce);
      assert.isTrue(
        appendLineStub.calledWith(
          ANSIColors.WHITE + `[${logDateString}] - ` + ANSIColors.BLUE + `${message}`
        )
      );
    });
    it("should log warning messages to the debug console", () => {
      const appendLineStub = vi.spyOn(vscode.debug.activeDebugConsole, "appendLine");
      logToDebugConsole(LogLevel.Warning, message);
      assert.isTrue(appendLineStub.calledOnce);
      assert.isTrue(
        appendLineStub.calledWith(
          ANSIColors.WHITE + `[${logDateString}] - ` + ANSIColors.YELLOW + `${message}`
        )
      );
    });
    it("should log error messages to the debug console", () => {
      const appendLineStub = vi.spyOn(vscode.debug.activeDebugConsole, "appendLine");
      logToDebugConsole(LogLevel.Error, message);
      assert.isTrue(appendLineStub.calledOnce);
      assert.isTrue(
        appendLineStub.calledWith(
          ANSIColors.WHITE + `[${logDateString}] - ` + ANSIColors.RED + `${message}`
        )
      );
    });
    it("should log debug messages to the debug console", () => {
      const appendLineStub = vi.spyOn(vscode.debug.activeDebugConsole, "appendLine");
      logToDebugConsole(LogLevel.Debug, message);
      assert.isTrue(appendLineStub.calledOnce);
      assert.isTrue(
        appendLineStub.calledWith(
          ANSIColors.WHITE + `[${logDateString}] - ` + ANSIColors.GREEN + `${message}`
        )
      );
    });
    it("should log messages to the debug console", () => {
      const appendLineStub = vi.spyOn(vscode.debug.activeDebugConsole, "appendLine");
      logToDebugConsole(LogLevel.Verbose, message);
      assert.isTrue(appendLineStub.calledOnce);
      assert.isTrue(
        appendLineStub.calledWith(ANSIColors.WHITE + `[${logDateString}] - ${message}`)
      );
    });
  });

  describe("writeExecutionDetailsToFile", () => {
    it("should write function execution details to file", async () => {
      const fs = require("fs");
      const appendFileStub = vi.spyOn(fs, "appendFileSync").mockResolvedValue();
      writeExecutionDetailsToFile("path/to/log.txt", "log message");
      assert.isTrue(appendFileStub.calledWith("path/to/log.txt", "log message\n"));
    });
  });

  describe("CopilotDebugLog", () => {
    it("should parse log JSON and initialize properties", () => {
      const logJson = JSON.stringify({
        enabledPlugins: [{ name: "plugin1", id: "1", version: "1.0" }],
        matchedFunctionCandidates: [
          {
            plugin: { name: "plugin1", id: "1", version: "1.0" },
            functionDisplayName: "function1",
          },
        ],
        functionsSelectedForInvocation: [
          {
            plugin: { name: "plugin1", id: "1", version: "1.0" },
            functionDisplayName: "function1",
          },
        ],
        functionExecutions: [
          {
            function: {
              plugin: { name: "plugin1", id: "1", version: "1.0" },
              functionDisplayName: "function1",
            },
            executionStatus: { requestStatus: 200, responseStatus: 200, responseType: 1 },
            parameters: {},
            requestUri: "http://example.com",
            requestMethod: "GET",
            responseContent: "",
            responseContentType: "",
            errorMessage: "",
          },
        ],
      });
      const copilotDebugLog = new CopilotDebugLog(logJson);
      assert.deepEqual(copilotDebugLog.enabledPlugins, [
        { name: "plugin1", id: "1", version: "1.0" },
      ]);
      assert.deepEqual(copilotDebugLog.matchedFunctionCandidates, [
        { plugin: { name: "plugin1", id: "1", version: "1.0" }, functionDisplayName: "function1" },
      ]);
      assert.deepEqual(copilotDebugLog.functionsSelectedForInvocation, [
        { plugin: { name: "plugin1", id: "1", version: "1.0" }, functionDisplayName: "function1" },
      ]);
      assert.deepEqual(copilotDebugLog.functionExecutions, [
        {
          function: {
            plugin: { name: "plugin1", id: "1", version: "1.0" },
            functionDisplayName: "function1",
          },
          executionStatus: { requestStatus: 200, responseStatus: 200, responseType: 1 },
          parameters: {},
          requestUri: "http://example.com",
          requestMethod: "GET",
          responseContent: "",
          responseContentType: "",
          errorMessage: "",
        },
      ]);
    });

    it("should throw an error if log JSON is invalid", () => {
      const invalidLogJson = "{ invalid json }";
      assert.throws(() => new CopilotDebugLog(invalidLogJson), /Error parsing logAsJson/);
    });

    it("should throw an error if requestUri is invalid", () => {
      const logJson = JSON.stringify({
        functionExecutions: [
          {
            function: {
              plugin: { name: "plugin1", id: "1", version: "1.0" },
              functionDisplayName: "function1",
            },
            executionStatus: { requestStatus: 200, responseStatus: 200, responseType: 1 },
            parameters: {},
            requestUri: "invalid uri",
            requestMethod: "GET",
            responseContent: "",
            responseContentType: "",
            errorMessage: "",
          },
        ],
      });
      assert.throws(() => new CopilotDebugLog(logJson), /Error creating URL object for requestUri/);
    });

    it("should skip if matched function plugin id not equal to enabled plugin id", () => {
      const logJson = JSON.stringify({
        enabledPlugins: [{ name: "plugin1", id: "1", version: "1.0" }],
        matchedFunctionCandidates: [
          {
            plugin: { name: "plugin2", id: "2", version: "1.0" },
            functionDisplayName: "function1",
          },
        ],
      });
      const copilotDebugLog = new CopilotDebugLog(logJson);
      const appendLineStub = vi.spyOn(vscode.debug.activeDebugConsole, "appendLine");
      copilotDebugLog.write();

      assert.isFalse(
        appendLineStub.calledWith(
          `${ANSIColors.GREEN}   (√) ${ANSIColors.WHITE}Matched functions: ${ANSIColors.MAGENTA}plugin2`
        )
      );
    });

    it("should return if no enabledCapabilities", () => {
      const logJson = JSON.stringify({
        capabilitiesDeveloperInfo: {
          enabledCapabilities: [],
        },
      });
      const copilotDebugLog = new CopilotDebugLog(logJson);
      const appendLineStub = vi.spyOn(vscode.debug.activeDebugConsole, "appendLine");

      copilotDebugLog["logCapabilities"](vscode.debug.activeDebugConsole);
      assert.isFalse(appendLineStub.calledOnce);
    });

    it("write with 0 enabled plugin(s)", () => {
      const logJson = JSON.stringify({
        enabledPlugins: [],
        matchedFunctionCandidates: [],
        functionsSelectedForInvocation: [],
        functionExecutions: [],
      });

      const copilotDebugLog = new CopilotDebugLog(logJson);
      const appendLineStub = vi.spyOn(vscode.debug.activeDebugConsole, "appendLine");
      copilotDebugLog.write();

      assert.isTrue(appendLineStub.calledWith(""));
      assert.isTrue(
        appendLineStub.calledWith(
          `${ANSIColors.WHITE}[${new Date().toJSON()}] - ${ANSIColors.BLUE}0 enabled action(s).`
        )
      );
      assert.isTrue(
        appendLineStub.calledWith(
          `${ANSIColors.RED}(×) Error: ${ANSIColors.WHITE}Enabled plugin: None`
        )
      );
    });

    it("write with 0 matched function candidates", () => {
      const logJson = JSON.stringify({
        enabledPlugins: [{ name: "plugin1", id: "1", version: "1.0" }],
        matchedFunctionCandidates: [],
        functionsSelectedForInvocation: [],
        functionExecutions: [],
      });

      const copilotDebugLog = new CopilotDebugLog(logJson);
      const appendLineStub = vi.spyOn(vscode.debug.activeDebugConsole, "appendLine");
      copilotDebugLog.write();

      assert.isTrue(appendLineStub.calledWith(""));
    });

    it("write with plugins enabled", () => {
      const logJson = JSON.stringify({
        enabledPlugins: [{ name: "plugin1", id: "1", version: "1.0" }],
        matchedFunctionCandidates: [
          {
            plugin: { name: "plugin1", id: "1", version: "1.0" },
            functionDisplayName: "function1",
          },
        ],
        functionsSelectedForInvocation: [
          {
            plugin: { name: "plugin1", id: "1", version: "1.0" },
            functionDisplayName: "function1",
          },
        ],
        functionExecutions: [
          {
            function: {
              plugin: { name: "plugin1", id: "1", version: "1.0" },
              functionDisplayName: "function1",
            },
            executionStatus: { requestStatus: 200, responseStatus: 200, responseType: 1 },
            parameters: {},
            requestUri: "http://example.com",
            requestMethod: "GET",
            responseContent: "",
            responseContentType: "",
            errorMessage: "Sample error",
          },
        ],
      });
      const logFilePath = `/path/to/log/Copilot-debug-test.txt`;
      const responseStatus = 200;
      const fs = require("fs");
      const appendFileSyncStub = vi.spyOn(fs, "appendFileSync").mockResolvedValue();
      mockValue(globalVariables, "defaultExtensionLogPath", "/path/to/log");
      vi.spyOn(Date.prototype, "toISOString").mockReturnValue("test");
      const copilotDebugLog = new CopilotDebugLog(logJson);
      const appendLineStub = vi.spyOn(vscode.debug.activeDebugConsole, "appendLine");
      copilotDebugLog.write();
      assert.isTrue(
        appendLineStub.calledWith(
          `${ANSIColors.GREEN}(√) ${ANSIColors.WHITE}Enabled action: ${ANSIColors.MAGENTA}plugin1 ${ANSIColors.GRAY}• version 1.0 • 1`
        )
      );
      assert.isTrue(
        appendLineStub.calledWith(
          `${ANSIColors.GREEN}   (√) ${ANSIColors.WHITE}Matched functions: ${ANSIColors.MAGENTA}function1`
        )
      );
      assert.isTrue(
        appendLineStub.calledWith(
          `${ANSIColors.GREEN}      (√) ${ANSIColors.WHITE}Selected functions for execution: ${ANSIColors.MAGENTA}function1`
        )
      );
      assert.isTrue(
        appendLineStub.calledWith(
          `${ANSIColors.GREEN}         (√) ${ANSIColors.WHITE}Function execution details: ${ANSIColors.GREEN}Status ${responseStatus}, ${ANSIColors.WHITE}refer to ${ANSIColors.BLUE}${logFilePath}${ANSIColors.WHITE} for all details.`
        )
      );
      assert.isTrue(
        appendLineStub.calledWith(
          `${ANSIColors.RED}            (×) Error: ${ANSIColors.WHITE}Sample error`
        )
      );
    });
    it("should pretty print JSON", () => {
      const jsonText = '{"key":"value"}';
      const result = CopilotDebugLog.prettyPrintJson(jsonText);
      assert.strictEqual(result, '{\n  "key": "value"\n}');
    });

    it("should parse full JSON with capabilities and initialize properties", () => {
      const logJson = JSON.stringify({
        pluginDeveloperInfo: {
          enabledPlugins: [{ name: "plugin1", id: "1", version: "1.0" }],
          matchedFunctionCandidates: [
            {
              plugin: { name: "plugin1", id: "1", version: "1.0" },
              functionDisplayName: "function1",
            },
          ],
          functionsSelectedForInvocation: [
            {
              plugin: { name: "plugin1", id: "1", version: "1.0" },
              functionDisplayName: "function1",
            },
          ],
          functionExecutions: [
            {
              function: {
                plugin: { name: "plugin1", id: "1", version: "1.0" },
                functionDisplayName: "function1",
              },
              executionStatus: { requestStatus: 200, responseStatus: 200, responseType: 1 },
              parameters: {},
              requestUri: "http://example.com",
              requestMethod: "GET",
              responseContent: "",
              responseContentType: "",
              errorMessage: "",
            },
          ],
        },
        capabilitiesDeveloperInfo: {
          enabledCapabilities: [
            {
              capabilityIcon: "iconUrl",
              capabilityName: "GraphConnectors",
              scopes: {},
            },
          ],
          capabilityExecutions: [
            {
              name: "GraphConnectors",
              status: "0",
              errorMessage: "",
            },
          ],
        },
        agentMetaData: {
          agentId: "agentId",
          agentVersion: "1.0",
          conversationId: "conversationId",
          requestId: "requestId",
        },
      });
      const copilotDebugLog = new CopilotDebugLog(logJson);
      assert.deepEqual(copilotDebugLog.enabledPlugins, [
        { name: "plugin1", id: "1", version: "1.0" },
      ]);
      assert.deepEqual(copilotDebugLog.matchedFunctionCandidates, [
        { plugin: { name: "plugin1", id: "1", version: "1.0" }, functionDisplayName: "function1" },
      ]);
      assert.deepEqual(copilotDebugLog.functionsSelectedForInvocation, [
        { plugin: { name: "plugin1", id: "1", version: "1.0" }, functionDisplayName: "function1" },
      ]);
      assert.deepEqual(copilotDebugLog.functionExecutions, [
        {
          function: {
            plugin: { name: "plugin1", id: "1", version: "1.0" },
            functionDisplayName: "function1",
          },
          executionStatus: { requestStatus: 200, responseStatus: 200, responseType: 1 },
          parameters: {},
          requestUri: "http://example.com",
          requestMethod: "GET",
          responseContent: "",
          responseContentType: "",
          errorMessage: "",
        },
      ]);
      assert.deepEqual(copilotDebugLog.capabilitiesDeveloperInfo?.enabledCapabilities, [
        {
          capabilityIcon: "iconUrl",
          capabilityName: "GraphConnectors",
          scopes: {},
        },
      ]);
      assert.deepEqual(copilotDebugLog.capabilitiesDeveloperInfo?.capabilityExecutions, [
        {
          name: "GraphConnectors",
          status: "0",
          errorMessage: "",
        },
      ]);
      assert.deepEqual(copilotDebugLog.agentMetaData, {
        agentId: "agentId",
        agentVersion: "1.0",
        conversationId: "conversationId",
        requestId: "requestId",
      });
    });

    it("should write header details", () => {
      const logJson = JSON.stringify({
        agentMetaData: {
          agentId: "agentId",
          agentVersion: "1.0",
          conversationId: "conversationId",
          requestId: "requestId",
        },
      });
      const copilotDebugLog = new CopilotDebugLog(logJson);
      const appendLineStub = vi.spyOn(vscode.debug.activeDebugConsole, "appendLine");
      copilotDebugLog.write();
      assert.isTrue(
        appendLineStub.calledWith(
          `${ANSIColors.WHITE}Agent ID (agentId). Conversation ID (conversationId). Request ID (requestId)`
        )
      );
      assert.isTrue(
        appendLineStub.calledWith(
          `${
            ANSIColors.GREEN
          }${0} enabled capabilities, ${0} enabled actions, ${0} failed function executions, ${0} successful function executions, ${0} matched function candidates, ${0} functions selected for invocation.`
        )
      );
      assert.isTrue(appendLineStub.calledWith(ANSIColors.WHITE + "Execution summary"));
    });

    it("should write with 0 capabilities", () => {
      const logJson = JSON.stringify({
        capabilitiesDeveloperInfo: {
          enabledCapabilities: [],
          capabilitiesExecutions: [],
        },
      });

      const copilotDebugLog = new CopilotDebugLog(logJson);
      const appendLineStub = vi.spyOn(vscode.debug.activeDebugConsole, "appendLine");
      copilotDebugLog.write();

      assert.isTrue(appendLineStub.calledWith(ANSIColors.WHITE + "CAPABILITIES"));
      assert.isTrue(
        appendLineStub.calledWith(
          `${ANSIColors.RED} (×) ${ANSIColors.WHITE}Enabled capabilities: None.`
        )
      );
      assert.isTrue(
        appendLineStub.calledWith(
          `   ${ANSIColors.RED} (×) Execution status: ${ANSIColors.WHITE}None.`
        )
      );
    });

    it("should write with capabilities", () => {
      const logJson = JSON.stringify({
        capabilitiesDeveloperInfo: {
          enabledCapabilities: [
            {
              capabilityIcon: "iconUrl",
              capabilityName: "GraphConnectors",
              scopes: {
                scope1: {
                  scopeName: "scope1",
                },
              },
            },
          ],
          capabilitiesExecutions: [],
        },
      });

      const copilotDebugLog = new CopilotDebugLog(logJson);
      const appendLineStub = vi.spyOn(vscode.debug.activeDebugConsole, "appendLine");
      copilotDebugLog.write();

      assert.isTrue(
        appendLineStub.calledWith(
          `${ANSIColors.GREEN}(√) ${ANSIColors.WHITE}Enabled capabilities: ${ANSIColors.MAGENTA}GraphConnectors`
        )
      );
    });

    it("should write with scoped capabilities", () => {
      const logJson = JSON.stringify({
        capabilitiesDeveloperInfo: {
          enabledCapabilities: [
            {
              capabilityIcon: "iconUrl",
              capabilityName: "GraphConnectors",
              scopes: {
                scope1: {
                  scopeName: "scope1",
                },
              },
            },
          ],
          capabilitiesExecutions: [],
        },
      });

      const copilotDebugLog = new CopilotDebugLog(logJson);
      const appendLineStub = vi.spyOn(vscode.debug.activeDebugConsole, "appendLine");
      copilotDebugLog.write();

      assert.isTrue(
        appendLineStub.calledWith(`       ${ANSIColors.WHITE}scope1 - {"scopeName":"scope1"}`)
      );
    });

    it("should write with capabilities executions", () => {
      const logJson = JSON.stringify({
        capabilitiesDeveloperInfo: {
          enabledCapabilities: [
            {
              capabilityIcon: "iconUrl",
              capabilityName: "GraphConnectors",
              scopes: {
                scope1: {
                  scopeName: "scope1",
                },
              },
            },
            {
              capabilityIcon: "iconUrl",
              capabilityName: "OneDriveAndSharePoint",
              scopes: {
                scope1: {
                  scopeName: "scope1",
                },
              },
            },
            {
              capabilityIcon: "iconUrl",
              capabilityName: "WebSearch",
              scopes: {},
            },
          ],
          capabilityExecutions: [
            {
              name: "GraphConnectors",
              status: "1",
              errorMessage: "",
            },
            {
              name: "OneDriveAndSharePoint",
              status: "0",
              errorMessage: "",
              additionalDebugInfo: "test debug info",
            },
          ],
        },
      });

      const fs = require("fs");
      const appendFileStub = vi.spyOn(fs, "appendFileSync").mockResolvedValue();
      mockValue(globalVariables, "defaultExtensionLogPath", "/path/to/log");
      vi.spyOn(Date.prototype, "toISOString").mockReturnValue("test");
      const copilotDebugLog = new CopilotDebugLog(logJson);
      const appendLineStub = vi.spyOn(vscode.debug.activeDebugConsole, "appendLine");
      copilotDebugLog.write();

      assert.isTrue(
        appendLineStub.calledWith(
          `${ANSIColors.GREEN}(√) ${ANSIColors.WHITE}Enabled capabilities: ${ANSIColors.MAGENTA}GraphConnectors`
        )
      );
      assert.isTrue(appendFileStub.calledTwice);
    });
  });
});
