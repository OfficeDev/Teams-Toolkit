// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Inputs, Platform, SystemError, TeamsAppManifest, err, ok } from "@microsoft/teamsfx-api";
import * as os from "os";
import * as path from "path";
import { assert, vi } from "vitest";
import { FxCore } from "../../../src";
import { FeatureFlags, featureFlagManager } from "../../../src/common/featureFlags";
import { setTools } from "../../../src/common/globalVars";
import { copilotGptManifestUtils } from "../../../src/component/driver/teamsApp/utils/CopilotGptManifestUtils";
import { manifestUtils } from "../../../src/component/driver/teamsApp/utils/ManifestUtils";
import { scaffoldDeclarativeFromV4Channel } from "../../../src/component/generator/v4TemplateBridge";
import { fxCoreDeclarativeAgentDeps } from "../../../src/core/FxCore.declarativeAgent";
import { QuestionNames } from "../../../src/question";
import { ActionStartOptions } from "../../../src/question/constants";
import { addPluginQuestionNode } from "../../../src/question/other";
import { MockTools } from "../../core/utils";

// The entry imports the channel scaffold as a binding, so the module has to be mocked to drive
// the warnings it hands back on the generator context.
vi.mock("../../../src/component/generator/v4TemplateBridge", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/component/generator/v4TemplateBridge")>();
  return { ...actual, scaffoldDeclarativeFromV4Channel: vi.fn() };
});

/**
 * T3 scenario tier: the real MCP add-action entry and its legacy question adapter.
 *
 * Spec: docs/03-specs/scenarios/da/add-mcp-server.md (SCN-ADD-MCP-11..12)
 */

