// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { OptionItem, Platform } from "@microsoft/teamsfx-api";
import { featureFlagManager, FeatureFlags } from "../../../common/featureFlags";
import { getLocalizedString } from "../../../common/localizeUtils";

export enum ProjectTypeGroup {
  AIAgent = "AI Agent",
  M365Apps = "Apps for Microsoft 365",
}

export class ProjectTypeOptions {
  static copilotAgentOptionId = "copilot-agent-type";
  static customEngineAgentOptionId = "custom-engine-agent-type";
  static teamsOptionId = "teams-agent-and-app-type";
  static outlookAddinOptionId = "outlook-addin-type";
  static officeMetaOSOptionId = "office-meta-os-type";
  static graphConnectorOptionId = "graph-connector-type";
  static blankAppOptionId = "blank-app-type";
  static startWithGithubCopilotOptionId = "start-with-github-copilot";

  static groupName(group: ProjectTypeGroup): string | undefined {
    switch (group) {
      case ProjectTypeGroup.AIAgent:
        return getLocalizedString("template.createProjectQuestion.projectType.createGroup.aiAgent");
      case ProjectTypeGroup.M365Apps:
        return getLocalizedString(
          "template.createProjectQuestion.projectType.createGroup.m365Apps"
        );
    }
  }

  static teamsAgentsAndApps(platform: Platform = Platform.VSCode): OptionItem {
    return {
      id: ProjectTypeOptions.teamsOptionId,
      label: `${
        platform === Platform.VSCode ? "$(microsoft365-agents-toolkit-teams) " : ""
      }${getLocalizedString(
        "template.createProjectQuestion.projectType.teamsAgentsAndApps.label"
      )}`,
      detail: getLocalizedString(
        "template.createProjectQuestion.projectType.teamsAgentsAndApps.detail"
      ),
      groupName: ProjectTypeOptions.groupName(ProjectTypeGroup.M365Apps),
    };
  }

  static officeMetaOS(platform: Platform = Platform.VSCode): OptionItem {
    return {
      id: ProjectTypeOptions.officeMetaOSOptionId,
      label: `${
        platform === Platform.VSCode ? "$(microsoft365-agents-office) " : ""
      }${getLocalizedString("template.createProjectQuestion.projectType.officeAddin.label")}`,
      detail: getLocalizedString("template.createProjectQuestion.projectType.officeAddin.detail"),
      groupName: ProjectTypeOptions.groupName(ProjectTypeGroup.M365Apps),
    };
  }

  static officeAddin(platform: Platform = Platform.VSCode): OptionItem {
    return this.officeMetaOS(platform);
  }

  static blankApp(platform: Platform = Platform.VSCode): OptionItem {
    return {
      id: ProjectTypeOptions.blankAppOptionId,
      label: `${
        platform === Platform.VSCode ? "$(file) " : ""
      }${getLocalizedString("template.createProjectQuestion.projectType.blankApp.label")}`,
      detail: getLocalizedString("template.createProjectQuestion.projectType.blankApp.detail"),
      groupName: ProjectTypeOptions.groupName(ProjectTypeGroup.M365Apps),
    };
  }

  static declarativeAgent(platform: Platform = Platform.VSCode): OptionItem {
    return {
      id: ProjectTypeOptions.copilotAgentOptionId,
      label: `${platform === Platform.VSCode ? "$(teamsfx-agent) " : ""}${getLocalizedString(
        "template.createProjectQuestion.projectType.declarativeAgent.label"
      )}`,
      detail: getLocalizedString(
        "template.createProjectQuestion.projectType.declarativeAgent.detail"
      ),
      groupName: ProjectTypeOptions.groupName(ProjectTypeGroup.AIAgent),
    };
  }

  static customEngineAgent(platform: Platform = Platform.VSCode): OptionItem {
    return {
      id: ProjectTypeOptions.customEngineAgentOptionId,
      label: `${
        platform === Platform.VSCode ? "$(teamsfx-custom-copilot) " : ""
      }${getLocalizedString("template.createProjectQuestion.projectType.customCopilot.label")}`,
      detail: getLocalizedString("template.createProjectQuestion.projectType.customCopilot.detail"),
      groupName: ProjectTypeOptions.groupName(ProjectTypeGroup.AIAgent),
    };
  }

  static graphConnector(platform: Platform = Platform.VSCode): OptionItem {
    return {
      id: ProjectTypeOptions.graphConnectorOptionId,
      label: `${
        platform === Platform.VSCode ? "$(teamsfx-graph-connector) " : ""
      }${getLocalizedString("template.createProjectQuestion.createGraphConnector.label")}`,
      detail: getLocalizedString("template.createProjectQuestion.createGraphConnector.detail"),
      groupName: ProjectTypeOptions.groupName(ProjectTypeGroup.AIAgent),
    };
  }

  static startWithGithubCopilot(): OptionItem {
    const description = featureFlagManager.getBooleanValue(FeatureFlags.HideGitHubCopilotPreviewTag)
      ? undefined
      : getLocalizedString("core.createProjectQuestion.option.description.preview");
    return {
      id: ProjectTypeOptions.startWithGithubCopilotOptionId,
      label: `$(question) ${getLocalizedString(
        "template.createProjectQuestion.projectType.copilotHelp.label"
      )}`,
      detail: getLocalizedString("template.createProjectQuestion.projectType.copilotHelp.detail"),
      groupName: getLocalizedString(
        "template.createProjectQuestion.projectType.copilotGroup.title"
      ),
      description,
    };
  }
}
