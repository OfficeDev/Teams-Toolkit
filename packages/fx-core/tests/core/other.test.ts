// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import mockedEnv from "mocked-env";
import os from "os";
import * as path from "path";
import { assert, vi } from "vitest";
import { isFeatureFlagEnabled } from "../../src/common/featureFlags";
import {
  isValidOfficeAddInProject,
  isValidProject,
  isValidProjectV3,
} from "../../src/common/projectSettingsHelper";
import * as localProcess from "../../src/component/local/process";
import { TaskDefinition } from "../../src/component/local/taskDefinition";
import { cpUtils } from "../../src/component/utils/depsChecker/cpUtils";
import { randomAppName } from "./utils";

describe("Other test case", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("isFeatureFlagEnabled: return true when related environment variable is set to 1 or true", () => {
    const featureFlagName = "FEATURE_FLAG_UNIT_TEST";

    let restore = mockedEnv({
      [featureFlagName]: "1",
    });
    assert.isTrue(isFeatureFlagEnabled(featureFlagName));
    assert.isTrue(isFeatureFlagEnabled(featureFlagName, false)); // default value should be override
    restore();

    restore = mockedEnv({
      [featureFlagName]: "true",
    });
    assert.isTrue(isFeatureFlagEnabled(featureFlagName));
    restore();

    restore = mockedEnv({
      [featureFlagName]: "TruE", // should allow some characters be upper case
    });
    assert.isTrue(isFeatureFlagEnabled(featureFlagName));
    restore();
  });

  it("isFeatureFlagEnabled: return default value when related environment variable is not set", () => {
    const featureFlagName = "FEATURE_FLAG_UNIT_TEST";

    const restore = mockedEnv({
      [featureFlagName]: undefined, // delete it from process.env
    });
    assert.isFalse(isFeatureFlagEnabled(featureFlagName));
    assert.isFalse(isFeatureFlagEnabled(featureFlagName, false));
    assert.isTrue(isFeatureFlagEnabled(featureFlagName, true));
    restore();
  });

  it("isFeatureFlagEnabled: return false when related environment variable is set to non 1 or true value", () => {
    const featureFlagName = "FEATURE_FLAG_UNIT_TEST";

    let restore = mockedEnv({
      [featureFlagName]: "one",
    });
    assert.isFalse(isFeatureFlagEnabled(featureFlagName));
    assert.isFalse(isFeatureFlagEnabled(featureFlagName, true)); // default value should be override
    restore();

    restore = mockedEnv({
      [featureFlagName]: "",
    });
    assert.isFalse(isFeatureFlagEnabled(featureFlagName));
    restore();
  });

  it("executeCommand", async () => {
    assert.isTrue(!!cpUtils.executeCommand);
    assert.isTrue(!!cpUtils.tryExecuteCommand);
    assert.isTrue(!!localProcess.execShell);
    assert.isTrue(!!localProcess.execPowerShell);
  });
  it("TaskDefinition", async () => {
    const appName = randomAppName();
    const projectPath = path.resolve(os.tmpdir(), appName);
    {
      const res = TaskDefinition.frontendStart(projectPath);
      assert.isTrue(res !== undefined);
    }
    {
      const res = TaskDefinition.backendStart(projectPath, "javascript", "echo", true);
      assert.isTrue(res !== undefined);
    }
    {
      const res = TaskDefinition.backendWatch(projectPath);
      assert.isTrue(res !== undefined);
    }
    {
      const res = TaskDefinition.authStart(projectPath, "");
      assert.isTrue(res !== undefined);
    }
    {
      const res = TaskDefinition.botStart(projectPath, "javascript", true);
      assert.isTrue(res !== undefined);
    }
    {
      const res = TaskDefinition.ngrokStart(projectPath, true, []);
      assert.isTrue(res !== undefined);
    }
    {
      const res = TaskDefinition.frontendInstall(projectPath);
      assert.isTrue(res !== undefined);
    }
    {
      const res = TaskDefinition.backendInstall(projectPath);
      assert.isTrue(res !== undefined);
    }
    {
      const res = TaskDefinition.backendExtensionsInstall(projectPath, "");
      assert.isTrue(res !== undefined);
    }
    {
      const res = TaskDefinition.botInstall(projectPath);
      assert.isTrue(res !== undefined);
    }
    {
      const res = TaskDefinition.spfxInstall(projectPath);
      assert.isTrue(res !== undefined);
    }
    {
      const res = TaskDefinition.gulpCert(projectPath);
      assert.isTrue(res !== undefined);
    }
    {
      const res = TaskDefinition.gulpServe(projectPath);
      assert.isTrue(res !== undefined);
    }
  });
  it("isValidProject: true", async () => {
    vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
    const isValid = isValidProject("aaa");
    assert.isTrue(isValid);
  });
  it("isValidProject v3: true", async () => {
    const mockedEnvRestore = mockedEnv({
      TEAMSFX_V3: "true",
    });
    try {
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      const isValid = isValidProject("aaa");
      assert.isTrue(isValid);
    } finally {
      mockedEnvRestore();
    }
  });
  it("isValidProject v3: false case 1", async () => {
    const mockedEnvRestore = mockedEnv({
      TEAMSFX_V3: "true",
    });
    try {
      const settings: any = {
        version: "1.0.0",
      };
      vi.spyOn(fs, "readJsonSync").mockReturnValue(settings);
      const isValid = isValidProject("aaa");
      assert.isFalse(isValid);
    } finally {
      mockedEnvRestore();
    }
  });
  it("isValidProject v3: false case 2", async () => {
    const mockedEnvRestore = mockedEnv({
      TEAMSFX_V3: "true",
    });
    try {
      const settings: any = {
        projectId: "123",
      };
      vi.spyOn(fs, "readJsonSync").mockReturnValue(settings);
      const isValid = isValidProject("aaa");
      assert.isFalse(isValid);
    } finally {
      mockedEnvRestore();
    }
  });
  it("projectSettingsHelper - isValidProjectV3 - should return true when yaml exists", () => {
    vi.spyOn(fs, "pathExistsSync").mockImplementation((filePath: fs.PathLike) => {
      return filePath.toString().endsWith("m365agents.yml");
    });
    assert.equal(isValidProjectV3("test"), true);
  });
  it("projectSettingsHelper - isValidOfficeAddInProject - metaos add-in", () => {
    vi.spyOn(fs, "readdirSync").mockReturnValue(["manifest.json", "manifest.xml"] as any);
    assert.equal(isValidOfficeAddInProject("test"), false);
  });
});
