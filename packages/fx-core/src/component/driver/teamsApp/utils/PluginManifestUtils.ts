// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AppManifestUtils,
  Colors,
  DeclarativeCopilotManifestSchema,
  DefaultApiSpecJsonFileName,
  DefaultApiSpecYamlFileName,
  FxError,
  IPlugin,
  Platform,
  PluginManifestSchema,
  FunctionObject,
  RuntimeObjectLocalplugin,
  Result,
  TeamsManifestLatest,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { FileNotFoundError, JSONSyntaxError } from "../../../../error/common";
import stripBom from "strip-bom";
import path from "path";
import { manifestUtils } from "./ManifestUtils";
import { getResolvedManifest } from "./utils";
import { AppStudioResultFactory } from "../results";
import { AppStudioError } from "../errors";
import { getDefaultString, getLocalizedString } from "../../../../common/localizeUtils";
import { PluginManifestValidationResult } from "../interfaces/ValidationResult";
import { SummaryConstant } from "../../../configManager/constant";
import { EOL } from "os";
import { ManifestType } from "../../../utils/envFunctionUtils";
import { DriverContext } from "../../interface/commonArgs";
import { isJsonSpecFile } from "../../../../common/utils";
import { featureFlagManager, FeatureFlags } from "../../../../common/featureFlags";
import { ODRProvider, ODRServer, ODRTool } from "../../../utils/odrProvider";
import { LocalMcpPrefix } from "../../../constants";

export class PluginManifestUtils {
  public async readPluginManifestFile(
    path: string
  ): Promise<Result<PluginManifestSchema, FxError>> {
    if (!(await fs.pathExists(path))) {
      return err(new FileNotFoundError("PluginManifestUtils", path));
    }
    // Be compatible with UTF8-BOM encoding
    // Avoid Unexpected token error at JSON.parse()
    let content = await fs.readFile(path, { encoding: "utf-8" });
    content = stripBom(content);

    try {
      const manifest = JSON.parse(content) as PluginManifestSchema;
      return ok(manifest);
    } catch (e) {
      return err(new JSONSyntaxError(path, e, "PluginManifestUtils"));
    }
  }

  /**
   * Get plugin manifest with env value filled.
   * @param path path of declaraitve Copilot
   * @returns resolved manifest
   */
  public async getManifest(
    path: string,
    context: DriverContext
  ): Promise<Result<PluginManifestSchema, FxError>> {
    const manifestRes = await this.readPluginManifestFile(path);
    if (manifestRes.isErr()) {
      return err(manifestRes.error);
    }
    // Add environment variable keys to telemetry
    const resolvedManifestRes = await getResolvedManifest(
      JSON.stringify(manifestRes.value),
      path,
      ManifestType.PluginManifest,
      context
    );

    if (resolvedManifestRes.isErr()) {
      return err(resolvedManifestRes.error);
    }
    const resolvedManifestString = resolvedManifestRes.value;
    return ok(JSON.parse(resolvedManifestString));
  }

  public async validateAgainstSchema(
    plugin: IPlugin,
    path: string,
    context: DriverContext
  ): Promise<Result<PluginManifestValidationResult, FxError>> {
    const manifestRes = await this.getManifest(path, context);
    if (manifestRes.isErr()) {
      return err(manifestRes.error);
    }

    try {
      const schemaErrors = await AppManifestUtils.validateAgainstSchema(manifestRes.value as any);
      const localMCPPluginErrors = await this.validateLocalMCPPluginRuntimes(manifestRes.value);
      const allErrors = [...schemaErrors, ...localMCPPluginErrors];

      return ok({
        id: plugin.id,
        filePath: path,
        validationResult: allErrors,
      });
    } catch (e: any) {
      return err(
        AppStudioResultFactory.UserError(
          AppStudioError.ValidationFailedError.name,
          AppStudioError.ValidationFailedError.message([
            getLocalizedString(
              "error.appstudio.validateFetchSchemaFailed",
              manifestRes.value.$schema,
              e.message
            ),
          ])
        )
      );
    }
  }

  public async getApiSpecFilePathFromTeamsManifest(
    manifest: TeamsManifestLatest,
    manifestPath: string
  ): Promise<Result<string[], FxError>> {
    const pluginPathsRes = await this.getPluginManifestPathsFromDeclarativeAgent(
      manifest,
      manifestPath
    );
    if (pluginPathsRes.isErr()) {
      return err(pluginPathsRes.error);
    }
    const apiSpecFiles: string[] = [];
    for (const pluginFilePath of pluginPathsRes.value) {
      const pluginContentRes = await this.readPluginManifestFile(pluginFilePath);
      if (pluginContentRes.isErr()) {
        return err(pluginContentRes.error);
      }
      const files = await this.getApiSpecFilePathFromPlugin(pluginContentRes.value, pluginFilePath);
      apiSpecFiles.push(...files);
    }
    return ok(apiSpecFiles);
  }

