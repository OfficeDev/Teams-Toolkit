// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { PluginManifestSchema } from "@microsoft/app-manifest";
import { expect } from "chai";
import fs from "fs-extra";
import "mocha";
import os from "os";
import sinon from "sinon";
import { ConstantString } from "../src/constants";
import {
  AuthInfo,
  ErrorType,
  OperationAuthInfoMap,
  ParseOptions,
  ProjectType,
  WarningType,
} from "../src/interfaces";
import { ManifestUpdater } from "../src/manifestUpdater";
import { SpecParserError } from "../src/specParserError";
import { Utils } from "../src/utils";
describe("updateManifestWithAiPlugin", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("responseSemantics", () => {
    it("should not generate response semantics when response is empty", async () => {
      const spec: any = {
        openapi: "3.0.2",
        info: {
          title: "My API",
          description: "My API description",
        },
        servers: [
          {
            url: "/v3",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPets",
              summary: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              parameters: [
                {
                  name: "limit",
                  description: "Maximum number of pets to return",
                  required: true,
                  schema: {
                    type: "integer",
                  },
                },
              ],
            },
          },
        },
      };
      const manifestPath = "/path/to/your/manifest.json";
      const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
      const pluginFilePath = "/path/to/your/ai-plugin.json";

      const originalManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "Original Short Description", full: "Original Full Description" },
      };
      const expectedManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "My API", full: "My API description" },
        copilotAgents: {
          plugins: [
            {
              file: "ai-plugin.json",
              id: "plugin_1",
            },
          ],
        },
      };

      const expectedPlugins: PluginManifestSchema = {
        $schema: ConstantString.PluginManifestSchema,
        schema_version: "v2.2",
        name_for_human: "Original Name",
        namespace: "originalname",
        description_for_human: "My API description",
        functions: [
          {
            name: "getPets",
            description: "Returns all pets from the system that the user has access to",
          },
        ],
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "None",
            },
            spec: {
              url: "spec/outputSpec.yaml",
            },
            run_for_functions: ["getPets"],
          },
        ],
      };
      sinon.stub(fs, "readJSON").resolves(originalManifest);
      sinon
        .stub(fs, "pathExists")
        .withArgs(manifestPath)
        .resolves(true)
        .withArgs(pluginFilePath)
        .resolves(false);

      const options: ParseOptions = {
        allowMethods: ["get", "post"],
        allowResponseSemantics: true,
      };
      const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
        manifestPath,
        outputSpecPath,
        pluginFilePath,
        spec,
        options,
        {}
      );

      expect(manifest).to.deep.equal(expectedManifest);
      expect(apiPlugin).to.deep.equal(expectedPlugins);
      expect(warnings).to.deep.equal([]);
    });

    it("should generate response semantics based on the response - 1", async () => {
      const spec: any = {
        openapi: "3.0.2",
        info: {
          title: "My API",
          description: "My API description",
        },
        servers: [
          {
            url: "/v3",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPets",
              summary: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              parameters: [
                {
                  name: "limit",
                  description: "Maximum number of pets to return",
                  required: true,
                  schema: {
                    type: "integer",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                          description: {
                            type: "string",
                          },
                          imageUrl: {
                            type: "string",
                          },
                          id: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const manifestPath = "/path/to/your/manifest.json";
      const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
      const pluginFilePath = "/path/to/your/ai-plugin.json";

      const originalManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "Original Short Description", full: "Original Full Description" },
      };
      const expectedManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "My API", full: "My API description" },
        copilotAgents: {
          plugins: [
            {
              file: "ai-plugin.json",
              id: "plugin_1",
            },
          ],
        },
      };

      const expectedPlugins: PluginManifestSchema = {
        $schema: ConstantString.PluginManifestSchema,
        schema_version: "v2.2",
        name_for_human: "Original Name",
        namespace: "originalname",
        description_for_human: "My API description",
        functions: [
          {
            name: "getPets",
            description: "Returns all pets from the system that the user has access to",
            capabilities: {
              response_semantics: {
                data_path: "$",
                properties: {
                  subtitle: "$.description",
                  title: "$.name",
                  url: "$.imageUrl",
                },
                static_template: {
                  $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
                  body: [
                    {
                      text: "name: ${if(name, name, 'N/A')}",
                      type: "TextBlock",
                      wrap: true,
                    },
                    {
                      text: "description: ${if(description, description, 'N/A')}",
                      type: "TextBlock",
                      wrap: true,
                    },
                    {
                      $when: "${imageUrl != null && imageUrl != ''}",
                      type: "Image",
                      url: "${imageUrl}",
                    },
                    {
                      text: "id: ${if(id, id, 'N/A')}",
                      type: "TextBlock",
                      wrap: true,
                    },
                  ],
                  type: "AdaptiveCard",
                  version: "1.5",
                },
              },
            },
          },
        ],
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "None",
            },
            spec: {
              url: "spec/outputSpec.yaml",
            },
            run_for_functions: ["getPets"],
          },
        ],
      };
      sinon.stub(fs, "readJSON").resolves(originalManifest);
      sinon
        .stub(fs, "pathExists")
        .withArgs(manifestPath)
        .resolves(true)
        .withArgs(pluginFilePath)
        .resolves(false);

      const options: ParseOptions = {
        allowMethods: ["get", "post"],
        allowResponseSemantics: true,
      };
      const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
        manifestPath,
        outputSpecPath,
        pluginFilePath,
        spec,
        options,
        {}
      );

      expect(manifest).to.deep.equal(expectedManifest);
      expect(apiPlugin).to.deep.equal(expectedPlugins);
      expect(warnings).to.deep.equal([]);
    });

    it("should generate response semantics based on the response - 2", async () => {
      const spec: any = {
        openapi: "3.0.2",
        info: {
          title: "My API",
          description: "My API description",
        },
        servers: [
          {
            url: "/v3",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPets",
              summary: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              parameters: [
                {
                  name: "limit",
                  description: "Maximum number of pets to return",
                  required: true,
                  schema: {
                    type: "integer",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                          description: {
                            type: "string",
                          },
                          imageUrl: {
                            type: "string",
                          },
                          id: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const manifestPath = "/path/to/your/manifest.json";
      const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
      const pluginFilePath = "/path/to/your/ai-plugin.json";

      const originalManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "Original Short Description", full: "Original Full Description" },
      };
      const expectedManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "My API", full: "My API description" },
        copilotAgents: {
          plugins: [
            {
              file: "ai-plugin.json",
              id: "plugin_1",
            },
          ],
        },
      };

      const expectedPlugins: PluginManifestSchema = {
        $schema: ConstantString.PluginManifestSchema,
        schema_version: "v2.2",
        name_for_human: "Original Name",
        namespace: "originalname",
        description_for_human: "My API description",
        functions: [
          {
            name: "getPets",
            description: "Returns all pets from the system that the user has access to",
            capabilities: {
              response_semantics: {
                data_path: "$",
                properties: {
                  subtitle: "$.description",
                  title: "$.name",
                  url: "$.imageUrl",
                },
                static_template: {
                  $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
                  body: [
                    {
                      text: "name: ${if(name, name, 'N/A')}",
                      type: "TextBlock",
                      wrap: true,
                    },
                    {
                      text: "description: ${if(description, description, 'N/A')}",
                      type: "TextBlock",
                      wrap: true,
                    },
                    {
                      $when: "${imageUrl != null && imageUrl != ''}",
                      type: "Image",
                      url: "${imageUrl}",
                    },
                    {
                      text: "id: ${if(id, id, 'N/A')}",
                      type: "TextBlock",
                      wrap: true,
                    },
                  ],
                  type: "AdaptiveCard",
                  version: "1.5",
                },
              },
            },
          },
        ],
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "None",
            },
            spec: {
              url: "spec/outputSpec.yaml",
            },
            run_for_functions: ["getPets"],
          },
        ],
      };
      sinon.stub(fs, "readJSON").resolves(originalManifest);
      sinon
        .stub(fs, "pathExists")
        .withArgs(manifestPath)
        .resolves(true)
        .withArgs(pluginFilePath)
        .resolves(false);

      const options: ParseOptions = {
        allowMethods: ["get", "post"],
        allowResponseSemantics: true,
      };
      const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
        manifestPath,
        outputSpecPath,
        pluginFilePath,
        spec,
        options,
        {}
      );

      expect(manifest).to.deep.equal(expectedManifest);
      expect(apiPlugin).to.deep.equal(expectedPlugins);
      expect(warnings).to.deep.equal([]);
    });

    it("should generate response semantics based on the response - 3", async () => {
      const spec: any = {
        openapi: "3.0.2",
        info: {
          title: "My API",
          description: "My API description",
        },
        servers: [
          {
            url: "/v3",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPets",
              summary: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              parameters: [
                {
                  name: "limit",
                  description: "Maximum number of pets to return",
                  required: true,
                  schema: {
                    type: "integer",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          result: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                name: {
                                  type: "string",
                                },
                                description: {
                                  type: "string",
                                },
                                imageUrl: {
                                  type: "string",
                                },
                                id: {
                                  type: "string",
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const manifestPath = "/path/to/your/manifest.json";
      const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
      const pluginFilePath = "/path/to/your/ai-plugin.json";

      const originalManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "Original Short Description", full: "Original Full Description" },
      };
      const expectedManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "My API", full: "My API description" },
        copilotAgents: {
          plugins: [
            {
              file: "ai-plugin.json",
              id: "plugin_1",
            },
          ],
        },
      };

      const expectedPlugins: PluginManifestSchema = {
        $schema: ConstantString.PluginManifestSchema,
        schema_version: "v2.2",
        name_for_human: "Original Name",
        namespace: "originalname",
        description_for_human: "My API description",
        functions: [
          {
            name: "getPets",
            description: "Returns all pets from the system that the user has access to",
            capabilities: {
              response_semantics: {
                data_path: "$.result",
                properties: {
                  subtitle: "$.description",
                  title: "$.name",
                  url: "$.imageUrl",
                },
                static_template: {
                  $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
                  body: [
                    {
                      type: "Container",
                      $data: "${$root}",
                      items: [
                        {
                          text: "name: ${if(name, name, 'N/A')}",
                          type: "TextBlock",
                          wrap: true,
                        },
                        {
                          text: "description: ${if(description, description, 'N/A')}",
                          type: "TextBlock",
                          wrap: true,
                        },
                        {
                          $when: "${imageUrl != null && imageUrl != ''}",
                          type: "Image",
                          url: "${imageUrl}",
                        },
                        {
                          text: "id: ${if(id, id, 'N/A')}",
                          type: "TextBlock",
                          wrap: true,
                        },
                      ],
                    },
                  ],
                  type: "AdaptiveCard",
                  version: "1.5",
                },
              },
            },
          },
        ],
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "None",
            },
            spec: {
              url: "spec/outputSpec.yaml",
            },
            run_for_functions: ["getPets"],
          },
        ],
      };
      sinon.stub(fs, "readJSON").resolves(originalManifest);
      sinon
        .stub(fs, "pathExists")
        .withArgs(manifestPath)
        .resolves(true)
        .withArgs(pluginFilePath)
        .resolves(false);

      const options: ParseOptions = {
        allowMethods: ["get", "post"],
        allowResponseSemantics: true,
      };
      const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
        manifestPath,
        outputSpecPath,
        pluginFilePath,
        spec,
        options,
        {}
      );

      expect(manifest).to.deep.equal(expectedManifest);
      expect(apiPlugin).to.deep.equal(expectedPlugins);
      expect(warnings).to.deep.equal([]);
    });

    it("should not generate response semantics and return warnings if api response schema contains anyof", async () => {
      const spec: any = {
        openapi: "3.0.2",
        info: {
          title: "My API",
          description: "My API description",
        },
        servers: [
          {
            url: "/v3",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPets",
              summary: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              parameters: [
                {
                  name: "limit",
                  description: "Maximum number of pets to return",
                  required: true,
                  schema: {
                    type: "integer",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        anyOf: [
                          {
                            type: "string",
                          },
                          {
                            type: "integer",
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const manifestPath = "/path/to/your/manifest.json";
      const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
      const pluginFilePath = "/path/to/your/ai-plugin.json";

      const originalManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "Original Short Description", full: "Original Full Description" },
      };
      const expectedManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "My API", full: "My API description" },
        copilotAgents: {
          plugins: [
            {
              file: "ai-plugin.json",
              id: "plugin_1",
            },
          ],
        },
      };

      const expectedPlugins: PluginManifestSchema = {
        $schema: ConstantString.PluginManifestSchema,
        schema_version: "v2.2",
        name_for_human: "Original Name",
        namespace: "originalname",
        description_for_human: "My API description",
        functions: [
          {
            name: "getPets",
            description: "Returns all pets from the system that the user has access to",
          },
        ],
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "None",
            },
            spec: {
              url: "spec/outputSpec.yaml",
            },
            run_for_functions: ["getPets"],
          },
        ],
      };
      sinon.stub(fs, "readJSON").resolves(originalManifest);
      sinon
        .stub(fs, "pathExists")
        .withArgs(manifestPath)
        .resolves(true)
        .withArgs(pluginFilePath)
        .resolves(false);

      const options: ParseOptions = {
        allowMethods: ["get", "post"],
        allowResponseSemantics: true,
      };
      const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
        manifestPath,
        outputSpecPath,
        pluginFilePath,
        spec,
        options,
        {}
      );

      expect(manifest).to.deep.equal(expectedManifest);
      expect(apiPlugin).to.deep.equal(expectedPlugins);
      expect(warnings).to.deep.equal([
        {
          type: WarningType.GenerateCardFailed,
          content:
            'Error: Error: \'oneOf\', \'allOf\', \'anyOf\', and \'not\' schema are not supported: {"anyOf":[{"type":"string"},{"type":"integer"}]}.',
          data: "getPets",
        },
      ]);
    });

    it("should keep at most 5 properties in response semantics", async () => {
      const spec: any = {
        openapi: "3.0.2",
        info: {
          title: "My API",
          description: "My API description",
        },
        servers: [
          {
            url: "/v3",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPets",
              summary: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              parameters: [
                {
                  name: "limit",
                  description: "Maximum number of pets to return",
                  required: true,
                  schema: {
                    type: "integer",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                          description: {
                            type: "string",
                          },
                          imageUrl: {
                            type: "string",
                          },
                          id: {
                            type: "string",
                          },
                          age: {
                            type: "string",
                          },
                          status: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const manifestPath = "/path/to/your/manifest.json";
      const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
      const pluginFilePath = "/path/to/your/ai-plugin.json";

      const originalManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "Original Short Description", full: "Original Full Description" },
      };
      const expectedManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "My API", full: "My API description" },
        copilotAgents: {
          plugins: [
            {
              file: "ai-plugin.json",
              id: "plugin_1",
            },
          ],
        },
      };

      const expectedPlugins: PluginManifestSchema = {
        $schema: ConstantString.PluginManifestSchema,
        schema_version: "v2.2",
        name_for_human: "Original Name",
        namespace: "originalname",
        description_for_human: "My API description",
        functions: [
          {
            name: "getPets",
            description: "Returns all pets from the system that the user has access to",
            capabilities: {
              response_semantics: {
                data_path: "$",
                properties: {
                  subtitle: "$.description",
                  title: "$.name",
                  url: "$.imageUrl",
                },
                static_template: {
                  $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
                  body: [
                    {
                      text: "name: ${if(name, name, 'N/A')}",
                      type: "TextBlock",
                      wrap: true,
                    },
                    {
                      text: "description: ${if(description, description, 'N/A')}",
                      type: "TextBlock",
                      wrap: true,
                    },
                    {
                      $when: "${imageUrl != null && imageUrl != ''}",
                      type: "Image",
                      url: "${imageUrl}",
                    },
                    {
                      text: "id: ${if(id, id, 'N/A')}",
                      type: "TextBlock",
                      wrap: true,
                    },
                    {
                      text: "age: ${if(age, age, 'N/A')}",
                      type: "TextBlock",
                      wrap: true,
                    },
                  ],
                  type: "AdaptiveCard",
                  version: "1.5",
                },
              },
            },
          },
        ],
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "None",
            },
            spec: {
              url: "spec/outputSpec.yaml",
            },
            run_for_functions: ["getPets"],
          },
        ],
      };
      sinon.stub(fs, "readJSON").resolves(originalManifest);
      sinon
        .stub(fs, "pathExists")
        .withArgs(manifestPath)
        .resolves(true)
        .withArgs(pluginFilePath)
        .resolves(false);

      const options: ParseOptions = {
        allowMethods: ["get", "post"],
        allowResponseSemantics: true,
      };
      const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
        manifestPath,
        outputSpecPath,
        pluginFilePath,
        spec,
        options,
        {}
      );

      expect(manifest).to.deep.equal(expectedManifest);
      expect(apiPlugin).to.deep.equal(expectedPlugins);
      expect(warnings).to.deep.equal([]);
    });

    it("should keep at most 5 properties in response semantics for complex nested properties", async () => {
      const spec: any = {
        openapi: "3.0.2",
        info: {
          title: "My API",
          description: "My API description",
        },
        servers: [
          {
            url: "/v3",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPets",
              summary: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              parameters: [
                {
                  name: "limit",
                  description: "Maximum number of pets to return",
                  required: true,
                  schema: {
                    type: "integer",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                          description: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                title: {
                                  type: "array",
                                  items: {
                                    type: "string",
                                  },
                                },
                                url: {
                                  type: "string",
                                },
                              },
                            },
                          },
                          imageUrl: {
                            type: "string",
                          },
                          id: {
                            type: "string",
                          },
                          age: {
                            type: "string",
                          },
                          status: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const manifestPath = "/path/to/your/manifest.json";
      const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
      const pluginFilePath = "/path/to/your/ai-plugin.json";

      const originalManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "Original Short Description", full: "Original Full Description" },
      };
      const expectedManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "My API", full: "My API description" },
        copilotAgents: {
          plugins: [
            {
              file: "ai-plugin.json",
              id: "plugin_1",
            },
          ],
        },
      };

      const expectedPlugins: PluginManifestSchema = {
        $schema: ConstantString.PluginManifestSchema,
        schema_version: "v2.2",
        name_for_human: "Original Name",
        namespace: "originalname",
        description_for_human: "My API description",
        functions: [
          {
            name: "getPets",
            description: "Returns all pets from the system that the user has access to",
            capabilities: {
              response_semantics: {
                data_path: "$",
                properties: {
                  subtitle: "$.id",
                  title: "$.name",
                  url: "$.imageUrl",
                },
                static_template: {
                  $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
                  body: [
                    {
                      text: "name: ${if(name, name, 'N/A')}",
                      type: "TextBlock",
                      wrap: true,
                    },
                    {
                      $data: "${description}",
                      items: [
                        {
                          $data: "${title}",
                          items: [
                            {
                              text: "title: ${$data}",
                              type: "TextBlock",
                              wrap: true,
                            },
                          ],
                          type: "Container",
                        },
                        {
                          text: "description.url: ${if(url, url, 'N/A')}",
                          type: "TextBlock",
                          wrap: true,
                        },
                      ],
                      type: "Container",
                    },
                    {
                      $when: "${imageUrl != null && imageUrl != ''}",
                      type: "Image",
                      url: "${imageUrl}",
                    },
                    {
                      text: "id: ${if(id, id, 'N/A')}",
                      type: "TextBlock",
                      wrap: true,
                    },
                  ],
                  type: "AdaptiveCard",
                  version: "1.5",
                },
              },
            },
          },
        ],
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "None",
            },
            spec: {
              url: "spec/outputSpec.yaml",
            },
            run_for_functions: ["getPets"],
          },
        ],
      };
      sinon.stub(fs, "readJSON").resolves(originalManifest);
      sinon
        .stub(fs, "pathExists")
        .withArgs(manifestPath)
        .resolves(true)
        .withArgs(pluginFilePath)
        .resolves(false);

      const options: ParseOptions = {
        allowMethods: ["get", "post"],
        allowResponseSemantics: true,
      };
      const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
        manifestPath,
        outputSpecPath,
        pluginFilePath,
        spec,
        options,
        {}
      );

      expect(manifest).to.deep.equal(expectedManifest);
      expect(apiPlugin).to.deep.equal(expectedPlugins);
      expect(warnings).to.deep.equal([]);
    });

    it("should not contain empty container in adaptive card", async () => {
      const spec: any = {
        openapi: "3.0.2",
        info: {
          title: "My API",
          description: "My API description",
        },
        servers: [
          {
            url: "/v3",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPets",
              summary: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              parameters: [
                {
                  name: "limit",
                  description: "Maximum number of pets to return",
                  required: true,
                  schema: {
                    type: "integer",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json; charset=utf-8": {
                      schema: {
                        type: "object",
                        properties: {
                          photos: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                id: {
                                  type: "number",
                                },
                                sol: {
                                  type: "number",
                                },
                                camera: {
                                  type: "object",
                                  properties: {
                                    id: {
                                      type: "number",
                                    },
                                    name: {
                                      type: "string",
                                    },
                                    rover_id: {
                                      type: "number",
                                    },
                                    full_name: {
                                      type: "string",
                                    },
                                  },
                                },
                                img_src: {
                                  type: "string",
                                },
                                earth_date: {
                                  type: "string",
                                },
                                rover: {
                                  type: "object",
                                  properties: {
                                    id: {
                                      type: "number",
                                    },
                                    name: {
                                      type: "string",
                                    },
                                    landing_date: {
                                      type: "string",
                                    },
                                    launch_date: {
                                      type: "string",
                                    },
                                    status: {
                                      type: "string",
                                    },
                                    max_sol: {
                                      type: "number",
                                    },
                                    max_date: {
                                      type: "string",
                                    },
                                    total_photos: {
                                      type: "number",
                                    },
                                    cameras: {
                                      type: "array",
                                      items: {
                                        type: "object",
                                        properties: {
                                          name: {
                                            type: "string",
                                          },
                                          full_name: {
                                            type: "string",
                                          },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const manifestPath = "/path/to/your/manifest.json";
      const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
      const pluginFilePath = "/path/to/your/ai-plugin.json";

      const originalManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "Original Short Description", full: "Original Full Description" },
      };
      const expectedManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "My API", full: "My API description" },
        copilotAgents: {
          plugins: [
            {
              file: "ai-plugin.json",
              id: "plugin_1",
            },
          ],
        },
      };

      const expectedPlugins: PluginManifestSchema = {
        $schema: ConstantString.PluginManifestSchema,
        schema_version: "v2.2",
        name_for_human: "Original Name",
        namespace: "originalname",
        description_for_human: "My API description",
        functions: [
          {
            name: "getPets",
            description: "Returns all pets from the system that the user has access to",
            capabilities: {
              response_semantics: {
                data_path: "$",
                properties: {
                  title: "$.camera.name",
                  subtitle: "$.id",
                },
                static_template: {
                  $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
                  body: [
                    {
                      type: "Container",
                      $data: "${photos}",
                      items: [
                        {
                          type: "TextBlock",
                          text: "photos.id: ${if(id, id, 'N/A')}",
                          wrap: true,
                        },
                        {
                          type: "TextBlock",
                          text: "photos.sol: ${if(sol, sol, 'N/A')}",
                          wrap: true,
                        },
                        {
                          type: "TextBlock",
                          text: "photos.camera.id: ${if(camera.id, camera.id, 'N/A')}",
                          wrap: true,
                        },
                        {
                          type: "TextBlock",
                          text: "photos.camera.name: ${if(camera.name, camera.name, 'N/A')}",
                          wrap: true,
                        },
                        {
                          type: "TextBlock",
                          text: "photos.camera.rover_id: ${if(camera.rover_id, camera.rover_id, 'N/A')}",
                          wrap: true,
                        },
                      ],
                    },
                  ],
                  type: "AdaptiveCard",
                  version: "1.5",
                },
              },
            },
          },
        ],
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "None",
            },
            spec: {
              url: "spec/outputSpec.yaml",
            },
            run_for_functions: ["getPets"],
          },
        ],
      };
      sinon.stub(fs, "readJSON").resolves(originalManifest);
      sinon
        .stub(fs, "pathExists")
        .withArgs(manifestPath)
        .resolves(true)
        .withArgs(pluginFilePath)
        .resolves(false);

      const options: ParseOptions = {
        allowMethods: ["get", "post"],
        allowResponseSemantics: true,
      };
      const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
        manifestPath,
        outputSpecPath,
        pluginFilePath,
        spec,
        options,
        {}
      );

      expect(manifest).to.deep.equal(expectedManifest);
      expect(apiPlugin).to.deep.equal(expectedPlugins);
      expect(warnings).to.deep.equal([]);
    });
  });

  describe("auth", () => {
    it("should generate oauth property for apiPlugin files", async () => {
      const spec: any = {
        openapi: "3.0.2",
        info: {
          title: "My API",
          description: "My API description",
        },
        servers: [
          {
            url: "/v3",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPets",
              summary: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              parameters: [
                {
                  name: "limit",
                  description: "Maximum number of pets to return",
                  required: true,
                  schema: {
                    type: "integer",
                  },
                },
              ],
            },
            post: {
              operationId: "createPet",
              summary: "Create a pet",
              description: "Create a new pet in the store",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["name"],
                      properties: {
                        name: {
                          type: "string",
                          description: "Name of the pet",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const manifestPath = "/path/to/your/manifest.json";
      const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
      const pluginFilePath = "/path/to/your/ai-plugin.json";

      const originalManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "Original Short Description", full: "Original Full Description" },
      };
      const expectedManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "My API", full: "My API description" },
        copilotAgents: {
          plugins: [
            {
              file: "ai-plugin.json",
              id: "plugin_1",
            },
          ],
        },
      };

      const expectedPlugins: PluginManifestSchema = {
        $schema: ConstantString.PluginManifestSchema,
        schema_version: "v2.2",
        name_for_human: "Original Name",
        namespace: "originalname",
        description_for_human: "My API description",
        functions: [
          {
            name: "getPets",
            description: "Returns all pets from the system that the user has access to",
          },
          {
            name: "createPet",
            description: "Create a new pet in the store",
          },
        ],
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "OAuthPluginVault",
              reference_id: "${{OAUTH_REGISTRATION_ID}}",
            },
            spec: {
              url: "spec/outputSpec.yaml",
            },
            run_for_functions: ["getPets", "createPet"],
          },
        ],
      };
      sinon.stub(fs, "readJSON").resolves(originalManifest);
      sinon
        .stub(fs, "pathExists")
        .withArgs(manifestPath)
        .resolves(true)
        .withArgs(pluginFilePath)
        .resolves(false);

      const options: ParseOptions = {
        allowMethods: ["get", "post"],
        allowOauth2: true,
      };

      const authInfo: AuthInfo = {
        name: "oauth",
        authScheme: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: "https://example.com/oauth/authorize",
              tokenUrl: "https://example.com/oauth/token",
              scopes: {
                read: "Grants read access",
                write: "Grants write access",
                admin: "Grants access to admin operations",
              },
            },
          },
        },
      };
      const authMap: OperationAuthInfoMap = {
        ["getPets"]: authInfo,
        ["createPet"]: authInfo,
      };

      const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
        manifestPath,
        outputSpecPath,
        pluginFilePath,
        spec,
        options,
        authMap
      );

      expect(manifest).to.deep.equal(expectedManifest);
      expect(apiPlugin).to.deep.equal(expectedPlugins);
      expect(warnings).to.deep.equal([]);
    });

    it("should not generate auth property for apiPlugin files for unsupported auth type", async () => {
      const spec: any = {
        openapi: "3.0.2",
        info: {
          title: "My API",
          description: "My API description",
        },
        servers: [
          {
            url: "/v3",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPets",
              summary: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              parameters: [
                {
                  name: "limit",
                  description: "Maximum number of pets to return",
                  required: true,
                  schema: {
                    type: "integer",
                  },
                },
              ],
            },
            post: {
              operationId: "createPet",
              summary: "Create a pet",
              description: "Create a new pet in the store",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["name"],
                      properties: {
                        name: {
                          type: "string",
                          description: "Name of the pet",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const manifestPath = "/path/to/your/manifest.json";
      const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
      const pluginFilePath = "/path/to/your/ai-plugin.json";

      const originalManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "Original Short Description", full: "Original Full Description" },
      };
      const expectedManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "My API", full: "My API description" },
        copilotAgents: {
          plugins: [
            {
              file: "ai-plugin.json",
              id: "plugin_1",
            },
          ],
        },
      };

      const expectedPlugins: PluginManifestSchema = {
        $schema: ConstantString.PluginManifestSchema,
        schema_version: "v2.2",
        name_for_human: "Original Name",
        namespace: "originalname",
        description_for_human: "My API description",
        functions: [
          {
            name: "getPets",
            description: "Returns all pets from the system that the user has access to",
          },
          {
            name: "createPet",
            description: "Create a new pet in the store",
          },
        ],
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "None",
            },
            spec: {
              url: "spec/outputSpec.yaml",
            },
            run_for_functions: ["getPets", "createPet"],
          },
        ],
      };
      sinon.stub(fs, "readJSON").resolves(originalManifest);
      sinon
        .stub(fs, "pathExists")
        .withArgs(manifestPath)
        .resolves(true)
        .withArgs(pluginFilePath)
        .resolves(false);

      const options: ParseOptions = {
        allowMethods: ["get", "post"],
        allowOauth2: true,
      };

      const authInfo: AuthInfo = {
        name: "apiKeyAuth",
        authScheme: {
          type: "apiKey",
          in: "cookie",
          name: "Authorization",
        },
      };

      const authMap: OperationAuthInfoMap = {
        ["getPets"]: authInfo,
        ["createPet"]: authInfo,
      };

      const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
        manifestPath,
        outputSpecPath,
        pluginFilePath,
        spec,
        options,
        authMap
      );

      expect(manifest).to.deep.equal(expectedManifest);
      expect(apiPlugin).to.deep.equal(expectedPlugins);
      expect(warnings).to.deep.equal([]);
    });

    it("should generate api key auth property for apiPlugin files", async () => {
      const spec: any = {
        openapi: "3.0.2",
        info: {
          title: "My API",
          description: "My API description",
        },
        servers: [
          {
            url: "/v3",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPets",
              summary: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              parameters: [
                {
                  name: "limit",
                  description: "Maximum number of pets to return",
                  required: true,
                  schema: {
                    type: "integer",
                  },
                },
              ],
            },
            post: {
              operationId: "createPet",
              summary: "Create a pet",
              description: "Create a new pet in the store",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["name"],
                      properties: {
                        name: {
                          type: "string",
                          description: "Name of the pet",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const manifestPath = "/path/to/your/manifest.json";
      const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
      const pluginFilePath = "/path/to/your/ai-plugin.json";

      const originalManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "Original Short Description", full: "Original Full Description" },
      };
      const expectedManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "My API", full: "My API description" },
        copilotAgents: {
          plugins: [
            {
              file: "ai-plugin.json",
              id: "plugin_1",
            },
          ],
        },
      };

      const expectedPlugins: PluginManifestSchema = {
        $schema: ConstantString.PluginManifestSchema,
        schema_version: "v2.2",
        name_for_human: "Original Name",
        namespace: "originalname",
        description_for_human: "My API description",
        functions: [
          {
            name: "getPets",
            description: "Returns all pets from the system that the user has access to",
          },
          {
            name: "createPet",
            description: "Create a new pet in the store",
          },
        ],
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "ApiKeyPluginVault",
              reference_id: "${{APIKEY_REGISTRATION_ID}}",
            },
            spec: {
              url: "spec/outputSpec.yaml",
            },
            run_for_functions: ["getPets", "createPet"],
          },
        ],
      };
      sinon.stub(fs, "readJSON").resolves(originalManifest);
      sinon
        .stub(fs, "pathExists")
        .withArgs(manifestPath)
        .resolves(true)
        .withArgs(pluginFilePath)
        .resolves(false);

      const options: ParseOptions = {
        allowMethods: ["get", "post"],
        allowOauth2: true,
      };

      const authInfo: AuthInfo = {
        name: "apikey",
        authScheme: {
          type: "http",
          scheme: "bearer",
        },
      };

      const authMap: OperationAuthInfoMap = {
        ["getPets"]: authInfo,
        ["createPet"]: authInfo,
      };

      const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
        manifestPath,
        outputSpecPath,
        pluginFilePath,
        spec,
        options,
        authMap
      );

      expect(manifest).to.deep.equal(expectedManifest);
      expect(apiPlugin).to.deep.equal(expectedPlugins);
      expect(warnings).to.deep.equal([]);
    });
  });

  it("should update apiPlugin file with complex schema successfully", async () => {
    const spec: any = {
      openapi: "3.0.2",
      info: {
        title: "My API",
        description: "My API description",
      },
      servers: [
        {
          url: "/v3",
        },
      ],
      paths: {
        "/pets": {
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            description: "Create a new pet in the store",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the pet",
                      },
                      age: {
                        type: "string",
                        description: "Date time of the pet",
                        format: "date-time",
                      },
                      status: {
                        type: "string",
                        description: "Status of the pet",
                        enum: ["available", "pending", "sold"],
                      },
                      arrayProp: {
                        type: "array",
                        items: {
                          type: "string",
                          description: "Prop of the pet",
                          format: "date-time",
                          default: "2021-01-01T00:00:00Z",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const pluginFilePath = "/path/to/your/ai-plugin.json";

    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "My API", full: "My API description" },
      copilotAgents: {
        plugins: [
          {
            file: "ai-plugin.json",
            id: "plugin_1",
          },
        ],
      },
    };

    const expectedPlugins: PluginManifestSchema = {
      $schema: ConstantString.PluginManifestSchema,
      schema_version: "v2.2",
      name_for_human: "Original Name",
      namespace: "originalname",
      description_for_human: "My API description",
      functions: [
        {
          name: "createPet",
          description: "Create a new pet in the store",
        },
      ],
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec/outputSpec.yaml",
          },
          run_for_functions: ["createPet"],
        },
      ],
    };
    sinon.stub(fs, "readJSON").resolves(originalManifest);
    sinon
      .stub(fs, "pathExists")
      .withArgs(manifestPath)
      .resolves(true)
      .withArgs(pluginFilePath)
      .resolves(false);

    const options: ParseOptions = {
      allowMethods: ["get", "post"],
    };
    const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
      manifestPath,
      outputSpecPath,
      pluginFilePath,
      spec,
      options,
      {}
    );

    expect(manifest).to.deep.equal(expectedManifest);
    expect(apiPlugin).to.deep.equal(expectedPlugins);
    expect(warnings).to.deep.equal([]);
  });

  describe("confirmation", () => {
    it("should generate confirmation property for apiPlugin files", async () => {
      const spec: any = {
        openapi: "3.0.2",
        info: {
          title: "My API",
          description: "My API description",
        },
        servers: [
          {
            url: "/v3",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPets",
              summary: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              parameters: [
                {
                  name: "limit",
                  description: "Maximum number of pets to return",
                  required: true,
                  schema: {
                    type: "integer",
                  },
                },
              ],
            },
            post: {
              operationId: "createPet",
              summary: "Create a pet",
              description: "Create a new pet in the store",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["name"],
                      properties: {
                        name: {
                          type: "string",
                          description: "Name of the pet",
                        },
                        id: {
                          type: "string",
                          description: "Id of the pet",
                        },
                      },
                    },
                  },
                },
              },
            },
            delete: {
              operationId: "deletePet",
              description: "Delete a pet in the store",
            },
          },
        },
      };
      const manifestPath = "/path/to/your/manifest.json";
      const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
      const pluginFilePath = "/path/to/your/ai-plugin.json";

      const originalManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "Original Short Description", full: "Original Full Description" },
      };
      const expectedManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "My API", full: "My API description" },
        copilotAgents: {
          plugins: [
            {
              file: "ai-plugin.json",
              id: "plugin_1",
            },
          ],
        },
      };

      const expectedPlugins: PluginManifestSchema = {
        $schema: ConstantString.PluginManifestSchema,
        schema_version: "v2.2",
        name_for_human: "Original Name",
        namespace: "originalname",
        description_for_human: "My API description",
        functions: [
          {
            name: "getPets",
            description: "Returns all pets from the system that the user has access to",
          },
          {
            name: "createPet",
            description: "Create a new pet in the store",
            capabilities: {
              confirmation: {
                type: "AdaptiveCard",
                title: "Create a pet",
                body: "* **Name**: {{function.parameters.name}}\n* **Id**: {{function.parameters.id}}",
              },
            },
          },
          {
            name: "deletePet",
            description: "Delete a pet in the store",
          },
        ],
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "None",
            },
            spec: {
              url: "spec/outputSpec.yaml",
            },
            run_for_functions: ["getPets", "createPet", "deletePet"],
          },
        ],
      };
      sinon.stub(fs, "readJSON").resolves(originalManifest);
      sinon
        .stub(fs, "pathExists")
        .withArgs(manifestPath)
        .resolves(true)
        .withArgs(pluginFilePath)
        .resolves(false);

      const options: ParseOptions = {
        allowMethods: ["get", "post", "delete"],
        allowConfirmation: true,
      };
      const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
        manifestPath,
        outputSpecPath,
        pluginFilePath,
        spec,
        options,
        {}
      );

      expect(manifest).to.deep.equal(expectedManifest);
      expect(apiPlugin).to.deep.equal(expectedPlugins);
      expect(warnings).to.deep.equal([]);
    });

    it("should generate confirmation property with response semantics", async () => {
      const spec: any = {
        openapi: "3.0.2",
        info: {
          title: "My API",
          description: "My API description",
        },
        servers: [
          {
            url: "/v3",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPets",
              summary: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              parameters: [
                {
                  name: "limit",
                  description: "Maximum number of pets to return",
                  required: true,
                  schema: {
                    type: "integer",
                  },
                },
              ],
            },
            delete: {
              operationId: "deletePet",
              description: "Delete pets",
              parameters: [
                {
                  name: "name",
                  description: "Name of the pet",
                  required: true,
                  schema: {
                    type: "string",
                  },
                },
              ],
            },
            post: {
              operationId: "createPet",
              summary: "Create a pet",
              description: "Create a new pet in the store",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["name"],
                      properties: {
                        name: {
                          type: "string",
                          description: "Name of the pet",
                        },
                      },
                    },
                  },
                },
              },
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const manifestPath = "/path/to/your/manifest.json";
      const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
      const pluginFilePath = "/path/to/your/ai-plugin.json";

      const originalManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "Original Short Description", full: "Original Full Description" },
      };
      const expectedManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "My API", full: "My API description" },
        copilotAgents: {
          plugins: [
            {
              file: "ai-plugin.json",
              id: "plugin_1",
            },
          ],
        },
      };

      const expectedPlugins: PluginManifestSchema = {
        $schema: ConstantString.PluginManifestSchema,
        schema_version: "v2.2",
        name_for_human: "Original Name",
        namespace: "originalname",
        description_for_human: "My API description",
        functions: [
          {
            name: "getPets",
            description: "Returns all pets from the system that the user has access to",
          },
          {
            name: "deletePet",
            description: "Delete pets",
            capabilities: {
              confirmation: {
                type: "AdaptiveCard",
                title: "Delete pets",
                body: "* **Name**: {{function.parameters.name}}",
              },
            },
          },
          {
            name: "createPet",
            description: "Create a new pet in the store",
            capabilities: {
              confirmation: {
                type: "AdaptiveCard",
                title: "Create a pet",
                body: "* **Name**: {{function.parameters.name}}",
              },
              response_semantics: {
                data_path: "$",
                properties: {
                  title: "$.name",
                },
                static_template: {
                  $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
                  body: [
                    {
                      text: "name: ${if(name, name, 'N/A')}",
                      type: "TextBlock",
                      wrap: true,
                    },
                  ],
                  type: "AdaptiveCard",
                  version: "1.5",
                },
              },
            },
          },
        ],
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "None",
            },
            spec: {
              url: "spec/outputSpec.yaml",
            },
            run_for_functions: ["getPets", "deletePet", "createPet"],
          },
        ],
      };

      sinon.stub(fs, "readJSON").resolves(originalManifest);
      sinon
        .stub(fs, "pathExists")
        .withArgs(manifestPath)
        .resolves(true)
        .withArgs(pluginFilePath)
        .resolves(false);

      const options: ParseOptions = {
        allowMethods: ["get", "post", "delete"],
        allowConfirmation: true,
        allowResponseSemantics: true,
      };
      const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
        manifestPath,
        outputSpecPath,
        pluginFilePath,
        spec,
        options,
        {}
      );

      expect(manifest).to.deep.equal(expectedManifest);
      expect(apiPlugin).to.deep.equal(expectedPlugins);
      expect(warnings).to.deep.equal([]);
    });
  });

  it("should update the manifest with the correct manifest and apiPlugin files", async () => {
    const spec: any = {
      openapi: "3.0.2",
      info: {
        title: "My API",
        description: "My API description",
      },
      servers: [
        {
          url: "/v3",
        },
      ],
      paths: {
        "/pets": {
          get: {
            operationId: "getPets",
            summary: "Get all pets",
            description: "Returns all pets from the system that the user has access to",
            parameters: [
              {
                name: "limit",
                description: "Maximum number of pets to return",
                required: true,
                schema: {
                  type: "integer",
                },
              },
            ],
          },
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            description: "Create a new pet in the store",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const pluginFilePath = "/path/to/your/ai-plugin.json";

    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "My API", full: "My API description" },
      copilotAgents: {
        plugins: [
          {
            file: "ai-plugin.json",
            id: "plugin_1",
          },
        ],
      },
    };

    const expectedPlugins: PluginManifestSchema = {
      $schema: ConstantString.PluginManifestSchema,
      schema_version: "v2.2",
      name_for_human: "Original Name",
      namespace: "originalname",
      description_for_human: "My API description",
      functions: [
        {
          name: "getPets",
          description: "Returns all pets from the system that the user has access to",
        },
        {
          name: "createPet",
          description: "Create a new pet in the store",
        },
      ],
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec/outputSpec.yaml",
          },
          run_for_functions: ["getPets", "createPet"],
        },
      ],
    };
    sinon.stub(fs, "readJSON").resolves(originalManifest);
    sinon
      .stub(fs, "pathExists")
      .withArgs(manifestPath)
      .resolves(true)
      .withArgs(pluginFilePath)
      .resolves(false);

    const options: ParseOptions = {
      allowMethods: ["get", "post"],
    };
    const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
      manifestPath,
      outputSpecPath,
      pluginFilePath,
      spec,
      options,
      {}
    );

    expect(manifest).to.deep.equal(expectedManifest);
    expect(apiPlugin).to.deep.equal(expectedPlugins);
    expect(warnings).to.deep.equal([]);
  });

  it("should use safe function name if operation id contains special characters", async () => {
    const spec: any = {
      openapi: "3.0.2",
      info: {
        title: "My API",
        description: "My API description",
      },
      servers: [
        {
          url: "/v3",
        },
      ],
      paths: {
        "/pets": {
          get: {
            operationId: "get/Pets",
            summary: "Get all pets",
            description: "Returns all pets from the system that the user has access to",
            parameters: [
              {
                name: "limit",
                description: "Maximum number of pets to return",
                required: true,
                schema: {
                  type: "integer",
                },
              },
            ],
          },
          post: {
            operationId: "create/Pet:new",
            summary: "Create a pet",
            description: "Create a new pet in the store",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const pluginFilePath = "/path/to/your/ai-plugin.json";

    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "My API", full: "My API description" },
      copilotAgents: {
        plugins: [
          {
            file: "ai-plugin.json",
            id: "plugin_1",
          },
        ],
      },
    };

    const expectedPlugins: PluginManifestSchema = {
      $schema: ConstantString.PluginManifestSchema,
      schema_version: "v2.2",
      name_for_human: "Original Name",
      namespace: "originalname",
      description_for_human: "My API description",
      functions: [
        {
          name: "get_Pets",
          description: "Returns all pets from the system that the user has access to",
        },
        {
          name: "create_Pet_new",
          description: "Create a new pet in the store",
        },
      ],
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec/outputSpec.yaml",
          },
          run_for_functions: ["get_Pets", "create_Pet_new"],
        },
      ],
    };
    sinon.stub(fs, "readJSON").resolves(originalManifest);
    sinon
      .stub(fs, "pathExists")
      .withArgs(manifestPath)
      .resolves(true)
      .withArgs(pluginFilePath)
      .resolves(false);

    const options: ParseOptions = {
      allowMethods: ["get", "post"],
    };
    const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
      manifestPath,
      outputSpecPath,
      pluginFilePath,
      spec,
      options,
      {}
    );

    expect(manifest).to.deep.equal(expectedManifest);
    expect(apiPlugin).to.deep.equal(expectedPlugins);
    expect(warnings).to.deep.equal([]);
  });

  describe("conversationStarter", () => {
    it("should not add conversation starter property if there is no description for each API", async () => {
      const spec: any = {
        openapi: "3.0.2",
        info: {
          title: "My API",
        },
        servers: [
          {
            url: "/v3",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPets",
              parameters: [
                {
                  name: "limit",
                  description: "Maximum number of pets to return",
                  required: true,
                  schema: {
                    type: "integer",
                  },
                },
              ],
            },
            post: {
              operationId: "createPet",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["name"],
                      properties: {
                        name: {
                          type: "string",
                          description: "Name of the pet",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const manifestPath = "/path/to/your/manifest.json";
      const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
      const pluginFilePath = "/path/to/your/ai-plugin.json";

      const originalManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "Original Short Description", full: "Original Full Description" },
      };
      const expectedManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "My API", full: "Original Full Description" },
        copilotAgents: {
          plugins: [
            {
              file: "ai-plugin.json",
              id: "plugin_1",
            },
          ],
        },
      };

      const expectedPlugins: PluginManifestSchema = {
        $schema: ConstantString.PluginManifestSchema,
        schema_version: "v2.2",
        name_for_human: "Original Name",
        namespace: "originalname",
        description_for_human: "<Please add description of the plugin>",
        functions: [
          {
            name: "getPets",
            description: "",
          },
          {
            description: "",
            name: "createPet",
          },
        ],
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "None",
            },
            spec: {
              url: "spec/outputSpec.yaml",
            },
            run_for_functions: ["getPets", "createPet"],
          },
        ],
      };
      sinon.stub(fs, "readJSON").resolves(originalManifest);
      sinon
        .stub(fs, "pathExists")
        .withArgs(manifestPath)
        .resolves(true)
        .withArgs(pluginFilePath)
        .resolves(false);

      const options: ParseOptions = {
        allowConversationStarters: true,
        allowMethods: ["get", "post"],
      };
      const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
        manifestPath,
        outputSpecPath,
        pluginFilePath,
        spec,
        options,
        {}
      );

      expect(manifest).to.deep.equal(expectedManifest);
      expect(apiPlugin).to.deep.equal(expectedPlugins);
      expect(warnings).to.deep.equal([]);
    });

    it("should update conversation starter property correctly", async () => {
      const spec: any = {
        openapi: "3.0.2",
        info: {
          title: "My API",
        },
        servers: [
          {
            url: "/v3",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPets",
              parameters: [
                {
                  name: "limit",
                  description: "Maximum number of pets to return",
                  required: true,
                  schema: {
                    type: "integer",
                  },
                },
              ],
            },
            post: {
              operationId: "createPet",
              description: "Create a pet using pet name",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["name"],
                      properties: {
                        name: {
                          type: "string",
                          description: "Name of the pet",
                        },
                      },
                    },
                  },
                },
              },
            },
            delete: {
              operationId: "deletePet",
              description: "Delete a pet using pet name",
              summary: "Delete a pet",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["name"],
                      properties: {
                        name: {
                          type: "string",
                          description: "Name of the pet",
                        },
                      },
                    },
                  },
                },
              },
            },
            patch: {
              operationId: "patchPet",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["name"],
                      properties: {
                        name: {
                          type: "string",
                          description: "Name of the pet",
                        },
                      },
                    },
                  },
                },
              },
            },
            put: {
              operationId: "putPet",
              description: "This is a long long long long long description that max length is 68",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["name"],
                      properties: {
                        name: {
                          type: "string",
                          description: "Name of the pet",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const manifestPath = "/path/to/your/manifest.json";
      const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
      const pluginFilePath = "/path/to/your/ai-plugin.json";

      const originalManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "Original Short Description", full: "Original Full Description" },
      };
      const expectedManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "My API", full: "Original Full Description" },
        copilotAgents: {
          plugins: [
            {
              file: "ai-plugin.json",
              id: "plugin_1",
            },
          ],
        },
      };

      const expectedPlugins: PluginManifestSchema = {
        $schema: ConstantString.PluginManifestSchema,
        schema_version: "v2.2",
        name_for_human: "Original Name",
        namespace: "originalname",
        description_for_human: "<Please add description of the plugin>",
        capabilities: {
          conversation_starters: [
            {
              text: "Create a pet using pet name",
            },
            {
              text: "Delete a pet",
            },
            {
              text: "This is a long long long long long description tha",
            },
          ],
        },
        functions: [
          {
            name: "getPets",
            description: "",
          },
          {
            description: "Create a pet using pet name",
            name: "createPet",
          },
          {
            description: "Delete a pet using pet name",
            name: "deletePet",
          },
          {
            description: "",
            name: "patchPet",
          },
          {
            description: "This is a long long long long long description that max length is 68",
            name: "putPet",
          },
        ],
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "None",
            },
            spec: {
              url: "spec/outputSpec.yaml",
            },
            run_for_functions: ["getPets", "createPet", "deletePet", "patchPet", "putPet"],
          },
        ],
      };
      sinon.stub(fs, "readJSON").resolves(originalManifest);
      sinon
        .stub(fs, "pathExists")
        .withArgs(manifestPath)
        .resolves(true)
        .withArgs(pluginFilePath)
        .resolves(false);

      const options: ParseOptions = {
        allowConversationStarters: true,
        allowMethods: ["get", "post", "delete", "patch", "put"],
      };
      const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
        manifestPath,
        outputSpecPath,
        pluginFilePath,
        spec,
        options,
        {}
      );

      expect(manifest).to.deep.equal(expectedManifest);
      expect(apiPlugin).to.deep.equal(expectedPlugins);
      expect(warnings).to.deep.equal([]);
    });

    it("should not update conversation starter if it exists", async () => {
      const spec: any = {
        openapi: "3.0.2",
        info: {
          title: "My API",
        },
        servers: [
          {
            url: "/v3",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPets",
              summary: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              parameters: [
                {
                  name: "limit",
                  description: "Maximum number of pets to return",
                  required: true,
                  schema: {
                    type: "integer",
                  },
                },
              ],
            },
            post: {
              operationId: "createPet",
              summary: "Create a pet",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["name"],
                      properties: {
                        name: {
                          type: "string",
                          description: "Name of the pet",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const manifestPath = "/path/to/your/manifest.json";
      const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
      const pluginFilePath = "/path/to/your/ai-plugin.json";

      const originalManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "Original Short Description", full: "Original Full Description" },
      };
      const expectedManifest = {
        name: { short: "Original Name", full: "Original Full Name" },
        description: { short: "My API", full: "Original Full Description" },
        copilotAgents: {
          plugins: [
            {
              file: "ai-plugin.json",
              id: "plugin_1",
            },
          ],
        },
      };

      const expectedPlugins: PluginManifestSchema = {
        schema_version: "v2.1",
        name_for_human: "Original Name",
        namespace: "originalname",
        description_for_human: "<Please add description of the plugin>",
        capabilities: {
          conversation_starters: [
            {
              text: "Original conversation starter",
            },
          ],
          localization: {},
        },
        functions: [
          {
            name: "getPets",
            description: "Returns all pets from the system that the user has access to",
          },
          {
            description: "Create a pet",
            name: "createPet",
          },
        ],
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "None",
            },
            spec: {
              url: "spec/outputSpec.yaml",
            },
            run_for_functions: ["getPets", "createPet"],
          },
        ],
      };
      sinon
        .stub(fs, "pathExists")
        .withArgs(manifestPath)
        .resolves(true)
        .withArgs(pluginFilePath)
        .resolves(true);

      sinon
        .stub(fs, "readJSON")
        .withArgs(manifestPath)
        .resolves(originalManifest)
        .withArgs(pluginFilePath)
        .resolves({
          schema_version: "v2.1",
          name_for_human: "",
          description_for_human: "",
          capabilities: {
            conversation_starters: [
              {
                text: "Original conversation starter",
              },
            ],
            localization: {},
          },
          functions: [],
          runtimes: [],
        });

      const options: ParseOptions = {
        allowConversationStarters: true,
        allowMethods: ["get", "post"],
      };
      const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
        manifestPath,
        outputSpecPath,
        pluginFilePath,
        spec,
        options,
        {}
      );

      expect(manifest).to.deep.equal(expectedManifest);
      expect(apiPlugin).to.deep.equal(expectedPlugins);
      expect(warnings).to.deep.equal([]);
    });
  });

  it("should append new runtime to apiPlugin files if there exists different spec path", async () => {
    const spec: any = {
      openapi: "3.0.2",
      info: {
        title: "My API",
        description: "My API description",
      },
      servers: [
        {
          url: "/v3",
        },
      ],
      paths: {
        "/pets": {
          get: {
            operationId: "getPets",
            summary: "Get all pets",
            description: "Returns all pets from the system that the user has access to",
            parameters: [
              {
                name: "limit",
                description: "Maximum number of pets to return",
                required: true,
                schema: {
                  type: "integer",
                },
              },
            ],
          },
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            description: "Create a new pet in the store",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const pluginFilePath = "/path/to/your/ai-plugin.json";

    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "My API", full: "My API description" },
      copilotAgents: {
        plugins: [
          {
            file: "ai-plugin.json",
            id: "plugin_1",
          },
        ],
      },
    };

    const expectedPlugins: PluginManifestSchema = {
      schema_version: "v2.1",
      name_for_human: "Original Name",
      namespace: "originalname",
      description_for_human: "My API description",
      functions: [
        {
          name: "getPets2",
          description: "Returns all pets from the system that the user has access to",
        },
        {
          name: "createPet2",
          description: "Create a new pet in the store",
        },
        {
          name: "getPets",
          description: "Returns all pets from the system that the user has access to",
        },
        {
          name: "createPet",
          description: "Create a new pet in the store",
        },
      ],
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec/outputSpec2.yaml",
          },
          run_for_functions: ["getPets2", "createPet2"],
        },
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec/outputSpec.yaml",
          },
          run_for_functions: ["getPets", "createPet"],
        },
      ],
    };
    sinon
      .stub(fs, "pathExists")
      .withArgs(manifestPath)
      .resolves(true)
      .withArgs(pluginFilePath)
      .resolves(true);
    sinon
      .stub(fs, "readJSON")
      .withArgs(manifestPath)
      .resolves(originalManifest)
      .withArgs(pluginFilePath)
      .resolves({
        schema_version: "v2.1",
        name_for_human: "",
        description_for_human: "",
        functions: [
          {
            name: "getPets2",
            description: "Returns all pets from the system that the user has access to",
          },
          {
            name: "createPet2",
            description: "Create a new pet in the store",
          },
        ],
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "None",
            },
            spec: {
              url: "spec/outputSpec2.yaml",
            },
            run_for_functions: ["getPets2", "createPet2"],
          },
        ],
      });

    const options: ParseOptions = {
      allowMethods: ["get", "post"],
    };
    const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
      manifestPath,
      outputSpecPath,
      pluginFilePath,
      spec,
      options,
      {}
    );

    expect(manifest).to.deep.equal(expectedManifest);
    expect(apiPlugin).to.deep.equal(expectedPlugins);
    expect(warnings).to.deep.equal([]);
  });

  it("should add runtime and functions if not exist", async () => {
    const spec: any = {
      openapi: "3.0.2",
      info: {
        title: "My API",
        description: "My API description",
      },
      servers: [
        {
          url: "/v3",
        },
      ],
      paths: {
        "/pets": {
          get: {
            operationId: "getPets",
            summary: "Get all pets",
            description: "Returns all pets from the system that the user has access to",
            parameters: [
              {
                name: "limit",
                description: "Maximum number of pets to return",
                required: true,
                schema: {
                  type: "integer",
                },
              },
            ],
          },
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            description: "Create a new pet in the store",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const pluginFilePath = "/path/to/your/ai-plugin.json";

    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "My API", full: "My API description" },
      copilotAgents: {
        plugins: [
          {
            file: "ai-plugin.json",
            id: "plugin_1",
          },
        ],
      },
    };

    const expectedPlugins: PluginManifestSchema = {
      schema_version: "v2.1",
      name_for_human: "exist_name",
      namespace: "existnamespace",
      description_for_human: "exist_description",
      functions: [
        {
          name: "getPets",
          description: "Returns all pets from the system that the user has access to",
        },
        {
          name: "createPet",
          description: "Create a new pet in the store",
        },
      ],
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec/outputSpec.yaml",
          },
          run_for_functions: ["getPets", "createPet"],
        },
      ],
    };
    sinon
      .stub(fs, "pathExists")
      .withArgs(manifestPath)
      .resolves(true)
      .withArgs(pluginFilePath)
      .resolves(true);
    sinon
      .stub(fs, "readJSON")
      .withArgs(manifestPath)
      .resolves(originalManifest)
      .withArgs(pluginFilePath)
      .resolves({
        schema_version: "v2.1",
        name_for_human: "exist_name",
        namespace: "existnamespace",
        description_for_human: "exist_description",
      });

    const options: ParseOptions = {
      allowMethods: ["get", "post"],
    };
    const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
      manifestPath,
      outputSpecPath,
      pluginFilePath,
      spec,
      options,
      {}
    );

    expect(manifest).to.deep.equal(expectedManifest);
    expect(apiPlugin).to.deep.equal(expectedPlugins);
    expect(warnings).to.deep.equal([]);
  });

  it("should overwrite apiPlugin files if there exists runtime with same spec path", async () => {
    const spec: any = {
      openapi: "3.0.2",
      info: {
        title: "My API",
        description: "My API description",
      },
      servers: [
        {
          url: "/v3",
        },
      ],
      paths: {
        "/pets": {
          get: {
            operationId: "getPets",
            summary: "Get all pets",
            description: "Returns all pets from the system that the user has access to",
            parameters: [
              {
                name: "limit",
                description: "Maximum number of pets to return",
                required: true,
                schema: {
                  type: "integer",
                },
              },
            ],
          },
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            description: "Create a new pet in the store",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const pluginFilePath = "/path/to/your/ai-plugin.json";

    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "My API", full: "My API description" },
      copilotAgents: {
        plugins: [
          {
            file: "ai-plugin.json",
            id: "plugin_1",
          },
        ],
      },
    };

    const expectedPlugins: PluginManifestSchema = {
      schema_version: "v2.1",
      name_for_human: "Original Name",
      namespace: "originalname",
      description_for_human: "My API description",
      functions: [
        {
          name: "getPets",
          description: "Returns all pets from the system that the user has access to",
        },
        {
          name: "createPet",
          description: "Create a new pet in the store",
        },
      ],
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec/outputSpec.yaml",
          },
          run_for_functions: ["getPets", "createPet"],
        },
      ],
    };
    sinon
      .stub(fs, "pathExists")
      .withArgs(manifestPath)
      .resolves(true)
      .withArgs(pluginFilePath)
      .resolves(true);
    sinon
      .stub(fs, "readJSON")
      .withArgs(manifestPath)
      .resolves(originalManifest)
      .withArgs(pluginFilePath)
      .resolves({
        schema_version: "v2.1",
        name_for_human: "",
        description_for_human: "",
        functions: [
          {
            name: "getPets",
            description: "Returns all pets from the system that the user has access to - old",
          },
          {
            name: "createPet",
            description: "Create a new pet in the store - old",
          },
        ],
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "None",
            },
            spec: {
              url: "spec/outputSpec.yaml",
            },
            run_for_functions: ["getPets", "createPet"],
          },
        ],
      });

    const options: ParseOptions = {
      allowMethods: ["get", "post"],
    };
    const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
      manifestPath,
      outputSpecPath,
      pluginFilePath,
      spec,
      options,
      {}
    );

    expect(manifest).to.deep.equal(expectedManifest);
    expect(apiPlugin).to.deep.equal(expectedPlugins);
    expect(warnings).to.deep.equal([]);
  });

  it("should update the plugin json correctly when contains env in name and description", async () => {
    const spec: any = {
      openapi: "3.0.2",
      info: {
        title: "My API",
        description: "My API description",
      },
      servers: [
        {
          url: "/v3",
        },
      ],
      paths: {
        "/pets": {
          get: {
            operationId: "getPets",
            summary: "Get all pets",
            description: "Returns all pets from the system that the user has access to",
            parameters: [
              {
                name: "limit",
                description: "Maximum number of pets to return",
                required: true,
                schema: {
                  type: "integer",
                },
              },
            ],
          },
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            description: "Create a new pet in the store",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const pluginFilePath = "/path/to/your/ai-plugin.json";

    sinon
      .stub(fs, "pathExists")
      .withArgs(manifestPath)
      .resolves(true)
      .withArgs(pluginFilePath)
      .resolves(false);
    const originalManifest = {
      name: { short: "Original Name${{TestEnv}}", full: "Original Full Name" },
      description: {
        short: "Original Short Description",
        full: "Original Full Description${{TestEnv}}",
      },
    };
    const expectedManifest = {
      name: { short: "Original Name${{TestEnv}}", full: "Original Full Name" },
      description: { short: "My API", full: "My API description" },
      copilotAgents: {
        plugins: [
          {
            file: "ai-plugin.json",
            id: "plugin_1",
          },
        ],
      },
    };

    const expectedPlugins: PluginManifestSchema = {
      $schema: ConstantString.PluginManifestSchema,
      schema_version: "v2.2",
      name_for_human: "Original Name",
      namespace: "originalname",
      description_for_human: "My API description",
      functions: [
        {
          name: "getPets",
          description: "Returns all pets from the system that the user has access to",
        },
        {
          name: "createPet",
          description: "Create a new pet in the store",
        },
      ],
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec/outputSpec.yaml",
          },
          run_for_functions: ["getPets", "createPet"],
        },
      ],
    };
    sinon.stub(fs, "readJSON").resolves(originalManifest);
    const options: ParseOptions = {
      allowMethods: ["get", "post"],
    };
    const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
      manifestPath,
      outputSpecPath,
      pluginFilePath,
      spec,
      options,
      {}
    );

    expect(manifest).to.deep.equal(expectedManifest);
    expect(apiPlugin).to.deep.equal(expectedPlugins);
    expect(warnings).to.deep.equal([]);
  });

  it("should update the manifest with the correct manifest and apiPlugin files with optional parameters", async () => {
    const spec: any = {
      openapi: "3.0.2",
      info: {
        title: "My API",
        description: "My API description",
      },
      servers: [
        {
          url: "/v3",
        },
      ],
      paths: {
        "/pets": {
          get: {
            operationId: "getPets",
            summary: "Get all pets",
            description: "Returns all pets from the system that the user has access to",
            parameters: [
              {
                name: "limit",
                description: "Maximum number of pets to return",
                required: true,
                schema: {
                  type: "integer",
                },
              },
              {
                name: "id",
                schema: {
                  type: "string",
                },
              },
            ],
          },
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            description: "Create a new pet in the store",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const pluginFilePath = "/path/to/your/ai-plugin.json";

    sinon
      .stub(fs, "pathExists")
      .withArgs(manifestPath)
      .resolves(true)
      .withArgs(pluginFilePath)
      .resolves(false);
    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "My API", full: "My API description" },
      copilotAgents: {
        plugins: [
          {
            file: "ai-plugin.json",
            id: "plugin_1",
          },
        ],
      },
    };

    const expectedPlugins: PluginManifestSchema = {
      $schema: ConstantString.PluginManifestSchema,
      schema_version: "v2.2",
      name_for_human: "Original Name",
      namespace: "originalname",
      description_for_human: "My API description",
      functions: [
        {
          name: "getPets",
          description: "Returns all pets from the system that the user has access to",
        },
        {
          name: "createPet",
          description: "Create a new pet in the store",
        },
      ],
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec/outputSpec.yaml",
          },
          run_for_functions: ["getPets", "createPet"],
        },
      ],
    };
    sinon.stub(fs, "readJSON").resolves(originalManifest);

    const options: ParseOptions = {
      allowMethods: ["get", "post"],
    };
    const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
      manifestPath,
      outputSpecPath,
      pluginFilePath,
      spec,
      options,
      {}
    );

    expect(manifest).to.deep.equal(expectedManifest);
    expect(apiPlugin).to.deep.equal(expectedPlugins);
    expect(warnings).to.deep.equal([]);
  });

  it("should generate default ai plugin file if no api", async () => {
    const spec: any = {
      openapi: "3.0.2",
      info: {
        title: "My API",
        description: "My API description",
      },
      servers: [
        {
          url: "/v3",
        },
      ],
      paths: {},
    };
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const pluginFilePath = "/path/to/your/ai-plugin.json";

    sinon
      .stub(fs, "pathExists")
      .withArgs(manifestPath)
      .resolves(true)
      .withArgs(pluginFilePath)
      .resolves(false);
    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "My API", full: "My API description" },
      copilotAgents: {
        plugins: [
          {
            file: "ai-plugin.json",
            id: "plugin_1",
          },
        ],
      },
    };

    const expectedPlugins: PluginManifestSchema = {
      $schema: ConstantString.PluginManifestSchema,
      schema_version: "v2.2",
      name_for_human: "Original Name",
      namespace: "originalname",
      description_for_human: "My API description",
      functions: [],
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec/outputSpec.yaml",
          },
          run_for_functions: [],
        },
      ],
    };
    sinon.stub(fs, "readJSON").resolves(originalManifest);
    const options: ParseOptions = {
      allowMethods: ["get", "post"],
    };
    const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
      manifestPath,
      outputSpecPath,
      pluginFilePath,
      spec,
      options,
      {}
    );

    expect(manifest).to.deep.equal(expectedManifest);
    expect(apiPlugin).to.deep.equal(expectedPlugins);
    expect(warnings).to.deep.equal([]);
  });

  it("should throw error if has nested object property", async () => {
    const spec: any = {
      openapi: "3.0.2",
      info: {
        title: "My API",
        description: "My API description",
      },
      servers: [
        {
          url: "/v3",
        },
      ],
      paths: {
        "/pets": {
          post: {
            operationId: "postPets",
            summary: "Get all pets",
            description: "Returns all pets from the system that the user has access to",
            parameters: [
              {
                name: "petObj",
                description: "Pet object",
                required: true,
                schema: {
                  type: "object",
                  properties: {
                    id: {
                      type: "integer",
                    },
                    name: {
                      type: "string",
                    },
                  },
                },
              },
            ],
          },
        },
      },
    };
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";

    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "My API", full: "My API description" },
    };

    sinon.stub(fs, "readJSON").resolves(originalManifest);
    const pluginFilePath = "/path/to/your/ai-plugin.json";
    sinon
      .stub(fs, "pathExists")
      .withArgs(manifestPath)
      .resolves(true)
      .withArgs(pluginFilePath)
      .resolves(false);
    try {
      const options: ParseOptions = {
        allowMethods: ["get", "post"],
        allowConfirmation: true,
      };
      await ManifestUpdater.updateManifestWithAiPlugin(
        manifestPath,
        outputSpecPath,
        pluginFilePath,
        spec,
        options,
        {}
      );
      expect.fail("Expected updateManifest to throw a SpecParserError");
    } catch (err: any) {
      expect(err).to.be.instanceOf(SpecParserError);
      expect(err.errorType).to.equal(ErrorType.UpdateManifestFailed);
      expect(err.message).to.equal(
        "Unsupported schema in post /pets: " +
          JSON.stringify({
            type: "object",
            properties: {
              id: {
                type: "integer",
              },
              name: {
                type: "string",
              },
            },
          })
      );
    }
  });

  it("should throw error if request body is not object", async () => {
    const spec: any = {
      openapi: "3.0.2",
      info: {
        title: "My API",
        description: "My API description",
      },
      servers: [
        {
          url: "/v3",
        },
      ],
      paths: {
        "/pets": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "string",
                  },
                },
              },
            },
            operationId: "postPets",
            summary: "Get all pets",
            description: "Returns all pets from the system that the user has access to",
          },
        },
      },
    };
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";

    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "My API", full: "My API description" },
    };

    sinon.stub(fs, "readJSON").resolves(originalManifest);
    const pluginFilePath = "/path/to/your/ai-plugin.json";
    sinon
      .stub(fs, "pathExists")
      .withArgs(manifestPath)
      .resolves(true)
      .withArgs(pluginFilePath)
      .resolves(false);
    try {
      const options: ParseOptions = {
        allowMethods: ["get", "post"],
        allowConfirmation: true,
      };
      await ManifestUpdater.updateManifestWithAiPlugin(
        manifestPath,
        outputSpecPath,
        pluginFilePath,
        spec,
        options,
        {}
      );
      expect.fail("Expected updateManifest to throw a SpecParserError");
    } catch (err: any) {
      expect(err).to.be.instanceOf(SpecParserError);
      expect(err.errorType).to.equal(ErrorType.UpdateManifestFailed);
      expect(err.message).to.equal(
        "Unsupported schema in post /pets: " +
          JSON.stringify({
            type: "string",
          })
      );
    }
  });

  it("should update existing manifest", async () => {
    const spec: any = {
      openapi: "3.0.2",
      info: {
        title: "My API",
        description: "My API description",
      },
      servers: [
        {
          url: "/v3",
        },
      ],
      paths: {
        "/pets": {
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            description: "Create a new pet in the store",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the pet",
                      },
                      age: {
                        type: "string",
                        description: "Date time of the pet",
                        format: "date-time",
                      },
                      status: {
                        type: "string",
                        description: "Status of the pet",
                        enum: ["available", "pending", "sold"],
                      },
                      arrayProp: {
                        type: "array",
                        items: {
                          type: "string",
                          description: "Prop of the pet",
                          format: "date-time",
                          default: "2021-01-01T00:00:00Z",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const pluginFilePath = "/path/to/your/ai-plugin.json";
    const existingPluginManifestPath = "/path/to/your/pluginManifest.json";
    const specPath = "/path/to/your/spec.yaml";
    const relativePath = ManifestUpdater.getRelativePath(existingPluginManifestPath, specPath);
    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "My API", full: "My API description" },
      copilotAgents: {
        plugins: [
          {
            file: "ai-plugin.json",
            id: "plugin_1",
          },
        ],
      },
    };
    const originalPluginManifest = {
      $schema: ConstantString.PluginManifestSchema,
      schema_version: "v2.2",
      name_for_human: "Original Name",
      namespace: "originalname",
      description_for_human: "My API description",
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: relativePath,
          },
          run_for_functions: ["createPet"],
        },
      ],
    };

    const expectedPlugins: PluginManifestSchema = {
      $schema: ConstantString.PluginManifestSchema,
      schema_version: "v2.2",
      name_for_human: "Original Name",
      namespace: "originalname",
      description_for_human: "My API description",
      functions: [
        {
          name: "createPet",
          description: "Create a new pet in the store",
        },
      ],
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec/outputSpec.yaml",
          },
          run_for_functions: ["createPet"],
        },
      ],
    };
    sinon.stub(fs, "readJSON").callsFake(async (path) => {
      if (path === manifestPath) {
        return Promise.resolve(originalManifest);
      } else if (path === existingPluginManifestPath) {
        return Promise.resolve(originalPluginManifest);
      } else {
        return Promise.resolve({});
      }
    });
    sinon
      .stub(fs, "pathExists")
      .withArgs(manifestPath)
      .resolves(true)
      .withArgs(pluginFilePath)
      .resolves(false)
      .withArgs(existingPluginManifestPath)
      .resolves(true);

    const options: ParseOptions = {
      allowMethods: ["get", "post"],
    };
    const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
      manifestPath,
      outputSpecPath,
      pluginFilePath,
      spec,
      options,
      {},
      {
        manifestPath: existingPluginManifestPath,
        specPath: specPath,
      }
    );

    expect(manifest).to.deep.equal(expectedManifest);
    expect(apiPlugin).to.deep.equal(expectedPlugins);
    expect(warnings).to.deep.equal([]);
  });

  it("should add copilotAgents plugin and preserve existing copilotExtensions", async () => {
    const spec: any = {
      openapi: "3.0.2",
      info: {
        title: "My API",
        description: "My API description",
      },
      servers: [
        {
          url: "/v3",
        },
      ],
      paths: {
        "/pets": {
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            description: "Create a new pet in the store",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the pet",
                      },
                      age: {
                        type: "string",
                        description: "Date time of the pet",
                        format: "date-time",
                      },
                      status: {
                        type: "string",
                        description: "Status of the pet",
                        enum: ["available", "pending", "sold"],
                      },
                      arrayProp: {
                        type: "array",
                        items: {
                          type: "string",
                          description: "Prop of the pet",
                          format: "date-time",
                          default: "2021-01-01T00:00:00Z",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const pluginFilePath = "/path/to/your/ai-plugin.json";
    const existingPluginManifestPath = "/path/to/your/pluginManifest.json";
    const specPath = "/path/to/your/spec.yaml";
    const relativePath = ManifestUpdater.getRelativePath(existingPluginManifestPath, specPath);
    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
      copilotExtensions: {
        plugins: [{ file: "ai-plugin-old.json", id: "plugin_1" }],
      },
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "My API", full: "My API description" },
      copilotExtensions: {
        plugins: [{ file: "ai-plugin-old.json", id: "plugin_1" }],
      },
      copilotAgents: {
        plugins: [
          {
            file: "ai-plugin.json",
            id: "plugin_1",
          },
        ],
      },
    };
    const originalPluginManifest = {
      $schema: ConstantString.PluginManifestSchema,
      schema_version: "v2.2",
      name_for_human: "Original Name",
      namespace: "originalname",
      description_for_human: "My API description",
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: relativePath,
          },
          run_for_functions: ["createPet"],
        },
      ],
    };

    const expectedPlugins: PluginManifestSchema = {
      $schema: ConstantString.PluginManifestSchema,
      schema_version: "v2.2",
      name_for_human: "Original Name",
      namespace: "originalname",
      description_for_human: "My API description",
      functions: [
        {
          name: "createPet",
          description: "Create a new pet in the store",
        },
      ],
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec/outputSpec.yaml",
          },
          run_for_functions: ["createPet"],
        },
      ],
    };
    sinon.stub(fs, "readJSON").callsFake(async (path) => {
      if (path === manifestPath) {
        return Promise.resolve(originalManifest);
      } else if (path === existingPluginManifestPath) {
        return Promise.resolve(originalPluginManifest);
      } else {
        return Promise.resolve({});
      }
    });
    sinon
      .stub(fs, "pathExists")
      .withArgs(manifestPath)
      .resolves(true)
      .withArgs(pluginFilePath)
      .resolves(false)
      .withArgs(existingPluginManifestPath)
      .resolves(true);

    const options: ParseOptions = {
      allowMethods: ["get", "post"],
    };
    const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
      manifestPath,
      outputSpecPath,
      pluginFilePath,
      spec,
      options,
      {},
      {
        manifestPath: existingPluginManifestPath,
        specPath: specPath,
      }
    );

    expect(manifest).to.deep.equal(expectedManifest);
    expect(apiPlugin).to.deep.equal(expectedPlugins);
    expect(warnings).to.deep.equal([]);
  });

  it("should not change manifest if it is declarative copilot", async () => {
    const spec: any = {
      openapi: "3.0.2",
      info: {
        title: "My API",
        description: "My API description",
      },
      servers: [
        {
          url: "/v3",
        },
      ],
      paths: {
        "/pets": {
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            description: "Create a new pet in the store",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the pet",
                      },
                      age: {
                        type: "string",
                        description: "Date time of the pet",
                        format: "date-time",
                      },
                      status: {
                        type: "string",
                        description: "Status of the pet",
                        enum: ["available", "pending", "sold"],
                      },
                      arrayProp: {
                        type: "array",
                        items: {
                          type: "string",
                          description: "Prop of the pet",
                          format: "date-time",
                          default: "2021-01-01T00:00:00Z",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const pluginFilePath = "/path/to/your/ai-plugin.json";
    const existingPluginManifestPath = "/path/to/your/pluginManifest.json";
    const specPath = "/path/to/your/spec.yaml";
    const relativePath = ManifestUpdater.getRelativePath(existingPluginManifestPath, specPath);
    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
      copilotExtensions: {
        declarativeCopilots: [
          {
            id: "repairDeclarativeCopilot",
            file: "repairDeclarativeCopilot.json",
          },
        ],
      },
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
      copilotExtensions: {
        declarativeCopilots: [
          {
            id: "repairDeclarativeCopilot",
            file: "repairDeclarativeCopilot.json",
          },
        ],
      },
    };
    const originalPluginManifest = {
      $schema: ConstantString.PluginManifestSchema,
      schema_version: "v2.2",
      name_for_human: "Original Name",
      namespace: "originalname",
      description_for_human: "My API description",
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: relativePath,
          },
          run_for_functions: ["createPet"],
        },
      ],
    };

    const expectedPlugins: PluginManifestSchema = {
      $schema: ConstantString.PluginManifestSchema,
      schema_version: "v2.2",
      name_for_human: "Original Name",
      namespace: "originalname",
      description_for_human: "My API description",
      functions: [
        {
          name: "createPet",
          description: "Create a new pet in the store",
        },
      ],
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "spec/outputSpec.yaml",
          },
          run_for_functions: ["createPet"],
        },
      ],
    };
    sinon.stub(fs, "readJSON").callsFake(async (path) => {
      if (path === manifestPath) {
        return Promise.resolve(originalManifest);
      } else if (path === existingPluginManifestPath) {
        return Promise.resolve(originalPluginManifest);
      } else {
        return Promise.resolve({});
      }
    });
    sinon
      .stub(fs, "pathExists")
      .withArgs(manifestPath)
      .resolves(true)
      .withArgs(pluginFilePath)
      .resolves(false)
      .withArgs(existingPluginManifestPath)
      .resolves(true);

    const options: ParseOptions = {
      allowMethods: ["get", "post"],
      isGptPlugin: true,
    };
    const [manifest, apiPlugin, warnings] = await ManifestUpdater.updateManifestWithAiPlugin(
      manifestPath,
      outputSpecPath,
      pluginFilePath,
      spec,
      options,
      {},
      {
        manifestPath: existingPluginManifestPath,
        specPath: specPath,
      }
    );

    expect(manifest).to.deep.equal(expectedManifest);
    expect(apiPlugin).to.deep.equal(expectedPlugins);
    expect(warnings).to.deep.equal([]);
  });
});

