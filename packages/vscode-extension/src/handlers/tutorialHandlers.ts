// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  FxError,
  OptionItem,
  Platform,
  Result,
  SingleSelectConfig,
  StaticOptions,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import * as templatesMetadata from "@microsoft/teamsfx-core/build/component/generator/templates/metadata";
import { PanelType } from "../controls/PanelType";
import { WebviewPanel } from "../controls/webviewPanel";
import { TreatmentVariableValue } from "../exp/treatmentVariables";
import { isSPFxProject } from "../globalVariables";
import { VS_CODE_UI } from "../qm/vsc_ui";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import {
  TelemetryEvent,
  TelemetryProperty,
  TelemetryTriggerFrom,
} from "../telemetry/extTelemetryEvents";
import { localize } from "../utils/localizeUtils";
import { getTriggerFromProperty } from "../utils/telemetryUtils";

export async function selectTutorialsHandler(
  ...args: unknown[]
): Promise<Result<unknown, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ViewGuidedTutorials, getTriggerFromProperty(args));
  const config: SingleSelectConfig = {
    name: "tutorialName",
    title: localize("teamstoolkit.commandsTreeViewProvider.guideTitle"),
    options: isSPFxProject
      ? [
          {
            id: "cicdPipeline",
            label: `${localize("teamstoolkit.guides.cicdPipeline.label")}`,
            detail: localize("teamstoolkit.guides.cicdPipeline.detail"),
            groupName: localize("teamstoolkit.guide.development"),
            data: "https://aka.ms/teamsfx-add-cicd-new",
            buttons: [
              {
                iconPath: "file-symlink-file",
                tooltip: localize("teamstoolkit.guide.tooltip.github"),
                command: "fx-extension.openTutorial",
              },
            ],
          },
        ]
      : [
          {
            id: "cardActionResponse",
            label: `${localize("teamstoolkit.guides.cardActionResponse.label")}`,
            detail: localize("teamstoolkit.guides.cardActionResponse.detail"),
            groupName: localize("teamstoolkit.guide.scenario"),
            data: "https://aka.ms/teamsfx-workflow-new",
            buttons: [
              {
                iconPath: "file-symlink-file",
                tooltip: localize("teamstoolkit.guide.tooltip.github"),
                command: "fx-extension.openTutorial",
              },
            ],
          },
          {
            id: "sendNotification",
            label: `${localize("teamstoolkit.guides.sendNotification.label")}`,
            detail: localize("teamstoolkit.guides.sendNotification.detail"),
            groupName: localize("teamstoolkit.guide.scenario"),
            data: "https://aka.ms/teamsfx-notification-new",
            buttons: [
              {
                iconPath: "file-symlink-file",
                tooltip: localize("teamstoolkit.guide.tooltip.github"),
                command: "fx-extension.openTutorial",
              },
            ],
          },
          {
            id: "commandAndResponse",
            label: `${localize("teamstoolkit.guides.commandAndResponse.label")}`,
            detail: localize("teamstoolkit.guides.commandAndResponse.detail"),
            groupName: localize("teamstoolkit.guide.scenario"),
            data: "https://aka.ms/teamsfx-command-new",
            buttons: [
              {
                iconPath: "file-symlink-file",
                tooltip: localize("teamstoolkit.guide.tooltip.github"),
                command: "fx-extension.openTutorial",
              },
            ],
          },
          {
            id: "dashboardApp",
            label: `${localize("teamstoolkit.guides.dashboardApp.label")}`,
            detail: localize("teamstoolkit.guides.dashboardApp.detail"),
            groupName: localize("teamstoolkit.guide.scenario"),
            data: "https://aka.ms/teamsfx-dashboard-new",
            buttons: [
              {
                iconPath: "file-symlink-file",
                tooltip: localize("teamstoolkit.guide.tooltip.github"),
                command: "fx-extension.openTutorial",
              },
            ],
          },
          {
            id: "addTab",
            label: `${localize("teamstoolkit.guides.addTab.label")}`,
            detail: localize("teamstoolkit.guides.addTab.detail"),
            groupName: localize("teamstoolkit.guide.capability"),
            data: "https://aka.ms/teamsfx-add-tab",
            buttons: [
              {
                iconPath: "file-symlink-file",
                tooltip: localize("teamstoolkit.guide.tooltip.github"),
                command: "fx-extension.openTutorial",
              },
            ],
          },
          {
            id: "addBot",
            label: `${localize("teamstoolkit.guides.addBot.label")}`,
            detail: localize("teamstoolkit.guides.addBot.detail"),
            groupName: localize("teamstoolkit.guide.capability"),
            data: "https://aka.ms/teamsfx-add-bot",
            buttons: [
              {
                iconPath: "file-symlink-file",
                tooltip: localize("teamstoolkit.guide.tooltip.github"),
                command: "fx-extension.openTutorial",
              },
            ],
          },
          {
            id: "addME",
            label: `${localize("teamstoolkit.guides.addME.label")}`,
            detail: localize("teamstoolkit.guides.addME.detail"),
            groupName: localize("teamstoolkit.guide.capability"),
            data: "https://aka.ms/teamsfx-add-message-extension",
            buttons: [
              {
                iconPath: "file-symlink-file",
                tooltip: localize("teamstoolkit.guide.tooltip.github"),
                command: "fx-extension.openTutorial",
              },
            ],
          },
          ...[
            {
              id: "addOutlookAddin",
              label: `${localize("teamstoolkit.guides.addOutlookAddin.label")}`,
              detail: localize("teamstoolkit.guides.addOutlookAddin.detail"),
              groupName: localize("teamstoolkit.guide.capability"),
              data: "https://aka.ms/teamsfx-add-outlook-add-in",
              buttons: [
                {
                  iconPath: "file-symlink-file",
                  tooltip: localize("teamstoolkit.guide.tooltip.github"),
                  command: "fx-extension.openTutorial",
                },
              ],
            },
          ],
          {
            id: "addSso",
            label: `${localize("teamstoolkit.guides.addSso.label")}`,
            detail: localize("teamstoolkit.guides.addSso.detail"),
            groupName: localize("teamstoolkit.guide.development"),
            data: "https://aka.ms/teamsfx-add-sso-new",
            buttons: [
              {
                iconPath: "file-symlink-file",
                tooltip: localize("teamstoolkit.guide.tooltip.github"),
                command: "fx-extension.openTutorial",
              },
            ],
          },
          {
            id: "connectApi",
            label: `${localize("teamstoolkit.guides.connectApi.label")}`,
            detail: localize("teamstoolkit.guides.connectApi.detail"),
            groupName: localize("teamstoolkit.guide.development"),
            data: "https://aka.ms/teamsfx-add-api-connection-new",
            buttons: [
              {
                iconPath: "file-symlink-file",
                tooltip: localize("teamstoolkit.guide.tooltip.github"),
                command: "fx-extension.openTutorial",
              },
            ],
          },
          {
            id: "cicdPipeline",
            label: `${localize("teamstoolkit.guides.cicdPipeline.label")}`,
            detail: localize("teamstoolkit.guides.cicdPipeline.detail"),
            groupName: localize("teamstoolkit.guide.development"),
            data: "https://aka.ms/teamsfx-add-cicd-new",
            buttons: [
              {
                iconPath: "file-symlink-file",
                tooltip: localize("teamstoolkit.guide.tooltip.github"),
                command: "fx-extension.openTutorial",
              },
            ],
          },
          {
            id: "mobilePreview",
            label: `${localize("teamstoolkit.guides.mobilePreview.label")}`,
            detail: localize("teamstoolkit.guides.mobilePreview.detail"),
            groupName: localize("teamstoolkit.guide.development"),
            data: "https://aka.ms/teamsfx-mobile",
            buttons: [
              {
                iconPath: "file-symlink-file",
                tooltip: localize("teamstoolkit.guide.tooltip.github"),
                command: "fx-extension.openTutorial",
              },
            ],
          },
          {
            id: "multiTenant",
            label: `${localize("teamstoolkit.guides.multiTenant.label")}`,
            detail: localize("teamstoolkit.guides.multiTenant.detail"),
            groupName: localize("teamstoolkit.guide.development"),
            data: "https://aka.ms/teamsfx-multi-tenant",
            buttons: [
              {
                iconPath: "file-symlink-file",
                tooltip: localize("teamstoolkit.guide.tooltip.github"),
                command: "fx-extension.openTutorial",
              },
            ],
          },
          {
            id: "addAzureFunction",
            label: localize("teamstoolkit.guides.addAzureFunction.label"),
            detail: localize("teamstoolkit.guides.addAzureFunction.detail"),
            groupName: localize("teamstoolkit.guide.cloudServiceIntegration"),
            data: "https://aka.ms/teamsfx-add-azure-function",
            buttons: [
              {
                iconPath: "file-symlink-file",
                tooltip: localize("teamstoolkit.guide.tooltip.github"),
                command: "fx-extension.openTutorial",
              },
            ],
          },
          {
            id: "addAzureSql",
            label: localize("teamstoolkit.guides.addAzureSql.label"),
            detail: localize("teamstoolkit.guides.addAzureSql.detail"),
            groupName: localize("teamstoolkit.guide.cloudServiceIntegration"),
            data: "https://aka.ms/teamsfx-add-azure-sql",
            buttons: [
              {
                iconPath: "file-symlink-file",
                tooltip: localize("teamstoolkit.guide.tooltip.github"),
                command: "fx-extension.openTutorial",
              },
            ],
          },
          {
            id: "addAzureAPIM",
            label: localize("teamstoolkit.guides.addAzureAPIM.label"),
            detail: localize("teamstoolkit.guides.addAzureAPIM.detail"),
            groupName: localize("teamstoolkit.guide.cloudServiceIntegration"),
            data: "https://aka.ms/teamsfx-add-azure-apim",
            buttons: [
              {
                iconPath: "file-symlink-file",
                tooltip: localize("teamstoolkit.guide.tooltip.github"),
                command: "fx-extension.openTutorial",
              },
            ],
          },
          {
            id: "addAzureKeyVault",
            label: localize("teamstoolkit.guides.addAzureKeyVault.label"),
            detail: localize("teamstoolkit.guides.addAzureKeyVault.detail"),
            groupName: localize("teamstoolkit.guide.cloudServiceIntegration"),
            data: "https://aka.ms/teamsfx-add-azure-keyvault",
            buttons: [
              {
                iconPath: "file-symlink-file",
                tooltip: localize("teamstoolkit.guide.tooltip.github"),
                command: "fx-extension.openTutorial",
              },
            ],
          },
        ],
    returnObject: true,
  };
  if (TreatmentVariableValue.inProductDoc && !isSPFxProject) {
    (config.options as StaticOptions).splice(0, 1, {
      id: "cardActionResponse",
      label: `${localize("teamstoolkit.guides.cardActionResponse.label")}`,
      description: localize("teamstoolkit.common.recommended"),
      detail: localize("teamstoolkit.guides.cardActionResponse.detail"),
      groupName: localize("teamstoolkit.guide.scenario"),
      data: "https://aka.ms/teamsfx-card-action-response",
      buttons: [
        {
          iconPath: "file-code",
          tooltip: localize("teamstoolkit.guide.tooltip.inProduct"),
          command: "fx-extension.openTutorial",
        },
      ],
    });
  }

  const selectedTutorial = await VS_CODE_UI.selectOption(config);
  if (selectedTutorial.isErr()) {
    return err(selectedTutorial.error);
  } else {
    const tutorial = selectedTutorial.value.result as OptionItem;
    return openTutorialHandler([TelemetryTriggerFrom.Auto, tutorial]);
  }
}

export function openTutorialHandler(args?: any[]): Promise<Result<unknown, FxError>> {
  if (!args || args.length !== 2) {
    // should never happen
    return Promise.resolve(ok(null));
  }
  const option = args[1] as OptionItem;
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.OpenTutorial, {
    ...getTriggerFromProperty(args),
    [TelemetryProperty.TutorialName]: option.id,
  });
  if (
    TreatmentVariableValue.inProductDoc &&
    (option.id === "cardActionResponse" || option.data === "cardActionResponse")
  ) {
    WebviewPanel.createOrShow(PanelType.RespondToCardActions);
    return Promise.resolve(ok(null));
  }
  // find help link from template metadata
  const templates = templatesMetadata.getDefaultTemplatesOnPlatform(Platform.VSCode);
  const template = templates.find((t) => t.name === option.data);
  if (template?.link) {
    return VS_CODE_UI.openUrl(template.link);
  }
  return VS_CODE_UI.openUrl(option.data as string);
}