  /**
   * Resolve the plugin manifest file path(s) referenced by the declarative agent's actions.
   * In the unified manifest, an API plugin is referenced from the declarative agent manifest's
   * `actions`, not from the (now removed) `copilotAgents.plugins` field.
   */
  public async getPluginManifestPathsFromDeclarativeAgent(
    manifest: TeamsManifestLatest,
    manifestPath: string
  ): Promise<Result<string[], FxError>> {
    const declarativeAgentFile = manifest.copilotAgents?.declarativeAgents?.[0]?.file;
    if (!declarativeAgentFile) {
      return err(
        AppStudioResultFactory.UserError(
          AppStudioError.TeamsAppRequiredPropertyMissingError.name,
          AppStudioError.TeamsAppRequiredPropertyMissingError.message(
            "declarativeAgents",
            manifestPath
          )
        )
      );
    }
    const declarativeAgentPath = path.resolve(path.dirname(manifestPath), declarativeAgentFile);
    if (!(await fs.pathExists(declarativeAgentPath))) {
      return err(new FileNotFoundError("PluginManifestUtils", declarativeAgentFile));
    }
    let declarativeAgentManifest: DeclarativeCopilotManifestSchema;
    try {
      const content = stripBom(await fs.readFile(declarativeAgentPath, { encoding: "utf-8" }));
      declarativeAgentManifest = JSON.parse(content) as DeclarativeCopilotManifestSchema;
    } catch (e) {
      return err(new JSONSyntaxError(declarativeAgentPath, e, "PluginManifestUtils"));
    }
    const actions = declarativeAgentManifest.actions ?? [];
    const pluginPaths = actions
      .filter((action) => !!action.file)
      .map((action) => path.resolve(path.dirname(declarativeAgentPath), action.file));
    return ok(pluginPaths);
  }

  /**
   * Detect whether the app is an API plugin project by checking if the referenced declarative
   * agent manifest declares any actions.
   */
  public async isApiPluginFromDeclarativeAgent(
    manifest: TeamsManifestLatest,
    manifestPath: string
  ): Promise<boolean> {
    const pluginPathsRes = await this.getPluginManifestPathsFromDeclarativeAgent(
      manifest,
      manifestPath
    );
    return pluginPathsRes.isOk() && pluginPathsRes.value.length > 0;
  }

  public logValidationErrors(
    validationRes: PluginManifestValidationResult,
    platform: Platform
  ): string | Array<{ content: string; color: Colors }> {
    const validationErrors = validationRes.validationResult;
    const filePath = validationRes.filePath;
    if (validationErrors.length === 0) {
      return "";
    }

    if (platform !== Platform.CLI) {
      const errors = validationErrors
        .map((error: string) => {
          return `${SummaryConstant.Failed} ${error}`;
        })
        .join(EOL);
      return (
        getLocalizedString("driver.teamsApp.summary.validatePluginManifest.checkPath", filePath) +
        EOL +
        errors
      );
    } else {
      const outputMessage = [];
      outputMessage.push({
        content:
          getDefaultString("driver.teamsApp.summary.validatePluginManifest.checkPath", filePath) +
          "\n",
        color: Colors.BRIGHT_WHITE,
      });
      validationErrors.map((error: string) => {
        outputMessage.push({ content: `${SummaryConstant.Failed} `, color: Colors.BRIGHT_RED });
        outputMessage.push({
          content: `${error}\n`,
          color: Colors.BRIGHT_WHITE,
        });
      });

      return outputMessage;
    }
  }

  public async getDefaultNextAvailableApiSpecPath(
    apiSpecPath: string,
    apiSpecFolder: string,
    isKiotaIntegration = false
  ) {
    let isYaml = false;
    try {
      isYaml = !(await isJsonSpecFile(apiSpecPath));
    } catch (e) {}

    let openApiSpecFileName =
      isYaml || featureFlagManager.getBooleanValue(FeatureFlags.KiotaNPMIntegration)
        ? DefaultApiSpecYamlFileName
        : DefaultApiSpecJsonFileName;
    // Check if the default file name already exists
    if (!(await fs.pathExists(path.join(apiSpecFolder, openApiSpecFileName)))) {
      return path.join(apiSpecFolder, openApiSpecFileName);
    }

    const openApiSpecFileNamePrefix = openApiSpecFileName.split(".")[0];
    const openApiSpecFileType = openApiSpecFileName.split(".")[1];
    let apiSpecFileNameSuffix = 1;
    openApiSpecFileName = this.getApiSpecFileName(
      openApiSpecFileNamePrefix,
      openApiSpecFileType,
      apiSpecFileNameSuffix,
      isKiotaIntegration
    );

    while (await fs.pathExists(path.join(apiSpecFolder, openApiSpecFileName))) {
      apiSpecFileNameSuffix++;
      openApiSpecFileName = this.getApiSpecFileName(
        openApiSpecFileNamePrefix,
        openApiSpecFileType,
        apiSpecFileNameSuffix,
        isKiotaIntegration
      );
    }
    const openApiSpecFilePath = path.join(apiSpecFolder, openApiSpecFileName);

    return openApiSpecFilePath;
  }

