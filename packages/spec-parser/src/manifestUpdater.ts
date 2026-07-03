// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

import {
  AuthObject,
  FunctionObject,
  IComposeExtension,
  IMessagingExtensionCommand,
  PluginManifestSchema,
  TeamsManifestLatest,
} from "@microsoft/app-manifest";
import fs from "fs-extra";
import { OpenAPIV3 } from "openapi-types";
import path from "path";
import { AdaptiveCardGenerator } from "./adaptiveCardGenerator";
import { wrapResponseSemantics } from "./adaptiveCardWrapper";
import { ConstantString } from "./constants";
import {
  AuthInfo,
  ErrorType,
  ExistingPluginManifestInfo,
  FunctionClassificationMap,
  OperationAuthInfoMap,
  ParseOptions,
  ProjectType,
  WarningResult,
  WarningType,
} from "./interfaces";
import { SpecParserError } from "./specParserError";
import { Utils } from "./utils";

export class ManifestUpdater {
  static async updateManifestWithAiPlugin(
    manifestPath: string,
    outputSpecPath: string,
    apiPluginFilePath: string,
    spec: OpenAPIV3.Document,
    options: ParseOptions,
    authMap: OperationAuthInfoMap,
    existingPluginManifestInfo?: ExistingPluginManifestInfo
  ): Promise<[TeamsManifestLatest, PluginManifestSchema, WarningResult[], Record<string, any>]> {
    const manifest: TeamsManifestLatest = await fs.readJSON(manifestPath);
    const apiPluginRelativePath = ManifestUpdater.getRelativePath(manifestPath, apiPluginFilePath);

    if (!options.isGptPlugin) {
      manifest.copilotAgents = manifest.copilotAgents || {};
      (manifest as any).copilotAgents.plugins = [
        {
          file: apiPluginRelativePath,
          id: ConstantString.DefaultPluginId,
        },
      ];
      ManifestUpdater.updateManifestDescription(manifest, spec);
    }

    const appName = this.removeEnvs(manifest.name.short);

    const specRelativePath = ManifestUpdater.getRelativePath(manifestPath, outputSpecPath);
    const [apiPlugin, warnings, jsonDataSet] = await ManifestUpdater.generatePluginManifestSchema(
      spec,
      specRelativePath,
      apiPluginFilePath,
      appName,
      authMap,
      options,
      existingPluginManifestInfo
    );

    return [manifest, apiPlugin, warnings, jsonDataSet];
  }

  static updateManifestDescription(manifest: TeamsManifestLatest, spec: OpenAPIV3.Document): void {
    manifest.description = {
      short: spec.info.title.slice(0, ConstantString.ShortDescriptionMaxLens),
      full: (spec.info.description ?? manifest.description.full)?.slice(
        0,
        ConstantString.FullDescriptionMaxLens
      ),
    };
  }

  static checkSchema(schema: OpenAPIV3.SchemaObject, method: string, pathUrl: string): void {
    if (schema.type === "array") {
      const items = schema.items as OpenAPIV3.SchemaObject;
      ManifestUpdater.checkSchema(items, method, pathUrl);
    } else if (
      schema.type !== "string" &&
      schema.type !== "boolean" &&
      schema.type !== "integer" &&
      schema.type !== "number"
    ) {
      throw new SpecParserError(
        Utils.format(ConstantString.UnsupportedSchema, method, pathUrl, JSON.stringify(schema)),
        ErrorType.UpdateManifestFailed
      );
    }
  }

