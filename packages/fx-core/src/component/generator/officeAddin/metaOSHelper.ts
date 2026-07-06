// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  APIPluginManifestLatestSchemaUrl,
  APIPluginManifestLatestVersion,
  AppManifestUtils,
  AppPackageFolderName,
  DeclarativeAgentManifestV1D4,
  ManifestTemplateFileName,
  TeamsManifestVDevPreview,
} from "@microsoft/teamsfx-api";
import fse from "fs-extra";
import path from "path";
import { getUuid } from "../../../common/stringUtils";
import { dotenvUtil } from "../../utils/envUtil";

const NOT_COPY_FILES = [
  "README.md",
  "teamsapp.yml",
  "m365agents.yml",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
];
const NOT_COPY_FOLDERS = ["node_modules", "env"];

const DEFAULT_MANIFEST_ID = "${{TEAMS_APP_ID}}";
const DEFAULT_DA_ID = "declarativeAgentAlc";

const ENV_FOLDER = "env";
const ENV_FILE_NAME = ".env.dev";

const PKG_JSON_FILE_NAME = "package.json";

const DEFAULT_CMD_NAME_W = "addfooter";
const DEFAULT_CMD_NAME_X = "fillcolor";
const DEFAULT_CMD_NAME_P = "addtexttoslide";
const DEFAULT_CMD_FILE_NAME = "commands.js";

const DEFAULT_DA_FILENAME = "declarativeAgent";
const DEFAULT_ACTION_FILENAME = "alchemy-plugin";
const FILE_EXTENSION = ".json";

export class MetaOSHelper {
  static copyFilterFn(filePath: string): boolean {
    for (const item of NOT_COPY_FILES) {
      if (filePath.endsWith(item)) {
        return false;
      }
    }

    for (const item of NOT_COPY_FOLDERS) {
      if (filePath.includes(item)) {
        return false;
      }
    }

    return true;
  }

  static async copyExistMetaOSProject(sourceFolder: string, targetFolder: string): Promise<void> {
    await fse.copy(sourceFolder, targetFolder, {
      filter: MetaOSHelper.copyFilterFn,
    });
  }

  static getNameWithSuffix(name: string, suffix: number): string {
    return suffix ? `${name}${suffix}` : name;
  }

  static ensureFunctionNameIsNotExist(jsonObj: any[], key: string, functionName: string): string {
    let suffix = 0;
    let nameConflict = false;

    do {
      nameConflict = false;
      for (const obj of jsonObj) {
        if (obj?.[key] === MetaOSHelper.getNameWithSuffix(functionName, suffix)) {
          suffix++;
          nameConflict = true;
          break;
        }
      }
    } while (nameConflict);

    return MetaOSHelper.getNameWithSuffix(functionName, suffix);
  }

  static ensureFileNameIsNotExist(filePath: string, filename: string, ext: string): string {
    let suffix = 0;

    while (
      fse.existsSync(path.join(filePath, MetaOSHelper.getNameWithSuffix(filename, suffix), ext))
    ) {
      suffix++;
    }

    return `${MetaOSHelper.getNameWithSuffix(filename, suffix)}${ext}`;
  }

  static async unifyProjectID(projectFolder: string): Promise<void> {
    const manifestPath = path.join(projectFolder, AppPackageFolderName, ManifestTemplateFileName);
    const envFilePath = path.join(projectFolder, ENV_FOLDER, ENV_FILE_NAME);

    const manifest = (await AppManifestUtils.readTeamsManifest(
      manifestPath
    )) as TeamsManifestVDevPreview.TeamsManifestVDevPreview;

    const newUUID = getUuid();
    manifest.id = newUUID;

    // Check if env file exists before trying to read it
    if (await fse.pathExists(envFilePath)) {
      const envVars = dotenvUtil.deserialize(await fse.readFile(envFilePath, { encoding: "utf8" }));
      envVars.obj.TEAMS_APP_ID = newUUID;
      await fse.writeFile(envFilePath, dotenvUtil.serialize(envVars), { encoding: "utf8" });
    } else {
      // If env file doesn't exist, create it with the new UUID
      await fse.ensureDir(path.join(projectFolder, ENV_FOLDER));
      const envContent = `TEAMS_APP_ID=${newUUID}\n`;
      await fse.writeFile(envFilePath, envContent, { encoding: "utf8" });
    }

    await AppManifestUtils.writeTeamsManifest(manifestPath, manifest);
  }