describe("SCN-DA-ADD-MCP-ACTION-TO-DA (v4 entry, T3)", () => {
  const tools = new MockTools();

  beforeEach(() => {
    setTools(tools);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("SCN-ADD-MCP-11: MCP + DT + v4 dispatches through the modify front door", async () => {
    const projectPath = path.join(os.tmpdir(), "scenario-add-mcp-entry");
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath,
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      [QuestionNames.MCPForDAAuthType]: "none",
      ignoreLockByUT: true,
    };
    const manifest = new TeamsAppManifest();
    manifest.name = {
      short: "My MCP App${{APP_NAME_SUFFIX}}",
      full: "My MCP App",
    };
    manifest.copilotExtensions = {
      declarativeCopilots: [{ file: "declarativeAgent.json", id: "declarativeAgent" }],
    };

    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) => {
      return flag === FeatureFlags.V4Enabled || flag === FeatureFlags.MCPForDADT;
    });
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    const legacyManifestPathStub = vi
      .spyOn(copilotGptManifestUtils, "getManifestPath")
      .mockResolvedValue(
        err(
          new SystemError({
            source: "Test",
            name: "LegacyPathReached",
            message: "The legacy add-action path should not run.",
          })
        )
      );
    const scaffoldStub = vi
      .spyOn(fxCoreDeclarativeAgentDeps, "scaffoldAddMcpServerFromV4")
      .mockResolvedValue(ok(undefined));
    const modifyFrontDoorStub = vi
      .spyOn(fxCoreDeclarativeAgentDeps, "modifyProjectFrontDoor")
      .mockImplementation(async (frontDoorInputs, selectorPrefill, entryParams, dependencies) => {
        return dependencies.scaffoldV4(
          frontDoorInputs,
          {
            templateId: "add-mcp-server",
            engine: "v4",
            answers: selectorPrefill,
          },
          entryParams
        );
      });

    const result = await new FxCore(tools).addPlugin(inputs);

    assert.isTrue(result.isOk());
    assert.equal(modifyFrontDoorStub.mock.calls.length, 1);
    assert.strictEqual(modifyFrontDoorStub.mock.calls[0][0], inputs);
    assert.deepEqual(modifyFrontDoorStub.mock.calls[0][1], {
      addCapability: "add-action",
      actionSource: "mcp",
    });
    assert.deepEqual(modifyFrontDoorStub.mock.calls[0][2], {
      mcpServerUrl: "https://example.com/mcp",
      teamsManifestPath: "appPackage/manifest.json",
      authType: "none",
    });
    assert.equal(scaffoldStub.mock.calls.length, 1);
    assert.deepEqual(scaffoldStub.mock.calls[0][0], {
      templateId: "add-mcp-server",
      projectPath,
      platform: Platform.VSCode,
      teamsManifestPath: "appPackage/manifest.json",
      appName: "My MCP App",
      mcpServerUrl: "https://example.com/mcp",
      authType: "none",
      resolvedPackage: undefined,
    });
    assert.equal(legacyManifestPathStub.mock.calls.length, 0);
  });

  it("rejects each incomplete resolved answer before scaffolding", async () => {
    const projectPath = path.join(os.tmpdir(), "scenario-add-mcp-invalid-answers");
    const completeInputs: Inputs = {
      platform: Platform.VSCode,
      projectPath,
      [QuestionNames.ActionType]: ActionStartOptions.mcp().id,
      [QuestionNames.MCPForDAServerUrl]: "https://example.com/mcp",
      [QuestionNames.MCPForDAAuthType]: "none",
      ignoreLockByUT: true,
    };

    const manifest = new TeamsAppManifest();
    manifest.name = { short: "My MCP App", full: "My MCP App" };
    manifest.copilotExtensions = {
      declarativeCopilots: [{ file: "declarativeAgent.json", id: "declarativeAgent" }],
    };

    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) => {
      return flag === FeatureFlags.V4Enabled || flag === FeatureFlags.MCPForDADT;
    });
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    const scaffoldStub = vi
      .spyOn(fxCoreDeclarativeAgentDeps, "scaffoldAddMcpServerFromV4")
      .mockResolvedValue(ok(undefined));
    const incompleteAnswers = [
      { teamsManifestPath: "appPackage/manifest.json", authType: "none" },
      { mcpServerUrl: "https://example.com/mcp", authType: "none" },
      {
        mcpServerUrl: "https://example.com/mcp",
        teamsManifestPath: "appPackage/manifest.json",
      },
    ];
    let answerIndex = 0;
    const modifyFrontDoorStub = vi
      .spyOn(fxCoreDeclarativeAgentDeps, "modifyProjectFrontDoor")
      .mockImplementation(async (frontDoorInputs, selectorPrefill, _entryParams, dependencies) => {
        return dependencies.scaffoldV4(
          frontDoorInputs,
          {
            templateId: "add-mcp-server",
            engine: "v4",
            answers: selectorPrefill,
          },
          incompleteAnswers[answerIndex++]
        );
      });

    for (const answers of incompleteAnswers) {
      const result = await new FxCore(tools).addPlugin(completeInputs);

      assert.isTrue(
        result.isErr(),
        `expected incomplete resolved answers to fail: ${JSON.stringify(answers)}`
      );
      const error = result._unsafeUnwrapErr();
      assert.instanceOf(error, SystemError);
      assert.strictEqual(error.name, "InvalidAddMcpServerAnswers");
    }
    assert.equal(modifyFrontDoorStub.mock.calls.length, 3);
    assert.equal(scaffoldStub.mock.calls.length, 0);
  });

  it("raises only the placeholder warnings from the v4 add scaffold as notifications", async () => {
    vi.mocked(scaffoldDeclarativeFromV4Channel).mockImplementation(async (context) => {
      context.warnings = [
        { type: "mcpServerUrlNotAnEndpoint", content: "advisory only" },
        { type: "mcpAuthOAuthUrlPlaceholder", content: "repair the oauth urls" },
      ];
      return { origin: "bundled", version: "1.0.0", digest: "sha256:test", location: "test" };
    });
    const showMessage = vi.spyOn(tools.ui, "showMessage");

    const result = await fxCoreDeclarativeAgentDeps.scaffoldAddMcpServerFromV4({
      templateId: "add-mcp-server",
      projectPath: path.join(os.tmpdir(), "scenario-add-mcp-placeholder-warning"),
      teamsManifestPath: "appPackage/manifest.json",
      appName: "My MCP App",
      mcpServerUrl: "https://example.com/mcp",
      authType: "oauth",
    });

    assert.isTrue(result.isOk());
    const warned = showMessage.mock.calls.filter((call) => call[0] === "warn");
    assert.equal(warned.length, 1);
    assert.equal(warned[0][1], "repair the oauth urls");
  });

  it("SCN-ADD-MCP-12: v4 add questions collect auth type but defer credentials", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) => {
      return flag === FeatureFlags.V4Enabled || flag === FeatureFlags.MCPForDADT;
    });

    const root = addPluginQuestionNode();
    const serverUrlNode = root.children?.find(
      (node) => node.data?.name === QuestionNames.MCPForDAServerUrl
    );
    const authTypeNode = serverUrlNode?.children?.find(
      (node) => node.data?.name === QuestionNames.MCPForDAAuthType
    );

    assert.isDefined(serverUrlNode);
    assert.isDefined(authTypeNode);
    const credentialNodes = authTypeNode?.children ?? [];
    assert.lengthOf(credentialNodes, 3);
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.MCPForDAAuthType]: "oauth",
    };
    for (const node of credentialNodes) {
      const condition = node.condition;
      if (typeof condition !== "function") {
        assert.fail(`expected ${node.data.name} to have a condition`);
      }
      assert.isFalse(await condition(inputs));
    }
  });
});
