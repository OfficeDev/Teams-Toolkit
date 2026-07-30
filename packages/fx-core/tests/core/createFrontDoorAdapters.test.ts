// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Inputs, Platform, UserError, err, ok, signedOut } from "@microsoft/teamsfx-api";
import * as fs from "fs-extra";
import os from "os";
import path from "path";
import { assert, vi } from "vitest";

import { ListSensitivityLabelScope } from "../../src/common/constants";
import { setTools } from "../../src/common/globalVars";
import { TelemetryEvent, TelemetryProperty, TelemetrySuccess } from "../../src/common/telemetry";
import { coordinator } from "../../src/component/coordinator";
import { manifestUtils } from "../../src/component/driver/teamsApp/utils/ManifestUtils";
import { TemplateNames } from "../../src/component/generator/templates/templateNames";
import { pathUtils } from "../../src/component/utils/pathUtils";
import {
  collectCreateFloor,
  scaffoldV4,
  scaffoldV4Deps,
} from "../../src/core/createFrontDoorAdapters";
import { QuestionNames } from "../../src/question/constants";
import { BuildTarget, TemplateSource } from "../../src/v4";
import { MockTools } from "./utils";

const TEMPLATE_SOURCE: TemplateSource = {
  origin: "bundled",
  version: "1.0.0",
  digest: "sha256:test",
  location: "test",
};

let tempFolderIndex = 0;
function tempFolder(): string {
  tempFolderIndex += 1;
  return path.join(os.tmpdir(), "create-front-door-adapters", `${process.pid}-${tempFolderIndex}`);
}

