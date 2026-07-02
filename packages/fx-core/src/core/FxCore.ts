// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks";
import {
  AuthType,
  ListAPIResult,
  ProjectType,
  SpecParser,
  SpecParserError,
  Utils,
} from "@microsoft/m365-spec-parser";
import {
  ApiOperation,
  AppPackageFolderName,
  BuildFolderName,
  ConfigFolderName,
  Context,
  CoreCallbackEvent,
  CreateProjectInputs,
  CreateProjectResult,
  CryptoProvider,
  Func,
  FxError,
  IGenerator,
  IQTreeNode,
  Inputs,
  InputsWithProjectPath,
  Platform,
  PluginManifestSchema,
  ResponseTemplatesFolderName,
  Result,
  SharePointIDs,
  Site,
  Stage,
  SystemError,
  TeamsAppInputs,
  TeamsAppManifest,
  Tools,
  UserError,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import { DotenvParseOutput } from "dotenv";
import fs from "fs-extra";
import * as jsonschema from "jsonschema";
import * as os from "os";
import * as path from "path";
import "reflect-metadata";
import { Container } from "typedi";
import { pathToFileURL } from "url";
import { teamsDevPortalClient } from "../client/teamsDevPortalClient";
import { ApiKeyParameters, AuthParameters, OAuthParameters } from "../common/authInterface";
import {
  AppStudioScopes,
  MosServiceScope,
  ResourceServiceType,
  VSCodeExtensionCommand,
  getResourceServiceEndpoint,
} from "../common/constants";
import { listAPIInfo, parseAndUpdatePluginManifestForKiota } from "../common/daSpecParser";
import { FeatureFlags, featureFlagManager } from "../common/featureFlags";
import {
  ErrorContextMW,
  TOOLS,
  createContext,
  setErrorContext,
  setTools,
} from "../common/globalVars";
import { clearLocaleCache, getLocalizedString } from "../common/localizeUtils";
import { ListCollaboratorResult, PermissionsResult } from "../common/permissionInterface";
import * as projectSettingsHelper from "../common/projectSettingsHelper";
import {
  getProjectMetadata,
  isValidProjectV3 as isValidProjectV3Internal,
} from "../common/projectSettingsHelper";
import {
  IsDeclarativeAgentManifest,
  ProjectTypeResult,
  projectTypeChecker,
} from "../common/projectTypeChecker";
import { TelemetryEvent, TelemetryProperty, telemetryUtils } from "../common/telemetry";
import templateConfig from "../common/templates-config.json";
import { runForTypeSpecProject } from "../common/tools";
import { generateDriverContext } from "../common/utils";
import { MetadataV3, MetadataV4, VersionSource } from "../common/versionMetadata";

import {
  APIKeyAuthType,
  MicrosoftEntraAuthType,
  OAuthAuthType,
} from "../component/configManager/constant";
import { ILifecycle, LifecycleName } from "../component/configManager/interface";
import { YamlParser } from "../component/configManager/parser";
import { AadConstants, SingleSignOnOptionItem, ViewAadAppHelpLinkV5 } from "../component/constants";
import { coordinator } from "../component/coordinator";
import { UpdateAadAppArgs } from "../component/driver/aad/interface/updateAadAppArgs";
import { UpdateAadAppDriver } from "../component/driver/aad/update";
import { AadManifestHelper } from "../component/driver/aad/utility/aadManifestHelper";
import { buildAadManifest as buildAadManifestInternal } from "../component/driver/aad/utility/buildAadManifest";
import { AddWebPartDriver } from "../component/driver/add/addWebPart";
import { AddWebPartArgs } from "../component/driver/add/interface/AddWebPartArgs";
import { InstallAppToChannelDriver } from "../component/driver/devChannel/installApp";
import { InstallAppArgs } from "../component/driver/devChannel/interfaces/InstallAppArgs";
import "../component/driver/index";
import { DriverContext } from "../component/driver/interface/commonArgs";
import "../component/driver/script/scriptDriver";
import * as shareUtils from "../component/driver/share/utils";
import { updateManifestV3 } from "../component/driver/teamsApp/appStudio";
import { CreateAppPackageDriver } from "../component/driver/teamsApp/createAppPackage";
import { AppStudioError } from "../component/driver/teamsApp/errors";
import { CreateAppPackageArgs } from "../component/driver/teamsApp/interfaces/CreateAppPackageArgs";
import { SyncManifestArgs } from "../component/driver/teamsApp/interfaces/SyncManifest";
import { ValidateAppPackageArgs } from "../component/driver/teamsApp/interfaces/ValidateAppPackageArgs";
import { ValidateManifestArgs } from "../component/driver/teamsApp/interfaces/ValidateManifestArgs";
import { ValidateWithTestCasesArgs } from "../component/driver/teamsApp/interfaces/ValidateWithTestCasesArgs";
import { AppStudioResultFactory } from "../component/driver/teamsApp/results";
import { SyncManifestDriver } from "../component/driver/teamsApp/syncManifest";
import { teamsappMgr } from "../component/driver/teamsApp/teamsappMgr";
import { copilotGptManifestUtils } from "../component/driver/teamsApp/utils/CopilotGptManifestUtils";
import { manifestUtils } from "../component/driver/teamsApp/utils/ManifestUtils";
import { pluginManifestUtils } from "../component/driver/teamsApp/utils/PluginManifestUtils";
import {
  containsUnsupportedFeature,
  getFeaturesFromAppDefinition,
  normalizePath,
} from "../component/driver/teamsApp/utils/utils";
import { ValidateManifestDriver } from "../component/driver/teamsApp/validate";
import { ValidateAppPackageDriver } from "../component/driver/teamsApp/validateAppPackage";
import { ValidateWithTestCasesDriver } from "../component/driver/teamsApp/validateTestCases";
import { createDriverContext } from "../component/driver/util/utils";
import { SSO } from "../component/feature/sso";
import {
  ItemMetadata,
  getODSPItemDetailById,
} from "../component/generator/declarativeAgent/oneDriveSharePointHandler";
import * as openApiSpecHelper from "../component/generator/openApiSpec/helper";
import {
  convertSpecParserErrorToFxError,
  generateAdaptiveCardInPluginManifestForKiota,
  getParserOptions,
} from "../component/generator/openApiSpec/helper";
import * as templateHelper from "../component/generator/templateHelper";
import * as generatorUtils from "../component/generator/utils";
import { resolveV4MetadataSource } from "../component/generator/v4MetadataSource";
import { LaunchHelper } from "../component/m365/launchHelper";
import { PackageService } from "../component/m365/packageService";
import { EnvLoaderMW, EnvWriterMW } from "../component/middleware/envMW";
import { QuestionMW } from "../component/middleware/questionMW";
import { expandEnvironmentVariable } from "../component/utils/common";
import { envUtil } from "../component/utils/envUtil";
import { metadataUtil } from "../component/utils/metadataUtil";
import { pathUtils } from "../component/utils/pathUtils";
import { settingsUtil } from "../component/utils/settingsUtil";
import {
  FileNotFoundError,
  InputValidationError,
  InvalidProjectError,
  MissingRequiredInputError,
  MultipleServerError,
  NeedRedoError,
  UnhandledError,
  UserCancelError,
  assembleError,
  isUserCancelError,
} from "../error/common";
import { YamlFieldMissingError } from "../error/yml";
import { SyncManifestInputs, UninstallInputs } from "../question";
import {
  AddAuthActionAuthTypeOptions,
  AppNamePattern,
  HubTypes,
  KnowledgeSearchTypeOptions,
  KnowledgeSourceOptions,
  MAX_EMAIL_NUMBER,
  QuestionNames,
  SPFxVersionOptionIds,
  ScratchOptions,
  TeamsAppValidationOptions,
} from "../question/constants";
import { ValidateTeamsAppInputs } from "../question/inputs/ValidateTeamsAppInputs";
import { isAadMainifestContainsPlaceholder } from "../question/other";
import { ProjectTypeOptions } from "../question/scaffold/vsc/ProjectTypeOptions";
import { ShareOperationOption, ShareScopeOption } from "../question/share";
import { CallbackRegistry, CoreCallbackFunc } from "./callback";
import * as collaboratorCore from "./collaborator";
import { CollaborationUtil } from "./collaborator";
import { applyV3PreFill, collectCreateFloor, scaffoldV4 } from "./createFrontDoorAdapters";
import { createProjectFrontDoor as runCreateFrontDoor } from "./createProjectFrontDoor";
import { LocalCrypto } from "./crypto";
import { environmentNameManager } from "./environmentName";
import { FxCoreOpenPluginPart } from "./FxCore.openPlugin";
import { generateConfigFiles } from "./generateConfigFiles";
import { resolveV4TemplateArtifactSnapshot } from "./v4ArtifactSnapshot";
import { ConcurrentLockerMW } from "./middleware/concurrentLocker";
import { ContextInjectorMW } from "./middleware/contextInjector";
import { ErrorHandlerMW } from "./middleware/errorHandler";
import { withFileLock } from "./middleware/fileLocker";

import { runWithRetry } from "./middleware/retry";
import * as v3MigrationUtils from "./middleware/utils/v3MigrationUtils";
import * as shareCore from "./share";
import {
  addSharedUsers as addSharedUsersInternal,
  shareWithTenant as shareWithTenantInternal,
} from "./share";
import { CoreTelemetryEvent, CoreTelemetryProperty } from "./telemetry";
import { CoreHookContext, PreProvisionResForVS, VersionCheckRes } from "./types";

export const fxCoreDeps = {
  getCoreVersion: () => require("../../package.json").version as string,
};

const getCoreVersion = () => fxCoreDeps.getCoreVersion();

// Compatibility exports for tests that stub module-level helpers.
export const isValidProjectV3 = isValidProjectV3Internal;
export const buildAadManifest = buildAadManifestInternal;
export const shareWithTenant = shareWithTenantInternal;
export const addSharedUsers = addSharedUsersInternal;
export { getCoreVersion };
export const parseShareAppActionYamlConfig = shareUtils.parseShareAppActionYamlConfig;
export const getManifestPath = copilotGptManifestUtils.getManifestPath;
export const readCopilotGptManifestFile = copilotGptManifestUtils.readCopilotGptManifestFile;

export class FxCore extends FxCoreOpenPluginPart {
  constructor(tools: Tools) {
    super();
    setTools(tools);
  }

  /**
   * @todo this's a really primitive implement. Maybe could use Subscription Model to
   * refactor later.
   */
  public on(event: CoreCallbackEvent, callback: CoreCallbackFunc): void {
    return CallbackRegistry.set(event, callback);
  }

  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "createProject", reset: true }),
    ErrorHandlerMW,
    QuestionMW("createProject"),
  ])
  async createProject(inputs: Inputs): Promise<Result<CreateProjectResult, FxError>> {
    const context = createContext();
    if (inputs[QuestionNames.ProjectType] === ProjectTypeOptions.startWithGithubCopilot().id) {
      return ok({ projectPath: "", shouldInvokeTeamsAgent: true });
    }
    inputs[QuestionNames.Scratch] = ScratchOptions.yes().id;
    const res = await coordinator.create(context, inputs);
    if (res.isOk()) {
      inputs.projectPath = res.value.projectPath;
    }
    return res;
  }

  /**
   * The create front door (operation `dispatch-create-by-engine`): the single
   * entry the create surfaces call in place of `createProject`. Behind
   * `TEAMSFX_V4_ENABLED` it runs the v4 create selector (Q1) and dispatches the
   * resolved `BuildTarget` by engine; flag off it is a pure pass-through to the
   * unmodified `createProject`, so v3 behavior is byte-identical.
   *
   * It drives its own questions (the v4 selector + the template's Q2 + the v4
   * create floor, or the v3 `QuestionMW` reached through `createProject`), so it
   * carries no `QuestionMW`. `FxCore` is the composition root that supplies the
   * four real seams; the orchestrator stays pure and injectable.
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "createProjectFrontDoor", reset: true }),
    ErrorHandlerMW,
  ])
  async createProjectFrontDoor(inputs: Inputs): Promise<Result<CreateProjectResult, FxError>> {
    return runCreateFrontDoor(inputs, {
      createV3: (i) => this.createProject(i),
      scaffoldV4,
      collectCreateFloor,
      applyV3PreFill,
      resolveArtifactSnapshot: resolveV4TemplateArtifactSnapshot,
    });
  }

  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "createProjectFromTdp", reset: true }),
    ErrorHandlerMW,
    QuestionMW("createFromTdp"),
  ])
  async createProjectFromTdp(inputs: Inputs): Promise<Result<CreateProjectResult, FxError>> {
    const context = createContext();
    inputs[QuestionNames.Scratch] = ScratchOptions.yes().id;
    // should never happen as we do same check on Developer Portal.
    if (inputs.teamsAppFromTdp) {
      if (containsUnsupportedFeature(inputs.teamsAppFromTdp)) {
        return err(new InputValidationError("manifest.json", "App contains unsupported features"));
      } else {
        context.telemetryReporter.sendTelemetryEvent(CoreTelemetryEvent.CreateFromTdpStart, {
          [CoreTelemetryProperty.TdpTeamsAppFeatures]: getFeaturesFromAppDefinition(
            inputs.teamsAppFromTdp
          ).join(","),
          [CoreTelemetryProperty.TdpTeamsAppId]: inputs.teamsAppFromTdp.teamsAppId,
        });
      }
    }
    const res = await coordinator.create(context, inputs);
    inputs.projectPath = context.projectPath;
    return res;
  }

  @hooks([
    ErrorContextMW({
      component: "FxCore",
      stage: "createProjectByCustomizedGenerator",
      reset: true,
    }),
    ErrorHandlerMW,
  ])
  async createProjectByCustomizedGenerator(
    inputs: CreateProjectInputs,
    generator: IGenerator
  ): Promise<Result<CreateProjectResult, FxError>> {
    //1. input validation
    let folder = inputs["folder"];
    if (!folder) {
      return err(new MissingRequiredInputError("folder"));
    }
    folder = path.resolve(folder);
    const appName = inputs["app-name"];
    if (undefined === appName) return err(new MissingRequiredInputError(QuestionNames.AppName));
    const validateResult = jsonschema.validate(appName, {
      pattern: AppNamePattern,
    });
    if (validateResult.errors && validateResult.errors.length > 0) {
      return err(new InputValidationError(QuestionNames.AppName, validateResult.errors[0].message));
    }
    const projectPath = path.join(folder, appName);

    //2. run generator
    const context = createContext();
    const genRes = await generator.run(context, inputs, projectPath);
    if (genRes.isErr()) return err(genRes.error);
    //3. ensure unique projectId in teamsapp.yaml (optional)
    const ymlPath = pathUtils.getYmlFilePath(projectPath, "dev") as string;
    const result: CreateProjectResult = { projectPath: projectPath };
    if (await fs.pathExists(ymlPath)) {
      const ensureRes = await coordinator.ensureTrackingId(projectPath, inputs.projectId);
      if (ensureRes.isErr()) return err(ensureRes.error);
      result.projectId = ensureRes.value;
    }
    return ok(result);
  }

  /**
   * lifecycle command: create new sample project
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "createSampleProject", reset: true }),
    ErrorHandlerMW,
    QuestionMW("createSampleProject"),
  ])
  async createSampleProject(inputs: Inputs): Promise<Result<CreateProjectResult, FxError>> {
    const context = createContext();
    inputs[QuestionNames.Scratch] = ScratchOptions.no().id;
    const res = await coordinator.create(context, inputs);
    inputs.projectPath = context.projectPath;
    return res;
  }

  /**
   * Wrapper of provisionResourcesOnce, which will retry if NeedRedoError is thrown.
   */
  async provisionResources(inputs: Inputs): Promise<Result<undefined, FxError>> {
    const res = runWithRetry(
      async () => {
        return this.provisionResourcesOnce(inputs);
      },
      (result, attempt) => result.isErr() && result.error instanceof NeedRedoError
    );
    return res;
  }

  /**
   * lifecycle commands: provision
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "provision", reset: true }),
    ErrorHandlerMW,
    EnvLoaderMW(false),
    ConcurrentLockerMW,
    ContextInjectorMW,
    EnvWriterMW,
  ])
  async provisionResourcesOnce(
    inputs: Inputs,
    ctx?: CoreHookContext
  ): Promise<Result<undefined, FxError>> {
    inputs.stage = Stage.provision;
    const context = createDriverContext(inputs);
    try {
      const res = await coordinator.provision(context, inputs as InputsWithProjectPath);
      if (res.isOk()) {
        ctx!.envVars = res.value;
        return ok(undefined);
      } else {
        // for partial success scenario, output is set in inputs object
        ctx!.envVars = inputs.envVars;
        return err(res.error);
      }
    } finally {
      //reset subscription
      try {
        await TOOLS.tokenProvider.azureAccountProvider.setSubscription("");
      } catch (e) {}
    }
  }

  /**
   * none lifecycle command, uninstall provisioned resources
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "uninstall", reset: true }),
    ErrorHandlerMW,
    QuestionMW("uninstall"),
  ])
  async uninstall(inputs: UninstallInputs): Promise<Result<undefined, FxError>> {
    switch (inputs[QuestionNames.UninstallMode as string]) {
      case QuestionNames.UninstallModeManifestId:
        return await this.uninstallByManifestId(inputs);
      case QuestionNames.UninstallModeEnv:
        return await this.uninstallByEnv(inputs);
      case QuestionNames.UninstallModeTitleId:
        return await this.uninstallByTitleId(inputs);
      default:
        return err(new UnhandledError(new Error("Uninstall mode not supported"), "FxCore"));
    }
  }

  /**
   * uninstall provisioned resources by manifest ID
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "uninstallByManifestId", reset: true }),
    ErrorHandlerMW,
  ])
  async uninstallByManifestId(inputs: UninstallInputs): Promise<Result<undefined, FxError>> {
    const manifestId = inputs[QuestionNames.ManifestId as string] as string;
    if (!manifestId) {
      return err(new MissingRequiredInputError("manifest-id", "FxCore"));
    }
    const uninstallOptions = inputs[QuestionNames.UninstallOptions as string];
    const m356AppOption = uninstallOptions?.includes(QuestionNames.UninstallOptionM365);
    const tdpOption = uninstallOptions?.includes(QuestionNames.UninstallOptionTDP);
    const botOption = uninstallOptions?.includes(QuestionNames.UninstallOptionBot);

    if (m356AppOption) {
      const res = await this.uninstallM365App(undefined, manifestId);
      if (res.isErr()) {
        return err(res.error);
      }
    }
    if (botOption) {
      const res = await this.uninstallBotFrameworRegistration(undefined, manifestId);
      if (res.isErr()) {
        return err(res.error);
      }
    }
    // App registraion should be the last to remove, because we might need to query some metadata from TDP.
    if (tdpOption) {
      const res = await this.uninstallAppRegistration(manifestId);
      if (res.isErr()) {
        return err(res.error);
      }
    }

    return ok(undefined);
  }

  /**
   * uninstall provisioned resources by a given environment
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "uninstallByEnv", reset: true }),
    ErrorHandlerMW,
    EnvLoaderMW(true, true),
    ConcurrentLockerMW,
    ContextInjectorMW,
    EnvWriterMW,
  ])
  async uninstallByEnv(
    inputs: UninstallInputs,
    ctx?: CoreHookContext
  ): Promise<Result<undefined, FxError>> {
    if (!inputs.env) {
      return err(new MissingRequiredInputError("env", "FxCore"));
    }
    const teamsappYamlPath = pathUtils.getYmlFilePath(inputs.projectPath!, inputs.env) as string;
    const yamlProjectModel = await metadataUtil.parse(teamsappYamlPath);
    if (yamlProjectModel.isErr()) {
      return err(yamlProjectModel.error);
    }
    const projectModel = yamlProjectModel.value;

    let teamsAppId;
    let botId;
    let m365TitleId;
    let teamsAppIdKeyName = "";
    let botIdKeyName = "";
    let m365TitleIdKeyName = "";
    for (const action of projectModel.provision?.driverDefs ?? []) {
      if (action.uses === "teamsApp/create") {
        teamsAppIdKeyName = action.writeToEnvironmentFile?.teamsAppId || "TEAMS_APP_ID";
        teamsAppId = process.env[teamsAppIdKeyName];
      } else if (action.uses === "botFramework/create") {
        botIdKeyName = action.writeToEnvironmentFile?.botId || "BOT_ID";
        botId = process.env[botIdKeyName];
      } else if (action.uses === "teamsApp/extendToM365") {
        m365TitleIdKeyName = action.writeToEnvironmentFile?.titleId || "M365_TITLE_ID";
        m365TitleId = process.env[m365TitleIdKeyName];
      }
    }

    const uninstallOptions = inputs[QuestionNames.UninstallOptions as string];
    const m356AppOption = uninstallOptions?.includes(QuestionNames.UninstallOptionM365);
    const tdpOption = uninstallOptions?.includes(QuestionNames.UninstallOptionTDP);
    const botOption = uninstallOptions?.includes(QuestionNames.UninstallOptionBot);

    if ((teamsAppId || m365TitleId) && m356AppOption) {
      const res = await this.uninstallM365App(m365TitleId, teamsAppId);
      if (res.isErr()) {
        return err(res.error);
      }
      this.resetEnvVar(teamsAppIdKeyName, ctx);
      this.resetEnvVar(m365TitleIdKeyName, ctx);
    }
    if (botId && botOption) {
      const res = await this.uninstallBotFrameworRegistration(botId);
      if (res.isErr()) {
        return err(res.error);
      }
      this.resetEnvVar(botIdKeyName, ctx);
    }
    // App registraion should be the last to remove, because we might need to query some metadata from TDP.
    if (teamsAppId && tdpOption) {
      const res = await this.uninstallAppRegistration(teamsAppId);
      if (res.isErr()) {
        return err(res.error);
      }
      this.resetEnvVar(teamsAppIdKeyName, ctx);
    }
    return ok(undefined);
  }
  resetEnvVar(key: string, ctx?: CoreHookContext, skipIfNotExist = true, resetValue = ""): void {
    if (!ctx) {
      return;
    }
    if (!ctx.envVars) {
      ctx.envVars = {};
    }
    if (skipIfNotExist && !ctx.envVars[key]) {
      return;
    }
    ctx.envVars[key] = resetValue;
    return;
  }
  /**
   * uninstall provisioned resources by title ID. Titlle mode only uninstalls M365 app.
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "uninstallByTitleId", reset: true }),
    ErrorHandlerMW,
  ])
  async uninstallByTitleId(inputs: UninstallInputs): Promise<Result<undefined, FxError>> {
    const titleId = inputs[QuestionNames.TitleId as string] as string;
    if (!titleId) {
      return err(new MissingRequiredInputError("title-id", "FxCore"));
    }
    const res = await this.uninstallM365App(titleId);
    if (res.isErr()) {
      return err(res.error);
    }
    return ok(undefined);
  }

  /**
   * uninstall sideloaded appps in M365
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "uninstallM365App", reset: true }),
    ErrorHandlerMW,
  ])
  async uninstallM365App(
    titleId?: string,
    manifestId?: string
  ): Promise<Result<undefined, FxError>> {
    if (titleId === undefined && manifestId === undefined) {
      return err(new MissingRequiredInputError("title id or manifest id", "FxCore"));
    }
    const sideloadingServiceEndpoint = getResourceServiceEndpoint(ResourceServiceType.MOS3);
    const sideloadingTokenRes = await TOOLS.tokenProvider.m365TokenProvider.getAccessToken({
      scopes: MosServiceScope(),
    });
    if (sideloadingTokenRes.isErr()) {
      return err(sideloadingTokenRes.error);
    }
    const packageService = new PackageService(sideloadingServiceEndpoint, TOOLS.logProvider);
    if (titleId === undefined) {
      try {
        titleId = await packageService.retrieveTitleId(sideloadingTokenRes.value, manifestId ?? "");
      } catch (err: any) {
        await TOOLS.ui.showMessage(
          "info",
          getLocalizedString("core.uninstall.failed.titleId"),
          false
        );
        throw assembleError(err);
      }
    }
    const confirmRes = await TOOLS.ui.confirm?.({
      name: "uninstallM365App",
      title: getLocalizedString("core.uninstall.confirm.m365App", titleId),
      default: true,
    });
    if (confirmRes?.isOk() && confirmRes.value.result === true) {
      await packageService.unacquire(sideloadingTokenRes.value, titleId);
      await TOOLS.ui.showMessage(
        "info",
        getLocalizedString("core.uninstall.success.m365App", titleId),
        false
      );
      await TOOLS.ui.showMessage(
        "info",
        getLocalizedString("core.uninstall.success.delayWarning"),
        false
      );
    } else {
      await TOOLS.ui.showMessage(
        "info",
        getLocalizedString("core.uninstall.confirm.cancel.m365App"),
        false
      );
      return err(new UserCancelError("Uninstall M365 App"));
    }
    return ok(undefined);
  }

  /**
   * uninstall sideloaded apps in Teams Developer Portal
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "uninstallAppRegistration", reset: true }),
    ErrorHandlerMW,
  ])
  async uninstallAppRegistration(manifestId: string): Promise<Result<undefined, FxError>> {
    const appStudioTokenRes = await TOOLS.tokenProvider.m365TokenProvider.getAccessToken({
      scopes: AppStudioScopes(),
    });
    if (appStudioTokenRes.isErr()) {
      return err(appStudioTokenRes.error);
    }
    const confirmRes = await TOOLS.ui.confirm?.({
      name: "uninstallAppRegistration",
      title: getLocalizedString("core.uninstall.confirm.tdp", manifestId),
      default: true,
    });
    if (confirmRes?.isOk() && confirmRes.value.result === true) {
      const token = appStudioTokenRes.value;
      await teamsDevPortalClient.deleteApp(token, manifestId);
      await TOOLS.ui.showMessage(
        "info",
        getLocalizedString("core.uninstall.success.tdp", manifestId),
        false
      );
      return ok(undefined);
    } else {
      await TOOLS.ui.showMessage(
        "info",
        getLocalizedString("core.uninstall.confirm.cancel.tdp"),
        false
      );
      return err(new UserCancelError("Uninstall App Registration"));
    }
  }

  /**
   * uninstall bots created in dev.botframework.com
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "uninstallBotFrameworRegistration", reset: true }),
    ErrorHandlerMW,
  ])
  async uninstallBotFrameworRegistration(
    botId?: string,
    manifestId?: string
  ): Promise<Result<undefined, FxError>> {
    if (!botId && !manifestId) {
      return err(new MissingRequiredInputError("bot id or manifest id", "FxCore"));
    }
    const appStudioTokenRes = await TOOLS.tokenProvider.m365TokenProvider.getAccessToken({
      scopes: AppStudioScopes(),
    });
    if (appStudioTokenRes.isErr()) {
      return err(appStudioTokenRes.error);
    }
    const token = appStudioTokenRes.value;
    if (!botId) {
      const botIdRes = await teamsDevPortalClient.getBotId(token, manifestId!);
      if (!botIdRes) {
        const msg = getLocalizedString("core.uninstall.botNotFound", manifestId!);
        return err(new UserError("FxCore", "Uninstall", msg, msg));
      }
      botId = botIdRes;
    }
    const confirmRes = await TOOLS.ui.confirm?.({
      name: "uninstallBotFrameworRegistration",
      title: getLocalizedString("core.uninstall.confirm.bot", botId),
      default: true,
    });
    if (confirmRes?.isOk() && confirmRes.value.result === true) {
      await teamsDevPortalClient.deleteBot(token, botId);
      await TOOLS.ui.showMessage(
        "info",
        getLocalizedString("core.uninstall.success.bot", botId),
        false
      );
    } else {
      await TOOLS.ui.showMessage(
        "info",
        getLocalizedString("core.uninstall.confirm.cancel.bot"),
        false
      );
      return err(new UserCancelError("Uninstall Bot Framework Registration"));
    }
    return ok(undefined);
  }

  /**
   * lifecycle commands: deploy
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "deploy", reset: true }),
    ErrorHandlerMW,
    EnvLoaderMW(false),
    ConcurrentLockerMW,
    ContextInjectorMW,
    EnvWriterMW,
  ])
  async deployArtifacts(
    inputs: Inputs,
    ctx?: CoreHookContext
  ): Promise<Result<undefined, FxError>> {
    inputs.stage = Stage.deploy;
    const context = createDriverContext(inputs);
    const res = await coordinator.deploy(context, inputs as InputsWithProjectPath);
    if (res.isOk()) {
      ctx!.envVars = res.value;
      return ok(undefined);
    } else {
      // for partial success scenario, output is set in inputs object
      ctx!.envVars = inputs.envVars;
      return err(res.error);
    }
  }
  @hooks([ErrorContextMW({ component: "FxCore", stage: "localDebug", reset: true })])
  async localDebug(inputs: Inputs): Promise<Result<undefined, FxError>> {
    inputs.env = environmentNameManager.getLocalEnvName();
    return this.provisionResources(inputs);
  }

  /**
   * none lifecycle command, v3 only
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "deployAadManifest", reset: true }),
    ErrorHandlerMW,
    QuestionMW("deployAadManifest"),
    EnvLoaderMW(true, true),
    ConcurrentLockerMW,
    ContextInjectorMW,
  ])
  async deployAadManifest(inputs: Inputs): Promise<Result<undefined, FxError>> {
    inputs.stage = Stage.deployAad;
    const updateAadClient = Container.get<UpdateAadAppDriver>("aadApp/update");
    // In V3, the aad.template.json exist at .fx folder, and output to root build folder.
    const manifestTemplatePath: string = inputs[QuestionNames.AadAppManifestFilePath];
    if (!(await fs.pathExists(manifestTemplatePath))) {
      return err(new FileNotFoundError("deployAadManifest", manifestTemplatePath));
    }
    let manifestOutputPath: string = manifestTemplatePath;
    if (inputs.env && (await isAadMainifestContainsPlaceholder(inputs))) {
      await fs.ensureDir(path.join(inputs.projectPath!, "build"));
      manifestOutputPath = path.join(
        inputs.projectPath!,
        "build",
        `aad.manifest.${inputs.env as string}.json`
      );
    }
    const inputArgs: UpdateAadAppArgs = {
      manifestPath: manifestTemplatePath,
      outputFilePath: manifestOutputPath,
    };
    const Context: DriverContext = createDriverContext(inputs);
    setErrorContext({ component: "aadAppUpdate" });
    const res = await updateAadClient.execute(inputArgs, Context);
    if (res.result.isErr()) {
      return err(res.result.error);
    }
    if (Context.platform === Platform.CLI) {
      const msg = getLocalizedString("core.deploy.aadManifestOnCLISuccessNotice");
      void Context.ui!.showMessage("info", msg, false);
    } else {
      const msg = getLocalizedString("core.deploy.aadManifestSuccessNotice");
      void Context.ui!.showMessage(
        "info",
        msg,
        false,
        getLocalizedString("core.deploy.aadManifestLearnMore")
      ).then((result) => {
        const userSelected = result.isOk() ? result.value : undefined;
        if (userSelected === getLocalizedString("core.deploy.aadManifestLearnMore")) {
          void Context.ui!.openUrl(ViewAadAppHelpLinkV5);
        }
      });
    }
    return ok(undefined);
  }
  /**
   * none lifecycle command, v3 only
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "addWebpart", reset: true }),
    ErrorHandlerMW,
    QuestionMW("addWebpart"),
    ConcurrentLockerMW,
  ])
  async addWebpart(inputs: Inputs): Promise<Result<undefined, FxError>> {
    setErrorContext({ component: "spfxAdd", method: "run" });
    const driver: AddWebPartDriver = Container.get<AddWebPartDriver>("spfx/add");
    const args: AddWebPartArgs = {
      manifestPath: inputs[QuestionNames.ManifestPath],
      localManifestPath: inputs[QuestionNames.LocalTeamsAppManifestFilePath],
      spfxFolder: inputs[QuestionNames.SPFxFolder],
      webpartName: inputs[QuestionNames.SPFxWebpartName],
      framework: inputs[QuestionNames.SPFxFramework],
      spfxPackage: SPFxVersionOptionIds.installLocally,
    };
    const Context: DriverContext = createDriverContext(inputs);
    const res = await driver.run(args, Context);
    if (res.isErr()) {
      return err(res.error);
    }
    return ok(undefined);
  }
  /**
   * lifecycle command: publish
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "publish", reset: true }),
    ErrorHandlerMW,
    EnvLoaderMW(false),
    ConcurrentLockerMW,
    ContextInjectorMW,
    EnvWriterMW,
  ])
  async publishApplication(
    inputs: Inputs,
    ctx?: CoreHookContext
  ): Promise<Result<undefined, FxError>> {
    inputs.stage = Stage.publish;
    const context = createDriverContext(inputs);
    const res = await coordinator.publish(context, inputs as InputsWithProjectPath);
    if (res.isOk()) {
      ctx!.envVars = res.value;
      return ok(undefined);
    } else {
      // for partial success scenario, output is set in inputs object
      ctx!.envVars = inputs.envVars;
      return err(res.error);
    }
  }

  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "share", reset: true }),
    ErrorHandlerMW,
    QuestionMW("removeSharedAccess"),
    EnvLoaderMW(false),
    ConcurrentLockerMW,
    ContextInjectorMW,
  ])
  async removeSharedAccess(
    inputs: Inputs,
    ctx?: CoreHookContext
  ): Promise<Result<undefined, FxError>> {
    const removeUsersInput = inputs[QuestionNames.RemoveUsers] as string[] | string | undefined;
    const emails = Array.isArray(removeUsersInput)
      ? removeUsersInput
      : removeUsersInput
          ?.split(",")
          .map((email) => email.trim())
          .filter((email) => !!email) ?? [];
    if (!emails || emails.length === 0) {
      return err(new MissingRequiredInputError("emails", "FxCore"));
    }
    const parseRes = await shareUtils.parseShareAppActionYamlConfig(inputs.projectPath!);
    if (parseRes.isErr()) {
      return err(parseRes.error);
    }
    const teamsAppId = parseRes.value.teamsappId;
    const sharedTitleId = parseRes.value.titleId;

    const tokenProvider = TOOLS.tokenProvider.m365TokenProvider;
    const appStudioTokenRes = await tokenProvider.getAccessToken({
      scopes: AppStudioScopes(),
    });
    if (appStudioTokenRes.isErr()) {
      return err(appStudioTokenRes.error);
    }
    const appStudioToken = appStudioTokenRes.value;
    const mosTokenRes = await tokenProvider.getAccessToken({
      scopes: MosServiceScope(),
    });
    if (mosTokenRes.isErr()) {
      return err(mosTokenRes.error);
    }
    const mosToken = mosTokenRes.value;

    // should never remove permission of the operator
    const currentUserInfoRes = await CollaborationUtil.getCurrentUserInfo(tokenProvider);
    if (currentUserInfoRes.isErr()) {
      return err(currentUserInfoRes.error);
    }
    const currentUserInfo = currentUserInfoRes.value;
    for (const email of emails) {
      const userInfo = await CollaborationUtil.getUserInfo(tokenProvider, email);
      if (!userInfo) {
        return err(new InputValidationError("removeSharedAccess", `Invalid user: ${email}`));
      }
      if (userInfo.aadId === currentUserInfo.aadId) {
        return err(
          new InputValidationError(
            "removeSharedAccess",
            getLocalizedString("core.share.removeAccess.operator", email)
          )
        );
      }

      // 1. remove TDP permission
      await teamsDevPortalClient.removePermission(appStudioToken, teamsAppId, userInfo);

      // 2. remove mos permission
      const res = await PackageService.GetSharedInstance().removePermission(
        mosToken,
        sharedTitleId,
        userInfo
      );
      if (res.isErr()) {
        return err(res.error);
      }
    }
    const msg = getLocalizedString("core.common.removeOwnership.success", emails);
    TOOLS.ui?.showMessage("info", msg, false);
    return ok(undefined);
  }

  /**
   * lifecycle command: share
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "share", reset: true }),
    ErrorHandlerMW,
    QuestionMW("share"),
    EnvLoaderMW(false),
    ConcurrentLockerMW,
    ContextInjectorMW,
    EnvWriterMW,
  ])
  async shareApplication(
    inputs: Inputs,
    ctx?: CoreHookContext
  ): Promise<Result<undefined, FxError>> {
    const operation = inputs[QuestionNames.ShareOperation];
    const scope = inputs[QuestionNames.ShareScope];
    let emails: string[] = [];

    if (
      scope === ShareScopeOption.ShareAppWithSpecificUsers ||
      operation === ShareOperationOption.RemoveShareAccessFromUsers
    ) {
      emails =
        (inputs[QuestionNames.UserEmail] as string | undefined)
          ?.split(",")
          .map((e) => e.trim())
          .filter((e) => !!e) ?? [];
      if (emails.length === 0) {
        return err(new InputValidationError("emails", "No emails"));
      }
      if (emails.length > MAX_EMAIL_NUMBER) {
        return err(new InputValidationError("emails", "Too many emails"));
      }
    }
    const parseRes = await shareUtils.parseShareAppActionYamlConfig(inputs.projectPath!);
    if (parseRes.isErr()) {
      return err(parseRes.error);
    }
    const sharedTitleId = parseRes.value.titleId;
    const tokenProvider = TOOLS.tokenProvider.m365TokenProvider;
    const mosTokenRes = await tokenProvider.getAccessToken({
      scopes: MosServiceScope(),
    });
    if (mosTokenRes.isErr()) {
      return err(mosTokenRes.error);
    }
    const mosToken = mosTokenRes.value;

    if (operation === ShareOperationOption.RemoveShareAccessFromUsers) {
      return shareCore.removeShareAccess(mosToken, sharedTitleId, emails);
    } else if (scope === ShareScopeOption.ShareAppWithTenantUsers) {
      return shareCore.shareWithTenant(mosToken, sharedTitleId);
    } else if (scope === ShareScopeOption.ShareAppWithSpecificUsers) {
      return shareCore.addSharedUsers(mosToken, sharedTitleId, emails);
    } else {
      return err(new InputValidationError("shareOption", "Invalid share option"));
    }
  }
  /**
   * most commands will be deprecated in V3
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "executeUserTask", reset: true }),
    ErrorHandlerMW,
    EnvLoaderMW(false),
    ConcurrentLockerMW,
  ])
  async executeUserTask(func: Func, inputs: Inputs): Promise<Result<any, FxError>> {
    let res: Result<any, FxError> = ok(undefined);
    const context = createDriverContext(inputs);
    if (func.method === "addSso") {
      // used in v3 only in VS
      inputs.stage = Stage.addFeature;
      inputs[QuestionNames.Features] = SingleSignOnOptionItem.id;
      const component = Container.get<SSO>("sso");
      setErrorContext({ component: "sso", method: "add" });
      res = await component.add(context as unknown as Context, inputs as InputsWithProjectPath);
    }
    return res;
  }
  /**
   * v3 only none lifecycle command
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "buildAadManifest", reset: true }),
    ErrorHandlerMW,
    EnvLoaderMW(false),
    ConcurrentLockerMW,
  ])
  async buildAadManifest(inputs: Inputs): Promise<Result<undefined, FxError>> {
    const manifestTemplatePath: string = inputs.AAD_MANIFEST_FILE
      ? inputs.AAD_MANIFEST_FILE
      : path.join(inputs.projectPath!, AadConstants.DefaultTemplateFileName);
    if (!(await fs.pathExists(manifestTemplatePath))) {
      return err(new FileNotFoundError("buildAadManifest", manifestTemplatePath));
    }
    await fs.ensureDir(path.join(inputs.projectPath!, "build"));
    const manifestOutputPath: string = path.join(
      inputs.projectPath!,
      "build",

      `aad.${inputs.env}.json`
    );
    const Context: DriverContext = createDriverContext(inputs);
    await buildAadManifest(Context, manifestTemplatePath, manifestOutputPath);
    return ok(undefined);
  }

  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "convertAadToNewSchema", reset: true }),
    ErrorHandlerMW,
    QuestionMW("convertAadToNewSchema"),
  ])
  async convertAadToNewSchema(inputs: Inputs): Promise<Result<undefined, FxError>> {
    const manifestTemplatePath: string = inputs[QuestionNames.AadAppManifestFilePath];
    const projectPath = inputs[QuestionNames.ProjectPath] as string;
    return AadManifestHelper.convertManifestToNewSchemaAndOverride(
      manifestTemplatePath,
      projectPath
    );
  }

  /**
   * v3 only none lifecycle command
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "deployTeamsManifest", reset: true }),
    ErrorHandlerMW,
    QuestionMW("selectTeamsAppManifest"),
    EnvLoaderMW(true),
    ConcurrentLockerMW,
    ContextInjectorMW,
    EnvWriterMW,
  ])
  async deployTeamsManifest(
    inputs: Inputs,
    ctx?: CoreHookContext
  ): Promise<Result<undefined, FxError>> {
    inputs.manifestTemplatePath = inputs[QuestionNames.TeamsAppManifestFilePath] as string;
    const context = createContext();
    const res = await updateManifestV3(context, inputs as InputsWithProjectPath);
    if (res.isOk()) {
      ctx!.envVars = envUtil.map2object(res.value);
      return ok(undefined);
    }
    return err(res.error);
  }

  /******
   * CLI v3 commands
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "updateTeamsAppCLIV3", reset: true }),
    ErrorHandlerMW,
  ])
  async updateTeamsAppCLIV3(inputs: TeamsAppInputs): Promise<Result<undefined, FxError>> {
    const res = await teamsappMgr.updateTeamsApp(inputs);
    return res;
  }
  /******
   * CLI v3 commands
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "validateTeamsAppCLIV3", reset: true }),
    ErrorHandlerMW,
  ])
  async validateTeamsAppCLIV3(inputs: TeamsAppInputs): Promise<Result<undefined, FxError>> {
    const res = await teamsappMgr.validateTeamsApp(inputs);
    return res;
  }
  /******
   * CLI v3 commands
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "packageTeamsAppCLIV3", reset: true }),
    ErrorHandlerMW,
  ])
  async packageTeamsAppCLIV3(inputs: TeamsAppInputs): Promise<Result<undefined, FxError>> {
    const res = await teamsappMgr.packageTeamsApp(inputs);
    if (res.isErr()) {
      return err(res.error);
    }
    return ok(undefined);
  }
  /******
   * CLI v3 commands
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "publishTeamsAppCLIV3", reset: true }),
    ErrorHandlerMW,
  ])
  async publishTeamsAppCLIV3(inputs: TeamsAppInputs): Promise<Result<undefined, FxError>> {
    const res = await teamsappMgr.publishTeamsApp(inputs);
    return res;
  }

  /**
   * v3 only none lifecycle command
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "validateApplication", reset: true }),
    QuestionMW("validateTeamsApp"),
  ])
  async validateApplication(inputs: ValidateTeamsAppInputs): Promise<Result<any, FxError>> {
    if (inputs["manifest-path"]) {
      return await this.validateManifest(inputs);
    } else if (inputs[QuestionNames.ValidateMethod] === TeamsAppValidationOptions.testCases().id) {
      return await this.validateWithTestCases(inputs);
    } else {
      return await this.validateAppPackage(inputs);
    }
  }
  /**
   * v3 only none lifecycle command
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "validateManifest", reset: true }),
    ErrorHandlerMW,
    EnvLoaderMW(true),
    ConcurrentLockerMW,
  ])
  async validateManifest(inputs: ValidateTeamsAppInputs): Promise<Result<any, FxError>> {
    inputs.stage = Stage.validateApplication;
    const context: DriverContext = createDriverContext(inputs);
    const teamsAppManifestFilePath = inputs["manifest-path"] as string;
    const args: ValidateManifestArgs = {
      manifestPath: teamsAppManifestFilePath,
      showMessage: inputs?.showMessage != undefined ? inputs.showMessage : true,
    };
    const driver: ValidateManifestDriver = Container.get("teamsApp/validateManifest");
    const result = await driver.execute(args, context);
    return result.result;
  }
  /**
   * v3 only none lifecycle command
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "validateAppPackage", reset: true }),
    ErrorHandlerMW,
    ConcurrentLockerMW,
  ])
  async validateAppPackage(inputs: ValidateTeamsAppInputs): Promise<Result<any, FxError>> {
    inputs.stage = Stage.validateApplication;
    const context: DriverContext = createDriverContext(inputs);
    const teamsAppPackageFilePath = inputs["app-package-file-path"] as string;
    const args: ValidateAppPackageArgs = {
      appPackagePath: teamsAppPackageFilePath,
      showMessage: true,
    };
    const driver: ValidateAppPackageDriver = Container.get("teamsApp/validateAppPackage");
    return (await driver.execute(args, context)).result;
  }

  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "validateWithTestCases", reset: true }),
    ErrorHandlerMW,
    ConcurrentLockerMW,
  ])
  async validateWithTestCases(inputs: ValidateTeamsAppInputs): Promise<Result<any, FxError>> {
    const context: DriverContext = createDriverContext(inputs);
    const args: ValidateWithTestCasesArgs = {
      appPackagePath: inputs["app-package-file-path"] as string,
      showMessage: true,
      showProgressBar: true,
    };
    const driver: ValidateWithTestCasesDriver = Container.get("teamsApp/validateWithTestCases");
    return (await driver.execute(args, context)).result;
  }

  /**
   * v3 only none lifecycle command
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "syncManifest", reset: true }),
    ErrorHandlerMW,
    QuestionMW("syncManifest"),
    ConcurrentLockerMW,
  ])
  async syncManifest(inputs: SyncManifestInputs): Promise<Result<any, FxError>> {
    const context: DriverContext = createDriverContext(inputs);
    const projectPath = inputs[QuestionNames.ProjectPath] as string;
    const env = inputs[QuestionNames.Env] as string;
    const teamsAppId = inputs[QuestionNames.TeamsAppId];
    const args: SyncManifestArgs = {
      projectPath: projectPath,
      env: env,
      teamsAppId: teamsAppId,
    };
    const driver: SyncManifestDriver = Container.get("teamsApp/syncManifest");
    return (await driver.execute(args, context)).result;
  }

  /**
   * v3 only none lifecycle command
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "createAppPackage", reset: true }),
    ErrorHandlerMW,
    QuestionMW("selectTeamsAppManifest"),
    EnvLoaderMW(true),
    ConcurrentLockerMW,
  ])
  async createAppPackage(inputs: Inputs): Promise<Result<any, FxError>> {
    inputs.stage = Stage.createAppPackage;

    const context: DriverContext = createDriverContext(inputs);

    // For TSP projects
    await runForTypeSpecProject(inputs.projectPath, context);

    const teamsAppManifestFilePath = inputs?.[QuestionNames.TeamsAppManifestFilePath] as string;

    const driver: CreateAppPackageDriver = Container.get("teamsApp/zipAppPackage");
    const args: CreateAppPackageArgs = {
      manifestPath: teamsAppManifestFilePath,
      outputZipPath:
        inputs[QuestionNames.OutputZipPathParamName] ??
        `${inputs.projectPath}/${AppPackageFolderName}/${BuildFolderName}/appPackage.${process.env
          .TEAMSFX_ENV!}.zip`,
      outputFolder:
        inputs[QuestionNames.OutputManifestParamName] ??
        `${inputs.projectPath}/${AppPackageFolderName}/${BuildFolderName}`,
    };
    const result = (await driver.execute(args, context)).result;
    if (context.platform === Platform.VSCode) {
      if (result.isOk()) {
        const isWindows = process.platform === "win32";
        let zipFileName = args.outputZipPath;
        if (!path.isAbsolute(zipFileName)) {
          zipFileName = path.join(context.projectPath, zipFileName);
        }
        let builtSuccess = getLocalizedString(
          "plugins.appstudio.buildSucceedNotice.fallback",
          zipFileName
        );
        if (isWindows) {
          const folderLink = pathToFileURL(path.dirname(zipFileName));
          const appPackageLink = `${
            VSCodeExtensionCommand.openFolder
          }?%5B%22${folderLink.toString()}%22%5D`;
          builtSuccess = getLocalizedString("plugins.appstudio.buildSucceedNotice", appPackageLink);
        }
        context.ui?.showMessage("info", builtSuccess, false);
      }
    }
    return result;
  }
  /**
   * get url to preview the app, may prompt to select env, hub and Teams manifest
   * v3 only none lifecycle command
   * @param {Inputs} inputs
   * @returns the url to preview the app
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "preview", reset: true }),
    ErrorHandlerMW,
    QuestionMW("previewWithTeamsAppManifest"),
    EnvLoaderMW(false),
    ConcurrentLockerMW,
  ])
  async previewWithManifest(inputs: Inputs): Promise<Result<string, FxError>> {
    inputs.stage = Stage.previewWithManifest;

    const hub = inputs[QuestionNames.M365Host] as HubTypes;
    const manifestFilePath = inputs[QuestionNames.TeamsAppManifestFilePath] as string;
    const context = createContext();

    const manifestRes = await manifestUtils.getManifestV3(
      manifestFilePath,
      generateDriverContext(context, inputs as InputsWithProjectPath),
      false
    );
    if (manifestRes.isErr()) {
      return err(manifestRes.error);
    }

    const teamsAppId = manifestRes.value.id;
    const properties = manifestUtils.parseCommonProperties(manifestRes.value as TeamsAppManifest);

    const launchHelper = new LaunchHelper(TOOLS.tokenProvider.m365TokenProvider, TOOLS.logProvider);
    const result = await launchHelper.getLaunchUrl(hub, teamsAppId, properties, true);
    return result;
  }
  /**
   * Warning: this API only works for CLI_HELP, it has no business with interactive run for CLI!
   */
  getQuestions(stage: Stage, inputs: Inputs): Result<IQTreeNode | undefined, FxError> {
    return ok(undefined);
  }

  /**
   * get all dot envs
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "getDotEnvs", reset: true }),
    ErrorHandlerMW,
  ])
  async getDotEnvs(
    inputs: InputsWithProjectPath
  ): Promise<Result<{ [name: string]: DotenvParseOutput }, FxError>> {
    const envListRes = await envUtil.listEnv(inputs.projectPath);
    if (envListRes.isErr()) {
      return err(envListRes.error);
    }
    const res: { [name: string]: DotenvParseOutput } = {};
    for (const env of envListRes.value) {
      const envRes = await envUtil.readEnv(inputs.projectPath, env, false, false);
      if (envRes.isErr()) {
        return err(envRes.error);
      }
      res[env] = envRes.value as DotenvParseOutput;
    }
    return ok(res);
  }
  /**
   * given projectPath and filePath, return whether the filePath is a env file
   */
  @hooks([ErrorContextMW({ component: "FxCore", stage: "isEnvFile", reset: true })])
  async isEnvFile(projectPath: string, inputFile: string): Promise<Result<boolean, FxError>> {
    const inputFileName = path.basename(inputFile);
    const envName = envUtil.extractEnvNameFromFileName(inputFileName);
    if (!envName) return ok(false);
    const folderRes = await pathUtils.getEnvFolderPath(projectPath);
    if (folderRes.isErr()) return err(folderRes.error);
    const envFolderPath = folderRes.value;
    if (!envFolderPath) return ok(false);
    const inputFileDir = path.dirname(inputFile);
    if (path.resolve(inputFileDir) !== path.resolve(envFolderPath)) return ok(false);
    return ok(true);
  }

  /**
   * get projectId
   */
  @hooks([ErrorContextMW({ component: "FxCore", stage: "getProjectId", reset: true })])
  async getProjectId(projectPath: string): Promise<Result<string, FxError>> {
    const res = await this.getProjectMetadata(projectPath);
    if (res.isErr()) {
      return err(res.error);
    }
    return ok(res.value.projectId || "");
  }

  /**
   * @description get projectId and version from yml
   */
  @hooks([ErrorContextMW({ component: "FxCore", stage: "getProjectMetadata", reset: true })])
  async getProjectMetadata(
    projectPath: string
  ): Promise<Result<{ version?: string; projectId?: string }, FxError>> {
    const res = getProjectMetadata(projectPath);
    if (!res) return ok({});
    return Promise.resolve(ok(res));
  }

  /**
   * get Teams App Name from yml
   */
  @hooks([ErrorContextMW({ component: "FxCore", stage: "getTeamsAppName", reset: true })])
  async getTeamsAppName(projectPath: string): Promise<Result<string, FxError>> {
    const ymlPath = pathUtils.getYmlFilePath(projectPath, "dev") as string;
    const maybeProjectModel = await metadataUtil.parse(ymlPath);
    if (maybeProjectModel.isErr()) {
      return err(maybeProjectModel.error);
    }
    const projectModel = maybeProjectModel.value as any;
    if (projectModel.provision) {
      const teamsAppCreate = projectModel.provision?.driverDefs.find(
        (d: any) => d.uses === "teamsApp/create"
      );
      if (teamsAppCreate) {
        let name = teamsAppCreate.with.name as string;
        if (name) {
          name = expandEnvironmentVariable(name, { APP_NAME_SUFFIX: "", TEAMSFX_ENV: " " }).trim();
          return ok(name);
        }
      }
    }
    return ok("");
  }

  /**
   * get project info
   */
  @hooks([ErrorContextMW({ component: "FxCore", stage: "getProjectInfo", reset: true })])
  async getProjectInfo(
    projectPath: string,
    env: string
  ): Promise<
    Result<
      {
        projectId: string;
        teamsAppId: string;
        teamsAppName: string;
        m365TenantId: string;
      },
      FxError
    >
  > {
    const ymlPath = pathUtils.getYmlFilePath(projectPath, env) as string;
    const maybeProjectModel = await metadataUtil.parse(ymlPath);
    if (maybeProjectModel.isErr()) {
      return err(maybeProjectModel.error);
    }
    const projectModel = maybeProjectModel.value;
    const readEnvRes = await envUtil.readEnv(projectPath, env, false, true);
    if (readEnvRes.isErr()) {
      return err(readEnvRes.error);
    }
    const envObject = readEnvRes.value;
    const res: {
      projectId: string;
      teamsAppId: string;
      teamsAppName: string;
      m365TenantId: string;
    } = {
      projectId: (projectModel as any).projectId || "",
      teamsAppId: "",
      teamsAppName: "",
      m365TenantId: envObject.TEAMS_APP_TENANT_ID || "",
    };
    if (projectModel.provision) {
      const teamsAppCreate = projectModel.provision.driverDefs.find(
        (d) => d.uses === "teamsApp/create"
      );
      if (teamsAppCreate) {
        const teamsAppIdEnvName = teamsAppCreate.writeToEnvironmentFile?.teamsAppId;
        if (teamsAppIdEnvName) {
          const teamsAppId = envObject[teamsAppIdEnvName];
          res.teamsAppId = teamsAppId;
        }
        const name = (teamsAppCreate.with as any).name;
        if (name) {
          res.teamsAppName = name.replace("-${{TEAMSFX_ENV}}", "") || "";
        }
      }
    }
    return ok(res);
  }

  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "grantPermission", reset: true }),
    ErrorHandlerMW,
    QuestionMW("grantPermission"),
    EnvLoaderMW(false, true),
    ConcurrentLockerMW,
    EnvWriterMW,
  ])
  async grantPermission(inputs: Inputs): Promise<Result<PermissionsResult, FxError>> {
    inputs.stage = Stage.grantPermission;
    const context = createContext();
    setErrorContext({ component: "collaborator" });
    const res = await collaboratorCore.grantPermission(
      context,
      inputs as InputsWithProjectPath,
      TOOLS.tokenProvider
    );
    return res;
  }
  /**
   * none lifecycle command
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "checkPermission", reset: true }),
    ErrorHandlerMW,
    QuestionMW("listCollaborator"),
    EnvLoaderMW(false, true),
    ConcurrentLockerMW,
    EnvWriterMW,
  ])
  async checkPermission(inputs: Inputs): Promise<Result<PermissionsResult, FxError>> {
    inputs.stage = Stage.checkPermission;
    const context = createContext();
    const res = await collaboratorCore.checkPermission(
      context,
      inputs as InputsWithProjectPath,
      TOOLS.tokenProvider
    );
    return res;
  }
  /**
   * none lifecycle command
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "listCollaborator", reset: true }),
    ErrorHandlerMW,
    QuestionMW("listCollaborator"),
    EnvLoaderMW(false, true),
    ConcurrentLockerMW,
    EnvWriterMW,
  ])
  async listCollaborator(inputs: Inputs): Promise<Result<ListCollaboratorResult, FxError>> {
    inputs.stage = Stage.listCollaborator;
    const context = createContext();
    const res = await collaboratorCore.listCollaborator(
      context,
      inputs as InputsWithProjectPath,
      TOOLS.tokenProvider
    );
    return res;
  }
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "getSelectedEnv", reset: true }),
    ErrorHandlerMW,
    EnvLoaderMW(false),
  ])
  getSelectedEnv(inputs: Inputs): Promise<Result<string | undefined, FxError>> {
    return Promise.resolve(ok(inputs.env)); //work for both v2 and v3
  }

  @hooks([ErrorContextMW({ component: "FxCore", stage: "createLocalCrypto" })])
  async createLocalCrypto(projectPath: string): Promise<Result<CryptoProvider, FxError>> {
    const settingsRes = await settingsUtil.readSettings(projectPath);
    if (settingsRes.isErr()) {
      return err(settingsRes.error);
    }
    const projectId = settingsRes.value.trackingId;
    const cryptoProvider = new LocalCrypto(projectId);
    return ok(cryptoProvider);
  }

  /**
   * only for vs code extension
   */
  @hooks([ErrorContextMW({ component: "FxCore", stage: "encrypt", reset: true }), ErrorHandlerMW])
  async encrypt(plaintext: string, inputs: Inputs): Promise<Result<string, FxError>> {
    const res = await this.createLocalCrypto(inputs.projectPath!);
    if (res.isErr()) {
      return err(res.error);
    }
    return res.value.encrypt(plaintext);
  }
  /**
   * only for vs code extension
   */
  @hooks([ErrorContextMW({ component: "FxCore", stage: "decrypt", reset: true }), ErrorHandlerMW])
  async decrypt(ciphertext: string, inputs: Inputs): Promise<Result<string, FxError>> {
    const res = await this.createLocalCrypto(inputs.projectPath!);
    if (res.isErr()) {
      return err(res.error);
    }
    return res.value.decrypt(ciphertext);
  }

  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "createEnv", reset: true }),
    ErrorHandlerMW,
    QuestionMW("createNewEnv"),
    ConcurrentLockerMW,
  ])
  async createEnv(inputs: Inputs): Promise<Result<undefined, FxError>> {
    return this.createEnvCopyV3(
      inputs[QuestionNames.NewTargetEnvName],
      inputs[QuestionNames.SourceEnvName],
      inputs.projectPath!
    );
  }
  async createEnvCopyV3(
    targetEnvName: string,
    sourceEnvName: string,
    projectPath: string
  ): Promise<Result<undefined, FxError>> {
    let res = await pathUtils.getEnvFilePath(projectPath, sourceEnvName);
    if (res.isErr()) return err(res.error);
    const sourceDotEnvFile = res.value;

    res = await pathUtils.getEnvFilePath(projectPath, targetEnvName);
    if (res.isErr()) return err(res.error);
    const targetDotEnvFile = res.value;
    if (!sourceDotEnvFile || !targetDotEnvFile)
      return err(new YamlFieldMissingError("environmentFolderPath"));
    if (!(await fs.pathExists(sourceDotEnvFile)))
      return err(new FileNotFoundError("createEnvCopyV3", sourceDotEnvFile));
    const source = await fs.readFile(sourceDotEnvFile);
    const writeStream = fs.createWriteStream(targetDotEnvFile);
    source
      .toString()
      .split(/\r?\n/)
      .forEach((line) => {
        const reg = /^([a-zA-Z_][a-zA-Z0-9_]*=)(.*)/g;
        const match = reg.exec(line);
        if (match) {
          if (match[1].startsWith("TEAMSFX_ENV=")) {
            writeStream.write(`TEAMSFX_ENV=${targetEnvName}${os.EOL}`);
          } else if (match[1].startsWith("APP_NAME_SUFFIX=")) {
            writeStream.write(`APP_NAME_SUFFIX=${targetEnvName}${os.EOL}`);
          } else if (match[1].startsWith("AGENT_SCOPE=")) {
            writeStream.write(`AGENT_SCOPE=${match[2]}${os.EOL}`);
          } else {
            writeStream.write(`${match[1]}${os.EOL}`);
          }
        } else {
          writeStream.write(`${line.trim()}${os.EOL}`);
        }
      });

    writeStream.end();
    TOOLS.logProvider.info(`env file created: ${targetDotEnvFile}`);
    return ok(undefined);
  }

  // a project version check
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "projectVersionCheck", reset: true }),
    ErrorHandlerMW,
  ])
  async projectVersionCheck(inputs: Inputs): Promise<Result<VersionCheckRes, FxError>> {
    const projectPath = (inputs.projectPath as string) || "";
    if (projectSettingsHelper.isValidProjectV3(projectPath)) {
      const versionInfo = await v3MigrationUtils.getProjectVersionFromPath(projectPath);
      if (!versionInfo.version) {
        return err(new InvalidProjectError(projectPath));
      }
      const trackingId = await v3MigrationUtils.getTrackingIdFromPath(projectPath);
      const isSupport = v3MigrationUtils.getVersionState(versionInfo);
      return ok({
        currentVersion: versionInfo.version,
        trackingId,
        isSupport,
        versionSource: VersionSource[versionInfo.source],
      });
    } else {
      return err(new InvalidProjectError(projectPath));
    }
  }

  // apply the given yaml template to current project.
  async apply(
    inputs: Inputs,
    templatePath: string,
    lifecycleName: string
  ): Promise<Result<undefined, FxError>> {
    if (!inputs.projectPath) {
      return err(new InputValidationError("projectPath", "empty", "Core"));
    }
    const projectPath = inputs.projectPath;
    if (!inputs.env) {
      return err(new InputValidationError("env", "empty", "Core"));
    }
    const env = inputs.env;
    const lifecycleName_: LifecycleName = lifecycleName as LifecycleName;
    const result = await envUtil.readEnv(projectPath, env);
    if (result.isErr()) {
      return err(result.error);
    }

    const parser = new YamlParser();
    const maybeProjectModel = await parser.parse(templatePath);
    if (maybeProjectModel.isErr()) {
      return err(maybeProjectModel.error);
    }

    const projectModel = maybeProjectModel.value;
    const driverContext: DriverContext = {
      azureAccountProvider: TOOLS.tokenProvider.azureAccountProvider,
      m365TokenProvider: TOOLS.tokenProvider.m365TokenProvider,
      ui: TOOLS.ui,
      progressBar: undefined,
      logProvider: TOOLS.logProvider,
      telemetryReporter: TOOLS.telemetryReporter!,
      projectPath: projectPath,
      platform: inputs.platform,
    };
    const lifecycle = projectModel[lifecycleName_];
    if (lifecycle) {
      return this.runLifecycle(lifecycle, driverContext, env);
    } else {
      driverContext.logProvider.warning(`No definition found for ${lifecycleName}`);
      return ok(undefined);
    }
  }

  async runLifecycle(
    lifecycle: ILifecycle,
    driverContext: DriverContext,
    env: string
  ): Promise<Result<undefined, FxError>> {
    const r = await lifecycle.execute(driverContext);
    const runResult = r.result;
    if (runResult.isOk()) {
      driverContext.logProvider.info(`Lifecycle ${lifecycle.name} succeeded`);
      const writeResult = await envUtil.writeEnv(
        driverContext.projectPath,
        env,
        envUtil.map2object(runResult.value)
      );
      return writeResult.map(() => undefined);
    } else {
      const error = runResult.error;
      if (error.kind === "Failure") {
        driverContext.logProvider.error(
          `Failed to run ${lifecycle.name} due to ${error.error.name}: ${error.error.message}`
        );
        return err(error.error);
      } else {
        try {
          const failedDriver = error.reason.failedDriver;
          if (error.reason.kind === "UnresolvedPlaceholders") {
            const unresolved = error.reason.unresolvedPlaceHolders;
            driverContext.logProvider.warning(
              `Unresolved placeholders: ${unresolved.join(",")} for driver ${failedDriver.uses}`
            );
            return ok(undefined);
          } else {
            driverContext.logProvider.error(
              `Failed to run ${lifecycle.name} due to ${error.reason.error.name}: ${error.reason.error.message}. Failed driver: ${failedDriver.uses}`
            );
            return err(error.reason.error);
          }
        } finally {
          await envUtil.writeEnv(driverContext.projectPath, env, envUtil.map2object(error.env));
        }
      }
    }
  }

  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "preProvisionForVS" }),
    ErrorHandlerMW,
    EnvLoaderMW(false),
    ConcurrentLockerMW,
    ContextInjectorMW,
  ])
  async preProvisionForVS(inputs: Inputs): Promise<Result<PreProvisionResForVS, FxError>> {
    const context = createDriverContext(inputs);
    return coordinator.preProvisionForVS(context, inputs as InputsWithProjectPath);
  }
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "preCheckYmlAndEnvForVS" }),
    ErrorHandlerMW,
    EnvLoaderMW(false),
    ConcurrentLockerMW,
    ContextInjectorMW,
  ])
  async preCheckYmlAndEnvForVS(inputs: Inputs): Promise<Result<undefined, FxError>> {
    const context = createDriverContext(inputs);
    const result = await coordinator.preCheckYmlAndEnvForVS(
      context,
      inputs as InputsWithProjectPath
    );
    return result;
  }
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "publishInDeveloperPortal" }),
    ErrorHandlerMW,
    ConcurrentLockerMW,
    ContextInjectorMW,
  ])
  async publishInDeveloperPortal(inputs: Inputs): Promise<Result<undefined, FxError>> {
    inputs.stage = Stage.publishInDeveloperPortal;
    const context = createContext();
    return await coordinator.publishInDeveloperPortal(context, inputs as InputsWithProjectPath);
  }

  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "copilotPluginAddAPI" }),
    ErrorHandlerMW,
    QuestionMW("copilotPluginAddAPI"),
    ConcurrentLockerMW,
  ])
  async copilotPluginAddAPI(inputs: Inputs): Promise<Result<string, FxError>> {
    const newOperations = inputs[QuestionNames.ApiOperation] as string[];
    const url = inputs[QuestionNames.ApiSpecLocation];
    const manifestPath = inputs[QuestionNames.ManifestPath];
    const context = createContext();

    // Get API spec file path from manifest
    const manifestRes = await manifestUtils._readAppManifest(manifestPath);
    if (manifestRes.isErr()) {
      return err(manifestRes.error);
    }

    const confirmRes = await context.userInteraction.showMessage(
      "warn",
      getLocalizedString("core.addApi.confirm", AppPackageFolderName),
      true,
      getLocalizedString("core.addApi.continue")
    );

    if (confirmRes.isErr()) {
      return err(confirmRes.error);
    } else if (confirmRes.value !== getLocalizedString("core.addApi.continue")) {
      return err(new UserCancelError());
    }

    try {
      // Merge existing operations in manifest.json
      const specParser = new SpecParser(url, getParserOptions(ProjectType.SME));

      const listResult = await specParser.list();

      const apiResultList = listResult.APIs.filter((value) => value.isValid);

      const existingOperationIds = manifestUtils.getOperationIds(manifestRes.value);
      const existingOperations = apiResultList
        .filter((operation) => existingOperationIds.includes(operation.operationId))
        .map((operation) => operation.api);
      const apiSpecificationFile = manifestRes.value.composeExtensions![0].apiSpecificationFile;
      const outputApiSpecPath = path.join(path.dirname(manifestPath), apiSpecificationFile!);

      const operations = [...existingOperations, ...newOperations];

      const adaptiveCardFolder = path.join(
        inputs.projectPath!,
        AppPackageFolderName,
        ResponseTemplatesFolderName
      );

      const authNames: Set<string> = new Set();
      const serverUrls: Set<string> = new Set();
      const authNamesDict: Record<string, AuthType> = {};
      for (const api of operations) {
        const operation = apiResultList.find((op) => op.api === api);
        if (
          operation &&
          operation.auth &&
          (Utils.isBearerTokenAuth(operation.auth.authScheme) ||
            Utils.isOAuthWithAuthCodeFlow(operation.auth.authScheme))
        ) {
          authNames.add(operation.auth.name);
          serverUrls.add(operation.server);
          authNamesDict[operation.auth.name] = operation.auth.authScheme;
        }
      }

      if (serverUrls.size > 1) {
        throw new MultipleServerError(serverUrls);
      }

      if (authNames.size >= 1) {
        for (const authName of authNames) {
          await openApiSpecHelper.injectAuthAction(
            inputs.projectPath!,
            [...authNames][0],
            authNamesDict[authName],
            outputApiSpecPath,
            false
          );
        }
      }

      let pluginPath: string | undefined;

      const generateResult = await openApiSpecHelper.generateFromApiSpec(
        specParser,
        manifestPath,
        inputs,
        context,
        "copilotPluginAddAPI",
        ProjectType.SME,
        {
          destinationApiSpecFilePath: outputApiSpecPath,
          responseTemplateFolder: adaptiveCardFolder,
          pluginManifestFilePath: pluginPath,
        },
        url
      );

      if (generateResult.isErr()) {
        return err(generateResult.error);
      }

      if (generateResult.value.warnings && generateResult.value.warnings.length > 0) {
        const warnSummary = await openApiSpecHelper.generateScaffoldingSummary(
          generateResult.value.warnings,
          manifestRes.value,
          path.relative(inputs.projectPath!, outputApiSpecPath),
          pluginPath === undefined ? undefined : path.relative(inputs.projectPath!, pluginPath),
          inputs.projectPath!
        );

        if (warnSummary) {
          context.logProvider.info(warnSummary);
        }
      }
    } catch (e) {
      let error: FxError;
      if (e instanceof SpecParserError) {
        error = convertSpecParserErrorToFxError(e);
      } else {
        error = assembleError(e);
      }
      return err(error);
    }

    const message = getLocalizedString(
      "core.copilot.addAPI.success",
      newOperations,
      inputs.projectPath
    );
    if (inputs.platform !== Platform.VS) {
      void context.userInteraction.showMessage("info", message, false);
    }
    return ok(message);
  }

  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "copilotPluginListApiSpecs" }),
    ErrorHandlerMW,
  ])
  async listPluginApiSpecs(inputs: Inputs): Promise<Result<string[], FxError>> {
    try {
      const manifestPath = inputs[QuestionNames.ManifestPath];
      const manifestRes = await manifestUtils._readAppManifest(manifestPath);
      if (manifestRes.isErr()) {
        return err(manifestRes.error);
      }
      const res = await pluginManifestUtils.getApiSpecFilePathFromTeamsManifest(
        manifestRes.value,
        manifestPath
      );
      if (res.isOk()) {
        return ok(res.value);
      } else {
        return err(res.error);
      }
    } catch (error) {
      return err(error as FxError);
    }
  }

  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "copilotPluginListOperations" }),
    ErrorHandlerMW,
  ])
  async copilotPluginListOperations(inputs: Inputs): Promise<Result<ApiOperation[], FxError>> {
    const res = await openApiSpecHelper.listOperations(
      createContext(),
      inputs.apiSpecUrl,
      inputs,
      inputs.includeExistingAPIs,
      inputs.shouldLogWarning
    );
    if (res.isErr()) {
      const msg = res.error.map((e) => e.content).join("\n");
      return err(new UserError("FxCore", "ListOpenAPISpecOperationsError", msg, msg));
    } else {
      return ok(res.value);
    }
  }

  /**
   * check project type info
   */
  @hooks([ErrorContextMW({ component: "FxCore", stage: "checkProjectType" }), ErrorHandlerMW])
  async checkProjectType(projectPath: string): Promise<Result<ProjectTypeResult, FxError>> {
    const projectTypeRes = await projectTypeChecker.checkProjectType(projectPath);
    const props: Record<string, string> = {};
    telemetryUtils.fillinProjectTypeProperties(props, projectTypeRes);
    TOOLS.telemetryReporter?.sendTelemetryEvent(TelemetryEvent.ProjectType, props);
    return ok(projectTypeRes);
  }

  @hooks([
    ErrorContextMW({ component: "FxCore", stage: Stage.RegeneratePlugin }),
    ErrorHandlerMW,
    QuestionMW("regeneratePlugin"),
    ConcurrentLockerMW,
  ])
  async regeneratePlugin(inputs: Inputs): Promise<Result<undefined | any, FxError>> {
    const projectPath = inputs.projectPath!;
    const context = createContext();

    const teamsManifestPath = (inputs[QuestionNames.ManifestPath] ??
      inputs[QuestionNames.TeamsAppManifestFilePath]) as string;
    const appPackageFolder = path.dirname(teamsManifestPath);

    const manifestRes = await manifestUtils._readAppManifest(teamsManifestPath);
    if (manifestRes.isErr()) {
      return err(manifestRes.error);
    }

    const gptManifestFilePathRes = await getManifestPath(teamsManifestPath);
    if (gptManifestFilePathRes.isErr()) {
      return err(gptManifestFilePathRes.error);
    }

    let confirmMessage = getLocalizedString(
      "core.addApi.confirm",
      path.relative(projectPath, appPackageFolder)
    );

    // Will be used if generating from API spec
    let authNameAndSchemes: { authName: string; authScheme: AuthType }[] = [];

    const specPath = inputs[QuestionNames.ApiSpecLocation].trim() as string;

    const listResult = await listAPIInfo(specPath);

    authNameAndSchemes = this.parseAuthNameAndScheme(listResult, inputs);

    if (authNameAndSchemes.length > 0) {
      const doesLocalYamlPathExists = await fs.pathExists(
        path.join(projectPath, MetadataV3.localConfigFile)
      );
      confirmMessage = doesLocalYamlPathExists
        ? getLocalizedString(
            "core.addApi.confirm.localTeamsYaml",
            path.relative(projectPath, appPackageFolder),
            MetadataV4.localConfigFile,
            MetadataV4.configFile
          )
        : getLocalizedString(
            "core.addApi.confirm.teamsYaml",
            path.relative(projectPath, appPackageFolder),
            MetadataV4.configFile
          );
    }

    const confirmRes = await context.userInteraction.showMessage(
      "warn",
      confirmMessage,
      true,
      getLocalizedString("core.regenerateApi.continue")
    );

    if (confirmRes.isErr()) {
      return err(confirmRes.error);
    } else if (confirmRes.value !== getLocalizedString("core.regenerateApi.continue")) {
      return err(new UserCancelError());
    }

    const destinationPluginManifestPath = inputs[QuestionNames.SelectPluginManifest];
    const destinationApiSpecPath = inputs[QuestionNames.SelectOpenAPISpecFromPlugin];

    const generateRes = await openApiSpecHelper.generateFromApiSpec(
      undefined,
      teamsManifestPath,
      inputs,
      context,
      Stage.RegeneratePlugin,
      ProjectType.Copilot,
      {
        destinationApiSpecFilePath: destinationApiSpecPath,
        pluginManifestFilePath: destinationPluginManifestPath,
      },
      inputs[QuestionNames.ApiSpecLocation].trim(),
      true
    );
    if (generateRes.isErr()) {
      return err(generateRes.error);
    }

    const warnings = generateRes.value.warnings;
    if (warnings && warnings.length > 0) {
      const warnSummary = await openApiSpecHelper.generateScaffoldingSummary(
        warnings,
        manifestRes.value,
        path.relative(projectPath, destinationApiSpecPath),
        path.relative(projectPath, destinationPluginManifestPath),
        projectPath
      );
      context.logProvider.info(warnSummary + "\n");
    }

    for (const authNameAndScheme of authNameAndSchemes) {
      await this.updateAuthActionInYaml(
        authNameAndScheme.authName,
        authNameAndScheme.authScheme,
        projectPath,
        destinationApiSpecPath,
        destinationPluginManifestPath,
        false
      );
    }

    const declarativeAgentManifestPath = gptManifestFilePathRes.value;

    const declarativeAgentManifesRes = await readCopilotGptManifestFile(
      declarativeAgentManifestPath
    );
    if (declarativeAgentManifesRes.isErr()) {
      return err(declarativeAgentManifesRes.error);
    }

    const declarativeAgentManifest = declarativeAgentManifesRes.value;
    for (const action of declarativeAgentManifest.actions!) {
      const actionPath = path.normalize(path.join(appPackageFolder, action.file));
      await copilotGptManifestUtils.updateConversationStarters(
        actionPath,
        declarativeAgentManifest
      );
    }

    const actionId = inputs[QuestionNames.SelectPluginId];
    if (inputs.platform === Platform.VSCode) {
      const successMessage = getLocalizedString("core.regeneratePlugin.success.vsc", actionId);
      const viewPluginManifest = getLocalizedString(
        "core.regeneratePlugin.success.viewPluginManifest"
      );
      void context.userInteraction
        .showMessage("info", successMessage, false, viewPluginManifest)
        .then((userRes) => {
          if (userRes.isOk() && userRes.value === viewPluginManifest) {
            context.telemetryReporter.sendTelemetryEvent(
              TelemetryEvent.ViewPluginManifestAfterAdded
            );
            void TOOLS?.ui?.openFile?.(destinationPluginManifestPath);
          }
        });
    } else {
      const successMessage = getLocalizedString(
        "core.regeneratePlugin.success",
        actionId,
        destinationPluginManifestPath
      );
      void context.userInteraction.showMessage("info", successMessage, false);
    }

    return ok(undefined);
  }

  /**
   * Add Knowledge
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: Stage.addKnowledge }),
    ErrorHandlerMW,
    QuestionMW("addKnowledge"),
    ConcurrentLockerMW,
  ])
  async addKnowledge(inputs: Inputs): Promise<Result<undefined | any, FxError>> {
    if (!inputs.projectPath) {
      throw new Error("projectPath is undefined"); // should never happen
    }

    const context = createContext();
    const teamsManifestPath = inputs[QuestionNames.ManifestPath];
    const appPackageFolder = path.dirname(teamsManifestPath);

    // Validate the project is valid for adding knowledge
    const manifestRes = await manifestUtils._readAppManifest(teamsManifestPath);
    if (manifestRes.isErr()) {
      return err(manifestRes.error);
    }

    const teamsManifest = manifestRes.value;
    const agent = teamsManifest.copilotExtensions
      ? teamsManifest.copilotExtensions.declarativeCopilots?.[0]
      : teamsManifest.copilotAgents?.declarativeAgents?.[0];
    if (!agent?.file) {
      return err(
        AppStudioResultFactory.UserError(
          AppStudioError.TeamsAppRequiredPropertyMissingError.name,
          AppStudioError.TeamsAppRequiredPropertyMissingError.message(
            "declarativeAgents",
            teamsManifestPath
          )
        )
      );
    }
    const agentFilePathRes = await getManifestPath(teamsManifestPath);
    if (agentFilePathRes.isErr()) {
      return err(agentFilePathRes.error);
    }

    const agentManifestPath = agentFilePathRes.value;

    // User confirm before adding knowledge
    const confirmMessage = getLocalizedString(
      "core.addKnowledge.confirm",
      path.relative(inputs.projectPath, appPackageFolder)
    );
    const confirmRes = await context.userInteraction.showMessage(
      "warn",
      confirmMessage,
      true,
      getLocalizedString("core.addKnowledge.continue")
    );

    if (confirmRes.isErr()) {
      return err(confirmRes.error);
    } else if (confirmRes.value !== getLocalizedString("core.addKnowledge.continue")) {
      return err(new UserCancelError());
    }

    let result: Result<undefined, FxError>;
    const knowledgeSource = inputs[QuestionNames.KnowledgeSource] as string;
    switch (knowledgeSource) {
      case KnowledgeSourceOptions.webSearch().id:
        result = await this.addWebSearchKnowledge(context, inputs, agentManifestPath);
        break;
      case KnowledgeSourceOptions.oneDriveSharePoint().id:
        result = await this.addOneDriveSharePointKnowledge(inputs, agentManifestPath);
        break;
      case KnowledgeSourceOptions.graphConnector().id:
        result = await this.addGCKnowledge(inputs, agentManifestPath);
        break;
      case KnowledgeSourceOptions.embeddedKnowledge().id:
        result = await this.addEmbeddedKnowledge(inputs);
        break;
      default:
        return err(
          new UserError("FxCore", "UnsupportedKnowledgeSource", "Unsupported knowledge source")
        );
    }
    if (result.isErr()) {
      if (isUserCancelError(result.error)) {
        return err(new UserCancelError());
      }
      await context.userInteraction.showMessage("warn", result.error.message, true);
      return ok(undefined);
    }

    this.showAddKnowledgeSuccessMessage(context, inputs, agentManifestPath, knowledgeSource);

    return ok(result);
  }

  /**
   * Add Skill
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: Stage.addSkill }),
    ErrorHandlerMW,
    QuestionMW("addSkill"),
    ConcurrentLockerMW,
  ])
  async addSkill(inputs: Inputs): Promise<Result<undefined | any, FxError>> {
    if (!featureFlagManager.getBooleanValue(FeatureFlags.AgentSkillsManifest)) {
      return err(
        new UserError(
          "FxCore",
          "AgentSkillsDisabled",
          getLocalizedString("core.addSkill.featureFlagDisabled")
        )
      );
    }
    if (!inputs.projectPath) {
      throw new Error("projectPath is undefined"); // should never happen
    }

    const context = createContext();
    const projectPath = inputs.projectPath;
    const teamsManifestPath = path.resolve(projectPath, inputs[QuestionNames.ManifestPath]);
    const appPackageFolder = path.dirname(teamsManifestPath);

    // Validate the project is valid for adding a skill
    const manifestRes = await manifestUtils._readAppManifest(teamsManifestPath);
    if (manifestRes.isErr()) {
      return err(manifestRes.error);
    }

    const teamsManifest = manifestRes.value;
    const agent = teamsManifest.copilotExtensions
      ? teamsManifest.copilotExtensions.declarativeCopilots?.[0]
      : teamsManifest.copilotAgents?.declarativeAgents?.[0];
    if (!agent?.file) {
      return err(
        AppStudioResultFactory.UserError(
          AppStudioError.TeamsAppRequiredPropertyMissingError.name,
          AppStudioError.TeamsAppRequiredPropertyMissingError.message(
            "declarativeAgents",
            teamsManifestPath
          )
        )
      );
    }
    const agentFilePathRes = await getManifestPath(teamsManifestPath);
    if (agentFilePathRes.isErr()) {
      return err(agentFilePathRes.error);
    }

    const agentManifestPath = agentFilePathRes.value;

    // Confirm before modifying files (matches addPlugin pattern)
    const confirmMessage = getLocalizedString(
      "core.addSkill.confirm",
      path.relative(inputs.projectPath, appPackageFolder)
    );
    const confirmRes = await context.userInteraction.showMessage(
      "warn",
      confirmMessage,
      true,
      getLocalizedString("core.addSkill.continue")
    );
    if (confirmRes.isErr()) {
      return err(confirmRes.error);
    } else if (confirmRes.value !== getLocalizedString("core.addSkill.continue")) {
      return err(new UserCancelError());
    }

    const skillName = inputs[QuestionNames.SkillName] as string;
    const skillDescription = inputs[QuestionNames.SkillDescription] as string;
    const skillFrom = inputs[QuestionNames.SkillFrom] as string | undefined;
    const skillFromZipFile = inputs[QuestionNames.SkillFromZipFile] as string | undefined;

    let skillFolder: string;
    if (skillFrom || skillFromZipFile) {
      const isZipImport =
        skillFromZipFile || (skillFrom && skillFrom.toLowerCase().endsWith(".zip"));
      const sourcePath = skillFromZipFile || (skillFrom as string);

      if (isZipImport) {
        // Zip import mode
        const importRes = await this.importSkillFromZip(
          sourcePath,
          appPackageFolder,
          agentManifestPath
        );
        if (importRes.isErr()) {
          return err(importRes.error);
        }
        skillFolder = importRes.value;
      } else {
        // Existing skill folder mode: validate it's within appPackage
        const skillAbsPath = path.resolve(appPackageFolder, sourcePath);
        const relativePath = path.relative(appPackageFolder, skillAbsPath);
        if (relativePath.startsWith("..")) {
          return err(
            new UserError(
              "FxCore",
              "SkillOutsideAppPackage",
              "The skill directory must be within the app package folder."
            )
          );
        }

        // Validate folder name format
        const folderName = path.basename(skillAbsPath);
        const namePattern = /^[a-zA-Z][a-zA-Z0-9-]*$/;
        if (!namePattern.test(folderName)) {
          return err(
            new UserError(
              "FxCore",
              "InvalidSkillFolderName",
              `Skill folder name "${folderName}" is invalid. It must start with a letter and contain only letters, numbers, and hyphens.`
            )
          );
        }

        // Validate SKILL.md exists
        const skillMdPath = path.join(skillAbsPath, "SKILL.md");
        if (!(await fs.pathExists(skillMdPath))) {
          return err(
            new UserError(
              "FxCore",
              "SkillMdNotFound",
              `SKILL.md not found in ${skillAbsPath}. Each skill directory must contain a SKILL.md file.`
            )
          );
        }

        // Validate skill name in SKILL.md matches folder name
        const skillMdContent = await fs.readFile(skillMdPath, "utf-8");
        const nameMatch = skillMdContent.match(/^---[\s\S]*?^name:\s*(.+)$/m);
        if (nameMatch) {
          const skillMdName = nameMatch[1].trim();
          if (skillMdName !== folderName) {
            return err(
              new UserError(
                "FxCore",
                "SkillNameMismatch",
                `Skill name "${skillMdName}" in SKILL.md does not match folder name "${folderName}". They must be the same.`
              )
            );
          }
        }

        skillFolder = normalizePath(
          path.relative(path.dirname(agentManifestPath), skillAbsPath),
          true
        );
      }
    } else {
      // New skill mode: create the directory and SKILL.md
      const skillDir = path.join(appPackageFolder, "skills", skillName);
      await fs.ensureDir(skillDir);

      const skillMdContent = [
        "---",
        `name: ${skillName}`,
        `description: ${skillDescription}`,
        "---",
        `# ${skillName}`,
        "",
        "<!-- Add your skill instructions here -->",
        "<!-- The agent will follow these instructions when this skill is activated -->",
        "",
      ].join("\n");
      await fs.writeFile(path.join(skillDir, "SKILL.md"), skillMdContent);

      skillFolder = normalizePath(path.relative(path.dirname(agentManifestPath), skillDir), true);
    }

    // Add skill entry to DA manifest
    const addSkillRes = await copilotGptManifestUtils.addSkill(agentManifestPath, skillFolder);
    if (addSkillRes.isErr()) {
      return err(addSkillRes.error);
    }

    // Optionally expose skill to Copilot via top-level Teams manifest agentSkills
    const exposeToCopilot = inputs[QuestionNames.ExposeToCopilot];
    if (exposeToCopilot === true || exposeToCopilot === "yes") {
      // Compute folder path relative to app package folder (Teams manifest dir)
      const skillAbsPath = path.resolve(path.dirname(agentManifestPath), skillFolder);
      const teamsManifestSkillFolder = normalizePath(
        path.relative(appPackageFolder, skillAbsPath),
        true
      );

      // Read, update, and write the Teams manifest
      const teamsManifestForSkill = manifestRes.value;
      if (!teamsManifestForSkill.agentSkills) {
        teamsManifestForSkill.agentSkills = [];
      }
      if (
        !teamsManifestForSkill.agentSkills.some(
          (s: { folder: string }) => s.folder === teamsManifestSkillFolder
        )
      ) {
        teamsManifestForSkill.agentSkills.push({ folder: teamsManifestSkillFolder });
      }
      await fs.writeFile(teamsManifestPath, JSON.stringify(teamsManifestForSkill, null, 4));
    }

    // Show success message
    if (inputs.platform === Platform.VSCode) {
      const successMessage = getLocalizedString("core.addSkill.success.vsc");
      const viewAgentManifest = getLocalizedString("core.addSkill.success.viewAgentManifest");
      void context.userInteraction
        .showMessage("info", successMessage, false, viewAgentManifest)
        .then((userRes) => {
          if (userRes.isOk() && userRes.value === viewAgentManifest) {
            void TOOLS?.ui?.openFile?.(agentManifestPath);
          }
        });
    } else {
      const successMessage = getLocalizedString("core.addSkill.success", agentManifestPath);
      void context.userInteraction.showMessage("info", successMessage, false);
    }

    return ok(undefined);
  }

  /**
   * Import a skill from a .zip file into the appPackage/skills folder.
   * Validates zip entries for security, extracts to a temp directory, then moves atomically.
   */
  private async importSkillFromZip(
    zipPath: string,
    appPackageFolder: string,
    agentManifestPath: string
  ): Promise<Result<string, FxError>> {
    // Resolve zip path relative to CWD (not appPackage)
    const resolvedZipPath = path.resolve(zipPath);
    if (!(await fs.pathExists(resolvedZipPath))) {
      return err(
        new UserError("FxCore", "ZipFileNotFound", `Zip file not found: ${resolvedZipPath}`)
      );
    }

    let zip: AdmZip;
    try {
      zip = new AdmZip(resolvedZipPath);
    } catch {
      return err(
        new UserError(
          "FxCore",
          "InvalidZipFile",
          `Failed to read zip file: ${resolvedZipPath}. Please provide a valid .zip file.`
        )
      );
    }

    const entries = zip.getEntries();
    // Metadata directories to ignore
    const ignoredPrefixes = ["__MACOSX/", ".DS_Store"];

    // Security: validate all entries before extraction
    for (const entry of entries) {
      const entryName = entry.entryName.replace(/\\/g, "/");
      if (entryName.includes("..") || path.isAbsolute(entryName) || entryName.startsWith("/")) {
        return err(
          new UserError(
            "FxCore",
            "ZipInvalidEntries",
            getLocalizedString("core.addSkill.zipInvalidEntries")
          )
        );
      }
    }

    // Filter out metadata entries
    const validEntries = entries.filter((entry) => {
      const entryName = entry.entryName.replace(/\\/g, "/");
      return !ignoredPrefixes.some(
        (prefix) => entryName.startsWith(prefix) || entryName === prefix.replace("/", "")
      );
    });

    // Determine zip layout: single top-level directory or root-level files
    const topLevelDirs = new Set<string>();
    let hasRootFiles = false;
    for (const entry of validEntries) {
      const entryName = entry.entryName.replace(/\\/g, "/");
      const parts = entryName.split("/").filter((p) => p.length > 0);
      if (parts.length === 1 && !entry.isDirectory) {
        hasRootFiles = true;
      } else if (parts.length >= 1) {
        topLevelDirs.add(parts[0]);
      }
    }

    let skillContentPrefix = "";
    let derivedSkillName: string;

    if (!hasRootFiles && topLevelDirs.size === 1) {
      // Single top-level directory layout
      skillContentPrefix = [...topLevelDirs][0] + "/";
      derivedSkillName = [...topLevelDirs][0];
    } else if (hasRootFiles) {
      // Root-level files layout: derive name from SKILL.md frontmatter
      const skillMdEntry = validEntries.find((e) => {
        const name = e.entryName.replace(/\\/g, "/");
        return name === "SKILL.md" || name === "./SKILL.md";
      });
      if (!skillMdEntry) {
        return err(
          new UserError("FxCore", "ZipNoSkillMd", getLocalizedString("core.addSkill.zipNoSkillMd"))
        );
      }
      const skillMdContent = skillMdEntry.getData().toString("utf-8");
      const nameMatch = skillMdContent.match(/^---[\s\S]*?^name:\s*(.+)$/m);
      if (!nameMatch) {
        return err(
          new UserError(
            "FxCore",
            "ZipNoSkillMd",
            getLocalizedString("core.addSkill.zipNoSkillMd") +
              " The SKILL.md file must include a 'name' field in its frontmatter."
          )
        );
      }
      derivedSkillName = nameMatch[1].trim();
    } else {
      return err(
        new UserError(
          "FxCore",
          "ZipInvalidLayout",
          getLocalizedString("core.addSkill.zipInvalidLayout")
        )
      );
    }

    // Validate skill name format
    const namePattern = /^[a-zA-Z][a-zA-Z0-9-]*$/;
    if (!namePattern.test(derivedSkillName)) {
      return err(
        new UserError(
          "FxCore",
          "InvalidSkillFolderName",
          `Skill name "${derivedSkillName}" is invalid. It must start with a letter and contain only letters, numbers, and hyphens.`
        )
      );
    }

    // Check target folder doesn't already exist
    const targetSkillDir = path.join(appPackageFolder, "skills", derivedSkillName);
    if (await fs.pathExists(targetSkillDir)) {
      return err(
        new UserError(
          "FxCore",
          "SkillFolderAlreadyExists",
          getLocalizedString("core.addSkill.zipSkillFolderExists", derivedSkillName)
        )
      );
    }

    // Extract to temp directory first, then move atomically
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "atk-skill-import-"));
    const tempSkillDir = path.join(tempDir, derivedSkillName);
    try {
      await fs.ensureDir(tempSkillDir);

      // Extract relevant entries
      for (const entry of validEntries) {
        if (entry.isDirectory) continue;
        const entryName = entry.entryName.replace(/\\/g, "/");
        let relativeName = entryName;
        if (skillContentPrefix && entryName.startsWith(skillContentPrefix)) {
          relativeName = entryName.slice(skillContentPrefix.length);
        }
        if (!relativeName) continue;

        const targetPath = path.join(tempSkillDir, relativeName);
        // Re-validate no path traversal after joining
        const normalizedTarget = path.resolve(targetPath);
        if (!normalizedTarget.startsWith(path.resolve(tempSkillDir))) {
          return err(
            new UserError(
              "FxCore",
              "ZipInvalidEntries",
              getLocalizedString("core.addSkill.zipInvalidEntries")
            )
          );
        }

        await fs.ensureDir(path.dirname(targetPath));
        await fs.writeFile(targetPath, entry.getData());
      }

      // Validate SKILL.md exists in extracted content
      const extractedSkillMdPath = path.join(tempSkillDir, "SKILL.md");
      if (!(await fs.pathExists(extractedSkillMdPath))) {
        return err(
          new UserError("FxCore", "ZipNoSkillMd", getLocalizedString("core.addSkill.zipNoSkillMd"))
        );
      }

      // Validate name in SKILL.md matches derived folder name
      const extractedSkillMd = await fs.readFile(extractedSkillMdPath, "utf-8");
      const extractedNameMatch = extractedSkillMd.match(/^---[\s\S]*?^name:\s*(.+)$/m);
      if (extractedNameMatch) {
        const extractedName = extractedNameMatch[1].trim();
        if (extractedName !== derivedSkillName) {
          return err(
            new UserError(
              "FxCore",
              "SkillNameMismatch",
              `Skill name "${extractedName}" in SKILL.md does not match folder name "${derivedSkillName}". They must be the same.`
            )
          );
        }
      }

      // Move to final location
      await fs.ensureDir(path.dirname(targetSkillDir));
      await fs.move(tempSkillDir, targetSkillDir);
    } finally {
      // Clean up temp directory
      await fs.remove(tempDir).catch(() => {});
    }

    const skillFolder = normalizePath(
      path.relative(path.dirname(agentManifestPath), targetSkillDir),
      true
    );
    return ok(skillFolder);
  }

  /**
   * only for vs code extension
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "getODSPItemDetails", reset: true }),
    ErrorHandlerMW,
  ])
  async getODSPItemDetails(
    siteId: string,
    itemId?: string
  ): Promise<Result<ItemMetadata, FxError>> {
    const context = createContext();
    const res = await getODSPItemDetailById(context, siteId, itemId);
    if (res.isErr()) {
      return err(res.error);
    }
    return ok(res.value[0]);
  }

  /**
   * Kiota regenerate
   * Need to update da manifest and update m365agents.yml
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: Stage.addPlugin }),
    ErrorHandlerMW,
    QuestionMW("kiotaRegenerate"),
    ConcurrentLockerMW,
  ])
  async kiotaRegenerate(inputs: Inputs): Promise<Result<undefined, FxError>> {
    if (!inputs.projectPath) {
      throw new Error("projectPath is undefined"); // should never happen
    }

    const teamsManifestPath = inputs[QuestionNames.ManifestPath];
    const appPackageFolder = path.dirname(teamsManifestPath);
    const context = createContext();

    // validate the project is valid for adding plugin
    const manifestRes = await manifestUtils._readAppManifest(teamsManifestPath);
    if (manifestRes.isErr()) {
      return err(manifestRes.error);
    }

    const teamsManifest = manifestRes.value;
    const declarativeGpt = teamsManifest.copilotExtensions
      ? teamsManifest.copilotExtensions.declarativeCopilots?.[0]
      : teamsManifest.copilotAgents?.declarativeAgents?.[0];
    if (!declarativeGpt?.file) {
      return err(
        AppStudioResultFactory.UserError(
          AppStudioError.TeamsAppRequiredPropertyMissingError.name,
          AppStudioError.TeamsAppRequiredPropertyMissingError.message(
            "declarativeCopilots",
            teamsManifestPath
          )
        )
      );
    }
    const gptManifestFilePathRes = await getManifestPath(teamsManifestPath);
    if (gptManifestFilePathRes.isErr()) {
      return err(gptManifestFilePathRes.error);
    }

    const declarativeCopilotManifestPath = gptManifestFilePathRes.value;

    const declarativeCopilotManifesRes = await readCopilotGptManifestFile(
      declarativeCopilotManifestPath
    );
    if (declarativeCopilotManifesRes.isErr()) {
      return err(declarativeCopilotManifesRes.error);
    }

    const declarativeCopilotManifest = declarativeCopilotManifesRes.value;
    const pluginManifestFilePath = inputs[QuestionNames.ActionManifestPath];

    let actionId = "";
    declarativeCopilotManifest.actions?.forEach((action) => {
      const actionFilePath = path.normalize(path.join(appPackageFolder, action.file));
      if (actionFilePath.toLowerCase() === path.normalize(pluginManifestFilePath).toLowerCase()) {
        actionId = action.id;
      }
    });

    // Does not found same plugin manifest in da manifest, so add a new action
    // Should not happen when regenerate
    if (!actionId) {
      let suffix = 1;
      actionId = `action_${suffix}`;
      const existingActionIds = declarativeCopilotManifest.actions?.map((action) => action.id);
      while (existingActionIds?.includes(actionId)) {
        suffix += 1;
        actionId = `action_${suffix}`;
      }

      const addActionRes = await copilotGptManifestUtils.addAction(
        declarativeCopilotManifestPath,
        actionId,
        normalizePath(path.relative(appPackageFolder, pluginManifestFilePath), true)
      );

      if (addActionRes.isErr()) {
        return err(addActionRes.error);
      }
    }

    // 1. Get registration id and update plugin manifest
    const pluginManifestPath = inputs[QuestionNames.ActionManifestPath].trim() as string;
    const authData = await parseAndUpdatePluginManifestForKiota(pluginManifestPath, true);

    // 2. Update teamsapp.local.yaml and teamsapp.yaml if need to add auth action
    const specPath = inputs[QuestionNames.ApiSpecLocation].trim();
    for (const authInfo of authData) {
      await openApiSpecHelper.injectAuthAction(
        inputs.projectPath,
        authInfo.authName,
        undefined,
        specPath,
        false,
        authInfo.authType === "apiKey" ? "ApiKeyPluginVault" : "OAuthPluginVault",
        false,
        authInfo.registrationId
      );
    }

    // 3. Update plugin manifest to add ac info (optional)
    await generateAdaptiveCardInPluginManifestForKiota(pluginManifestFilePath, specPath, context);

    for (const action of declarativeCopilotManifest.actions!) {
      const actionPath = path.normalize(path.join(appPackageFolder, action.file));
      await copilotGptManifestUtils.updateConversationStarters(
        actionPath,
        declarativeCopilotManifest
      );
    }
    await copilotGptManifestUtils.writeCopilotGptManifestFile(
      declarativeCopilotManifest,
      declarativeCopilotManifestPath
    );

    return ok(undefined);
  }

  @hooks([
    ErrorContextMW({ component: "FxCore", stage: Stage.addAuthAction }),
    ErrorHandlerMW,
    QuestionMW("addAuthAction"),
    ConcurrentLockerMW,
  ])
  async addAuthAction(inputs: Inputs): Promise<Result<undefined, FxError>> {
    if (!inputs.projectPath) {
      throw new Error("projectPath is undefined"); // should never happen
    }

    const context = createContext();

    try {
      const pluginManifestPath = inputs[QuestionNames.PluginManifestFilePath] as string;
      const apiSpecRelativePath = inputs[QuestionNames.ApiSpecLocation] as string;
      const apiOperation = inputs[QuestionNames.ApiOperation] as string[];
      const authName = inputs[QuestionNames.AuthName] as string;
      const apiSpecPath = path.normalize(
        path.join(path.dirname(pluginManifestPath), apiSpecRelativePath)
      );
      const authType = inputs[QuestionNames.ApiAuth] as string;

      let authParameters: AuthParameters = {
        apis: apiOperation,
      };
      if (authType === AddAuthActionAuthTypeOptions.oauth().id) {
        const oauthAuthorizationUrl = inputs[QuestionNames.OAuthAuthorizationUrl] as string;
        const oauthTokenUrl = inputs[QuestionNames.OAuthTokenUrl] as string;
        const oauthRefreshUrl = inputs[QuestionNames.OAuthRefreshUrl] as string;
        const oauthScopes = inputs[QuestionNames.OAuthScope] as string;
        const enablePKCEStr = inputs[QuestionNames.OauthPKCE] as string;
        const scopeArr = this.parseScope(oauthScopes);

        authParameters = {
          ...authParameters,
          authorizationUrl: oauthAuthorizationUrl,
          tokenUrl: oauthTokenUrl,
          refreshUrl: oauthRefreshUrl ? oauthRefreshUrl : undefined,
          scopes: scopeArr,
          enablePKCE: enablePKCEStr === "true",
        } as OAuthParameters;
      } else if (authType === AddAuthActionAuthTypeOptions.apiKey().id) {
        const apiKeyIn = inputs[QuestionNames.ApiKeyIn] as string;
        const apiKeyName = inputs[QuestionNames.ApiKeyName] as string;
        authParameters = {
          ...authParameters,
          in: apiKeyIn,
          name: apiKeyName,
        } as ApiKeyParameters;
      } else if (authType === AddAuthActionAuthTypeOptions.microsoftEntra().id) {
        const oauthScopes = inputs[QuestionNames.OAuthScope] as string;
        const scopeArr = this.parseScope(oauthScopes);
        authParameters = {
          ...authParameters,
          authorizationUrl:
            "https://login.microsoftonline.com/${{TEAMS_APP_TENANT_ID}}/oauth2/v2.0/authorize",
          tokenUrl: "https://login.microsoftonline.com/${{TEAMS_APP_TENANT_ID}}/oauth2/v2.0/token",
          refreshUrl: undefined,
          scopes: scopeArr,
        } as OAuthParameters;
      }

      // Update openapi spec
      const specParser = new SpecParser(apiSpecPath, getParserOptions(ProjectType.Copilot, true));
      await specParser.addAuthScheme(authName, authType, authParameters);

      let authTypeScheme;
      switch (authType) {
        case AddAuthActionAuthTypeOptions.apiKey().id:
        case AddAuthActionAuthTypeOptions.bearerToken().id:
        default:
          authTypeScheme = APIKeyAuthType;
          break;
        case AddAuthActionAuthTypeOptions.oauth().id:
          authTypeScheme = OAuthAuthType;
          break;
        case AddAuthActionAuthTypeOptions.microsoftEntra().id:
          authTypeScheme = MicrosoftEntraAuthType;
          break;
      }

      const addAuthActionRes = await openApiSpecHelper.injectAuthAction(
        inputs.projectPath,
        authName,
        undefined,
        apiSpecPath,
        true,
        authTypeScheme,
        "enablePKCE" in authParameters ? authParameters.enablePKCE : undefined
      );

      if (addAuthActionRes?.registrationIdEnvName) {
        const pluginManifest = (await fs.readJson(pluginManifestPath)) as PluginManifestSchema;
        pluginManifest.runtimes?.forEach((runtime) => {
          if (
            runtime.type === "OpenApi" &&
            runtime.auth?.type === "None" &&
            runtime.spec?.url === apiSpecRelativePath
          ) {
            runtime.run_for_functions = runtime.run_for_functions?.filter(
              (value) => !!!apiOperation.includes(value)
            );
          }
        });
        pluginManifest.runtimes = pluginManifest.runtimes?.filter((runtime) => {
          return !!runtime.run_for_functions && runtime.run_for_functions?.length > 0;
        });
        pluginManifest.runtimes?.push({
          type: "OpenApi",
          auth: {
            type:
              authTypeScheme === MicrosoftEntraAuthType
                ? OAuthAuthType
                : (authTypeScheme as "None" | "OAuthPluginVault" | "ApiKeyPluginVault"),
            reference_id: `\$\{\{${addAuthActionRes.registrationIdEnvName}\}\}`,
          },
          spec: {
            url: apiSpecRelativePath,
            progress_style: "ShowUsageWithInputAndOutput",
          },
          run_for_functions: apiOperation,
        });
        await fs.writeJson(pluginManifestPath, pluginManifest, { spaces: 4 });
      }

      if (authType === AddAuthActionAuthTypeOptions.microsoftEntra().id) {
        const appIdUriPlaceholder = Utils.getSafeRegistrationIdEnvName(
          `${authName}_APPLICATION_ID_URI`
        );
        void context.userInteraction.showMessage(
          "warn",
          getLocalizedString("core.addAuthAction.microsoftEntra.message", appIdUriPlaceholder),
          false
        );
      }

      context.telemetryReporter.sendTelemetryEvent(TelemetryEvent.AddAuthAction, {
        [TelemetryProperty.AddAuthType]: authType,
      });
    } catch (e: any) {
      const error = assembleError(e);
      context.telemetryReporter.sendTelemetryErrorEvent(TelemetryEvent.AddAuthAction, {
        [TelemetryProperty.ErrorCode]: error.name,
        [TelemetryProperty.ErrorMessage]: error.message,
      });
      return err(error);
    }

    return ok(undefined);
  }

  @hooks([
    ErrorContextMW({ component: "FxCore", stage: Stage.setSensitivityLabel }),
    ErrorHandlerMW,
    QuestionMW("setSensitivityLabel"),
  ])
  async setSensitivityLabel(inputs: Inputs): Promise<Result<undefined, FxError>> {
    const declarativeAgentManifestPath = inputs[
      QuestionNames.DeclarativeAgentManifestPath
    ] as string;
    if (!declarativeAgentManifestPath || !(await fs.pathExists(declarativeAgentManifestPath))) {
      throw new Error("declarativeAgentManifestPath is undefined or does not exist");
    }
    return await withFileLock(declarativeAgentManifestPath, async () => {
      const context = createContext();
      const confirmMessage = getLocalizedString(
        "core.setSensitivityLabel.confirm",
        declarativeAgentManifestPath
      );
      const confirmRes = await context.userInteraction.showMessage(
        "warn",
        confirmMessage,
        true,
        getLocalizedString("core.setSensitivityLabel.continue")
      );

      if (confirmRes.isErr()) {
        return err(confirmRes.error);
      } else if (confirmRes.value !== getLocalizedString("core.setSensitivityLabel.continue")) {
        return err(new UserCancelError());
      }
      const selectedLabel = inputs[QuestionNames.SensitivityLabel] as string;
      const declarativeAgentManifestRes =
        await copilotGptManifestUtils.readDeclarativeAgentManifestFile(
          declarativeAgentManifestPath
        );
      if (declarativeAgentManifestRes.isErr()) {
        return err(declarativeAgentManifestRes.error);
      }
      const declarativeAgentManifest = declarativeAgentManifestRes.value;
      declarativeAgentManifest.sensitivity_label = {
        id: selectedLabel,
      };
      const writeRes = await copilotGptManifestUtils.writeDeclarativeAgentManifestFile(
        declarativeAgentManifest,
        declarativeAgentManifestPath
      );
      if (writeRes.isErr()) {
        return err(writeRes.error);
      }
      return ok(undefined);
    });
  }

  @hooks([
    ErrorContextMW({ component: "FxCore", stage: Stage.installApp }),
    ErrorHandlerMW,
    EnvLoaderMW(false),
    ContextInjectorMW,
  ])
  async installAppToChannel(inputs: Inputs): Promise<Result<undefined, FxError>> {
    const installAppDriver = Container.get<InstallAppToChannelDriver>("devChannel/installApp");
    const context: DriverContext = createDriverContext(inputs);
    setErrorContext({ component: "devChannelInstallApp" });
    const env: string = inputs.env;

    const readEnvRes = await envUtil.readEnv(context.projectPath, env, false, false);
    if (readEnvRes.isErr()) {
      return err(readEnvRes.error);
    }
    const envObject = readEnvRes.value;

    const inputArgs: InstallAppArgs = {
      appPackagePath: inputs.appPackagePath,
      teamId: envObject.TEAM_ID,
      channelId: envObject.CHANNEL_ID,
    };
    const res = await installAppDriver.execute(inputArgs, context, new Map());
    if (res.result.isErr()) {
      return err(res.result.error);
    }
    return ok(undefined);
  }

  /**
   * dynamic template metadata download
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "fetchOnlineTemplateMetadata" }),
    ErrorHandlerMW,
  ])
  async fetchOnlineTemplateMetadata(): Promise<Result<undefined, FxError>> {
    if (templateHelper.useLocalTemplate()) {
      return ok(undefined); // Skip if using local templates
    }
    // Downloads the latest online template metadata (metadata.zip) into user's home .fx folder.
    // Caches the template version so subsequent calls avoid redundant downloads if unchanged.
    try {
      const useV4Channel = featureFlagManager.getBooleanValue(FeatureFlags.V4Enabled);

      const homedir = os.homedir();
      const metadataDir = path.join(homedir, `.${String(ConfigFolderName)}`);
      await fs.ensureDir(metadataDir);

      let latestVersion: string;
      if (useV4Channel) {
        // V4 publishes templates-metadata.zip as a staged artifact. Resolve it
        // through the shared artifact cache and leave the legacy ~/.fx metadata
        // directory untouched so old metadata readers keep using bundled v4 data.
        const resolved = await resolveV4MetadataSource();
        if (resolved.isErr()) {
          // Malformed tag list / digest mismatch are hard errors (no silent
          // fallback). An unreachable channel does not reach here — it already
          // resolved to a bundled-fallback origin handled below.
          return err(resolved.error);
        }
        return ok(undefined);
      } else {
        // v3: prerelease builds use the mutable rolling `0.0.0-rc` tag; stable
        // builds resolve the latest published templates version.
        const coreVersion = getCoreVersion();
        if (
          coreVersion.includes("alpha") ||
          coreVersion.includes("beta") ||
          coreVersion.includes("rc")
        ) {
          latestVersion = "0.0.0-rc";
        } else {
          latestVersion = await generatorUtils.getTemplateLatestVersion();
        }
      }

      // Use a channel-specific cache file so flipping the flag triggers a fresh
      // download instead of a stale v3 cache hit; the v4 file's presence is also
      // the readers' signal (`useBundledMetadataForV4`) that downloaded v4
      // metadata is available.
      const versionFile = path.join(
        metadataDir,
        useV4Channel ? "template-version-v4.txt" : "template-version.txt"
      );
      const needDownload = async (): Promise<boolean> => {
        // Always re-download for mutable pre-release tags (content changes but tag stays the same)
        if (latestVersion === "0.0.0-rc") return true;

        if (!(await fs.pathExists(versionFile))) return true;
        try {
          const cachedVersion = (await fs.readFile(versionFile, "utf-8")).trim();
          return cachedVersion !== latestVersion;
        } catch {
          return true; // re-download if any issue reading cached version
        }
      };

      if (!(await needDownload())) {
        return ok(undefined); // Already up-to-date
      }

      // Construct metadata.zip download URL based on tag prefix and version.
      const tagPrefix = useV4Channel ? templateConfig.v4tagPrefix : templateConfig.tagPrefix;
      const tag = `${tagPrefix}${latestVersion}`;
      const metadataZipUrl = `${templateConfig.templateDownloadBaseURL}/${tag}/metadata.zip`;

      const zip = await generatorUtils.fetchZipFromUrl(metadataZipUrl);
      await generatorUtils.unzip(zip, metadataDir);
      await fs.writeFile(versionFile, latestVersion, { encoding: "utf-8" });

      // Clear locale cache so freshly downloaded NLS files are picked up
      clearLocaleCache();

      return ok(undefined);
    } catch (error: any) {
      const message = error?.message || "Unknown error while fetching template metadata";
      const systemErr = new SystemError(
        "FetchOnlineTemplateMetadata",
        "DownloadFailed",
        message,
        message
      );
      return err(systemErr);
    }
  }

  /**
   * dynamic VS template metadata download
   */
  @hooks([
    ErrorContextMW({ component: "FxCore", stage: "fetchOnlineTemplateMetadataForVS" }),
    ErrorHandlerMW,
  ])
  async fetchOnlineTemplateMetadataForVS(): Promise<Result<undefined, FxError>> {
    if (templateHelper.useLocalTemplate()) {
      return ok(undefined); // Skip if using local templates
    }
    try {
      // VS ships stable templates with a stable fx-core and test/pre-release
      // templates with a beta fx-core. So beta = pre-stable test build → RC.
      const coreVersion = getCoreVersion();
      const latestVersion = coreVersion.includes("beta")
        ? "0.0.0-rc"
        : await generatorUtils.getTemplateVSLatestVersion();

      const homedir = os.homedir();
      const metadataDir = path.join(homedir, `.${String(ConfigFolderName)}`, "vs-metadata");
      await fs.ensureDir(metadataDir);

      const versionFile = path.join(metadataDir, "template-vs-version.txt");
      const needDownload = async (): Promise<boolean> => {
        if (!(await fs.pathExists(versionFile))) return true;
        try {
          const cachedVersion = (await fs.readFile(versionFile, "utf-8")).trim();
          return cachedVersion !== latestVersion;
        } catch {
          return true;
        }
      };

      if (!(await needDownload())) {
        return ok(undefined); // Already up-to-date
      }

      const tag = `${templateConfig.vstagPrefix}${latestVersion}`;
      const metadataZipUrl = `${templateConfig.templateDownloadBaseURL}/${tag}/metadata.zip`;

      const zip = await generatorUtils.fetchZipFromUrl(metadataZipUrl);
      await generatorUtils.unzip(zip, metadataDir);
      await fs.writeFile(versionFile, latestVersion, { encoding: "utf-8" });
      return ok(undefined);
    } catch (error: any) {
      const message = error?.message || "Unknown error while fetching VS template metadata";
      const systemErr = new SystemError(
        "FetchOnlineTemplateMetadataForVS",
        "DownloadFailed",
        message,
        message
      );
      return err(systemErr);
    }
  }

  /**
   * generate config files
   */
  @hooks([ErrorContextMW({ component: "FxCore", stage: "generateConfigFiles" }), ErrorHandlerMW])
  async generateConfigFiles(inputs: Inputs): Promise<Result<undefined, FxError>> {
    return await generateConfigFiles(inputs);
  }

  protected async updateAuthActionInYaml(
    authName: string | undefined,
    authScheme: AuthType | undefined,
    projectPath: string,
    apSpecPath: string,
    pluginManifestPath: string,
    forceToAddNew = true
  ): Promise<void> {
    if (authName && authScheme) {
      const authInjectRes = await openApiSpecHelper.injectAuthAction(
        projectPath,
        authName,
        authScheme,
        apSpecPath,
        forceToAddNew
      );
      if (
        authInjectRes?.defaultRegistrationIdEnvName &&
        authInjectRes?.registrationIdEnvName &&
        authInjectRes.defaultRegistrationIdEnvName !== authInjectRes.registrationIdEnvName
      ) {
        const pluginManifestContent = await fs.readFile(pluginManifestPath, "utf-8");
        const updatedPluginManifestContext = pluginManifestContent.replace(
          authInjectRes.defaultRegistrationIdEnvName,
          authInjectRes.registrationIdEnvName
        );
        await fs.writeFile(pluginManifestPath, updatedPluginManifestContext);
      }
    }
  }

  protected parseAuthNameAndScheme(
    listResult: ListAPIResult,
    inputs: Inputs
  ): { authName: string; authScheme: AuthType }[] {
    const authApis = listResult.APIs.filter((value) => value.isValid && !!value.auth);
    const result: {
      authName: string;
      authScheme: AuthType;
    }[] = [];
    for (const api of inputs[QuestionNames.ApiOperation] as string[]) {
      const operation = authApis.find((op) => op.api === api);
      if (
        operation &&
        operation.auth &&
        (Utils.isBearerTokenAuth(operation.auth.authScheme) ||
          Utils.isOAuthWithAuthCodeFlow(operation.auth.authScheme) ||
          Utils.isAPIKeyAuthButNotInCookie(operation.auth.authScheme))
      ) {
        if (result.find((value) => value.authName === operation.auth!.name)) {
          continue;
        }
        result.push({ authName: operation.auth.name, authScheme: operation.auth.authScheme });
      }
    }
    return result;
  }

  private parseScope(scope: string): { [scope: string]: string } {
    const scopeArr: { [scope: string]: string } = {};
    scope.split(";").forEach((scopeStr) => {
      const lastIndex = scopeStr.lastIndexOf(":");
      if (lastIndex !== -1) {
        const key = scopeStr.substring(0, lastIndex).trim();
        const value = scopeStr.substring(lastIndex + 1).trim();
        scopeArr[key] = value;
      }
    });
    return scopeArr;
  }

  async isDelcarativeAgentApp(inputs: Inputs): Promise<Result<any, FxError>> {
    const projectPath = inputs[QuestionNames.ProjectPath] as string;
    const manifestRes = await manifestUtils.readAppManifest(projectPath);
    if (manifestRes.isErr()) {
      return err(manifestRes.error);
    }
    return ok(IsDeclarativeAgentManifest(manifestRes.value));
  }

  private async addOneDriveSharePointKnowledge(
    inputs: Inputs,
    agentManifestPath: string
  ): Promise<Result<undefined, FxError>> {
    const manifestRes = await readCopilotGptManifestFile(agentManifestPath);
    if (manifestRes.isErr()) {
      return err(manifestRes.error);
    }

    let oneDriveSharePointIds: SharePointIDs | null = null;
    let oneDriveSharePointUrls: Site | null = null;

    const sharePointItem = inputs.oneDriveSharePointItem?.[0];
    if (
      sharePointItem &&
      inputs[QuestionNames.SearchType] !== KnowledgeSearchTypeOptions.allOneDriveSharepoint().id
    ) {
      if (sharePointItem.url) {
        oneDriveSharePointUrls = { url: sharePointItem.url };
      } else {
        oneDriveSharePointIds = {
          site_id: sharePointItem.siteId,
          web_id: sharePointItem.webId,
          ...(sharePointItem.listId && { list_id: sharePointItem.listId }),
          ...(sharePointItem.uniqueId && { unique_id: sharePointItem.uniqueId }),
        };
      }
    }

    const addOneDriveSharePointCapabilityRes =
      await copilotGptManifestUtils.addOneDriveSharePointCapability(
        agentManifestPath,
        oneDriveSharePointIds,
        oneDriveSharePointUrls,
        manifestRes
      );

    if (addOneDriveSharePointCapabilityRes.isErr()) {
      return err(addOneDriveSharePointCapabilityRes.error);
    }

    return ok(undefined);
  }

  private async addWebSearchKnowledge(
    context: Context,
    inputs: Inputs,
    agentManifestPath: string
  ): Promise<Result<undefined, FxError>> {
    const manifestRes = await readCopilotGptManifestFile(agentManifestPath);
    if (manifestRes.isErr()) {
      return err(manifestRes.error);
    }

    let webSearchUrl: Site | null = null;
    if (inputs[QuestionNames.SearchType] !== KnowledgeSearchTypeOptions.allWeb().id) {
      webSearchUrl = {
        url: inputs.webSearchUrl,
      };
    }

    const addWebSearchCapabilityRes = await copilotGptManifestUtils.addWebSearchCapability(
      context,
      agentManifestPath,
      webSearchUrl,
      manifestRes
    );

    if (addWebSearchCapabilityRes.isErr()) {
      return err(addWebSearchCapabilityRes.error);
    }

    return ok(undefined);
  }

  private async addGCKnowledge(
    inputs: Inputs,
    agentManifestPath: string
  ): Promise<Result<undefined, FxError>> {
    const manifestRes = await readCopilotGptManifestFile(agentManifestPath);
    if (manifestRes.isErr()) {
      return err(manifestRes.error);
    }

    let connectionIds: string[];
    if (inputs[QuestionNames.GCInput]) {
      connectionIds = [inputs[QuestionNames.GCInput]];
    } else {
      connectionIds = inputs[QuestionNames.GCList];
    }
    const addGCCapabilityRes = await copilotGptManifestUtils.addGCCapability(
      agentManifestPath,
      connectionIds,
      manifestRes
    );

    if (addGCCapabilityRes.isErr()) {
      return err(addGCCapabilityRes.error);
    }

    return ok(undefined);
  }

  private async addEmbeddedKnowledge(inputs: Inputs): Promise<Result<undefined, FxError>> {
    const manifestFilePath = inputs[QuestionNames.ManifestPath] as string;
    const filePath = inputs[QuestionNames.EmbeddedKnowledgeFiles] as string[];
    const res = await copilotGptManifestUtils.addEmbeddedKnowledgeFiles(manifestFilePath, filePath);
    return res;
  }

  private showAddKnowledgeSuccessMessage(
    context: Context,
    inputs: Inputs,
    agentManifestPath: string,
    knowledgeSource: string
  ): void {
    if (knowledgeSource === KnowledgeSourceOptions.embeddedKnowledge().id) {
      void TOOLS.ui.showMessage(
        "info",
        getLocalizedString("core.addEmbeddedKnowledge.success"),
        false
      );
      return;
    }

    if (inputs.platform === Platform.VSCode) {
      const successMessage = getLocalizedString("core.addKnowledge.success.vsc");
      const viewAgentManifest = getLocalizedString("core.addKnowledge.success.viewAgentManifest");
      void context.userInteraction
        .showMessage("info", successMessage, false, viewAgentManifest)
        .then((userRes) => {
          if (userRes.isOk() && userRes.value === viewAgentManifest) {
            context.telemetryReporter.sendTelemetryEvent(
              TelemetryEvent.ViewAgentManifestAfterAdded
            );
            void TOOLS?.ui?.openFile?.(agentManifestPath);
          }
        });
    } else {
      const successMessage = getLocalizedString("core.addKnowledge.success", agentManifestPath);
      void context.userInteraction.showMessage("info", successMessage, false);
    }
  }
}
