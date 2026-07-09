// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { hooks } from "@feathersjs/hooks";
import {
  AppManifestUtils,
  err,
  FxError,
  IComposeExtension,
  IMessagingExtensionCommand,
  InputsWithProjectPath,
  ManifestCapability,
  ok,
  Result,
  TeamsAppManifest,
  TeamsManifest,
} from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import { cloneDeep } from "lodash";
import os from "os";
import * as path from "path";
import "reflect-metadata";
import stripBom from "strip-bom";
import { v4 } from "uuid";
import isUUID from "validator/lib/isUUID";
import { ErrorContextMW } from "../../../../common/globalVars";
import { getCapabilities as checkManifestCapabilities } from "../../../../common/projectTypeChecker";
import {
  FileNotFoundError,
  JSONSyntaxError,
  MissingEnvironmentVariablesError,
  ReadFileError,
} from "../../../../error/common";
import {
  BotCapabilityOptions,
  TabCapabilityOptions,
} from "../../../../question/scaffold/vsc/CapabilityOptions";
import { BotScenario } from "../../../constants";
import { convertManifestTemplateToV2, convertManifestTemplateToV3 } from "../../../migrate";
import { expandEnvironmentVariable, getEnvironmentVariables } from "../../../utils/common";
import { expandVariableWithFunction, ManifestType } from "../../../utils/envFunctionUtils";
import { DriverContext } from "../../interface/commonArgs";
import {
  COMPOSE_EXTENSIONS_TPL_EXISTING_APP,
  COMPOSE_EXTENSIONS_TPL_M365_V3,
  COMPOSE_EXTENSIONS_TPL_V3,
  Constants,
  getBotsTplBasedOnVersion,
  getBotsTplExistingAppBasedOnVersion,
  getBotsTplForCommandAndResponseBasedOnVersion,
  getBotsTplForNotificationBasedOnVersion,
  getConfigurableTabsTplBasedOnVersion,
  getConfigurableTabsTplExistingAppBasedOnVersion,
  STATIC_TABS_MAX_ITEMS,
  STATIC_TABS_TPL_EXISTING_APP,
  STATIC_TABS_TPL_V3,
  WEB_APPLICATION_INFO_V3,
} from "../constants";
import { AppStudioError } from "../errors";
import { AppStudioResultFactory } from "../results";
import { getResolvedManifest } from "./utils";

export const SharePointAppId = "00000003-0000-0ff1-ce00-000000000000";

export interface ManifestCommonProperties {
  /**
   * Capabilities, e.g. "staticTab" | "configurableTab" | "MessageExtension" | "WebApplicationInfo" | "plugin" | "copilotGpt"
   */
  capabilities: string[];
  /**
   * Teams app id
   */
  id: string;
  /**
   * Teams app version, e.g.1.0.0
   */
  version: string;
  /**
   * manifest version, e.g. 1.16
   */
  manifestVersion: string;
  /**
   * Whether it's an API ME
   */
  isApiME: boolean;
  /**
   * Whether it's SPFx Teams app
   */
  isSPFx: boolean;
  /**
   * Whether it's an API ME with AAD auth
   */
  isApiMeAAD: boolean;
}

export class ManifestUtils {
  private isPathInOrUnderDirectory(baseDir: string, targetPath: string): boolean {
    const resolvedBase = path.resolve(baseDir);
    const resolvedTarget = path.resolve(targetPath);
    const normalizedBase = process.platform === "win32" ? resolvedBase.toLowerCase() : resolvedBase;
    const normalizedTarget =
      process.platform === "win32" ? resolvedTarget.toLowerCase() : resolvedTarget;
    return normalizedTarget.startsWith(`${normalizedBase}${path.sep}`);
  }

  async readAppManifest(projectPath: string): Promise<Result<TeamsAppManifest, FxError>> {
    const filePath = this.getTeamsAppManifestPath(projectPath);
    return await this._readAppManifest(filePath);
  }

