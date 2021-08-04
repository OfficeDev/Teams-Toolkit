// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  FolderQuestion,
  Inputs,
  OptionItem,
  Platform,
  SingleSelectQuestion,
  TextInputQuestion,
} from "@microsoft/teamsfx-api";
import * as jsonschema from "jsonschema";
import * as path from "path";
import * as fs from "fs-extra";

export enum CoreQuestionNames {
  AppName = "app-name",
  Foler = "folder",
  Solution = "solution",
  CreateFromScratch = "scratch",
  Samples = "samples",
  Stage = "stage",
  SubStage = "substage",
  TargetEnvName = "targetEnvName",
  NewTargetEnvName = "newTargetEnvName",
}

export const ProjectNamePattern = "^[a-zA-Z][\\da-zA-Z]+$";
export const EnvNamePattern = "^[wd-_]+$";

export const QuestionAppName: TextInputQuestion = {
  type: "text",
  name: CoreQuestionNames.AppName,
  title: "Application name",
  validation: {
    validFunc: async (input: string, previousInputs?: Inputs): Promise<string | undefined> => {
      const folder = previousInputs![CoreQuestionNames.Foler] as string;
      if (!folder) return undefined;
      const schema = {
        pattern: ProjectNamePattern,
      };
      const appName = input as string;
      const validateResult = jsonschema.validate(appName, schema);
      if (validateResult.errors && validateResult.errors.length > 0) {
        return "Application name must start with a letter and can only contain letters and digits.";
      }
      const projectPath = path.resolve(folder, appName);
      const exists = await fs.pathExists(projectPath);
      if (exists) return `Path exists: ${projectPath}. Select a different application name.`;
      return undefined;
    },
  },
  placeholder: "Application name",
};

export const QuestionRootFolder: FolderQuestion = {
  type: "folder",
  name: CoreQuestionNames.Foler,
  title: "Workspace folder",
};

export const QuestionSelectSolution: SingleSelectQuestion = {
  type: "singleSelect",
  name: CoreQuestionNames.Solution,
  title: "Select a solution",
  staticOptions: [],
  skipSingleOption: true,
};

export const QuestionSelectTargetEnvironment: SingleSelectQuestion = {
  type: "singleSelect",
  name: CoreQuestionNames.TargetEnvName,
  title: "Select the target environment",
  staticOptions: [],
  skipSingleOption: true,
};

export const QuestionNewTargetEnvironmentName: TextInputQuestion = {
  type: "text",
  name: CoreQuestionNames.NewTargetEnvName,
  title: "New target environment name",
  validation: {
    validFunc: async (input: string): Promise<string | undefined> => {
      // const targetEnvName = input as string;
      // const validateResult = jsonschema.validate(targetEnvName, { pattern: EnvNamePattern });
      // if (validateResult.errors && validateResult.errors.length > 0) {
      //   return "Environment name can only contain letters, digits, _ and -.";
      // }

      return undefined;
    },
  },
  placeholder: "New target environment name",
};

export const ScratchOptionYesVSC: OptionItem = {
  id: "yes",
  label: "$(new-folder) Create a new Teams app",
  detail: "Use the Teams Toolkit to create a new application.",
};

export const ScratchOptionNoVSC: OptionItem = {
  id: "no",
  label: "$(heart) Start from a sample",
  detail: "Use an existing sample as a starting point for your new application.",
};

export const ScratchOptionYes: OptionItem = {
  id: "yes",
  label: "Create a new Teams app",
  detail: "Use the Teams Toolkit to create a new application.",
};

export const ScratchOptionNo: OptionItem = {
  id: "no",
  label: "Start from a sample",
  detail: "Use an existing sample as a starting point for your new application.",
};

export function getCreateNewOrFromSampleQuestion(platform: Platform): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: CoreQuestionNames.CreateFromScratch,
    title: "Teams Toolkit: Create a new Teams app",
    staticOptions:
      platform === Platform.VSCode
        ? [ScratchOptionYesVSC, ScratchOptionNoVSC]
        : [ScratchOptionYes, ScratchOptionNo],
    default: ScratchOptionYes.id,
    placeholder: "Select an option",
    skipSingleOption: true,
  };
}

export const SampleSelect: SingleSelectQuestion = {
  type: "singleSelect",
  name: CoreQuestionNames.Samples,
  title: "Start from a sample",
  staticOptions: [
    {
      id: "todo-list-with-Azure-backend",
      label: "Todo List with backend on Azure",
      detail: "Todo List app with Azure Function backend and Azure SQL database",
      data: "https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip",
    },
    {
      id: "todo-list-SPFx",
      label: "Todo List with SPFx",
      detail: "Todo List app hosting on SharePoint",
      data: "https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip",
    },
    {
      id: "share-now",
      label: "Share Now",
      detail: "Knowledge sharing app contains a Tab and a Message Extension",
      data: "https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip",
    },
    {
      id: "in-meeting-app",
      label: "In-meeting App",
      detail: "A template for apps using only in the context of a Teams meeting",
      data: "https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip",
    },
    {
      id: "faq-plus",
      label: "FAQ Plus",
      detail:
        "Conversational Bot which answers common questions, looping human when bots unable to help",
      data: "https://github.com/OfficeDev/TeamsFx-Samples/archive/refs/heads/main.zip",
    },
  ],
  placeholder: "Select a sample",
  returnObject: true,
};