  static async generatePluginManifestSchema(
    spec: OpenAPIV3.Document,
    specRelativePath: string,
    apiPluginFilePath: string,
    appName: string,
    authMap: OperationAuthInfoMap,
    options: ParseOptions,
    existingPluginManifestInfo?: ExistingPluginManifestInfo
  ): Promise<[PluginManifestSchema, WarningResult[], Record<string, any>]> {
    const warnings: WarningResult[] = [];
    const functions: FunctionObject[] = [];
    const functionNamesMap: FunctionClassificationMap = {};
    const jsonDataSet: Record<string, any> = {};

    const conversationStarters: string[] = [];

    const paths = spec.paths;

    for (const pathUrl in paths) {
      const pathItem = paths[pathUrl];
      if (pathItem) {
        const operations = pathItem;
        for (const method in operations) {
          if (options.allowMethods!.includes(method)) {
            const operationItem = (operations as any)[method] as OpenAPIV3.OperationObject;
            if (operationItem) {
              const operationId = operationItem.operationId!;
              const safeFunctionName = operationId.replace(/[^a-zA-Z0-9]/g, "_");
              const description = operationItem.description ?? "";
              const summary = operationItem.summary;

              const funcDescription = operationItem.description || operationItem.summary || "";
              const funcObj: FunctionObject = {
                name: safeFunctionName,
                description: funcDescription,
              };

              if (options.allowResponseSemantics) {
                try {
                  const { json } = Utils.getResponseJson(operationItem);
                  if (json.schema) {
                    const [card, jsonPath, jsonData] = AdaptiveCardGenerator.generateAdaptiveCard(
                      operationItem,
                      false,
                      5
                    );

                    const responseSemantic = wrapResponseSemantics(card, jsonPath);
                    funcObj.capabilities = {
                      response_semantics: responseSemantic,
                    };

                    if (jsonPath === "$") {
                      jsonDataSet[safeFunctionName] = jsonData;
                    } else {
                      jsonDataSet[safeFunctionName] = jsonData[jsonPath];
                    }
                  }
                } catch (err) {
                  warnings.push({
                    type: WarningType.GenerateCardFailed,
                    content: (err as Error).toString(),
                    data: operationId,
                  });
                }
              }

              if (options.allowConfirmation && method !== ConstantString.GetMethod) {
                const paramObject = operationItem.parameters as OpenAPIV3.ParameterObject[];
                const requestBody = operationItem.requestBody as OpenAPIV3.RequestBodyObject;
                const confirmationBodies: string[] = [];

                if (paramObject) {
                  for (let i = 0; i < paramObject.length; i++) {
                    const param = paramObject[i];
                    const schema = param.schema as OpenAPIV3.SchemaObject;
                    ManifestUpdater.checkSchema(schema, method, pathUrl);
                    confirmationBodies.push(ManifestUpdater.getConfirmationBodyItem(param.name));
                  }
                }

                if (requestBody) {
                  const requestJsonBody = Utils.getJsonContentType(requestBody);

                  const requestBodySchema = requestJsonBody.schema as OpenAPIV3.SchemaObject;
                  if (Utils.isObjectSchema(requestBodySchema)) {
                    for (const property in requestBodySchema.properties) {
                      const schema = requestBodySchema.properties[
                        property
                      ] as OpenAPIV3.SchemaObject;
                      ManifestUpdater.checkSchema(schema, method, pathUrl);
                      confirmationBodies.push(ManifestUpdater.getConfirmationBodyItem(property));
                    }
                  } else {
                    throw new SpecParserError(
                      Utils.format(
                        ConstantString.UnsupportedSchema,
                        method,
                        pathUrl,
                        JSON.stringify(requestBodySchema)
                      ),
                      ErrorType.UpdateManifestFailed
                    );
                  }
                }

                if (confirmationBodies.length > 0) {
                  if (!funcObj.capabilities) {
                    funcObj.capabilities = {};
                  }

                  funcObj.capabilities.confirmation = {
                    type: "AdaptiveCard",
                    title: operationItem.summary ?? description,
                  };

                  funcObj.capabilities.confirmation.body = confirmationBodies.join("\n");
                }
              }

              functions.push(funcObj);

              const authInfo = authMap[operationId];
              let key = "None";
              let authName = "None";

              if (authInfo) {
                if (Utils.isOAuthWithAuthCodeFlow(authInfo.authScheme)) {
                  key = "OAuthPluginVault";
                  authName = authInfo.name;
                } else if (
                  Utils.isBearerTokenAuth(authInfo.authScheme) ||
                  Utils.isAPIKeyAuthButNotInCookie(authInfo.authScheme)
                ) {
                  key = "ApiKeyPluginVault";
                  authName = authInfo.name;
                }
              }

              if (functionNamesMap[key]) {
                functionNamesMap[key].functionNames.push(safeFunctionName);
              } else {
                functionNamesMap[key] = {
                  functionNames: [safeFunctionName],
                  authName: authName,
                };
              }

              const conversationStarterStr = (summary ?? description).slice(
                0,
                ConstantString.ConversationStarterMaxLens
              );
              if (conversationStarterStr) {
                conversationStarters.push(conversationStarterStr);
              }
            }
          }
        }
      }
    }

    if (Object.keys(functionNamesMap).length === 0) {
      functionNamesMap["None"] = {
        functionNames: [],
        authName: "None",
      };
    }

    let apiPlugin: PluginManifestSchema;
    if (await fs.pathExists(apiPluginFilePath)) {
      apiPlugin = await fs.readJSON(apiPluginFilePath);
    } else if (
      existingPluginManifestInfo &&
      (await fs.pathExists(existingPluginManifestInfo.manifestPath))
    ) {
      apiPlugin = await fs.readJSON(existingPluginManifestInfo.manifestPath);
    } else {
      apiPlugin = {
        $schema: ConstantString.PluginManifestSchema,
        schema_version: "v2.2",
        name_for_human: "",
        description_for_human: "",
        namespace: "",
        functions: [],
        runtimes: [],
      };
    }

    apiPlugin.functions = apiPlugin.functions || [];

    for (const func of functions) {
      const index = apiPlugin.functions?.findIndex((f) => f.name === func.name);
      if (index === -1) {
        apiPlugin.functions.push(func);
      } else {
        apiPlugin.functions[index] = func;
      }
    }

    apiPlugin.runtimes = apiPlugin.runtimes || [];
    // Need to delete previous runtime since spec path has changed
    if (existingPluginManifestInfo) {
      const relativePath = ManifestUpdater.getRelativePath(
        existingPluginManifestInfo.manifestPath,
        existingPluginManifestInfo.specPath
      );
      apiPlugin.runtimes = apiPlugin.runtimes.filter(
        (runtime) => runtime.spec.url !== relativePath
      );
    }

    for (const authType in functionNamesMap) {
      const pluginAuthObj: AuthObject = {
        type: authType as any,
      };

      const authName = functionNamesMap[authType].authName;

      if (pluginAuthObj.type !== "None") {
        const safeRegistrationIdName = Utils.getSafeRegistrationIdEnvName(
          `${authName}_${ConstantString.RegistrationIdPostfix}`
        );

        pluginAuthObj.reference_id = `\${{${safeRegistrationIdName}}}`;
      }

      const functionNamesInfo = functionNamesMap[authType];
      const index = apiPlugin.runtimes.findIndex(
        (runtime) =>
          runtime.spec.url === specRelativePath &&
          runtime.type === "OpenApi" &&
          (runtime.auth?.type ?? "None") === authType
      );
      if (index === -1) {
        apiPlugin.runtimes.push({
          type: "OpenApi",
          auth: pluginAuthObj,
          spec: {
            url: specRelativePath,
          },
          run_for_functions: functionNamesInfo.functionNames,
        });
      } else {
        apiPlugin.runtimes[index].run_for_functions = functionNamesInfo.functionNames;
      }
    }

    if (!apiPlugin.name_for_human) {
      apiPlugin.name_for_human = appName;
    }

    if (!apiPlugin.namespace) {
      apiPlugin.namespace = ManifestUpdater.removeAllSpecialCharacters(appName);
    }

    if (!apiPlugin.description_for_human) {
      apiPlugin.description_for_human =
        spec.info.description ?? "<Please add description of the plugin>";
    }

    if (options.allowConversationStarters && conversationStarters.length > 0) {
      if (!apiPlugin.capabilities) {
        apiPlugin.capabilities = {};
      }
      if (!apiPlugin.capabilities.conversation_starters) {
        apiPlugin.capabilities.conversation_starters = conversationStarters
          .slice(0, 5)
          .map((text) => ({ text }));
      }
    }

    return [apiPlugin, warnings, jsonDataSet];
  }

