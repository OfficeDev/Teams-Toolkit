// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  AppPackageFolderName,
  Context,
  DefaultApiSpecFolderName,
  DefaultPluginManifestFileName,
  err,
  FxError,
  GeneratorResult,
  Inputs,
  ok,
  PluginManifestSchema,
  Result,
  SystemError,
  UserError,
  Warning,
} from "@microsoft/teamsfx-api";
import axios, { isAxiosError } from "axios";
import fs from "fs-extra";
import path from "path";
import {
  GCScopes,
  getResourceServiceEndpoint,
  ResourceServiceType,
} from "../../../common/constants";
import { featureFlagManager, FeatureFlags } from "../../../common/featureFlags";
import { createContext } from "../../../common/globalVars";
import { getDefaultString, getLocalizedString } from "../../../common/localizeUtils";
import { sendTelemetryErrorEvent } from "../../../common/telemetry";
import { assembleError } from "../../../error";
import { QuestionNames } from "../../../question/questionNames";
import { copilotGptManifestUtils } from "../../driver/teamsApp/utils/CopilotGptManifestUtils";
import { pluginManifestUtils } from "../../driver/teamsApp/utils/PluginManifestUtils";
import { normalizePath } from "../../driver/teamsApp/utils/utils";
import { getEnvironmentVariables } from "../../utils/common";
import {
  MCP_OAUTH_AUTHORIZATION_URL_PLACEHOLDER,
  MCP_OAUTH_TOKEN_URL_PLACEHOLDER,
  deriveMCPManifestOAuth,
  injectMCPAuthActionToYml,
  persistMCPAuthCredentialEnvVars,
  resolveMCPAuthEndpoints,
} from "../../utils/mcpAuthScaffolder";
import * as mcpToolFetcher from "../../utils/mcpToolFetcher";
import { pathUtils } from "../../utils/pathUtils";
import * as generatorUtils from "../utils";
import * as oneDriveSharePointHandler from "./oneDriveSharePointHandler";
import { ItemMetadata } from "./oneDriveSharePointHandler";

// Non-translatable CLI command template used in warning messages
const mcpAddActionHint =
  "atk add action --api-plugin-type mcp --mcp-da-server-url <server-url> --mcp-tools-file-path <path-to-tools-json> --interactive false";

const logMessageKeys = {
  failValidateOneDriveSharePointItem:
    "core.createProjectQuestion.log.fail.validateOneDriveSharePointItem",
  invalidOneDriveSharePointURL: "core.createProjectQuestion.log.fail.invalidOneDriveSharePointURL",
};

/**
 * Derives a server entry name for an MCP server from its URL. Used by both the
 * "DA with MCP" scaffolding (to render `.vscode/mcp.json.tpl`) and the
 * "Add Action with MCP" flow (to append a new entry into `.vscode/mcp.json`).
 *
 * Strips non-alphanumeric characters from the host and truncates to 10 chars.
 * Falls back to `"mcpServer"` when the URL is missing or invalid.
 */
