// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AppPackageFolderName,
  ManifestTemplateFileName,
  SensitivityLabel,
  TeamsManifestLatest,
  TemplateFolderName,
  signedIn,
} from "@microsoft/teamsfx-api";
import {
  GraphClient,
  ListSensitivityLabelScope,
  MetadataV3,
  copilotGptManifestUtils,
  envUtil,
  environmentNameManager,
  getAllowedAppMaps,
  getPermissionMap,
  manifestUtils,
  pluginManifestUtils,
} from "@microsoft/teamsfx-core";
import fs from "fs-extra";
import * as parser from "jsonc-parser";
import * as _ from "lodash";
import path from "path";
import * as util from "util";
import isUUID from "validator/lib/isUUID";
import * as vscode from "vscode";
import { environmentVariableRegex } from "./constants";
import { commandIsRunning, core, tools } from "./globalVariables";
import { TelemetryTriggerFrom } from "./telemetry/extTelemetryEvents";
import { localize } from "./utils/localizeUtils";
import { getSystemInputs } from "./utils/systemEnvUtils";

async function resolveEnvironmentVariablesCodeLens(lens: vscode.CodeLens, from: string) {
  // Get environment variables
  const inputs = getSystemInputs();

  let localEnvs, defaultEnvs;
  const localEnvsRes = await envUtil.readEnv(
    inputs.projectPath!,
    environmentNameManager.getLocalEnvName(),
    false
  );
  if (localEnvsRes.isErr()) {
    localEnvs = {};
  } else {
    localEnvs = localEnvsRes.value;
  }
  const defaultEnvsRes = await envUtil.readEnv(
    inputs.projectPath!,
    environmentNameManager.getDefaultEnvName(),
    false
  );
  if (defaultEnvsRes.isErr()) {
    defaultEnvs = {};
  } else {
    defaultEnvs = defaultEnvsRes.value;
  }

  // Get value by the key
  if (lens instanceof PlaceholderCodeLens) {
    const key = lens.placeholder.replace(/{/g, "").replace(/}/g, "").replace(/\$/g, "");
    let title = "👉";

    const localValue = localEnvs[key];
    title = `${title} ${environmentNameManager.getLocalEnvName()}: ${localValue}`;

    if (lens.documentName.endsWith("manifest.template.local.json")) {
      lens.command = {
        title: title,
        command: "fx-extension.openConfigState",
        arguments: [{ type: "env", from: from, env: environmentNameManager.getLocalEnvName() }],
      };
    } else {
      const defaultValue = defaultEnvs[key];
      title = `${title}, ${environmentNameManager.getDefaultEnvName()}: ${defaultValue}`;

      lens.command = {
        title: title,
        command: "fx-extension.openConfigState",
        arguments: [{ type: "env", from: from }],
      };
    }
    return lens;
  }

  return lens;
}
export class PlaceholderCodeLens extends vscode.CodeLens {
  constructor(
    public readonly placeholder: string,
    range: vscode.Range,
    public readonly documentName: string,
    command?: vscode.Command | undefined
  ) {
    super(range, command);
  }
}

export class SharePointIdCodeLens extends vscode.CodeLens {
  constructor(
    public readonly ids: string,
    range: vscode.Range,
    command?: vscode.Command | undefined
  ) {
    super(range, command);
  }

  static extractSharePointIds(text: string): { [key: string]: string | null } {
    const keys = ["site_id", "web_id", "list_id", "unique_id"];
    const result: { [key: string]: string | null } = {};

    try {
      const jsonObj = JSON.parse(text);

      // Initialize each key with either the found value or null
      keys.forEach((key) => {
        result[key] = jsonObj[key] || null;
      });

      return result;
    } catch (e) {
      // If JSON parsing fails, return all null values
      keys.forEach((key) => {
        result[key] = null;
      });
      return result;
    }
  }
}

/**
 * CodelensProvider
 */
export class CryptoCodeLensProvider implements vscode.CodeLensProvider {
  private userDataRegex: RegExp;
  private localDebugRegex: RegExp;
  private envSecretRegex: RegExp;

