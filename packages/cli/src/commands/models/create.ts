// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  CLICommand,
  CLICommandOption,
  CLIContext,
  err,
  ok,
  Platform,
} from "@microsoft/teamsfx-api";
import {
  CliQuestionName,
  CreateProjectInputs,
  CreateProjectOptions,
  featureFlagManager,
  FeatureFlags,
  isTdpTemplate,
} from "@microsoft/teamsfx-core";
import chalk from "chalk";
import { assign } from "lodash";
import * as path from "path";
import * as uuid from "uuid";
import * as activate from "../../activate";
import { logger } from "../../commonlib/logger";
import { commands } from "../../resource";
import { TelemetryEvent, TelemetryProperty } from "../../telemetry/cliTelemetryEvents";
import { gateMCPDAAuthTypeChoices } from "../common";
import { createSampleCommand } from "./createSample";
import * as listTemplates from "./listTemplates";

const CREATE_INPUT_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["programming-language", "language"],
  ["api-auth", "apiAuth"],
  ["openapi-spec-location", "apiSpecLocation"],
  ["api-operation", "apiOperations"],
  ["addin-project-manifest", "officeAddinManifest"],
  ["mcp-da-server-url", "mcpServerUrl"],
  ["mcp-tools-file-path", "mcpToolsFilePath"],
  ["mcp-da-auth-type", "authType"],
  ["azure-openai-key", "azureOpenAIKey"],
  ["azure-openai-endpoint", "azureOpenAIEndpoint"],
  ["azure-openai-deployment-name", "azureOpenAIDeploymentName"],
];

const DECLARATIVE_AGENT_CAPABILITY = "declarative-agent";
const COPILOT_AGENT_PROJECT_TYPE = "copilot-agent-type";
const ADD_ACTION_DA_TEMPLATE = "add-action";
const NEW_API_ACTION_SOURCE = "new-api";

const DA_TEMPLATE_BY_WITH_PLUGIN: Readonly<Record<string, string>> = {
  no: "no-action",
  yes: ADD_ACTION_DA_TEMPLATE,
  gc: "graph-connector",
  skill: "skill",
  "type-spec": "typespec",
};

const ACTION_SOURCE_BY_ACTION_TYPE: Readonly<Record<string, string>> = {
  "new-api": NEW_API_ACTION_SOURCE,
  "api-spec": "openapi",
  mcp: "mcp",
};

const API_AUTH_BY_LEGACY_AUTH: Readonly<Record<string, string>> = {
  "bearer-token": "api-key",
};

const DA_TEMPLATE_ROUTE_BY_CAPABILITY: Readonly<
  Record<string, Readonly<Record<string, string | undefined>>>
> = {
  "copilot-gpt-basic": {
    projectType: COPILOT_AGENT_PROJECT_TYPE,
    daTemplate: "no-action",
  },
  "api-plugin-from-scratch": {
    projectType: COPILOT_AGENT_PROJECT_TYPE,
    daTemplate: ADD_ACTION_DA_TEMPLATE,
    actionSource: NEW_API_ACTION_SOURCE,
    apiAuth: "none",
  },
  "api-plugin-from-scratch-bearer": {
    projectType: COPILOT_AGENT_PROJECT_TYPE,
    daTemplate: ADD_ACTION_DA_TEMPLATE,
    actionSource: NEW_API_ACTION_SOURCE,
    apiAuth: "api-key",
  },
  "api-plugin-from-scratch-oauth": {
    projectType: COPILOT_AGENT_PROJECT_TYPE,
    daTemplate: ADD_ACTION_DA_TEMPLATE,
    actionSource: NEW_API_ACTION_SOURCE,
    apiAuth: "oauth",
  },
  "api-plugin-from-existing-api": {
    projectType: COPILOT_AGENT_PROJECT_TYPE,
    daTemplate: ADD_ACTION_DA_TEMPLATE,
    actionSource: "openapi",
  },
  "declarative-agent-with-action-from-mcp": {
    projectType: COPILOT_AGENT_PROJECT_TYPE,
    daTemplate: ADD_ACTION_DA_TEMPLATE,
    actionSource: "mcp",
  },
  "declarative-agent-with-graph-connector": {
    projectType: COPILOT_AGENT_PROJECT_TYPE,
    daTemplate: "graph-connector",
  },
  "declarative-agent-typespec": {
    projectType: COPILOT_AGENT_PROJECT_TYPE,
    daTemplate: "typespec",
  },
  "declarative-agent-with-skill": {
    projectType: COPILOT_AGENT_PROJECT_TYPE,
    daTemplate: "skill",
  },
};