  readAppManifestSync(projectPath: string): Result<TeamsAppManifest, FxError> {
    const filePath = this.getTeamsAppManifestPath(projectPath);
    if (!fs.existsSync(filePath)) {
      return err(new FileNotFoundError("teamsApp", filePath));
    }
    // Be compatible with UTF8-BOM encoding
    // Avoid Unexpected token error at JSON.parse()
    let content;
    try {
      content = fs.readFileSync(filePath, { encoding: "utf-8" });
    } catch (e) {
      return err(new ReadFileError(e, "ManifestUtils"));
    }
    content = stripBom(content);
    const contentV3 = convertManifestTemplateToV3(content);
    try {
      const manifest = JSON.parse(contentV3) as TeamsAppManifest;
      return ok(manifest);
    } catch (e) {
      return err(new JSONSyntaxError(filePath, e, "ManifestUtils"));
    }
  }

  @hooks([ErrorContextMW({ component: "ManifestUtils" })])
  async _readAppManifest(manifestTemplatePath: string): Promise<Result<TeamsAppManifest, FxError>> {
    if (!(await fs.pathExists(manifestTemplatePath))) {
      return err(new FileNotFoundError("teamsApp", manifestTemplatePath));
    }
    // Be compatible with UTF8-BOM encoding
    // Avoid Unexpected token error at JSON.parse()
    let content = await fs.readFile(manifestTemplatePath, { encoding: "utf-8" });
    content = stripBom(content);
    const contentV3 = convertManifestTemplateToV3(content);
    try {
      const manifest = JSON.parse(contentV3) as TeamsAppManifest;
      return ok(manifest);
    } catch (e) {
      return err(new JSONSyntaxError(manifestTemplatePath, e, "ManifestUtils"));
    }
  }

  async _writeAppManifest(
    appManifest: TeamsAppManifest,
    manifestTemplatePath: string
  ): Promise<Result<undefined, FxError>> {
    const content = JSON.stringify(appManifest, undefined, 4);
    const contentV2 = convertManifestTemplateToV2(content);
    await fs.writeFile(manifestTemplatePath, contentV2);
    return ok(undefined);
  }

  getTeamsAppManifestPath(projectPath: string): string {
    // Samples from https://github.com/OfficeDev/Microsoft-Teams-Samples have the manifest in appManifest folder
    const filePath = path.join(projectPath, "appManifest", "manifest.json");
    if (fs.existsSync(filePath)) {
      return filePath;
    }

    // Samples from https://github.com/OfficeDev/Office-Add-in-samples/tree/main/Samples/outlook-set-signature have the manifest in root folder
    const officeAddinManifestPath = path.join(projectPath, "manifest.json");
    if (fs.existsSync(officeAddinManifestPath)) {
      return officeAddinManifestPath;
    }

    return path.join(projectPath, "appPackage", "manifest.json");
  }