  constructor() {
    this.userDataRegex =
      /fx-resource-[a-zA-Z0-9\-]+\.[a-zA-Z0-9\-_]+(?:Secret|Password|VariableParams)=(.*)/g;
    this.localDebugRegex =
      /(?: *|\t*)"(?:clientSecret|SimpleAuthEnvironmentVariableParams|botPassword)": "(crypto_.*)"/g;
    this.envSecretRegex = /#?(?:SECRET_)[a-zA-Z0-9\-_]+=(crypto_.*)/g;
  }

  public provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    if (!commandIsRunning && document.fileName.includes(".env.")) {
      return this.computeCodeLenses(document, this.envSecretRegex);
    } else {
      return [];
    }
  }

  private computeCodeLenses(
    document: vscode.TextDocument,
    secretRegex: RegExp
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const text = document.getText();
    const regex = new RegExp(secretRegex);
    let matches;
    while (!commandIsRunning && (matches = regex.exec(text)) !== null) {
      const match = matches[1];
      const line = document.lineAt(document.positionAt(matches.index).line);
      const indexOf = line.text.indexOf(match);
      const position = new vscode.Position(line.lineNumber, indexOf);
      const range = new vscode.Range(
        position,
        new vscode.Position(line.lineNumber, indexOf + match.length)
      );
      const command = {
        title: "🔑" + localize("teamstoolkit.codeLens.decryptSecret"),
        command: "fx-extension.decryptSecret",
        arguments: [match, range],
      };
      if (range) {
        codeLenses.push(new vscode.CodeLens(range, command));
      }
    }
    return codeLenses;
  }
}

export class ProjectSettingsCodeLensProvider implements vscode.CodeLensProvider {
  public provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];

    const editCmd = {
      title: "⚠️" + localize("teamstoolkit.codeLens.projectSettingsNotice"),
      command: "",
    };
    codeLenses.push(new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), editCmd));
    return codeLenses;
  }
}

export class ManifestTemplateCodeLensProvider implements vscode.CodeLensProvider {
  private schemaRegex = /\$schema/;

  public provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    return this.computeTemplateCodeLensesV3(document);
  }

  public async resolveCodeLens(
    lens: vscode.CodeLens,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens> {
    return resolveEnvironmentVariablesCodeLens(lens, "manifest");
  }

  private computeTemplateCodeLensesV3(document: vscode.TextDocument) {
    const codeLenses: vscode.CodeLens[] = [];

    // Open Schema codelens
    const text = document.getText();
    const regex = new RegExp(this.schemaRegex);
    const matches = regex.exec(text);
    if (matches != null) {
      const match = matches[0];
      const line = document.lineAt(document.positionAt(matches.index).line);
      const indexOf = line.text.indexOf(match);
      const position = new vscode.Position(line.lineNumber, indexOf);
      const range = new vscode.Range(
        position,
        new vscode.Position(line.lineNumber, indexOf + match.length)
      );
      const url = line.text.substring(line.text.indexOf("https"), line.text.length - 2);
      const schemaCommand = {
        title: localize("teamstoolkit.codeLens.openSchema"),
        command: "fx-extension.openSchema",
        arguments: [{ url: url }],
      };
      codeLenses.push(new vscode.CodeLens(range, schemaCommand));
    }

    // Environment variables codelens
    const envCodelenses = this.calculateCodeLens(document, environmentVariableRegex);
    codeLenses.push(...envCodelenses);
    return codeLenses;
  }

  private calculateCodeLens(
    document: vscode.TextDocument,
    regex: RegExp,
    command?: vscode.Command
  ) {
    let matches;
    const codeLenses: vscode.CodeLens[] = [];
    const text = document.getText();
    while ((matches = regex.exec(text)) !== null) {
      const line = document.lineAt(document.positionAt(matches.index).line);
      const indexOf = line.text.indexOf(matches[0]);
      const position = new vscode.Position(line.lineNumber, indexOf);
      const range = document.getWordRangeAtPosition(position, new RegExp(regex));

      if (range) {
        if (command) {
          codeLenses.push(new vscode.CodeLens(range, command));
        } else {
          codeLenses.push(new PlaceholderCodeLens(matches[0], range, document.fileName, undefined));
        }
      }
    }
    return codeLenses;
  }
}

