// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { TemplateAlias, TemplateNames } from "../templateNames";
import { Template } from "./interface";

export const declarativeAgentTemplates: Template[] = [
  {
    id: "declarative-agent-basic",
    name: TemplateNames.DeclarativeAgentBasic,
    alias: TemplateAlias.DeclarativeAgentBasic,
    language: "common",
    displayName: "Declarative Agent",
    description: "Basic Declarative Agent without action",
  },
  {
    id: "declarative-agent-basic-csharp",
    name: TemplateNames.DeclarativeAgentBasic,
    alias: TemplateAlias.DeclarativeAgentBasic,
    language: "csharp",
    displayName: "Declarative Agent",
    description: "Basic Declarative Agent without action",
  },
  {
    id: "declarative-agent-with-skill",
    name: TemplateNames.DeclarativeAgentWithSkill,
    alias: TemplateAlias.DeclarativeAgentWithSkill,
    language: "common",
    displayName: "Declarative Agent with Skill",
    description: "Declarative Agent with a hello-atk agent skill",
  },
  {
    id: "declarative-agent-with-action-from-scratch-ts",
    name: TemplateNames.DeclarativeAgentWithActionFromScratch,
    alias: TemplateAlias.DeclarativeAgentWithActionFromScratch,
    language: "typescript",
    displayName: "Declarative Agent with Action from Scratch",
    description: "Declarative Agent with a new action built from scratch",
  },
  {
    id: "declarative-agent-with-action-from-scratch-js",
    name: TemplateNames.DeclarativeAgentWithActionFromScratch,
    alias: TemplateAlias.DeclarativeAgentWithActionFromScratch,
    language: "javascript",
    displayName: "Declarative Agent with Action from Scratch",
    description: "Declarative Agent with a new action built from scratch",
  },
  {
    id: "declarative-agent-with-action-from-scratch-csharp",
    name: TemplateNames.DeclarativeAgentWithActionFromScratch,
    alias: TemplateAlias.DeclarativeAgentWithActionFromScratch,
    language: "csharp",
    displayName: "Declarative Agent with Action from Scratch",
    description: "Declarative Agent with a new action built from scratch",
  },
  {
    id: "declarative-agent-with-action-from-scratch-bearer-ts",
    name: TemplateNames.DeclarativeAgentWithActionFromScratchBearer,
    alias: TemplateAlias.DeclarativeAgentWithActionFromScratchBearer,
    language: "typescript",
    displayName: "Declarative Agent with Action from Scratch (Bearer Token)",
    description:
      "Declarative Agent with a new action built from scratch using Bearer Token authentication",
  },
  {
    id: "declarative-agent-with-action-from-scratch-bearer-js",
    name: TemplateNames.DeclarativeAgentWithActionFromScratchBearer,
    alias: TemplateAlias.DeclarativeAgentWithActionFromScratchBearer,
    language: "javascript",
    displayName: "Declarative Agent with Action from Scratch (Bearer Token)",
    description:
      "Declarative Agent with a new action built from scratch using Bearer Token authentication",
  },
  {
    id: "declarative-agent-with-action-from-scratch-bearer-csharp",
    name: TemplateNames.DeclarativeAgentWithActionFromScratchBearer,
    alias: TemplateAlias.DeclarativeAgentWithActionFromScratchBearer,
    language: "csharp",
    displayName: "Declarative Agent with Action from Scratch (Bearer Token)",
    description:
      "Declarative Agent with a new action built from scratch using Bearer Token authentication",
  },
  {
    id: "declarative-agent-with-action-from-scratch-oauth-ts",
    name: TemplateNames.DeclarativeAgentWithActionFromScratchOAuth,
    alias: TemplateAlias.DeclarativeAgentWithActionFromScratchOAuth,
    language: "typescript",
    displayName: "Declarative Agent with Action from Scratch (OAuth)",
    description:
      "Declarative Agent with a new action built from scratch using OAuth authentication",
  },
  {
    id: "declarative-agent-with-action-from-scratch-oauth-js",
    name: TemplateNames.DeclarativeAgentWithActionFromScratchOAuth,
    alias: TemplateAlias.DeclarativeAgentWithActionFromScratchOAuth,
    language: "javascript",
    displayName: "Declarative Agent with Action from Scratch (OAuth)",
    description:
      "Declarative Agent with a new action built from scratch using OAuth authentication",
  },
  {
    id: "declarative-agent-with-action-from-scratch-oauth-csharp",
    name: TemplateNames.DeclarativeAgentWithActionFromScratchOAuth,
    alias: TemplateAlias.DeclarativeAgentWithActionFromScratchOAuth,
    language: "csharp",
    displayName: "Declarative Agent with Action from Scratch (OAuth)",
    description:
      "Declarative Agent with a new action built from scratch using OAuth authentication",
  },
  // {
  //   id: "declarative-agent-basic",
  //   name: TemplateNames.DeclarativeAgentWithExistingAction,
  //   language: "common",
  //   displayName: "Declarative Agent With Existing Action",
  //   description: "Declarative Agent With Existing Action",
  // },
  // {
  //   id: "declarative-agent-basic-csharp",
  //   name: TemplateNames.DeclarativeAgentWithExistingAction,
  //   language: "csharp",
  //   displayName: "Declarative Agent With Existing Action",
  //   description: "Declarative Agent With Existing Action",
  // },
  {
    id: "declarative-agent-with-action-from-existing-api",
    name: TemplateNames.DeclarativeAgentWithActionFromExistingApiSpec,
    alias: TemplateAlias.DeclarativeAgentWithActionFromExistingApiSpec,
    language: "none",
    displayName: "Declarative Agent with Action from Existing API",
    description: "Declarative Agent with action from an existing API specification",
  },
  {
    id: "declarative-agent-with-action-from-existing-api-csharp",
    name: TemplateNames.DeclarativeAgentWithActionFromExistingApiSpec,
    alias: TemplateAlias.DeclarativeAgentWithActionFromExistingApiSpec,
    language: "csharp",
    displayName: "Declarative Agent with Action from Existing API",
    description: "Declarative Agent with action from an existing API specification",
  },
  {
    id: "declarative-agent-with-action-from-mcp",
    name: TemplateNames.DeclarativeAgentWithActionFromMCP,
    language: "common",
    displayName: "Declarative Agent with Action from MCP Server",
    description: "Declarative Agent with action from Model Context Protocol (MCP)",
  },
  {
    id: "declarative-agent-with-graph-connector-ts",
    name: TemplateNames.DeclarativeAgentWithGraphConnector,
    language: "typescript",
    displayName: "Declarative Agent with Copilot Connector",
    description: "Declarative Agent with Microsoft Copilot Connector integration",
  },
  {
    id: "declarative-agent-typespec",
    name: TemplateNames.DeclarativeAgentWithTypeSpec,
    language: "common",
    displayName: "Declarative Agent from TypeSpec",
    description: "Declarative Agent with or without an action using TypeSpec",
  },
];