  async addCapabilities(
    inputs: InputsWithProjectPath,
    capabilities: ManifestCapability[],
    isM365 = false
  ): Promise<Result<undefined, FxError>> {
    const appManifestRes = await this._readAppManifest(inputs["addManifestPath"]);
    if (appManifestRes.isErr()) return err(appManifestRes.error);
    const appManifest = appManifestRes.value;
    const manifestVersion = appManifest.manifestVersion;
    for (const capability of capabilities) {
      const exceedLimit = this._capabilityExceedLimit(appManifest, capability.name);
      if (exceedLimit) {
        return err(
          AppStudioResultFactory.UserError(
            AppStudioError.CapabilityExceedLimitError.name,
            AppStudioError.CapabilityExceedLimitError.message(capability.name)
          )
        );
      }
      let staticTabIndex = appManifest.staticTabs?.length ?? 0;
      switch (capability.name) {
        case "staticTab":
          appManifest.staticTabs = appManifest.staticTabs || [];
          if (capability.snippet) {
            appManifest.staticTabs.push(capability.snippet);
          } else {
            if (capability.existingApp) {
              const template = cloneDeep(STATIC_TABS_TPL_EXISTING_APP[0]);

              template.entityId = "index" + staticTabIndex;
              appManifest.staticTabs.push(template);
            } else {
              const tabManifest =
                inputs.features === TabCapabilityOptions.dashboardTab().id
                  ? STATIC_TABS_TPL_V3[1]
                  : STATIC_TABS_TPL_V3[0];
              const template = cloneDeep(tabManifest);

              template.entityId = "index" + staticTabIndex;
              appManifest.staticTabs.push(template);
            }
            staticTabIndex++;
          }
          break;
        case "configurableTab":
          appManifest.configurableTabs = appManifest.configurableTabs || [];
          if (capability.snippet) {
            appManifest.configurableTabs.push(capability.snippet);
          } else {
            if (capability.existingApp) {
              appManifest.configurableTabs = appManifest.configurableTabs.concat(
                getConfigurableTabsTplExistingAppBasedOnVersion(manifestVersion)
              );
            } else {
              appManifest.configurableTabs = appManifest.configurableTabs.concat(
                getConfigurableTabsTplBasedOnVersion(manifestVersion)
              );
            }
          }
          break;
        case "Bot":
          appManifest.bots = appManifest.bots || [];
          if (capability.snippet) {
            appManifest.bots.push(capability.snippet);
          } else {
            if (capability.existingApp) {
              appManifest.bots = appManifest.bots.concat(
                getBotsTplExistingAppBasedOnVersion(manifestVersion)
              );
            } else {
              // import QuestionNames introduces dependency cycle and breaks the whole program
              // inputs[QuestionNames.Features]
              if (inputs.features) {
                const feature = inputs.features;
                if (
                  feature === BotCapabilityOptions.commandBot().id ||
                  feature == BotCapabilityOptions.workflowBot().id
                ) {
                  // command and response bot or workflow bot
                  appManifest.bots = appManifest.bots.concat(
                    getBotsTplForCommandAndResponseBasedOnVersion(manifestVersion)
                  );
                } else if (feature === BotCapabilityOptions.notificationBot().id) {
                  // notification
                  appManifest.bots = appManifest.bots.concat(
                    getBotsTplForNotificationBasedOnVersion(manifestVersion)
                  );
                } else {
                  // legacy bot
                  appManifest.bots = appManifest.bots.concat(
                    getBotsTplBasedOnVersion(manifestVersion)
                  );
                }
              } else if (inputs.scenarios) {
                const scenariosRaw = inputs.scenarios;
                const scenarios = Array.isArray(scenariosRaw) ? scenariosRaw : [];
                if (
                  scenarios.includes(BotScenario.CommandAndResponseBot) ||
                  scenarios.includes(BotScenario.WorkflowBot)
                ) {
                  // command and response bot or workflow bot
                  appManifest.bots = appManifest.bots.concat(
                    getBotsTplForCommandAndResponseBasedOnVersion(manifestVersion)
                  );
                } else if (scenarios.includes(BotScenario.NotificationBot)) {
                  // notification
                  appManifest.bots = appManifest.bots.concat(
                    getBotsTplForNotificationBasedOnVersion(manifestVersion)
                  );
                } else {
                  // legacy bot
                  appManifest.bots = appManifest.bots.concat(
                    getBotsTplBasedOnVersion(manifestVersion)
                  );
                }
              } else {
                appManifest.bots = appManifest.bots.concat(
                  getBotsTplBasedOnVersion(manifestVersion)
                );
              }
            }
          }
          break;
        case "MessageExtension":
          appManifest.composeExtensions = appManifest.composeExtensions || [];
          if (capability.snippet) {
            appManifest.composeExtensions.push(capability.snippet);
          } else {
            if (capability.existingApp) {
              appManifest.composeExtensions = appManifest.composeExtensions.concat(
                COMPOSE_EXTENSIONS_TPL_EXISTING_APP
              );
            } else {
              appManifest.composeExtensions = appManifest.composeExtensions.concat(
                isM365 ? COMPOSE_EXTENSIONS_TPL_M365_V3 : COMPOSE_EXTENSIONS_TPL_V3
              );
            }
          }
          break;
        case "WebApplicationInfo":
          if (capability.snippet) {
            appManifest.webApplicationInfo = capability.snippet;
          } else {
            appManifest.webApplicationInfo = WEB_APPLICATION_INFO_V3;
          }
          break;
      }
    }
    if (inputs.validDomain && !appManifest.validDomains?.includes(inputs.validDomain)) {
      appManifest.validDomains?.push(inputs.validDomain);
    }

    const content = JSON.stringify(appManifest, undefined, 4);
    const contentV2 = convertManifestTemplateToV2(content);
    await fs.writeFile(inputs["addManifestPath"], contentV2);

    return ok(undefined);
  }