interface PropertyPair {
  name: parser.Node;
  value: parser.Node;
}

export class AadAppTemplateCodeLensProvider implements vscode.CodeLensProvider {
  constructor() {}
  public provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    // V3 supports customize aad manifest
    if (document.fileName.endsWith(MetadataV3.aadManifestFileName)) {
      return this.computeTemplateCodeLenses(document);
    } else {
      return this.computeAadManifestCodeLenses(document);
    }
  }

  private getPropertyValueOfObjectByKey(key: string, node: parser.Node): parser.Node | undefined {
    if (node.type !== "object" || !node.children) {
      return undefined;
    }
    let propertyPair: PropertyPair | undefined;
    for (const child of node.children) {
      propertyPair = this.parseProperty(child);
      if (!propertyPair) {
        continue;
      }
      if (propertyPair.name.value === key) {
        return propertyPair.value;
      }
    }
    return undefined;
  }

  private parseProperty(node: parser.Node): PropertyPair | undefined {
    if (node.type !== "property" || !node.children || node.children.length !== 2) {
      return undefined;
    }
    return { name: node.children[0], value: node.children[1] };
  }

  private computeRequiredResAccessCodeLenses(
    document: vscode.TextDocument,
    jsonNode: parser.Node
  ): vscode.CodeLens[] {
    const codeLenses: vscode.CodeLens[] = [];
    const requiredResourceAccessNode = parser.findNodeAtLocation(jsonNode, [
      "requiredResourceAccess",
    ]);
    const map = getPermissionMap();
    requiredResourceAccessNode?.children?.forEach((requiredResource) => {
      const resIdNode = this.getPropertyValueOfObjectByKey("resourceAppId", requiredResource);
      if (resIdNode) {
        const range = new vscode.Range(
          document.positionAt(resIdNode.offset),
          document.positionAt(resIdNode.offset + resIdNode.length)
        );

        const resIdOrName = resIdNode.value;

        let title = "";
        if (isUUID(resIdNode.value)) {
          title = map[resIdOrName]?.displayName;
        } else {
          title = map[resIdOrName]?.id;
        }

        if (title) {
          codeLenses.push(
            new vscode.CodeLens(range, {
              command: "",
              title: `👉 resourceAppId: "${title}"`,
            })
          );
        }

        const resAccessArrNode = this.getPropertyValueOfObjectByKey(
          "resourceAccess",
          requiredResource
        );

        resAccessArrNode?.children?.forEach((resAccessNode) => {
          const resAccessIdNode = this.getPropertyValueOfObjectByKey("id", resAccessNode);
          if (resAccessIdNode) {
            const type = this.getPropertyValueOfObjectByKey("type", resAccessNode);
            let title = "";
            if (isUUID(resAccessIdNode?.value)) {
              if (type?.value === "Scope") {
                title = map[resIdOrName]?.scopeIds[resAccessIdNode?.value];
              } else if (type?.value === "Role") {
                title = map[resIdOrName]?.roleIds[resAccessIdNode?.value];
              }
            } else {
              if (type?.value === "Scope") {
                title = map[resIdOrName]?.scopes[resAccessIdNode?.value];
              } else if (type?.value === "Role") {
                title = map[resIdOrName]?.roles[resAccessIdNode?.value];
              }
            }
            const range = new vscode.Range(
              document.positionAt(resAccessIdNode.offset),
              document.positionAt(resAccessIdNode.offset + resAccessIdNode.length)
            );

            if (title) {
              codeLenses.push(
                new vscode.CodeLens(range, {
                  command: "",
                  title: `👉 id: "${title}"`,
                })
              );
            }
          }
        });
      }
    });

    return codeLenses;
  }

  private computePreAuthAppCodeLenses(
    document: vscode.TextDocument,
    jsonNode: parser.Node
  ): vscode.CodeLens[] {
    const preAuthAppArrNode =
      parser.findNodeAtLocation(jsonNode, ["api", "preAuthorizedApplications"]) ||
      parser.findNodeAtLocation(jsonNode, ["preAuthorizedApplications"]);

    const map = getAllowedAppMaps();
    const codeLenses: vscode.CodeLens[] = [];

    preAuthAppArrNode?.children?.forEach((preAuthAppNode) => {
      const appIdNode = this.getPropertyValueOfObjectByKey("appId", preAuthAppNode);
      if (appIdNode) {
        const range = new vscode.Range(
          document.positionAt(appIdNode.offset),
          document.positionAt(appIdNode.offset + appIdNode.length)
        );
        const appName = map[appIdNode.value];
        if (appName) {
          codeLenses.push(
            new vscode.CodeLens(range, {
              command: "",
              title: `👉 resource name: "${appName}"`,
            })
          );
        }
      }
    });
    return codeLenses;
  }

  public async resolveCodeLens(
    lens: vscode.CodeLens,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens> {
    return resolveEnvironmentVariablesCodeLens(lens, "aad");
  }

  private calculateCodeLensByRegex(document: vscode.TextDocument, regex: RegExp) {
    let matches;
    const codeLenses: vscode.CodeLens[] = [];
    const text = document.getText();
    while ((matches = regex.exec(text)) !== null) {
      const line = document.lineAt(document.positionAt(matches.index).line);
      const indexOf = line.text.indexOf(matches[0]);
      const position = new vscode.Position(line.lineNumber, indexOf);
      const range = document.getWordRangeAtPosition(position, new RegExp(regex));

      if (range) {
        codeLenses.push(new PlaceholderCodeLens(matches[0], range, document.fileName, undefined));
      }
    }
    return codeLenses;
  }

  private computeStateAndConfigCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const codeLenses = [];

    const stateAndConfigCodelenses = this.calculateCodeLensByRegex(
      document,
      environmentVariableRegex
    );
    codeLenses.push(...stateAndConfigCodelenses);

    return codeLenses;
  }

  private computePreviewCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const codeLenses = [];
    const command = {
      title: "🖼️" + localize("teamstoolkit.codeLens.preview"),
      command: "fx-extension.openPreviewAadFile",
      arguments: [{ fsPath: document.fileName }],
    };
    codeLenses.push(new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), command));
    return codeLenses;
  }

  private computeConvertToNewSchemaCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const codeLenses = [];
    const command = {
      title: "⬆️" + "Convert to New Schema",
      command: "fx-extension.convertAadToNewSchema",
      arguments: [{ fsPath: document.fileName }],
    };
    codeLenses.push(new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), command));
    return codeLenses;
  }

  private computeTemplateCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const text = document.getText();
    const jsonNode: parser.Node | undefined = parser.parseTree(text);
    if (jsonNode) {
      const resAccessCodeLenses = this.computeRequiredResAccessCodeLenses(document, jsonNode);
      const preAuthAppCodeLenses = this.computePreAuthAppCodeLenses(document, jsonNode);
      const previewCodeLenses = this.computePreviewCodeLenses(document);
      let convertToNewSchemaCodeLenses: vscode.CodeLens[] = [];
      const jsonContent = JSON.parse(document.getText());
      if (!jsonContent.displayName) {
        convertToNewSchemaCodeLenses = this.computeConvertToNewSchemaCodeLenses(document);
      }
      const stateAndConfigCodelenses = this.computeStateAndConfigCodeLenses(document);
      return [
        ...resAccessCodeLenses,
        ...preAuthAppCodeLenses,
        ...previewCodeLenses,
        ...convertToNewSchemaCodeLenses,
        ...stateAndConfigCodelenses,
      ];
    }

    return [];
  }

  private computeAadManifestCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const codeLenses: vscode.CodeLens[] = [];
    const updateCmd = {
      title: "🔄" + localize("teamstoolkit.codeLens.deployMicrosoftEntraManifest"),
      command: "fx-extension.updateAadAppManifest",
      arguments: [{ fsPath: document.fileName }, TelemetryTriggerFrom.CodeLens],
    };
    codeLenses.push(new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), updateCmd));

    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      const workspaceFolder = vscode.workspace.workspaceFolders[0];
      const workspacePath: string = workspaceFolder.uri.fsPath;
      const aadTemplateFileExist = fs.pathExistsSync(
        `${workspacePath}/${MetadataV3.aadManifestFileName}`
      );

      if (aadTemplateFileExist) {
        const editTemplateCmd = {
          title:
            "⚠️" + localize("teamstoolkit.codeLens.editDeprecatedMicrosoftEntraManifestTemplate"),
          command: "fx-extension.editAadManifestTemplate",
          arguments: [{ fsPath: document.fileName }, TelemetryTriggerFrom.CodeLens],
        };
        codeLenses.push(new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), editTemplateCmd));
      }
    }

    return codeLenses;
  }
}

