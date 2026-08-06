// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks/lib";
import {
  Context,
  err,
  FxError,
  GeneratorResult,
  ok,
  Result,
  UserError,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import path from "path";
import * as uuid from "uuid";
import { getDefaultString } from "../../../common/localizeUtils";
import { ProjectTypeProps, TelemetryEvent } from "../../../common/telemetry";
import { getTemplatesFolder } from "../../../folder";
import { ProgressTitles } from "../../messages";
import { ActionExecutionMW } from "../../middleware/actionExecutionMW";
import { settingsUtil } from "../../utils/settingsUtil";
import { CopyPolicy, policys } from "./copyPolicy";
import { mergeJsonFile } from "./jsonMerger";
import { renderTemplate } from "./renderTemplate";

export class ConfigGenerator {
  componentName = "ConfigGenerator";

  @hooks([
    ActionExecutionMW({
      enableProgressBar: true,
      progressTitle: ProgressTitles.create,
      progressSteps: 1,
      enableTelemetry: true,
      telemetryEventName: TelemetryEvent.GenerateConfig,
    }),
  ])
  public async run(
    context: Context,
    destinationPath: string,
    components: { name: string; programmingLanguage: string }[],
    features: Record<string, unknown>
  ): Promise<Result<GeneratorResult, FxError>> {
    await context.userInteraction.showMessage("info", "Generating configuration files...", false);
    // telemetry props
    const successComponents: string[] = [];
    const failedComponents: string[] = [];

    // Process all components: detect conflicts and generate files in a single pass
    for (const component of components) {
      const policyKey = this.getPolicyKey(component);
      const policy = policys[policyKey];

      if (!policy) {
        return err(
          new UserError(
            this.componentName,
            "UnknownPolicyError",
            getDefaultString("error.generator.UnknownPolicy", policyKey)
          )
        );
      }

      const fileDetectionResult = await this.detectFileConflict(destinationPath, policy);
      if (fileDetectionResult.isErr()) {
        await context.userInteraction.showMessage("warn", fileDetectionResult.error.message, false);
        failedComponents.push(policyKey);
        continue;
      }

      const sourcePath = path.join(
        getTemplatesFolder(),
        "configs",
        component.name,
        component.programmingLanguage
      );
      await context.userInteraction.showMessage(
        "info",
        `Processing ${component.name} (${component.programmingLanguage})...`,
        false
      );
      const changes = await this.generateConfigFilesByPolicy(
        sourcePath,
        destinationPath,
        policy,
        features
      );

      // Show what files were changed
      for (const change of changes) {
        const action =
          change.action === "added"
            ? "Added"
            : change.action === "modified"
              ? "Modified"
              : "Skipped";
        await context.userInteraction.showMessage("info", `  ${action}: ${change.file}`, false);
      }

      successComponents.push(policyKey);
    }

    const settingsRes = await settingsUtil.readSettings(destinationPath, false);
    if (settingsRes.isErr()) return err(settingsRes.error);
    const settings = settingsRes.value;
    if (!settings.trackingId) {
      settings.trackingId = uuid.v4();
    }
    await settingsUtil.writeSettings(destinationPath, settings);

    context.telemetryReporter?.sendTelemetryEvent(TelemetryEvent.GenerateConfigSummary, {
      [ProjectTypeProps.TeamsManifestCapabilities]: this.getCapabilities(features).join(",") || "",
      successComponents: successComponents.join(",") || "",
      failedComponents: failedComponents.join(",") || "",
      trackingId: settings.trackingId || "",
    });
    return ok({});
  }

  private getCapabilities(features: Record<string, unknown>): string[] {
    const capabilities: string[] = [];
    if (features["hasTab"]) capabilities.push("Tab");
    if (features["hasBot"]) capabilities.push("Bot");
    if (features["hasMessageExtension"]) capabilities.push("ME");
    if (features["hasDeclarativeAgent"]) capabilities.push("DA");
    if (features["hasCustomEngineAgent"]) capabilities.push("CEA");
    return capabilities;
  }

  private getPolicyKey(component: { name: string; programmingLanguage: string }): string {
    return `${component.name}-${component.programmingLanguage}`;
  }

  private async detectFileConflict(
    destinationPath: string,
    policy: Record<string, CopyPolicy>
  ): Promise<Result<void, FxError>> {
    for (const [filePath, copyPolicy] of Object.entries(policy)) {
      if (!copyPolicy.allowExistingFile) {
        const fullPath = path.join(destinationPath, filePath);
        const fileExists = await fs.pathExists(fullPath);
        if (fileExists) {
          return err(
            new UserError(
              this.componentName,
              "ConflictFileError",
              getDefaultString("error.generator.FileConflictError", filePath)
            )
          );
        }
      }
    }
    return ok(undefined);
  }

  private getFileExtensionWithoutTemplate(filePath: string): string {
    const withoutTemplate = filePath.endsWith(".tpl") ? filePath.slice(0, -4) : filePath;
    return path.extname(withoutTemplate);
  }

  private async generateConfigFilesByPolicy(
    sourcePath: string,
    destinationPath: string,
    policy: Record<string, CopyPolicy>,
    features: Record<string, unknown>
  ): Promise<Array<{ file: string; action: "added" | "modified" | "skipped" }>> {
    const changes: Array<{ file: string; action: "added" | "modified" | "skipped" }> = [];

    for (const [filePath, copyPolicy] of Object.entries(policy)) {
      const isTemplate = filePath.endsWith(".tpl");
      let srcFilePath = path.join(sourcePath, filePath);
      const destFilePath = path.join(
        destinationPath,
        isTemplate ? filePath.slice(0, -4) : filePath
      );
      const fileExtension = this.getFileExtensionWithoutTemplate(filePath);
      let renderedFilePath: string | null = null;

      // Render template if needed
      if (isTemplate) {
        renderedFilePath = destFilePath + ".rendered";
        const renderedContent = renderTemplate(srcFilePath, features);
        await fs.outputFile(renderedFilePath, renderedContent, "utf-8");
        srcFilePath = renderedFilePath;
      }

      try {
        // Handle existing files
        const fileExists = await fs.pathExists(destFilePath);
        const relativeFilePath = path.relative(destinationPath, destFilePath);

        if (fileExists) {
          if (copyPolicy.policy === "add" && fileExtension === ".json") {
            await mergeJsonFile(srcFilePath, destFilePath);
            changes.push({ file: relativeFilePath, action: "modified" });
          } else {
            // For "skip" or non-JSON files, do nothing
            changes.push({ file: relativeFilePath, action: "skipped" });
          }
        } else {
          // If the file does not exist, just copy it.
          await fs.ensureDir(path.dirname(destFilePath));
          await fs.copy(srcFilePath, destFilePath);
          changes.push({ file: relativeFilePath, action: "added" });
        }
      } finally {
        // Clean up rendered temp file
        if (renderedFilePath !== null) {
          await fs.remove(renderedFilePath);
        }
      }
    }

    return changes;
  }
}

export const configGenerator = new ConfigGenerator();
