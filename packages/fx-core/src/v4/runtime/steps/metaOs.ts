// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { randomUUID } from "crypto";
import { FxError, SystemError, UserError } from "@microsoft/teamsfx-api";
import * as fs from "fs-extra";
import * as path from "path";
import { Result, err, ok } from "neverthrow";
import { RegisteredStep, StepContext, StepParams } from "../../pipeline/runScaffoldPipeline";

/** MetaOS post-render steps. */

const SOURCE = "Scaffold";

/** Engine step name `metaos/unify-project-id`. */
export const STEP_UNIFY_PROJECT_ID = "metaos/unify-project-id";
/** Engine step name `metaos/upgrade-existing-project`. */
export const STEP_UPGRADE_EXISTING_PROJECT = "metaos/upgrade-existing-project";

const APP_PACKAGE_FOLDER = "appPackage";
const MANIFEST_PATH = "appPackage/manifest.json";
const ENV_PATH = "env/.env.dev";
const PACKAGE_JSON_PATH = "package.json";
const COMMANDS_PATH = "src/commands/commands.ts";
const DEFAULT_MANIFEST_ID = "${{TEAMS_APP_ID}}";
const DEFAULT_DA_ID = "declarativeAgentAlc";
const DEFAULT_COMMAND_FILE_NAME = "commands.js";
const OFFICE_ADDIN_DEBUGGING_VERSION = "6.0.6";

const EXCLUDED_FILES = new Set([
  "README.md",
  "teamsapp.yml",
  "m365agents.yml",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);
const EXCLUDED_FOLDERS = new Set(["node_modules", "env"]);

function systemError(name: string, message: string): SystemError {
  return new SystemError({ source: SOURCE, name, message });
}

function stringParam(params: StepParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

function nestedRecord(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function parseJsonObject(
  json: Buffer,
  errorName: string,
  filePath: string
): Result<Record<string, unknown>, FxError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json.toString("utf8"));
  } catch {
    return err(systemError(errorName, `'${filePath}' is not valid JSON.`));
  }
  if (!isRecord(parsed)) {
    return err(systemError(errorName, `'${filePath}' must be a JSON object.`));
  }
  return ok(parsed);
}

function readRequired(
  ctx: StepContext,
  filePath: string,
  errorName: string
): Result<Buffer, FxError> {
  const current = ctx.read(filePath);
  if (current === undefined) {
    return err(systemError(errorName, `Cannot read '${filePath}'.`));
  }
  return ok(current);
}

function userError(name: string, message: string): UserError {
  return new UserError({ source: SOURCE, name, message });
}

function withTeamsAppId(envText: string, appId: string): string {
  const lines = envText.split(/\r?\n/);
  let found = false;
  const updated = lines.map((line) => {
    if (line.startsWith("TEAMS_APP_ID=")) {
      found = true;
      return "TEAMS_APP_ID=" + appId;
    }
    return line;
  });
  if (!found) {
    updated.push("TEAMS_APP_ID=" + appId);
  }
  return updated.join("\n").replace(/\n*$/, "\n");
}

function writeJson(ctx: StepContext, filePath: string, value: unknown): void {
  ctx.write(filePath, Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8"));
}

function readRequiredJsonObject(
  ctx: StepContext,
  filePath: string,
  missingErrorName: string,
  invalidErrorName: string
): Result<Record<string, unknown>, FxError> {
  const raw = readRequired(ctx, filePath, missingErrorName);
  if (raw.isErr()) {
    return err(raw.error);
  }
  return parseJsonObject(raw.value, invalidErrorName, filePath);
}

function unifyProjectId(
  ctx: StepContext,
  manifestPath: string,
  envPath: string
): Result<void, FxError> {
  const manifest = readRequiredJsonObject(
    ctx,
    manifestPath,
    "MetaOsManifestMissing",
    "MetaOsManifestInvalid"
  );
  if (manifest.isErr()) {
    return err(manifest.error);
  }

  const appId = randomUUID();
  manifest.value.id = appId;
  writeJson(ctx, manifestPath, manifest.value);
  const envRaw = ctx.read(envPath);
  const envText = envRaw === undefined ? "" : envRaw.toString("utf8");
  ctx.write(envPath, Buffer.from(withTeamsAppId(envText, appId), "utf8"));
  return ok(undefined);
}

function isExcludedRelativePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (segments.some((segment) => EXCLUDED_FOLDERS.has(segment))) {
    return true;
  }
  return EXCLUDED_FILES.has(segments[segments.length - 1] ?? normalized);
}

function copySourceFiles(sourceFolder: string, ctx: StepContext): Result<void, FxError> {
  const root = path.resolve(sourceFolder);
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(root, fullPath).replace(/\\/g, "/");
      if (isExcludedRelativePath(relativePath)) {
        continue;
      }
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      ctx.write(relativePath, fs.readFileSync(fullPath));
    }
  };

  try {
    walk(root);
    return ok(undefined);
  } catch {
    return err(
      userError("MetaOsSourceProjectInvalid", "The Office Add-in project folder could not be read.")
    );
  }
}

