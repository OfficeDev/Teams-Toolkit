import * as vscode from "vscode";
import { CopilotDebugLog } from "../../src/pluginDebugger/copilotDebugLogOutput";
import { WebSocketEventHandler } from "../../src/pluginDebugger/webSocketEventHandler";
import * as ui from "../../src/qm/vsc_ui";
import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";

describe("WebSocketEventHandler", () => {
  beforeEach(() => {
    (vscode as any).debug = {
      activeDebugConsole: {
        appendLine: () => {},
      },
    };
  });

  describe("handleEvent", () => {
    it("isWebSocketDataRelevant returns false", () => {
      vi.spyOn(WebSocketEventHandler, "isWebSocketDataRelevant").mockReturnValue(false);
      const num = WebSocketEventHandler.handleEvent({ payloadData: '{"type":1' } as any);
      assert.equal(num, 0);
    });
    it("throw error", () => {
      const appendLineStub = vi.spyOn(vscode.debug.activeDebugConsole, "appendLine");
      const mockUi = { showMessage: () => {} } as any;
      mockValue(ui, "VS_CODE_UI", mockUi);
      const showMessageStub = vi.spyOn(mockUi, "showMessage");
      vi.spyOn(WebSocketEventHandler, "isWebSocketDataRelevant").mockReturnValue(true);
      vi.spyOn(WebSocketEventHandler, "splitObjects").throws(new Error("Test"));
      const num = WebSocketEventHandler.handleEvent({ payloadData: '{"type":1' } as any);
      assert.equal(num, 0);
      assert.isTrue(showMessageStub.calledOnce);
      assert.isTrue(appendLineStub.calledOnce);
    });
    it("happy", () => {
      vi.spyOn(WebSocketEventHandler, "isWebSocketDataRelevant").mockReturnValue(true);
      const obj = { item: { messages: [] } };
      vi.spyOn(WebSocketEventHandler, "splitObjects").mockReturnValue([JSON.stringify(obj)]);
      vi.spyOn(WebSocketEventHandler, "selectBotTextMessages").mockReturnValue([{} as any]);
      vi.spyOn(WebSocketEventHandler, "convertBotMessageToChannelOutput").mockReturnValue();
      const num = WebSocketEventHandler.handleEvent({ payloadData: '{"type":1' } as any);
      assert.equal(num, 1);
    });
  });
  describe("isWebSocketDataRelevant", () => {
    it("true", () => {
      const res = WebSocketEventHandler.isWebSocketDataRelevant({
        payloadData: '{"type":2',
      } as any);
      assert.isTrue(res);
    });
    it("false", () => {
      const res = WebSocketEventHandler.isWebSocketDataRelevant({
        payloadData: '{"type":1',
      } as any);
      assert.isFalse(res);
    });
  });
  describe("splitObjects", () => {
    it("happy", () => {
      const res = WebSocketEventHandler.splitObjects({
        payloadData: "abc\x1e123",
      } as any);
      assert.deepEqual(res, ["abc", "123"]);
    });
  });
  describe("selectBotTextMessages", () => {
    it("happy", () => {
      const res = WebSocketEventHandler.selectBotTextMessages({
        item: { messages: [{ messageType: "DeveloperLogs" }] },
      } as any);
      assert.deepEqual(res, [{ messageType: "DeveloperLogs" }] as any);
    });

    it("with prompt", () => {
      const res = WebSocketEventHandler.selectBotTextMessages({
        item: {
          messages: [
            { messageType: "DeveloperLogs" },
            { contentOrigin: "officeweb", text: "test" },
          ],
        },
      } as any);
      assert.deepEqual(res, [{ messageType: "DeveloperLogs", prompt: "test" }] as any);
    });
  });
  describe("convertBotMessageToChannelOutput", () => {
    it("happy", () => {
      const stub = vi.spyOn(CopilotDebugLog.prototype, "write");
      WebSocketEventHandler.convertBotMessageToChannelOutput({
        messageType: "DeveloperLogs",
        text: JSON.stringify({
          functionExecutions: [{ requestUrl: "" }],
        }),
        prompt: "listRepairs",
      } as any);
      assert.isTrue(stub.calledOnce);
    });
  });
  describe("convertBotMessageToChannelOutputJson", () => {
    it("happy", () => {
      const stub = vi.spyOn(WebSocketEventHandler, "prettyPrintJson");
      stub.mockReturnValue(
        JSON.stringify({
          functionExecutions: [{ requestUrl: "" }],
        })
      );
      WebSocketEventHandler.convertBotMessageToChannelOutputJson({
        messageType: "DeveloperLogs",
        text: JSON.stringify({
          functionExecutions: [{ requestUrl: "" }],
        }),
      } as any);
      assert.isTrue(stub.calledOnce);
    });
  });
  describe("prettyPrintJson", () => {
    it("happy", () => {
      const res = WebSocketEventHandler.prettyPrintJson(JSON.stringify({ a: "b" }));
      assert.equal(res, JSON.stringify({ a: "b" }, null, 2));
    });
  });
});