  static async updateManifest(
    manifestPath: string,
    outputSpecPath: string,
    spec: OpenAPIV3.Document,
    options: ParseOptions,
    adaptiveCardFolder?: string,
    authInfo?: AuthInfo
  ): Promise<[TeamsManifestLatest, WarningResult[]]> {
    try {
      const originalManifest: TeamsManifestLatest = await fs.readJSON(manifestPath);
      const updatedPart: any = {};
      updatedPart.composeExtensions = [];
      let warnings: WarningResult[] = [];

      if (options.projectType === ProjectType.SME) {
        const updateResult = await ManifestUpdater.generateCommands(
          spec,
          manifestPath,
          options,
          adaptiveCardFolder
        );
        const commands = updateResult[0];
        warnings = updateResult[1];

        const composeExtension: IComposeExtension = {
          composeExtensionType: "apiBased",
          apiSpecificationFile: ManifestUpdater.getRelativePath(manifestPath, outputSpecPath),
          commands: commands,
        };

        if (authInfo) {
          const auth = authInfo.authScheme;
          const safeRegistrationIdName = Utils.getSafeRegistrationIdEnvName(
            `${authInfo.name}_${ConstantString.RegistrationIdPostfix}`
          );
          if (Utils.isAPIKeyAuth(auth) || Utils.isBearerTokenAuth(auth)) {
            (composeExtension as any).authorization = {
              authType: "apiSecretServiceAuth",
              apiSecretServiceAuthConfiguration: {
                apiSecretRegistrationId: `\${{${safeRegistrationIdName}}}`,
              },
            };
          } else if (Utils.isOAuthWithAuthCodeFlow(auth)) {
            // TODO: below schema is coming from design doc, may need to update when shcema is finalized
            (composeExtension as any).authorization = {
              authType: "oAuth2.0",
              oAuthConfiguration: {
                oauthConfigurationId: `\${{${safeRegistrationIdName}}}`,
              },
            };
          }
        }

        updatedPart.composeExtensions = [composeExtension];
      }

      updatedPart.description = originalManifest.description;
      ManifestUpdater.updateManifestDescription(updatedPart, spec);

      const updatedManifest = { ...originalManifest, ...updatedPart };

      return [updatedManifest, warnings];
    } catch (err) {
      throw new SpecParserError((err as Error).toString(), ErrorType.UpdateManifestFailed);
    }
  }