  getApiSpecFileName(
    openApiSpecFileNamePrefix: string,
    openApiSpecFileType: string,
    apiSpecFileNameSuffix: number,
    isKiotaIntegration: boolean
  ): string {
    let openApiSpecFileName;
    if (isKiotaIntegration) {
      const apiSpecNameSplit = openApiSpecFileNamePrefix.split("-");
      openApiSpecFileName = `${apiSpecNameSplit[0]}_${apiSpecFileNameSuffix}-${apiSpecNameSplit[1]}.${openApiSpecFileType}`;
    } else {
      openApiSpecFileName = `${openApiSpecFileNamePrefix}_${apiSpecFileNameSuffix}.${openApiSpecFileType}`;
    }
    return openApiSpecFileName;
  }

  async getApiSpecFilePathFromPlugin(
    plugin: PluginManifestSchema,
    pluginPath: string
  ): Promise<string[]> {
    const runtimes = plugin.runtimes;
    const files: string[] = [];
    if (!runtimes) {
      return files;
    }
    for (const runtime of runtimes) {
      if (runtime.type === "OpenApi" && runtime.spec?.url) {
        const specFile = path.resolve(path.dirname(pluginPath), runtime.spec.url);
        if (await fs.pathExists(specFile)) {
          files.push(specFile);
        }
      }
    }

    return files;
  }

  /**
   * Validate LocalPlugin runtimes that use MCP servers.
   * Validates four requirements:
   * 1. local_endpoint must start with mcp://
   * 2. run_for_functions entries must match tool names in MCP server
   * 3. Function names must appear in run_for_functions
   * 4. Functions cannot redefine parameters—must match MCP server
   * @param manifest The plugin manifest to validate
   * @param _context Driver context for logging
   * @returns Array of validation error strings
   */
  public async validateLocalMCPPluginRuntimes(manifest: PluginManifestSchema): Promise<string[]> {
    const errors: string[] = [];

    if (!manifest.runtimes) {
      return errors;
    }

    const localPluginRuntimes = manifest.runtimes.filter(
      (rt): rt is RuntimeObjectLocalplugin => rt.type === "LocalPlugin"
    );

    if (localPluginRuntimes.length === 0) {
      return errors;
    }

    let mcpServers: ODRServer[] = [];
    if (process.platform === "win32") {
      try {
        mcpServers = await ODRProvider.listServers();
      } catch (error) {
        return errors;
      }
    }

    const mcpServerMap = new Map(mcpServers.map((s) => [s.identifier, s]));

    for (const runtime of localPluginRuntimes) {
      const runtimeIdx = manifest.runtimes.indexOf(runtime);
      const localEndpoint = runtime.spec.local_endpoint;

      // 1. Only check the ones with endpoint starting with mcp://
      if (!localEndpoint.startsWith(LocalMcpPrefix)) {
        continue;
      }

      const mcpIdentifier = localEndpoint.replace(new RegExp(`^${LocalMcpPrefix}`), "");
      const mcpServer = mcpServerMap.get(mcpIdentifier);

      if (!mcpServer) {
        errors.push(
          `/runtimes/${runtimeIdx}/spec/local_endpoint: ` +
            `MCP server "${mcpIdentifier}" not found in ODR provider.`
        );
        continue;
      }

      const mcpToolNames = new Set(mcpServer.tools.map((t) => t.name));

      // 2. run_for_functions entries must match tool names in MCP server
      runtime.run_for_functions?.forEach((funcName, funcIdx) => {
        if (!mcpToolNames.has(funcName)) {
          const availableTools = Array.from(mcpToolNames).join(", ");
          errors.push(
            `/runtimes/${runtimeIdx}/run_for_functions[${funcIdx}]: ` +
              `Tool "${funcName}" not found in MCP server "${mcpServer.display_name}". ` +
              `Available tools: ${availableTools}`
          );
        }
      });

      // 3. Function names must appear in run_for_functions
      const runForFunctionsSet = new Set(runtime.run_for_functions || []);
      manifest.functions?.forEach((func, funcIdx) => {
        if (mcpToolNames.has(func.name) && !runForFunctionsSet.has(func.name)) {
          errors.push(
            `/functions[${funcIdx}]: ` +
              `Function "${func.name}" exists in MCP server but is not listed in /runtimes/${runtimeIdx}/run_for_functions.`
          );
        }
      });

      // 4. Functions cannot redefine parameters—must match MCP server
      runtime.run_for_functions?.forEach((funcName) => {
        const manifestFunc = manifest.functions?.find((f) => f.name === funcName);
        const mcpTool = mcpServer.tools.find((t) => t.name === funcName);

        if (manifestFunc && mcpTool) {
          const paramErrors = this.validateFunctionParameters(manifestFunc, mcpTool, funcName);
          errors.push(...paramErrors);
        }
      });
    }

    return errors;
  }

