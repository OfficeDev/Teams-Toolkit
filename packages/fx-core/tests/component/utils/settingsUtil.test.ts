// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { assert } from "chai";
import * as fs from "fs-extra";
import mockedEnv, { RestoreFn } from "mocked-env";
import os from "os";
import path from "path";
import { createSandbox, SinonSandbox } from "sinon";
import { featureFlagManager, FeatureFlags } from "../../../src/common/featureFlags";
import { globalVars } from "../../../src/common/globalVars";
import * as telemetryModule from "../../../src/common/telemetry";
import * as pathUtils from "../../../src/component/utils/pathUtils";
import { settingsUtil } from "../../../src/component/utils/settingsUtil";

describe("SettingsUtils", () => {
  let sandbox: SinonSandbox;
  let tempDir: string;
  let envRestore: RestoreFn;

  beforeEach(async () => {
    sandbox = createSandbox();
    tempDir = path.join(process.cwd(), ".tmp-settings-tests", `test-settings-${Date.now()}`);
    await fs.ensureDir(tempDir);
    envRestore = mockedEnv({});
  });

  afterEach(async () => {
    sandbox.restore();
    envRestore();
    await fs.remove(tempDir);
  });

  describe("readSettings", () => {
    describe("when GenerateConfigFiles is false (default)", () => {
      beforeEach(() => {
        sandbox
          .stub(featureFlagManager, "getBooleanValue")
          .withArgs(FeatureFlags.GenerateConfigFiles)
          .returns(false);
      });

      it("should use getYmlFilePath when GenerateConfigFiles is false", async () => {
        const projectPath = tempDir;
        const ymlPath = path.join(projectPath, "m365agents.dev.yml");
        await fs.writeFile(ymlPath, "projectId: test-id\nversion: 1.0");

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub().returns(ymlPath),
          getAvailableYmlFilePath: sandbox.stub(),
        });

        const result = await settingsUtil.readSettings(projectPath, false);

        assert.isTrue(result.isOk());
        if (result.isOk()) {
          const settings = result.value;
          assert.equal(settings.trackingId, "test-id");
        }
      });

      it("should return error when yaml file not found", async () => {
        const projectPath = tempDir;
        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub().returns(undefined),
          getAvailableYmlFilePath: sandbox.stub(),
        });

        const result = await settingsUtil.readSettings(projectPath, false);

        assert.isTrue(result.isErr());
      });

      it("should add projectId if ensureTrackingId is true and projectId missing", async () => {
        const projectPath = tempDir;
        const ymlPath = path.join(projectPath, "m365agents.dev.yml");
        await fs.writeFile(ymlPath, "version: 1.0");

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub().returns(ymlPath),
          getAvailableYmlFilePath: sandbox.stub(),
        });
        sandbox.stub(telemetryModule, "sendTelemetryEvent").resolves();

        const result = await settingsUtil.readSettings(projectPath, true);

        assert.isTrue(result.isOk());
        const fileContent = await fs.readFile(ymlPath, "utf8");
        assert.isTrue(fileContent.includes("projectId"));
      });

      it("should skip writing projectId when yaml file is in temp directory", async () => {
        const projectPath = path.join(os.tmpdir(), `test-settings-read-${Date.now()}`);
        const ymlPath = path.join(projectPath, "m365agents.dev.yml");
        await fs.ensureDir(projectPath);
        await fs.writeFile(ymlPath, "version: 1.0");

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub().returns(ymlPath),
          getAvailableYmlFilePath: sandbox.stub(),
        });
        sandbox.stub(telemetryModule, "sendTelemetryEvent").resolves();

        const result = await settingsUtil.readSettings(projectPath, true);

        assert.isTrue(result.isOk());
        const fileContent = await fs.readFile(ymlPath, "utf8");
        assert.isFalse(fileContent.includes("projectId"));
      });

      it("should not add projectId if ensureTrackingId is false", async () => {
        const projectPath = tempDir;
        const ymlPath = path.join(projectPath, "m365agents.dev.yml");
        await fs.writeFile(ymlPath, "version: 1.0");

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub().returns(ymlPath),
          getAvailableYmlFilePath: sandbox.stub(),
        });

        const result = await settingsUtil.readSettings(projectPath, false);

        assert.isTrue(result.isOk());
        const fileContent = await fs.readFile(ymlPath, "utf8");
        assert.isFalse(fileContent.includes("projectId"));
      });

      it("should set globalVars.trackingId", async () => {
        const projectPath = tempDir;
        const testId = "test-tracking-id";
        const ymlPath = path.join(projectPath, "m365agents.dev.yml");
        await fs.writeFile(ymlPath, `projectId: ${testId}\nversion: 1.0`);

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub().returns(ymlPath),
          getAvailableYmlFilePath: sandbox.stub(),
        });

        await settingsUtil.readSettings(projectPath, false);

        assert.equal(globalVars.trackingId, testId);
      });
    });

    describe("when GenerateConfigFiles is true", () => {
      beforeEach(() => {
        sandbox
          .stub(featureFlagManager, "getBooleanValue")
          .withArgs(FeatureFlags.GenerateConfigFiles)
          .returns(true);
      });

      it("should use getAvailableYmlFilePath when GenerateConfigFiles is true", async () => {
        const projectPath = tempDir;
        const ymlPath = path.join(projectPath, "m365agents.local.yml");
        await fs.writeFile(ymlPath, "projectId: test-id\nversion: 1.0");

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub(),
          getAvailableYmlFilePath: sandbox.stub().returns(ymlPath),
        });

        const result = await settingsUtil.readSettings(projectPath, false);

        assert.isTrue(result.isOk());
        if (result.isOk()) {
          const settings = result.value;
          assert.equal(settings.trackingId, "test-id");
        }
      });

      it("should return error when getAvailableYmlFilePath returns undefined", async () => {
        const projectPath = tempDir;

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub(),
          getAvailableYmlFilePath: sandbox.stub().returns(undefined),
        });

        const result = await settingsUtil.readSettings(projectPath, false);

        assert.isTrue(result.isErr());
      });

      it("should add projectId using available yml file when ensureTrackingId is true", async () => {
        const projectPath = tempDir;
        const ymlPath = path.join(projectPath, "m365agents.playground.yml");
        await fs.writeFile(ymlPath, "version: 1.0");

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub().returns(ymlPath),
          getAvailableYmlFilePath: sandbox.stub().returns(ymlPath),
        });
        sandbox.stub(telemetryModule, "sendTelemetryEvent").resolves();

        const result = await settingsUtil.readSettings(projectPath, true);

        assert.isTrue(result.isOk());
        const fileContent = await fs.readFile(ymlPath, "utf8");
        assert.isTrue(fileContent.includes("projectId"));
      });

      it("should read from available yaml file and return settings", async () => {
        const projectPath = tempDir;
        const ymlPath = path.join(projectPath, "m365agents.local.yml");
        const testId = "available-file-id";
        const version = "2.0";
        await fs.writeFile(ymlPath, `projectId: ${testId}\nversion: ${version}`);

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub(),
          getAvailableYmlFilePath: sandbox.stub().returns(ymlPath),
        });

        const result = await settingsUtil.readSettings(projectPath, false);

        assert.isTrue(result.isOk());
        if (result.isOk()) {
          const settings = result.value;
          assert.equal(settings.trackingId, testId);
          assert.equal(settings.version, version);
        }
      });

      it("should set globalVars.trackingId from available yaml file", async () => {
        const projectPath = tempDir;
        const ymlPath = path.join(projectPath, "m365agents.playground.yml");
        const testId = "available-tracking-id";
        await fs.writeFile(ymlPath, `projectId: ${testId}\nversion: 1.0`);

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub(),
          getAvailableYmlFilePath: sandbox.stub().returns(ymlPath),
        });

        await settingsUtil.readSettings(projectPath, false);

        assert.equal(globalVars.trackingId, testId);
      });
    });
  });

  describe("writeSettings", () => {
    describe("when GenerateConfigFiles is false (default)", () => {
      beforeEach(() => {
        sandbox
          .stub(featureFlagManager, "getBooleanValue")
          .withArgs(FeatureFlags.GenerateConfigFiles)
          .returns(false);
      });

      it("should use getYmlFilePath when GenerateConfigFiles is false", async () => {
        const projectPath = tempDir;
        const ymlPath = path.join(projectPath, "m365agents.dev.yml");
        await fs.writeFile(ymlPath, "projectId: old-id\nversion: 1.0");

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub().returns(ymlPath),
          getAvailableYmlFilePath: sandbox.stub(),
        });

        const result = await settingsUtil.writeSettings(projectPath, {
          trackingId: "new-id",
          version: "1.0",
        });

        assert.isTrue(result.isOk());
        const fileContent = await fs.readFile(ymlPath, "utf8");
        assert.isTrue(fileContent.includes("new-id"));
      });

      it("should return error when yaml file not found", async () => {
        const projectPath = tempDir;

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub().returns(undefined),
          getAvailableYmlFilePath: sandbox.stub(),
        });

        const result = await settingsUtil.writeSettings(projectPath, {
          trackingId: "test-id",
          version: "1.0",
        });

        assert.isTrue(result.isErr());
      });

      it("should update projectId in yaml file", async () => {
        const projectPath = tempDir;
        const ymlPath = path.join(projectPath, "m365agents.dev.yml");
        const oldId = "old-tracking-id";
        const newId = "new-tracking-id";
        await fs.writeFile(ymlPath, `projectId: ${oldId}\nversion: 1.0`);

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub().returns(ymlPath),
          getAvailableYmlFilePath: sandbox.stub(),
        });

        await settingsUtil.writeSettings(projectPath, {
          trackingId: newId,
          version: "1.0",
        });

        const fileContent = await fs.readFile(ymlPath, "utf8");
        assert.isTrue(fileContent.includes(newId));
        assert.isFalse(fileContent.includes(oldId));
      });

      it("should skip updating projectId when yaml file is in temp directory", async () => {
        const projectPath = path.join(os.tmpdir(), `test-settings-write-${Date.now()}`);
        const ymlPath = path.join(projectPath, "m365agents.dev.yml");
        const oldId = "old-temp-id";
        const newId = "new-temp-id";
        await fs.ensureDir(projectPath);
        await fs.writeFile(ymlPath, `projectId: ${oldId}\nversion: 1.0`);

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub().returns(ymlPath),
          getAvailableYmlFilePath: sandbox.stub(),
        });

        const result = await settingsUtil.writeSettings(projectPath, {
          trackingId: newId,
          version: "1.0",
        });

        assert.isTrue(result.isOk());
        const fileContent = await fs.readFile(ymlPath, "utf8");
        assert.isTrue(fileContent.includes(oldId));
        assert.isFalse(fileContent.includes(newId));
      });
    });

    describe("when GenerateConfigFiles is true", () => {
      beforeEach(() => {
        sandbox
          .stub(featureFlagManager, "getBooleanValue")
          .withArgs(FeatureFlags.GenerateConfigFiles)
          .returns(true);
      });

      it("should use getAvailableYmlFilePath when GenerateConfigFiles is true", async () => {
        const projectPath = tempDir;
        const ymlPath = path.join(projectPath, "m365agents.local.yml");
        await fs.writeFile(ymlPath, "projectId: old-id\nversion: 1.0");

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub(),
          getAvailableYmlFilePath: sandbox.stub().returns(ymlPath),
        });

        const result = await settingsUtil.writeSettings(projectPath, {
          trackingId: "new-id",
          version: "1.0",
        });

        assert.isTrue(result.isOk());
        const fileContent = await fs.readFile(ymlPath, "utf8");
        assert.isTrue(fileContent.includes("new-id"));
      });

      it("should return error when getAvailableYmlFilePath returns undefined", async () => {
        const projectPath = tempDir;

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub(),
          getAvailableYmlFilePath: sandbox.stub().returns(undefined),
        });

        const result = await settingsUtil.writeSettings(projectPath, {
          trackingId: "test-id",
          version: "1.0",
        });

        assert.isTrue(result.isErr());
      });

      it("should update projectId in available yaml file", async () => {
        const projectPath = tempDir;
        const ymlPath = path.join(projectPath, "m365agents.playground.yml");
        const oldId = "old-available-id";
        const newId = "new-available-id";
        await fs.writeFile(ymlPath, `projectId: ${oldId}\nversion: 2.0`);

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub(),
          getAvailableYmlFilePath: sandbox.stub().returns(ymlPath),
        });

        await settingsUtil.writeSettings(projectPath, {
          trackingId: newId,
          version: "2.0",
        });

        const fileContent = await fs.readFile(ymlPath, "utf8");
        assert.isTrue(fileContent.includes(newId));
        assert.isFalse(fileContent.includes(oldId));
      });

      it("should return the correct yaml path after write", async () => {
        const projectPath = tempDir;
        const ymlPath = path.join(projectPath, "m365agents.local.yml");
        await fs.writeFile(ymlPath, "projectId: test-id\nversion: 1.0");

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub(),
          getAvailableYmlFilePath: sandbox.stub().returns(ymlPath),
        });

        const result = await settingsUtil.writeSettings(projectPath, {
          trackingId: "updated-id",
          version: "1.0",
        });

        assert.isTrue(result.isOk());
        if (result.isOk()) {
          assert.equal(result.value, ymlPath);
        }
      });

      it("should preserve other yaml content when updating projectId", async () => {
        const projectPath = tempDir;
        const ymlPath = path.join(projectPath, "m365agents.local.yml");
        const originalContent = `projectId: old-id
version: 1.5
appName: TestApp
description: Test Description`;
        await fs.writeFile(ymlPath, originalContent);

        sandbox.stub(pathUtils, "pathUtils").value({
          getYmlFilePath: sandbox.stub(),
          getAvailableYmlFilePath: sandbox.stub().returns(ymlPath),
        });

        await settingsUtil.writeSettings(projectPath, {
          trackingId: "new-id",
          version: "1.5",
        });

        const fileContent = await fs.readFile(ymlPath, "utf8");
        assert.isTrue(fileContent.includes("appName: TestApp"));
        assert.isTrue(fileContent.includes("description: Test Description"));
        assert.isTrue(fileContent.includes("new-id"));
      });
    });
  });
});