  static async generateCommands(
    spec: OpenAPIV3.Document,
    manifestPath: string,
    options: ParseOptions,
    adaptiveCardFolder?: string
  ): Promise<[IMessagingExtensionCommand[], WarningResult[]]> {
    const paths = spec.paths;
    const commands: IMessagingExtensionCommand[] = [];
    const warnings: WarningResult[] = [];
    if (paths) {
      for (const pathUrl in paths) {
        const pathItem = paths[pathUrl];
        if (pathItem) {
          const operations = pathItem;

          // Currently only support GET and POST method
          for (const method in operations) {
            if (options.allowMethods?.includes(method)) {
              const operationItem = (operations as any)[method];
              if (operationItem) {
                const command = Utils.parseApiInfo(operationItem, options);

                if (
                  command.parameters &&
                  command.parameters.length >= 1 &&
                  command.parameters.some((param) => param.isRequired)
                ) {
                  command.parameters = command.parameters.filter((param) => param.isRequired);
                } else if (command.parameters && command.parameters.length > 0) {
                  if (command.parameters.length > 1) {
                    command.parameters = [command.parameters[0]];
                    warnings.push({
                      type: WarningType.OperationOnlyContainsOptionalParam,
                      content: Utils.format(
                        ConstantString.OperationOnlyContainsOptionalParam,
                        command.id
                      ),
                      data: {
                        commandId: command.id,
                        parameterName: command.parameters[0].name,
                      },
                    });
                  }
                }

                if (adaptiveCardFolder) {
                  const adaptiveCardPath = path.join(adaptiveCardFolder, command.id + ".json");
                  command.apiResponseRenderingTemplateFile = (await fs.pathExists(adaptiveCardPath))
                    ? ManifestUpdater.getRelativePath(manifestPath, adaptiveCardPath)
                    : "";
                }

                commands.push(command);
              }
            }
          }
        }
      }
    }

    return [commands, warnings];
  }

  static getRelativePath(from: string, to: string): string {
    const relativePath = path.relative(path.dirname(from), to);
    return path.normalize(relativePath).replace(/\\/g, "/");
  }

  static removeEnvs(str: string): string {
    const placeHolderReg = /\${{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}/g;
    const matches = placeHolderReg.exec(str);
    let newStr = str;
    if (matches != null) {
      newStr = newStr.replace(matches[0], "");
    }
    return newStr;
  }

  static removeAllSpecialCharacters(str: string): string {
    return str.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  static getConfirmationBodyItem(paramName: string): string {
    return `* **${Utils.updateFirstLetter(paramName)}**: {{function.parameters.${paramName}}}`;
  }
}
