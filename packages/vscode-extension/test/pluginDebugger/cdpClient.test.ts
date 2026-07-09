import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
import {
  CDPClient,
  cdpClientManager,
  CDPModule,
  isCopilotChatUrl,
  isM365ChatUrl,
  isM365CopilotChatDebugConfiguration,
  isOfficeChatUrl,
} from "../../src/pluginDebugger/cdpClient";
import { WebSocketEventHandler } from "../../src/pluginDebugger/webSocketEventHandler";
import * as ui from "../../src/qm/vsc_ui";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";

describe("cdpClient", () => {
  let clock: ReturnType<typeof vi.useFakeTimers>;

  beforeEach(() => {
    clock = vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clock.restore();
  });

  describe("connectWithBackoff", () => {
    it("build fail", async () => {
      vi.spyOn(CDPModule, "build").mockRejectedValue(new Error());
      const client = new CDPClient("url", 9222, "name");
      try {
        const p = client.connectWithBackoff(9222, "", 1, 1);
        clock.tick(1);
        await p;
        assert.fail("should not reach here");
      } catch (e) {
        assert.isDefined(e);
      }
    });
  });
  describe("subscribeToWebSocketEvents", () => {
    it("happy", async () => {
      const cdpClient = new CDPClient("url", 9222, "name");
      mockValue(cdpClient, "url", "xxx");
      vi.spyOn(cdpClient, "connectToTargetIframeWithRetries").mockResolvedValue();
      const client = {
        Network: { enable: () => {}, webSocketFrameReceived: () => {} },
        Page: { enable: () => {} },
        Target: {
          getTargets: () => {
            return { targetInfos: [] };
          },
        },
      } as any;
      const webSocketFrameReceived = vi.spyOn(client.Network, "webSocketFrameReceived");
      await cdpClient.subscribeToWebSocketEvents(client);
      assert.isTrue(webSocketFrameReceived.called);
    });
  });
  describe("start", () => {
    it("happy", async () => {
      const sendTelemetryEvent = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      const cdpClient = new CDPClient("url", 9222, "name");
      vi.spyOn(CDPModule, "build").mockResolvedValue({
        Network: { enable: () => {}, webSocketFrameReceived: () => {} },
        Page: { enable: () => {} },
        Target: {
          getTargets: () => {
            return { targetInfos: [] };
          },
        },
      } as any);
      cdpClient.errors = [new Error()];
      vi.spyOn(cdpClient, "subscribeToWebSocketEvents").mockResolvedValue();
      const startPromise = cdpClient.start();
      clock.tick(2000);
      await startPromise;
      assert.isTrue(sendTelemetryEvent.called);
    });
    it("error", async () => {
      const sendTelemetryEvent = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      const sendTelemetryErrorEvent = vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      const cdpClient = new CDPClient("url", 9222, "name");
      cdpClient.errors = [new Error()];
      vi.spyOn(CDPModule, "build").mockResolvedValue({
        Network: { enable: () => {}, webSocketFrameReceived: () => {} },
        Page: { enable: () => {} },
        Target: {
          getTargets: () => {
            return { targetInfos: [] };
          },
        },
      } as any);
      vi.spyOn(cdpClient, "subscribeToWebSocketEvents").mockRejectedValue(new Error());
      const startPromise = cdpClient.start();
      clock.tick(2000);
      await startPromise;
      assert.isTrue(sendTelemetryEvent.called);
      assert.isTrue(sendTelemetryErrorEvent.called);
    });
  });
  describe("stop", () => {
    it("happy", async () => {
      const sendTelemetryEvent = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      const cdpClient = new CDPClient("url", 9222, "name");
      cdpClient.errors = [new Error()];
      cdpClient.client = {
        close: () => {},
      } as any;
      await cdpClient.stop();
      assert.isTrue(sendTelemetryEvent.called);
    });
  });
  describe("webSocketFrameReceivedHandler", () => {
    it("happy", async () => {
      const stub = vi.spyOn(WebSocketEventHandler, "handleEvent");
      stub.mockReturnValue(1);
      const cdpClient = new CDPClient("url", 9222, "name");
      cdpClient.webSocketFrameReceivedHandler({} as any);
      assert.isTrue(stub.called);
    });
  });

  describe("connectToTargetIframeWithRetries", () => {
    it("happy", async () => {
      const cdpClient = new CDPClient("url", 9222, "name");
      const stub = vi.spyOn(cdpClient, "connectToTargetIframe");
      const client = {} as any;
      stub.mockResolvedValue(true);
      cdpClient.enableRetry = true;
      cdpClient.connectToTargetIframeWithRetries(client);
      assert.isTrue(stub.calledOnce);
    });
    // it("error", async () => {
    //   const cdpClient = new CDPClient("url", 9222, "name");
    //   vi.spyOn(cdpClient, "connectToTargetIframe").mockRejectedValue(new Error());
    //   const client = {} as any;
    //   await cdpClient.connectToTargetIframeWithRetries(client, 1, 1);
    //   assert.isUndefined(cdpClient.client);
    // });
    it("reach max try", async () => {
      const cdpClient = new CDPClient("url", 9222, "name");
      vi.spyOn(cdpClient, "connectToTargetIframe").mockRejectedValue(new Error());
      const client = {} as any;
      const p = cdpClient.connectToTargetIframeWithRetries(client, 2, 1);
      await clock.tickAsync(2000);
      await p;
      assert.isUndefined(cdpClient.client);
    });
  });

  describe("connectToTargetIframe", () => {
    it("no targetInfo", async () => {
      const client = {
        Network: { enable: () => {}, webSocketFrameReceived: () => {} },
        Page: { enable: () => {} },
        Target: {
          getTargets: () => {
            return { targetInfos: [] };
          },
        },
      } as any;
      const cdpClient = new CDPClient("url", 9222, "name");
      const res = await cdpClient.connectToTargetIframe(client);
      assert.isFalse(res);
    });
    it("no sessionClient", async () => {
      const client = {
        Network: { enable: () => {}, webSocketFrameReceived: () => {} },
        Page: { enable: () => {} },
        Target: {
          getTargets: () => {
            return {
              targetInfos: [
                {
                  type: "iframe",
                  url: "outlook.office.com/hosted/semanticoverview/Users",
                },
              ],
            };
          },
        },
      } as any;
      const cdpClient = new CDPClient("url", 9222, "name");
      vi.spyOn(cdpClient, "connectWithBackoff").mockResolvedValue(undefined);
      const res = await cdpClient.connectToTargetIframe(client);
      assert.isFalse(res);
    });
    it("happy path", async () => {
      const client = {
        Network: { enable: () => {}, webSocketFrameReceived: () => {} },
        Page: { enable: () => {} },
        Target: {
          getTargets: () => {
            return {
              targetInfos: [
                {
                  type: "iframe",
                  url: "outlook.office.com/hosted/semanticoverview/Users",
                },
              ],
            };
          },
        },
        close: () => {},
      } as any;
      const cdpClient = new CDPClient("url", 9222, "name");
      vi.spyOn(cdpClient, "connectWithBackoff").mockResolvedValue(client);
      const res = await cdpClient.connectToTargetIframe(client);
      assert.isTrue(res);
    });
  });
});