const MIGRATION_CREATE_OPTIONS: CLICommandOption[] = [
  {
    name: "addin-project-folder",
    type: "string",
    description: "Existing Office Add-in project folder.",
  },
  {
    name: "addin-project-manifest",
    type: "string",
    description: "Existing Office Add-in manifest file.",
  },
];

function cloneOption(option: CLICommandOption): CLICommandOption {
  return { ...option };
}

function adjustOptions(options: CLICommandOption[]) {
  for (const option of options) {
    if (option.type === "string" && option.name === CliQuestionName.Capability) {
      // use dynamic options for capability question
      option.choices = listTemplates
        .listAllTemplates()
        .flatMap((o) => (o.alias ? [o.alias, o.name] : [o.name]));
      break;
    }
  }

  return options;
}

function legacyCreateOptions(): CLICommandOption[] {
  return gateMCPDAAuthTypeChoices(
    adjustOptions([
      ...CreateProjectOptions.map(cloneOption),
      ...MIGRATION_CREATE_OPTIONS.map(cloneOption),
    ])
  );
}

function createOptions(): CLICommandOption[] {
  return legacyCreateOptions();
}

function copyInputAlias(inputs: CreateProjectInputs, from: string, to: string): void {
  const value = inputs[from];
  if (value !== undefined && inputs[to] === undefined) {
    inputs[to] = value;
  }
}

function stringInput(inputs: CreateProjectInputs, key: string): string | undefined {
  const value = inputs[key];
  return typeof value === "string" ? value : undefined;
}

function copyNeutralInput(
  inputs: CreateProjectInputs,
  key: string,
  value: string | undefined
): void {
  if (value !== undefined && inputs[key] === undefined) {
    inputs[key] = value;
  }
}

function normalizeApiAuth(auth: string | undefined): string | undefined {
  if (auth === undefined) {
    return undefined;
  }
  return API_AUTH_BY_LEGACY_AUTH[auth] ?? auth;
}

function applyRouteAnswers(
  inputs: CreateProjectInputs,
  answers: Readonly<Record<string, string | undefined>>
): void {
  for (const [key, value] of Object.entries(answers)) {
    copyNeutralInput(inputs, key, value);
  }
}

function normalizeDeclarativeAgentRouteInputs(inputs: CreateProjectInputs): boolean {
  const withPlugin = stringInput(inputs, "with-plugin") ?? "no";
  const daTemplate = DA_TEMPLATE_BY_WITH_PLUGIN[withPlugin];
  if (daTemplate === undefined) {
    return false;
  }

  copyNeutralInput(inputs, "projectType", COPILOT_AGENT_PROJECT_TYPE);
  copyNeutralInput(inputs, "daTemplate", daTemplate);

  if (daTemplate !== ADD_ACTION_DA_TEMPLATE) {
    return true;
  }

  const actionType = stringInput(inputs, "api-plugin-type") ?? "new-api";
  const actionSource = ACTION_SOURCE_BY_ACTION_TYPE[actionType];
  if (actionSource === undefined) {
    return false;
  }

  copyNeutralInput(inputs, "actionSource", actionSource);
  if (actionSource === NEW_API_ACTION_SOURCE) {
    copyNeutralInput(inputs, "apiAuth", normalizeApiAuth(stringInput(inputs, "apiAuth")) ?? "none");
  }
  return true;
}

function normalizeLegacyCreateRouteInputs(inputs: CreateProjectInputs): boolean {
  const capability = stringInput(inputs, "capabilities");
  if (capability === undefined) {
    return stringInput(inputs, "projectType") !== undefined;
  }

  if (capability === DECLARATIVE_AGENT_CAPABILITY) {
    return normalizeDeclarativeAgentRouteInputs(inputs);
  }

  const routeAnswers = DA_TEMPLATE_ROUTE_BY_CAPABILITY[capability];
  if (routeAnswers === undefined) {
    return stringInput(inputs, "projectType") !== undefined;
  }
  const withPlugin = stringInput(inputs, "with-plugin");
  if (routeAnswers.daTemplate === "no-action" && withPlugin !== undefined && withPlugin !== "no") {
    return normalizeDeclarativeAgentRouteInputs(inputs);
  }

  applyRouteAnswers(inputs, routeAnswers);
  if (routeAnswers.actionSource === NEW_API_ACTION_SOURCE) {
    copyNeutralInput(
      inputs,
      "apiAuth",
      normalizeApiAuth(stringInput(inputs, "apiAuth")) ?? routeAnswers.apiAuth ?? "none"
    );
  }
  return true;
}

