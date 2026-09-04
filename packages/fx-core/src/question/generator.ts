// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  CLIArrayOption,
  CLICommandArgument,
  CLICommandOption,
  CLIOptionType,
  CLIStringOption,
  IQTreeNode,
  MultiSelectQuestion,
  Platform,
  SingleSelectQuestion,
  UserInputQuestion,
} from "@microsoft/teamsfx-api";
import path from "path";
import {
  IndentationText,
  OptionalKind,
  Project,
  PropertySignatureStructure,
  SyntaxKind,
  VariableDeclarationKind,
} from "ts-morph";
import { questionNodes } from ".";
import { validate } from "../ui/validationUtils";

async function collectNodesForCliOptions(node: IQTreeNode, nodeList: IQTreeNode[]) {
  if (node.cliOptionDisabled === "all") return;
  if (
    node.data.type !== "group" &&
    (!node.cliOptionDisabled || node.cliOptionDisabled !== "self")
  ) {
    nodeList.push(node);
  }
  let currentOptions: string[] = [];
  if (node.data.type === "singleSelect" || node.data.type === "multiSelect") {
    currentOptions = node.data.staticOptions.map((option) =>
      typeof option === "string" ? option : option.id
    );
  }
  if (node.children && (!node.cliOptionDisabled || node.cliOptionDisabled !== "children")) {
    for (const child of node.children) {
      if (child.condition && typeof child.condition !== "function" && currentOptions.length > 0) {
        // try to exclude one case: parent value has a range, child condition is not functional condition,
        // and none of the value in the range satisfies the condition
        let someChoiceIsValid = false;
        for (const parentValue of currentOptions) {
          const res = await validate(child.condition, parentValue);
          if (res === undefined) {
            someChoiceIsValid = true;
            break;
          }
        }
        if (someChoiceIsValid) {
          await collectNodesForCliOptions(child, nodeList);
        }
        // if all choices are invalid, trim the child node
      } else {
        await collectNodesForCliOptions(child, nodeList);
      }
    }
  }
}

async function collectNodesForInputs(node: IQTreeNode, nodeList: IQTreeNode[]) {
  if (node.inputsDisabled === "all") return;
  if (node.data.type !== "group" && (!node.inputsDisabled || node.inputsDisabled !== "self")) {
    nodeList.push(node);
  }
  let currentOptions: string[] = [];
  if (node.data.type === "singleSelect" || node.data.type === "multiSelect") {
    currentOptions = node.data.staticOptions.map((option) =>
      typeof option === "string" ? option : option.id
    );
  }
  if (node.children && (!node.inputsDisabled || node.inputsDisabled !== "children")) {
    for (const child of node.children) {
      if (child.condition && typeof child.condition !== "function" && currentOptions.length > 0) {
        // try to exclude one case: parent value has a range, child condition is not functional condition,
        // and none of the value in the range satisfies the condition
        let someChoiceIsValid = false;
        for (const parentValue of currentOptions) {
          const res = await validate(child.condition, parentValue);
          if (res === undefined) {
            someChoiceIsValid = true;
            break;
          }
        }
        if (someChoiceIsValid) {
          await collectNodesForInputs(child, nodeList);
        }
        // if all choices are invalid, trim the child node
      } else {
        await collectNodesForInputs(child, nodeList);
      }
    }
  }
}

async function computeRequired(node: IQTreeNode) {
  // console.log("computeRequired", node.data.name, "required:", (node.data as any).required);
  if (node.children) {
    const parentRequired = (node.data as any).required || false;
    for (const child of node.children) {
      let childRequired = (child.data as any).required || false;
      if (!childRequired) {
        if (!child.condition && parentRequired) {
          childRequired = true;
        } else {
          if (typeof child.condition === "function") {
            const isValid = await child.condition({
              platform: Platform.CLI_HELP,
            });
            if (isValid && parentRequired) {
              childRequired = true;
            }
          }
        }
      }
      if (childRequired && (child.data as any).required !== false)
        (child.data as any).required = true;
      // console.log(
      //   child.data.name,
      //   "parent required:",
      //   parentRequired,
      //   "child required:",
      //   (child.data as any).required,
      //   "child condition:",
      //   child.condition,
      //   "computed required:",
      //   (child.data as any).required
      // );
      await computeRequired(child);
    }
  }
}