function uniqueFileName(ctx: StepContext, baseName: string, extension: string): string {
  let suffix = 0;
  while (true) {
    const candidate = suffix === 0 ? `${baseName}${extension}` : `${baseName}${suffix}${extension}`;
    if (ctx.read(`${APP_PACKAGE_FOLDER}/${candidate}`) === undefined) {
      return candidate;
    }
    suffix++;
  }
}

function uniqueActionName(
  actions: Record<string, unknown>[],
  key: string,
  baseName: string
): string {
  let suffix = 0;
  while (true) {
    const candidate = suffix === 0 ? baseName : `${baseName}${suffix}`;
    const exists = actions.some((action) => action[key] === candidate);
    if (!exists) {
      return candidate;
    }
    suffix++;
  }
}

interface CommandNames {
  word: string;
  excel: string;
  powerpoint: string;
}

function updateManifestForDa(ctx: StepContext, daFilename: string): Result<CommandNames, FxError> {
  const manifest = readRequiredJsonObject(
    ctx,
    MANIFEST_PATH,
    "MetaOsManifestMissing",
    "MetaOsManifestInvalid"
  );
  if (manifest.isErr()) {
    return err(manifest.error);
  }

  manifest.value.id = DEFAULT_MANIFEST_ID;
  manifest.value.copilotAgents = {
    declarativeAgents: [{ id: DEFAULT_DA_ID, file: daFilename }],
  };

  const extensions = manifest.value.extensions;
  if (!isRecordArray(extensions)) {
    return err(systemError("MetaOsManifestShape", "No runtimes found in manifest.extensions."));
  }

  for (const extension of extensions) {
    const runtimes = extension.runtimes;
    if (!isRecordArray(runtimes)) {
      continue;
    }
    for (const runtime of runtimes) {
      const script = nestedRecord(runtime, "code")?.script;
      if (typeof script !== "string" || !script.includes(DEFAULT_COMMAND_FILE_NAME)) {
        continue;
      }
      const existingActions = runtime.actions;
      const actions = isRecordArray(existingActions) ? existingActions : [];
      const commandNames = {
        word: uniqueActionName(actions, "id", "addfooter"),
        excel: uniqueActionName(actions, "id", "fillcolor"),
        powerpoint: uniqueActionName(actions, "id", "addtexttoslide"),
      };
      actions.push(
        { id: commandNames.word, type: "executeDataFunction" },
        { id: commandNames.excel, type: "executeDataFunction" },
        { id: commandNames.powerpoint, type: "executeDataFunction" }
      );
      runtime.actions = actions;
      writeJson(ctx, MANIFEST_PATH, manifest.value);
      return ok(commandNames);
    }
  }

  return err(
    systemError("MetaOsCommandsRuntimeMissing", "No command runtime found in manifest.extensions.")
  );
}

function daManifest(appName: string, actionFilename: string): Record<string, unknown> {
  return {
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
    actions: [{ id: "alchemyPlugin", file: actionFilename }],
  };
}

function functionDefinition(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[]
): Record<string, unknown> {
  return {
    name,
    description,
    parameters: { type: "object", properties, required },
    states: {
      reasoning: { description: "", instructions: "" },
      responding: { description: "", instructions: "reply" },
    },
  };
}

function actionManifest(appName: string, commandNames: CommandNames): Record<string, unknown> {
  return {
    $schema: "https://developer.microsoft.com/json-schemas/copilot/plugin/v2.3/schema.json",
    schema_version: "v2.3",
    name_for_human: `Add-in Skill + Agent for ${appName}`,
    description_for_human: "Get answer for user's question related to Microsoft 365 products",
    namespace: "AddInFunctions",
    functions: [
      functionDefinition(
        commandNames.word,
        "Action addfooter: take in arg a JSON object, with a footer message in the field 'Footer'.",
        {
          Footer: {
            type: "string",
            description: "example message to be added to footer",
            default: "Declarative Agent Footer",
          },
        },
        ["Footer"]
      ),
      functionDefinition(
        commandNames.excel,
        "Action fillcolor: take in arg a JSON object, a cell location and a color in hex. Cell location is a single cell.",
        {
          Cell: { type: "string", description: "example cell location", default: "B7" },
          Color: { type: "string", description: "example color in hex", default: "#30d5c8" },
        },
        ["Cell", "Color"]
      ),
      functionDefinition(
        commandNames.powerpoint,
        "Action addtexttoslide: take in arg a JSON object, a text to be added to a slide.",
        {
          Text: {
            type: "string",
            description: "example text to be added to a slide",
            default: "hello declarative agent",
          },
        },
        ["Text"]
      ),
    ],
    runtimes: [
      {
        type: "LocalPlugin",
        spec: { local_endpoint: "Microsoft.Office.Addin" },
        run_for_functions: [commandNames.word, commandNames.excel, commandNames.powerpoint],
      },
    ],
  };
}

