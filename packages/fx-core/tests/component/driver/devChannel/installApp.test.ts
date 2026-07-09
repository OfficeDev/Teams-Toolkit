// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios from "axios";
import mockedEnv from "mocked-env";
import fs from "fs-extra";
import path from "path";
import AdmZip from "adm-zip";
import { TeamsAppManifest } from "@microsoft/teamsfx-api";
import { InstallAppToChannelDriver } from "../../../../src/component/driver/devChannel/installApp";
import { GraphClient } from "../../../../src/client/graphClient";
import { MockedM365Provider, MockLogProvider } from "../../../core/utils";
import { WrapDriverContext } from "../../../../src/component/driver/util/wrapUtil";
import {
  InvalidActionInputError,
  FileNotFoundError,
  HttpClientError,
} from "../../../../src/error/common";
import { Constants } from "./../../../../src/component/driver/teamsApp/constants";
import { InstallAppArgs } from "../../../../build/component/driver/devChannel/interfaces/InstallAppArgs";
import { chai, vi } from "vitest";

describe("InstallAppToChannelDriver", () => {
  const sandbox = vi;
  const mockTokenProvider = new MockedM365Provider();
  const mockContext: WrapDriverContext = {
    m365TokenProvider: mockTokenProvider,
    logProvider: new MockLogProvider(),
    addSummary: vi.fn(),
    summaries: [],
    projectPath: "fake/project/path",
    addTelemetryProperties: vi.fn(),
  } as unknown as WrapDriverContext;

  const driver = new InstallAppToChannelDriver();

  const manifest = new TeamsAppManifest();
  manifest.id = "fake-id";
  const zip = new AdmZip();
  zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(manifest)));
  zip.addFile("color.png", Buffer.from(""));
  zip.addFile("outlie.png", Buffer.from(""));

  const archivedFile = zip.toBuffer();

  beforeEach(() => {});

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return error if teamId or channelId is missing", async () => {
    const args = {} as any;
    const outputEnvVarNames = new Map<string, string>();

    const result = await driver.install(args, mockContext, outputEnvVarNames);

    chai.expect(result.isErr()).to.be.true;
    if (result.isErr()) {
      chai.expect(result.error).to.be.instanceOf(InvalidActionInputError);
      chai.expect(result.error.message).to.include("teamId");
      chai.expect(result.error.message).to.include("channelId");
    }
  });

  it("should return error if app package file does not exist", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);

    const args = {
      appPackagePath: "fake/path/app.zip",
      teamId: "fake-team-id",
      channelId: "fake-channel-id",
    };
    const outputEnvVarNames = new Map<string, string>();

    const result = await driver.install(args, mockContext, outputEnvVarNames);

    chai.expect(result.isErr()).to.be.true;
    if (result.isErr()) {
      chai.expect(result.error).to.be.instanceOf(FileNotFoundError);
    }
  });

  it("should return error if manifest does not exist", async () => {
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      const emptyFile = new AdmZip().toBuffer();
      return emptyFile;
    });
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);

    const args = {
      appPackagePath: "fake/path/app.zip",
      teamId: "fake-team-id",
      channelId: "fake-channel-id",
    };
    const outputEnvVarNames = new Map<string, string>();

    const result = await driver.install(args, mockContext, outputEnvVarNames);

    chai.expect(result.isErr()).to.be.true;
    if (result.isErr()) {
      chai.expect(result.error).to.be.instanceOf(FileNotFoundError);
    }
  });

  it("should install app to channel successfully", async () => {
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      return archivedFile;
    });
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(GraphClient.prototype, "InstallAppToChannelAsync").mockResolvedValue();
    vi.spyOn(GraphClient.prototype, "GetAppInstallationForTeam").mockResolvedValue([]);

    const args: InstallAppArgs = {
      appPackagePath: "fake/path/app.zip",
      teamId: "fake-team-id",
      channelId: "fake-channel-id",
    };
    const outputEnvVarNames = new Map<string, string>();

    const result = await driver.install(args, mockContext, outputEnvVarNames);

    chai.expect(result.isOk()).to.be.true;
    if (result.isOk()) {
      chai.expect(result.value.size).to.equal(0);
    }
  });

  it("should handle axios error during app installation", async () => {
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      return archivedFile;
    });
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);

    const axiosError = {
      response: {
        data: { error: "installation failed" },
      },
      isAxiosError: true,
    };
    vi.spyOn(GraphClient.prototype, "InstallAppToChannelAsync").mockImplementation(() => {
      throw axiosError;
    });
    vi.spyOn(GraphClient.prototype, "GetAppInstallationForTeam").mockResolvedValue([]);
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);

    const args: InstallAppArgs = {
      appPackagePath: "fake/path/app.zip",
      teamId: "fake-team-id",
      channelId: "fake-channel-id",
    };
    const outputEnvVarNames = new Map<string, string>();

    const result = await driver.install(args, mockContext, outputEnvVarNames);

    chai.expect(result.isErr()).to.be.true;
    if (result.isErr()) {
      chai.expect(result.error).to.be.instanceOf(HttpClientError);
      chai.expect(result.error.message).to.include("installation failed");
    }
  });

  it("should handle App installed outside sandbox error during app installation", async () => {
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      return archivedFile;
    });
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);

    const axiosError = {
      response: {
        data: {
          error:
            "Failed to execute TeamsGraphService backend request GetSandboxingConfigurationRequest",
        },
        status: 404,
      },
      isAxiosError: true,
    };
    vi.spyOn(GraphClient.prototype, "InstallAppToChannelAsync").mockImplementation(() => {
      throw axiosError;
    });
    vi.spyOn(GraphClient.prototype, "GetAppInstallationForTeam").mockResolvedValue([]);
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);

    const args: InstallAppArgs = {
      appPackagePath: "fake/path/app.zip",
      teamId: "fake-team-id",
      channelId: "fake-channel-id",
    };
    const outputEnvVarNames = new Map<string, string>();

    const result = await driver.install(args, mockContext, outputEnvVarNames);

    chai.expect(result.isErr()).to.be.true;
    if (result.isErr()) {
      chai.expect(result.error.message).to.include("Unable to install app outside sandboxed Team");
    }
  });

  it("should handle general error during app installation", async () => {
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      return archivedFile;
    });
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);

    const generalError = new Error("general error");
    vi.spyOn(GraphClient.prototype, "InstallAppToChannelAsync").mockImplementation(() => {
      throw generalError;
    });
    vi.spyOn(GraphClient.prototype, "GetAppInstallationForTeam").mockResolvedValue([]);
    vi.spyOn(axios, "isAxiosError").mockReturnValue(false);

    const args: InstallAppArgs = {
      appPackagePath: "fake/path/app.zip",
      teamId: "fake-team-id",
      channelId: "fake-channel-id",
    };
    const outputEnvVarNames = new Map<string, string>();

    const result = await driver.install(args, mockContext, outputEnvVarNames);

    chai.expect(result.isErr()).to.be.true;
    if (result.isErr()) {
      chai.expect(result.error.message).to.equal("general error");
    }
  });

  it("should delete existing installed app", async () => {
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      return archivedFile;
    });
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);

    vi.spyOn(GraphClient.prototype, "InstallAppToChannelAsync").mockResolvedValue();
    const deleteStub = vi.spyOn(GraphClient.prototype, "DeleteInstalledApp").mockResolvedValue();
    vi.spyOn(GraphClient.prototype, "GetAppInstallationForTeam").mockResolvedValue([
      {
        id: "installation-id",
        teamsApp: {
          externalId: "fake-id",
          id: "fake-id",
          displayName: "test-app",
          distributionMethod: "sideloaded",
        },
      },
    ]);

    const args: InstallAppArgs = {
      appPackagePath: "fake/path/app.zip",
      teamId: "fake-team-id",
      channelId: "fake-channel-id",
    };
    const outputEnvVarNames = new Map<string, string>();

    const result = await driver.execute(args, mockContext, outputEnvVarNames);

    chai.expect(result.result.isOk()).to.be.true;
    chai.expect(deleteStub.mock.calls.length === 1).to.be.true;
  });
});