describe("createFrontDoorAdapters", () => {
  const tools = new MockTools();
  setTools(tools);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("scaffoldV4", () => {
    const v4Target: BuildTarget = {
      templateId: "da/mcp-server",
      engine: "v4",
      language: "common",
    };

    it("errors when the create floor has no folder", async () => {
      const inputs: Inputs = { platform: Platform.VSCode, [QuestionNames.AppName]: "MyApp" };

      const res = await scaffoldV4(inputs, v4Target, {});

      assert.isTrue(res.isErr());
    });

    it("errors when the create floor has no app name", async () => {
      const inputs: Inputs = { platform: Platform.VSCode, [QuestionNames.Folder]: "/tmp" };

      const res = await scaffoldV4(inputs, v4Target, {});

      assert.isTrue(res.isErr());
    });

    it("errors when the app name violates the name pattern", async () => {
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: "/tmp",
        [QuestionNames.AppName]: "Bad/Name",
      };

      const res = await scaffoldV4(inputs, v4Target, {});

      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.equal(res.error.name, "InputValidationError");
      }
    });

    it("scaffolds the located package and returns the project path", async () => {
      const channel = vi
        .spyOn(scaffoldV4Deps, "scaffoldDeclarativeFromV4Channel")
        .mockResolvedValue(TEMPLATE_SOURCE);
      // No teamsapp.yml ⇒ ensureTrackingId is skipped.
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue(undefined);
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: "/tmp",
        [QuestionNames.AppName]: "MyApp",
      };
      const flagReader = (name: string): boolean => name === "TEAMSFX_TEST_FLAG";
      const provider = tools.tokenProvider.m365TokenProvider;
      if (provider === undefined) {
        assert.fail("expected an M365 token provider");
      }
      const getStatus = vi
        .spyOn(provider, "getStatus")
        .mockResolvedValue(ok({ status: signedOut }));

      const res = await scaffoldV4(inputs, v4Target, { mcpServerType: "remote" }, flagReader);

      assert.isTrue(res.isOk());
      assert.equal(res._unsafeUnwrap().projectPath, path.join(path.resolve("/tmp"), "MyApp"));
      const firstCall = channel.mock.calls[0];
      assert.deepEqual(firstCall[1], { kind: "create", templateId: "da/mcp-server" });
      assert.deepEqual(firstCall[2], { mcpServerType: "remote" });
      assert.deepEqual(firstCall[3], { appName: "MyApp", language: "common" });
      assert.strictEqual(firstCall[5], flagReader);
      const stepRegistry = firstCall[7];
      const sensitivityStep = stepRegistry?.get("da/set-sensitivity-label");
      if (sensitivityStep === undefined) {
        assert.fail("expected a registered sensitivity-label step");
      }
      const applyResult = await sensitivityStep.apply(
        { manifestPath: "appPackage/declarativeAgent.json" },
        {
          read: (): Buffer | undefined => undefined,
          write: (): void => undefined,
          manifestWrapper: () => ({
            registerDeclarativeAgentAction: () => ok(undefined),
          }),
        }
      );
      assert.isTrue(applyResult.isOk());
      assert.deepStrictEqual(getStatus.mock.calls[0][0], {
        scopes: [ListSensitivityLabelScope],
        showDialog: false,
      });
    });

    it("DCE-21: emits v3-compatible generate-template telemetry when v4 scaffold succeeds", async () => {
      vi.spyOn(scaffoldV4Deps, "scaffoldDeclarativeFromV4Channel").mockImplementation(
        async (_context, _locator, _answers, _callerFloor, telemetryProps) => {
          Object.assign(telemetryProps ?? {}, {
            [TelemetryProperty.TemplatePackageSource]: TEMPLATE_SOURCE.origin,
            [TelemetryProperty.TemplatePackageVersion]: TEMPLATE_SOURCE.version,
            [TelemetryProperty.TemplatePackageDigest]: TEMPLATE_SOURCE.digest,
          });
          return TEMPLATE_SOURCE;
        }
      );
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue(undefined);
      const sendTelemetry = vi.spyOn(tools.telemetryReporter, "sendTelemetryEvent");
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: "/tmp",
        [QuestionNames.AppName]: "MyApp",
      };

      const res = await scaffoldV4(inputs, v4Target, { language: "typescript" });

      assert.isTrue(res.isOk());
      assert.equal(sendTelemetry.mock.calls.length, 1);
      assert.equal(sendTelemetry.mock.calls[0][0], TelemetryEvent.GenerateTemplate);
      assert.equal(
        sendTelemetry.mock.calls[0][1]?.[TelemetryProperty.TemplateName],
        "declarative-agent-with-action-from-mcp-ts"
      );
      assert.equal(
        sendTelemetry.mock.calls[0][1]?.[TelemetryProperty.Success],
        TelemetrySuccess.Yes
      );
      assert.equal(
        sendTelemetry.mock.calls[0][1]?.[TelemetryProperty.TemplatePackageSource],
        "bundled"
      );
      assert.equal(
        sendTelemetry.mock.calls[0][1]?.[TelemetryProperty.TemplatePackageVersion],
        "1.0.0"
      );
      assert.equal(
        sendTelemetry.mock.calls[0][1]?.[TelemetryProperty.TemplatePackageDigest],
        "sha256:test"
      );
    });

    it("DCE-21: emits generate-template error telemetry when v4 scaffold fails", async () => {
      vi.spyOn(scaffoldV4Deps, "scaffoldDeclarativeFromV4Channel").mockRejectedValue(
        new Error("channel boom")
      );
      const sendTelemetryError = vi.spyOn(tools.telemetryReporter, "sendTelemetryErrorEvent");
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: "/tmp",
        [QuestionNames.AppName]: "MyApp",
      };

      const res = await scaffoldV4(inputs, v4Target, {});

      assert.isTrue(res.isErr());
      assert.equal(sendTelemetryError.mock.calls.length, 1);
      assert.equal(sendTelemetryError.mock.calls[0][0], TelemetryEvent.GenerateTemplate);
      assert.equal(
        sendTelemetryError.mock.calls[0][1]?.[TelemetryProperty.TemplateName],
        "declarative-agent-with-action-from-mcp-common"
      );
      assert.equal(
        sendTelemetryError.mock.calls[0][1]?.[TelemetryProperty.Success],
        TelemetrySuccess.No
      );
    });

    it("DCE-19: derives the v3-compatible telemetry template id from the v4 target id", async () => {
      const expectedMappings: ReadonlyArray<readonly [string, string]> = [
        ["basic-custom-engine-agent", TemplateNames.BasicCustomEngineAgent],
        ["weather-agent", TemplateNames.WeatherAgent],
        ["graph-connector", TemplateNames.GraphConnector],
        ["custom-copilot-basic", TemplateNames.CustomCopilotBasic],
        ["custom-copilot-rag-customize", TemplateNames.CustomCopilotRagCustomize],
        ["custom-copilot-rag-azure-ai-search", TemplateNames.CustomCopilotRagAzureAISearch],
        ["custom-copilot-rag-custom-api", TemplateNames.CustomCopilotRagCustomApi],
        ["teams-collaborator-agent", TemplateNames.TeamsCollaboratorAgent],
        ["non-sso-tab", TemplateNames.Tab],
        ["default-message-extension", TemplateNames.DefaultMessageExtension],
        ["default-bot", TemplateNames.DefaultBot],
        ["office-addin-wxpo-taskpane", TemplateNames.WXPTaskpane],
        ["office-addin-excel-cfshortcut", TemplateNames.ExcelCFShortcut],
        ["office-addin-excel-customfunctions", TemplateNames.ExcelCustomFunctions],
        ["office-addin-sso-naa", TemplateNames.OfficeAddinSsoNaa],
        ["declarative-agent-meta-os-upgrade-project", "declarative-agent-meta-os-upgrade-project"],
        ["office-addin-config", TemplateNames.OfficeAddinCommon],
        ["da/no-action", TemplateNames.DeclarativeAgentBasic],
        ["da/graph-connector", TemplateNames.DeclarativeAgentWithGraphConnector],
        ["da/typespec", TemplateNames.DeclarativeAgentWithTypeSpec],
        ["da/skill", TemplateNames.DeclarativeAgentWithSkill],
        ["da/api-plugin-from-scratch", TemplateNames.DeclarativeAgentWithActionFromScratch],
        [
          "da/api-plugin-from-scratch-bearer",
          TemplateNames.DeclarativeAgentWithActionFromScratchBearer,
        ],
        [
          "da/api-plugin-from-scratch-oauth",
          TemplateNames.DeclarativeAgentWithActionFromScratchOAuth,
        ],
        [
          "da/api-plugin-from-existing-api",
          TemplateNames.DeclarativeAgentWithActionFromExistingApiSpec,
        ],
        ["da/mcp-server-static", TemplateNames.DeclarativeAgentWithActionFromMCP],
        ["da/mcp-server", TemplateNames.DeclarativeAgentWithActionFromMCP],
      ];
      vi.spyOn(scaffoldV4Deps, "scaffoldDeclarativeFromV4Channel").mockResolvedValue(
        TEMPLATE_SOURCE
      );
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue(undefined);
      const sendTelemetry = vi.spyOn(tools.telemetryReporter, "sendTelemetryEvent");

      for (const [templateId, expectedTemplateName] of expectedMappings) {
        sendTelemetry.mockClear();
        const inputs: Inputs = {
          platform: Platform.VSCode,
          [QuestionNames.Folder]: "/tmp",
          [QuestionNames.AppName]: "MyApp",
        };

        const res = await scaffoldV4(
          inputs,
          { templateId, engine: "v4", language: "common" },
          { language: "typescript" }
        );

        assert.isTrue(res.isOk());
        assert.equal(
          sendTelemetry.mock.calls[0][1]?.[TelemetryProperty.TemplateName],
          `${expectedTemplateName}-ts`,
          templateId
        );
      }
    });

    it("DCE-20: an unmapped v4 target id falls back to itself as the telemetry key", async () => {
      vi.spyOn(scaffoldV4Deps, "scaffoldDeclarativeFromV4Channel").mockResolvedValue(
        TEMPLATE_SOURCE
      );
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue(undefined);
      const sendTelemetry = vi.spyOn(tools.telemetryReporter, "sendTelemetryEvent");
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: "/tmp",
        [QuestionNames.AppName]: "MyApp",
      };

      const res = await scaffoldV4(
        inputs,
        { templateId: "future/v4-template", engine: "v4", language: "common" },
        { language: "typescript" }
      );

      assert.isTrue(res.isOk());
      assert.equal(
        sendTelemetry.mock.calls[0][1]?.[TelemetryProperty.TemplateName],
        "future/v4-template-ts"
      );
    });

    it("ensures the tracking id when the scaffold wrote a teamsapp.yml", async () => {
      vi.spyOn(scaffoldV4Deps, "scaffoldDeclarativeFromV4Channel").mockResolvedValue(
        TEMPLATE_SOURCE
      );
      const folder = tempFolder();
      const ymlPath = path.join(folder, "MyApp", "teamsapp.yml");
      await fs.ensureFile(ymlPath);
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue(ymlPath);
      const ensure = vi.spyOn(coordinator, "ensureTrackingId").mockResolvedValue(ok("tracking-id"));
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: folder,
        [QuestionNames.AppName]: "MyApp",
      };

      try {
        const res = await scaffoldV4(inputs, v4Target, {});

        assert.isTrue(res.isOk());
        assert.equal(res._unsafeUnwrap().projectId, "tracking-id");
        assert.equal(ensure.mock.calls.length, 1);
      } finally {
        await fs.remove(folder);
      }
    });

    it("DCE-26: trims an over-length manifest short name after the scaffold", async () => {
      const folder = tempFolder();
      const appName = "MyVeryLongDeclarativeAgentName";
      const manifestPath = path.join(folder, appName, "appPackage", "manifest.json");
      vi.spyOn(scaffoldV4Deps, "scaffoldDeclarativeFromV4Channel").mockImplementation(async () => {
        await fs.outputJson(manifestPath, { name: { short: `${appName}\${{APP_NAME_SUFFIX}}` } });
        return TEMPLATE_SOURCE;
      });
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue(undefined);
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: folder,
        [QuestionNames.AppName]: appName,
      };

      try {
        const res = await scaffoldV4(inputs, v4Target, {});

        assert.isTrue(res.isOk());
        const manifest = await fs.readJson(manifestPath);
        assert.equal(manifest.name.short, "MyVeryLongDeclarativeAgen${{APP_NAME_SUFFIX}}");
      } finally {
        await fs.remove(folder);
      }
    });

    it("returns the trim error when trimManifestShortName fails", async () => {
      vi.spyOn(scaffoldV4Deps, "scaffoldDeclarativeFromV4Channel").mockResolvedValue(
        TEMPLATE_SOURCE
      );
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue(undefined);
      vi.spyOn(manifestUtils, "trimManifestShortName").mockResolvedValue(
        err(new UserError({ source: "Test", name: "TrimShortNameFailed", message: "failed" }))
      );
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: "/tmp",
        [QuestionNames.AppName]: "MyApp",
      };

      const res = await scaffoldV4(inputs, v4Target, {});

      assert.isTrue(res.isErr());
      assert.equal(res._unsafeUnwrapErr().name, "TrimShortNameFailed");
    });

    it("defaults the caller-floor language to common when the target has none", async () => {
      const channel = vi
        .spyOn(scaffoldV4Deps, "scaffoldDeclarativeFromV4Channel")
        .mockResolvedValue(TEMPLATE_SOURCE);
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue(undefined);
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: "/tmp",
        [QuestionNames.AppName]: "MyApp",
      };

      const res = await scaffoldV4(inputs, { templateId: "da/mcp-server", engine: "v4" }, {});

      assert.isTrue(res.isOk());
      assert.deepEqual(channel.mock.calls[0][3], { appName: "MyApp", language: "common" });
    });

    it("logs a warning when template source resolution returns one", async () => {
      vi.spyOn(scaffoldV4Deps, "scaffoldDeclarativeFromV4Channel").mockResolvedValue({
        ...TEMPLATE_SOURCE,
        warning: "Using bundled template fallback.",
      });
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue(undefined);
      const warning = vi.spyOn(tools.logProvider, "warning");
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: "/tmp",
        [QuestionNames.AppName]: "MyApp",
      };

      const res = await scaffoldV4(inputs, v4Target, {});

      assert.isTrue(res.isOk());
      assert.equal(warning.mock.calls[0][0], "Using bundled template fallback.");
    });

    it("carries the pipeline warnings onto the create result", async () => {
      vi.spyOn(scaffoldV4Deps, "scaffoldDeclarativeFromV4Channel").mockImplementation(
        async (context) => {
          context.warnings = [{ type: "mcpAuthOAuthUrlPlaceholder", content: "repair the urls" }];
          return TEMPLATE_SOURCE;
        }
      );
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue(undefined);
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: "/tmp",
        [QuestionNames.AppName]: "MyApp",
      };

      const res = await scaffoldV4(inputs, v4Target, {});

      assert.isTrue(res.isOk());
      assert.deepEqual(res._unsafeUnwrap().warnings, [
        { type: "mcpAuthOAuthUrlPlaceholder", content: "repair the urls" },
      ]);
    });

    it("leaves the create result without warnings when the pipeline raised none", async () => {
      vi.spyOn(scaffoldV4Deps, "scaffoldDeclarativeFromV4Channel").mockImplementation(
        async (context) => {
          context.warnings = [];
          return TEMPLATE_SOURCE;
        }
      );
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue(undefined);
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: "/tmp",
        [QuestionNames.AppName]: "MyApp",
      };

      const res = await scaffoldV4(inputs, v4Target, {});

      assert.isTrue(res.isOk());
      assert.isUndefined(res._unsafeUnwrap().warnings);
    });

    it("returns the tracking id error when ensureTrackingId fails", async () => {
      vi.spyOn(scaffoldV4Deps, "scaffoldDeclarativeFromV4Channel").mockResolvedValue(
        TEMPLATE_SOURCE
      );
      const folder = tempFolder();
      const ymlPath = path.join(folder, "MyApp", "teamsapp.yml");
      await fs.ensureFile(ymlPath);
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue(ymlPath);
      vi.spyOn(coordinator, "ensureTrackingId").mockResolvedValue(
        err(new UserError({ source: "Test", name: "TrackingIdFailed", message: "failed" }))
      );
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: folder,
        [QuestionNames.AppName]: "MyApp",
      };

      try {
        const res = await scaffoldV4(inputs, v4Target, {});

        assert.isTrue(res.isErr());
        if (res.isErr()) {
          assert.equal(res.error.name, "TrackingIdFailed");
        }
      } finally {
        await fs.remove(folder);
      }
    });

    it("surfaces a channel failure as an error", async () => {
      vi.spyOn(scaffoldV4Deps, "scaffoldDeclarativeFromV4Channel").mockRejectedValue(
        new Error("channel boom")
      );
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: "/tmp",
        [QuestionNames.AppName]: "MyApp",
      };

      const res = await scaffoldV4(inputs, v4Target, {});

      assert.isTrue(res.isErr());
    });
  });

  describe("collectCreateFloor", () => {
    it("skips the floor when folder + app-name are already preset (asks no UI)", async () => {
      // a preset app-name is validated (pattern + path-not-exists) but never re-asked;
      // MockTools UI throws if prompted, so an ok proves the preset-skip path.
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: tempFolder(),
        [QuestionNames.AppName]: "MyApp",
      };

      const res = await collectCreateFloor(inputs, tools.ui);

      assert.isTrue(res.isOk());
    });

    it("validates a preset app-name and returns the validation error", async () => {
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: tempFolder(),
        [QuestionNames.AppName]: "Bad/Name",
      };

      const res = await collectCreateFloor(inputs, tools.ui);

      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.equal(res.error.name, "InputValidationError");
      }
    });

    it("uses the app-name default in non-interactive mode when one is available", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        nonInteractive: true,
        teamsAppFromTdp: { appName: "Default App" },
      };

      const res = await collectCreateFloor(inputs, tools.ui);

      assert.isTrue(res.isOk());
      assert.equal(inputs[QuestionNames.Folder], "./");
      assert.equal(inputs[QuestionNames.AppName], "DefaultApp");
    });

    it("does not short-circuit on a preset template-name in interactive v4 floor collection", async () => {
      const pickedFolder = tempFolder();
      vi.spyOn(tools.ui, "selectFolder").mockResolvedValue(
        ok({ type: "success", result: pickedFolder })
      );
      vi.spyOn(tools.ui, "inputText").mockResolvedValue(
        ok({ type: "success", result: "PickedApp" })
      );
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.TemplateName]: "da/mcp-server",
      };

      const res = await collectCreateFloor(inputs, tools.ui);

      assert.isTrue(res.isOk());
      assert.equal(inputs[QuestionNames.Folder], pickedFolder);
      assert.equal(inputs[QuestionNames.AppName], "PickedApp");
    });

    it("uses the folder default and fails on missing app-name in non-interactive mode", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        nonInteractive: true,
        [QuestionNames.TemplateName]: "da/mcp-server",
      };

      const res = await collectCreateFloor(inputs, tools.ui);

      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.equal(res.error.name, "MissingRequiredInputError");
      }
      assert.equal(inputs[QuestionNames.Folder], "./");
    });

    it("prompts an interactive surface and writes the answers back to inputs", async () => {
      // VS Code interactive, no preset floor ⇒ the floor questions are asked and the
      // answers land on the same inputs bag scaffoldV4 then reads (the bug this fixes:
      // without it the v4 path reached scaffoldV4 with folder undefined).
      const pickedFolder = tempFolder();
      vi.spyOn(tools.ui, "selectFolder").mockResolvedValue(
        ok({ type: "success", result: pickedFolder })
      );
      vi.spyOn(tools.ui, "inputText").mockResolvedValue(
        ok({ type: "success", result: "PickedApp" })
      );
      const inputs: Inputs = { platform: Platform.VSCode };

      const res = await collectCreateFloor(inputs, tools.ui);

      assert.isTrue(res.isOk());
      assert.equal(inputs[QuestionNames.Folder], pickedFolder);
      assert.equal(inputs[QuestionNames.AppName], "PickedApp");
    });

    it("propagates a cancellation from the interactive floor prompt", async () => {
      const cancel = new UserError({ source: "Test", name: "UserCancelError", message: "cancel" });
      vi.spyOn(tools.ui, "selectFolder").mockResolvedValue(err(cancel));
      const inputs: Inputs = { platform: Platform.VSCode };

      const res = await collectCreateFloor(inputs, tools.ui);

      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.equal(res.error.name, "UserCancelError");
      }
    });

    it("propagates a cancellation from the interactive app-name prompt", async () => {
      const cancel = new UserError({ source: "Test", name: "UserCancelError", message: "cancel" });
      vi.spyOn(tools.ui, "selectFolder").mockResolvedValue(
        ok({ type: "success", result: tempFolder() })
      );
      vi.spyOn(tools.ui, "inputText").mockResolvedValue(err(cancel));
      const inputs: Inputs = { platform: Platform.VSCode };

      const res = await collectCreateFloor(inputs, tools.ui);

      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.equal(res.error.name, "UserCancelError");
      }
    });
  });
});
