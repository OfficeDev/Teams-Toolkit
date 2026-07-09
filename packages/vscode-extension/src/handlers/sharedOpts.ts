// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { err, FxError, Inputs, ok, Result, Stage, SystemError } from "@microsoft/teamsfx-api";
import {
  getHashedEnv,
  IncompatibleProjectError,
  isUserCancelError,
  VersionState,
} from "@microsoft/teamsfx-core";
import * as util from "util";
import * as uuid from "uuid";
import * as vscode from "vscode";
import { window } from "vscode";
import { RecommendedOperations } from "../debug/common/debugConstants";
import { isLoginFailureError, showError, wrapError } from "../error/common";
import { ExtensionErrors, ExtensionSource } from "../error/error";
import { TreatmentVariableValue } from "../exp/treatmentVariables";
import { core } from "../globalVariables";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import {
  TelemetryEvent,
  TelemetryProperty,
  TelemetrySuccess,
} from "../telemetry/extTelemetryEvents";
import { checkCoreNotEmpty } from "../utils/commonUtils";
import { localize } from "../utils/localizeUtils";
import { getSystemInputs } from "../utils/systemEnvUtils";
import { getTeamsAppTelemetryInfoByEnv } from "../utils/telemetryUtils";

type FxCoreWithAddWebpart = {
  addWebpart(inputs: Inputs): Promise<Result<undefined, FxError>>;
};

function hasAddWebpart(
  coreInstance: typeof core
): coreInstance is typeof core & FxCoreWithAddWebpart {
  return (
    "addWebpart" in coreInstance &&
    typeof (coreInstance as FxCoreWithAddWebpart).addWebpart === "function"
  );
}

export async function runCommand(
  stage: Stage,
  defaultInputs?: Inputs,
  telemetryProperties?: { [key: string]: string }
): Promise<Result<any, FxError>> {
  const eventName = ExtTelemetry.stageToEvent(stage);
  let result: Result<any, FxError>;
  let inputs: Inputs | undefined;
  try {
    const checkCoreRes = checkCoreNotEmpty();
    if (checkCoreRes.isErr()) {
      throw checkCoreRes.error;
    }

    inputs = defaultInputs ? defaultInputs : getSystemInputs();
    inputs.stage = stage;
    inputs.inProductDoc = TreatmentVariableValue.inProductDoc;

    const skipVersionCheckStages = new Set<Stage>([Stage.create, Stage.createTdp]);
    if (!skipVersionCheckStages.has(stage) && inputs.projectPath) {
      const versionCheckInputs: Inputs = { ...inputs, ignoreEnvInfo: true };
      const versionCheckRes = await core.projectVersionCheck(versionCheckInputs);
      if (versionCheckRes.isErr()) {
        result = err(versionCheckRes.error);
        await processResult(eventName, result, inputs, telemetryProperties);
        return result;
      }

      if (versionCheckRes.value.isSupport === VersionState.unsupported) {
        result = err(new IncompatibleProjectError("core.migrationV3.abandonedProject"));
        await processResult(eventName, result, inputs, telemetryProperties);
        return result;
      }

      if (versionCheckRes.value.isSupport === VersionState.upgradeable) {
        result = err(new IncompatibleProjectError("core.migrationV3.notAllowedMigration"));
        await processResult(eventName, result, inputs, telemetryProperties);
        return result;
      }
    }

    switch (stage) {
      case Stage.create: {
        inputs.projectId = inputs.projectId ?? uuid.v4();
        inputs["mcp-da-available-tools"] = vscode.lm.tools;
        const tmpResult = await core.createProjectFrontDoor(inputs);
        if (tmpResult.isErr()) {
          result = err(tmpResult.error);
        } else {
          result = ok(tmpResult.value);
        }
        break;
      }
      case Stage.createTdp: {
        inputs.projectId = inputs.projectId ?? uuid.v4();
        const tmpResult = await core.createProjectFromTdp(inputs);
        if (tmpResult.isErr()) {
          result = err(tmpResult.error);
        } else {
          result = ok(tmpResult.value);
        }
        break;
      }
      case Stage.provision: {
        result = await core.provisionResources(inputs);
        if (inputs.env === "local" && result.isErr()) {
          result.error.recommendedOperation = RecommendedOperations.DebugInTestTool;
        }
        break;
      }
      case Stage.deploy: {
        result = await core.deployArtifacts(inputs);
        if (inputs.env === "local" && result.isErr()) {
          result.error.recommendedOperation = RecommendedOperations.DebugInTestTool;
        }
        break;
      }
      case Stage.deployAad: {
        result = await core.deployAadManifest(inputs);
        break;
      }
      case Stage.deployTeams: {
        result = await core.deployTeamsManifest(inputs);
        break;
      }
      case Stage.buildAad: {
        result = await core.buildAadManifest(inputs);
        break;
      }
      case Stage.ConvertAadToNewSchema: {
        result = await core.convertAadToNewSchema(inputs);
        break;
      }
      case Stage.publish: {
        result = await core.publishApplication(inputs);
        break;
      }
      case Stage.share: {
        result = await core.shareApplication(inputs);
        break;
      }
      case Stage.shareRemove: {
        result = await core.removeSharedAccess(inputs);
        break;
      }
      case Stage.debug: {
        inputs.ignoreEnvInfo = false;
        inputs.checkerInfo = {
          skipNgrok: false, // TODO: remove this flag
          trustDevCert: true, // TODO: remove this flag
        };
        result = await core.localDebug(inputs);
        break;
      }
      case Stage.createEnv: {
        result = await core.createEnv(inputs);
        break;
      }
      case Stage.publishInDeveloperPortal: {
        result = await core.publishInDeveloperPortal(inputs);
        break;
      }
      case Stage.addWebpart: {
        if (hasAddWebpart(core)) {
          result = await core.addWebpart(inputs);
          break;
        }
        throw new SystemError(
          ExtensionSource,
          ExtensionErrors.UnsupportedOperation,
          util.format(localize("teamstoolkit.handlers.operationNotSupport"), stage)
        );
        break;
      }
      case Stage.validateApplication: {
        result = await core.validateApplication(inputs);
        break;
      }
      case Stage.syncManifest: {
        result = await core.syncManifest(inputs);
        break;
      }
      case Stage.createAppPackage: {
        result = await core.createAppPackage(inputs);
        break;
      }
      case Stage.copilotPluginAddAPI: {
        result = await core.copilotPluginAddAPI(inputs);
        break;
      }
      case Stage.addPlugin: {
        result = await core.addPlugin(inputs);
        break;
      }
      case Stage.RegeneratePlugin: {
        result = await core.regeneratePlugin(inputs);
        break;
      }
      case Stage.addAuthAction: {
        result = await core.addAuthAction(inputs);
        break;
      }
      case Stage.addKnowledge: {
        result = await core.addKnowledge(inputs);
        break;
      }
      case Stage.addSkill: {
        result = await core.addSkill(inputs);
        break;
      }
      case Stage.setSensitivityLabel: {
        result = await core.setSensitivityLabel(inputs);
        break;
      }
      case Stage.installApp: {
        result = await core.installAppToChannel(inputs);
        break;
      }
      case Stage.updateActionWithMCP: {
        result = await core.updateActionWithMCP(inputs);
        break;
      }
      default:
        throw new SystemError(
          ExtensionSource,
          ExtensionErrors.UnsupportedOperation,
          util.format(localize("teamstoolkit.handlers.operationNotSupport"), stage)
        );
    }
  } catch (e) {
    result = wrapError(e as Error);
  }

  await processResult(eventName, result, inputs, telemetryProperties);

  return result;
}