export class PermissionsJsonFileCodeLensProvider implements vscode.CodeLensProvider {
  public provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      const workspaceFolder = vscode.workspace.workspaceFolders[0];
      const workspacePath: string = workspaceFolder.uri.fsPath;

      const aadTemplateFileExist = fs.pathExistsSync(
        `${workspacePath}/${TemplateFolderName}/${AppPackageFolderName}/aad.template.json`
      );
      if (aadTemplateFileExist) {
        const editTemplateCmd = {
          title: "⚠️" + localize("teamstoolkit.codeLens.editMicrosoftEntraManifestTemplate"),
          command: "fx-extension.editAadManifestTemplate",
          arguments: [{ fsPath: document.fileName }, TelemetryTriggerFrom.CodeLens],
        };
        codeLenses.push(new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), editTemplateCmd));
        return codeLenses;
      }
    }
  }
}

export class CopilotPluginCodeLensProvider implements vscode.CodeLensProvider {
  private schemaRegex = /composeExtensions/;
  public provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];

    const manifest: TeamsManifestLatest = JSON.parse(document.getText());
    const manifestProperties = manifestUtils.parseCommonProperties(manifest);
    if (!manifestProperties.isApiME) {
      return codeLenses;
    }

    const text = document.getText();
    const regex = new RegExp(this.schemaRegex);
    const matches = regex.exec(text);
    if (matches != null) {
      const match = matches[0];
      const line = document.lineAt(document.positionAt(matches.index).line);
      const indexOf = line.text.indexOf(match);
      const position = new vscode.Position(line.lineNumber, indexOf);
      const range = new vscode.Range(
        position,
        new vscode.Position(line.lineNumber, indexOf + match.length)
      );
      const schemaCommand = {
        title: "➕" + localize("teamstoolkit.codeLens.copilotPluginAddAPI"),
        command: "fx-extension.copilotPluginAddAPI",
        arguments: [{ fsPath: document.fileName }],
      };
      codeLenses.push(new vscode.CodeLens(range, schemaCommand));
      return codeLenses;
    }
  }
}

