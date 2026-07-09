// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AppManifestUtils,
  Inputs,
  ok,
  Platform,
  TeamsManifest,
  UserInteraction,
} from "@microsoft/teamsfx-api";
import { assert, vi } from "vitest";
import { setTools, TOOLS } from "../../src/common/globalVars";
import { configGenerator } from "../../src/component/generator/configFiles/configGenerator";
import { generateConfigFiles } from "../../src/core/generateConfigFiles";
import { MockTools } from "./utils";

describe("generateConfigFiles", () => {
  let runStub: any;
  let readManifestStub: any;
  let showMessageStub: any;
  let mockTools: MockTools;
  const manifestPath = "appPackage/manifest.json";
  const projectPath = "/tmp/project";
  const programmingLanguage = "typescript";
  const originalTools = TOOLS;

  beforeEach(() => {
    type RunResult = Awaited<ReturnType<typeof configGenerator.run>>;
    readManifestStub = vi.spyOn(AppManifestUtils, "readTeamsManifest");
    runStub = vi.spyOn(configGenerator, "run").mockResolvedValue(ok({}) as unknown as RunResult);
    showMessageStub = vi.fn();
    mockTools = new MockTools();
    mockTools.ui = { showMessage: showMessageStub } as unknown as UserInteraction;
    setTools(mockTools);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setTools(originalTools);
  });

  const createInputs = (overrides: Record<string, unknown>): Inputs => {
    return {
      platform: Platform.CLI,
      projectPath,
      ...overrides,
    } as Inputs;
  };

  it("generates playground and local configs when bot present", async () => {
    const manifest = {
      name: { short: "MyApp" },
      bots: [{ botId: "bot-id", scopes: ["team"] }],
      staticTabs: [
        {
          entityId: "entity",
          name: "Tab",
          contentUrl: "https://example.com",
          websiteUrl: "https://example.com",
          scopes: ["team"],
        },
      ],
    } as unknown as TeamsManifest;
    readManifestStub.mockResolvedValue(manifest);

    await generateConfigFiles(
      createInputs({
        "manifest-file": manifestPath,
        "include-playground": true,
        "include-local": true,
        "include-remote": false,
        "programming-language": programmingLanguage,
      })
    );

    assert.isTrue(runStub.mock.calls.length === 1);
    const args = runStub.mock.calls[0];
    const components = args[2];
    assert.deepEqual(components, [
      { name: "playground", programmingLanguage },
      { name: "local", programmingLanguage },
    ]);
    const features = args[3];
    assert.deepInclude(features, { hasBot: true, hasTab: true });
    assert.equal(features.appName, "MyApp");
    assert.isTrue(showMessageStub.mock.calls.length === 0);
  });

  it("skips playground and warns when bot missing", async () => {
    const manifest = {
      name: { short: "NoBotApp" },
      staticTabs: [],
      bots: [],
    } as unknown as TeamsManifest;
    readManifestStub.mockResolvedValue(manifest);

    await generateConfigFiles(
      createInputs({
        "manifest-file": manifestPath,
        "include-playground": true,
        "include-local": true,
        "include-remote": false,
        "programming-language": programmingLanguage,
      })
    );

    assert.isTrue(runStub.mock.calls.length === 1);
    const components = runStub.mock.calls[0][2];
    assert.deepEqual(components, [{ name: "local", programmingLanguage }]);
    assert.isTrue(showMessageStub.mock.calls.length === 1);
    assert.equal(showMessageStub.mock.calls[0][0], "warn");
  });

  it("generates only playground when include-local is false", async () => {
    const manifest = {
      name: { short: "PlaygroundOnly" },
      bots: [{ botId: "bot-id", scopes: ["team"] }],
    } as unknown as TeamsManifest;
    readManifestStub.mockResolvedValue(manifest);

    await generateConfigFiles(
      createInputs({
        "manifest-file": manifestPath,
        "include-playground": true,
        "include-local": false,
        "include-remote": false,
        "programming-language": programmingLanguage,
      })
    );

    const components = runStub.mock.calls[0][2];
    assert.deepEqual(components, [{ name: "playground", programmingLanguage }]);
  });

  it("propagates copilot feature flag", async () => {
    const manifest = {
      name: { short: "CopilotApp" },
      bots: [{ botId: "bot-id", scopes: ["team"] }],
      copilotAgents: [{ id: "agent1" }],
    } as unknown as TeamsManifest;
    readManifestStub.mockResolvedValue(manifest);

    await generateConfigFiles(
      createInputs({
        "manifest-file": manifestPath,
        "include-playground": true,
        "include-local": false,
        "include-remote": false,
        "programming-language": programmingLanguage,
      })
    );

    const features = runStub.mock.calls[0][3] as Record<string, unknown>;
    assert.isTrue(features.hasCopilot as boolean);
  });

  it("includes remote config when include-remote is true", async () => {
    const manifest = {
      name: { short: "RemoteApp" },
      staticTabs: [],
      bots: [],
    } as unknown as TeamsManifest;
    readManifestStub.mockResolvedValue(manifest);

    await generateConfigFiles(
      createInputs({
        "manifest-file": manifestPath,
        "include-playground": false,
        "include-local": false,
        "include-remote": true,
        "programming-language": programmingLanguage,
      })
    );

    assert.isTrue(runStub.mock.calls.length === 1);
    const components = runStub.mock.calls[0][2];
    assert.deepEqual(components, [{ name: "remote", programmingLanguage }]);
  });

  it("generates all configs including remote", async () => {
    const manifest = {
      name: { short: "FullApp" },
      bots: [{ botId: "bot-id", scopes: ["team"] }],
      staticTabs: [
        {
          entityId: "entity",
          name: "Tab",
          contentUrl: "https://example.com",
          websiteUrl: "https://example.com",
          scopes: ["team"],
        },
      ],
    } as unknown as TeamsManifest;
    readManifestStub.mockResolvedValue(manifest);

    await generateConfigFiles(
      createInputs({
        "manifest-file": manifestPath,
        "include-playground": true,
        "include-local": true,
        "include-remote": true,
        "programming-language": programmingLanguage,
      })
    );

    assert.isTrue(runStub.mock.calls.length === 1);
    const components = runStub.mock.calls[0][2];
    assert.deepEqual(components, [
      { name: "playground", programmingLanguage },
      { name: "local", programmingLanguage },
      { name: "remote", programmingLanguage },
    ]);
  });

  it("excludes remote config when include-remote is false", async () => {
    const manifest = {
      name: { short: "LocalOnlyApp" },
      bots: [{ botId: "bot-id", scopes: ["team"] }],
    } as unknown as TeamsManifest;
    readManifestStub.mockResolvedValue(manifest);

    await generateConfigFiles(
      createInputs({
        "manifest-file": manifestPath,
        "include-playground": true,
        "include-local": true,
        "include-remote": false,
        "programming-language": programmingLanguage,
      })
    );

    const components = runStub.mock.calls[0][2];
    assert.deepEqual(components, [
      { name: "playground", programmingLanguage },
      { name: "local", programmingLanguage },
    ]);
    assert.isFalse(components.map((c: any) => c.name).includes("remote"));
  });
});