function commandHandlerCode(commandNames: CommandNames): string {
  return `
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
    Office.actions.associate("${commandNames.word}", async (message) => {
      const start = performance.now();
      const { Footer: footer } = JSON.parse(message);
      await addFooter(footer);
      const duration = performance.now() - start;
      const result = \`Demo add-in: Footer added! completed in \${duration.toFixed(0)} ms.\`;
      console.log(\`Returning result: "\${result}"\`);
      return result;
    });
  } else if (info.host === Office.HostType.Excel) {
    Office.actions.associate("${commandNames.excel}", async (message) => {
      const start = performance.now();
      const { Cell: cell, Color: color } = JSON.parse(message);
      await fillColor(cell, color);
      const duration = performance.now() - start;
      const result = \`Demo add-in: Action completed! completed in \${duration.toFixed(0)} ms.\`;
      console.log(\`Returning result: "\${result}"\`);
      return result;
    });
  } else if (info.host === Office.HostType.PowerPoint) {
    Office.actions.associate("${commandNames.powerpoint}", async (message) => {
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
}

function appendCommandHandlers(
  ctx: StepContext,
  commandNames: CommandNames
): Result<void, FxError> {
  const current = readRequired(ctx, COMMANDS_PATH, "MetaOsCommandsMissing");
  if (current.isErr()) {
    return err(current.error);
  }
  ctx.write(
    COMMANDS_PATH,
    Buffer.from(current.value.toString("utf8") + commandHandlerCode(commandNames), "utf8")
  );
  return ok(undefined);
}

function upgradeOfficeAddinDebugging(ctx: StepContext): Result<void, FxError> {
  const packageJson = readRequiredJsonObject(
    ctx,
    PACKAGE_JSON_PATH,
    "MetaOsPackageJsonMissing",
    "MetaOsPackageJsonInvalid"
  );
  if (packageJson.isErr()) {
    return err(packageJson.error);
  }
  let devDependencies = nestedRecord(packageJson.value, "devDependencies");
  if (devDependencies === undefined) {
    devDependencies = {};
    packageJson.value.devDependencies = devDependencies;
  }
  devDependencies["office-addin-debugging"] = OFFICE_ADDIN_DEBUGGING_VERSION;
  writeJson(ctx, PACKAGE_JSON_PATH, packageJson.value);
  return ok(undefined);
}

function extendToDeclarativeAgent(ctx: StepContext, appName: string): Result<void, FxError> {
  const daFilename = uniqueFileName(ctx, "declarativeAgent", ".json");
  const actionFilename = uniqueFileName(ctx, "alchemy-plugin", ".json");
  const commandNames = updateManifestForDa(ctx, daFilename);
  if (commandNames.isErr()) {
    return err(commandNames.error);
  }

  writeJson(ctx, `${APP_PACKAGE_FOLDER}/${daFilename}`, daManifest(appName, actionFilename));
  writeJson(
    ctx,
    `${APP_PACKAGE_FOLDER}/${actionFilename}`,
    actionManifest(appName, commandNames.value)
  );

  const appended = appendCommandHandlers(ctx, commandNames.value);
  if (appended.isErr()) {
    return err(appended.error);
  }
  return upgradeOfficeAddinDebugging(ctx);
}

/** Registered step for mirroring v3 MetaOSHelper.unifyProjectID. */
export const metaOsUnifyProjectId: RegisteredStep = {
  validateParams(resolved: StepParams): string | undefined {
    if (stringParam(resolved, "manifestPath") === undefined) {
      return "missing string parameter 'manifestPath'";
    }
    if (stringParam(resolved, "envPath") === undefined) {
      return "missing string parameter 'envPath'";
    }
    return undefined;
  },
  apply(resolved: StepParams, ctx: StepContext): Result<void, FxError> {
    const manifestPath = stringParam(resolved, "manifestPath");
    const envPath = stringParam(resolved, "envPath");
    if (manifestPath === undefined || envPath === undefined) {
      return err(systemError("MetaOsUnifyParams", "resolved parameters are not all strings"));
    }

    return unifyProjectId(ctx, manifestPath, envPath);
  },
};

/** Registered step for mirroring v3 MetaOSHelper copy + extend + unify for upgrade. */
export const metaOsUpgradeExistingProject: RegisteredStep = {
  validateParams(resolved: StepParams): string | undefined {
    if (stringParam(resolved, "sourceFolder") === undefined) {
      return "missing string parameter 'sourceFolder'";
    }
    if (stringParam(resolved, "appName") === undefined) {
      return "missing string parameter 'appName'";
    }
    return undefined;
  },
  apply(resolved: StepParams, ctx: StepContext): Result<void, FxError> {
    const sourceFolder = stringParam(resolved, "sourceFolder");
    const appName = stringParam(resolved, "appName");
    if (sourceFolder === undefined || appName === undefined) {
      return err(systemError("MetaOsUpgradeParams", "resolved parameters are not all strings"));
    }

    const copied = copySourceFiles(sourceFolder, ctx);
    if (copied.isErr()) {
      return err(copied.error);
    }
    const extended = extendToDeclarativeAgent(ctx, appName);
    if (extended.isErr()) {
      return err(extended.error);
    }
    return unifyProjectId(ctx, MANIFEST_PATH, ENV_PATH);
  },
};
