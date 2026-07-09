// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { err, ok, Platform, TeamsAppManifest } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import mockedEnv from "mocked-env";
import { v4 as uuid } from "uuid";
import { chai, expect, vi } from "vitest";
import { GraphClient } from "../../../../src/client/graphClient";
import { teamsDevPortalClient } from "../../../../src/client/teamsDevPortalClient";
import { SovereignCloudEnvironment } from "../../../../src/common/accountUtils";
import { FeatureFlagName } from "../../../../src/common/featureFlags";
import { AppStudioError } from "../../../../src/component/driver/teamsApp/errors";
import { PublishingState } from "../../../../src/component/driver/teamsApp/interfaces/appdefinitions/IPublishingAppDefinition";
import { PublishAppPackageArgs } from "../../../../src/component/driver/teamsApp/interfaces/PublishAppPackageArgs";
import { PublishAppPackageDriver } from "../../../../src/component/driver/teamsApp/publishAppPackage";
import * as McpCertVerification from "../../../../src/component/driver/teamsApp/utils/McpCertVerification";
import { ODRProvider } from "../../../../src/component/utils/odrProvider";
import { UserCancelError } from "../../../../src/error/common";
import { MockedM365Provider } from "../../../core/utils";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";
import { Constants } from "./../../../../src/component/driver/teamsApp/constants";

