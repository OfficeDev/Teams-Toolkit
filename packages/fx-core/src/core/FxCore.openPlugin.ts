// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks/lib";
import {
  CreateProjectResult,
  err,
  FxError,
  Inputs,
  ok,
  Result,
  Stage,
  UserError,
  Warning,
} from "@microsoft/teamsfx-api";
import { featureFlagManager, FeatureFlags } from "../common/featureFlags";
import { ErrorContextMW } from "../common/globalVars";
import {
  exportOpenPlugin,
  OPEN_PLUGIN_EXPORT_SOURCE,
} from "../component/generator/openPlugin/exporter";
import {
  importOpenPlugin,
  OPEN_PLUGIN_IMPORT_SOURCE,
} from "../component/generator/openPlugin/importer";
import {
  DefaultAuthOption,
  ExportInputs,
  ImportInputs,
} from "../component/generator/openPlugin/types";
import { FxCoreDeclarativeAgentPart } from "./FxCore.declarativeAgent";
import { ErrorHandlerMW } from "./middleware/errorHandler";

const ALLOWED_AUTH: DefaultAuthOption[] = ["Auto", "None", "OAuthPluginVault", "ApiKeyPluginVault"];
const ALLOWED_MANIFEST_KINDS: NonNullable<ExportInputs["manifestKind"]>[] = [
  "open-plugin",
  "claude-plugin",
  "cursor-plugin",
];

export interface ExportOpenPluginCoreResult {
  outputPath: string;
  warnings: Warning[];
}

export class FxCoreOpenPluginPart extends FxCoreDeclarativeAgentPart {
  /**
   * Import an Open Plugin (Open Plugin Spec v1.0 / Claude Code plugin /
   * Cursor plugin) directory into a scaffolded Microsoft 365 Agents Toolkit
   * project.
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: Stage.create, reset: true }),
    ErrorHandlerMW,
  ])
  async importOpenPlugin(inputs: Inputs): Promise<Result<CreateProjectResult, FxError>> {
    if (!featureFlagManager.getBooleanValue(FeatureFlags.OpenPluginImportExport)) {
      return err(
        new UserError(
          OPEN_PLUGIN_IMPORT_SOURCE,
          "FeatureFlagDisabled",
          `Set ${FeatureFlags.OpenPluginImportExport.name}=true to enable 'atk import openplugin'.`
        )
      );
    }

    const validatedInputs = this.validateImportInputs(inputs);
    if (validatedInputs.isErr()) {
      return err(validatedInputs.error);
    }
    const res = await importOpenPlugin(validatedInputs.value);
    if (res.isErr()) {
      return err(res.error);
    }
    const warnings: Warning[] = res.value.warnings.map((content) => ({
      type: "openPluginImport",
      content,
    }));
    return ok({ projectPath: res.value.projectPath, warnings });
  }

  /**
   * Export an ATK project into an Open Plugin Spec directory. Round-trips
   * losslessly with `importOpenPlugin` via the `x-microsoft-365-agents-toolkit`
   * extension block embedded in plugin.json.
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: Stage.create, reset: true }),
    ErrorHandlerMW,
  ])
  async exportOpenPlugin(inputs: Inputs): Promise<Result<ExportOpenPluginCoreResult, FxError>> {
    if (!featureFlagManager.getBooleanValue(FeatureFlags.OpenPluginImportExport)) {
      return err(
        new UserError(
          OPEN_PLUGIN_EXPORT_SOURCE,
          "FeatureFlagDisabled",
          `Set ${FeatureFlags.OpenPluginImportExport.name}=true to enable 'atk export openplugin'.`
        )
      );
    }

    const validatedInputs = this.validateExportInputs(inputs);
    if (validatedInputs.isErr()) {
      return err(validatedInputs.error);
    }
    const res = await exportOpenPlugin(validatedInputs.value);
    if (res.isErr()) {
      return err(res.error);
    }
    const warnings: Warning[] = res.value.warnings.map((content) => ({
      type: "openPluginExport",
      content,
    }));
    return ok({ outputPath: res.value.outputPath, warnings });
  }

  private validateImportInputs(inputs: Inputs): Result<ImportInputs, FxError> {
    const pluginPath = inputs["path"];
    if (!pluginPath) {
      return err(
        new UserError(
          OPEN_PLUGIN_IMPORT_SOURCE,
          "MissingRequiredInput",
          `Missing required option(s): path.`
        )
      );
    }

    let defaultAuthType: DefaultAuthOption | undefined;
    const rawAuth = inputs["default-auth-type"];
    if (rawAuth) {
      if (!ALLOWED_AUTH.includes(rawAuth as DefaultAuthOption)) {
        return err(
          new UserError(
            OPEN_PLUGIN_IMPORT_SOURCE,
            "InvalidDefaultAuthType",
            `--default-auth-type must be one of: ${ALLOWED_AUTH.join(", ")}.`
          )
        );
      }
      defaultAuthType = rawAuth as DefaultAuthOption;
    }

    return ok({
      path: pluginPath as string,
      output: inputs["output"] as string | undefined,
      privacyUrl: inputs["privacy-url"] as string | undefined,
      termsUrl: inputs["terms-url"] as string | undefined,
      websiteUrl: inputs["website-url"] as string | undefined,
      appId: inputs["app-id"] as string | undefined,
      defaultAuthType,
      packageName: inputs["package-name"] as string | undefined,
    });
  }

  private validateExportInputs(inputs: Inputs): Result<ExportInputs, FxError> {
    const projectPath = inputs["path"];
    if (!projectPath) {
      return err(
        new UserError(
          OPEN_PLUGIN_EXPORT_SOURCE,
          "MissingRequiredInput",
          `Missing required option(s): path.`
        )
      );
    }

    let manifestKind: ExportInputs["manifestKind"];
    const rawKind = inputs["manifest-kind"];
    if (rawKind) {
      if (!ALLOWED_MANIFEST_KINDS.includes(rawKind as NonNullable<ExportInputs["manifestKind"]>)) {
        return err(
          new UserError(
            OPEN_PLUGIN_EXPORT_SOURCE,
            "InvalidManifestKind",
            `--manifest-kind must be one of: ${ALLOWED_MANIFEST_KINDS.join(", ")}.`
          )
        );
      }
      manifestKind = rawKind as NonNullable<ExportInputs["manifestKind"]>;
    }

    return ok({
      path: projectPath as string,
      output: inputs["output"] as string | undefined,
      manifestKind,
    });
  }
}