export class ApiPluginCodeLensProvider implements vscode.CodeLensProvider {
  public async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const inputs = getSystemInputs();

    if (inputs.projectPath) {
      const text = document.getText();
      if (!text.includes("openapi")) {
        return [];
      }

      const manifestFilePath = path.join(
        inputs.projectPath,
        AppPackageFolderName,
        ManifestTemplateFileName
      );
      if (!fs.existsSync(manifestFilePath)) {
        return [];
      }
      const manifestContent = fs.readFileSync(manifestFilePath, "utf-8");
      const manifest = JSON.parse(manifestContent);
      if (
        !(await pluginManifestUtils.isApiPluginFromDeclarativeAgent(manifest, manifestFilePath))
      ) {
        return [];
      }

      const startPosition = new vscode.Position(0, 0); // Position at the top of the document
      const endPosition = document.positionAt(document.getText().indexOf("\n"));
      const range = new vscode.Range(startPosition, endPosition);
      const command = {
        title: "➕" + localize("teamstoolkit.codeLens.copilotPluginAddAPI"),
        command: "fx-extension.copilotPluginAddAPI",
        arguments: [
          { fsPath: document.fileName, isFromApiPlugin: true, manifestPath: manifestFilePath },
        ],
      };
      const codeLens = new vscode.CodeLens(range, command);
      return [codeLens];
    } else {
      return [];
    }
  }
}