describe("manifestUpdater", () => {
  const spec: any = {
    openapi: "3.0.2",
    info: {
      title: "My API",
      description: "My API description",
    },
    servers: [
      {
        url: "/v3",
      },
    ],
    paths: {
      "/pets": {
        get: {
          operationId: "getPets",
          summary: "Get all pets",
          description: "Returns all pets from the system that the user has access to",
          parameters: [
            { name: "limit", description: "Maximum number of pets to return", required: true },
          ],
        },
        post: {
          operationId: "createPet",
          summary: "Create a pet",
          description: "Create a new pet in the store",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: {
                      type: "string",
                      description: "Name of the pet",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  afterEach(() => {
    sinon.restore();
  });

  it("should update the manifest with the correct compose extension", async () => {
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const adaptiveCardFolder = "/path/to/your/adaptiveCards";
    sinon.stub(fs, "pathExists").resolves(true);
    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
      composeExtensions: [],
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: spec.info.title, full: spec.info.description },
      composeExtensions: [
        {
          composeExtensionType: "apiBased",
          apiSpecificationFile: "spec/outputSpec.yaml",
          commands: [
            {
              context: ["compose"],
              type: "query",
              title: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              id: "getPets",
              parameters: [
                {
                  name: "limit",
                  title: "Limit",
                  description: "Maximum number of pets to return",
                  isRequired: true,
                },
              ],
              apiResponseRenderingTemplateFile: "adaptiveCards/getPets.json",
            },
            {
              context: ["compose"],
              type: "query",
              title: "Create a pet",
              description: "Create a new pet in the store",
              id: "createPet",
              parameters: [
                { name: "name", title: "Name", description: "Name of the pet", isRequired: true },
              ],
              apiResponseRenderingTemplateFile: "adaptiveCards/createPet.json",
            },
          ],
        },
      ],
    };
    const readJSONStub = sinon.stub(fs, "readJSON").resolves(originalManifest);

    const options: ParseOptions = {
      allowMultipleParameters: false,
      projectType: ProjectType.SME,
      allowMethods: ["get", "post"],
    };

    const [result, warnings] = await ManifestUpdater.updateManifest(
      manifestPath,
      outputSpecPath,
      spec,
      options,
      adaptiveCardFolder
    );

    expect(result).to.deep.equal(expectedManifest);
    expect(warnings).to.deep.equal([]);
  });

  it("should support multiple parameters for get", async () => {
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const adaptiveCardFolder = "/path/to/your/adaptiveCards";
    const spec: any = {
      openapi: "3.0.2",
      info: {
        title: "My API",
        description: "My API description",
      },
      servers: [
        {
          url: "/v3",
        },
      ],
      paths: {
        "/pets": {
          get: {
            operationId: "getPets",
            summary: "Get all pets",
            description: "Returns all pets from the system that the user has access to",
            parameters: [
              {
                name: "limit",
                description: "Maximum number of pets to return",
                required: true,
                schema: {
                  type: "number",
                },
              },
              {
                name: "name",
                description: "Pet Name",
                required: true,
                schema: {
                  type: "string",
                },
              },
              {
                name: "id",
                description: "Pet Id",
                required: true,
                schema: {
                  type: "integer",
                },
              },
              {
                name: "other1",
                description: "Other Property1",
                required: true,
                schema: {
                  type: "boolean",
                },
              },
              {
                name: "other2",
                description: "Other Property2",
                required: true,
                schema: {
                  type: "string",
                  enum: ["enum1", "enum2", "enum3", "enum4"],
                },
              },
            ],
          },
        },
      },
    };
    sinon.stub(fs, "pathExists").resolves(true);
    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
      composeExtensions: [],
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: spec.info.title, full: spec.info.description },
      composeExtensions: [
        {
          composeExtensionType: "apiBased",
          apiSpecificationFile: "spec/outputSpec.yaml",
          commands: [
            {
              context: ["compose"],
              type: "query",
              title: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              id: "getPets",
              parameters: [
                {
                  name: "limit",
                  title: "Limit",
                  description: "Maximum number of pets to return",
                  inputType: "number",
                  isRequired: true,
                },
                {
                  name: "name",
                  title: "Name",
                  description: "Pet Name",
                  inputType: "text",
                  isRequired: true,
                },
                {
                  name: "id",
                  title: "Id",
                  description: "Pet Id",
                  inputType: "number",
                  isRequired: true,
                },
                {
                  name: "other1",
                  title: "Other1",
                  description: "Other Property1",
                  inputType: "toggle",
                  isRequired: true,
                },
                {
                  name: "other2",
                  title: "Other2",
                  description: "Other Property2",
                  inputType: "choiceset",
                  isRequired: true,
                  choices: [
                    {
                      title: "enum1",
                      value: "enum1",
                    },
                    {
                      title: "enum2",
                      value: "enum2",
                    },
                    {
                      title: "enum3",
                      value: "enum3",
                    },
                    {
                      title: "enum4",
                      value: "enum4",
                    },
                  ],
                },
              ],
              apiResponseRenderingTemplateFile: "adaptiveCards/getPets.json",
            },
          ],
        },
      ],
    };
    const readJSONStub = sinon.stub(fs, "readJSON").resolves(originalManifest);

    const options: ParseOptions = {
      allowMultipleParameters: true,
      projectType: ProjectType.SME,
      allowMethods: ["get", "post"],
    };
    const [result, warnings] = await ManifestUpdater.updateManifest(
      manifestPath,
      outputSpecPath,
      spec,
      options,
      adaptiveCardFolder
    );

    expect(result).to.deep.equal(expectedManifest);
    expect(warnings).to.deep.equal([]);
  });

  it("should support multiple parameters for post", async () => {
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const adaptiveCardFolder = "/path/to/your/adaptiveCards";
    const spec: any = {
      openapi: "3.0.2",
      info: {
        title: "My API",
        description: "My API description",
      },
      servers: [
        {
          url: "/v3",
        },
      ],
      paths: {
        "/pets": {
          post: {
            operationId: "createPet",
            summary: "Create Pet",
            description: "Create Pet by Id",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      name: {
                        type: "string",
                        description: "Pet Name",
                      },
                    },
                  },
                },
              },
            },
            parameters: [
              {
                name: "id",
                description: "Pet Id",
                required: true,
                schema: {
                  type: "integer",
                },
              },
            ],
          },
        },
      },
    };
    sinon.stub(fs, "pathExists").resolves(true);
    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
      composeExtensions: [],
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: spec.info.title, full: spec.info.description },
      composeExtensions: [
        {
          composeExtensionType: "apiBased",
          apiSpecificationFile: "spec/outputSpec.yaml",
          commands: [
            {
              context: ["compose"],
              type: "query",
              title: "Create Pet",
              description: "Create Pet by Id",
              id: "createPet",
              parameters: [
                {
                  name: "id",
                  title: "Id",
                  description: "Pet Id",
                  inputType: "number",
                  isRequired: true,
                },
                {
                  name: "name",
                  title: "Name",
                  description: "Pet Name",
                  inputType: "text",
                  isRequired: true,
                },
              ],
              apiResponseRenderingTemplateFile: "adaptiveCards/createPet.json",
            },
          ],
        },
      ],
    };
    const readJSONStub = sinon.stub(fs, "readJSON").resolves(originalManifest);

    const options: ParseOptions = {
      allowMultipleParameters: true,
      projectType: ProjectType.SME,
      allowMethods: ["get", "post"],
    };
    const [result, warnings] = await ManifestUpdater.updateManifest(
      manifestPath,
      outputSpecPath,
      spec,
      options,
      adaptiveCardFolder
    );

    expect(result).to.deep.equal(expectedManifest);
    expect(warnings).to.deep.equal([]);
  });

  it("should support default value when allowMultipleParameter is true", async () => {
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const adaptiveCardFolder = "/path/to/your/adaptiveCards";
    const spec: any = {
      openapi: "3.0.2",
      info: {
        title: "My API",
        description: "My API description",
      },
      servers: [
        {
          url: "/v3",
        },
      ],
      paths: {
        "/pets": {
          get: {
            operationId: "getPets",
            summary: "Get all pets",
            description: "Returns all pets from the system that the user has access to",
            parameters: [
              {
                name: "id",
                description: "Pet Id",
                required: true,
                schema: {
                  type: "integer",
                  default: 123,
                },
              },
              {
                name: "limit",
                title: "Limit",
                inputType: "number",
                description: "Maximum number of pets to return",
              },
            ],
          },
        },
      },
    };
    sinon.stub(fs, "pathExists").resolves(true);
    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
      composeExtensions: [],
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: spec.info.title, full: spec.info.description },
      composeExtensions: [
        {
          composeExtensionType: "apiBased",
          apiSpecificationFile: "spec/outputSpec.yaml",
          commands: [
            {
              context: ["compose"],
              type: "query",
              title: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              id: "getPets",
              parameters: [
                {
                  name: "id",
                  title: "Id",
                  description: "Pet Id",
                  inputType: "number",
                  value: 123,
                },
              ],
              apiResponseRenderingTemplateFile: "adaptiveCards/getPets.json",
            },
          ],
        },
      ],
    };
    const readJSONStub = sinon.stub(fs, "readJSON").resolves(originalManifest);

    const options: ParseOptions = {
      allowMultipleParameters: true,
      projectType: ProjectType.SME,
      allowMethods: ["get", "post"],
    };
    const [result, warnings] = await ManifestUpdater.updateManifest(
      manifestPath,
      outputSpecPath,
      spec,
      options,
      adaptiveCardFolder
    );

    expect(result).to.deep.equal(expectedManifest);
    expect(warnings).to.deep.equal([
      {
        type: WarningType.OperationOnlyContainsOptionalParam,
        content: Utils.format(ConstantString.OperationOnlyContainsOptionalParam, "getPets"),
        data: {
          commandId: "getPets",
          parameterName: "id",
        },
      },
    ]);
  });

  it("should contain auth property in manifest if pass the api key auth", async () => {
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const adaptiveCardFolder = "/path/to/your/adaptiveCards";
    sinon.stub(fs, "pathExists").resolves(true);
    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
      composeExtensions: [],
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: spec.info.title, full: spec.info.description },
      composeExtensions: [
        {
          composeExtensionType: "apiBased",
          apiSpecificationFile: "spec/outputSpec.yaml",
          authorization: {
            authType: "apiSecretServiceAuth",
            apiSecretServiceAuthConfiguration: {
              apiSecretRegistrationId: "${{API_KEY_AUTH_REGISTRATION_ID}}",
            },
          },
          commands: [
            {
              context: ["compose"],
              type: "query",
              title: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              id: "getPets",
              parameters: [
                {
                  name: "limit",
                  title: "Limit",
                  description: "Maximum number of pets to return",
                  isRequired: true,
                },
              ],
              apiResponseRenderingTemplateFile: "adaptiveCards/getPets.json",
            },
            {
              context: ["compose"],
              type: "query",
              title: "Create a pet",
              description: "Create a new pet in the store",
              id: "createPet",
              parameters: [
                { name: "name", title: "Name", description: "Name of the pet", isRequired: true },
              ],
              apiResponseRenderingTemplateFile: "adaptiveCards/createPet.json",
            },
          ],
        },
      ],
    };
    const readJSONStub = sinon.stub(fs, "readJSON").resolves(originalManifest);
    const apiKeyAuth: AuthInfo = {
      authScheme: {
        type: "apiKey" as const,
        name: "api_key_name",
        in: "header",
      },
      name: "api_key_auth",
    };
    const options: ParseOptions = {
      allowMultipleParameters: false,
      projectType: ProjectType.SME,
      allowMethods: ["get", "post"],
    };

    const [result, warnings] = await ManifestUpdater.updateManifest(
      manifestPath,
      outputSpecPath,
      spec,
      options,
      adaptiveCardFolder,
      apiKeyAuth
    );

    expect(result).to.deep.equal(expectedManifest);
    expect(warnings).to.deep.equal([]);
  });

  it("should contain auth property in manifest if pass the bearer token auth", async () => {
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const adaptiveCardFolder = "/path/to/your/adaptiveCards";
    sinon.stub(fs, "pathExists").resolves(true);
    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
      composeExtensions: [],
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: spec.info.title, full: spec.info.description },
      composeExtensions: [
        {
          composeExtensionType: "apiBased",
          apiSpecificationFile: "spec/outputSpec.yaml",
          authorization: {
            authType: "apiSecretServiceAuth",
            apiSecretServiceAuthConfiguration: {
              apiSecretRegistrationId: "${{BEARER_TOKEN_AUTH_REGISTRATION_ID}}",
            },
          },
          commands: [
            {
              context: ["compose"],
              type: "query",
              title: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              id: "getPets",
              parameters: [
                {
                  name: "limit",
                  title: "Limit",
                  description: "Maximum number of pets to return",
                  isRequired: true,
                },
              ],
              apiResponseRenderingTemplateFile: "adaptiveCards/getPets.json",
            },
            {
              context: ["compose"],
              type: "query",
              title: "Create a pet",
              description: "Create a new pet in the store",
              id: "createPet",
              parameters: [
                { name: "name", title: "Name", description: "Name of the pet", isRequired: true },
              ],
              apiResponseRenderingTemplateFile: "adaptiveCards/createPet.json",
            },
          ],
        },
      ],
    };
    const readJSONStub = sinon.stub(fs, "readJSON").resolves(originalManifest);
    const bearerTokenAuth: AuthInfo = {
      authScheme: {
        type: "http" as const,
        scheme: "bearer",
      },
      name: "bearer_token_auth",
    };
    const options: ParseOptions = {
      allowMultipleParameters: false,
      projectType: ProjectType.SME,
      allowMethods: ["get", "post"],
    };

    const [result, warnings] = await ManifestUpdater.updateManifest(
      manifestPath,
      outputSpecPath,
      spec,
      options,
      adaptiveCardFolder,
      bearerTokenAuth
    );

    expect(result).to.deep.equal(expectedManifest);
    expect(warnings).to.deep.equal([]);
  });

  it("should contain auth property in manifest if pass the oauth2 with auth code flow", async () => {
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const adaptiveCardFolder = "/path/to/your/adaptiveCards";
    sinon.stub(fs, "pathExists").resolves(true);
    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
      composeExtensions: [],
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: spec.info.title, full: spec.info.description },
      composeExtensions: [
        {
          composeExtensionType: "apiBased",
          apiSpecificationFile: "spec/outputSpec.yaml",
          authorization: {
            authType: "oAuth2.0",
            oAuthConfiguration: {
              oauthConfigurationId: "${{OAUTH_AUTH_REGISTRATION_ID}}",
            },
          },
          commands: [
            {
              context: ["compose"],
              type: "query",
              title: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              id: "getPets",
              parameters: [
                {
                  name: "limit",
                  title: "Limit",
                  description: "Maximum number of pets to return",
                  isRequired: true,
                },
              ],
              apiResponseRenderingTemplateFile: "adaptiveCards/getPets.json",
            },
            {
              context: ["compose"],
              type: "query",
              title: "Create a pet",
              description: "Create a new pet in the store",
              id: "createPet",
              parameters: [
                { name: "name", title: "Name", description: "Name of the pet", isRequired: true },
              ],
              apiResponseRenderingTemplateFile: "adaptiveCards/createPet.json",
            },
          ],
        },
      ],
    };
    const readJSONStub = sinon.stub(fs, "readJSON").resolves(originalManifest);
    const oauth2: AuthInfo = {
      authScheme: {
        type: "oauth2",
        flows: {
          authorizationCode: {
            authorizationUrl: "https://example.com/api/oauth/dialog",
            tokenUrl: "https://example.com/api/oauth/token",
            refreshUrl: "https://example.com/api/outh/refresh",
            scopes: {
              "write:pets": "modify pets in your account",
              "read:pets": "read your pets",
            },
          },
        },
      },
      name: "oauth_auth",
    };
    const options: ParseOptions = {
      allowMultipleParameters: false,
      projectType: ProjectType.SME,
      allowMethods: ["get", "post"],
    };
    const [result, warnings] = await ManifestUpdater.updateManifest(
      manifestPath,
      outputSpecPath,
      spec,
      options,
      adaptiveCardFolder,
      oauth2
    );

    expect(result).to.deep.equal(expectedManifest);
    expect(warnings).to.deep.equal([]);
  });

  it("should not contain auth property in manifest if pass the unknown auth", async () => {
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const adaptiveCardFolder = "/path/to/your/adaptiveCards";
    sinon.stub(fs, "pathExists").resolves(true);
    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
      composeExtensions: [],
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: spec.info.title, full: spec.info.description },
      composeExtensions: [
        {
          composeExtensionType: "apiBased",
          apiSpecificationFile: "spec/outputSpec.yaml",
          commands: [
            {
              context: ["compose"],
              type: "query",
              title: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              id: "getPets",
              parameters: [
                {
                  name: "limit",
                  title: "Limit",
                  description: "Maximum number of pets to return",
                  isRequired: true,
                },
              ],
              apiResponseRenderingTemplateFile: "adaptiveCards/getPets.json",
            },
            {
              context: ["compose"],
              type: "query",
              title: "Create a pet",
              description: "Create a new pet in the store",
              id: "createPet",
              parameters: [
                { name: "name", title: "Name", description: "Name of the pet", isRequired: true },
              ],
              apiResponseRenderingTemplateFile: "adaptiveCards/createPet.json",
            },
          ],
        },
      ],
    };
    const readJSONStub = sinon.stub(fs, "readJSON").resolves(originalManifest);
    const basicAuth: AuthInfo = {
      authScheme: {
        type: "http" as const,
        scheme: "basic",
      },
      name: "basic_auth",
    };
    const options: ParseOptions = {
      allowMultipleParameters: false,
      projectType: ProjectType.SME,
      allowMethods: ["get", "post"],
    };
    const [result, warnings] = await ManifestUpdater.updateManifest(
      manifestPath,
      outputSpecPath,
      spec,
      options,
      adaptiveCardFolder,
      basicAuth
    );

    expect(result).to.deep.equal(expectedManifest);
    expect(warnings).to.deep.equal([]);
  });

  it("should contain auth property in manifest if pass the api key name with special characters", async () => {
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const adaptiveCardFolder = "/path/to/your/adaptiveCards";
    sinon.stub(fs, "pathExists").resolves(true);
    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
      composeExtensions: [],
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: spec.info.title, full: spec.info.description },
      composeExtensions: [
        {
          composeExtensionType: "apiBased",
          apiSpecificationFile: "spec/outputSpec.yaml",
          authorization: {
            authType: "apiSecretServiceAuth",
            apiSecretServiceAuthConfiguration: {
              apiSecretRegistrationId: "${{PREFIX__API_KEY_AUTH_REGISTRATION_ID}}",
            },
          },
          commands: [
            {
              context: ["compose"],
              type: "query",
              title: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              id: "getPets",
              parameters: [
                {
                  name: "limit",
                  title: "Limit",
                  description: "Maximum number of pets to return",
                  isRequired: true,
                },
              ],
              apiResponseRenderingTemplateFile: "adaptiveCards/getPets.json",
            },
            {
              context: ["compose"],
              type: "query",
              title: "Create a pet",
              description: "Create a new pet in the store",
              id: "createPet",
              parameters: [
                { name: "name", title: "Name", description: "Name of the pet", isRequired: true },
              ],
              apiResponseRenderingTemplateFile: "adaptiveCards/createPet.json",
            },
          ],
        },
      ],
    };
    const readJSONStub = sinon.stub(fs, "readJSON").resolves(originalManifest);
    const apiKeyAuth: AuthInfo = {
      authScheme: {
        type: "http" as const,
        scheme: "bearer",
        bearerFormat: "JWT",
      },
      name: "*api-key_auth",
    };

    const options: ParseOptions = {
      allowMultipleParameters: false,
      projectType: ProjectType.SME,
      allowMethods: ["get", "post"],
    };

    const [result, warnings] = await ManifestUpdater.updateManifest(
      manifestPath,
      outputSpecPath,
      spec,
      options,
      adaptiveCardFolder,
      apiKeyAuth
    );

    expect(result).to.deep.equal(expectedManifest);
    expect(warnings).to.deep.equal([]);
  });

  it("should return warnings if api only contain optional parameters", async () => {
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const adaptiveCardFolder = "/path/to/your/adaptiveCards";
    const spec: any = {
      openapi: "3.0.2",
      info: {
        title: "My API",
        description: "My API description",
      },
      servers: [
        {
          url: "/v3",
        },
      ],
      paths: {
        "/pets": {
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the pet",
                      },
                      id: {
                        type: "string",
                        description: "Id of the pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    sinon.stub(fs, "pathExists").resolves(true);
    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
      composeExtensions: [],
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: spec.info.title, full: spec.info.description },
      composeExtensions: [
        {
          apiSpecificationFile: "spec/outputSpec.yaml",
          commands: [
            {
              apiResponseRenderingTemplateFile: "adaptiveCards/createPet.json",
              context: ["compose"],
              id: "createPet",
              parameters: [
                {
                  description: "Name of the pet",
                  name: "name",
                  title: "Name",
                },
              ],
              title: "Create a pet",
              description: "",
              type: "query",
            },
          ],
          composeExtensionType: "apiBased",
        },
      ],
    };
    const readJSONStub = sinon.stub(fs, "readJSON").resolves(originalManifest);
    const options: ParseOptions = {
      allowMultipleParameters: false,
      projectType: ProjectType.SME,
      allowMethods: ["get", "post"],
    };
    const [result, warnings] = await ManifestUpdater.updateManifest(
      manifestPath,
      outputSpecPath,
      spec,
      options,
      adaptiveCardFolder
    );

    expect(result).to.deep.equal(expectedManifest);
    expect(warnings).to.deep.equal([
      {
        type: WarningType.OperationOnlyContainsOptionalParam,
        content: Utils.format(ConstantString.OperationOnlyContainsOptionalParam, "createPet"),
        data: {
          commandId: "createPet",
          parameterName: "name",
        },
      },
    ]);
  });

  it("should throw a SpecParserError if fs.readJSON throws an error", async () => {
    const manifestPath = "path/to/manifest.json";
    const outputSpecPath = "path/to/outputSpec.json";
    const adaptiveCardFolder = "path/to/adaptiveCardFolder";
    const spec = {} as any;
    const readJSONStub = sinon.stub(fs, "readJSON").rejects(new Error("readJSON error"));
    try {
      const options: ParseOptions = {
        allowMultipleParameters: false,
        projectType: ProjectType.SME,
        allowMethods: ["get", "post"],
      };
      await ManifestUpdater.updateManifest(
        manifestPath,
        outputSpecPath,
        spec,
        options,
        adaptiveCardFolder
      );
      expect.fail("Expected updateManifest to throw a SpecParserError");
    } catch (err: any) {
      expect(err).to.be.instanceOf(SpecParserError);
      expect(err.errorType).to.equal(ErrorType.UpdateManifestFailed);
      expect(err.message).to.equal("Error: readJSON error");
    }
  });

  it("should skip updating commands if adaptive card not exist", async () => {
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const adaptiveCardFolder = "/path/to/your/adaptiveCards";
    sinon.stub(fs, "pathExists").resolves(false);

    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
      composeExtensions: [],
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: spec.info.title, full: "Original Full Description" },
      composeExtensions: [
        {
          composeExtensionType: "apiBased",
          apiSpecificationFile: "spec/outputSpec.yaml",
          commands: [
            {
              apiResponseRenderingTemplateFile: "",
              context: ["compose"],
              description: "Returns all pets from the system that the user has access to",
              id: "getPets",
              parameters: [
                {
                  description: "Maximum number of pets to return",
                  name: "limit",
                  title: "Limit",
                  isRequired: true,
                },
              ],
              title: "Get all pets",
              type: "query",
            },
            {
              apiResponseRenderingTemplateFile: "",
              context: ["compose"],
              description: "Create a new pet in the store",
              id: "createPet",
              parameters: [
                {
                  description: "Name of the pet",
                  name: "name",
                  title: "Name",
                  isRequired: true,
                },
              ],
              title: "Create a pet",
              type: "query",
            },
          ],
        },
      ],
    };
    const readJSONStub = sinon.stub(fs, "readJSON").resolves(originalManifest);

    const options: ParseOptions = {
      allowMultipleParameters: false,
      projectType: ProjectType.SME,
      allowMethods: ["get", "post"],
    };

    const [result, warnings] = await ManifestUpdater.updateManifest(
      manifestPath,
      outputSpecPath,
      {
        ...spec,
        info: { title: "My API" },
      },
      options,
      adaptiveCardFolder
    );

    expect(result).to.deep.equal(expectedManifest);
    expect(warnings).to.deep.equal([]);
    readJSONStub.restore();
  });

  it("should skip updating full/description if missing info/description", async () => {
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const adaptiveCardFolder = "/path/to/your/adaptiveCards";
    sinon.stub(fs, "pathExists").resolves(true);

    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
      composeExtensions: [],
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: spec.info.title, full: "Original Full Description" },
      composeExtensions: [
        {
          composeExtensionType: "apiBased",
          apiSpecificationFile: "spec/outputSpec.yaml",
          commands: [
            {
              context: ["compose"],
              type: "query",
              title: "Get all pets",
              description: "Returns all pets from the system that the user has access to",
              id: "getPets",
              parameters: [
                {
                  name: "limit",
                  title: "Limit",
                  description: "Maximum number of pets to return",
                  isRequired: true,
                },
              ],
              apiResponseRenderingTemplateFile: "adaptiveCards/getPets.json",
            },
            {
              apiResponseRenderingTemplateFile: "adaptiveCards/createPet.json",
              context: ["compose"],
              id: "createPet",
              description: "Create a new pet in the store",
              parameters: [
                {
                  description: "Name of the pet",
                  name: "name",
                  title: "Name",
                  isRequired: true,
                },
              ],
              title: "Create a pet",
              type: "query",
            },
          ],
        },
      ],
    };
    const readJSONStub = sinon.stub(fs, "readJSON").resolves(originalManifest);
    const options: ParseOptions = {
      allowMultipleParameters: false,
      projectType: ProjectType.SME,
      allowMethods: ["get", "post"],
    };
    const [result, warnings] = await ManifestUpdater.updateManifest(
      manifestPath,
      outputSpecPath,
      {
        ...spec,
        info: { title: "My API" },
      },
      options,
      adaptiveCardFolder
    );

    expect(result).to.deep.equal(expectedManifest);
    expect(warnings).to.deep.equal([]);
    readJSONStub.restore();
  });

  it("should not update manifest if project type is Teams AI", async () => {
    const manifestPath = "/path/to/your/manifest.json";
    const outputSpecPath = "/path/to/your/spec/outputSpec.yaml";
    const adaptiveCardFolder = "/path/to/your/adaptiveCards";
    sinon.stub(fs, "pathExists").resolves(true);
    const originalManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: "Original Short Description", full: "Original Full Description" },
      composeExtensions: [],
    };
    const expectedManifest = {
      name: { short: "Original Name", full: "Original Full Name" },
      description: { short: spec.info.title, full: spec.info.description },
      composeExtensions: [],
    };
    const readJSONStub = sinon.stub(fs, "readJSON").resolves(originalManifest);
    const options: ParseOptions = {
      allowMultipleParameters: false,
      projectType: ProjectType.TeamsAi,
      allowMethods: ["get", "post"],
    };
    const [result, warnings] = await ManifestUpdater.updateManifest(
      manifestPath,
      outputSpecPath,
      spec,
      options
    );

    expect(result).to.deep.equal(expectedManifest);
    expect(warnings).to.deep.equal([]);
  });
});