export async function processResult(
  eventName: string | undefined,
  result: Result<null, FxError>,
  inputs?: Inputs,
  extraProperty?: { [key: string]: string }
) {
  const envProperty: { [key: string]: string } = {};
  const createProperty: { [key: string]: string } = {};

  if (inputs?.env) {
    envProperty[TelemetryProperty.Env] = getHashedEnv(inputs.env);
    const appInfo = await getTeamsAppTelemetryInfoByEnv(inputs.env);
    if (appInfo) {
      envProperty[TelemetryProperty.AppId] = appInfo.appId;
      envProperty[TelemetryProperty.TenantId] = appInfo.tenantId;
    }
  }
  if (eventName == TelemetryEvent.CreateProject && inputs?.projectId) {
    createProperty[TelemetryProperty.NewProjectId] = inputs?.projectId;
  }
  if (eventName === TelemetryEvent.CreateProject && inputs?.isM365) {
    createProperty[TelemetryProperty.IsCreatingM365] = "true";
  }

  if (eventName === TelemetryEvent.Deploy && inputs && inputs["include-aad-manifest"] === "yes") {
    eventName = TelemetryEvent.DeployAadManifest;
  }

  if (result.isErr()) {
    if (eventName) {
      ExtTelemetry.sendTelemetryErrorEvent(eventName, result.error, {
        ...createProperty,
        ...envProperty,
        ...extraProperty,
      });
    }
    const error = result.error;
    if (isUserCancelError(error)) {
      return;
    }
    if (isLoginFailureError(error)) {
      void window.showErrorMessage(localize("teamstoolkit.handlers.loginFailed"));
      return;
    }
    void showError(error);
  } else {
    if (eventName) {
      if (eventName === TelemetryEvent.CreateNewEnvironment) {
        if (inputs?.sourceEnvName) {
          envProperty[TelemetryProperty.SourceEnv] = getHashedEnv(inputs.sourceEnvName);
        }
        if (inputs?.targetEnvName) {
          envProperty[TelemetryProperty.TargetEnv] = getHashedEnv(inputs.targetEnvName);
        }
      }
      ExtTelemetry.sendTelemetryEvent(eventName, {
        [TelemetryProperty.Success]: TelemetrySuccess.Yes,
        ...createProperty,
        ...envProperty,
        ...extraProperty,
      });
    }
  }
}