function normalizeCreateInputAliases(inputs: CreateProjectInputs): void {
  for (const [legacyKey, neutralKey] of CREATE_INPUT_ALIASES) {
    copyInputAlias(inputs, legacyKey, neutralKey);
  }
  const apiAuth = stringInput(inputs, "apiAuth");
  const normalizedApiAuth = normalizeApiAuth(apiAuth);
  if (normalizedApiAuth !== apiAuth && normalizedApiAuth !== undefined) {
    inputs.apiAuth = normalizedApiAuth;
  }
}

export function getCreateCommand(): CLICommand {
  return {
    name: "new",
    description: commands.create.description,
    options: createOptions(),
    examples: [
      {
        command: `${process.env.TEAMSFX_CLI_BIN_NAME} new -c declarative-agent -n myagent -i false`,
        description: "Create a new declarative agent",
      },
      {
        command: `${process.env.TEAMSFX_CLI_BIN_NAME} new -c basic-custom-engine-agent -l typescript -n mycea -i false`,
        description: "Create a new basic custom engine agent",
      },
    ],
    commands: [createSampleCommand],
    telemetry: {
      event: TelemetryEvent.CreateProject,
    },
    handler: async (ctx: CLIContext) => {
      const inputs = ctx.optionValues as CreateProjectInputs;
      normalizeCreateInputAliases(inputs);
      const v4Enabled = featureFlagManager.getBooleanValue(FeatureFlags.V4Enabled);
      const hasV4SelectorPrefill = normalizeLegacyCreateRouteInputs(inputs);
      inputs.projectId = inputs.projectId ?? uuid.v4();
      const core = activate.getFxCore();
      if (inputs.nonInteractive) {
        if (featureFlagManager.getBooleanValue(FeatureFlags.CLIDotNet)) {
          // this feature is used in e2e test to scaffold VS project in non-interactive mode
          inputs.platform = Platform.VS;
          inputs["template-name"] = inputs.capabilities;
          inputs["programming-language"] = "csharp";
        } else if (!v4Enabled || !hasV4SelectorPrefill) {
          // for non-interactive mode, we need to preset project-type from capability to make sure the question model works
          const capability = inputs.capabilities as string;
          inputs["template-name"] = capability;
          const templates = listTemplates.listAllTemplates();
          const matched = templates.find((t) => t.name === capability || t.alias === capability);
          if (matched) {
            inputs["template-name"] = matched.name;
            // For declarative agents with sub-type options (e.g., MCP), resolve the specific template name
            // since the question tree traversal is short-circuited when template-name is already set.
            if (inputs["with-plugin"] === "yes" && inputs["api-plugin-type"]) {
              const actionType = inputs["api-plugin-type"] as string;
              const subTemplateMatch = templates.find((t) => t.name === actionType);
              if (subTemplateMatch) {
                inputs["template-name"] = subTemplateMatch.name;
              } else {
                // Map known action types to their template names
                const actionTemplateMap: Record<string, string> = {
                  mcp: "declarative-agent-with-action-from-mcp",
                  "api-spec": "api-plugin-from-existing-api",
                  "new-api": "api-plugin-from-scratch",
                };
                if (actionTemplateMap[actionType]) {
                  inputs["template-name"] = actionTemplateMap[actionType];
                }
              }
            }
            if (inputs["programming-language"] === undefined) {
              // preset programming language if not specified
              inputs["programming-language"] = matched.language as any;
            }
          }
        }
      }
      const isTdp = isTdpTemplate(inputs);
      const res = isTdp
        ? await core.createProjectFromTdp(inputs)
        : await core.createProjectFrontDoor(inputs);
      assign(ctx.telemetryProperties, {
        [TelemetryProperty.NewProjectId]: inputs.projectId,
        [TelemetryProperty.IsCreatingM365]: inputs.isM365 + "",
      });
      if (res.isErr()) {
        return err(res.error);
      }
      logger.info(`Project created at: ${chalk.cyan(path.resolve(res.value.projectPath))}`);
      if (res.value.warnings) {
        for (const warning of res.value.warnings) {
          logger.warning(warning.content);
        }
      }
      return ok(undefined);
    },
  };
}
