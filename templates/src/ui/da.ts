// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Declarative Agent sub-tree for the wizard.
 * Serialized to daNode.json at build time.
 */
export const daNode = {
  data: {
    title: "template.createProjectQuestion.projectType.copilotExtension.title",
    placeholder: "template.createProjectQuestion.projectType.copilotExtension.placeholder",
    name: "capabilities",
    type: "singleSelect",
    skipSingleOption: true,
    options: [
      {
        id: "declarative-agent",
        label: "template.createProjectQuestion.projectType.declarativeAgent.label",
        detail: "template.createProjectQuestion.projectType.declarativeAgent.detail",
      },
    ],
  },
  children: [
    {
      condition: { equals: "declarative-agent" },
      data: {
        name: "with-plugin",
        title: "template.createProjectQuestion.declarativeCopilot.title",
        type: "singleSelect",
        placeholder: "template.createProjectQuestion.declarativeCopilot.placeholder",
        options: [
          {
            id: "no",
            label: "template.createProjectQuestion.noPlugin.label",
            detail: "template.createProjectQuestion.noPlugin.detail",
            data: "copilot-gpt-basic",
          },
          {
            id: "yes",
            label: "template.createProjectQuestion.addPlugin.label",
            detail: "template.createProjectQuestion.addPlugin.detail",
          },
          {
            id: "gc",
            label: "template.createProjectQuestion.addGC.label",
            detail: "template.createProjectQuestion.addGC.detail",
            data: "declarative-agent-with-graph-connector",
          },
          {
            id: "skill",
            label: "template.createProjectQuestion.addSkill.label",
            detail: "template.createProjectQuestion.addSkill.detail",
            data: "declarative-agent-with-skill",
            featureFlag: "TEAMSFX_AGENT_SKILLS",
          },
          {
            id: "type-spec",
            label: "template.createProjectQuestion.apiPlugin.typeSpec.label",
            detail: "template.createProjectQuestion.apiPlugin.typeSpec.detail",
            data: "declarative-agent-typespec",
          },
        ],
      },
      children: [
        {
          condition: { equals: "yes" },
          data: {
            name: "action-type",
            title: "template.createProjectQuestion.createApiPlugin.title",
            placeholder: "template.createProjectQuestion.addApiPlugin.placeholder",
            type: "singleSelect",
            options: [
              {
                id: "new-api",
                label: "template.createProjectQuestion.capability.copilotPluginNewApiOption.label",
                detail:
                  "template.createProjectQuestion.capability.copilotPluginNewApiOption.detail",
              },
              {
                id: "api-spec",
                label: "template.createProjectQuestion.capability.copilotPluginApiSpecOption.label",
                detail:
                  "template.createProjectQuestion.capability.copilotPluginApiSpecOption.detail",
                data: "api-plugin-from-existing-api",
              },
              {
                id: "mcp",
                label: "template.createProjectQuestion.mcpForDa.label",
                detail: "template.createProjectQuestion.mcpForDa.detail",
                data: "declarative-agent-with-action-from-mcp",
              },
            ],
          },
          children: [
            {
              condition: { equals: "new-api" },
              data: {
                name: "api-auth",
                title: "template.createProjectQuestion.apiMessageExtensionAuth.title",
                placeholder: "template.createProjectQuestion.apiMessageExtensionAuth.placeholder",
                type: "singleSelect",
                options: [
                  {
                    id: "none",
                    label: "template.createProjectQuestion.apiDeclarativeAgentAuth.none",
                    data: "api-plugin-from-scratch",
                  },
                  {
                    id: "api-key",
                    label: "template.createProjectQuestion.apiDeclarativeAgentAuth.apiKey",
                    data: "api-plugin-from-scratch-bearer",
                  },
                  {
                    id: "microsoft-entra",
                    label: "template.createProjectQuestion.apiDeclarativeAgentAuth.microsoftEntra",
                    data: "api-plugin-from-scratch-oauth",
                  },
                  {
                    id: "oauth",
                    label: "template.createProjectQuestion.apiDeclarativeAgentAuth.oauth",
                    data: "api-plugin-from-scratch-oauth",
                  },
                ],
              },
            },
            { node: "apiSpecWithSearchNode", condition: { equals: "api-spec" } },
            { node: "mcpServerTypeNode", condition: { equals: "mcp" } },
          ],
        },
      ],
    },
  ],
};