  static async extendToDA(projectFolder: string, appName: string): Promise<void> {
    // Ensure schema files name
    const DAFilename = MetaOSHelper.ensureFileNameIsNotExist(
      projectFolder,
      DEFAULT_DA_FILENAME,
      FILE_EXTENSION
    );
    const ActionFilename = MetaOSHelper.ensureFileNameIsNotExist(
      projectFolder,
      DEFAULT_ACTION_FILENAME,
      FILE_EXTENSION
    );

    // Modify manifest.json
    const commandNames = await MetaOSHelper.modifyManifest(projectFolder, DAFilename);

    // generate DA files
    await MetaOSHelper.generateDAFile(projectFolder, DAFilename, ActionFilename, appName);
    await MetaOSHelper.generateActionFile(projectFolder, ActionFilename, appName, commandNames);

    // Add functions to command.ts
    await MetaOSHelper.addCodeToCommands(projectFolder, commandNames);

    // Upgrade office-addin-debugging
    await MetaOSHelper.upgradeOfficeAddInDebugging(projectFolder);
  }

  static async modifyManifest(
    projectFolder: string,
    DAFilename: string
  ): Promise<{ w: string; x: string; p: string }> {
    let commandNameW = DEFAULT_CMD_NAME_W;
    let commandNameX = DEFAULT_CMD_NAME_X;
    let commandNameP = DEFAULT_CMD_NAME_P;

    const manifestPath = path.join(projectFolder, AppPackageFolderName, ManifestTemplateFileName);
    const manifest = (await AppManifestUtils.readTeamsManifest(
      manifestPath
    )) as TeamsManifestVDevPreview.TeamsManifestVDevPreview;

    // Update manifest GUID
    manifest.id = DEFAULT_MANIFEST_ID;

    // Add the DA definition
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: DEFAULT_DA_ID,
          file: DAFilename,
        },
      ],
    };

    // Add the command to command's runtime
    const runtimes = manifest.extensions?.[0]?.runtimes;
    if (runtimes) {
      let added = false;
      for (const runtime of runtimes) {
        if (runtime?.code?.script?.includes(DEFAULT_CMD_FILE_NAME)) {
          if (runtime.actions) {
            commandNameW = MetaOSHelper.ensureFunctionNameIsNotExist(
              runtime.actions,
              "id",
              commandNameW
            );
            commandNameX = MetaOSHelper.ensureFunctionNameIsNotExist(
              runtime.actions,
              "id",
              commandNameX
            );
            commandNameP = MetaOSHelper.ensureFunctionNameIsNotExist(
              runtime.actions,
              "id",
              commandNameP
            );

            runtime.actions.push(
              {
                id: commandNameW,
                type: "executeDataFunction",
              },
              {
                id: commandNameX,
                type: "executeDataFunction",
              },
              {
                id: commandNameP,
                type: "executeDataFunction",
              }
            );
          } else {
            runtime.actions = [
              {
                id: commandNameW,
                type: "executeDataFunction",
              },
              {
                id: commandNameX,
                type: "executeDataFunction",
              },
              {
                id: commandNameP,
                type: "executeDataFunction",
              },
            ];
          }
          added = true;
          break;
        }
      }
      if (!added) {
        throw new Error("No command's runtime found in manifest.extensions!");
      }
    } else {
      throw new Error("No runtimes found in manifest.extensions!");
    }

    // save file and return
    await AppManifestUtils.writeTeamsManifest(manifestPath, manifest);

    return { w: commandNameW, x: commandNameX, p: commandNameP };
  }

  static async generateDAFile(
    projectFolder: string,
    DAFilename: string,
    ActionFilename: string,
    appName: string
  ): Promise<void> {
    const fileJson: DeclarativeAgentManifestV1D4.DeclarativeAgentManifestV1D4 = {
      $schema:
        "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.4/schema.json",
      version: "v1.4",
      name: `Add-in Skill + Agent for ${appName}`,
      description:
        "You are an agent for working with add-in. You can work with any cells, not only well formatted table.",
      instructions:
        "You are an agent for working with add-in. You can work with any cells, not only well formatted table.",
      conversation_starters: [
        {
          title: "Change cell color (for excel)",
          text: "Change the cell below A2 to the color of grass. Tell me how long it took in seconds.",
        },
        {
          title: "Add footer (for word)",
          text: "Add a footer with message 'Hello Agent!'. Tell me how long it took in seconds.",
        },
        {
          title: "Add text to slide (for powerpoint)",
          text: "Please add text 'Hello PPT!' to the slide. Tell me how long it took in seconds.",
        },
      ],
      actions: [
        {
          id: "alchemyPlugin",
          file: ActionFilename,
        },
      ],
    };

    await AppManifestUtils.writeDeclarativeAgentManifest(
      path.join(projectFolder, AppPackageFolderName, DAFilename),
      fileJson
    );
  }

  static async generateActionFile(
    projectFolder: string,
    ActionFilename: string,
    appName: string,
    commandName: { w: string; x: string; p: string }
  ): Promise<void> {
    // TODO: as any for temporary, since the runtime type `localPlugin` is not type defined yet
    const fileJson: any = {
      $schema: APIPluginManifestLatestSchemaUrl,
      schema_version: APIPluginManifestLatestVersion,
      name_for_human: `Add-in Skill + Agent for ${appName}`,
      description_for_human: "Get answer for user's question related to Microsoft 365 products",
      namespace: "AddInFunctions",
      functions: [
        {
          name: `${commandName.w}`,
          description:
            "Action addfooter: take in arg a JSON object, with a footer message in the field 'Footer'.",
          parameters: {
            type: "object",
            properties: {
              Footer: {
                type: "string",
                description: "example message to be added to footer",
                default: "Declarative Agent Footer",
              },
            },
            required: ["Footer"],
          },
          states: {
            reasoning: {
              description:
                "\n# `addfooter(Footer: str = 'example message to be added to footer') -> str`  Action addfooter: take in arg a JSON object with a string field 'Footer', a footer message.",
              instructions:
                "\n- Decide whether to invoke `addfooter(Footer: str = 'example message to be added to footer')`:\n - Check the last user message in the `conversation_memory` and the tool invocation history in the `turn_memory`:\n    - Based on the `result` from `turn_memory`, do I need to return answers, Action addfooter: take in arg a JSON object, with a footer message in the field 'Footer'.",
            },
            responding: {
              description: "",
              instructions: "reply",
            },
          },
        },
        {
          name: `${commandName.x}`,
          description:
            "Action fillcolor: take in arg a JSON object, a cell location and a color in hex. Cell location is a single cell.",
          parameters: {
            type: "object",
            properties: {
              Cell: {
                type: "string",
                description: "example cell location",
                default: "B7",
              },
              Color: {
                type: "string",
                description: "example color in hex",
                default: "#30d5c8",
              },
            },
            required: ["Cell", "Color"],
          },
          states: {
            reasoning: {
              description:
                "\n# `fillcolor(Cell: str = 'B7', Color: str = '#30d5c8') -> str`  Action fillcolor: take in arg a JSON object, a cell location and a color in hex. Cell location is a single cell.",
              instructions:
                "\n- Decide whether to invoke `fillcolor(Cell: str = 'B7', Color: str = '#30d5c8')`:\n - Check the last user message in the `conversation_memory` and the tool invocation history in the `turn_memory`:\n    - Based on the `result` from `turn_memory`, do I need to return answers, Action fillcolor: take in arg a JSON object, a cell location and a color in hex. Cell location is a single cell.",
            },
            responding: {
              description: "",
              instructions: "reply",
            },
          },
        },
        {
          name: `${commandName.p}`,
          description:
            "Action addtexttoslide: take in arg a JSON object, a text to be added to a slide.",
          parameters: {
            type: "object",
            properties: {
              Text: {
                type: "string",
                description: "example text to be added to a slide",
                default: "hello declarative agent",
              },
            },
            required: ["Text"],
          },
          states: {
            reasoning: {
              description:
                "\n# `addtexttoslide(Text: str = 'hello') -> str` Action addtexttoslide: take in arg a JSON object, a text to be added to a slide.",
              instructions:
                "\n- Decide whether to invoke `addtexttoslide(Text: str = 'hello')`:\n - Check the last user message in the `conversation_memory` and the tool invocation history in the `turn_memory`:\n    - Based on the `result` from `turn_memory`, do I need to return answers, Action addtexttoslide: take in arg a JSON object, a text to be added to a slide.",
            },
            responding: {
              description: "",
              instructions: "reply",
            },
          },
        },
      ],
      runtimes: [
        {
          type: "LocalPlugin",
          spec: {
            local_endpoint: "Microsoft.Office.Addin",
          },
          run_for_functions: [`${commandName.w}`, `${commandName.x}`, `${commandName.p}`],
        },
      ],
    };

    const filePath = path.join(projectFolder, AppPackageFolderName, ActionFilename);
    // directly write JSON to avoid type check for not type defined runtime.type `LocalPlugin`
    await fse.writeJSON(filePath, fileJson, { spaces: 2 });
  }

  static async addCodeToCommands(
    projectFolder: string,
    commandName: { w: string; x: string; p: string }
  ): Promise<void> {
    if (!fse.existsSync(path.join(projectFolder, "src", "commands", "commands.ts"))) {
      throw new Error("command.ts file doesn't exist!");
    }

    const codeToAppend = `
/* global Office */
/* global Word, Excel, PowerPoint, performance, console */

async function addFooter(message) {
  await Word.run(async (context) => {
    context.document.sections
      .getFirst()
      .getFooter(Word.HeaderFooterType.primary)
      .insertParagraph(\`From Agent: \${message}\`, "End");

    await context.sync();
  });
}

async function fillColor(cell, color) {
  await Excel.run(async (context) => {
    context.workbook.worksheets.getActiveWorksheet().getRange(cell).format.fill.color = color;
    await context.sync();
  });
}

async function addTextToSlide(text) {
  await PowerPoint.run(async (context) => {
    context.presentation.slides.getItemAt(0).shapes.addTextBox(text, {
      left: Math.random() * 200,
      top: Math.random() * 200,
      height: 150,
      width: 150,
    });
    await context.sync();
  });
}

Office.onReady((info) => {
  if (info.host === Office.HostType.Word) {
    Office.actions.associate("${commandName.w}", async (message) => {
      const start = performance.now();
      const { Footer: footer } = JSON.parse(message);
      await addFooter(footer);
      const duration = performance.now() - start;
      const result = \`Demo add-in: Footer added! completed in \${duration.toFixed(0)} ms.\`;
      console.log(\`Returning result: "\${result}"\`);
      return result;
    });
  } else if (info.host === Office.HostType.Excel) {
    Office.actions.associate("${commandName.x}", async (message) => {
      const start = performance.now();
      const { Cell: cell, Color: color } = JSON.parse(message);
      await fillColor(cell, color);
      const duration = performance.now() - start;
      const result = \`Demo add-in: Action completed! completed in \${duration.toFixed(0)} ms.\`;
      console.log(\`Returning result: "\${result}"\`);
      return result;
    });
  } else if (info.host === Office.HostType.PowerPoint) {
    Office.actions.associate("${commandName.p}", async (message) => {
      const start = performance.now();
      const { Text: text } = JSON.parse(message);
      await addTextToSlide(text);
      const duration = performance.now() - start;
      const result = \`Demo add-in: text added to slide! completed in \${duration.toFixed(0)} ms.\`;
      console.log(\`Returning result: "\${result}"\`);
      return result;
    });
  }
});
`;

    await fse.appendFile(path.join(projectFolder, "src", "commands", "commands.ts"), codeToAppend);
  }

  static async upgradeOfficeAddInDebugging(projectFolder: string): Promise<void> {
    const pkgJsonPath = path.join(projectFolder, PKG_JSON_FILE_NAME);
    if (fse.existsSync(pkgJsonPath)) {
      const pkgJson = await fse.readJSON(pkgJsonPath);
      pkgJson["devDependencies"]["office-addin-debugging"] = "6.0.6";
      await fse.writeJSON(pkgJsonPath, pkgJson, { spaces: 2 });
    } else {
      throw new Error(`package.json file doesn't exist!`);
    }
  }
}
