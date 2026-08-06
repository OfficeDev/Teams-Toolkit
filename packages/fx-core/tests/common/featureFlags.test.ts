// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import mockedEnv, { RestoreFn } from "mocked-env";

import { FeatureFlags, featureFlagManager } from "../../src/common/featureFlags";
import { chai } from "vitest";

describe("FeatureFlagManager", () => {
  let mockedEnvRestore: RestoreFn = () => {};
  afterEach(() => {
    mockedEnvRestore();
  });
  it("getBooleanValue, getStringValue is true", async () => {
    mockedEnvRestore = mockedEnv({ TEAMSFX_CLI_DOTNET: "true" });
    const booleanRes = featureFlagManager.getBooleanValue(FeatureFlags.CLIDotNet);
    chai.assert.isTrue(booleanRes);
    const stringRes = featureFlagManager.getStringValue(FeatureFlags.CLIDotNet);
    chai.assert.equal(stringRes, "true");
  });
  it("setBooleanValue", async () => {
    mockedEnvRestore = mockedEnv({ TEAMSFX_CLI_DOTNET: "false" });
    featureFlagManager.setBooleanValue(FeatureFlags.CLIDotNet, true);
    const booleanRes = featureFlagManager.getBooleanValue(FeatureFlags.CLIDotNet);
    chai.assert.isTrue(booleanRes);
  });
  it("getBooleanValue, getStringValue is false", async () => {
    mockedEnvRestore = mockedEnv({ TEAMSFX_CLI_DOTNET: "false" });
    const booleanRes = featureFlagManager.getBooleanValue(FeatureFlags.CLIDotNet);
    chai.assert.isFalse(booleanRes);
    const stringRes = featureFlagManager.getStringValue(FeatureFlags.CLIDotNet);
    chai.assert.equal(stringRes, "false");
  });
  it("MCPForDADCR defaults to true", async () => {
    mockedEnvRestore = mockedEnv({ [FeatureFlags.MCPForDADCR.name]: undefined });
    const booleanRes = featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADCR);
    chai.assert.isTrue(booleanRes);
    const stringRes = featureFlagManager.getStringValue(FeatureFlags.MCPForDADCR);
    chai.assert.equal(stringRes, "true");
  });
  it("MCPForDADT defaults to true", async () => {
    mockedEnvRestore = mockedEnv({ [FeatureFlags.MCPForDADT.name]: undefined });
    const booleanRes = featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADT);
    chai.assert.isTrue(booleanRes);
    const stringRes = featureFlagManager.getStringValue(FeatureFlags.MCPForDADT);
    chai.assert.equal(stringRes, "true");
  });
  it("MCPForDADCR can be disabled by environment variable", async () => {
    mockedEnvRestore = mockedEnv({ TEAMSFX_MCP_FOR_DA_DCR: "false" });
    const booleanRes = featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADCR);
    chai.assert.isFalse(booleanRes);
    const stringRes = featureFlagManager.getStringValue(FeatureFlags.MCPForDADCR);
    chai.assert.equal(stringRes, "false");
  });
  it("V4Enabled defaults to false", async () => {
    mockedEnvRestore = mockedEnv({ [FeatureFlags.V4Enabled.name]: undefined });
    const booleanRes = featureFlagManager.getBooleanValue(FeatureFlags.V4Enabled);
    chai.assert.isFalse(booleanRes);
    const stringRes = featureFlagManager.getStringValue(FeatureFlags.V4Enabled);
    chai.assert.equal(stringRes, "false");
  });
  it("list", async () => {
    const list = featureFlagManager.list();
    chai.assert.deepEqual(list, Object.values(FeatureFlags));
  });
  it("listEnabled", async () => {
    mockedEnvRestore = mockedEnv({ TEAMSFX_CLI_DOTNET: "true", SME_OAUTH: "true" });
    const list = featureFlagManager.listEnabled();
    chai.assert.include(list, "TEAMSFX_CLI_DOTNET");
    chai.assert.include(list, "SME_OAUTH");
    chai.assert.include(list, FeatureFlags.MCPForDADT.name);
    chai.assert.include(list, FeatureFlags.MCPForDADCR.name);
  });
});