export class DeclarativeAgentSensitivityLabelCodeLensProvider implements vscode.CodeLensProvider {
  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const inputs = getSystemInputs();
    if (!inputs.projectPath) {
      return [];
    }
    const manifestFilePath = path.join(
      inputs.projectPath,
      AppPackageFolderName,
      ManifestTemplateFileName
    );
    if (!fs.pathExistsSync(manifestFilePath)) {
      return [];
    }
    const manifestContent = fs.readFileSync(manifestFilePath, "utf-8");
    const manifest = JSON.parse(manifestContent) as TeamsManifestLatest;
    const declarativeAgentFilePath = manifest.copilotAgents?.declarativeAgents?.[0]?.file;
    if (!declarativeAgentFilePath) {
      return [];
    }
    const declarativeAgentFileAbsolutePath = path.resolve(
      inputs.projectPath,
      AppPackageFolderName,
      declarativeAgentFilePath
    );
    // only target the first declarative agent
    if (declarativeAgentFileAbsolutePath !== document.uri.fsPath) {
      return [];
    }
    const Labelregex = /"sensitivity_label"\s*:/;
    const text = document.getText();
    const regex = new RegExp(Labelregex);
    const matches = regex.exec(text);

    const daManifest = await copilotGptManifestUtils.readDeclarativeAgentManifestFile(
      document.uri.fsPath
    );
    let sensitivityLabel: SensitivityLabel | undefined;
    if (daManifest.isOk()) {
      sensitivityLabel = daManifest.value.sensitivity_label;
    }
    if (matches == null || daManifest.isErr() || !sensitivityLabel || !sensitivityLabel.id) {
      const startPosition = new vscode.Position(0, 0);
      const endPosition = document.positionAt(text.indexOf("\n"));
      const range = new vscode.Range(startPosition, endPosition);
      const command = {
        title: localize("teamstoolkit.codeLens.setSensitivityLabel"),
        command: "fx-extension.setSensitivityLabel",
        arguments: [{ declarativeAgentManifestPath: document.uri.fsPath }],
      };
      const codeLens = new vscode.CodeLens(range, command);
      return [codeLens];
    }
    const line = document.lineAt(document.positionAt(matches.index).line);
    const startPosition = new vscode.Position(line.lineNumber, 0);
    const endPosition = new vscode.Position(line.lineNumber, 1);
    const range = new vscode.Range(startPosition, endPosition);

    // check if user has already logged in to the sensitivity label scope
    const loginStatusRes = await tools.tokenProvider?.m365TokenProvider?.getStatus({
      scopes: [ListSensitivityLabelScope],
    });
    // not logged in
    if (
      !loginStatusRes ||
      loginStatusRes.isErr() ||
      loginStatusRes.value.status != signedIn ||
      !loginStatusRes.value.token
    ) {
      const command = {
        title: localize("teamstoolkit.codeLens.setSensitivityLabelNotLoggedIn"),
        command: "fx-extension.m365PreAuth",
        arguments: [{ scopes: [ListSensitivityLabelScope] }],
      };
      const codeLens = new vscode.CodeLens(range, command);
      return [codeLens];
    } else {
      let labelDisplayName: string | undefined;
      // query display name of the current label
      const token = loginStatusRes.value.token;
      const graphClient = new GraphClient(tools.tokenProvider?.m365TokenProvider);
      const result = await graphClient.listSensitivityLabels(token, true);
      if (result.isOk()) {
        for (const label of result.value) {
          if (label.id === sensitivityLabel.id) {
            labelDisplayName = label.displayName;
            break;
          }
        }
      }

      const command = {
        title: util.format(
          localize("teamstoolkit.codeLens.setSensitivityLabelWithDisplayName"),
          labelDisplayName ?? "Unknown"
        ),
        command: "fx-extension.setSensitivityLabel",
        arguments: [{ declarativeAgentManifestPath: document.uri.fsPath }],
      };
      const codeLens = new vscode.CodeLens(range, command);
      return [codeLens];
    }
  }
}