describe("teamsApp/publishAppPackage", async () => {
  const teamsAppDriver = new PublishAppPackageDriver();
  let restoreEnv: (() => void) | undefined;
  const mockedDriverContext: any = {
    m365TokenProvider: new MockedM365Provider(),
    logProvider: new MockedLogProvider(),
    ui: new MockedUserInteraction(),
    projectPath: "./",
  };

  const state = {
    lastModifiedDateTime: new Date(),
    teamsAppId: "",
    displayName: "fakeName",
    publishingState: PublishingState.submitted,
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.restoreAllMocks();
    restoreEnv?.();
    restoreEnv = undefined;
  });

  it("skip publish in GCCH", async () => {
    restoreEnv = mockedEnv({
      [FeatureFlagName.SovereignCloudEnvironment]: SovereignCloudEnvironment.GCCH,
    });
    const publishTeamsAppSpy = vi.spyOn(teamsDevPortalClient, "publishTeamsApp");
    const pathExistsStub = vi.spyOn(fs, "pathExists");

    const args: PublishAppPackageArgs = {
      appPackagePath: "fakepath",
    };

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isOk());
    expect(publishTeamsAppSpy).not.toHaveBeenCalled();
    expect(pathExistsStub).not.toHaveBeenCalled();
  });

  it("skip publish in DoD", async () => {
    restoreEnv = mockedEnv({
      [FeatureFlagName.SovereignCloudEnvironment]: SovereignCloudEnvironment.DOD,
    });
    const publishTeamsAppSpy = vi.spyOn(teamsDevPortalClient, "publishTeamsApp");
    const pathExistsStub = vi.spyOn(fs, "pathExists");

    const args: PublishAppPackageArgs = {
      appPackagePath: "fakepath",
    };

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isOk());
    expect(publishTeamsAppSpy).not.toHaveBeenCalled();
    expect(pathExistsStub).not.toHaveBeenCalled();
  });

  it("should throw error if file not exists", async () => {
    const args: PublishAppPackageArgs = {
      appPackagePath: "fakepath",
    };

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(AppStudioError.FileNotFoundError.name, result.error.name);
    }
  });

  it("invalid param error", async () => {
    const args: PublishAppPackageArgs = {
      appPackagePath: "",
    };

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.equal("InvalidActionInputError", result.error.name);
    }
  });

  it("happy path", async () => {
    const args: PublishAppPackageArgs = {
      appPackagePath: "fakepath",
    };

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      const zip = new AdmZip();
      zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(new TeamsAppManifest())));
      zip.addFile("color.png", Buffer.from(""));
      zip.addFile("outlie.png", Buffer.from(""));

      const archivedFile = zip.toBuffer();
      return archivedFile;
    });
    vi.spyOn(GraphClient.prototype, "getStagedApp").mockResolvedValue(undefined);
    vi.spyOn(GraphClient.prototype, "publishTeamsApp").mockResolvedValue(uuid());

    const result = await teamsAppDriver.execute(args, mockedDriverContext);
    chai.assert.isTrue(result.result.isOk());
  });

  it("should return token error when getAccessToken fails", async () => {
    const args: PublishAppPackageArgs = {
      appPackagePath: "fakepath",
    };

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      const zip = new AdmZip();
      const manifest = new TeamsAppManifest();
      manifest.id = uuid();
      manifest.name = { short: "test-app", full: "test-app" } as any;
      zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(manifest)));
      return zip.toBuffer();
    });

    const tokenError = new UserCancelError();
    vi.spyOn(mockedDriverContext.m365TokenProvider, "getAccessToken").mockResolvedValue(
      err(tokenError)
    );

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(result.error, tokenError);
    }
  });

  it("should return error when publishTeamsApp throws", async () => {
    const args: PublishAppPackageArgs = {
      appPackagePath: "fakepath",
    };

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      const zip = new AdmZip();
      const manifest = new TeamsAppManifest();
      manifest.id = uuid();
      manifest.name = { short: "test-app", full: "test-app" } as any;
      zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(manifest)));
      return zip.toBuffer();
    });

    vi.spyOn(GraphClient.prototype, "getStagedApp").mockResolvedValue(undefined);
    vi.spyOn(GraphClient.prototype, "publishTeamsApp").mockRejectedValue(
      new Error("publish failed")
    );

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.include(result.error.message, "publish failed");
    }
  });

  it("happy path - user cancel", async () => {
    const args: PublishAppPackageArgs = {
      appPackagePath: "fakepath",
    };

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      const zip = new AdmZip();
      zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(new TeamsAppManifest())));
      zip.addFile("color.png", Buffer.from(""));
      zip.addFile("outlie.png", Buffer.from(""));

      const archivedFile = zip.toBuffer();
      return archivedFile;
    });
    vi.spyOn(GraphClient.prototype, "getStagedApp").mockResolvedValue(state);
    vi.spyOn(mockedDriverContext.ui, "showMessage").mockResolvedValue(ok("Cancel"));

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof UserCancelError);
    }
  });

  it("happy path - update published app", async () => {
    const args: PublishAppPackageArgs = {
      appPackagePath: "fakepath",
    };

    mockedDriverContext.platform = Platform.CLI;

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      const zip = new AdmZip();
      zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(new TeamsAppManifest())));
      zip.addFile("color.png", Buffer.from(""));
      zip.addFile("outlie.png", Buffer.from(""));

      const archivedFile = zip.toBuffer();
      return archivedFile;
    });
    vi.spyOn(GraphClient.prototype, "getStagedApp").mockResolvedValue(state);
    vi.spyOn(GraphClient.prototype, "publishTeamsAppUpdate").mockResolvedValue(uuid());
    vi.spyOn(mockedDriverContext.ui, "showMessage").mockResolvedValue(ok("Confirm"));

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert.isTrue(result.isOk());
  });

  describe("MCP plugin certificate verification", () => {
    it("should pass when no declarative agents exist", async () => {
      const args: PublishAppPackageArgs = {
        appPackagePath: "fakepath",
      };

      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockImplementation(async () => {
        const zip = new AdmZip();
        const manifest = new TeamsAppManifest();
        zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(manifest)));
        return zip.toBuffer();
      });
      vi.spyOn(GraphClient.prototype, "getStagedApp").mockResolvedValue(undefined);
      vi.spyOn(GraphClient.prototype, "publishTeamsApp").mockResolvedValue(uuid());

      const result = await teamsAppDriver.execute(args, mockedDriverContext);
      chai.assert.isTrue(result.result.isOk());
    });

    it("should pass when declarativeAgent has no actions", async () => {
      const args: PublishAppPackageArgs = {
        appPackagePath: "fakepath",
      };

      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockImplementation(async () => {
        const zip = new AdmZip();
        const manifest: any = new TeamsAppManifest();
        manifest.copilotAgents = {
          declarativeAgents: [{ id: "agent1", file: "declarativeAgent.json" }],
        };
        zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(manifest)));
        zip.addFile(
          "declarativeAgent.json",
          Buffer.from(
            JSON.stringify({
              name: "Test Agent",
              description: "Test",
            })
          )
        );
        return zip.toBuffer();
      });
      vi.spyOn(GraphClient.prototype, "getStagedApp").mockResolvedValue(undefined);
      vi.spyOn(GraphClient.prototype, "publishTeamsApp").mockResolvedValue(uuid());

      const result = await teamsAppDriver.execute(args, mockedDriverContext);
      chai.assert.isTrue(result.result.isOk());
    });

    it("should pass when action has no runtimes", async () => {
      const args: PublishAppPackageArgs = {
        appPackagePath: "fakepath",
      };

      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockImplementation(async () => {
        const zip = new AdmZip();
        const manifest: any = new TeamsAppManifest();
        manifest.copilotAgents = {
          declarativeAgents: [{ id: "agent1", file: "declarativeAgent.json" }],
        };
        zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(manifest)));
        zip.addFile(
          "declarativeAgent.json",
          Buffer.from(
            JSON.stringify({
              name: "Test Agent",
              description: "Test",
              actions: [{ id: "action1", file: "ai-plugin.json" }],
            })
          )
        );
        zip.addFile(
          "ai-plugin.json",
          Buffer.from(
            JSON.stringify({
              schema_version: "v2.1",
              name_for_human: "Test Plugin",
            })
          )
        );
        return zip.toBuffer();
      });
      vi.spyOn(GraphClient.prototype, "getStagedApp").mockResolvedValue(undefined);
      vi.spyOn(GraphClient.prototype, "publishTeamsApp").mockResolvedValue(uuid());

      const result = await teamsAppDriver.execute(args, mockedDriverContext);
      chai.assert.isTrue(result.result.isOk());
    });

    it("should pass when action has only non-LocalPlugin runtimes", async () => {
      const args: PublishAppPackageArgs = {
        appPackagePath: "fakepath",
      };

      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockImplementation(async () => {
        const zip = new AdmZip();
        const manifest: any = new TeamsAppManifest();
        manifest.copilotAgents = {
          declarativeAgents: [{ id: "agent1", file: "declarativeAgent.json" }],
        };
        zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(manifest)));
        zip.addFile(
          "declarativeAgent.json",
          Buffer.from(
            JSON.stringify({
              name: "Test Agent",
              description: "Test",
              actions: [{ id: "action1", file: "ai-plugin.json" }],
            })
          )
        );
        zip.addFile(
          "ai-plugin.json",
          Buffer.from(
            JSON.stringify({
              schema_version: "v2.1",
              name_for_human: "Test Plugin",
              runtimes: [
                {
                  type: "OpenApi",
                  spec: { url: "https://api.example.com/openapi.json" },
                },
              ],
            })
          )
        );
        return zip.toBuffer();
      });
      vi.spyOn(GraphClient.prototype, "getStagedApp").mockResolvedValue(undefined);
      vi.spyOn(GraphClient.prototype, "publishTeamsApp").mockResolvedValue(uuid());

      const result = await teamsAppDriver.execute(args, mockedDriverContext);
      chai.assert.isTrue(result.result.isOk());
    });

    it("should pass when LocalPlugin runtime is not MCP (no mcp:// prefix)", async () => {
      const args: PublishAppPackageArgs = {
        appPackagePath: "fakepath",
      };

      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockImplementation(async () => {
        const zip = new AdmZip();
        const manifest: any = new TeamsAppManifest();
        manifest.copilotAgents = {
          declarativeAgents: [{ id: "agent1", file: "declarativeAgent.json" }],
        };
        zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(manifest)));
        zip.addFile(
          "declarativeAgent.json",
          Buffer.from(
            JSON.stringify({
              name: "Test Agent",
              description: "Test",
              actions: [{ id: "action1", file: "ai-plugin.json" }],
            })
          )
        );
        zip.addFile(
          "ai-plugin.json",
          Buffer.from(
            JSON.stringify({
              schema_version: "v2.1",
              name_for_human: "Test Plugin",
              runtimes: [
                {
                  type: "LocalPlugin",
                  spec: { local_endpoint: "http://localhost:3000" },
                },
              ],
            })
          )
        );
        return zip.toBuffer();
      });
      vi.spyOn(GraphClient.prototype, "getStagedApp").mockResolvedValue(undefined);
      vi.spyOn(GraphClient.prototype, "publishTeamsApp").mockResolvedValue(uuid());

      const result = await teamsAppDriver.execute(args, mockedDriverContext);
      chai.assert.isTrue(result.result.isOk());
    });

    it("should pass when MCP server not found in ODR list (non-MCP local plugin)", async () => {
      const args: PublishAppPackageArgs = {
        appPackagePath: "fakepath",
      };

      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockImplementation(async () => {
        const zip = new AdmZip();
        const manifest: any = new TeamsAppManifest();
        manifest.copilotAgents = {
          declarativeAgents: [{ id: "agent1", file: "declarativeAgent.json" }],
        };
        zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(manifest)));
        zip.addFile(
          "declarativeAgent.json",
          Buffer.from(
            JSON.stringify({
              name: "Test Agent",
              description: "Test",
              actions: [{ id: "action1", file: "ai-plugin.json" }],
            })
          )
        );
        zip.addFile(
          "ai-plugin.json",
          Buffer.from(
            JSON.stringify({
              schema_version: "v2.1",
              name_for_human: "Test Plugin",
              runtimes: [
                {
                  type: "LocalPlugin",
                  spec: { local_endpoint: "mcp://unknown-server" },
                },
              ],
            })
          )
        );
        return zip.toBuffer();
      });
      vi.spyOn(ODRProvider, "listServers").mockResolvedValue([]);
      vi.spyOn(GraphClient.prototype, "getStagedApp").mockResolvedValue(undefined);
      vi.spyOn(GraphClient.prototype, "publishTeamsApp").mockResolvedValue(uuid());

      const result = await teamsAppDriver.execute(args, mockedDriverContext);
      chai.assert.isTrue(result.result.isOk());
    });

    it("should pass when MCP plugin has valid certificate", async () => {
      const args: PublishAppPackageArgs = {
        appPackagePath: "fakepath",
      };

      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockImplementation(async () => {
        const zip = new AdmZip();
        const manifest: any = new TeamsAppManifest();
        manifest.copilotAgents = {
          declarativeAgents: [{ id: "agent1", file: "declarativeAgent.json" }],
        };
        zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(manifest)));
        zip.addFile(
          "declarativeAgent.json",
          Buffer.from(
            JSON.stringify({
              name: "Test Agent",
              description: "Test",
              actions: [{ id: "action1", file: "ai-plugin.json" }],
            })
          )
        );
        zip.addFile(
          "ai-plugin.json",
          Buffer.from(
            JSON.stringify({
              schema_version: "v2.1",
              name_for_human: "Test Plugin",
              runtimes: [
                {
                  type: "LocalPlugin",
                  spec: { local_endpoint: "mcp://test-server" },
                },
              ],
            })
          )
        );
        return zip.toBuffer();
      });
      vi.spyOn(ODRProvider, "listServers").mockResolvedValue([
        {
          name: "test-server",
          display_name: "Test Server",
          description: "Test",
          version: "1.0.0",
          identifier: "test-server",
          packageFamily: "TestPackage_12345",
          command: "test.exe",
          args: [],
          tools: [],
        },
      ]);
      vi.spyOn(McpCertVerification, "verifyLocalMCPPluginCerts").mockResolvedValue(true);
      vi.spyOn(GraphClient.prototype, "getStagedApp").mockResolvedValue(undefined);
      vi.spyOn(GraphClient.prototype, "publishTeamsApp").mockResolvedValue(uuid());

      const result = await teamsAppDriver.execute(args, mockedDriverContext);
      chai.assert.isTrue(result.result.isOk());
    });

    it("should fail when MCP plugin has self-signed certificate", async () => {
      const args: PublishAppPackageArgs = {
        appPackagePath: "fakepath",
      };

      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockImplementation(async () => {
        const zip = new AdmZip();
        const manifest: any = new TeamsAppManifest();
        manifest.copilotAgents = {
          declarativeAgents: [{ id: "agent1", file: "declarativeAgent.json" }],
        };
        zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(manifest)));
        zip.addFile(
          "declarativeAgent.json",
          Buffer.from(
            JSON.stringify({
              name: "Test Agent",
              description: "Test",
              actions: [{ id: "action1", file: "ai-plugin.json" }],
            })
          )
        );
        zip.addFile(
          "ai-plugin.json",
          Buffer.from(
            JSON.stringify({
              schema_version: "v2.1",
              name_for_human: "Test Plugin",
              runtimes: [
                {
                  type: "LocalPlugin",
                  spec: { local_endpoint: "mcp://test-server" },
                },
              ],
            })
          )
        );
        return zip.toBuffer();
      });
      vi.spyOn(ODRProvider, "listServers").mockResolvedValue([
        {
          name: "test-server",
          display_name: "Test Server",
          description: "Test",
          version: "1.0.0",
          identifier: "test-server",
          packageFamily: "TestPackage_12345",
          command: "test.exe",
          args: [],
          tools: [],
        },
      ]);
      vi.spyOn(McpCertVerification, "verifyLocalMCPPluginCerts").mockResolvedValue(false);

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      chai.assert.isTrue(result.isErr());
      if (result.isErr()) {
        chai.assert.include(result.error.message, "certificate verification failed");
      }
    });

    it("should fail when MCP plugin has no certificate", async () => {
      const args: PublishAppPackageArgs = {
        appPackagePath: "fakepath",
      };

      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockImplementation(async () => {
        const zip = new AdmZip();
        const manifest: any = new TeamsAppManifest();
        manifest.copilotAgents = {
          declarativeAgents: [{ id: "agent1", file: "declarativeAgent.json" }],
        };
        zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(manifest)));
        zip.addFile(
          "declarativeAgent.json",
          Buffer.from(
            JSON.stringify({
              name: "Test Agent",
              description: "Test",
              actions: [{ id: "action1", file: "ai-plugin.json" }],
            })
          )
        );
        zip.addFile(
          "ai-plugin.json",
          Buffer.from(
            JSON.stringify({
              schema_version: "v2.1",
              name_for_human: "Test Plugin",
              runtimes: [
                {
                  type: "LocalPlugin",
                  spec: { local_endpoint: "mcp://test-server" },
                },
              ],
            })
          )
        );
        return zip.toBuffer();
      });
      vi.spyOn(ODRProvider, "listServers").mockResolvedValue([
        {
          name: "test-server",
          display_name: "Test Server",
          description: "Test",
          version: "1.0.0",
          identifier: "test-server",
          packageFamily: "TestPackage_12345",
          command: "test.exe",
          args: [],
          tools: [],
        },
      ]);
      vi.spyOn(McpCertVerification, "verifyLocalMCPPluginCerts").mockResolvedValue(false);

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      chai.assert.isTrue(result.isErr());
      if (result.isErr()) {
        chai.assert.include(result.error.message, "certificate verification failed");
      }
    });

    it("should verify multiple actions with mixed runtimes", async () => {
      const args: PublishAppPackageArgs = {
        appPackagePath: "fakepath",
      };

      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockImplementation(async () => {
        const zip = new AdmZip();
        const manifest: any = new TeamsAppManifest();
        manifest.copilotExtensions = {
          declarativeCopilots: [{ id: "agent1", file: "declarativeAgent.json" }],
        };
        zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(manifest)));
        zip.addFile(
          "declarativeAgent.json",
          Buffer.from(
            JSON.stringify({
              name: "Test Agent",
              description: "Test",
              actions: [
                { id: "action1", file: "plugin1.json" },
                { id: "action2", file: "plugin2.json" },
              ],
            })
          )
        );
        zip.addFile(
          "plugin1.json",
          Buffer.from(
            JSON.stringify({
              schema_version: "v2.1",
              name_for_human: "Plugin 1",
              runtimes: [
                {
                  type: "OpenApi",
                  spec: { url: "https://api.example.com/openapi.json" },
                },
              ],
            })
          )
        );
        zip.addFile(
          "plugin2.json",
          Buffer.from(
            JSON.stringify({
              schema_version: "v2.1",
              name_for_human: "Plugin 2",
              runtimes: [
                {
                  type: "LocalPlugin",
                  spec: { local_endpoint: "mcp://test-server" },
                },
              ],
            })
          )
        );
        return zip.toBuffer();
      });
      vi.spyOn(ODRProvider, "listServers").mockResolvedValue([
        {
          name: "test-server",
          display_name: "Test Server",
          description: "Test",
          version: "1.0.0",
          identifier: "test-server",
          packageFamily: "TestPackage_12345",
          command: "test.exe",
          args: [],
          tools: [],
        },
      ]);
      vi.spyOn(McpCertVerification, "verifyLocalMCPPluginCerts").mockResolvedValue(true);
      vi.spyOn(GraphClient.prototype, "getStagedApp").mockResolvedValue(undefined);
      vi.spyOn(GraphClient.prototype, "publishTeamsApp").mockResolvedValue(uuid());

      const result = await teamsAppDriver.execute(args, mockedDriverContext);
      chai.assert.isTrue(result.result.isOk());
    });
  });

  // eslint-disable-next-line no-secrets/no-secrets
  describe("verifyPackageFamilyCertIsValid", () => {
    let execStub: any;

    beforeEach(() => {
      execStub = vi.spyOn(McpCertVerification.mcpCertDeps, "exec");
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return true when package has valid certificate (Store signature)", async () => {
      execStub.mockImplementation(
        (
          command: string,
          callback: (error: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
          callback(null, {
            stdout: "$_.SignatureKind\n-----------------\nStore\n",
            stderr: "",
          });
        }
      );

      const result = await McpCertVerification.verifyPackageFamilyCertIsValid("TestPackage_12345");
      chai.assert.isTrue(result);
    });

    it("should return true when package has System signature", async () => {
      execStub.mockImplementation(
        (
          command: string,
          callback: (error: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
          callback(null, {
            stdout: "$_.SignatureKind\n-----------------\nSystem\n",
            stderr: "",
          });
        }
      );

      const result = await McpCertVerification.verifyPackageFamilyCertIsValid("TestPackage_12345");
      chai.assert.isTrue(result);
    });

    it("should return false when package has Developer signature (self-signed)", async () => {
      execStub.mockImplementation(
        (
          command: string,
          callback: (error: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
          callback(null, {
            stdout: "$_.SignatureKind\n-----------------\nDeveloper\n",
            stderr: "",
          });
        }
      );

      const result = await McpCertVerification.verifyPackageFamilyCertIsValid("TestPackage_12345");
      chai.assert.isFalse(result);
    });

    it("should return false when package has developer in mixed case", async () => {
      execStub.mockImplementation(
        (
          command: string,
          callback: (error: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
          callback(null, {
            stdout: "$_.SignatureKind\n-----------------\nDEVELOPER\n",
            stderr: "",
          });
        }
      );

      const result = await McpCertVerification.verifyPackageFamilyCertIsValid("TestPackage_12345");
      chai.assert.isFalse(result);
    });

    it("should return false when stdout is empty", async () => {
      execStub.mockImplementation(
        (
          command: string,
          callback: (error: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
          callback(null, {
            stdout: "",
            stderr: "",
          });
        }
      );

      const result = await McpCertVerification.verifyPackageFamilyCertIsValid("TestPackage_12345");
      chai.assert.isFalse(result);
    });

    it("should return false when stdout is null", async () => {
      execStub.mockImplementation(
        (
          command: string,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          callback: (error: Error | null, result: { stdout: any; stderr: string }) => void
        ) => {
          callback(null, {
            stdout: null,
            stderr: "",
          });
        }
      );

      const result = await McpCertVerification.verifyPackageFamilyCertIsValid("TestPackage_12345");
      chai.assert.isFalse(result);
    });

    it("should return false when stdout is undefined", async () => {
      execStub.mockImplementation(
        (
          command: string,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          callback: (error: Error | null, result: { stdout: any; stderr: string }) => void
        ) => {
          callback(null, {
            stdout: undefined,
            stderr: "",
          });
        }
      );

      const result = await McpCertVerification.verifyPackageFamilyCertIsValid("TestPackage_12345");
      chai.assert.isFalse(result);
    });

    it("should return false when PowerShell command fails", async () => {
      execStub.mockImplementation(
        (
          command: string,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          callback: (error: Error | null, result: any) => void
        ) => {
          callback(new Error("PowerShell execution failed"), null);
        }
      );

      const result = await McpCertVerification.verifyPackageFamilyCertIsValid("TestPackage_12345");
      chai.assert.isFalse(result);
    });

    it("should return false when package not found", async () => {
      execStub.mockImplementation(
        (
          command: string,
          callback: (error: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
          callback(null, {
            stdout: "",
            stderr: "Get-AppxPackage : No packages were found",
          });
        }
      );

      const result = await McpCertVerification.verifyPackageFamilyCertIsValid(
        "NonExistentPackage_99999"
      );
      chai.assert.isFalse(result);
    });

    it("should return true when package has Enterprise signature", async () => {
      execStub.mockImplementation(
        (
          command: string,
          callback: (error: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
          callback(null, {
            stdout: "$_.SignatureKind\n-----------------\nEnterprise\n",
            stderr: "",
          });
        }
      );

      const result = await McpCertVerification.verifyPackageFamilyCertIsValid("TestPackage_12345");
      chai.assert.isTrue(result);
    });

    it("should handle stdout with extra whitespace", async () => {
      execStub.mockImplementation(
        (
          command: string,
          callback: (error: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
          callback(null, {
            stdout: "  \n\n  Store  \n\n  ",
            stderr: "",
          });
        }
      );

      const result = await McpCertVerification.verifyPackageFamilyCertIsValid("TestPackage_12345");
      chai.assert.isTrue(result);
    });

    it("should correctly use the package name in PowerShell command", async () => {
      const packageName = "MyApp_abc123xyz";
      execStub.mockImplementation(
        (
          command: string,
          callback: (error: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
          chai.assert.include(command, packageName);
          callback(null, {
            stdout: "Store",
            stderr: "",
          });
        }
      );

      await McpCertVerification.verifyPackageFamilyCertIsValid(packageName);
      chai.assert.isTrue(execStub.mock.calls.length === 1);
    });

    it("should handle timeout errors gracefully", async () => {
      execStub.mockImplementation(
        (
          command: string,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          callback: (error: NodeJS.ErrnoException | null, result: any) => void
        ) => {
          const timeoutError = new Error("Command timed out") as NodeJS.ErrnoException;
          timeoutError.code = "ETIMEDOUT";
          callback(timeoutError, null);
        }
      );

      const result = await McpCertVerification.verifyPackageFamilyCertIsValid("TestPackage_12345");
      chai.assert.isFalse(result);
    });

    it("should return false when stdout contains developer anywhere in text", async () => {
      execStub.mockImplementation(
        (
          command: string,
          callback: (error: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
          callback(null, {
            stdout:
              "SignatureKind: Developer (Self-signed certificate)\nPackageFullName: TestPackage",
            stderr: "",
          });
        }
      );

      const result = await McpCertVerification.verifyPackageFamilyCertIsValid("TestPackage_12345");
      chai.assert.isFalse(result);
    });

    it("should handle PowerShell access denied errors", async () => {
      execStub.mockImplementation(
        (
          command: string,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          callback: (error: NodeJS.ErrnoException | null, result: any) => void
        ) => {
          const accessError = new Error("Access denied") as NodeJS.ErrnoException;
          accessError.code = "EACCES";
          callback(accessError, null);
        }
      );

      const result = await McpCertVerification.verifyPackageFamilyCertIsValid("TestPackage_12345");
      chai.assert.isFalse(result);
    });
  });
});
