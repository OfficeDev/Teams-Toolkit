// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

"use strict";

import { QTreeNode } from "@microsoft/teamsfx-api";

export const cliSource = "TeamsfxCLI";
export const cliName = "teamsfx";
export const cliTelemetryPrefix = "teamsfx-cli";

export const RootFolderNode = new QTreeNode({
  type: "folder",
  name: "folder",
  title: "Select root folder of the project",
  default: "./",
});

export const EnvNode = new QTreeNode({
  type: "text",
  name: "env",
  title: "Select or create an environment for the project",
});

export const EnvNodeNoCreate = new QTreeNode({
  type: "text",
  name: "env",
  title: "Select an existing environment for the project",
});

export const SubscriptionNode = new QTreeNode({
  type: "text",
  name: "subscription",
  title: "Select a subscription",
});

export const CollaboratorEmailNode = new QTreeNode({
  type: "text",
  name: "email",
  title: "Input email address of collaborator",
});

export const templates: {
  tags: string[];
  title: string;
  description: string;
  sampleAppName: string;
  sampleAppUrl: string;
}[] = [
  {
    tags: ["React", "Azure function", "Azure SQL", "JS"],
    title: "Todo List with Azure backend",
    description: "Todo List app with Azure Function backend and Azure SQL database",
    sampleAppName: "todo-list-with-Azure-backend",
    sampleAppUrl: "https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip",
  },
  {
    tags: ["SharePoint", "SPFx", "TS"],
    title: "Todo List with SPFx ",
    description: "Todo List app hosting on SharePoint",
    sampleAppName: "todo-list-SPFx",
    sampleAppUrl: "https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip",
  },
  {
    tags: ["Tab", "Message Extension", "TS"],
    title: "Share Now",
    description: "Knowledge sharing app contains a Tab and a Message Extension",
    sampleAppName: "share-now",
    sampleAppUrl: "https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip",
  },
  {
    tags: ["Meeting extension", "JS"],
    title: "In-meeting App",
    description: "A template for apps using only in the context of a Teams meeting",
    sampleAppName: "in-meeting-app",
    sampleAppUrl: "https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip",
  },
  {
    tags: ["Easy QnA", "Bot", "JS"],
    title: "FAQ Plus",
    description:
      "Conversational Bot which answers common questions, looping human when bots unable to help",
    sampleAppName: "faq-plus",
    sampleAppUrl: "https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip",
  },
];

export enum CLILogLevel {
  error = 0,
  verbose,
  debug,
}

export const sqlPasswordQustionName = "sql-password";

export const sqlPasswordConfirmQuestionName = "sql-confirm-password";

export const deployPluginNodeName = "deploy-plugin";

export class FeatureFlags {
  static readonly RemoteCollaboration = "TEAMSFX_REMOTE_COL";
  static readonly MultiEnv = "TEAMSFX_MULTI_ENV";
  static readonly ArmSupport = "TEAMSFX_ARM_SUPPORT";
}
