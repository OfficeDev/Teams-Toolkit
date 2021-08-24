// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

"use strict";

import {
  Result,
  FxError,
  err,
  ok,
  Inputs,
  Tools,
  Stage,
  Platform,
  QTreeNode,
  Question,
  isAutoSkipSelect,
  SingleSelectQuestion,
  MultiSelectQuestion,
} from "@microsoft/teamsfx-api";

import { FxCore, isMultiEnvEnabled } from "@microsoft/teamsfx-core";
import AzureAccountManager from "./commonlib/azureLogin";
import AppStudioTokenProvider from "./commonlib/appStudioLogin";
import GraphTokenProvider from "./commonlib/graphLogin";
import CLILogProvider from "./commonlib/log";
import CLIUIInstance from "./userInteraction";
import { flattenNodes, getSingleOptionString, toYargsOptions } from "./utils";
import { Options } from "yargs";
import {
  CollaboratorEmailNode,
  EnvNode,
  EnvNodeNoCreate,
  RootFolderNode,
  sqlPasswordConfirmQuestionName,
} from "./constants";
import { NoInitializedHelpGenerator } from "./error";

export class HelpParamGenerator {
  private core: FxCore;
  private questionsMap: Map<string, QTreeNode> = new Map<string, QTreeNode>();
  private initialized = false;

  private static showEnvStage: string[] = [
    Stage.build,
    Stage.publish,
    Stage.deploy,
    Stage.grantPermission,
    Stage.checkPermission,
    "validate",
  ];

  private static instance: HelpParamGenerator;

  private constructor() {
    const tools: Tools = {
      logProvider: CLILogProvider,
      tokenProvider: {
        azureAccountProvider: AzureAccountManager,
        graphTokenProvider: GraphTokenProvider,
        appStudioToken: AppStudioTokenProvider,
      },
      telemetryReporter: undefined,
      ui: CLIUIInstance,
    };
    this.core = new FxCore(tools);
  }

  public static getInstance(): HelpParamGenerator {
    if (!HelpParamGenerator.instance) {
      HelpParamGenerator.instance = new HelpParamGenerator();
    }
    return HelpParamGenerator.instance;
  }

  private getSystemInputs(projectPath?: string, platform?: Platform): Inputs {
    const systemInputs: Inputs = {
      platform: platform === undefined ? Platform.CLI_HELP : platform,
      projectPath: projectPath,
    };
    return systemInputs;
  }

  private setQuestionNodes(stage: string, questions: QTreeNode | undefined) {
    if (questions) {
      this.questionsMap.set(stage, questions);
    }
  }

  private async getQuestionsForUserTask(stage: string, systemInput: Inputs, core: FxCore) {
    const func = {
      namespace: "fx-solution-azure",
      method: stage,
    };
    const result = await core.getQuestionsForUserTask(func, systemInput);
    if (result.isErr()) {
      return err(result.error);
    } else {
      this.setQuestionNodes(stage, result.value);
    }
    return ok(undefined);
  }

  private getQuestionRootNodeForHelp(stage: string): QTreeNode | undefined {
    if (this.questionsMap.has(stage)) {
      return this.questionsMap.get(stage);
    }
    return undefined;
  }

  public async initializeQuestionsForHelp(): Promise<Result<boolean, FxError>> {
    if (this.initialized) {
      return ok(true);
    }
    const systemInput = this.getSystemInputs();
    for (const stage in Stage) {
      let result;
      if (stage === Stage.publish) {
        result = await this.core.getQuestions(
          stage as Stage,
          this.getSystemInputs("", Platform.VS)
        );
      } else {
        result = await this.core.getQuestions(stage as Stage, systemInput);
      }
      if (result.isErr()) {
        return err(result.error);
      } else {
        this.setQuestionNodes(stage, result.value);
      }
    }
    const userTasks = ["addCapability", "addResource"];
    for (const userTask of userTasks) {
      const result = await this.getQuestionsForUserTask(userTask, systemInput, this.core);
      if (result.isErr()) {
        return err(result.error);
      }
    }

    this.initialized = true;
    return ok(true);
  }