export function deriveMCPServerNameFromUrl(mcpServerUrl: string | undefined): string {
  const fallback = "mcpServer";
  if (!mcpServerUrl) {
    return fallback;
  }
  try {
    const host = new URL(mcpServerUrl).host.replace(/[^a-zA-Z0-9]/g, "").substring(0, 10);
    return host || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Derives the env-var name that holds the `oauth/register` configurationId for
 * the given MCP server URL. Format: `MCP_DA_AUTH_ID_<UPPERCASED>` where
 * `<UPPERCASED>` is `deriveMCPServerNameFromUrl(url).toUpperCase()`. Reused
 * across multiple actions that target the same MCP server so they share one
 * registration. Used by the Dynamic Tool Discovery (DT) DA-with-MCP flow.
 */
export function deriveMCPRegistrationIdFromUrl(mcpServerUrl: string | undefined): string {
  return `MCP_DA_AUTH_ID_${deriveMCPServerNameFromUrl(mcpServerUrl).toUpperCase()}`;
}

/**
 * Derives the `ai-plugin.json` `namespace` (and the matching `oauth/register`
 * action `name`) for an MCP-backed action from the MCP server URL. Format:
 * `deriveMCPServerNameFromUrl(url).toLowerCase()` — a schema-valid
 * (alphanumeric, lowercase) token unique per MCP server host. Shared by both
 * the create flow and the add-action flow so actions targeting different MCP
 * servers get distinct namespaces while actions sharing one server stay aligned
 * with the single registration they share.
 */
export function deriveMCPNamespaceFromUrl(mcpServerUrl: string | undefined): string {
  return deriveMCPServerNameFromUrl(mcpServerUrl).toLowerCase();
}

/**
 * Creates a brand-new empty action plugin manifest (`ai-plugin.json`) under the
 * project's `appPackage` folder and registers it as a new action in the
 * declarative agent manifest.
 *
 * Used by the "Add MCP Action" flow when the user opts to create a new
 * action manifest rather than reuse an existing one.
 *
 * @param projectPath Absolute project root.
 * @param desiredFileName File name (no path) for the new plugin manifest, e.g. "ai-plugin.json".
 *                       If a file with this name already exists, an incrementing suffix is added.
 * @param declarativeAgentManifestPath Absolute path to the declarative agent manifest file
 *                       (e.g. `appPackage/declarativeAgent.json`).
 * @returns The absolute path to the newly-created plugin manifest and the action id used to register it.
 */
export async function createNewActionPluginManifest(
  projectPath: string,
  desiredFileName: string,
  declarativeAgentManifestPath: string
): Promise<Result<{ pluginManifestPath: string; actionId: string }, FxError>> {
  const appPackageFolder = path.join(projectPath, AppPackageFolderName);
  const fileName = desiredFileName?.trim() || DefaultPluginManifestFileName;

  const destinationPluginManifestPath =
    await copilotGptManifestUtils.getDefaultNextAvailablePluginManifestPath(
      appPackageFolder,
      fileName
    );

  const projectName = path.basename(projectPath);
  const namespace = projectName.toLowerCase().replace(/[^a-z0-9]/g, "") || "actions";

  const skeleton = {
    $schema: "https://developer.microsoft.com/json-schemas/copilot/plugin/v2.4/schema.json",
    schema_version: "v2.4",
    name_for_human: projectName,
    description_for_human: projectName,
    namespace,
    functions: [],
    runtimes: [],
  };

  await fs.ensureFile(destinationPluginManifestPath);
  await fs.writeJSON(destinationPluginManifestPath, skeleton, { spaces: 4 });

  const actionId = path.basename(
    destinationPluginManifestPath,
    path.extname(destinationPluginManifestPath)
  );
  const relativePluginPath = normalizePath(
    path.relative(path.dirname(declarativeAgentManifestPath), destinationPluginManifestPath),
    true
  );

  const addActionRes = await copilotGptManifestUtils.addAction(
    declarativeAgentManifestPath,
    actionId,
    relativePluginPath
  );
  if (addActionRes.isErr()) {
    return err(addActionRes.error);
  }

  return ok({ pluginManifestPath: destinationPluginManifestPath, actionId });
}

export interface AddExistingPluginResult {
  warnings: Warning[];
  destinationPluginManifestPath: string;
}

const pluginManifestPlaceholderWarning = "add-exsiting-plugin-manifest-placehoder";
const apiSpecPlaceholderWarning = "add-exsiting-plugin-api-spec-placehoder";
const readApiSpecErrorTelemetry = "read-api-spec-error";

export async function addExistingPlugin(
  declarativeCopilotManifestPath: string,
  fromPluginManifestPath: string,
  fromApiSpecPath: string,
  actionId: string,
  context: Context,
  source: string
): Promise<Result<AddExistingPluginResult, FxError>> {
  const pluginManifestRes =
    await pluginManifestUtils.readPluginManifestFile(fromPluginManifestPath);
  if (pluginManifestRes.isErr()) {
    return err(pluginManifestRes.error);
  }
  const pluginManifest = pluginManifestRes.value;

  // prerequiste check
  const checkRes = validateSourcePluginManifest(pluginManifest, source);
  if (checkRes.isErr()) {
    return err(checkRes.error);
  }

  const runtimes = pluginManifest.runtimes!; // have validated that the value exists.
  const destinationApiSpecRelativePath = runtimes.find((runtime) => runtime.type === "OpenApi")!
    .spec.url; // have validated that the value exists.

  const outputFolder = path.dirname(declarativeCopilotManifestPath);

  // Copy OpenAPI spec
  const originalDestApiSPecRelativePath = path.resolve(
    outputFolder,
    destinationApiSpecRelativePath
  );
  let destinationApiSpecPath = originalDestApiSPecRelativePath;
  const needUpdatePluginManifest =
    (await fs.pathExists(originalDestApiSPecRelativePath)) ||
    path.relative(outputFolder, originalDestApiSPecRelativePath).startsWith("..");

  if (needUpdatePluginManifest) {
    destinationApiSpecPath = await pluginManifestUtils.getDefaultNextAvailableApiSpecPath(
      fromApiSpecPath,
      path.join(outputFolder, DefaultApiSpecFolderName)
    );
  }
  await fs.ensureFile(destinationApiSpecPath);
  await fs.copyFile(fromApiSpecPath, destinationApiSpecPath);

  // Save plugin manifest
  if (needUpdatePluginManifest) {
    const runtimeSpecUrl = normalizePath(path.relative(outputFolder, destinationApiSpecPath), true);
    for (const runtime of runtimes) {
      if (runtime.type === "OpenApi" && runtime.spec?.url) {
        runtime.spec.url = runtimeSpecUrl;
      }
    }
  }

  const destinationPluginManifestPath =
    await copilotGptManifestUtils.getDefaultNextAvailablePluginManifestPath(outputFolder);
  await fs.ensureFile(destinationPluginManifestPath);
  const pluginManifestContent = JSON.stringify(pluginManifest, undefined, 4);
  await fs.writeFile(destinationPluginManifestPath, pluginManifestContent);

  // Update declarative copilot plugin manifest
  const addActionRes = await copilotGptManifestUtils.addAction(
    declarativeCopilotManifestPath,
    actionId,
    normalizePath(path.relative(outputFolder, destinationPluginManifestPath), true)
  );
  if (addActionRes.isErr()) {
    return err(addActionRes.error);
  }

  const warnings: Warning[] = [];
  const pluginManifestVariables = getEnvironmentVariables(JSON.stringify(pluginManifest));
  if (pluginManifestVariables.length > 0) {
    warnings.push({
      type: pluginManifestPlaceholderWarning,
      content: getLocalizedString(
        "core.addPlugin.warning.manifestVariables",
        pluginManifestVariables.join(", ")
      ),
    });
  }

  try {
    const apiSpecContent = await fs.readFile(destinationApiSpecPath, "utf8");
    const apiSpecVariables = getEnvironmentVariables(apiSpecContent);
    if (apiSpecVariables.length > 0) {
      warnings.push({
        type: apiSpecPlaceholderWarning,
        content: getLocalizedString(
          "core.addPlugin.warning.apiSpecVariables",
          apiSpecVariables.join(", ")
        ),
      });
    }
  } catch (e) {
    sendTelemetryErrorEvent(source, readApiSpecErrorTelemetry, assembleError(e));
  }

  return ok({
    destinationPluginManifestPath,
    warnings,
  });
}

export function validateSourcePluginManifest(
  manifest: PluginManifestSchema,
  source: string
): Result<undefined, UserError> {
  if (!manifest.schema_version) {
    return err(
      new UserError(
        source,
        "MissingSchemaVersion",
        getDefaultString(
          "core.createProjectQuestion.addPlugin.MissingRequiredProperty",
          "schema_version"
        ),
        getLocalizedString(
          "core.createProjectQuestion.addPlugin.MissingRequiredProperty",
          "schema_version"
        )
      )
    );
  }

  if (!manifest.runtimes) {
    return err(
      new UserError(
        source,
        "MissingRuntimes",
        getDefaultString(
          "core.createProjectQuestion.addPlugin.MissingRequiredProperty",
          "runtimes"
        ),
        getLocalizedString(
          "core.createProjectQuestion.addPlugin.MissingRequiredProperty",
          "runtimes"
        )
      )
    );
  }

  const apiSpecPaths = new Set<string>();
  for (const runtime of manifest.runtimes) {
    if (runtime.type === "OpenApi" && runtime.spec?.url) {
      apiSpecPaths.add(runtime.spec.url);
    }
  }

  if (apiSpecPaths.size === 0) {
    return err(
      new UserError(
        source,
        "MissingApiSpec",
        getDefaultString(
          "core.createProjectQuestion.addPlugin.pluginManifestMissingApiSpec",
          "OpenApi"
        ),
        getLocalizedString(
          "core.createProjectQuestion.addPlugin.pluginManifestMissingApiSpec",
          "OpenApi"
        )
      )
    );
  }

  if (apiSpecPaths.size > 1) {
    return err(
      new UserError(
        source,
        "MultipleApiSpecInPluginManifest",
        getDefaultString(
          "core.createProjectQuestion.addPlugin.pluginManifestMultipleApiSpec",
          Array.from(apiSpecPaths).join(", ")
        ),
        getLocalizedString(
          "core.createProjectQuestion.addPlugin.pluginManifestMultipleApiSpec",
          Array.from(apiSpecPaths).join(", ")
        )
      )
    );
  }

  return ok(undefined);
}

export async function setGeneralSensitivityLabel(
  context: Context,
  manifestPath: string
): Promise<void> {
  await generatorUtils.setGeneralSensitivityLabel(context, manifestPath);
}

export async function createGraphClientWithToken(context: Context) {
  return oneDriveSharePointHandler.createGraphClientWithToken(context);
}

export async function getSharePointSiteByRelativePath(graphClient: any, itemUrl: string) {
  return oneDriveSharePointHandler.getSharePointSiteByRelativePath(graphClient, itemUrl);
}

export function encodeSharePointUrl(itemUrl: string): string {
  return oneDriveSharePointHandler.encodeSharePointUrl(itemUrl);
}

export async function getDriveItemInfo(graphClient: any, encodedUrl: string) {
  return oneDriveSharePointHandler.getDriveItemInfo(graphClient, encodedUrl);
}

export async function getODSPItemInfo(
  context: Context,
  itemUrl: string | undefined
): Promise<Result<ItemMetadata[], UserError>> {
  if (!itemUrl) {
    return err(
      new UserError("validateOneDriveSharePointItem", "InvalidInput", "Item URL is required")
    );
  }

  try {
    const graphClientResult = await oneDriveSharePointHandler.createGraphClientWithToken(context);
    if (graphClientResult.isErr()) {
      return err(graphClientResult.error);
    }
    const graphClient = graphClientResult.value;

    const siteResult = await oneDriveSharePointHandler.getSharePointSiteByRelativePath(
      graphClient,
      itemUrl
    );
    if (siteResult.isOk()) {
      const site = siteResult.value;
      return ok([
        {
          id: site.id,
          name: site.name,
          webId: site.webId,
          siteId: site.siteId,
        },
      ]);
    }

    const encodedUrl = oneDriveSharePointHandler.encodeSharePointUrl(itemUrl);
    const driveItem = await oneDriveSharePointHandler.getDriveItemInfo(graphClient, encodedUrl);

    return ok([
      {
        id: driveItem.id,
        name: driveItem.name,
        uniqueId: driveItem.uniqueId,
        listId: driveItem.listId,
        webId: driveItem.webId,
        siteId: driveItem.siteId,
        itemType: driveItem.itemType,
      },
    ]);
  } catch (error) {
    if (isAxiosError(error) && error.response) {
      if (error.response.status >= 400 && error.response.status < 510) {
        context.logProvider?.error(
          getLocalizedString(logMessageKeys.failValidateOneDriveSharePointItem, error.message)
        );
        return err(
          new UserError(
            "ValidateOneDriveSharePointURL",
            "GraphApiError",
            error.message,
            error.message
          )
        );
      }
    }

    const message = JSON.stringify(error);
    context.logProvider?.error(
      getLocalizedString(logMessageKeys.failValidateOneDriveSharePointItem, message)
    );
    return err(new SystemError("ValidateOneDriveSharePointURL", "GraphApiError", message, message));
  }
}

export interface GCItem {
  id: string;
  label: string;
}
export async function getGraphConnectors(): Promise<GCItem[]> {
  const context = createContext();
  const graphTokenRes = await context.tokenProvider!.m365TokenProvider.getAccessToken({
    scopes: GCScopes,
  });
  if (graphTokenRes.isErr()) {
    throw graphTokenRes.error;
  }
  const graphToken = graphTokenRes.value;

  const instance = axios.create({
    baseURL: `${getResourceServiceEndpoint(ResourceServiceType.Graph)}/v1.0`,
    headers: { Authorization: `Bearer ${graphToken}` },
  });

  try {
    const res = await instance.get(`/external/connections`);
    const data = res.data;
    const result = data.value.map((item: { id: string; name: string }) => {
      return { id: item.id, label: item.id };
    });
    return result;
  } catch (error) {
    if (error.response?.status === 403) {
      const err = new UserError(
        "getCopilotConnectors",
        "GraphApiError",
        getDefaultString("core.GCList.insufficientPermission"),
        getDefaultString("core.GCList.insufficientPermission")
      );
      throw err;
    } else {
      const message = `Failed to get Copilot connector item: ${
        error instanceof Error ? error.message : String(error)
      }`;
      const err = new UserError("copilotConnectors", "GraphApiError", message, message);
      throw err;
    }
  }
}

export async function generateForMCPForDA(
  destinationPath: string,
  inputs: Inputs
): Promise<Result<GeneratorResult, FxError>> {
  const mcpServerUrl = inputs[QuestionNames.MCPForDAServerUrl];
  if (!mcpServerUrl) {
    return err(
      new UserError({
        source: "Scaffold",
        name: "InputValidationFailed",
        message: "mcpServerUrl is required when --api-plugin-type is mcp.",
        displayMessage: getLocalizedString("core.MCPForDA.missingServerUrl"),
      })
    );
  }

  // 1. Get ai-plugin.json
  const aiPluginFilePath = path.join(
    destinationPath,
    AppPackageFolderName,
    DefaultPluginManifestFileName
  );
  if (!(await fs.pathExists(aiPluginFilePath))) {
    const error = new SystemError(
      "MCPForDAPluginManifestNotFound",
      "PluginManifestNotFound",
      getDefaultString("core.MCPForDA.pluginManifestNotFound", aiPluginFilePath),
      getLocalizedString("core.MCPForDA.pluginManifestNotFound", aiPluginFilePath)
    );
    return err(error);
  }

  // Dynamic Tool Discovery flow: skip static tool fetch/selection entirely;
  // the agent host discovers tools at runtime against the MCP server. Per
  // SCN-DA-CREATE-WITH-MCP-SERVER this DT runtime shape is gated behind
  // TEAMSFX_MCP_FOR_DA_DT: when the flag is off the create flow keeps the
  // legacy static-tools behavior (populated `functions` + `mcp-tools-1.json`),
  // matching the add-action flow. We also require the auth-type answer so
  // legacy fixtures that mock inputs without it stay on the static-tools path.
  if (
    featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADT) &&
    inputs[QuestionNames.MCPForDAAuthType]
  ) {
    return generateForMCPForDAWithAuth(destinationPath, aiPluginFilePath, inputs);
  }

  const serverName = inputs[QuestionNames.MCPForDAServerName];
  const warnings: Warning[] = [];

  // If a tools file is provided (CLI flow), load tools from it
  const toolsFilePath = inputs[QuestionNames.MCPToolsFilePath];
  const existingTools = inputs[QuestionNames.MCPForDAAvailableTools];
  if (toolsFilePath && (!existingTools || existingTools.length === 0)) {
    try {
      const fileTools = await mcpToolFetcher.readMCPToolsFromFile(toolsFilePath);
      inputs[QuestionNames.MCPForDAAvailableTools] = fileTools;
      if (!inputs[QuestionNames.MCPForDAPreFetchTools]) {
        inputs[QuestionNames.MCPForDAPreFetchTools] = fileTools.map((t: any) => t.name);
      }
    } catch {
      warnings.push({
        type: "mcpToolsFileReadError",
        content: getLocalizedString(
          "core.MCPForDA.toolsFileReadError",
          toolsFilePath,
          mcpAddActionHint
        ),
      });
    }
  }

  // Probe auth if tools were loaded from file but auth not yet detected
  if (
    inputs[QuestionNames.MCPForDAAvailableTools]?.length > 0 &&
    !inputs[QuestionNames.MCPForDAAuth] &&
    mcpServerUrl
  ) {
    try {
      const authProbe = await mcpToolFetcher.probeMCPServerAuth(mcpServerUrl);
      if (authProbe.requiresAuth) {
        inputs[QuestionNames.MCPForDAAuth] = "OAuthPluginVault";
        if (authProbe.authMetadataUrl) {
          inputs[QuestionNames.MCPForDAAuthMetadataUrl] = authProbe.authMetadataUrl;
        }
      }
    } catch {
      // Auth probe failed — continue without auth
    }
  }

  // Auto-fetch tools from MCP server if no tools loaded yet
  const currentTools = inputs[QuestionNames.MCPForDAAvailableTools];
  if ((!currentTools || currentTools.length === 0) && mcpServerUrl) {
    try {
      const result = await mcpToolFetcher.fetchMCPTools(mcpServerUrl);
      if (!result.requiresAuth && result.tools.length > 0) {
        inputs[QuestionNames.MCPForDAAvailableTools] = result.tools;
        if (!inputs[QuestionNames.MCPForDAPreFetchTools]) {
          inputs[QuestionNames.MCPForDAPreFetchTools] = result.tools.map((t) => t.name);
        }
      } else if (result.requiresAuth) {
        // Store auth metadata for later use
        inputs[QuestionNames.MCPForDAAuth] = "OAuthPluginVault";
        if (result.authMetadataUrl) {
          inputs[QuestionNames.MCPForDAAuthMetadataUrl] = result.authMetadataUrl;
        }
        warnings.push({
          type: "mcpAuthRequired",
          content: getLocalizedString("core.MCPForDA.authRequired", mcpServerUrl, mcpAddActionHint),
        });
      } else {
        warnings.push({
          type: "mcpNoToolsFetched",
          content: getLocalizedString(
            "core.MCPForDA.noToolsFetched",
            mcpServerUrl,
            mcpAddActionHint
          ),
        });
      }
    } catch {
      warnings.push({
        type: "mcpFetchError",
        content: getLocalizedString("core.MCPForDA.fetchError", mcpServerUrl, mcpAddActionHint),
      });
    }
  }

  // 2. Read ai-plugin.json
  const aiPluginContent = await fs.readJSON(aiPluginFilePath);

  const mcpToolsDetail = inputs[QuestionNames.MCPForDAAvailableTools];
  const mcpToolsSelected = inputs[QuestionNames.MCPForDAPreFetchTools];

  if (
    mcpToolsDetail &&
    mcpToolsDetail.length > 0 &&
    mcpToolsSelected &&
    mcpToolsSelected.length > 0
  ) {
    const mcpAuth = inputs[QuestionNames.MCPForDAAuth];

    // Process tools: if serverName exists (VS Code flow), strip the prefix; otherwise use as-is (CLI flow)
    let processedTools: any[];
    if (serverName) {
      processedTools = mcpToolsDetail
        .filter((tool: any) => tool.name.includes(serverName))
        .map((tool: any) => {
          const index = tool.name.indexOf(serverName);
          const newName = (tool.name as string).substring(
            (index as number) + (serverName.length as number) + 1
          );
          return {
            ...tool,
            name: newName,
          };
        })
        .filter((tool: any) => mcpToolsSelected.includes(tool.name));
    } else {
      processedTools = mcpToolsDetail.filter((tool: any) => mcpToolsSelected.includes(tool.name));
    }

    aiPluginContent.functions = processedTools.map((tool: any) => {
      return {
        name: tool.name,
        description: tool.description || "",
      };
    });

    // Write mcp-tools-1.json with full tool definitions (no field filtering)
    const mcpToolsFileName = "mcp-tools-1.json";
    const mcpToolsOutputPath = path.join(destinationPath, AppPackageFolderName, mcpToolsFileName);
    await fs.writeJSON(mcpToolsOutputPath, { tools: processedTools }, { spaces: 4 });

    const runtimeSpec: any = {
      url: mcpServerUrl,
      mcp_tool_description: {
        file: mcpToolsFileName,
      },
    };
    aiPluginContent.runtimes = [
      {
        type: "RemoteMCPServer",
        spec: runtimeSpec,
        run_for_functions: aiPluginContent.functions.map((func: any) => func.name),
      },
    ];

    // Auth handling
    if (mcpAuth === "OAuthPluginVault") {
      const authType = inputs[QuestionNames.MCPForDAAuthType];
      if (!authType) {
        return err(
          new UserError(
            "MCPForDA",
            "MissingMCPAuthType",
            getDefaultString("core.MCPForDA.missingAuthType"),
            getLocalizedString("core.MCPForDA.missingAuthType")
          )
        );
      }

      const registrationId = "MCP_DA_AUTH_ID_ACTION_1";
      const manifestOAuth = deriveMCPManifestOAuth(authType, registrationId);
      if (manifestOAuth) {
        aiPluginContent.runtimes[0].auth = manifestOAuth;
      }

      // Resolve OAuth metadata and inject oauth/register into m365agents.yml
      try {
        const endpoints = await resolveMCPAuthEndpoints(authType, inputs);
        const ymlPath = pathUtils.getYmlFilePath(destinationPath);
        if (ymlPath) {
          const injectResult = await injectMCPAuthActionToYml({
            ymlPath,
            authType,
            authName: aiPluginContent.namespace || "action_1",
            registrationId,
            mcpServerUrl,
            endpoints,
          });
          if (injectResult.wellKnownUrlPlaceholderUsed) {
            warnings.push({
              type: "mcpAuthDcrWellKnownUrlPlaceholder",
              content: getLocalizedString(
                "core.MCPForDA.mcpAuthDcrPlaceholderWarning",
                mcpServerUrl
              ),
            });
          }
          if (injectResult.oauthUrlPlaceholderUsed) {
            warnings.push({
              type: "mcpAuthOAuthUrlPlaceholder",
              content: getLocalizedString(
                "core.MCPForDA.mcpAuthOAuthPlaceholderWarning",
                mcpServerUrl,
                MCP_OAUTH_AUTHORIZATION_URL_PLACEHOLDER,
                MCP_OAUTH_TOKEN_URL_PLACEHOLDER
              ),
            });
          }
        }
      } catch (error: any) {
        warnings.push({
          type: "mcpAuthMetadataError",
          content: getLocalizedString("core.MCPForDA.mcpAuthMetadataMissingError", error.message),
        });
      }
    }
  }
  // If no tools available, leave ai-plugin.json with empty functions/runtimes (template default)

  // 3. Write ai-plugin.json
  await fs.writeJSON(aiPluginFilePath, aiPluginContent, { spaces: 4 });

  return ok({ warnings });
}

/**
 * Modern DA-with-MCP scaffolder. Selected by `generateForMCPForDA` only when
 * TEAMSFX_MCP_FOR_DA_DT is on AND the create flow answered `MCPForDAAuthType`.
 * When the flag is off, the dispatcher keeps the legacy static-tools path
 * instead, so this function never runs with the flag off.
 *
 * Emits the Dynamic Tool Discovery runtime shape per
 * SCN-DA-CREATE-WITH-MCP-SERVER: `RemoteMCPServer` with a `spec` that carries
 * only the MCP server `url` (no `mcp_tool_description`) and
 * `run_for_functions: ["*"]`. Per the v2.4 plugin schema, omitting
 * `mcp_tool_description` is what makes the host use dynamic tool discovery — no
 * `mcp-tools-N.json` is written and `functions` stays an empty array
 * (schema-required field; tools are discovered at runtime rather than declared
 * statically). This DT shape is gated behind TEAMSFX_MCP_FOR_DA_DT via the
 * dispatcher; with the flag off the create flow produces the legacy static
 * shape instead.
 *
 * OAuth credentials reach the provisioned `oauth/register` action as
 * `${{MCP_DA_OAUTH_*_<SUFFIX>}}` refs in m365agents.yml, persisted to
 * env/.env.<env>(.user). (The in-process `process.env` bridge below is a
 * defensive fallback for the flag-off path, which the dispatcher no longer
 * routes here.)
 */
async function generateForMCPForDAWithAuth(
  destinationPath: string,
  aiPluginFilePath: string,
  inputs: Inputs
): Promise<Result<GeneratorResult, FxError>> {
  const mcpServerUrl = inputs[QuestionNames.MCPForDAServerUrl];
  const warnings: Warning[] = [];

  const aiPluginContent = await fs.readJSON(aiPluginFilePath);
  aiPluginContent.functions = [];

  // Namespace the action by the MCP server host (shared rule with the
  // add-action flow) instead of the project name, so actions targeting
  // different MCP servers get distinct namespaces and the matching
  // oauth/register `name` derives from the same source.
  if (mcpServerUrl) {
    aiPluginContent.namespace = deriveMCPNamespaceFromUrl(mcpServerUrl);
  }

  const runtime: any = {
    type: "RemoteMCPServer",
    spec: { url: mcpServerUrl },
    run_for_functions: ["*"],
  };

  if (mcpServerUrl) {
    const authType = inputs[QuestionNames.MCPForDAAuthType] as string | undefined;
    if (authType === "none") {
      runtime.auth = { type: "None" };
    } else if (authType) {
      const serverName = deriveMCPServerNameFromUrl(mcpServerUrl).toUpperCase();
      const registrationId = deriveMCPRegistrationIdFromUrl(mcpServerUrl);
      const manifestOAuth = deriveMCPManifestOAuth(authType, registrationId);
      if (manifestOAuth) {
        runtime.auth = manifestOAuth;
      }

      // Probe the MCP server for resource_metadata so `resolveMCPAuthEndpoints`
      // can discover authorization/token URLs. The legacy `generateForMCPForDA`
      // branch populates `MCPForDAAuthMetadataUrl` via fetchMCPTools; the DT
      // branch skips tool fetch, so we need an explicit probe here. Best-effort.
      if (!inputs[QuestionNames.MCPForDAAuthMetadataUrl]) {
        try {
          const authProbe = await mcpToolFetcher.probeMCPServerAuth(mcpServerUrl);
          if (authProbe.authMetadataUrl) {
            inputs[QuestionNames.MCPForDAAuthMetadataUrl] = authProbe.authMetadataUrl;
          }
          // This branch never fetches tools, so a mistyped server URL would otherwise leave no
          // trace at all: endpoint discovery falls back to the host and happily returns its
          // authorization server, and the scaffold looks complete. Warns on every `notEndpoint`
          // shape, not just 404 — this is advisory, so it can be broader than the blocking rule
          // applied when the URL is first entered.
          if (authProbe.endpointStatus === "notEndpoint") {
            warnings.push({
              type: "mcpServerUrlNotAnEndpoint",
              content: getLocalizedString(
                "core.MCPForDA.mcpServerUrlNotAnEndpoint",
                mcpServerUrl,
                String(authProbe.responseStatus)
              ),
            });
          }
        } catch {
          // Probe failed — continue; endpoint resolution below will best-effort
          // and yml injection will still run with undefined endpoints.
        }
      }

      // Endpoint resolution is best-effort: a failure (server unreachable, no
      // well-known metadata, etc.) must not block credential persistence or
      // yml injection. The OAuth action injector tolerates undefined endpoint
      // URLs; the developer can fill them in later.
      let endpoints: Awaited<ReturnType<typeof resolveMCPAuthEndpoints>> = {};
      try {
        endpoints = await resolveMCPAuthEndpoints(authType, inputs);
      } catch (error: any) {
        warnings.push({
          type: "mcpAuthMetadataError",
          content: getLocalizedString("core.MCPForDA.mcpAuthMetadataMissingError", error.message),
        });
      }

      const dtOn = featureFlagManager.getBooleanValue(FeatureFlags.MCPForDADT);
      try {
        const ymlPath = pathUtils.getYmlFilePath(destinationPath);
        if (ymlPath) {
          const injectResult = await injectMCPAuthActionToYml({
            ymlPath,
            authType,
            authName: aiPluginContent.namespace || "action_1",
            registrationId,
            mcpServerUrl,
            endpoints,
            persistCredentialEnvRefs: dtOn,
            serverName,
            scopes: inputs[QuestionNames.MCPForDAScopes],
          });
          if (injectResult.wellKnownUrlPlaceholderUsed) {
            warnings.push({
              type: "mcpAuthDcrWellKnownUrlPlaceholder",
              content: getLocalizedString(
                "core.MCPForDA.mcpAuthDcrPlaceholderWarning",
                mcpServerUrl
              ),
            });
          }
          if (injectResult.oauthUrlPlaceholderUsed) {
            warnings.push({
              type: "mcpAuthOAuthUrlPlaceholder",
              content: getLocalizedString(
                "core.MCPForDA.mcpAuthOAuthPlaceholderWarning",
                mcpServerUrl,
                MCP_OAUTH_AUTHORIZATION_URL_PLACEHOLDER,
                MCP_OAUTH_TOKEN_URL_PLACEHOLDER
              ),
            });
          }
        }
      } catch (error: any) {
        warnings.push({
          type: "mcpAuthYmlInjectionError",
          content: getLocalizedString("core.MCPForDA.mcpAuthMetadataMissingError", error.message),
        });
      }
      if (dtOn) {
        try {
          await persistMCPAuthCredentialEnvVars({
            projectPath: destinationPath,
            authType,
            serverName,
            clientId: inputs[QuestionNames.MCPForDAClientId],
            clientSecret: inputs[QuestionNames.MCPForDAClientSecret],
            scopes: inputs[QuestionNames.MCPForDAScopes],
          });
        } catch (error: any) {
          warnings.push({
            type: "mcpAuthEnvPersistError",
            content: getLocalizedString("core.MCPForDA.mcpAuthMetadataMissingError", error.message),
          });
        }
      } else {
        // Populate the in-process bridge consumed by oauth/create.ts so
        // provision picks up create-time answers without re-prompting via
        // QuestionMW. Only static OAuth and Entra SSO contribute creds.
        const clientId = inputs[QuestionNames.MCPForDAClientId];
        const clientSecret = inputs[QuestionNames.MCPForDAClientSecret];
        const scopes = inputs[QuestionNames.MCPForDAScopes];
        if (clientId) {
          process.env[QuestionNames.OauthClientId] = clientId;
        }
        if (clientSecret) {
          process.env[QuestionNames.OauthClientSecret] = clientSecret;
        }
        if (scopes) {
          process.env[QuestionNames.OAuthScope] = scopes;
        }
      }
    }
  }

  aiPluginContent.runtimes = [runtime];

  await fs.writeJSON(aiPluginFilePath, aiPluginContent, { spaces: 4 });

  return ok({ warnings });
}
