// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author yuqzho@microsoft.com
 */

import {
  AdaptiveCardGenerator,
  AdaptiveCardUpdateStrategy,
  ErrorResult as ApiSpecErrorResult,
  ErrorType as ApiSpecErrorType,
  AuthType,
  ConstantString,
  ErrorType,
  InvalidAPIInfo,
  ListAPIInfo,
  ProjectType,
  SpecParser,
  SpecParserError,
  Utils,
  ValidateResult,
  ValidationStatus,
  WarningResult,
  WarningType,
} from "@microsoft/m365-spec-parser";
import {
  ApiOperation,
  AppPackageFolderName,
  Context,
  err,
  FxError,
  Inputs,
  ManifestTemplateFileName,
  ok,
  Platform,
  Result,
  Stage,
  SystemError,
  TeamsAppManifest,
  UserError,
  Warning,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { OpenAPIV3 } from "openapi-types";
import { EOL } from "os";
import path from "path";
import * as util from "util";
import { SpecParserSource } from "../../../common/constants";
import { featureFlagManager, FeatureFlags } from "../../../common/featureFlags";
import { getLocalizedString } from "../../../common/localizeUtils";
import { getParserOptions } from "../../../common/openApiParserOptions";
import {
  ApiSpecTelemetryPropertis,
  sendTelemetryErrorEvent,
  TelemetryProperty,
} from "../../../common/telemetry";
import { assembleError, MissingRequiredInputError } from "../../../error";
import {
  CustomCopilotRagOptions,
  DeclarativeAgentApiSpecOptionId,
  ProgrammingLanguage,
  QuestionNames,
} from "../../../question/constants";
import { ActionInjector, AuthActionInjectResult } from "../../configManager/actionInjector";
import {
  APIKeyAuthType,
  MicrosoftEntraAuthType,
  OAuthAuthType,
  SummaryConstant,
} from "../../configManager/constant";
import { manifestUtils } from "../../driver/teamsApp/utils/ManifestUtils";
import { pluginManifestUtils } from "../../driver/teamsApp/utils/PluginManifestUtils";
import { generatePlugin, listAPIInfo, validateOpenAPISpec } from "../../../common/daSpecParser";
import { isMCPScaffoldWarning } from "../../utils/mcpAuthScaffolder";
import { pathUtils } from "../../utils/pathUtils";

const enum telemetryProperties {
  validationStatus = "validation-status",
  validationErrors = "validation-errors",
  validationWarnings = "validation-warnings",
  validApisCount = "valid-apis-count",
  allApisCount = "all-apis-count",
  specHash = "spec-hash",
  bearerTokenAuthCount = "bearer-token-auth-count",
  oauth2AuthCount = "oauth2-auth-count",
  otherAuthCount = "other-auth-count",
  noneAuthCount = "none-auth-count",
  apiKeyAuthCount = "api-key-auth-count",
  multipleAuthCount = "multiple-auth-count",
  isFromAddingApi = "is-from-adding-api",
  failedReason = "failed-reason",
  generateType = "generate-type",
  projectType = "project-type",
}

const enum telemetryEvents {
  validateApiSpec = "validate-api-spec",
  listApis = "spec-parser-list-apis-result",
  failedToGetGenerateWarning = "failed-to-get-generate-warning",
}

export { getParserOptions } from "../../../common/openApiParserOptions";

export const specParserGenerateResultTelemetryEvent = "spec-parser-generate-result";
export const specParserGenerateResultAllSuccessTelemetryProperty = "all-success";
export const specParserGenerateResultWarningsTelemetryProperty = "warnings";

export const invalidApiSpecErrorName = "invalid-api-spec";
const apiSpecNotUsedInPlugin = "api-spec-not-used-in-plugin";

export interface ErrorResult {
  /**
   * The type of error.
   */
  type: ApiSpecErrorType;

  /**
   * The content of the error.
   */
  content: string;

  data?: any;
}

export async function listOperations(
  context: Context,
  apiSpecUrl: string | undefined,
  inputs: Inputs,
  includeExistingAPIs = true,
  shouldLogWarning = true,
  existingCorrelationId?: string
): Promise<Result<ApiOperation[], ErrorResult[]>> {
  const isPlugin = inputs[QuestionNames.ActionType] === DeclarativeAgentApiSpecOptionId;
  const isCustomApi =
    inputs[QuestionNames.CustomCopilotRag] === CustomCopilotRagOptions.customApi().id;
  const projectType = isPlugin
    ? ProjectType.Copilot
    : isCustomApi
      ? ProjectType.TeamsAi
      : ProjectType.SME;

  try {
    const specParser = new SpecParser(
      apiSpecUrl as string,
      getParserOptions(projectType, undefined, inputs.platform)
    );

    let validationRes: ValidateResult;
    if (projectType === ProjectType.Copilot) {
      validationRes = await validateOpenAPISpec(apiSpecUrl as string, inputs.platform);
    } else {
      validationRes = await specParser.validate();
    }

    validationRes.errors = formatValidationErrors(validationRes.errors, inputs);

    logValidationResults(
      projectType,
      validationRes.errors,
      validationRes.warnings,
      context,
      shouldLogWarning,
      false,
      validationRes.specHash,
      existingCorrelationId
    );
    if (validationRes.status === ValidationStatus.Error) {
      return err(validationRes.errors);
    }
    let listResult;
    if (projectType === ProjectType.Copilot) {
      listResult = await listAPIInfo(apiSpecUrl as string, inputs.platform);
    } else {
      listResult = await specParser.list();
    }

    const invalidAPIs = listResult.APIs.filter((value) => !value.isValid);
    for (const invalidAPI of invalidAPIs) {
      context.logProvider.warning(
        `${invalidAPI.api} ${getLocalizedString(
          "core.copilotPlugin.list.unsupportedBecause"
        )} ${invalidAPI.reason.map(mapInvalidReasonToMessage).join(", ")}`
      );
    }

    const bearerTokenAuthAPIs = listResult.APIs.filter(
      (api) => api.auth && Utils.isBearerTokenAuth(api.auth.authScheme)
    );

    const oauth2AuthAPIs = listResult.APIs.filter(
      (api) => api.auth && Utils.isOAuthWithAuthCodeFlow(api.auth.authScheme)
    );

    const apiKeyAuthAPIs = listResult.APIs.filter(
      (api) => api.auth && Utils.isAPIKeyAuthButNotInCookie(api.auth.authScheme)
    );

    const multipleAuthAPIs = listResult.APIs.filter(
      (api) => api.auth && api.auth.authScheme?.type === "multipleAuth"
    );

    const noneAuthAPIs = listResult.APIs.filter((api) => !api.auth);

    const otherAuthAPIs = listResult.APIs.filter(
      (api) =>
        api.auth &&
        !Utils.isOAuthWithAuthCodeFlow(api.auth.authScheme) &&
        !Utils.isBearerTokenAuth(api.auth.authScheme) &&
        !Utils.isAPIKeyAuthButNotInCookie(api.auth.authScheme)
    );

    let operations = listResult.APIs.filter((value) => value.isValid);
    context.telemetryReporter.sendTelemetryEvent(telemetryEvents.listApis, {
      [telemetryProperties.generateType]: projectType.toString(),
      [telemetryProperties.validApisCount]: listResult.validAPICount.toString(),
      [telemetryProperties.allApisCount]: listResult.allAPICount.toString(),
      [telemetryProperties.isFromAddingApi]: (!includeExistingAPIs).toString(),
      [telemetryProperties.bearerTokenAuthCount]: bearerTokenAuthAPIs.length.toString(),
      [telemetryProperties.noneAuthCount]: noneAuthAPIs.length.toString(),
      [telemetryProperties.multipleAuthCount]: multipleAuthAPIs.length.toString(),
      [telemetryProperties.apiKeyAuthCount]: apiKeyAuthAPIs.length.toString(),
      [telemetryProperties.oauth2AuthCount]: oauth2AuthAPIs.length.toString(),
      [telemetryProperties.otherAuthCount]: otherAuthAPIs.length.toString(),
      [telemetryProperties.specHash]: validationRes.specHash!,
      [TelemetryProperty.IsKiotaNPMIntegrationEnabled]: featureFlagManager
        .getBooleanValue(FeatureFlags.KiotaNPMIntegration)
        .toString(),
    });

    // Filter out exsiting APIs
    if (!includeExistingAPIs) {
      const teamsManifestPath = inputs[QuestionNames.ManifestPath];
      if (!teamsManifestPath) {
        throw new MissingRequiredInputError("teamsManifestPath", "inputs");
      }
      const manifest = await manifestUtils._readAppManifest(teamsManifestPath);
      let existingOperations: string[] = [];
      if (manifest.isOk()) {
        let isOriginalSpec;

        if (isPlugin) {
          existingOperations = await listPluginExistingOperations(
            manifest.value,
            teamsManifestPath,
            inputs[QuestionNames.DestinationApiSpecFilePath]
          );

          const operationAPIs = operations.map((operation) => operation.api);
          isOriginalSpec = existingOperations.every((operation) =>
            operationAPIs.includes(operation)
          );
        } else {
          const existingOperationIds = manifestUtils.getOperationIds(manifest.value);
          existingOperations = operations
            .filter((operation) => existingOperationIds.includes(operation.operationId))
            .map((operation) => operation.api);

          isOriginalSpec = existingOperations.length === existingOperationIds.length;
        }

        if (!isOriginalSpec) {
          const errors = formatValidationErrors(
            [
              {
                type: ApiSpecErrorType.AddedAPINotInOriginalSpec,
                content: "",
              },
            ],
            inputs
          );

          logValidationResults(
            projectType,
            errors,
            [],
            context,
            true,
            false,
            validationRes.specHash,
            existingCorrelationId
          );
          return err(errors);
        }

        operations = operations.filter(
          (operation: ListAPIInfo) => !existingOperations.includes(operation.api)
        );
        // No extra API can be added
        if (operations.length == 0) {
          const errors = formatValidationErrors(
            [
              {
                type: ApiSpecErrorType.NoExtraAPICanBeAdded,
                content: "",
              },
            ],
            inputs
          );
          logValidationResults(
            projectType,
            errors,
            [],
            context,
            true,
            false,
            validationRes.specHash,
            existingCorrelationId
          );
          return err(errors);
        }
      } else {
        throw manifest.error;
      }
    }

    const sortedOperations = sortOperations(operations);
    return ok(sortedOperations);
  } catch (e) {
    if (e instanceof SpecParserError) {
      throw convertSpecParserErrorToFxError(e);
    } else {
      throw e;
    }
  }
}

function sortOperations(operations: ListAPIInfo[]): ApiOperation[] {
  const operationsWithSeparator: ApiOperation[] = [];
  for (const operation of operations) {
    const arr = operation.api.toUpperCase().split(" ");
    const result: ApiOperation = {
      id: operation.api,
      label: operation.api,
      groupName: arr[0],
      detail: !operation.auth
        ? getLocalizedString("core.copilotPlugin.api.noAuth")
        : Utils.isBearerTokenAuth(operation.auth.authScheme)
          ? getLocalizedString("core.copilotPlugin.api.apiKeyAuth")
          : Utils.isOAuthWithAuthCodeFlow(operation.auth.authScheme)
            ? getLocalizedString("core.copilotPlugin.api.oauth")
            : Utils.isAPIKeyAuthButNotInCookie(operation.auth.authScheme)
              ? getLocalizedString("core.copilotPlugin.api.apiKeyWithHeaderOrQuery")
              : getLocalizedString("core.copilotPlugin.api.notSupportedAuth"),
      data: {
        serverUrl: operation.server,
      },
    };

    if (operation.auth) {
      if (
        Utils.isBearerTokenAuth(operation.auth.authScheme) ||
        Utils.isAPIKeyAuthButNotInCookie(operation.auth.authScheme)
      ) {
        result.data.authType = "apiKey";
        result.data.authName = operation.auth.name;
      } else if (Utils.isOAuthWithAuthCodeFlow(operation.auth.authScheme)) {
        result.data.authType = "oauth2";
        result.data.authName = operation.auth.name;
      }
    }

    operationsWithSeparator.push(result);
  }

  return operationsWithSeparator.sort((operation1: ApiOperation, operation2: ApiOperation) => {
    const arr1 = operation1.id.toLowerCase().split(" ");
    const arr2 = operation2.id.toLowerCase().split(" ");
    return arr1[0] < arr2[0] ? -1 : arr1[0] > arr2[0] ? 1 : arr1[1].localeCompare(arr2[1]);
  });
}

function formatTelemetryValidationProperty(result: ErrorResult | WarningResult): string {
  return result.type.toString();
}

export async function listPluginExistingOperations(
  manifest: TeamsAppManifest,
  teamsManifestPath: string,
  destinationApiSpecFilePath: string
): Promise<string[]> {
  const getApiSPecFileRes = await pluginManifestUtils.getApiSpecFilePathFromTeamsManifest(
    manifest,
    teamsManifestPath
  );
  if (getApiSPecFileRes.isErr()) {
    throw getApiSPecFileRes.error;
  }

  let apiSpecFilePath;
  const apiSpecFiles = getApiSPecFileRes.value;
  for (const file of apiSpecFiles) {
    if (path.resolve(file) === path.resolve(destinationApiSpecFilePath)) {
      apiSpecFilePath = file;
      break;
    }
  }
  if (!apiSpecFilePath) {
    throw new UserError(
      "listPluginExistingOperations",
      apiSpecNotUsedInPlugin,
      getLocalizedString("error.copilotPlugin.apiSpecNotUsedInPlugin", destinationApiSpecFilePath),
      getLocalizedString("error.copilotPlugin.apiSpecNotUsedInPlugin", destinationApiSpecFilePath)
    );
  }

  const listResult = await listAPIInfo(apiSpecFilePath);
  return listResult.APIs.map((o) => o.api);
}

interface SpecParserOutputFilePath {
  destinationApiSpecFilePath: string;
  pluginManifestFilePath?: string;
  responseTemplateFolder?: string;
}

interface SpecParserGenerateResult {
  warnings: WarningResult[];
}
export async function generateFromApiSpec(
  specParser: SpecParser | undefined,
  teamsManifestPath: string,
  inputs: Inputs,
  context: Context,
  sourceComponent: string,
  projectType: ProjectType,
  outputFilePath: SpecParserOutputFilePath,
  specPath: string,
  updateExistingPlugin = false
): Promise<Result<SpecParserGenerateResult, FxError>> {
  const operations = inputs[QuestionNames.ApiOperation] as string[];

  let validationRes: ValidateResult;
  if (projectType === ProjectType.Copilot) {
    validationRes = await validateOpenAPISpec(specPath, inputs.platform);
  } else {
    validationRes = await specParser!.validate();
  }
  const warnings = validationRes.warnings;
  const operationIdWarning = warnings.find((w) => w.type === WarningType.OperationIdMissing);

  if (operationIdWarning && operationIdWarning.data) {
    const apisMissingOperationId = (operationIdWarning.data as string[]).filter((api) =>
      operations.includes(api)
    );
    if (apisMissingOperationId.length > 0) {
      operationIdWarning.content = util.format(
        getLocalizedString("core.common.MissingOperationId"),
        apisMissingOperationId.join(", ")
      );
      delete operationIdWarning.data;
    } else {
      warnings.splice(warnings.indexOf(operationIdWarning), 1);
    }
  }

  const specVersionWarning = warnings.find((w) => w.type === WarningType.ConvertSwaggerToOpenAPI);
  if (specVersionWarning) {
    specVersionWarning.content = ""; // We don't care content of this warning
  }

  if (validationRes.status === ValidationStatus.Error) {
    logValidationResults(
      projectType,
      validationRes.errors,
      warnings,
      context,
      false,
      true,
      validationRes.specHash
    );
    const errorMessage =
      inputs.platform === Platform.VSCode
        ? getLocalizedString(
            "core.createProjectQuestion.apiSpec.multipleValidationErrors.vscode.message"
          )
        : getLocalizedString("core.createProjectQuestion.apiSpec.multipleValidationErrors.message");
    return err(new UserError(sourceComponent, invalidApiSpecErrorName, errorMessage, errorMessage));
  }

  try {
    let adaptiveCardUpdateStrategy = AdaptiveCardUpdateStrategy.CreateNew;
    if (sourceComponent === Stage.kiotaRegenerate) {
      adaptiveCardUpdateStrategy = AdaptiveCardUpdateStrategy.KeepExisting;
    }

    const generateResult =
      projectType === ProjectType.Copilot
        ? await generatePlugin(
            specPath,
            teamsManifestPath,
            outputFilePath.destinationApiSpecFilePath,
            outputFilePath.pluginManifestFilePath!,
            operations,
            adaptiveCardUpdateStrategy,
            inputs.platform,
            updateExistingPlugin
          )
        : await specParser!.generate(
            teamsManifestPath,
            operations,
            outputFilePath.destinationApiSpecFilePath,
            projectType === ProjectType.TeamsAi ? undefined : outputFilePath.responseTemplateFolder
          );

    // Send SpecParser.generate() warnings
    context.telemetryReporter.sendTelemetryEvent(specParserGenerateResultTelemetryEvent, {
      [telemetryProperties.generateType]: projectType.toString(),
      [specParserGenerateResultAllSuccessTelemetryProperty]: generateResult.allSuccess.toString(),
      [specParserGenerateResultWarningsTelemetryProperty]: generateResult.warnings
        .map((w) => `${w.type.toString()}: ${w.content}`)
        .join(";"),
      [TelemetryProperty.Component]: sourceComponent,
      [TelemetryProperty.IsKiotaNPMIntegrationEnabled]: featureFlagManager
        .getBooleanValue(FeatureFlags.KiotaNPMIntegration)
        .toString(),
    });
    if (generateResult.warnings && generateResult.warnings.length > 0) {
      generateResult.warnings.find((o) => {
        if (o.type === WarningType.OperationOnlyContainsOptionalParam) {
          o.content = ""; // We don't care content of this warning
        }
      });
      warnings.push(...generateResult.warnings);
    }

    return ok({ warnings });
  } catch (e) {
    let error: FxError;
    if (e instanceof SpecParserError) {
      error = convertSpecParserErrorToFxError(e);
    } else {
      error = assembleError(e, sourceComponent);
    }
    return err(error);
  }
}

export function logValidationResults(
  projectType: ProjectType,
  errors: ErrorResult[],
  warnings: WarningResult[],
  context: Context,
  shouldLogWarning: boolean,
  shouldSkipTelemetry: boolean,
  specHash?: string,
  existingCorrelationId?: string
): void {
  if (!shouldSkipTelemetry) {
    const properties: { [key: string]: string } = {
      [telemetryProperties.validationStatus]:
        errors.length !== 0 ? "error" : warnings.length !== 0 ? "warning" : "success",
      [telemetryProperties.validationErrors]: errors
        .map((error: ErrorResult) => formatTelemetryValidationProperty(error))
        .join(";"),
      [telemetryProperties.validationWarnings]: warnings
        .map((warn: WarningResult) => formatTelemetryValidationProperty(warn))
        .join(";"),
      [telemetryProperties.projectType]: projectType.toString(),
    };

    if (specHash) {
      properties[telemetryProperties.specHash] = specHash;
    }

    properties[TelemetryProperty.IsKiotaNPMIntegrationEnabled] = featureFlagManager
      .getBooleanValue(FeatureFlags.KiotaNPMIntegration)
      .toString();

    const specNotValidError = errors.find((error) => error.type === ErrorType.SpecNotValid);
    if (specNotValidError) {
      properties[ApiSpecTelemetryPropertis.SpecNotValidDetails] = specNotValidError.content;
    }

    if (existingCorrelationId) {
      properties["correlation-id"] = existingCorrelationId;
    }
    context.telemetryReporter.sendTelemetryEvent(telemetryEvents.validateApiSpec, properties);
  }

  if (errors.length === 0 && (warnings.length === 0 || !shouldLogWarning)) {
    return;
  }

  // errors > 0 || (warnings > 0 && shouldLogWarning)
  const errorMessage = errors
    .map((error) => {
      return `${SummaryConstant.Failed} ${error.content}`;
    })
    .join(EOL);
  const warningMessage = shouldLogWarning
    ? warnings
        .map((warning) => {
          return `${SummaryConstant.NotExecuted} ${warning.content}`;
        })
        .join(EOL)
    : "";

  const failed = errors.length;
  const warns = warnings.length;
  const summaryStr = [];

  if (failed > 0) {
    summaryStr.push(
      getLocalizedString("core.copilotPlugin.validate.summary.validate.failed", failed)
    );
  }
  if (warns > 0 && shouldLogWarning) {
    summaryStr.push(
      getLocalizedString("core.copilotPlugin.validate.summary.validate.warning", warns)
    );
  }

  const outputMessage =
    EOL +
    getLocalizedString(
      "core.copilotPlugin.validate.apiSpec.summary",
      summaryStr.join(", "),
      errorMessage,
      warningMessage
    );

  void context.logProvider.info(outputMessage);
}

export async function injectAuthAction(
  projectPath: string,
  authName: string,
  authScheme: AuthType | undefined,
  outputApiSpecPath: string,
  forceToAddNew: boolean,
  authType?: string,
  enablePKCE?: boolean,
  registrationId?: string
): Promise<AuthActionInjectResult | undefined> {
  const ymlPath = pathUtils.getYmlFilePath(projectPath) as string;
  const localYamlPath = pathUtils.getYmlFilePath(projectPath, "local", true) as string;

  const relativeSpecPath = `./${path.relative(projectPath, outputApiSpecPath).replace(/\\/g, "/")}`;

  if (
    (!!authScheme &&
      (Utils.isBearerTokenAuth(authScheme) || Utils.isAPIKeyAuthButNotInCookie(authScheme))) ||
    authType === APIKeyAuthType
  ) {
    const res = await ActionInjector.injectCreateAPIKeyAction(
      ymlPath,
      authName,
      relativeSpecPath,
      forceToAddNew,
      registrationId
    );

    if (!!localYamlPath && (await fs.pathExists(localYamlPath))) {
      await ActionInjector.injectCreateAPIKeyAction(
        localYamlPath,
        authName,
        relativeSpecPath,
        forceToAddNew,
        registrationId
      );
    }
    return res;
  } else if (
    (!!authScheme && Utils.isOAuthWithAuthCodeFlow(authScheme)) ||
    authType === OAuthAuthType ||
    authType === MicrosoftEntraAuthType
  ) {
    const res = await ActionInjector.injectCreateOAuthAction(
      ymlPath,
      authName,
      relativeSpecPath,
      forceToAddNew,
      authType === MicrosoftEntraAuthType,
      enablePKCE,
      registrationId
    );

    if (!!localYamlPath && (await fs.pathExists(localYamlPath))) {
      await ActionInjector.injectCreateOAuthAction(
        localYamlPath,
        authName,
        relativeSpecPath,
        forceToAddNew,
        authType === MicrosoftEntraAuthType,
        enablePKCE,
        registrationId
      );
    }
    return res;
  }
}

/**
 * Generate scaffolding warning summary.
 * @param warnings warnings returned from spec-parser.
 * @param teamsManifest Teams manifest.
 * @param apiSpecFilePath API spec path relative of project path.
 * @param pluginManifestPath Plugin manifest path relative of project path.
 * @param projectPath Project path.
 * @returns Warning message.
 */
export async function generateScaffoldingSummary(
  warnings: Warning[],
  teamsManifest: TeamsAppManifest,
  apiSpecFilePath: string,
  pluginManifestPath: string | undefined,
  projectPath: string
): Promise<string> {
  const apiSpecWarningMessage = formatApiSpecValidationWarningMessage(
    warnings,
    apiSpecFilePath,
    teamsManifest
  );
  const manifestWarningResult = validateTeamsManifestLength(teamsManifest, warnings);
  const manifestWarningMessage = manifestWarningResult.map((warn) => {
    return `${SummaryConstant.NotExecuted} ${warn}`;
  });

  let pluginWarningMessage: string[] = [];
  if (pluginManifestPath) {
    const pluginManifestWarningResult = await validatePluginManifestLength(
      pluginManifestPath,
      projectPath
    );
    pluginWarningMessage = pluginManifestWarningResult.map((warn) => {
      return `${SummaryConstant.NotExecuted} ${warn}`;
    });
  }

  // MCP scaffolding warnings are not spec-parser warnings, but they report a project that
  // cannot provision until the developer edits it (unresolved auth placeholders, tools that
  // could not be fetched), so they must reach the summary too. Declarative-agent projects
  // route through this function, which would otherwise drop them silently.
  const mcpWarningMessage = warnings.filter(isMCPScaffoldWarning).map((warn) => {
    return `${SummaryConstant.NotExecuted} ${warn.content}`;
  });

  if (
    apiSpecWarningMessage.length ||
    manifestWarningMessage.length ||
    pluginWarningMessage.length ||
    mcpWarningMessage.length
  ) {
    let details = "";
    if (apiSpecWarningMessage.length) {
      details += EOL + apiSpecWarningMessage.join(EOL);
    }

    if (manifestWarningMessage.length) {
      details += EOL + manifestWarningMessage.join(EOL);
    }

    if (pluginWarningMessage.length) {
      details += EOL + pluginWarningMessage.join(EOL);
    }

    if (mcpWarningMessage.length) {
      details += EOL + mcpWarningMessage.join(EOL);
    }

    return getLocalizedString("core.copilotPlugin.scaffold.summary", details);
  } else {
    return "";
  }
}

function formatApiSpecValidationWarningMessage(
  specWarnings: Warning[],
  apiSpecFileName: string,
  teamsManifest: TeamsAppManifest
): string[] {
  const resultWarnings = [];
  const operationIdWarning = specWarnings.find((w) => w.type === WarningType.OperationIdMissing);

  if (operationIdWarning) {
    const isApiMe = manifestUtils.parseCommonProperties(teamsManifest).isApiME;
    resultWarnings.push(
      getLocalizedString(
        "core.copilotPlugin.scaffold.summary.warning.operationId",
        `${SummaryConstant.Info} ${operationIdWarning.content}`,
        isApiMe ? ManifestTemplateFileName : apiSpecFileName
      )
    );
  }

  const swaggerWarning = specWarnings.find((w) => w.type === WarningType.ConvertSwaggerToOpenAPI);

  if (swaggerWarning) {
    resultWarnings.push(
      `${SummaryConstant.Info} ` +
        getLocalizedString(
          "core.copilotPlugin.scaffold.summary.warning.swaggerVersion",
          apiSpecFileName
        )
    );
  }

  const spec31Warning = specWarnings.find((w) => w.type === WarningType.OpenAPI31ConvertTo30);
  if (spec31Warning) {
    resultWarnings.push(
      `${SummaryConstant.Info} ` +
        getLocalizedString(
          "core.copilotPlugin.scaffold.summary.warning.spec31ConvertTo30",
          apiSpecFileName
        )
    );
  }

  const specialCharactersWarnings = specWarnings.filter(
    (w) => w.type === WarningType.OperationIdContainsSpecialCharacters
  );

  specialCharactersWarnings.forEach((warning) => {
    resultWarnings.push(
      `${SummaryConstant.Info} ` +
        getLocalizedString(
          "core.copilotPlugin.scaffold.summary.warning.operationIdContainsSpecialCharacters",
          warning.data,
          warning.data.replace(/[^a-zA-Z0-9]/g, "_")
        )
    );
  });

  return resultWarnings;
}

function validateTeamsManifestLength(
  teamsManifest: TeamsAppManifest,
  warnings: Warning[]
): string[] {
  const nameShortLimit = 30;
  const nameFullLimit = 100;
  const descriptionShortLimit = 80;
  const descriptionFullLimit = 4000;
  const appnameSuffixPlaceholder = "${{APP_NAME_SUFFIX}}";
  const devEnv = "dev";
  const resultWarnings = [];

  // validate name
  const shortNameLength = teamsManifest.name.short.includes(appnameSuffixPlaceholder)
    ? teamsManifest.name.short.length - appnameSuffixPlaceholder.length + devEnv.length
    : teamsManifest.name.short.length;
  if (shortNameLength > nameShortLimit) {
    resultWarnings.push(formatLengthExceedingErrorMessage("/name/short", nameShortLimit));
  }

  if (!!teamsManifest.name.full && teamsManifest.name.full?.length > nameFullLimit) {
    resultWarnings.push(formatLengthExceedingErrorMessage("/name/full", nameFullLimit));
  }

  // validate description
  if (teamsManifest.description.short.length > descriptionShortLimit) {
    resultWarnings.push(
      formatLengthExceedingErrorMessage("/description/short", descriptionShortLimit)
    );
  }
  if (!teamsManifest.description.full?.length) {
    resultWarnings.push(
      getLocalizedString(
        "core.copilotPlugin.scaffold.summary.warning.teamsManifest.missingFullDescription"
      ) +
        getLocalizedString(
          "core.copilotPlugin.scaffold.summary.warning.teamsManifest.mitigation",
          "full/description",
          path.join(AppPackageFolderName, ManifestTemplateFileName)
        )
    );
  }
  if (teamsManifest.description.full!.length > descriptionFullLimit) {
    resultWarnings.push(
      formatLengthExceedingErrorMessage("/description/full", descriptionFullLimit)
    );
  }

  // validate command
  if (manifestUtils.parseCommonProperties(teamsManifest).isApiME) {
    const optionalParamsOnlyWarnings = warnings.filter(
      (o) => o.type === WarningType.OperationOnlyContainsOptionalParam
    );

    if (optionalParamsOnlyWarnings) {
      for (const optionalParamsOnlyWarning of optionalParamsOnlyWarnings) {
        resultWarnings.push(
          getLocalizedString(
            "core.copilotPlugin.scaffold.summary.warning.api.optionalParametersOnly",
            optionalParamsOnlyWarning.data.commandId,
            optionalParamsOnlyWarning.data.commandId
          ) +
            getLocalizedString(
              "core.copilotPlugin.scaffold.summary.warning.api.optionalParametersOnly.mitigation",
              optionalParamsOnlyWarning.data.parameterName,
              optionalParamsOnlyWarning.data.commandId,
              path.join(AppPackageFolderName, ManifestTemplateFileName),
              path.join(
                AppPackageFolderName,
                teamsManifest.composeExtensions![0].apiSpecificationFile ?? ""
              )
            )
        );
      }
    }

    const commands = teamsManifest.composeExtensions![0].commands;

    for (const command of commands) {
      if (command.type === "query") {
        if (!command.apiResponseRenderingTemplateFile) {
          const errorDetail = warnings.find(
            (w) => w.type === WarningType.GenerateCardFailed && w.data === command.id
          )?.content;
          resultWarnings.push(
            getLocalizedString(
              "core.copilotPlugin.scaffold.summary.warning.teamsManifest.missingCardTemlate",
              "apiResponseRenderingTemplateFile",
              command.id
            ) +
              getLocalizedString(
                "core.copilotPlugin.scaffold.summary.warning.teamsManifest.missingCardTemlate.mitigation",
                AppPackageFolderName,
                `composeExtensions/commands/${command.id}/apiResponseRenderingTemplateFile`,
                path.join(AppPackageFolderName, ManifestTemplateFileName)
              ) +
              (errorDetail ? EOL + errorDetail : "")
          );
        }
      }
    }
  }

  return resultWarnings;
}

async function validatePluginManifestLength(
  pluginManifestPath: string,
  projectPath: string
): Promise<string[]> {
  const resultWarnings: string[] = [];

  const manifestRes = await pluginManifestUtils.readPluginManifestFile(
    path.join(projectPath, pluginManifestPath)
  );
  if (manifestRes.isErr()) {
    sendTelemetryErrorEvent(
      "spec-generator",
      telemetryEvents.failedToGetGenerateWarning,
      manifestRes.error
    );
    return [];
  }

  // validate function description
  const functions = manifestRes.value.functions;
  if (functions) {
    functions.forEach((func) => {
      if (!func.description) {
        resultWarnings.push(
          getLocalizedString(
            "core.copilotPlugin.scaffold.summary.warning.pluginManifest.missingFunctionDescription",
            func.name
          ) +
            getLocalizedString(
              "core.copilotPlugin.scaffold.summary.warning.pluginManifest.missingFunctionDescription.mitigation",
              func.name,
              pluginManifestPath
            )
        );
      }
    });
  }
  return resultWarnings;
}

function formatLengthExceedingErrorMessage(field: string, limit: number): string {
  return (
    getLocalizedString(
      "core.copilotPlugin.scaffold.summary.warning.teamsManifest.lengthExceeding",
      field,
      limit.toString()
    ) +
    getLocalizedString(
      "core.copilotPlugin.scaffold.summary.warning.teamsManifest.mitigation",
      field,
      path.join(AppPackageFolderName, ManifestTemplateFileName)
    )
  );
}

export function convertSpecParserErrorToFxError(error: SpecParserError): FxError {
  return new SystemError(
    SpecParserSource,
    error.errorType.toString(),
    error.message,
    error.message
  );
}

export function formatValidationErrors(
  errors: ApiSpecErrorResult[],
  inputs: Inputs
): ApiSpecErrorResult[] {
  return errors.map((error) => {
    return {
      type: error.type,
      content: formatValidationErrorContent(error, inputs),
      data: error.data,
    };
  });
}

function mapInvalidReasonToMessage(reason: ErrorType): string {
  switch (reason) {
    case ErrorType.AuthTypeIsNotSupported:
      return getLocalizedString("core.common.invalidReason.AuthTypeIsNotSupported");
    case ErrorType.MissingOperationId:
      return getLocalizedString("core.common.invalidReason.MissingOperationId");
    case ErrorType.PostBodyContainMultipleMediaTypes:
      return getLocalizedString("core.common.invalidReason.PostBodyContainMultipleMediaTypes");
    case ErrorType.ResponseContainMultipleMediaTypes:
      return getLocalizedString("core.common.invalidReason.ResponseContainMultipleMediaTypes");
    case ErrorType.ResponseJsonIsEmpty:
      return getLocalizedString("core.common.invalidReason.ResponseJsonIsEmpty");
    case ErrorType.PostBodyContainsRequiredUnsupportedSchema:
      return getLocalizedString(
        "core.common.invalidReason.PostBodyContainsRequiredUnsupportedSchema"
      );
    case ErrorType.ParamsContainRequiredUnsupportedSchema:
      return getLocalizedString("core.common.invalidReason.ParamsContainRequiredUnsupportedSchema");
    case ErrorType.ExceededRequiredParamsLimit:
      return getLocalizedString("core.common.invalidReason.ExceededRequiredParamsLimit");
    case ErrorType.NoParameter:
      return getLocalizedString("core.common.invalidReason.NoParameter");
    case ErrorType.NoAPIInfo:
      return getLocalizedString("core.common.invalidReason.NoAPIInfo");
    case ErrorType.MethodNotAllowed:
      return getLocalizedString("core.common.invalidReason.MethodNotAllowed");
    case ErrorType.UrlPathNotExist:
      return getLocalizedString("core.common.invalidReason.UrlPathNotExist");
    case ErrorType.CircularReferenceNotSupported:
      return getLocalizedString("core.common.invalidReason.CircularReference");
    default:
      return reason.toString();
  }
}

function formatValidationErrorContent(error: ApiSpecErrorResult, inputs: Inputs): string {
  const isPlugin = inputs[QuestionNames.ActionType] === DeclarativeAgentApiSpecOptionId;
  try {
    switch (error.type) {
      case ErrorType.SpecNotValid: {
        let content: string = error.content;
        if (error.content.startsWith("ResolverError: Error downloading")) {
          content = error.content
            .split("\n")
            .map((o) => o.trim())
            .join(". ");
          content = `${content}. ${getLocalizedString("core.common.ErrorFetchApiSpec")}`;
        }
        return content;
      }

      case ErrorType.RemoteRefNotSupported:
        return getLocalizedString("core.common.RemoteRefNotSupported", error.data.join(", "));
      case ErrorType.NoServerInformation:
        return getLocalizedString("core.common.NoServerInformation");
      case ErrorType.UrlProtocolNotSupported:
        return getLocalizedString("core.common.UrlProtocolNotSupported", error.data);
      case ErrorType.RelativeServerUrlNotSupported:
        return getLocalizedString("core.common.RelativeServerUrlNotSupported");
      case ErrorType.NoSupportedApi:
        const messages = [];
        const invalidAPIInfo = error.data as InvalidAPIInfo[];
        for (const info of invalidAPIInfo) {
          const mes = `${info.api}: ${info.reason.map(mapInvalidReasonToMessage).join(", ")}`;
          messages.push(mes);
        }

        if (messages.length === 0) {
          messages.push(getLocalizedString("core.common.invalidReason.NoAPIs"));
        }
        return isPlugin
          ? getLocalizedString("core.common.NoSupportedApiCopilot", messages.join("\n"))
          : getLocalizedString("core.common.NoSupportedApi", messages.join("\n"));
      case ErrorType.NoExtraAPICanBeAdded:
        return isPlugin
          ? getLocalizedString("error.copilot.noExtraAPICanBeAdded")
          : getLocalizedString("error.apime.noExtraAPICanBeAdded");
      case ErrorType.ResolveServerUrlFailed:
        return error.content;
      case ErrorType.Cancelled:
        return getLocalizedString("core.common.CancelledMessage");
      case ErrorType.SwaggerNotSupported:
        return getLocalizedString("core.common.SwaggerNotSupported");
      case ErrorType.SpecVersionNotSupported:
        return getLocalizedString("core.common.SpecVersionNotSupported", error.data);
      case ErrorType.AddedAPINotInOriginalSpec:
        return getLocalizedString("core.common.AddedAPINotInOriginalSpec");

      default:
        return error.content;
    }
  } catch (e) {
    return error.content;
  }
}

interface SpecObject {
  pathUrl: string;
  method: string;
  item: OpenAPIV3.OperationObject;
  auth: boolean;
}

function parseSpec(spec: OpenAPIV3.Document): [SpecObject[], boolean] {
  const res: SpecObject[] = [];
  let needAuth = false;

  const paths = spec.paths;
  if (paths) {
    for (const pathUrl in paths) {
      const pathItem = paths[pathUrl];
      if (pathItem) {
        const operations = pathItem;
        for (const method in operations) {
          if (ConstantString.AllOperationMethods.includes(method)) {
            const operationItem = (operations as any)[method] as OpenAPIV3.OperationObject;
            if (operationItem) {
              const authResult = Utils.getAuthArray(operationItem.security, spec);
              const hasAuth = authResult.length != 0;
              if (hasAuth) {
                needAuth = true;
              }
              res.push({
                item: operationItem,
                method: method,
                pathUrl: pathUrl,
                auth: hasAuth,
              });
            }
          }
        }
      }
    }
  }

  return [res, needAuth];
}

const commonLanguages = [
  ProgrammingLanguage.TS,
  ProgrammingLanguage.JS,
  ProgrammingLanguage.PY,
  ProgrammingLanguage.CSharp,
];

async function updatePromptForCustomApi(
  spec: OpenAPIV3.Document,
  language: string,
  chatFolder: string,
  promptFileName: string
): Promise<void> {
  if (commonLanguages.includes(language as ProgrammingLanguage)) {
    const object = `{ "path": null, "body": null, "query": null }`;
    const cSharpObject = `{ "path": {}, "query": {} }`;
    const promptFilePath = path.join(chatFolder, promptFileName);
    const prompt = `The following is a conversation with an AI assistant.\nThe assistant can help to call APIs for the open api spec file${
      spec.info.description ? ". " + spec.info.description : "."
    }\nIf the API doesn't require parameters, invoke it with default JSON object ${
      (language as ProgrammingLanguage) === ProgrammingLanguage.CSharp ? cSharpObject : object
    }.\n\n`;
    await fs.writeFile(promptFilePath, prompt, { encoding: "utf-8", flag: "w" });
  }
}

async function updateAdaptiveCardForCustomApi(
  specItems: SpecObject[],
  language: string,
  destinationPath: string
): Promise<WarningResult[]> {
  const warnings: WarningResult[] = [];
  if (commonLanguages.includes(language as ProgrammingLanguage)) {
    let adaptiveCardsFolderPath = path.join(destinationPath, "src", "adaptiveCards");
    if (language === ProgrammingLanguage.CSharp) {
      adaptiveCardsFolderPath = path.join(destinationPath, "adaptiveCards");
    }
    await fs.ensureDir(adaptiveCardsFolderPath);

    for (const item of specItems) {
      const name = item.item.operationId!.replace(/[^a-zA-Z0-9]/g, "_");
      try {
        const [card, jsonPath, jsonData, generateWarnings] =
          AdaptiveCardGenerator.generateAdaptiveCard(item.item, true, 5);
        if (jsonPath !== "$" && card.body && card.body[0] && (card.body[0] as any).$data) {
          (card.body[0] as any).$data = `\${${jsonPath}}`;
        }
        const cardFilePath = path.join(adaptiveCardsFolderPath, `${name}.json`);
        const jsonDataPath = path.join(adaptiveCardsFolderPath, `${name}.data.json`);
        await fs.writeFile(cardFilePath, JSON.stringify(card, null, 2));
        await fs.writeFile(jsonDataPath, JSON.stringify(jsonData, null, 2));

        generateWarnings.forEach((w) => {
          warnings.push({
            type: WarningType.GenerateJsonDataFailed,
            // TODO: move message to package.nls.json file
            content: util.format(
              "Failed to create the adaptive card mock data for API '%s': %s. Mitigation: Not required but you can manually add it to the adaptiveCards folder.",
              item.item.operationId,
              w.content
            ),
            data: item.item.operationId,
          });
        });
      } catch (err) {
        warnings.push({
          type: WarningType.GenerateCardFailed,
          content: getLocalizedString(
            "core.copilotPlugin.scaffold.summary.warning.generate.ac.failed",
            item.item.operationId,
            err.message
          ),
          data: item.item.operationId,
        });
      }
    }
  }
  return warnings;
}

function filterSchema(schema: OpenAPIV3.SchemaObject): OpenAPIV3.SchemaObject {
  const filteredSchema: any = { type: schema.type };

  if (schema.description) {
    filteredSchema.description = schema.description;
  }

  if (schema.type === "object" && schema.properties) {
    filteredSchema.properties = {};
    filteredSchema.required = schema.required;
    for (const key in schema.properties) {
      const property = schema.properties[key] as OpenAPIV3.SchemaObject;
      if (property.type === "object") {
        filteredSchema.properties[key] = filterSchema(property as OpenAPIV3.SchemaObject);
        filteredSchema.required = schema.required;
      } else if (property.type === "array") {
        filteredSchema.properties[key] = {
          type: "array",
          items: filterSchema(property.items as OpenAPIV3.SchemaObject),
          description: property.description,
        };
      } else {
        filteredSchema.properties[key] = {
          type: property.type,
          description: property.description,
        };
      }
    }
  } else if (schema.type === "array" && schema.items) {
    filteredSchema.items = filterSchema(schema.items as OpenAPIV3.SchemaObject);
  }

  return filteredSchema;
}

async function updateActionForCustomApi(
  specItems: SpecObject[],
  language: string,
  chatFolder: string
): Promise<void> {
  if (commonLanguages.includes(language as ProgrammingLanguage)) {
    const actionsFilePath = path.join(chatFolder, "functions.json");
    const actions = [];

    for (const item of specItems) {
      const parameters: any = {
        type: "object",
        properties: {} as OpenAPIV3.SchemaObject,
        required: [],
      };

      const paramObject = item.item.parameters as OpenAPIV3.ParameterObject[];
      if (paramObject) {
        for (let i = 0; i < paramObject.length; i++) {
          const param = paramObject[i];
          const schema = param.schema as OpenAPIV3.SchemaObject;
          const paramType = param.in;

          if (!parameters.properties[paramType]) {
            parameters.properties[paramType] = {
              type: "object",
              properties: {},
              required: [],
            };
          }
          parameters.properties[paramType].properties[param.name] = filterSchema(schema);
          parameters.properties[paramType].properties[param.name].description =
            param.description ?? "";
          if (param.required) {
            parameters.properties[paramType].required.push(param.name);
            if (!parameters.required.includes(paramType)) {
              parameters.required.push(paramType);
            }
          }
        }
      }

      const requestBody = item.item.requestBody as OpenAPIV3.RequestBodyObject;
      if (requestBody) {
        const content = requestBody.content;
        if (content) {
          const contentSchema = content["application/json"].schema as OpenAPIV3.SchemaObject;
          if (Object.keys(contentSchema).length !== 0) {
            parameters.properties["body"] = filterSchema(contentSchema);
            parameters.properties["body"].description = requestBody.description ?? "";
            if (requestBody.required) {
              parameters.required.push("body");
            }
          }
        }
      }

      actions.push({
        name: item.item.operationId,
        description: item.item.description ?? item.item.summary,
        parameters: parameters,
      });
    }

    // Convert actions array to object format for Teams AI v2
    const actionsObject: { [key: string]: any } = {};
    for (const action of actions) {
      if (action.name) {
        actionsObject[action.name] = {
          name: action.name,
          description: action.description,
          parameters: action.parameters,
        };
      }
    }
    await fs.writeFile(actionsFilePath, JSON.stringify(actionsObject, null, 2));
  }
}

const functionDefinitionCode = {
  javascript: `.function(
      functionDefs.{{operationId}}.name,
      functionDefs.{{operationId}}.description,
      functionDefs.{{operationId}}.parameters,
      async (parameter) => {
        const result = await functionHandlers.{{operationId}}Handler(parameter);
        if(result) {
          await send(result);
          return "result showed";
        } else {
          return "no result";
        }
      }
  )`,
  typescript: `.function(
      functionDefs.{{operationId}}.name,
      functionDefs.{{operationId}}.description,
      functionDefs.{{operationId}}.parameters,
      async (parameter) => {
        const result = await functionHandlers.{{operationId}}Handler(parameter);
        if(result) {
          await send(result);
          return "result showed";
        } else {
          return "no result";
        }
      }
  )`,
  cs: `       
        var {{operationId}}SchemaJson = FunctionDefinitionLoader.FunctionDefinitions["{{operationId}}"]["parameters"].ToJsonString();
        JsonSchema {{operationId}}Schema = JsonSchema.FromText({{operationId}}SchemaJson);
        prompt.Functions.Add(new Function(FunctionDefinitionLoader.FunctionDefinitions["{{operationId}}"]["name"].ToString(),
        FunctionDefinitionLoader.FunctionDefinitions["{{operationId}}"]["description"].ToString(),
        {{operationId}}Schema, (IDictionary<string, object?> args) => handlers.{{functionName}}(args).GetAwaiter().GetResult()));`,
  python: `.with_function(
      Function(
            name=function_defs["{{operationId}}"]["name"],
            description=function_defs["{{operationId}}"]["description"],
            parameter_schema=function_defs["{{operationId}}"]["parameters"],
            handler=make_handler({{operationId}}, ctx)
      )
    )`,
};

const functionHandlerCode = {
  javascript: `const {{operationId}}Handler = async (
  parameters
) => {
  const client = await api.getClient();
  // Add authentication configuration for the client
  const apiPath = client.paths["{{pathUrl}}"];
  if (apiPath && apiPath.{{method}}) {
    const result = await apiPath.{{method}}(parameters.path, parameters.body, {
      params: parameters.query,
    });
    if (!result || !result.data) {
      throw new Error("Get empty result from api call.");
    }
    const cardName = "{{operationId}}".replace(/[^a-zA-Z0-9]/g, "_");
    const cardTemplatePath = path.join(__dirname, '../adaptiveCards', cardName + '.json');
    if (await fs.exists(cardTemplatePath)){
      const card = generateAdaptiveCard(cardTemplatePath, result);
      return card;
    } else {
      return JSON.stringify(result.data);
    }
  } else {
    return "";
  }

};

module.exports = { {{operationId}}Handler };`,
  typescript: `export const {{operationId}}Handler = async (
  parameter: any
) => {
  const client = await api.getClient();
  // Add authentication configuration for the client
  const apiPath = client.paths["{{pathUrl}}"];
  if (apiPath && apiPath.{{method}}) {
    const result = await apiPath.{{method}}(parameter.path, parameter.body, {
      params: parameter.query,
    });
    if (!result || !result.data) {
      throw new Error("Get empty result from api call.");
    }
    const cardName = "{{operationId}}".replace(/[^a-zA-Z0-9]/g, "_");
    const cardTemplatePath = path.join(__dirname, '../adaptiveCards', cardName + '.json');
    if (await fs.exists(cardTemplatePath)){
      const card = generateAdaptiveCard(cardTemplatePath, result);
      return card;
    } else {
      return JSON.stringify(result.data);
    }
  } else {
    return "";
  }
    
};`,
  cs: `
      public async Task<string> {{functionName}}(IDictionary<string, object?> args)
      {
          try
          {
              RequestParams requestParam = ParseRequestParams(args);
              var response = await Client.CallAsync("{{apiPath}}", Method.{{apiMethod}}, requestParam);
              var data = response.Content;

              var cardTemplatePath = "./adaptiveCards/{{operationId}}.json";
              if (File.Exists(cardTemplatePath)) {
                  var card = RenderCard(cardTemplatePath, data);
                  await context.Send(new MessageActivity().AddAttachment(System.Text.Json.JsonSerializer.Deserialize<Microsoft.Teams.Cards.AdaptiveCard>(card)));
              }
              else
              {
                  await context.Send(data);
              }
          }
          catch (Exception ex)
          {
              Console.WriteLine(ex.Message);
          }

          return "results are shown already. completed.";
      }
`,
  python: `async def {{operationId}}(
  parameters,
):
  path = getattr(parameters, "path", {})
  body = getattr(parameters, "body", None)
  query = getattr(parameters, "query", {}) or {}
  resp = client.{{operationId}}(**path, json=body, _headers={}, _params=query, _cookies={})

  if resp.status_code != 200:
    return resp.reason
  else:
    card_template_path = os.path.join(current_dir, 'adaptiveCards/{{operationId}}.json')
    if not os.path.exists(card_template_path):
      json_resoponse_str = resp.text
      return json_resoponse_str
    else:
      with open(card_template_path) as card_template_file:
        adaptive_card_template = card_template_file.read()

      renderer = AdaptiveCardRenderer(adaptive_card_template)

      json_resoponse_str = resp.text
      rendered_card_str = renderer.render(json_resoponse_str)
      rendered_card_json = json.loads(rendered_card_str)
      return AdaptiveCard.model_validate(rendered_card_json)
  `,
};

const AuthCode = {
  javascript: {
    actionCode: `addAuthConfig(client);`,
    actionPlaceholder: `// Add authentication configuration for the client`,
  },
  typescript: {
    actionCode: `addAuthConfig(client);`,
    actionPlaceholder: `// Add authentication configuration for the client`,
  },
};

async function updateCodeForCustomApi(
  specItems: SpecObject[],
  language: string,
  destinationPath: string,
  openapiSpecFileName: string
): Promise<void> {
  if (language === ProgrammingLanguage.JS || language === ProgrammingLanguage.TS) {
    const appFolderPath = path.join(destinationPath, "src", "app");
    const functionDefinitionTemplate =
      functionDefinitionCode[language === ProgrammingLanguage.JS ? "javascript" : "typescript"];
    const functionHandlerTemplate =
      functionHandlerCode[language === ProgrammingLanguage.JS ? "javascript" : "typescript"];
    const authCodeTemplate =
      AuthCode[language === ProgrammingLanguage.JS ? "javascript" : "typescript"];
    const appFilePath = path.join(
      appFolderPath,
      language === ProgrammingLanguage.JS ? "app.js" : "app.ts"
    );
    const handlerFilePath = path.join(
      appFolderPath,
      language === ProgrammingLanguage.JS ? "handlers.js" : "handlers.ts"
    );
    const functionDefinitionsCode = [];
    const functionHandlersCode = [];
    for (const item of specItems) {
      const auth = item.auth;
      functionDefinitionsCode.push(
        functionDefinitionTemplate.replace(/{{operationId}}/g, item.item.operationId!)
      );
      functionHandlersCode.push(
        functionHandlerTemplate
          .replace(authCodeTemplate.actionPlaceholder, auth ? authCodeTemplate.actionCode : "")
          .replace(/{{operationId}}/g, item.item.operationId!)
          .replace(/{{pathUrl}}/g, item.pathUrl)
          .replace(/{{method}}/g, item.method)
      );
    }

    const appFileContent = (await fs.readFile(appFilePath)).toString();
    const updatedAppFileContent = appFileContent.replace(
      "// Replace with function definition code",
      `${functionDefinitionsCode.join("\n")};`
    );
    await fs.writeFile(appFilePath, updatedAppFileContent);

    const handlerFileContent = (await fs.readFile(handlerFilePath)).toString();
    const updatedHandlerFileContent = handlerFileContent
      .replace("{{OPENAPI_SPEC_PATH}}", openapiSpecFileName)
      .replace("// Replace with function handler code", functionHandlersCode.join("\t\t\n"));
    await fs.writeFile(handlerFilePath, updatedHandlerFileContent);
  } else if (language === ProgrammingLanguage.PY) {
    const appFolderPath = path.join(destinationPath, "src");
    const functionDefinitionTemplate = functionDefinitionCode["python"];
    const functionHandlerTemplate = functionHandlerCode["python"];

    const appFilePath = path.join(appFolderPath, "app.py");
    const handlerFilePath = path.join(appFolderPath, "handlers.py");
    const functionDefinitionsCode = [];
    const functionHandlersCode = [];
    const operationIds: string[] = [];
    for (const item of specItems) {
      functionDefinitionsCode.push(
        functionDefinitionTemplate.replace(/{{operationId}}/g, item.item.operationId!)
      );
      functionHandlersCode.push(
        functionHandlerTemplate
          .replace(/{{operationId}}/g, item.item.operationId!)
          .replace(/{{pathUrl}}/g, item.pathUrl)
          .replace(/{{method}}/g, item.method)
      );
      operationIds.push(`${item.item.operationId!}`);
    }

    const appFileContent = (await fs.readFile(appFilePath)).toString();
    const updatedAppFileContent = appFileContent
      .replace(
        "// Replace with function definition code",
        `prompt${functionDefinitionsCode.join("")}`
      )
      .replace("//Replace with functions to be imported", `${operationIds.join(", ")}`);
    await fs.writeFile(appFilePath, updatedAppFileContent);

    const handlerFileContent = (await fs.readFile(handlerFilePath)).toString();
    const updatedHandlerFileContent = handlerFileContent
      .replace("{{OPENAPI_SPEC_PATH}}", openapiSpecFileName)
      .replace("// Replace with function handler code", functionHandlersCode.join("\t\t\n"));
    await fs.writeFile(handlerFilePath, updatedHandlerFileContent);
  } else if (language === ProgrammingLanguage.CSharp) {
    const functionDefinitionsCode = [];
    const functionHandlersCode = [];
    const functionDefinitionTemplate = functionDefinitionCode["cs"];
    const functionHandlerTemplate = functionHandlerCode["cs"];
    for (const item of specItems) {
      functionDefinitionsCode.push(
        functionDefinitionTemplate
          .replace(/{{operationId}}/g, item.item.operationId!)
          .replace(/{{functionName}}/g, Utils.updateFirstLetter(item.item.operationId!))
      );
      const code = functionHandlerTemplate
        .replace(/{{operationId}}/g, item.item.operationId!)
        .replace(/{{apiPath}}/g, item.pathUrl)
        .replace(/{{apiMethod}}/g, Utils.updateFirstLetter(item.method))
        .replace(/{{functionName}}/g, Utils.updateFirstLetter(item.item.operationId!));
      functionHandlersCode.push(code);
    }

    const controllerFilePath = path.join(destinationPath, "Controllers", "Controller.cs");
    const controllerFileContent = (await fs.readFile(controllerFilePath)).toString();
    const updatedControllerFileContent = controllerFileContent.replace(
      "// Replace with function definition code",
      `${functionDefinitionsCode.join("\n")};`
    );
    await fs.writeFile(controllerFilePath, updatedControllerFileContent);

    const handlerFilePath = path.join(destinationPath, "Functions", "Handlers.cs");
    const handlerFileContent = (await fs.readFile(handlerFilePath)).toString();
    const updatedHandlerFileContent = handlerFileContent.replace(
      "// Replace with function handler code",
      `${functionHandlersCode.join("\n")}`
    );
    await fs.writeFile(handlerFilePath, updatedHandlerFileContent);

    const startFilePath = path.join(destinationPath, "Program.cs");
    const startFileContent = (await fs.readFile(startFilePath)).toString();
    const updatedStartFileContent = startFileContent.replace(
      "{{OPENAPI_SPEC_PATH}}",
      "apiSpecificationFile/" + openapiSpecFileName
    );
    await fs.writeFile(startFilePath, updatedStartFileContent);

    const files = await fs.readdir(destinationPath);
    const projectFileName = files.find((file) => file.endsWith(".csproj"));
    const projectFilePath = path.join(destinationPath, projectFileName!);
    const projectFileContent = (await fs.readFile(projectFilePath)).toString();
    const updateProjectFileContent = projectFileContent.replace(
      /{{OPENAPI_SPEC_PATH}}/g,
      openapiSpecFileName
    );
    await fs.writeFile(projectFilePath, updateProjectFileContent);
  }
}

export async function updateForCustomApi(
  spec: OpenAPIV3.Document,
  language: string,
  destinationPath: string,
  openapiSpecFileName: string
): Promise<WarningResult[]> {
  const warnings: WarningResult[] = [];
  let chatFolder = path.join(destinationPath, "src", "app");
  if (language === ProgrammingLanguage.CSharp) {
    chatFolder = path.join(destinationPath, "Functions");
  } else if (language === ProgrammingLanguage.PY) {
    chatFolder = path.join(destinationPath, "src");
  }
  await fs.ensureDir(chatFolder);

  // 1. update prompt folder
  await updatePromptForCustomApi(spec, language, chatFolder, "instructions.txt");

  const [specItems, needAuth] = parseSpec(spec);

  // 2. update adaptive card folder
  const generateWarnings = await updateAdaptiveCardForCustomApi(
    specItems,
    language,
    destinationPath
  );

  warnings.push(...generateWarnings);

  // 3. update actions file
  await updateActionForCustomApi(specItems, language, chatFolder);

  // 4. update code
  await updateCodeForCustomApi(specItems, language, destinationPath, openapiSpecFileName);

  // 5. add prompt suggestions
  const manifestPath = path.join(destinationPath, AppPackageFolderName, ManifestTemplateFileName);
  await updatePromptSuggestions(specItems, manifestPath);

  return warnings;
}

async function updatePromptSuggestions(specItems: SpecObject[], manifestPath: string) {
  const descriptions: string[] = specItems
    .map((item) => item.item.summary ?? item.item.description)
    .filter((item): item is string => item !== undefined)
    .slice(0, 10);

  const manifestRes = await manifestUtils._readAppManifest(manifestPath);
  if (manifestRes.isOk()) {
    const manifest = manifestRes.value;
    manifest.bots![0].commandLists = [
      {
        scopes: [
          "personal",
          ...(featureFlagManager.getBooleanValue(FeatureFlags.CEAEnabled)
            ? ["copilot" as const]
            : []),
        ],
        commands: [
          ...descriptions.map((des) => {
            return {
              title: des.slice(0, 32),
              description: des.slice(0, 128),
            };
          }),
        ],
      },
    ];

    await manifestUtils._writeAppManifest(manifest, manifestPath);
  } else {
    throw manifestRes.error;
  }
}

export function getEnvName(authName: string): string {
  return Utils.getSafeRegistrationIdEnvName(`${authName}_${ConstantString.RegistrationIdPostfix}`);
}

export async function copyKiotaFolder(specPath: string, projectPath: string): Promise<void> {
  const originKiotaFolder = path.join(path.dirname(specPath), "..", ".kiota");
  if (!(await fs.pathExists(originKiotaFolder))) {
    return;
  }

  const destinationKiotaFolder = path.join(projectPath, ".kiota");
  if (await fs.pathExists(destinationKiotaFolder)) {
    return;
  }

  await fs.ensureDir(destinationKiotaFolder);
  await fs.copy(originKiotaFolder, destinationKiotaFolder, { recursive: true });
  return;
}

export async function generateAdaptiveCardInPluginManifestForKiota(
  pluginManifestPath: string,
  specPath: string,
  context: Context
): Promise<void> {
  try {
    const operation = (await listAPIInfo(specPath)).APIs.filter((value) => value.isValid).map(
      (value) => value.api
    );

    const specParser = new SpecParser(specPath, getParserOptions(ProjectType.Copilot, true));
    await specParser.generateAdaptiveCardInPlugin(pluginManifestPath, operation, undefined);
  } catch (error) {
    // create ac error, should not block the whole process
    const errorMsg = getLocalizedString("error.kiota.FailedToCreateAdaptiveCard");
    void context.userInteraction.showMessage("warn", errorMsg, false);
    context.logProvider.warning(errorMsg);
  }
}