  /**
   * Validate that function parameters match exactly between manifest and MCP tool.
   * @param manifestFunc The function definition from the manifest
   * @param mcpTool The tool definition from MCP server
   * @param funcName The function name for error messages
   * @returns Array of validation error strings
   */
  private validateFunctionParameters(
    manifestFunc: FunctionObject,
    mcpTool: ODRTool,
    funcName: string
  ): string[] {
    const errors: string[] = [];
    const manifestParams = manifestFunc.parameters?.properties || {};
    const mcpParams = mcpTool.inputSchema?.properties || {};
    const manifestRequired = manifestFunc.parameters?.required || [];
    const mcpRequired = mcpTool.inputSchema?.required || [];

    const manifestParamNames = new Set(Object.keys(manifestParams));
    const mcpParamNames = new Set(Object.keys(mcpParams));

    // Extra parameters in manifest not in MCP
    manifestParamNames.forEach((prop) => {
      if (!mcpParamNames.has(prop)) {
        errors.push(
          `/functions["${funcName}"]/parameters/properties/${prop}: ` +
            `Parameter not defined in MCP server. Functions cannot redefine parameters.`
        );
      }
    });

    // Missing parameters from MCP
    mcpParamNames.forEach((prop) => {
      if (!manifestParamNames.has(prop)) {
        errors.push(
          `/functions["${funcName}"]/parameters/properties/${prop}: ` +
            `Missing parameter defined in MCP server. All MCP parameters must be included.`
        );
      }
    });

    // Validate required array matches
    const manifestRequiredSet = new Set(manifestRequired);
    const mcpRequiredSet = new Set(mcpRequired);

    const extraRequired = manifestRequired.filter((r) => !mcpRequiredSet.has(r));
    const missingRequired = (mcpRequired as string[]).filter((r) => !manifestRequiredSet.has(r));

    if (extraRequired.length > 0) {
      errors.push(
        `/functions["${funcName}"]/parameters/required: ` +
          `Extra required parameters not in MCP server: ${extraRequired.join(", ")}`
      );
    }

    if (missingRequired.length > 0) {
      errors.push(
        `/functions["${funcName}"]/parameters/required: ` +
          `Missing required parameters from MCP server: ${missingRequired.join(", ")}`
      );
    }

    // Validate parameter types and properties for matching parameters
    manifestParamNames.forEach((prop) => {
      if (mcpParamNames.has(prop)) {
        const manifestParam = manifestParams[prop];
        const mcpParam = mcpParams[prop];

        // Type check
        if (manifestParam.type !== mcpParam.type) {
          errors.push(
            `/functions["${funcName}"]/parameters/properties/${prop}/type: ` +
              `Type mismatch. Manifest has "${String(manifestParam.type)}", ` +
              `MCP server has "${String(mcpParam.type)}".`
          );
        }

        // Enum check
        if (manifestParam.enum || mcpParam.enum) {
          const manifestEnumSorted = manifestParam.enum
            ? [...manifestParam.enum].sort()
            : undefined;
          const mcpEnumSorted = mcpParam.enum ? [...mcpParam.enum].sort() : undefined;

          if (JSON.stringify(manifestEnumSorted) !== JSON.stringify(mcpEnumSorted)) {
            errors.push(
              `/functions["${funcName}"]/parameters/properties/${prop}/enum: ` +
                `Enum mismatch. Manifest: ${JSON.stringify(manifestParam.enum)}, ` +
                `MCP: ${JSON.stringify(mcpParam.enum)}.`
            );
          }
        }
      }
    });

    return errors;
  }
}

export const pluginManifestUtils = new PluginManifestUtils();
