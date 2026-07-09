import { vi, expect, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * @author Xiaofu Huang <xiaofhua@microsoft.com>
 */
import fs from "fs-extra";
import path from "path";
import * as uuid from "uuid";
import * as vscode from "vscode";

import { TunnelRelayTunnelHost } from "@microsoft/dev-tunnels-connections";
import { Tunnel } from "@microsoft/dev-tunnels-contracts";
import {
  TunnelManagementHttpClient,
  ManagementApiVersions,
} from "@microsoft/dev-tunnels-management";
import { FxError, ok, Result, UserError } from "@microsoft/teamsfx-api";
import { envUtil, pathUtils } from "@microsoft/teamsfx-core";

import VsCodeLogInstance from "../../src/commonlib/log";
import { localTelemetryReporter } from "../../src/debug/localTelemetryReporter";
import { BaseTaskTerminal } from "../../src/debug/taskTerminal/baseTaskTerminal";
import { OutputInfo } from "../../src/debug/taskTerminal/baseTunnelTaskTerminal";
import {
  DevTunnelTaskTerminal,
  IDevTunnelArgs,
  TunnelPortWithOutput,
} from "../../src/debug/taskTerminal/devTunnelTaskTerminal";
import { DevTunnelStateManager } from "../../src/debug/taskTerminal/utils/devTunnelStateManager";
import { DevTunnelManager } from "../../src/debug/taskTerminal/utils/devTunnelManager";

import { ExtensionErrors, ExtensionSource } from "../../src/error/error";
import * as globalVariables from "../../src/globalVariables";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";

class TestDevTunnelTaskTerminal extends DevTunnelTaskTerminal {
  public started(): boolean {
    return !!this.cancel;
  }

  public resolveArgs(args: IDevTunnelArgs): void {
    return super.resolveArgs(args);
  }

  public async saveTunnelToEnv(
    env: string | undefined,
    tunnelPorts: TunnelPortWithOutput[]
  ): Promise<Result<OutputInfo, FxError>> {
    return super.saveTunnelToEnv(env, tunnelPorts);
  }

  static create(taskDefinition: vscode.TaskDefinition): TestDevTunnelTaskTerminal {
    const tunnelManagementClientImpl = new TunnelManagementHttpClient(
      "teamsfx-ut",
      ManagementApiVersions.Version20230927preview,
      async () => {
        return "mock-token";
      }
    );
    const devTunnelManager = new DevTunnelManager(tunnelManagementClientImpl);
    const devTunnelStateManager = DevTunnelStateManager.create();
    return new TestDevTunnelTaskTerminal(taskDefinition, devTunnelManager, devTunnelStateManager);
  }
}

describe("devTunnelTaskTerminal", () => {
  const baseDir = path.resolve(__dirname, "data", "devTunnelTaskTerminal");

  describe("do", () => {
    let filePath: string | undefined = undefined;

    beforeEach(async () => {
      filePath = path.resolve(baseDir, uuid.v4().substring(0, 6));
      await fs.ensureDir(filePath);
      mockValue(globalVariables, "workspaceUri", vscode.Uri.parse(filePath));
      mockValue(process, "env", { TEAMSFX_DEV_TUNNEL_TEST: "true" });
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      vi.spyOn(globalVariables, "tools").value({
        tokenProvider: {
          m365TokenProvider: {
            getAccessToken: async () => ok("test-token"),
          },
        },
      });
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      if (filePath) {
        await fs.remove(filePath);
      }
    });

    const taskDefinition: vscode.TaskDefinition = {
      type: "teamsfx",
      command: "debug-start-local-tunnel",
      args: {
        type: "dev-tunnel",
        ports: [
          {
            portNumber: 3978,
            protocol: "http",
            access: "public",
            writeToEnvironmentFile: {
              endpoint: "BOT_ENDPOINT",
              domain: "BOT_DOMAIN",
            },
          },
        ],
        env: "local",
      },
    };

    const mock = (initTunnel: Tunnel[] = []): { mockTunnelArray: Tunnel[] } => {
      const mockTunnelArray: Tunnel[] = initTunnel;
      mockValue(process, "env", { TEAMSFX_DEV_TUNNEL_TEST: "true" });
      vi.spyOn(
        globalVariables.tools.tokenProvider.m365TokenProvider,
        "getAccessToken"
      ).mockResolvedValue(ok("test-token"));
      vi.spyOn(TunnelManagementHttpClient.prototype, "getTunnel").mockImplementation(async (t) => {
        return (
          mockTunnelArray.find(
            (mt) => t.tunnelId === mt.tunnelId && t.clusterId === mt.clusterId
          ) ?? null
        );
      });
      vi.spyOn(TunnelManagementHttpClient.prototype, "createTunnel").mockImplementation(
        async (t) => {
          const id = uuid.v4().substring(0, 8);
          t.tunnelId = id;
          t.clusterId = "test";
          mockTunnelArray.push(t);
          return t;
        }
      );
      vi.spyOn(TunnelManagementHttpClient.prototype, "listTunnels").mockImplementation(
        async (t) => {
          return mockTunnelArray;
        }
      );
      vi.spyOn(TunnelManagementHttpClient.prototype, "deleteTunnel").mockImplementation(
        async (t) => {
          let isDeleted = false;
          let index = 0;
          while (index < mockTunnelArray.length) {
            if (
              mockTunnelArray[index].clusterId === t.clusterId &&
              mockTunnelArray[index].tunnelId === t.tunnelId
            ) {
              mockTunnelArray.splice(index, 1);
              isDeleted = true;
            } else {
              ++index;
            }
          }
          return isDeleted;
        }
      );

      let hostTunnel: Tunnel | undefined = undefined;
      vi.spyOn(TunnelRelayTunnelHost.prototype, "start").mockImplementation(async (t) => {
        t.ports?.forEach((p) => {
          p.portForwardingUris = [
            `https://${p.tunnelId}-${p.portNumber}.${p.clusterId}.devtunnel.test`,
          ];
        });
        hostTunnel = t;
      });
      vi.spyOn(TunnelRelayTunnelHost.prototype, "tunnel", "get").mockImplementation(() => {
        return hostTunnel;
      });

      vi.spyOn(localTelemetryReporter, "sendTelemetryEvent").mockImplementation(() => {});
      vi.spyOn(localTelemetryReporter, "sendTelemetryErrorEvent").mockImplementation(() => {});
      VsCodeLogInstance.outputChannel = {
        appendLine: () => {},
      } as unknown as vscode.OutputChannel;
      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("test-path"));
      return { mockTunnelArray: mockTunnelArray };
    };

    const waitDevTunnelEnabled = async (tunnelTaskTerminal: TestDevTunnelTaskTerminal) => {
      const sleep = (ms: number) =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            resolve();
          }, ms);
        });
      for (let i = 0; i < 50; ++i) {
        if (tunnelTaskTerminal.started()) {
          return;
        }
        await sleep(10);
      }
      return;
    };

    it("happy path", async () => {
      mock();
      const tunnelTaskTerminal = TestDevTunnelTaskTerminal.create(taskDefinition);
      const resArr = await Promise.all([
        tunnelTaskTerminal.do(),
        waitDevTunnelEnabled(tunnelTaskTerminal).then(() => tunnelTaskTerminal.stop()),
      ]);
      assert.isTrue(
        resArr[0].isOk(),
        `Failed with error message - ${resArr[0].isErr() ? resArr[0].error : ""}`
      );
      const devTunnelStateManager = DevTunnelStateManager.create();
      const devTunnelState = await devTunnelStateManager.listDevTunnelStates();
      assert.isEmpty(devTunnelState);
    });

    it("delete existing tunnel", async () => {
      const existingTunnel = { tunnelId: uuid.v4().substring(0, 8), clusterId: "test" };
      const existingTTKTunnel = {
        tunnelId: uuid.v4().substring(0, 8),
        clusterId: "test",
        labels: ["TeamsToolkitCreatedTag"],
      };
      const devTunnelStateManager = DevTunnelStateManager.create();
      const mockResource = mock([existingTunnel, existingTTKTunnel]);
      devTunnelStateManager.setTunnelState(
        Object.assign(existingTTKTunnel, { sessionId: "lastSessionId" })
      );
      const tunnelTaskTerminal = TestDevTunnelTaskTerminal.create(taskDefinition);
      const resArr = await Promise.all([
        tunnelTaskTerminal.do(),
        waitDevTunnelEnabled(tunnelTaskTerminal).then(() => tunnelTaskTerminal.stop()),
      ]);
      assert.isTrue(
        resArr[0].isOk(),
        `Failed with error message - ${resArr[0].isErr() ? resArr[0].error : ""}`
      );
      const devTunnelState = await devTunnelStateManager.listDevTunnelStates();
      assert.isEmpty(devTunnelState);
      assert.equal(mockResource.mockTunnelArray.length, 1);
    });
  });

  describe("resolveArgs", () => {
    const taskDefinition: vscode.TaskDefinition = {
      type: "teamsfx",
    };
    const tunnelTaskTerminal = TestDevTunnelTaskTerminal.create(taskDefinition);
    beforeEach(async () => {
      vi.spyOn(BaseTaskTerminal, "taskDefinitionError").mockImplementation((argName) => {
        return new UserError(
          ExtensionSource,
          ExtensionErrors.TaskDefinitionError,
          `The value of '${argName}' is invalid for the task of type 'teamsfx'`
        );
      });
    });

    afterEach(async () => {
      vi.restoreAllMocks();
    });
    const testDataList: { message: string; args: any; errorPropertyName?: string }[] = [
      {
        message: "undefined args",
        args: undefined,
        errorPropertyName: "args",
      },
      {
        message: "property type - undefined",
        args: {
          ports: [
            {
              portNumber: 53000,
              protocol: "https",
            },
          ],
        },
        errorPropertyName: "args.type",
      },
      {
        message: "property type - error string",
        args: {
          type: "error-type",
        },
        errorPropertyName: "args.type",
      },
      {
        message: "property type - number",
        args: {
          type: 1,
        },
        errorPropertyName: "args.type",
      },
      {
        message: "property ports - undefined",
        args: {
          type: "dev-tunnel",
        },
        errorPropertyName: "args.ports",
      },
      {
        message: "property ports - not array",
        args: {
          type: "dev-tunnel",
          ports: {
            portNumber: 53000,
            protocol: "https",
          },
        },
        errorPropertyName: "args.ports",
      },
      {
        message: "property ports - empty",
        args: {
          type: "dev-tunnel",
          ports: [],
        },
      },
      {
        message: "property ports.portNumber - undefined",
        args: {
          type: "dev-tunnel",
          ports: [
            {
              portNumber: 53000,
              protocol: "https",
            },
            {
              protocol: "http",
            },
          ],
        },
        errorPropertyName: "args.ports[1].portNumber",
      },
      {
        message: "property ports.portNumber - string",
        args: {
          type: "dev-tunnel",
          ports: [
            {
              portNumber: "53000",
              protocol: "https",
            },
            {
              portNumber: 53000,
              protocol: "http",
            },
          ],
        },
        errorPropertyName: "args.ports[0].portNumber",
      },
      {
        message: "property ports.portNumber - string",
        args: {
          type: "dev-tunnel",
          ports: [
            {
              portNumber: "53000",
              protocol: "https",
            },
            {
              portNumber: 53000,
              protocol: "http",
            },
          ],
        },
        errorPropertyName: "args.ports[0].portNumber",
      },
      {
        message: "property ports.protocol - undefined",
        args: {
          type: "dev-tunnel",
          ports: [
            {
              portNumber: 53000,
            },
          ],
        },
        errorPropertyName: "args.ports[0].protocol",
      },
      {
        message: "property ports.protocol - error string",
        args: {
          type: "dev-tunnel",
          ports: [
            {
              portNumber: 53000,
              protocol: "error",
            },
          ],
        },
        errorPropertyName: "args.ports[0].protocol",
      },
      {
        message: "property ports.access - error string",
        args: {
          type: "dev-tunnel",
          ports: [
            {
              portNumber: 53000,
              protocol: "https",
              access: "error",
            },
          ],
        },
        errorPropertyName: "args.ports[0].access",
      },
      {
        message: "property ports.writeToEnvironmentFile - error type",
        args: {
          type: "dev-tunnel",
          ports: [
            {
              portNumber: 53000,
              protocol: "https",
              writeToEnvironmentFile: "error",
            },
          ],
        },
        errorPropertyName: "args.ports[0].writeToEnvironmentFile",
      },
      {
        message: "property ports.writeToEnvironmentFile.endpoint - error type",
        args: {
          type: "dev-tunnel",
          ports: [
            {
              portNumber: 53000,
              protocol: "https",
              writeToEnvironmentFile: {
                endpoint: 1,
              },
            },
          ],
        },
        errorPropertyName: "args.ports[0].writeToEnvironmentFile.endpoint",
      },
      {
        message: "property ports.writeToEnvironmentFile.domain - error type",
        args: {
          type: "dev-tunnel",
          ports: [
            {
              portNumber: 53000,
              protocol: "https",
              writeToEnvironmentFile: {
                domain: 1,
              },
            },
          ],
        },
        errorPropertyName: "args.ports[0].writeToEnvironmentFile.domain",
      },
      {
        message: "property ports.writeToEnvironmentFile - empty",
        args: {
          type: "dev-tunnel",
          ports: [
            {
              portNumber: 53000,
              protocol: "https",
              writeToEnvironmentFile: {},
            },
          ],
        },
      },
      {
        message: "property env - error type",
        args: {
          type: "dev-tunnel",
          ports: [
            {
              portNumber: 53000,
              protocol: "https",
            },
          ],
          env: 123,
        },
        errorPropertyName: "args.env",
      },
      {
        message: "property env - error expiration",
        args: {
          type: "dev-tunnel",
          ports: [
            {
              portNumber: 53000,
              protocol: "https",
            },
          ],
          expiration: "error",
        },
        errorPropertyName: "args.expiration",
      },
      {
        message: "happy path",
        args: {
          type: "dev-tunnel",
          ports: [
            {
              portNumber: 53000,
              protocol: "https",
              access: "private",
              writeToEnvironmentFile: {
                endpoint: "TAB_ENDPOINT",
                domain: "TAB_DOMAIN",
              },
            },
          ],
          env: "local",
        },
      },
    ];

    testDataList.forEach((testData) => {
      it(testData.message, async () => {
        if (testData.errorPropertyName) {
          expect(() => tunnelTaskTerminal.resolveArgs(testData.args as IDevTunnelArgs)).to.throw(
            `The value of '${testData.errorPropertyName}' is invalid for the task of type 'teamsfx'`
          );
        } else {
          tunnelTaskTerminal.resolveArgs(testData.args as IDevTunnelArgs);
        }
      });
    });
  });

  describe("saveTunnelToEnv", () => {
    const taskDefinition: vscode.TaskDefinition = {
      type: "teamsfx",
    };
    const tunnelTaskTerminal = TestDevTunnelTaskTerminal.create(taskDefinition);

    let filePath: string | undefined = undefined;

    beforeEach(async () => {
      filePath = path.resolve(baseDir, uuid.v4().substring(0, 6));
      await fs.ensureDir(filePath);
      mockValue(globalVariables, "workspaceUri", vscode.Uri.parse(filePath));
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      if (filePath) {
        await fs.remove(filePath);
      }
    });

    it("empty tunnel", async () => {
      const writeEnvStub = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      await tunnelTaskTerminal.saveTunnelToEnv("local", []);
      expect(writeEnvStub).not.toHaveBeenCalled();
    });

    it("empty env", async () => {
      const writeEnvStub = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      await tunnelTaskTerminal.saveTunnelToEnv(undefined, [
        {
          protocol: "http",
          portNumber: 3978,
          portForwardingUri: "https://id-port.cluster.devtunnels.ms",
          writeToEnvironmentFile: {
            endpoint: "BOT_ENDPOINT",
            domain: "BOT_DOMAIN",
          },
        },
      ]);
      expect(writeEnvStub).not.toHaveBeenCalled();
    });

    it("error uri", async () => {
      const res = await tunnelTaskTerminal.saveTunnelToEnv("local", [
        {
          protocol: "http",
          portNumber: 3978,
          portForwardingUri: "id-port.cluster.devtunnels.ms",
          writeToEnvironmentFile: {
            endpoint: "BOT_ENDPOINT",
            domain: "BOT_DOMAIN",
          },
        },
      ]);

      assert.isTrue(res.isErr());
      assert.equal(res.isErr() ? res.error.name : undefined, "TunnelEnvError");
    });

    it("one port", async () => {
      const writeEnvStub = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      await tunnelTaskTerminal.saveTunnelToEnv("local", [
        {
          protocol: "http",
          portNumber: 3978,
          portForwardingUri: "https://id-port.cluster.devtunnels.ms",
          writeToEnvironmentFile: {
            endpoint: "BOT_ENDPOINT",
            domain: "BOT_DOMAIN",
          },
        },
      ]);
      expect(writeEnvStub).toHaveBeenCalledWith(expect.anything(), "local", {
        BOT_ENDPOINT: "https://id-port.cluster.devtunnels.ms",
        BOT_DOMAIN: "id-port.cluster.devtunnels.ms",
      });
    });

    it("multiple ports", async () => {
      const writeEnvStub = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      await tunnelTaskTerminal.saveTunnelToEnv("local", [
        {
          protocol: "http",
          portNumber: 3978,
          portForwardingUri: "https://id-3978.cluster.devtunnels.ms",
          writeToEnvironmentFile: {
            domain: "BOT_DOMAIN",
          },
        },
        {
          protocol: "https",
          portNumber: 53000,
          portForwardingUri: "https://id-53000.cluster.devtunnels.ms",
          writeToEnvironmentFile: {
            endpoint: "TAB_ENDPOINT",
          },
        },
        {
          protocol: "https",
          portNumber: 3333,
          portForwardingUri: "https://id-3333.cluster.devtunnels.ms",
          writeToEnvironmentFile: {},
        },
      ]);
      expect(writeEnvStub).toHaveBeenCalledWith(expect.anything(), "local", {
        BOT_DOMAIN: "id-3978.cluster.devtunnels.ms",
        TAB_ENDPOINT: "https://id-53000.cluster.devtunnels.ms",
      });
    });
  });
});
