// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { err, TeamsAppManifest } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { v4 as uuid } from "uuid";
import { chai, vi } from "vitest";
import { CopilotAgentPublishArgs } from "../../../../src/component/driver/copilotAgent/interfaces/PublishArgs";
import { CopilotAgentPublishDriver } from "../../../../src/component/driver/copilotAgent/publish";
import { Constants } from "../../../../src/component/driver/teamsApp/constants";
import { AppStudioError } from "../../../../src/component/driver/teamsApp/errors";
import * as McpCertVerification from "../../../../src/component/driver/teamsApp/utils/McpCertVerification";
import { PackageService } from "../../../../src/component/m365/packageService";
import { UserCancelError } from "../../../../src/error/common";
import { MockedM365Provider } from "../../../core/utils";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";

describe("copilotAgent/publish", async () => {
  const tempDir = path.join(os.tmpdir(), "fx-core-copilot-publish-tests");
  const createManifestWithDA = (declarativeAgentFile: string) => {
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [{ id: "da1", file: declarativeAgentFile }],
    };
    return manifest;
  };
  const createPackage = async (entryMap: Record<string, unknown | Buffer>): Promise<string> => {
    await fs.ensureDir(tempDir);
    const zip = new AdmZip();
    for (const [entryName, content] of Object.entries(entryMap)) {
      if (Buffer.isBuffer(content)) {
        zip.addFile(entryName, content);
      } else {
        zip.addFile(entryName, Buffer.from(JSON.stringify(content)));
      }
    }
    const filePath = path.join(tempDir, `${uuid()}.zip`);
    await fs.writeFile(filePath, zip.toBuffer());
    return filePath;
  };
  const driver = new CopilotAgentPublishDriver();
  const mockedDriverContext: any = {
    m365TokenProvider: new MockedM365Provider(),
    logProvider: new MockedLogProvider(),
    ui: new MockedUserInteraction(),
    projectPath: "./",
  };

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(tempDir);
  });

  it("should throw error if file not exists", async () => {
    const args: CopilotAgentPublishArgs = {
      appPackagePath: "fakepath",
    };
    const outputEnvVarNames = new Map<string, string>([
      ["titleId", "M365_PUBLISHED_TITLE_ID"],
      ["appId", "M365_PUBLISHED_APP_ID"],
    ]);

    const result = (await driver.execute(args, mockedDriverContext, outputEnvVarNames)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(AppStudioError.FileNotFoundError.name, result.error.name);
    }
  });

  it("invalid param error - empty appPackagePath", async () => {
    const args: CopilotAgentPublishArgs = {
      appPackagePath: "",
    };
    const outputEnvVarNames = new Map<string, string>([
      ["titleId", "M365_PUBLISHED_TITLE_ID"],
      ["appId", "M365_PUBLISHED_APP_ID"],
    ]);

    const result = (await driver.execute(args, mockedDriverContext, outputEnvVarNames)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.equal("InvalidActionInputError", result.error.name);
    }
  });

  it("invalid param error - invalid scope", async () => {
    const args: CopilotAgentPublishArgs = {
      appPackagePath: "fakepath",
      scope: "invalid",
    };
    const outputEnvVarNames = new Map<string, string>([
      ["titleId", "M365_PUBLISHED_TITLE_ID"],
      ["appId", "M365_PUBLISHED_APP_ID"],
    ]);

    const result = (await driver.execute(args, mockedDriverContext, outputEnvVarNames)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.equal("InvalidActionInputError", result.error.name);
    }
  });

  it("invalid param error - missing writeToEnvironmentFile", async () => {
    const args: CopilotAgentPublishArgs = {
      appPackagePath: "fakepath",
    };

    const result = (await driver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.equal("InvalidActionInputError", result.error.name);
    }
  });

  it("happy path - default scope (Personal)", async () => {
    const appPackagePath = await createPackage({
      [Constants.MANIFEST_FILE]: new TeamsAppManifest(),
      "color.png": Buffer.from(""),
      "outline.png": Buffer.from(""),
    });
    const args: CopilotAgentPublishArgs = {
      appPackagePath,
    };
    const outputEnvVarNames = new Map<string, string>([
      ["titleId", "M365_TITLE_ID"],
      ["appId", "M365_APP_ID"],
    ]);

    const titleId = uuid();
    const appId = uuid();

    vi.spyOn(PackageService.prototype, "publishAgent").mockResolvedValue([titleId, appId, ""]);

    const result = await driver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert.isTrue(result.result.isOk());
    if (result.result.isOk()) {
      chai.assert.equal(result.result.value.get("M365_TITLE_ID"), titleId);
      chai.assert.equal(result.result.value.get("M365_APP_ID"), appId);
    }
  });

  it("happy path - tenant scope", async () => {
    const appPackagePath = await createPackage({
      [Constants.MANIFEST_FILE]: new TeamsAppManifest(),
      "color.png": Buffer.from(""),
      "outline.png": Buffer.from(""),
    });
    const args: CopilotAgentPublishArgs = {
      appPackagePath,
      scope: "tenant",
    };
    const outputEnvVarNames = new Map<string, string>([
      ["titleId", "M365_PUBLISHED_TITLE_ID"],
      ["appId", "M365_PUBLISHED_APP_ID"],
    ]);

    const titleId = uuid();
    const appId = uuid();

    vi.spyOn(PackageService.prototype, "publishAgent").mockResolvedValue([titleId, appId, ""]);

    const result = await driver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert.isTrue(result.result.isOk());
    if (result.result.isOk()) {
      chai.assert.equal(result.result.value.get("M365_PUBLISHED_TITLE_ID"), titleId);
      chai.assert.equal(result.result.value.get("M365_PUBLISHED_APP_ID"), appId);
    }
  });

  it("happy path - shared scope", async () => {
    const appPackagePath = await createPackage({
      [Constants.MANIFEST_FILE]: new TeamsAppManifest(),
      "color.png": Buffer.from(""),
      "outline.png": Buffer.from(""),
    });
    const args: CopilotAgentPublishArgs = {
      appPackagePath,
      scope: "Shared",
    };
    const outputEnvVarNames = new Map<string, string>([
      ["titleId", "M365_TITLE_ID"],
      ["appId", "M365_APP_ID"],
    ]);

    const titleId = uuid();
    const appId = uuid();

    vi.spyOn(PackageService.prototype, "publishAgent").mockResolvedValue([titleId, appId, ""]);

    const result = await driver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert.isTrue(result.result.isOk());
    if (result.result.isOk()) {
      chai.assert.equal(result.result.value.get("M365_TITLE_ID"), titleId);
      chai.assert.equal(result.result.value.get("M365_APP_ID"), appId);
    }
  });

  it("should return token error when getAccessToken fails", async () => {
    const manifest = new TeamsAppManifest();
    manifest.id = uuid();
    const appPackagePath = await createPackage({
      [Constants.MANIFEST_FILE]: manifest,
    });
    const args: CopilotAgentPublishArgs = {
      appPackagePath,
    };
    const outputEnvVarNames = new Map<string, string>([
      ["titleId", "M365_TITLE_ID"],
      ["appId", "M365_APP_ID"],
    ]);

    const tokenError = new UserCancelError();
    vi.spyOn(mockedDriverContext.m365TokenProvider, "getAccessToken").mockResolvedValue(
      err(tokenError)
    );

    const result = (await driver.execute(args, mockedDriverContext, outputEnvVarNames)).result;
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(result.error, tokenError);
    }
  });

  it("should return error when publishAgent throws", async () => {
    const manifest = new TeamsAppManifest();
    manifest.id = uuid();
    const appPackagePath = await createPackage({
      [Constants.MANIFEST_FILE]: manifest,
    });
    const args: CopilotAgentPublishArgs = {
      appPackagePath,
    };
    const outputEnvVarNames = new Map<string, string>([
      ["titleId", "M365_TITLE_ID"],
      ["appId", "M365_APP_ID"],
    ]);

    vi.spyOn(PackageService.prototype, "publishAgent").mockRejectedValue(
      new Error("publish failed")
    );

    const result = (await driver.execute(args, mockedDriverContext, outputEnvVarNames)).result;
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.include(result.error.message, "publish failed");
    }
  });

  it("run method should work", async () => {
    const appPackagePath = await createPackage({
      [Constants.MANIFEST_FILE]: new TeamsAppManifest(),
    });
    const args: CopilotAgentPublishArgs = {
      appPackagePath,
    };

    const titleId = uuid();
    const appId = uuid();

    vi.spyOn(PackageService.prototype, "publishAgent").mockResolvedValue([titleId, appId, ""]);

    const result = await driver.run(args, mockedDriverContext);
    chai.assert.isTrue(result.isErr());
  });

  it("should throw error if manifest.json not found in package", async () => {
    const appPackagePath = await createPackage({
      "other.json": {},
    });
    const args: CopilotAgentPublishArgs = {
      appPackagePath,
    };
    const outputEnvVarNames = new Map<string, string>([
      ["titleId", "M365_TITLE_ID"],
      ["appId", "M365_APP_ID"],
    ]);

    const result = (await driver.execute(args, mockedDriverContext, outputEnvVarNames)).result;
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(AppStudioError.FileNotFoundError.name, result.error.name);
    }
  });

  it("should return shareLink when published with shared scope", async () => {
    const appPackagePath = await createPackage({
      [Constants.MANIFEST_FILE]: new TeamsAppManifest(),
    });
    const args: CopilotAgentPublishArgs = {
      appPackagePath,
      scope: "Shared",
    };
    const outputEnvVarNames = new Map<string, string>([
      ["titleId", "M365_TITLE_ID"],
      ["appId", "M365_APP_ID"],
      ["shareLink", "SHARE_LINK"],
    ]);

    const titleId = uuid();
    const appId = uuid();
    const shareLink = "https://fake.sharelink.com";

    vi.spyOn(PackageService.prototype, "publishAgent").mockResolvedValue([
      titleId,
      appId,
      shareLink,
    ]);

    const result = await driver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert.isTrue(result.result.isOk());
    if (result.result.isOk()) {
      chai.assert.equal(result.result.value.get("M365_TITLE_ID"), titleId);
      chai.assert.equal(result.result.value.get("M365_APP_ID"), appId);
      chai.assert.equal(result.result.value.get("SHARE_LINK"), shareLink);
    }
  });

  it("should not set shareLink when shareLinkKey is not provided", async () => {
    const appPackagePath = await createPackage({
      [Constants.MANIFEST_FILE]: new TeamsAppManifest(),
    });
    const args: CopilotAgentPublishArgs = {
      appPackagePath,
      scope: "Shared",
    };
    const outputEnvVarNames = new Map<string, string>([
      ["titleId", "M365_TITLE_ID"],
      ["appId", "M365_APP_ID"],
    ]);

    const titleId = uuid();
    const appId = uuid();
    const shareLink = "https://fake.sharelink.com";

    vi.spyOn(PackageService.prototype, "publishAgent").mockResolvedValue([
      titleId,
      appId,
      shareLink,
    ]);

    const result = await driver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert.isTrue(result.result.isOk());
    if (result.result.isOk()) {
      chai.assert.equal(result.result.value.get("M365_TITLE_ID"), titleId);
      chai.assert.equal(result.result.value.get("M365_APP_ID"), appId);
      chai.assert.isUndefined(result.result.value.get("SHARE_LINK"));
    }
  });

  it("should verify MCP certs for declarative agents with actions", async () => {
    const manifest = createManifestWithDA("declarativeAgent.json");
    const daManifest = {
      actions: [{ id: "action1", file: "plugin.json" }],
    };
    const appPackagePath = await createPackage({
      [Constants.MANIFEST_FILE]: manifest,
      "declarativeAgent.json": daManifest,
      "plugin.json": { runtimes: [] },
    });
    const args: CopilotAgentPublishArgs = {
      appPackagePath,
    };
    const outputEnvVarNames = new Map<string, string>([
      ["titleId", "M365_TITLE_ID"],
      ["appId", "M365_APP_ID"],
    ]);

    const titleId = uuid();
    const appId = uuid();

    const verifyStub = vi
      .spyOn(McpCertVerification, "verifyLocalMCPPluginCerts")
      .mockResolvedValue(true);
    vi.spyOn(PackageService.prototype, "publishAgent").mockResolvedValue([titleId, appId, ""]);

    const result = await driver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert.isTrue(result.result.isOk());
    chai.assert.isTrue(verifyStub.mock.calls.length > 0);
  });

  it("should fail when MCP cert verification fails", async () => {
    const manifest = createManifestWithDA("declarativeAgent.json");
    const daManifest = {
      actions: [{ id: "action1", file: "plugin.json" }],
    };
    const appPackagePath = await createPackage({
      [Constants.MANIFEST_FILE]: manifest,
      "declarativeAgent.json": daManifest,
      "plugin.json": { runtimes: [] },
    });
    const args: CopilotAgentPublishArgs = {
      appPackagePath,
    };
    const outputEnvVarNames = new Map<string, string>([
      ["titleId", "M365_TITLE_ID"],
      ["appId", "M365_APP_ID"],
    ]);

    vi.spyOn(McpCertVerification, "verifyLocalMCPPluginCerts").mockResolvedValue(false);

    const result = (await driver.execute(args, mockedDriverContext, outputEnvVarNames)).result;
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(AppStudioError.ValidationFailedError.name, result.error.name);
    }
  });

  it("should skip MCP verification when declarative agent file not found", async () => {
    const manifest = createManifestWithDA("nonexistent.json");
    const appPackagePath = await createPackage({
      [Constants.MANIFEST_FILE]: manifest,
    });
    const args: CopilotAgentPublishArgs = {
      appPackagePath,
    };
    const outputEnvVarNames = new Map<string, string>([
      ["titleId", "M365_TITLE_ID"],
      ["appId", "M365_APP_ID"],
    ]);

    const titleId = uuid();
    const appId = uuid();

    const verifyStub = vi.spyOn(McpCertVerification, "verifyLocalMCPPluginCerts");
    vi.spyOn(PackageService.prototype, "publishAgent").mockResolvedValue([titleId, appId, ""]);

    const result = await driver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert.isTrue(result.result.isOk());
    chai.assert.equal(verifyStub.mock.calls.length, 0);
  });

  it("should skip action file verification when action file not found", async () => {
    const manifest = createManifestWithDA("declarativeAgent.json");
    const daManifest = {
      actions: [{ id: "action1", file: "nonexistent-plugin.json" }],
    };
    const appPackagePath = await createPackage({
      [Constants.MANIFEST_FILE]: manifest,
      "declarativeAgent.json": daManifest,
    });
    const args: CopilotAgentPublishArgs = {
      appPackagePath,
    };
    const outputEnvVarNames = new Map<string, string>([
      ["titleId", "M365_TITLE_ID"],
      ["appId", "M365_APP_ID"],
    ]);

    const titleId = uuid();
    const appId = uuid();

    const verifyStub = vi.spyOn(McpCertVerification, "verifyLocalMCPPluginCerts");
    vi.spyOn(PackageService.prototype, "publishAgent").mockResolvedValue([titleId, appId, ""]);

    const result = await driver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert.isTrue(result.result.isOk());
    chai.assert.equal(verifyStub.mock.calls.length, 0);
  });

  it("should handle copilotExtensions.declarativeCopilots format", async () => {
    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [{ id: "dc1", file: "declarativeAgent.json" }],
    };
    const daManifest = {
      actions: [{ id: "action1", file: "plugin.json" }],
    };
    const appPackagePath = await createPackage({
      [Constants.MANIFEST_FILE]: manifest,
      "declarativeAgent.json": daManifest,
      "plugin.json": { runtimes: [] },
    });
    const args: CopilotAgentPublishArgs = {
      appPackagePath,
    };
    const outputEnvVarNames = new Map<string, string>([
      ["titleId", "M365_TITLE_ID"],
      ["appId", "M365_APP_ID"],
    ]);

    const titleId = uuid();
    const appId = uuid();

    vi.spyOn(McpCertVerification, "verifyLocalMCPPluginCerts").mockResolvedValue(true);
    vi.spyOn(PackageService.prototype, "publishAgent").mockResolvedValue([titleId, appId, ""]);

    const result = await driver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert.isTrue(result.result.isOk());
  });
});