const notice =
  "/****************************************************************************************\n" +
  " *                            NOTICE: AUTO-GENERATED                                    *\n" +
  " ****************************************************************************************\n" +
  ` * This file is automatically generated by script "./src/question/generator.ts".        *\n` +
  " * Please don't manually change its contents, as any modifications will be overwritten! *\n" +
  " ***************************************************************************************/\n\n\n";

export async function generateCliOptions(
  node: IQTreeNode,
  name: string,
  optionFolder = "./src/question/options",
  excludes?: string[]
): Promise<void> {
  // initialize
  const project = new Project({
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces, // Set the indentation to 2 spaces
    },
  });

  const optionFile = project.createSourceFile(path.join(optionFolder, `${name}Options.ts`), "", {
    overwrite: true,
  });

  const cliNodeList: IQTreeNode[] = [];

  await collectNodesForCliOptions(node, cliNodeList);

  // console.log(`node collected: ${nodeList.map((n) => n.data.name).join(",")}`);

  (node.data as any).required = true;

  await computeRequired(node);

  const questionNames = new Set<string>();
  const cliOptions: CLICommandOption[] = [];
  const cliArguments: CLICommandArgument[] = [];

  for (const node of cliNodeList) {
    const data = node.data as UserInputQuestion;

    const questionName = data.name;

    const cliName = data.cliName || questionName;

    if (excludes?.includes(cliName)) continue;

    if (questionNames.has(questionName)) {
      continue;
    }
    const title = data.title
      ? typeof data.title !== "function"
        ? data.title
        : await data.title({ platform: Platform.CLI_HELP })
      : undefined;
    const defaultValue = data.default
      ? typeof data.default !== "function"
        ? data.default
        : await data.default({ platform: Platform.CLI_HELP })
      : undefined;

    const propDocDescription = title || data.name;

    const option: CLICommandOption | CLICommandArgument = {
      name: cliName,
      questionName: questionName === cliName ? undefined : questionName,
      type: getOptionType(data),
      shortName: data.cliShortName,
      description: data.cliDescription || propDocDescription,
      required: data.required,
    };
    if (defaultValue !== undefined) {
      option.default = data.isBoolean ? Boolean(defaultValue) : defaultValue;
    }

    if (data.cliHidden) {
      option.hidden = data.cliHidden;
    }

    if (data.type === "singleSelect" || data.type === "multiSelect") {
      const selection = data as SingleSelectQuestion | MultiSelectQuestion;

      const options = selection.staticOptions;
      if (!data.isBoolean && options.length > 0) {
        const choices = options.map((o) => (typeof o === "string" ? o : o.id));
        (option as CLIStringOption | CLIArrayOption).choices = choices;
      }

      (option as CLIStringOption | CLIArrayOption).choiceListCommand =
        selection.cliChoiceListCommand;
      if (selection.skipValidation)
        (option as CLIStringOption | CLIArrayOption).skipValidation = selection.skipValidation;
    }

    questionNames.add(questionName);

    if (data.cliType !== "argument") {
      cliOptions.push(option);
    } else {
      cliArguments.push(option);
    }
  }

  const optionInitializerCode = JSON.stringify(cliOptions, null, 2)
    .replace(/"([^"]+)":/g, "$1:")
    .replace(/\\"/g, '"')
    .replace(/\n}$/g, ",\n}");

  const argumentInitializerCode = JSON.stringify(cliArguments, null, 2)
    .replace(/"([^"]+)":/g, "$1:")
    .replace(/\\"/g, '"');
  optionFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: name + "Options",
        type: "CLICommandOption[]",
        initializer: optionInitializerCode,
      },
    ],
  });
  optionFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
    declarations: [
      {
        name: name + "Arguments",
        type: "CLICommandArgument[]",
        initializer: argumentInitializerCode,
      },
    ],
  });
  optionFile.addImportDeclaration({
    namedImports: ["CLICommandOption", "CLICommandArgument"],
    moduleSpecifier: "@microsoft/teamsfx-api",
  });
  optionFile.insertText(
    0,
    "// Copyright (c) Microsoft Corporation.\n// Licensed under the MIT license.\n\n" + notice
  );
  optionFile.formatText();

  await updateExports("./src/question/options/index.ts", `export * from "./${name}Options";`);

  await project.save();
}