describe("isM365CopilotChatDebugConfiguration", () => {
  it("true", async () => {
    const config: any = {
      request: "launch",
      url: "https://www.office.com/chat?auth=2&developerMode=Basic",
      runtimeArgs: ["--remote-debugging-port=9222"],
    };
    const res = isM365CopilotChatDebugConfiguration(config);
    assert.isDefined(res);
  });

  it("false - request", async () => {
    const config: any = {
      request: "abc",
    };
    const res = isM365CopilotChatDebugConfiguration(config);
    assert.isUndefined(res);
  });
  it("false - url undefined", async () => {
    const config: any = {
      request: "launch",
    };
    const res = isM365CopilotChatDebugConfiguration(config);
    assert.isUndefined(res);
  });

  it("false - url is not chat", async () => {
    const config: any = {
      request: "launch",
      url: "https://abc",
    };
    const res = isM365CopilotChatDebugConfiguration(config);
    assert.isUndefined(res);
  });

  it("false - url param", async () => {
    const config: any = {
      request: "launch",
      url: "https://www.office.com/chat?auth=2",
    };
    const res = isM365CopilotChatDebugConfiguration(config);
    assert.isUndefined(res);
  });

  it("false - runtimeArgs undefined", async () => {
    const config: any = {
      request: "launch",
      url: "https://www.office.com/chat?auth=2&developerMode=Basic",
    };
    const res = isM365CopilotChatDebugConfiguration(config);
    assert.isUndefined(res);
  });

  it("false - runtimeArgs not contains port", async () => {
    const config: any = {
      request: "launch",
      url: "https://www.office.com/chat?auth=2&developerMode=Basic",
      runtimeArgs: [],
    };
    const res = isM365CopilotChatDebugConfiguration(config);
    assert.isUndefined(res);
  });

  it("false - runtimeArgs contains invalid port", async () => {
    const config: any = {
      request: "launch",
      url: "https://www.office.com/chat?auth=2&developerMode=Basic",
      runtimeArgs: ["--remote-debugging-port=abc"],
    };
    const res = isM365CopilotChatDebugConfiguration(config);
    assert.isUndefined(res);
  });

  it("Mac OS remove user-data-dir", async () => {
    const config: any = {
      request: "launch",
      url: "https://www.office.com/chat?auth=2&developerMode=Basic",
      runtimeArgs: [
        "--remote-debugging-port=9222",
        "--user-data-dir=${env:TEMP}/copilot-chrome-user-data-dir",
      ],
    };
    mockValue(process, "platform", "darwin");
    const res = isM365CopilotChatDebugConfiguration(config);
    assert.equal(res, 9222);
    assert.equal(config.runtimeArgs.length, 1);
  });
});