  _capabilityExceedLimit(
    manifest: TeamsAppManifest,
    capability: "staticTab" | "configurableTab" | "Bot" | "MessageExtension" | "WebApplicationInfo"
  ): boolean {
    switch (capability) {
      case "staticTab":
        return (
          manifest.staticTabs !== undefined && manifest.staticTabs.length >= STATIC_TABS_MAX_ITEMS
        );
      case "configurableTab":
        return manifest.configurableTabs !== undefined && manifest.configurableTabs.length >= 1;
      case "Bot":
        return manifest.bots !== undefined && manifest.bots.length >= 1;
      case "MessageExtension":
        return manifest.composeExtensions !== undefined && manifest.composeExtensions.length >= 1;
      case "WebApplicationInfo":
        return false;
      default:
        return false;
    }
  }
  public getCapabilities(template: TeamsAppManifest): string[] {
    return checkManifestCapabilities(template);
  }

  /**
   * Get command id from composeExtensions
   * @param manifest
   */
  public getOperationIds(manifest: TeamsAppManifest): string[] {
    const ids: string[] = [];
    manifest.composeExtensions?.map((extension: IComposeExtension) => {
      extension.commands?.map((command: IMessagingExtensionCommand) => {
        ids.push(command.id);
      });
    });
    return ids;
  }

  public async getPluginFilePath(
    manifest: TeamsAppManifest,
    manifestPath: string
  ): Promise<Result<string, FxError>> {
    const pluginFile = manifest.copilotExtensions
      ? manifest.copilotExtensions.plugins?.[0]?.file
      : manifest.copilotAgents?.plugins?.[0]?.file;
    if (pluginFile) {
      const plugin = path.resolve(path.dirname(manifestPath), pluginFile);
      const doesFileExist = await fs.pathExists(plugin);
      if (doesFileExist) {
        return ok(plugin);
      } else {
        return err(new FileNotFoundError("ManifestUtils", pluginFile));
      }
    } else {
      return err(
        AppStudioResultFactory.UserError(
          AppStudioError.TeamsAppRequiredPropertyMissingError.name,
          AppStudioError.TeamsAppRequiredPropertyMissingError.message("plugins", manifestPath)
        )
      );
    }
  }

