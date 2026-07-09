// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Root node for the "Create New Agent/App" wizard.
 * Defines the project type options shown on the first page.
 *
 * This data is serialized to rootNode.json at build time
 * and loaded at runtime by fx-core to build the question tree.
 */
export const rootNode = {
  data: {
    title: "template.createProjectQuestion.title",
    name: "project-type",
    type: "singleSelect",
    options: [
      {
        id: "copilot-agent-type",
        label: "template.createProjectQuestion.projectType.declarativeAgent.label",
        detail: "template.createProjectQuestion.projectType.declarativeAgent.detail",
        groupName: "template.createProjectQuestion.projectType.createGroup.aiAgent",
        icon: "$(teamsfx-agent)",
      },
      {
        id: "custom-engine-agent-type",
        label: "template.createProjectQuestion.projectType.customCopilot.label",
        detail: "template.createProjectQuestion.projectType.customCopilot.detail",
        groupName: "template.createProjectQuestion.projectType.createGroup.aiAgent",
        icon: "$(teamsfx-custom-copilot)",
      },
      {
        id: "blank-app-type",
        label: "template.createProjectQuestion.projectType.blankApp.label",
        detail: "template.createProjectQuestion.projectType.blankApp.detail",
        groupName: "template.createProjectQuestion.projectType.createGroup.m365Apps",
        icon: "$(file)",
      },
      {
        id: "graph-connector-type",
        label: "template.createProjectQuestion.createGraphConnector.label",
        detail: "template.createProjectQuestion.createGraphConnector.detail",
        groupName: "template.createProjectQuestion.projectType.createGroup.aiAgent",
        icon: "$(teamsfx-graph-connector)",
      },
      {
        id: "teams-agent-and-app-type",
        label: "template.createProjectQuestion.projectType.teamsAgentsAndApps.label",
        detail: "template.createProjectQuestion.projectType.teamsAgentsAndApps.detail",
        groupName: "template.createProjectQuestion.projectType.createGroup.m365Apps",
        icon: "$(microsoft365-agents-toolkit-teams)",
      },
      {
        id: "office-meta-os-type",
        label: "template.createProjectQuestion.projectType.officeAddin.label",
        detail: "template.createProjectQuestion.projectType.officeAddin.detail",
        groupName: "template.createProjectQuestion.projectType.createGroup.m365Apps",
        icon: "$(microsoft365-agents-office)",
      },
      {
        id: "start-with-github-copilot",
        label: "template.createProjectQuestion.projectType.copilotHelp.label",
        detail: "template.createProjectQuestion.projectType.copilotHelp.detail",
        groupName: "template.createProjectQuestion.projectType.copilotGroup.title",
        icon: "$(question)",
        featureFlag: "TEAMSFX_CHAT_PARTICIPANT_ENTRIES",
      },
    ],
  },
  children: [
    { node: "daNode", condition: { equals: "copilot-agent-type" } },
    { node: "ceaNode", condition: { equals: "custom-engine-agent-type" } },
    { node: "graphConnectorNode", condition: { equals: "graph-connector-type" } },
    { node: "teamsNode", condition: { equals: "teams-agent-and-app-type" } },
    { node: "officeAddinNode", condition: { equals: "office-meta-os-type" } },
    { node: "blankNode", condition: { equals: "blank-app-type" } },
  ],
};