  public getYargsParamForHelp(stage: string): { [_: string]: Options } {
    if (!this.initialized) {
      throw NoInitializedHelpGenerator();
    }
    let resourceName: string | undefined;
    let capabilityName: string | undefined;
    if (stage.startsWith("addResource")) {
      resourceName = stage.split("-")[1];
      stage = "addResource";
    } else if (stage.startsWith("addCapability")) {
      capabilityName = stage.split("-")[1];
      stage = "addCapability";
    }
    const root = this.getQuestionRootNodeForHelp(stage);
    let nodes: QTreeNode[] = [];
    if (resourceName && root?.children) {
      const rootCopy: QTreeNode = JSON.parse(JSON.stringify(root));
      // Do CLI map for resource add
      const mustHaveNodes = rootCopy.children!.filter(
        (node) => (node.condition as any).minItems === 1
      );
      const resourcesNodes = rootCopy.children!.filter(
        (node) => (node.condition as any).contains === resourceName
      )[0];
      (rootCopy.data as any).default = [resourceName];
      (rootCopy.data as any).hide = true;
      rootCopy.children = undefined;
      nodes = [rootCopy]
        .concat(mustHaveNodes)
        .concat(resourcesNodes ? flattenNodes(resourcesNodes) : []);
    } else if (capabilityName && root?.children) {
      const rootCopy: QTreeNode = JSON.parse(JSON.stringify(root));
      // Do CLI map for capability add
      const capabilityNodes = rootCopy.children!.filter((node) =>
        ((node.condition as any).containsAny as string[]).includes(capabilityName as string)
      )[0];
      (rootCopy.data as any).default = [capabilityName];
      (rootCopy.data as any).hide = true;
      rootCopy.children = undefined;
      nodes = [rootCopy].concat(capabilityNodes ? flattenNodes(capabilityNodes) : []);
    } else if (root) {
      nodes = flattenNodes(root);
    }

    // hide VS param for publish.
    if (stage === Stage.publish) {
      for (const node of nodes) {
        (node.data as any).hide = true;
      }
    }

    // Add folder node
    if (stage !== Stage.create) {
      nodes = nodes.concat([RootFolderNode]);
    } else {
      // Set default folder value for create stage
      for (const node of nodes) {
        if (node.data.name === "folder") {
          (node.data as any).default = "./";
        }
        if (node.data.name === "scratch" || node.data.name === "samples") {
          (node.data as any).hide = true;
        }
      }
    }

    // Add env node
    if (isMultiEnvEnabled()) {
      if (stage === Stage.provision) {
        nodes = nodes.concat([EnvNode]);
      } else if (HelpParamGenerator.showEnvStage.indexOf(stage) >= 0) {
        nodes = nodes.concat([EnvNodeNoCreate]);
      }
    }

    // hide sql-confirm-password in provision stage.
    if (stage === Stage.provision) {
      for (const node of nodes) {
        if (node.data.name === sqlPasswordConfirmQuestionName) {
          (node.data as any).hide = true;
        }
      }
    }

    // Add user email node for grant permission
    if (stage === Stage.grantPermission) {
      nodes = nodes.concat([CollaboratorEmailNode]);
    }

    const nodesWithoutGroup = nodes.filter((node) => node.data.type !== "group");
    const params: { [_: string]: Options } = {};
    nodesWithoutGroup.forEach((node) => {
      const data = node.data as Question;
      if (isAutoSkipSelect(data) && data.type != "func") {
        // set the only option to default value so yargs will auto fill it.
        data.default = getSingleOptionString(data as SingleSelectQuestion | MultiSelectQuestion);
        (data as any).hide = true;
      }
      params[data.name] = toYargsOptions(data);
    });

    return params;
  }
}

export default HelpParamGenerator.getInstance();
