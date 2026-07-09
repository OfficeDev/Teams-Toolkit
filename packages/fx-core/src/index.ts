// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * File structure of this package:
 * ./common: contains common utilities and constants that are shared across different components.
 * ./component: contains the implementation of different components
 * ./core: contains the FxCore class that is the entry points implementing the lifecycle APIs of the Microsoft 365 Agents Toolkit.
 * ./error: contains the error classes used in the Microsoft 365 Agents Toolkit.
 * ./question: contains the question models used in the Microsoft 365 Agents Toolkit.
 * ./ui: contains the UI related components.
 */

import "reflect-metadata";
export { GraphClient } from "./client/graphClient";
export { teamsDevPortalClient } from "./client/teamsDevPortalClient";
export { askSubscription } from "./common/azureUtils";
export {
  AppStudioScopes,
  AuthSvcScopes,
  AzureScopes,
  getAllowedAppMaps,
  GraphReadUserScopes,
  GraphScopes,
  ListSensitivityLabelScope,
  SPFxScopes,
  MosServiceScope,
} from "./common/constants";
export { Correlator } from "./common/correlator";
export {
  featureFlagManager,
  FeatureFlagName,
  FeatureFlags,
  isFeatureFlagEnabled,
} from "./common/featureFlags";
export {
  getEntraEndpoint,
  getDefaultAuthorityUrl,
  getTenantedAuthorityUrl,
  isSovereignHigh,
} from "./common/accountUtils";
export { globalStateGet, globalStateUpdate } from "./common/globalState";
export { AadSet } from "./common/globalVars";
export { getDefaultString, getLocalizedString } from "./common/localizeUtils";
export * from "./common/permissionInterface";
export * from "./common/projectSettingsHelper";
export {
  projectTypeChecker,
  ProjectTypeResult,
  TeamsfxVersionState,
} from "./common/projectTypeChecker";
export { sendRequestWithRetry, sendRequestWithTimeout } from "./common/requestUtils";
export { SampleConfig, sampleProvider, SampleUrlInfo } from "./common/samples";
export {
  convertToAlphanumericOnly,
  getHashedEnv,
  getResourceGroupNameFromResourceId,
  getUuid,
  isValidHttpUrl,
  loadingDefaultPlaceholder,
  loadingOptionsPlaceholder,
  maskSecret,
  MaskSecretOptions,
  parseFromResourceId,
} from "./common/stringUtils";
export { telemetryUtils } from "./common/telemetry";
export {
  getSideloadingStatus,
  getSPFxTenant,
  isSandboxedEnabled,
  isTestToolEnabledProject,
  listDevTunnels,
} from "./common/tools";
export { MetadataV3, VersionState } from "./common/versionMetadata";
export { SummaryConstant } from "./component/configManager/constant";
export { KiotaLastCommands } from "./component/constants";
export { CheckerFactory } from "./component/deps-checker/checkerFactory";
export {
  DepsCheckerEvent,
  TelemetryMessurement,
} from "./component/deps-checker/constant/telemetry";
export { CoreDepsLoggerAdapter } from "./component/deps-checker/coreDepsLoggerAdapter";
export { CoreDepsTelemetryAdapter } from "./component/deps-checker/coreDepsTelemetryAdapter";
export * from "./component/deps-checker/depsChecker";
export { DepsLogger, EmptyLogger } from "./component/deps-checker/depsLogger";
export { DepsManager } from "./component/deps-checker/depsManager";
export { DepsTelemetry, EmptyTelemetry } from "./component/deps-checker/depsTelemetry";
export { FuncToolChecker } from "./component/deps-checker/internal/funcToolChecker";
export { LtsNodeChecker } from "./component/deps-checker/internal/nodeChecker";
export { getPermissionMap } from "./component/driver/aad/permissions/index";
export { AppDefinition } from "./component/driver/teamsApp/interfaces/appdefinitions/appDefinition";
export { copilotGptManifestUtils } from "./component/driver/teamsApp/utils/CopilotGptManifestUtils";
export { manifestUtils } from "./component/driver/teamsApp/utils/ManifestUtils";
export { pluginManifestUtils } from "./component/driver/teamsApp/utils/PluginManifestUtils";
export { DefaultTemplateGenerator } from "./component/generator/defaultGenerator";
export { HelperMethods } from "./component/generator/officeAddin/helperMethods";
export { generateScaffoldingSummary } from "./component/generator/openApiSpec/helper";
export { getAllTemplatesOnPlatform } from "./component/generator/templates/metadata";
export { TemplateInfo } from "./component/generator/templates/templateInfo";
export { getSampleFileInfo, runWithLimitedConcurrency } from "./component/generator/utils";
export * from "./component/local/constants";
export { LocalCertificateManager } from "./component/local/localCertificateManager";
export { LocalEnvManager } from "./component/local/localEnvManager";
export { LocalTelemetryReporter, TelemetryContext } from "./component/local/localTelemetryReporter";
export { loadTeamsFxDevScript } from "./component/local/packageJsonHelper";
export { Hub } from "./component/m365/constants";
export { PackageService } from "./component/m365/packageService";
export * from "./component/middleware/actionExecutionMW";
export { outputScaffoldingWarningMessage } from "./component/utils/common";
export { DotenvOutput, envUtil } from "./component/utils/envUtil";
export { metadataUtil } from "./component/utils/metadataUtil";
export { MCPAuthProbeResult, probeMCPServerAuth } from "./component/utils/mcpToolFetcher";
export { ODRTool, ODRServer, ODRProvider } from "./component/utils/odrProvider";
export { pathUtils } from "./component/utils/pathUtils";
export { newResourceGroupOption, resourceGroupHelper } from "./component/utils/ResourceGroupHelper";
export { CoreCallbackFunc } from "./core/callback";
export { CollaborationConstants } from "./core/collaborator";
export { environmentManager } from "./core/environment";
export { environmentNameManager } from "./core/environmentName";
export { FxCore } from "./core/FxCore";
export { PreProvisionResForVS, VersionCheckRes } from "./core/types";
export * from "./error/index";
export * from "./question/constants";
export * from "./question/inputs";
export * from "./question/options";
export { VSCapabilityOptions } from "./question/scaffold/vs/createRootNode";
export {
  BotCapabilityOptions,
  CustomEngineAgentOptions,
  DACapabilityOptions,
  MeCapabilityOptions,
  OfficeAddinCapabilityOptions,
  TabCapabilityOptions,
  TeamsAgentCapabilityOptions,
} from "./question/scaffold/vsc/CapabilityOptions";
export { isTdpTemplate } from "./question/scaffold/vsc/createFromTdpNode";
export { ProjectTypeOptions } from "./question/scaffold/vsc/ProjectTypeOptions";
export { ShareOperationOption } from "./question/share";
export { deriveCreateOptionsFromBundledFloor } from "./v4/surface/deriveCreateOptions";