export async function generateInputs(
  node: IQTreeNode,
  name: string,
  inputsFolder = "./src/question/inputs",
  excludes = ["folder"]
): Promise<void> {
  // initialize
  const project = new Project({
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces, // Set the indentation to 2 spaces
    },
  });

  const inputsFile = project.createSourceFile(path.join(inputsFolder, `${name}Inputs.ts`), "", {
    overwrite: true,
  });

  const inputsNodeList: IQTreeNode[] = [];

  await collectNodesForInputs(node, inputsNodeList);

  // console.log(`node collected: ${nodeList.map((n) => n.data.name).join(",")}`);

  (node.data as any).required = true;

  await computeRequired(node);

  const questionNames = new Set<string>();

  const properties: OptionalKind<PropertySignatureStructure>[] = [];

  for (const node of inputsNodeList) {
    const data = node.data as UserInputQuestion;

    const questionName = data.name;

    const cliName = data.cliName || questionName;

    if (excludes.includes(cliName)) continue;

    if (questionNames.has(questionName)) {
      continue;
    }

    let type = "string";

    const title = data.title
      ? typeof data.title !== "function"
        ? data.title
        : await data.title({ platform: Platform.CLI_HELP })
      : undefined;

    const propDocDescription = title || data.name;

    if (data.isBoolean) {
      type = "boolean";
    } else if (data.type === "singleSelect" || data.type === "multiSelect") {
      const selection = data as SingleSelectQuestion | MultiSelectQuestion;

      const options = selection.staticOptions;
      if (options.length > 0) {
        const optionStrings = options.map((o) => (typeof o === "string" ? o : o.id));
        type = selection.skipValidation ? "string" : optionStrings.map((i) => `"${i}"`).join(" | ");
      } else {
        type = "string";
      }

      if (data.type === "multiSelect") {
        type += "[]";
      }
    }
    if (data.type === "multiFile") {
      type = "string[]";
    }
    const inputPropName = questionName.includes("-") ? `"${questionName}"` : questionName;
    properties.push({
      name: inputPropName,
      type: type,
      hasQuestionToken: true,
      docs: [`@description ${propDocDescription}`],
    });

    questionNames.add(questionName);
  }

  inputsFile.addInterface({
    name: name + "Inputs",
    isExported: true,
    properties: properties,
    extends: ["Inputs"],
  });

  inputsFile.addImportDeclaration({
    namedImports: ["Inputs"],
    moduleSpecifier: "@microsoft/teamsfx-api",
  });

  inputsFile.insertText(
    0,
    "// Copyright (c) Microsoft Corporation.\n// Licensed under the MIT license.\n\n" + notice
  );

  inputsFile.formatText();

  await updateExports("./src/question/inputs/index.ts", `export * from "./${name}Inputs";`);

  await project.save();
}

function getOptionType(question: UserInputQuestion): CLIOptionType {
  if (question.isBoolean) return "boolean";
  if (question.type === "multiSelect" || question.type === "multiFile") {
    return "array";
  }
  return "string";
}