  async getManifestV3(
    manifestTemplatePath: string,
    context: DriverContext,
    generateIdIfNotResolved = true
  ): Promise<Result<TeamsManifest, FxError>> {
    let manifest: TeamsManifest;
    try {
      if (!(await fs.pathExists(manifestTemplatePath))) {
        return err(new FileNotFoundError("ManifestUtils", manifestTemplatePath));
      }
      manifest = await AppManifestUtils.readTeamsManifest(manifestTemplatePath);
    } catch (error) {
      return err(new JSONSyntaxError(manifestTemplatePath, error, "ManifestUtils"));
    }

    let teamsAppId = "";
    if (generateIdIfNotResolved) {
      // Corner Case: Avoid MissingEnvironmentVariablesError for manifest.id
      teamsAppId = expandEnvironmentVariable(manifest.id);
      manifest.id = "";
    }

    const manifestTemplateString = JSON.stringify(manifest);

    // Add environment variable keys to telemetry
    const resolvedManifestRes = await getResolvedManifest(
      manifestTemplateString,
      manifestTemplatePath,
      ManifestType.TeamsManifest,
      context
    );

    if (resolvedManifestRes.isErr()) {
      return err(resolvedManifestRes.error);
    }
    const resolvedManifestString = resolvedManifestRes.value;
    manifest = JSON.parse(resolvedManifestString);

    if (generateIdIfNotResolved) {
      if (!isUUID(teamsAppId)) {
        manifest.id = v4();
      } else {
        manifest.id = teamsAppId;
      }
    }

    return ok(manifest);
  }
  extractManifestFromArchivedFile(archivedFile: Buffer): Result<TeamsAppManifest, FxError> {
    const zipEntries = new AdmZip(archivedFile).getEntries();
    const manifestFile = zipEntries.find((x) => x.entryName === Constants.MANIFEST_FILE);
    if (!manifestFile) {
      return err(
        AppStudioResultFactory.UserError(
          AppStudioError.FileNotFoundError.name,
          AppStudioError.FileNotFoundError.message(Constants.MANIFEST_FILE)
        )
      );
    }
    const manifestString = manifestFile.getData().toString();
    const manifest = JSON.parse(manifestString) as TeamsAppManifest;
    return ok(manifest);
  }