export class TeamsAppYamlCodeLensProvider implements vscode.CodeLensProvider {
  private provisionRegex = /^provision:/m;
  private deployRegex = /^deploy:/m;
  private publishRegex = /^publish:/m;
  private shareRegex = /^share:/m;
  private regexes = [this.provisionRegex, this.deployRegex, this.publishRegex, this.shareRegex];

  public provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    const text = document.getText();
    return _.flatMap(this.regexes, (regex) => {
      const matches = regex.exec(text);
      if (matches && matches.length > 0) {
        const match = matches[0];
        const line = document.lineAt(document.positionAt(matches.index).line);
        const indexOf = line.text.indexOf(match);
        const position = new vscode.Position(line.lineNumber, indexOf);
        const range = new vscode.Range(
          position,
          new vscode.Position(line.lineNumber, indexOf + match.length)
        );
        const schemaCommand = this.getCommand(match);
        return [new vscode.CodeLens(range, schemaCommand)];
      } else {
        return [];
      }
    });
  }

  private getCommand(match: string): vscode.Command | undefined {
    if (match.startsWith("provision")) {
      return {
        title: "🔄" + localize("teamstoolkit.commands.provision.title"),
        command: "fx-extension.provision",
        arguments: [TelemetryTriggerFrom.CodeLens],
      };
    } else if (match.startsWith("deploy")) {
      return {
        title: "🔄" + localize("teamstoolkit.commands.deploy.title"),
        command: "fx-extension.deploy",
        arguments: [TelemetryTriggerFrom.CodeLens],
      };
    } else if (match.startsWith("publish")) {
      return {
        title: "🔄" + localize("teamstoolkit.commands.publish.title"),
        command: "fx-extension.publish",
        arguments: [TelemetryTriggerFrom.CodeLens],
      };
    } else if (match.startsWith("share")) {
      return {
        title: "🔄" + localize("teamstoolkit.commands.share.title"),
        command: "fx-extension.share",
        arguments: [TelemetryTriggerFrom.CodeLens],
      };
    } else {
      return undefined;
    }
  }
}

export class OfficeDevManifestCodeLensProvider implements vscode.CodeLensProvider {
  manifestIdRegex = /<Id>([a-zA-Z0-9-]*)<\/Id>/g;

  public provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const text = document.getText();
    const regex = new RegExp(this.manifestIdRegex);
    let matches;
    while ((matches = regex.exec(text)) !== null) {
      const match = matches[1];
      const line = document.lineAt(document.positionAt(matches.index).line);
      const indexOf = line.text.indexOf(match);
      const position = new vscode.Position(line.lineNumber, indexOf);
      const range = new vscode.Range(
        position,
        new vscode.Position(line.lineNumber, indexOf + match.length)
      );
      const command = {
        title: "🔑" + localize("teamstoolkit.codeLens.generateManifestGUID"),
        command: "fx-extension.generateManifestGUID",
        arguments: [match, range],
      };
      if (range) {
        codeLenses.push(new vscode.CodeLens(range, command));
      }
    }
    return codeLenses;
  }
}

export class OneDriveSharePointCodeLensProvider implements vscode.CodeLensProvider {
  private sharePointIdsRegex: RegExp;

  constructor() {
    // This regex matches JSON objects containing SharePoint IDs with the following pattern:
    // - Matches whitespace and opening curly brace: \s*{\s*
    // - Matches any of these property names: "site_id", "web_id", "list_id", "unique_id"
    // - [\s\S]*? matches any characters (including newlines) non-greedily until closing brace
    // - Matches closing curly brace: }
    // - /g flag for global matching (find all occurrences)
    this.sharePointIdsRegex = /{\s*(?:"site_id"|"web_id"|"list_id"|"unique_id")[\s\S]*?}/g;
  }