describe("getRelativePath", () => {
  it("should return the correct relative path", () => {
    const from = "/path/to/from";
    const to = "/path/to/file.txt";
    const result = ManifestUpdater.getRelativePath(from, to);
    expect(result).to.equal("file.txt");
  });

  it("should get relative path with subfolder", () => {
    const from = "/path/to/from";
    const to = "/path/to/subfolder/file.txt";
    const result = ManifestUpdater.getRelativePath(from, to);
    expect(result).to.equal("subfolder/file.txt");
  });

  it("should replace backslashes with forward slashes on Windows", () => {
    if (os.platform() === "win32") {
      const from = "c:\\path\\to\\from";
      const to = "c:\\path\\to\\subfolder\\file.txt";
      const result = ManifestUpdater.getRelativePath(from, to);
      expect(result).to.equal("subfolder/file.txt");
    }
  });
});

describe("generateCommands", () => {
  const adaptiveCardFolder = "/path/to/your/adaptiveCards";
  const manifestPath = "/path/to/your/manifest.json";

  afterEach(() => {
    sinon.restore();
  });

  it("should generate commands for each GET/POST operation in the spec", async () => {
    const spec: any = {
      paths: {
        "/pets": {
          get: {
            operationId: "getPets",
            summary: "Get all pets",
            parameters: [
              { name: "limit", description: "Maximum number of pets to return", required: true },
            ],
          },
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            parameters: [{ name: "id", description: "ID of the pet", required: false }],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    required: ["name"],
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the pet",
                      },
                      unknown: {
                        type: "unknown",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "/pets/{id}": {
          get: {
            operationId: "getPetById",
            summary: "Get a pet by ID",
            parameters: [{ name: "id", description: "ID of the pet to retrieve", required: true }],
          },
        },
        "/owners/{ownerId}/pets": {
          get: {
            operationId: "getOwnerPets",
            summary: "Get all pets owned by an owner",
            parameters: [{ name: "ownerId", description: "ID of the owner", required: true }],
          },
        },
      },
    };
    sinon.stub(fs, "pathExists").resolves(true);

    const expectedCommands = [
      {
        context: ["compose"],
        type: "query",
        title: "Get all pets",
        id: "getPets",
        description: "",
        parameters: [
          {
            name: "limit",
            title: "Limit",
            description: "Maximum number of pets to return",
            isRequired: true,
          },
        ],
        apiResponseRenderingTemplateFile: "adaptiveCards/getPets.json",
      },
      {
        context: ["compose"],
        type: "query",
        title: "Create a pet",
        id: "createPet",
        description: "",
        parameters: [
          {
            description: "Name of the pet",
            name: "name",
            title: "Name",
            isRequired: true,
          },
        ],
        apiResponseRenderingTemplateFile: "adaptiveCards/createPet.json",
      },
      {
        context: ["compose"],
        type: "query",
        title: "Get a pet by ID",
        description: "",
        id: "getPetById",
        parameters: [
          { name: "id", title: "Id", description: "ID of the pet to retrieve", isRequired: true },
        ],
        apiResponseRenderingTemplateFile: "adaptiveCards/getPetById.json",
      },
      {
        context: ["compose"],
        type: "query",
        description: "",
        title: "Get all pets owned by an owner",
        id: "getOwnerPets",
        parameters: [
          { name: "ownerId", title: "OwnerId", description: "ID of the owner", isRequired: true },
        ],
        apiResponseRenderingTemplateFile: "adaptiveCards/getOwnerPets.json",
      },
    ];
    const options: ParseOptions = {
      allowMultipleParameters: false,
      allowMethods: ["get", "post"],
    };
    const [result, warnings] = await ManifestUpdater.generateCommands(
      spec,
      manifestPath,
      options,
      adaptiveCardFolder
    );

    expect(result).to.deep.equal(expectedCommands);
    expect(warnings).to.deep.equal([]);
  });

  it("should truncate strings in manifest file if exceed the max lens", async () => {
    const spec: any = {
      paths: {
        "/pets": {
          get: {
            operationId: "getPets",
            summary:
              "Get all pets. Get all pets. Get all pets. Get all pets. Get all pets. Get all pets.",
            description:
              "This is the long description of get all pets. This is the long description of get all pets. This is the long description of get all pets",
            parameters: [
              {
                name: "longLimitlongLimitlongLimitlongLimit",
                description:
                  "Long maximum number of pets to return. Long maximum number of pets to return. Long maximum number of pets to return. Long maximum number of pets to return.",
                required: true,
              },
            ],
          },
        },
      },
    };
    sinon.stub(fs, "pathExists").resolves(true);

    const expectedCommands = [
      {
        context: ["compose"],
        type: "query",
        title: "Get all pets. Get all pets. Get ",
        id: "getPets",
        description:
          "This is the long description of get all pets. This is the long description of get all pets. This is the long description of get ",
        parameters: [
          {
            name: "longLimitlongLimitlongLimitlongLimit",
            title: "LongLimitlongLimitlongLimitlongL",
            description:
              "Long maximum number of pets to return. Long maximum number of pets to return. Long maximum number of pets to return. Long maximu",
            isRequired: true,
          },
        ],
        apiResponseRenderingTemplateFile: "adaptiveCards/getPets.json",
      },
    ];
    const options: ParseOptions = {
      allowMultipleParameters: false,
      allowMethods: ["get", "post"],
    };
    const [result, warnings] = await ManifestUpdater.generateCommands(
      spec,
      manifestPath,
      options,
      adaptiveCardFolder
    );

    expect(result).to.deep.equal(expectedCommands);
    expect(warnings).to.deep.equal([]);
  });

  it("should show warning for each GET/POST operation in the spec if only contains optional parameters", async () => {
    const spec: any = {
      paths: {
        "/pets": {
          get: {
            operationId: "getPets",
            summary: "Get all pets",
            parameters: [
              { name: "limit", description: "Maximum number of pets to return", required: false },
              { name: "id", description: "ID of the pet", required: false },
            ],
          },
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            parameters: [{ name: "id", description: "ID of the pet", required: false }],
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    sinon.stub(fs, "pathExists").resolves(true);
    const options: ParseOptions = {
      allowMultipleParameters: false,
      allowMethods: ["get", "post"],
    };
    const [result, warnings] = await ManifestUpdater.generateCommands(
      spec,
      manifestPath,
      options,
      adaptiveCardFolder
    );
    expect(result).to.deep.equal([
      {
        apiResponseRenderingTemplateFile: "adaptiveCards/getPets.json",
        context: ["compose"],
        id: "getPets",
        description: "",
        parameters: [
          {
            description: "Maximum number of pets to return",
            name: "limit",
            title: "Limit",
          },
        ],
        title: "Get all pets",
        type: "query",
      },
      {
        apiResponseRenderingTemplateFile: "adaptiveCards/createPet.json",
        context: ["compose"],
        id: "createPet",
        description: "",
        parameters: [
          {
            description: "ID of the pet",
            name: "id",
            title: "Id",
          },
        ],
        title: "Create a pet",
        type: "query",
      },
    ]);
    expect(warnings).to.deep.equal([
      {
        type: WarningType.OperationOnlyContainsOptionalParam,
        content: Utils.format(ConstantString.OperationOnlyContainsOptionalParam, "getPets"),
        data: {
          commandId: "getPets",
          parameterName: "limit",
        },
      },
      {
        type: WarningType.OperationOnlyContainsOptionalParam,
        content: Utils.format(ConstantString.OperationOnlyContainsOptionalParam, "createPet"),
        data: {
          commandId: "createPet",
          parameterName: "id",
        },
      },
    ]);
  });

  it("should treat POST operation required parameter with default value as optional parameter", async () => {
    const spec: any = {
      paths: {
        "/pets": {
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the pet",
                        default: "value",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    sinon.stub(fs, "pathExists").resolves(true);
    const options: ParseOptions = {
      allowMultipleParameters: false,
      allowMethods: ["get", "post"],
    };
    const [result, warnings] = await ManifestUpdater.generateCommands(
      spec,
      manifestPath,
      options,
      adaptiveCardFolder
    );
    expect(result).to.deep.equal([
      {
        apiResponseRenderingTemplateFile: "adaptiveCards/createPet.json",
        context: ["compose"],
        id: "createPet",
        description: "",
        parameters: [
          {
            description: "Name of the pet",
            name: "name",
            title: "Name",
          },
        ],
        title: "Create a pet",
        type: "query",
      },
    ]);
    expect(warnings).to.deep.equal([]);
  });

  it("should not show warning for each GET/POST operation in the spec if only contains 2 optional parameters", async () => {
    const spec: any = {
      paths: {
        "/pets": {
          get: {
            operationId: "getPets",
            summary: "Get all pets",
            parameters: [{ name: "id", description: "ID of the pet", required: false }],
          },
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the pet",
                      },
                      id: {
                        type: "string",
                        description: "Id of the pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    sinon.stub(fs, "pathExists").resolves(true);
    const options: ParseOptions = {
      allowMultipleParameters: false,
      allowMethods: ["get", "post"],
    };
    const [result, warnings] = await ManifestUpdater.generateCommands(
      spec,
      manifestPath,
      options,
      adaptiveCardFolder
    );
    expect(result).to.deep.equal([
      {
        apiResponseRenderingTemplateFile: "adaptiveCards/getPets.json",
        context: ["compose"],
        id: "getPets",
        description: "",
        parameters: [
          {
            description: "ID of the pet",
            name: "id",
            title: "Id",
          },
        ],
        title: "Get all pets",
        type: "query",
      },
      {
        apiResponseRenderingTemplateFile: "adaptiveCards/createPet.json",
        context: ["compose"],
        id: "createPet",
        description: "",
        parameters: [
          {
            description: "Name of the pet",
            name: "name",
            title: "Name",
          },
        ],
        title: "Create a pet",
        type: "query",
      },
    ]);
    expect(warnings).to.deep.equal([
      {
        type: WarningType.OperationOnlyContainsOptionalParam,
        content: Utils.format(ConstantString.OperationOnlyContainsOptionalParam, "createPet"),
        data: {
          commandId: "createPet",
          parameterName: "name",
        },
      },
    ]);
  });

  it("should only generate commands for GET operation with required parameter", async () => {
    const spec: any = {
      paths: {
        "/pets": {
          get: {
            operationId: "getPets",
            summary: "Get all pets",
            parameters: [
              { name: "limit", description: "Maximum number of pets to return", required: false },
              { name: "id", description: "ID of the pet", required: true },
            ],
          },
        },
      },
    };
    sinon.stub(fs, "pathExists").resolves(true);

    const expectedCommands = [
      {
        context: ["compose"],
        type: "query",
        title: "Get all pets",
        description: "",
        id: "getPets",
        parameters: [{ name: "id", title: "Id", description: "ID of the pet", isRequired: true }],
        apiResponseRenderingTemplateFile: "adaptiveCards/getPets.json",
      },
    ];
    const options: ParseOptions = {
      allowMultipleParameters: false,
      allowMethods: ["get", "post"],
    };
    const [result, warnings] = await ManifestUpdater.generateCommands(
      spec,
      manifestPath,
      options,
      adaptiveCardFolder
    );

    expect(result).to.deep.equal(expectedCommands);
    expect(warnings).to.deep.equal([]);
  });

  it("should treat required parameter with default value as optional parameter", async () => {
    const spec: any = {
      paths: {
        "/pets": {
          get: {
            operationId: "getPets",
            summary: "Get all pets",
            parameters: [
              {
                name: "limit",
                in: "query",
                description: "Maximum number of pets to return",
                required: false,
              },
              {
                name: "id",
                in: "query",
                description: "ID of the pet",
                required: true,
                schema: {
                  type: "string",
                  default: "value",
                },
              },
            ],
          },
        },
      },
    };
    sinon.stub(fs, "pathExists").resolves(true);

    const expectedCommands = [
      {
        context: ["compose"],
        type: "query",
        description: "",
        title: "Get all pets",
        id: "getPets",
        parameters: [
          { name: "limit", title: "Limit", description: "Maximum number of pets to return" },
        ],
        apiResponseRenderingTemplateFile: "adaptiveCards/getPets.json",
      },
    ];
    const options: ParseOptions = {
      allowMultipleParameters: false,
      allowMethods: ["get", "post"],
    };
    const [result, warnings] = await ManifestUpdater.generateCommands(
      spec,
      manifestPath,
      options,
      adaptiveCardFolder
    );

    expect(result).to.deep.equal(expectedCommands);
    expect(warnings).to.deep.equal([
      {
        type: WarningType.OperationOnlyContainsOptionalParam,
        content: Utils.format(ConstantString.OperationOnlyContainsOptionalParam, "getPets"),
        data: { commandId: "getPets", parameterName: "limit" },
      },
    ]);
  });

  it("should generate commands for POST operation with string schema", async () => {
    const spec: any = {
      paths: {
        "/pets": {
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "string",
                    description: "Name of the pet",
                  },
                },
              },
            },
          },
        },
      },
    };
    sinon.stub(fs, "pathExists").resolves(true);

    const expectedCommands = [
      {
        context: ["compose"],
        type: "query",
        title: "Create a pet",
        id: "createPet",
        description: "",
        parameters: [
          {
            description: "Name of the pet",
            name: "requestBody",
            title: "RequestBody",
            isRequired: true,
          },
        ],
        apiResponseRenderingTemplateFile: "adaptiveCards/createPet.json",
      },
    ];
    const options: ParseOptions = {
      allowMultipleParameters: false,
      allowMethods: ["get", "post"],
    };
    const [result, warnings] = await ManifestUpdater.generateCommands(
      spec,
      manifestPath,
      options,
      adaptiveCardFolder
    );

    expect(result).to.deep.equal(expectedCommands);
    expect(warnings).to.deep.equal([]);
  });
});