  /**
   * trim the short name in manifest to make sure it is no more than 25 length
   */
  async trimManifestShortName(
    projectPath: string,
    maxLength = 25
  ): Promise<Result<undefined, FxError>> {
    const manifestPath = this.getTeamsAppManifestPath(projectPath);
    if (this.isPathInOrUnderDirectory(os.tmpdir(), manifestPath)) {
      return ok(undefined);
    }
    if (fs.pathExistsSync(manifestPath)) {
      const manifest = (await fs.readJson(manifestPath)) as TeamsAppManifest;
      const shortName = manifest.name.short;
      // Extract placeholder strings like ${{xxx}}
      const placeholderRegex = /\$\{\{[^}]+\}\}/g;
      const placeholders = shortName.match(placeholderRegex) || [];
      const trimmedName = shortName.replace(placeholderRegex, "");

      if (trimmedName.length <= maxLength) return ok(undefined);
      let newShortName = trimmedName.replace(/\s/g, "").slice(0, maxLength);
      // Restore all placeholders at the end
      if (placeholders.length > 0) {
        newShortName += placeholders.join("");
      }
      manifest.name.short = newShortName;
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    }
    return ok(undefined);
  }

  async resolveLocFile(
    locFilePath: string,
    context?: DriverContext
  ): Promise<Result<string, FxError>> {
    if (!(await fs.pathExists(locFilePath))) {
      return err(new FileNotFoundError("teamsApp", locFilePath));
    }

    const locFileString = await fs.readFile(locFilePath, "utf8");
    let resolvedLocFileString = locFileString;

    if (context) {
      const processedFunctionRes = await expandVariableWithFunction(
        locFileString,
        context,
        undefined,
        true,
        ManifestType.TeamsManifest,
        locFilePath
      );
      if (processedFunctionRes.isErr()) {
        return err(processedFunctionRes.error);
      }
      resolvedLocFileString = processedFunctionRes.value;
    }

    resolvedLocFileString = expandEnvironmentVariable(resolvedLocFileString);
    const unresolvedEnvVariables = getEnvironmentVariables(resolvedLocFileString);
    if (unresolvedEnvVariables && unresolvedEnvVariables.length > 0) {
      return err(
        new MissingEnvironmentVariablesError(
          "teamsApp",
          unresolvedEnvVariables.join(","),
          locFilePath
        )
      );
    }

    return ok(resolvedLocFileString);
  }

  /**
   * Parse the manifest and get properties
   * @param manifest
   */
  parseCommonProperties(manifest: TeamsAppManifest): ManifestCommonProperties {
    const capabilities: string[] = [];
    if (manifest.staticTabs && manifest.staticTabs.length > 0) {
      capabilities.push("staticTab");
    }
    if (manifest.configurableTabs && manifest.configurableTabs.length > 0) {
      capabilities.push("configurableTab");
    }
    if (manifest.bots && manifest.bots.length > 0) {
      capabilities.push("Bot");
    }
    if (manifest.composeExtensions && manifest.composeExtensions.length > 0) {
      capabilities.push("MessageExtension");
    }

    const properties: ManifestCommonProperties = {
      id: manifest.id,
      version: manifest.version,
      capabilities: capabilities,
      manifestVersion: manifest.manifestVersion,
      isApiME: false,
      isSPFx: false,
      isApiMeAAD: false,
    };

    // If it's copilot plugin app
    if (
      manifest.composeExtensions &&
      manifest.composeExtensions.length > 0 &&
      manifest.composeExtensions[0].composeExtensionType == "apiBased"
    ) {
      properties.isApiME = true;
    }

    // If it's SPFx app
    if (
      (manifest as any).webApplicationInfo &&
      (manifest as any).webApplicationInfo.id &&
      (manifest as any).webApplicationInfo.id == SharePointAppId
    ) {
      properties.isSPFx = true;
    }

    // If it's API ME with AAD auth
    if (
      manifest.composeExtensions &&
      manifest.composeExtensions.length > 0 &&
      manifest.composeExtensions[0].composeExtensionType == "apiBased" &&
      manifest.composeExtensions[0].authorization?.authType == "microsoftEntra"
    ) {
      properties.isApiMeAAD = true;
    }

    if (manifest.copilotExtensions?.plugins) {
      const apiPlugins = manifest.copilotExtensions?.plugins;
      if (apiPlugins && apiPlugins.length > 0 && apiPlugins[0].file) capabilities.push("plugin");
    }

    if (manifest.copilotExtensions?.declarativeCopilots) {
      const copilotGpts = manifest.copilotExtensions?.declarativeCopilots;
      if (copilotGpts && copilotGpts.length > 0) capabilities.push("copilotGpt");
    }

    if (manifest.copilotAgents?.plugins) {
      const apiPlugins = manifest.copilotAgents?.plugins;
      if (
        apiPlugins &&
        apiPlugins.length > 0 &&
        apiPlugins[0].file &&
        !capabilities.includes("plugin")
      )
        capabilities.push("plugin");
    }

    if (manifest.copilotAgents?.declarativeAgents) {
      const copilotGpts = manifest.copilotAgents?.declarativeAgents;
      if (copilotGpts && copilotGpts.length > 0 && !capabilities.includes("copilotGpt"))
        capabilities.push("copilotGpt");
    }

    return properties;
  }

  /**
   * Parse the manifest and get telemetry propreties e.g. appId, capabilities etc.
   * @param manifest
   * @returns Telemetry properties
   */
  parseCommonTelemetryProperties(manifest: TeamsAppManifest): {
    [p: string]: string;
  } {
    const properties = this.parseCommonProperties(manifest);

    const telemetryProperties: { [p: string]: string } = {};
    const propertiesMap = new Map<string, any>(Object.entries(properties));
    propertiesMap.forEach((value, key) => {
      if (Array.isArray(value)) {
        telemetryProperties[key] = value.join(";");
      } else {
        telemetryProperties[key] = value;
      }
    });

    return telemetryProperties;
  }
}

export const manifestUtils = new ManifestUtils();