  public provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    const inputs = getSystemInputs();

    if (inputs.projectPath) {
      const manifestFilePath = path.join(
        inputs.projectPath,
        AppPackageFolderName,
        ManifestTemplateFileName
      );
      if (!fs.existsSync(manifestFilePath)) {
        return [];
      }
      const manifestContent = fs.readFileSync(manifestFilePath, "utf-8");
      const manifest = JSON.parse(manifestContent);
      const manifestProperties = manifestUtils.parseCommonProperties(manifest);
      if (!manifestProperties.capabilities.includes("copilotGpt")) {
        return [];
      }

      let agentFileName: string | undefined;
      if ((manifest as TeamsManifestLatest).copilotAgents?.declarativeAgents) {
        const agents = (manifest as TeamsManifestLatest).copilotAgents?.declarativeAgents;
        if (agents && agents.length > 0) {
          agentFileName = agents[0].file;
        }
      }
      if (!commandIsRunning && agentFileName && document.fileName.includes(agentFileName)) {
        return this.computeCodeLenses(document);
      }
    }
    return [];
  }

  public async resolveCodeLens(
    lens: vscode.CodeLens,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens> {
    if (lens instanceof SharePointIdCodeLens) {
      const ids = SharePointIdCodeLens.extractSharePointIds(lens.ids);

      let title = `👉`;
      if (ids.site_id) {
        const uniqueId = ids.unique_id ?? undefined;
        const details = await core.getODSPItemDetails(ids.site_id, uniqueId);
        if (details.isOk()) {
          title = `${title} ${details.value.name}`;
          lens.command = {
            title: title,
            command: "fx-extension.openOneDriveSharePointUrl",
            arguments: [details.value.webUrl],
          };
        } else {
          lens.command = {
            title: `${title} ${details.error.message}`,
            command: "",
          };
        }
      } else {
        lens.command = {
          title: `${title} Missing required SharePoint IDs`,
          command: "",
        };
      }
    }
    return lens;
  }

  private computeCodeLenses(
    document: vscode.TextDocument
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const text = document.getText();
    const regex = new RegExp(this.sharePointIdsRegex);
    let matches;
    while ((matches = regex.exec(text)) !== null) {
      const match = matches[0];
      const line = document.lineAt(document.positionAt(matches.index).line);
      const indexOf = line.text.indexOf("{");
      const position = new vscode.Position(line.lineNumber, indexOf);
      const range = new vscode.Range(position, new vscode.Position(line.lineNumber, indexOf + 1));
      if (range) {
        codeLenses.push(new SharePointIdCodeLens(match, range, undefined));
      }
    }
    return codeLenses;
  }
}

export class WorkspaceMCPConfigCodeLensProvider implements vscode.CodeLensProvider {
  public provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];
    const text = document.getText();
    let json: any;
    try {
      // Use jsonc-parser to handle JSON with comments
      const jsonNode = parser.parseTree(text);
      if (!jsonNode) {
        return codeLenses;
      }
      json = parser.getNodeValue(jsonNode);
    } catch (e) {
      console.error("Error parsing JSON in CodeLensProvider (MCP Fetcher):", e);
      return codeLenses;
    }
    if (!json.servers || typeof json.servers !== "object") {
      return codeLenses;
    }
    // For each server, add a codelens at the line where the server key appears
    for (const [serverName, serverConfig] of Object.entries(json.servers)) {
      const start = text.indexOf(`"${serverName}"`);
      if (start !== -1) {
        const pos = document.positionAt(start);
        const range = new vscode.Range(
          pos.line,
          pos.character,
          pos.line,
          pos.character + serverName.length + 2
        );
        const command: vscode.Command = {
          title: `⚡ ATK: Fetch action from MCP`,
          command: "fx-extension.updateActionWithMCP",
          arguments: [{ serverName, serverConfig }, TelemetryTriggerFrom.CodeLens],
        };
        codeLenses.push(new vscode.CodeLens(range, command));
      }
    }
    return codeLenses;
  }
}