async function updateExports(filePath: string, exportStatement: string) {
  const project = new Project();
  try {
    const sourceFile = project.addSourceFileAtPathIfExists(filePath);
    if (!sourceFile) return;
    const hasExport = sourceFile.getStatements().some((statement) => {
      return (
        statement.getKind() === SyntaxKind.ExportDeclaration &&
        statement.getText().trim() === exportStatement
      );
    });

    if (!hasExport) {
      sourceFile.addStatements([exportStatement]);
      await sourceFile.save();
      console.log(`Export statement '${exportStatement}' added successfully.`);
    }
  } catch (err) {
    console.error("Error occurred:", err);
    return;
  }
}

async function batchGenerate() {
  // await generateCliOptions(questionNodes.createProject(Platform.CLI), "CreateProject");
  // await generateInputs(questionNodes.createProject(Platform.CLI), "CreateProject");

  await generateCliOptions(questionNodes.createSampleProject(), "CreateSampleProject");
  await generateInputs(questionNodes.createSampleProject(), "CreateSampleProject");

  await generateCliOptions(questionNodes.addWebpart(), "SPFxAddWebpart");
  await generateInputs(questionNodes.addWebpart(), "SPFxAddWebpart");

  await generateCliOptions(questionNodes.createNewEnv(), "CreateEnv");
  await generateInputs(questionNodes.createNewEnv(), "CreateEnv");

  await generateCliOptions(questionNodes.selectTeamsAppManifest(), "SelectTeamsManifest");
  await generateInputs(questionNodes.selectTeamsAppManifest(), "SelectTeamsManifest");

  await generateCliOptions(questionNodes.validateTeamsApp(), "ValidateTeamsApp");
  await generateInputs(questionNodes.validateTeamsApp(), "ValidateTeamsApp");

  await generateCliOptions(questionNodes.previewWithTeamsAppManifest(), "PreviewTeamsApp");
  await generateInputs(questionNodes.previewWithTeamsAppManifest(), "PreviewTeamsApp");

  await generateCliOptions(questionNodes.grantPermission(), "PermissionGrant");
  await generateInputs(questionNodes.grantPermission(), "PermissionGrant");

  await generateCliOptions(questionNodes.listCollaborator(), "PermissionList");
  await generateInputs(questionNodes.listCollaborator(), "PermissionList");

  await generateCliOptions(questionNodes.deployAadManifest(), "DeployAadManifest");
  await generateInputs(questionNodes.deployAadManifest(), "DeployAadManifest");

  await generateCliOptions(questionNodes.addPlugin(), "AddPlugin");
  await generateInputs(questionNodes.addPlugin(), "AddPlugin");

  await generateCliOptions(questionNodes.regeneratePlugin(), "RegeneratePlugin");
  await generateInputs(questionNodes.regeneratePlugin(), "RegeneratePlugin");

  await generateCliOptions(questionNodes.uninstall(), "Uninstall");
  await generateInputs(questionNodes.uninstall(), "Uninstall");

  await generateCliOptions(questionNodes.syncManifest(), "SyncManifest");
  await generateInputs(questionNodes.syncManifest(), "SyncManifest");

  await generateCliOptions(questionNodes.addAuthAction(), "AddAuthAction");
  await generateInputs(questionNodes.addAuthAction(), "AddAuthAction");

  await generateCliOptions(questionNodes.addKnowledge(), "AddKnowledge");
  await generateInputs(questionNodes.addKnowledge(), "AddKnowledge");

  await generateCliOptions(questionNodes.setSensitivityLabel(), "SetSensitivityLabel");
  await generateInputs(questionNodes.setSensitivityLabel(), "SetSensitivityLabel");

  await generateCliOptions(questionNodes.share(), "Share");
  await generateInputs(questionNodes.share(), "Share");

  await generateCliOptions(questionNodes.removeSharedAccess(), "removeSharedAccess");
  await generateInputs(questionNodes.removeSharedAccess(), "removeSharedAccess");
}

void batchGenerate();