describe("isCopilotChatUrl", () => {
  it("true", async () => {
    const res = isCopilotChatUrl("https://www.office.com/chat?auth=2&developerMode=Basic");
    assert.isTrue(res);
  });

  it("false", async () => {
    const res = isCopilotChatUrl("https://abc.com");
    assert.isFalse(res);
  });
});

describe("isOfficeChatUrl", () => {
  it("true", async () => {
    const res = isOfficeChatUrl("https://www.office.com/chat?auth=2&developerMode=Basic");
    assert.isTrue(res);
  });

  it("false", async () => {
    const res = isOfficeChatUrl("https://abc.com");
    assert.isFalse(res);
  });
});

describe("isM365ChatUrl", () => {
  it("true", async () => {
    const res = isM365ChatUrl("https://m365.cloud.microsoft/chat");
    assert.isTrue(res);
  });
  it("false", async () => {
    const res = isM365ChatUrl("https://abc.com");
    assert.isFalse(res);
  });
});

describe("CDPClientManager", () => {
  describe("start", () => {
    it("exist", async () => {
      mockValue(ui, "VS_CODE_UI", { showMessage: () => {} } as any);
      vi.spyOn(CDPClient.prototype, "stop").mockResolvedValue();
      vi.spyOn(CDPClient.prototype, "start").mockResolvedValue();
      cdpClientManager.sessions.set(9222, new CDPClient("url", 9222, "name"));
      const client = cdpClientManager.start("https://m365.cloud.microsoft/chat", 9222, "name");
      assert.isDefined(client);
    });
  });
  describe("stop", () => {
    it("happy", async () => {
      const client = new CDPClient("url", 9222, "name");
      cdpClientManager.sessions.set(9222, client);
      const stub = vi.spyOn(client, "stop").mockResolvedValue();
      await cdpClientManager.stop(9222);
      assert.isTrue(stub.called);
    });
  });
});
