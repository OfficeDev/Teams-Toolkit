// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks/lib";
import {
  Colors,
  DeclarativeCopilotCapabilityName,
  err,
  FunctionObject,
  FxError,
  ok,
  PluginManifestSchema,
  Result,
  TeamsManifestV1D17,
  TeamsManifestV1D19,
  TeamsManifestV1D21,
  TeamsManifestV1D5,
  TeamsManifestVDevPreview,
} from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import * as path from "path";
import semver from "semver";
import { Service } from "typedi";
import * as uuid from "uuid";
import { featureFlagManager, FeatureFlags } from "../../../common/featureFlags";
import { ErrorContextMW } from "../../../common/globalVars";
import { getLocalizedString } from "../../../common/localizeUtils";
import { FileNotFoundError, InvalidActionInputError, JSONSyntaxError } from "../../../error/common";
import {
  InvalidFileOutsideOfTheDirectotryError,
  AppPackageSizeExceededError,
} from "../../../error/teamsApp";
import { getAbsolutePath } from "../../utils/common";
import { expandVariableWithFunction, ManifestType } from "../../utils/envFunctionUtils";
import { DriverContext } from "../interface/commonArgs";
import { ExecutionResult, StepDriver } from "../interface/stepDriver";
import { addStartAndEndTelemetry } from "../middleware/addStartAndEndTelemetry";
import { updateVersionForTeamsAppYamlFile } from "../util/utils";
import { WrapDriverContext } from "../util/wrapUtil";
import { Constants } from "./constants";
import { CreateAppPackageArgs } from "./interfaces/CreateAppPackageArgs";
import { copilotGptManifestUtils } from "./utils/CopilotGptManifestUtils";
import { manifestUtils } from "./utils/ManifestUtils";
import { getResolvedManifest, normalizePath } from "./utils/utils";

export const actionName = "teamsApp/zipAppPackage";

@Service(actionName)
export class CreateAppPackageDriver implements StepDriver {
  description = getLocalizedString("driver.teamsApp.description.createAppPackageDriver");
  readonly progressTitle = getLocalizedString(
    "plugins.appstudio.createPackage.progressBar.message"
  );

  public async execute(
    args: CreateAppPackageArgs,
    context: DriverContext
  ): Promise<ExecutionResult> {
    const wrapContext = new WrapDriverContext(context, actionName, actionName);
    const res = await this.build(args, wrapContext);
    return {
      result: res,
      summaries: wrapContext.summaries,
    };
  }

  @hooks([
    ErrorContextMW({ source: "Teams", component: "CreateAppPackageDriver" }),
    addStartAndEndTelemetry(actionName, actionName),
  ])
  public async build(
    args: CreateAppPackageArgs,
    context: WrapDriverContext
  ): Promise<Result<Map<string, string>, FxError>> {
    const result = this.validateArgs(args);
    if (result.isErr()) {
      return err(result.error);
    }

    // TODO: use constant after previous pr merged
    const generatedFolder = path.join(context.projectPath, "appPackage", ".generated");
    const hasTTKGeneratedFolder =
      fs.existsSync(generatedFolder) && fs.existsSync(path.join(generatedFolder, "manifest.json"));

    let manifestPath = hasTTKGeneratedFolder
      ? path.join(generatedFolder, "manifest.json")
      : args.manifestPath;
    if (!path.isAbsolute(manifestPath)) {
      manifestPath = path.join(context.projectPath, manifestPath);
    }

    const manifestRes = await manifestUtils.getManifestV3(manifestPath, context);
    if (manifestRes.isErr()) {
      return err(manifestRes.error);
    }
    const manifest = manifestRes.value;
    // Deal with relative path
    // Environment variables should have been replaced by value
    // ./build/appPackage/appPackage.dev.zip instead of ./build/appPackage/appPackage.${{TEAMSFX_ENV}}.zip
    const zipFileName = getAbsolutePath(args.outputZipPath, context.projectPath);
    const zipFileDir = path.dirname(zipFileName);
    await fs.mkdir(zipFileDir, { recursive: true });

    let jsonFileDir;
    let teamsManifestJsonFileName;
    const shouldwriteAllManifest = !!args.outputFolder;
    if (args.outputJsonPath) {
      teamsManifestJsonFileName = getAbsolutePath(args.outputJsonPath, context.projectPath);
      jsonFileDir = path.dirname(teamsManifestJsonFileName);
    } else {
      jsonFileDir = getAbsolutePath(args.outputFolder!, context.projectPath);
      teamsManifestJsonFileName = path.join(
        jsonFileDir,
        `manifest.${process.env.TEAMSFX_ENV!}.json`
      );
    }
    await fs.mkdir(jsonFileDir, { recursive: true });

    const appDirectory = path.dirname(hasTTKGeneratedFolder ? generatedFolder : manifestPath);

    // check and include all relative file paths in manifest
    const relativeFiles = [manifest.icons.color, manifest.icons.outline];
    const manifestVersion =
      manifest.manifestVersion === "devPreview"
        ? semver.coerce("1.19.0") // for MetaOS WXP, fallback the `devPreview` ver as `1.19.0` to enable following logics
        : semver.coerce(manifest.manifestVersion); // ensure manifestVersion is a valid semver
    if (manifestVersion && semver.gte(manifestVersion, "1.21.0")) {
      const color32x32 = (manifest as TeamsManifestV1D21.TeamsManifestV1D21).icons.color32x32;
      if (color32x32) {
        relativeFiles.push(color32x32);
      }
    }
    for (const file of relativeFiles) {
      const filePath = path.resolve(appDirectory, file);
      if (!(await fs.pathExists(filePath))) {
        const error = new FileNotFoundError(
          actionName,
          filePath,
          "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
        );
        return err(error);
      }
      const realFilePath = await fs.realpath(filePath);
      const realAppDirectory = await fs.realpath(appDirectory);
      const fileRelativePath = path.relative(realAppDirectory, realFilePath);
      if (fileRelativePath.startsWith("..")) {
        return err(new InvalidFileOutsideOfTheDirectotryError(filePath));
      }
    }

    // pre-check existence
    let additionalLanguages: TeamsManifestV1D5.AdditionalLanguage[] | undefined;
    if (manifestVersion && semver.gte(manifestVersion, "1.5.0")) {
      additionalLanguages = (manifest as TeamsManifestV1D5.TeamsManifestV1D5).localizationInfo
        ?.additionalLanguages;
    }
    let composeExtensionType: string | undefined;
    let apiSpecificationFile: string | undefined;
    let commands: TeamsManifestV1D17.ComposeExtensionCommand[] | undefined;
    if (manifestVersion && semver.gte(manifestVersion, "1.17.0")) {
      composeExtensionType = (manifest as TeamsManifestV1D17.TeamsManifestV1D17)
        .composeExtensions?.[0]?.composeExtensionType;
      apiSpecificationFile = (manifest as TeamsManifestV1D17.TeamsManifestV1D17)
        .composeExtensions?.[0]?.apiSpecificationFile;
      commands = (manifest as TeamsManifestV1D17.TeamsManifestV1D17).composeExtensions?.[0]
        ?.commands;
    }
    let defaultLanguageFile: string | undefined;
    let declarativeAgents: TeamsManifestV1D19.DeclarativeAgentRef[] | undefined;
    if (manifestVersion && semver.gte(manifestVersion, "1.19.0")) {
      defaultLanguageFile = (manifest as TeamsManifestV1D19.TeamsManifestV1D19).localizationInfo
        ?.defaultLanguageFile;
      declarativeAgents = (manifest as TeamsManifestV1D19.TeamsManifestV1D19).copilotAgents
        ?.declarativeAgents;
    }
    if (additionalLanguages && additionalLanguages.length > 0) {
      for (const language of additionalLanguages) {
        const file = language.file;
        const fileName = path.join(appDirectory, file);
        if (!(await fs.pathExists(fileName))) {
          return err(
            new FileNotFoundError(
              actionName,
              fileName,
              "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
            )
          );
        }
      }
    }
    if (defaultLanguageFile) {
      const fileName = path.join(appDirectory, defaultLanguageFile);
      if (!(await fs.pathExists(fileName))) {
        return err(
          new FileNotFoundError(
            actionName,
            fileName,
            "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
          )
        );
      }
    }

    const zip = new AdmZip();
    zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(manifest, null, 4)));

    // icon images, relative path
    for (const icon of relativeFiles) {
      const dir = path.dirname(icon);
      zip.addLocalFile(path.resolve(appDirectory, icon), dir === "." ? "" : dir);
    }

    // localization file
    if (additionalLanguages && additionalLanguages.length > 0) {
      for (const language of additionalLanguages) {
        const file = language.file;
        const fileName = path.resolve(appDirectory, file);
        const realFileName = await fs.realpath(fileName);
        const realAppDirectory = await fs.realpath(appDirectory);
        const relativePath = path.relative(realAppDirectory, realFileName);
        if (relativePath.startsWith("..")) {
          return err(new InvalidFileOutsideOfTheDirectotryError(fileName));
        }
        const resolvedLocFileRes = await manifestUtils.resolveLocFile(fileName, context);
        if (resolvedLocFileRes.isErr()) {
          return err(resolvedLocFileRes.error);
        }
        if (resolvedLocFileRes.value) {
          zip.addFile(relativePath, Buffer.from(resolvedLocFileRes.value));
        }
      }
    }
    if (defaultLanguageFile) {
      const fileName = path.resolve(appDirectory, defaultLanguageFile);
      const realFileName = await fs.realpath(fileName);
      const realAppDirectory = await fs.realpath(appDirectory);
      const relativePath = path.relative(realAppDirectory, realFileName);
      if (relativePath.startsWith("..")) {
        return err(new InvalidFileOutsideOfTheDirectotryError(fileName));
      }

      const resolvedLocFileRes = await manifestUtils.resolveLocFile(fileName, context);
      if (resolvedLocFileRes.isErr()) {
        return err(resolvedLocFileRes.error);
      }
      if (resolvedLocFileRes.value) {
        zip.addFile(relativePath, Buffer.from(resolvedLocFileRes.value));
      }
    }

    // API ME, API specification and Adaptive card templates
    if (composeExtensionType == "apiBased" && apiSpecificationFile) {
      const apiSpecificationFilePath = path.resolve(appDirectory, apiSpecificationFile);
      const checkExistenceRes = await this.validateReferencedFile(
        apiSpecificationFilePath,
        appDirectory
      );
      if (checkExistenceRes.isErr()) {
        return err(checkExistenceRes.error);
      }

      const addFileWithVariableRes = await this.addFileWithVariable(
        zip,
        apiSpecificationFile,
        apiSpecificationFilePath,
        ManifestType.ApiSpec,
        context
      );
      if (addFileWithVariableRes.isErr()) {
        return err(addFileWithVariableRes.error);
      }

      if (commands && commands.length > 0) {
        for (const command of commands) {
          if (command.apiResponseRenderingTemplateFile) {
            const adaptiveCardFile = path.resolve(
              appDirectory,
              command.apiResponseRenderingTemplateFile
            );
            const checkExistenceRes = await this.validateReferencedFile(
              adaptiveCardFile,
              appDirectory
            );
            if (checkExistenceRes.isErr()) {
              return err(checkExistenceRes.error);
            }
            const dir = path.dirname(command.apiResponseRenderingTemplateFile);
            this.addFileInZip(zip, dir, adaptiveCardFile);
          }
        }
      }
    }

    // Copilot GPT
    if (declarativeAgents?.length && declarativeAgents[0].file) {
      const declarativeAgentManifestFile = path.resolve(
        hasTTKGeneratedFolder ? generatedFolder : appDirectory,
        declarativeAgents[0].file
      );
      const checkExistenceRes = await this.validateReferencedFile(
        declarativeAgentManifestFile,
        appDirectory
      );
      if (checkExistenceRes.isErr()) {
        return err(checkExistenceRes.error);
      }

      const addFileWithVariableRes = await this.addFileWithVariable(
        zip,
        declarativeAgents[0].file,
        declarativeAgentManifestFile,
        ManifestType.DeclarativeCopilotManifest,
        context,
        shouldwriteAllManifest
          ? path.join(jsonFileDir, path.relative(appDirectory, declarativeAgentManifestFile))
          : undefined
      );
      if (addFileWithVariableRes.isErr()) {
        return err(addFileWithVariableRes.error);
      }
      const getCopilotGptRes = await copilotGptManifestUtils.getManifest(
        declarativeAgentManifestFile,
        context
      );
      if (getCopilotGptRes.isOk()) {
        const manifest = getCopilotGptRes.value;

        if (manifest.actions !== undefined && !Array.isArray(manifest.actions)) {
          return err(
            new InvalidActionInputError(
              actionName,
              [`actions (in ${path.basename(declarativeAgentManifestFile)}) must be an array`],
              "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
            )
          );
        }

        if (manifest.capabilities !== undefined && !Array.isArray(manifest.capabilities)) {
          return err(
            new InvalidActionInputError(
              actionName,
              [`capabilities (in ${path.basename(declarativeAgentManifestFile)}) must be an array`],
              "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
            )
          );
        }

        // Add action files
        if (Array.isArray(manifest.actions)) {
          const pluginFiles = manifest.actions.map((action) => action.file);

          for (const pluginFile of pluginFiles) {
            const pluginFileAbsolutePath = path.resolve(
              path.dirname(declarativeAgentManifestFile),
              pluginFile
            );

            const pluginFileRelativePath = path.relative(
              hasTTKGeneratedFolder ? generatedFolder : appDirectory,
              pluginFileAbsolutePath
            );
            const useForwardSlash = declarativeAgents[0].file.concat(pluginFile).includes("/");

            const addPluginRes = await this.addPlugin(
              zip,
              normalizePath(pluginFileRelativePath, useForwardSlash),
              hasTTKGeneratedFolder ? generatedFolder : appDirectory,
              context,
              !shouldwriteAllManifest ? undefined : jsonFileDir,
              hasTTKGeneratedFolder ? appDirectory : undefined
            );

            if (addPluginRes.isErr()) {
              return err(addPluginRes.error);
            }
          }
        }
        // Add embedded knowledge files
        if (Array.isArray(manifest.capabilities)) {
          const embeddedKnowledgeCapabilities = manifest.capabilities.filter(
            (capability) => capability.name === DeclarativeCopilotCapabilityName.EmbeddedKnowledge
          );
          if (embeddedKnowledgeCapabilities.length > 0) {
            const fileSet = new Set<string>();
            for (const capability of embeddedKnowledgeCapabilities) {
              const embeddedCapability = capability;
              if (embeddedCapability.files) {
                for (const file of embeddedCapability.files) {
                  if (file.file) {
                    fileSet.add(file.file);
                  }
                }
              }
            }
            const fileArr = Array.from(fileSet);
            if (fileArr.length > 0) {
              for (const file of fileArr) {
                const knowledgeFileAbsolutePath = path.resolve(appDirectory, file);
                // check existence
                const checkExistenceRes = await this.validateReferencedFile(
                  knowledgeFileAbsolutePath,
                  appDirectory
                );
                if (checkExistenceRes.isErr()) {
                  return err(checkExistenceRes.error);
                }

                const dir = path.dirname(file);
                zip.addLocalFile(knowledgeFileAbsolutePath, dir === "." ? "" : dir);
              }
            }
          }
        }
        // Add agent skill directories (support both agent_skills and x-agent_skills)
        if (featureFlagManager.getBooleanValue(FeatureFlags.AgentSkillsManifest)) {
          const agentSkills =
            getCopilotGptRes.value.agent_skills ||
            (getCopilotGptRes.value as any)["x-agent_skills"];
          if (agentSkills && Array.isArray(agentSkills)) {
            for (const skill of agentSkills) {
              if (skill.folder) {
                // Resolve skill folder relative to appDirectory (not .generated/)
                // since skill folders don't support env var substitution
                const skillFolderAbsolutePath = path.resolve(appDirectory, skill.folder);
                const checkExistenceRes = await this.validateReferencedFile(
                  skillFolderAbsolutePath,
                  appDirectory
                );
                if (checkExistenceRes.isErr()) {
                  return err(checkExistenceRes.error);
                }

                const skillMdPath = path.join(skillFolderAbsolutePath, "SKILL.md");
                if (!(await fs.pathExists(skillMdPath))) {
                  return err(
                    new FileNotFoundError(
                      actionName,
                      skillMdPath,
                      "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
                    )
                  );
                }

                const skillRelativePath = path.relative(appDirectory, skillFolderAbsolutePath);
                zip.addLocalFolder(skillFolderAbsolutePath, skillRelativePath);
              }
            }
          }
        }
      } else {
        return err(getCopilotGptRes.error);
      }
    }

    const teamsManifestAgentSkills = (manifest as TeamsManifestVDevPreview.TeamsManifestVDevPreview)
      .agentSkills;
    if (teamsManifestAgentSkills?.length) {
      const addSkillsRes = await this.addAgentSkillFolders(
        zip,
        teamsManifestAgentSkills,
        appDirectory
      );
      if (addSkillsRes.isErr()) {
        return err(addSkillsRes.error);
      }
    }

    // Agent connector MCP tool description files (Teams manifest agentConnectors, GA since 1.27)
    const agentConnectors = (manifest as TeamsManifestVDevPreview.TeamsManifestVDevPreview)
      .agentConnectors;
    if (agentConnectors?.length) {
      const addConnectorFilesRes = await this.addAgentConnectorFiles(
        zip,
        agentConnectors,
        appDirectory
      );
      if (addConnectorFilesRes.isErr()) {
        return err(addConnectorFilesRes.error);
      }
    }

    zip.writeZip(zipFileName);

    // Validate zip package size against 10 MB hard limit
    const maxPackageSize = 10 * 1024 * 1024;
    const zipStats = await fs.stat(zipFileName);
    if (zipStats.size > maxPackageSize) {
      return err(new AppPackageSizeExceededError(zipStats.size, maxPackageSize));
    }

    await this.writeJsonFile(teamsManifestJsonFileName, JSON.stringify(manifest, null, 4));

    const builtSuccess = [
      { content: "(√)Done: ", color: Colors.BRIGHT_GREEN },
      { content: "App Package ", color: Colors.BRIGHT_WHITE },
      { content: zipFileName, color: Colors.BRIGHT_MAGENTA },
      { content: " built successfully!", color: Colors.BRIGHT_WHITE },
    ];
    context.logProvider.info(builtSuccess);
    return ok(new Map());
  }

  private static async expandEnvVars(
    filePath: string,
    ctx: WrapDriverContext,
    manifestType: ManifestType
  ): Promise<Result<string, FxError>> {
    const content = await fs.readFile(filePath, "utf8");
    return getResolvedManifest(content, filePath, manifestType, ctx);
  }

  private validateArgs(args: CreateAppPackageArgs): Result<any, FxError> {
    const invalidParams: string[] = [];
    if (!args || !args.manifestPath) {
      invalidParams.push("manifestPath");
    }
    if (!args || (!args.outputJsonPath && !args.outputFolder)) {
      invalidParams.push("outputJsonPath or outputFolder");
    }
    if (!args || !args.outputZipPath) {
      invalidParams.push("outputZipPath");
    }
    if (invalidParams.length > 0) {
      return err(
        new InvalidActionInputError(
          actionName,
          invalidParams,
          "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
        )
      );
    } else {
      return ok(undefined);
    }
  }

  private async validateReferencedFile(
    file: string,
    directory: string
  ): Promise<Result<undefined, FxError>> {
    if (!(await fs.pathExists(file))) {
      return err(
        new FileNotFoundError(
          actionName,
          file,
          "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
        )
      );
    }

    const realFile = await fs.realpath(file);
    const realDirectory = await fs.realpath(directory);
    const relativePath = path.relative(realDirectory, realFile);
    if (relativePath.startsWith("..")) {
      return err(new InvalidFileOutsideOfTheDirectotryError(file));
    }

    return ok(undefined);
  }

  private async addAgentSkillFolders(
    zip: AdmZip,
    agentSkills: { folder: string }[],
    appDirectory: string
  ): Promise<Result<undefined, FxError>> {
    for (const skill of agentSkills) {
      const skillFolderAbs = path.resolve(appDirectory, skill.folder);
      if (!(await fs.pathExists(skillFolderAbs))) {
        return err(
          new FileNotFoundError(
            actionName,
            skillFolderAbs,
            "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
          )
        );
      }
      const skillMdPath = path.join(skillFolderAbs, "SKILL.md");
      if (!(await fs.pathExists(skillMdPath))) {
        return err(
          new FileNotFoundError(
            actionName,
            skillMdPath,
            "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
          )
        );
      }
      const realSkillFolder = await fs.realpath(skillFolderAbs);
      const realAppDirectory = await fs.realpath(appDirectory);
      const relativeToApp = path.relative(realAppDirectory, realSkillFolder);
      if (relativeToApp.startsWith("..") || path.isAbsolute(relativeToApp)) {
        return err(new InvalidFileOutsideOfTheDirectotryError(skillFolderAbs));
      }
      await this.addLocalFolderRecursive(zip, skillFolderAbs, appDirectory);
    }
    return ok(undefined);
  }

  /**
   * Add the MCP tool description files referenced by Teams manifest agent connectors
   * (agentConnectors[].toolSource.remoteMcpServer.mcpToolDescription.file) to the zip.
   * The file reference is a schema-declared relative path, mirroring the declarative-agent
   * file reference; it is optional (v1.29+), so connectors without one add nothing.
   */
  private async addAgentConnectorFiles(
    zip: AdmZip,
    agentConnectors: TeamsManifestVDevPreview.AgentConnector[],
    appDirectory: string
  ): Promise<Result<undefined, FxError>> {
    const addedFiles = new Set<string>();
    for (const connector of agentConnectors) {
      const toolFile = connector.toolSource?.remoteMcpServer?.mcpToolDescription?.file;
      if (!toolFile) {
        continue;
      }
      const toolFileAbsolutePath = path.resolve(appDirectory, toolFile);
      if (addedFiles.has(toolFileAbsolutePath)) {
        continue;
      }
      const checkExistenceRes = await this.validateReferencedFile(
        toolFileAbsolutePath,
        appDirectory
      );
      if (checkExistenceRes.isErr()) {
        return err(checkExistenceRes.error);
      }
      const entryName = path.relative(appDirectory, toolFileAbsolutePath);
      this.addFileInZip(zip, path.dirname(entryName), toolFileAbsolutePath);
      addedFiles.add(toolFileAbsolutePath);
    }
    return ok(undefined);
  }

  private async addLocalFolderRecursive(
    zip: AdmZip,
    folderAbs: string,
    appDirectory: string
  ): Promise<void> {
    const entries = await fs.readdir(folderAbs, { withFileTypes: true });
    const realAppDirectory = await fs.realpath(appDirectory);
    for (const entry of entries) {
      const entryAbs = path.join(folderAbs, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        await this.addLocalFolderRecursive(zip, entryAbs, appDirectory);
      } else if (entry.isFile()) {
        const realEntryAbs = await fs.realpath(entryAbs);
        const relToApp = path.relative(realAppDirectory, realEntryAbs);
        if (relToApp.startsWith("..")) {
          continue;
        }
        const relDir = path.dirname(path.relative(appDirectory, entryAbs));
        zip.addLocalFile(entryAbs, normalizePath(relDir, true));
      }
    }
  }

  /**
   * Add plugin file and plugin related files to zip.
   * @param zip zip
   * @param pluginRelativePath plugin file path relative to app package folder
   * @param appDirectory app package path containing manifest template.
   * @param context context
   * @param outputDirectory optional. Folder where we should put the resolved manifest in.
   * @returns result of adding plugin file and plugin related files
   */
  private async addPlugin(
    zip: AdmZip,
    pluginRelativePath: string,
    appDirectory: string,
    context: WrapDriverContext,
    outputDirectory?: string,
    defaultAppDirectry?: string
  ): Promise<Result<undefined, FxError>> {
    const pluginFile = path.resolve(appDirectory, pluginRelativePath);
    const checkExistenceRes = await this.validateReferencedFile(pluginFile, appDirectory);
    if (checkExistenceRes.isErr()) {
      return err(checkExistenceRes.error);
    }

    let pluginFileContent;
    try {
      pluginFileContent = (await fs.readJSON(pluginFile)) as PluginManifestSchema;
    } catch (e) {
      return err(new JSONSyntaxError(pluginFile, e, actionName));
    }

    let containExternalAdaptiveCard = false;
    if (pluginFileContent.functions) {
      for (const func of pluginFileContent.functions) {
        if (func.capabilities?.response_semantics?.static_template?.file) {
          const staticTemplateFile = await this.getAdaptiveCardTemplateFile(
            context,
            pluginFile,
            func,
            appDirectory,
            defaultAppDirectry
          );
          if (!staticTemplateFile) {
            continue;
          }

          if (Object.keys(func.capabilities.response_semantics.static_template).length > 1) {
            context.logProvider.warning(
              getLocalizedString(
                "plugins.appstudio.createPackage.aiPlugin.overrideWarning",
                pluginFile,
                func.name
              )
            );
          }

          const staticTemplateFileContent = await fs.readJSON(staticTemplateFile);
          func.capabilities.response_semantics.static_template = staticTemplateFileContent;

          containExternalAdaptiveCard = true;
        }
      }
    }

    let tmpPluginFile = pluginFile;
    let tempFolder: string | undefined;

    let namespaceContainsUnderscore = false;
    if (pluginFileContent.namespace?.includes("_")) {
      pluginFileContent.namespace = pluginFileContent.namespace.replace(/_/g, "");
      namespaceContainsUnderscore = true;
      context.logProvider.warning(
        getLocalizedString(
          "plugins.appstudio.createPackage.aiPlugin.containsUnderscore",
          pluginRelativePath
        )
      );
    }

    if (containExternalAdaptiveCard) {
      await updateVersionForTeamsAppYamlFile(context.projectPath);
    }

    if (namespaceContainsUnderscore || containExternalAdaptiveCard) {
      tempFolder = path.join(appDirectory, ".tmp");
      await fs.ensureDir(tempFolder);
      tmpPluginFile = path.join(tempFolder, `tmp-ai-plugin-${uuid.v4().slice(0, 6)}.json`);
      const processedFunctionRes = await expandVariableWithFunction(
        JSON.stringify(pluginFileContent),
        context,
        undefined,
        true,
        ManifestType.PluginManifest,
        pluginFile
      );
      if (processedFunctionRes.isErr()) {
        return err(processedFunctionRes.error);
      }
      pluginFileContent = JSON.parse(processedFunctionRes.value);
      await fs.writeJSON(tmpPluginFile, pluginFileContent, { spaces: 4 });
    }

    const addFileWithVariableRes = await this.addFileWithVariable(
      zip,
      pluginRelativePath,
      tmpPluginFile,
      ManifestType.PluginManifest,
      context,
      !outputDirectory
        ? undefined
        : path.join(outputDirectory, path.relative(appDirectory, pluginFile))
    );

    if (containExternalAdaptiveCard && tmpPluginFile !== pluginFile && tempFolder) {
      await fs.remove(tempFolder);
    }

    if (addFileWithVariableRes.isErr()) {
      return err(addFileWithVariableRes.error);
    }

    const addFilesRes = await this.addPluginRelatedFiles(
      zip,
      pluginRelativePath,
      appDirectory,
      context
    );
    if (addFilesRes.isErr()) {
      return err(addFilesRes.error);
    } else {
      return ok(undefined);
    }
  }

  /**
   * Add plugin related files (OpenAPI spec) to zip.
   * @param zip zip.
   * @param pluginFile plugin file path relative to app package folder.
   * @param appDirectory app package folder.
   * @param context context.
   * @returns results whether add files related to plugin is successful.
   */
  private async addPluginRelatedFiles(
    zip: AdmZip,
    pluginFile: string,
    appDirectory: string,
    context: WrapDriverContext
  ): Promise<Result<undefined, FxError>> {
    const pluginFilePath = path.join(appDirectory, pluginFile);
    const pluginContent = (await fs.readJSON(pluginFilePath)) as PluginManifestSchema;
    const runtimes = pluginContent.runtimes;
    if (runtimes && runtimes.length > 0) {
      for (const runtime of runtimes) {
        if (runtime.type === "OpenApi" && runtime.spec?.url) {
          const specFile = path.resolve(path.dirname(pluginFilePath), runtime.spec.url);
          // add openapi spec
          const checkExistenceRes = await this.validateReferencedFile(specFile, appDirectory);
          if (checkExistenceRes.isErr()) {
            return err(checkExistenceRes.error);
          }

          const entryName = path.relative(appDirectory, specFile);
          const useForwardSlash = pluginFile.concat(runtime.spec.url).includes("/");

          const addFileWithVariableRes = await this.addFileWithVariable(
            zip,
            normalizePath(entryName, useForwardSlash),
            specFile,
            ManifestType.ApiSpec,
            context
          );
          if (addFileWithVariableRes.isErr()) {
            return err(addFileWithVariableRes.error);
          }
        } else if (
          (runtime as any).type === "RemoteMCPServer" &&
          (runtime as any).spec?.mcp_tool_description?.file
        ) {
          const mcpFile = path.resolve(
            path.dirname(pluginFilePath),
            (runtime as any).spec.mcp_tool_description.file
          );
          // add mcp tool description file
          const checkExistenceRes = await this.validateReferencedFile(mcpFile, appDirectory);
          if (checkExistenceRes.isErr()) {
            return err(checkExistenceRes.error);
          }

          const entryName = path.relative(appDirectory, mcpFile);
          this.addFileInZip(zip, path.dirname(entryName), mcpFile);
        }
      }
    }

    return ok(undefined);
  }

  private async addFileWithVariable(
    zip: AdmZip,
    entryName: string,
    filePath: string,
    manifestType: ManifestType,
    context: WrapDriverContext,
    outputPath?: string // If outputPath exists, we will write down the file after replacing placeholders.
  ): Promise<Result<undefined, FxError>> {
    const expandedEnvVarResult = await CreateAppPackageDriver.expandEnvVars(
      filePath,
      context,
      manifestType
    );
    if (expandedEnvVarResult.isErr()) {
      return err(expandedEnvVarResult.error);
    }
    const content = expandedEnvVarResult.value;

    const attr = await fs.stat(filePath);
    zip.addFile(entryName, Buffer.from(content), "", attr.mode);

    if (outputPath && path.extname(outputPath).toLowerCase() === ".json") {
      await this.writeJsonFile(
        `${outputPath.substring(0, outputPath.length - 5)}.${process.env.TEAMSFX_ENV!}.json`,
        content
      );
    }

    return ok(undefined);
  }

  private addFileInZip(zip: AdmZip, zipPath: string, filePath: string) {
    zip.addLocalFile(filePath, zipPath === "." ? "" : zipPath);
  }

  private async writeJsonFile(jsonFileName: string, content: string) {
    if (await fs.pathExists(jsonFileName)) {
      await fs.chmod(jsonFileName, 0o777);
    }
    await fs.ensureDir(path.dirname(jsonFileName));
    await fs.writeFile(jsonFileName, content);
    await fs.chmod(jsonFileName, 0o444);
  }

  private async getAdaptiveCardTemplateFile(
    context: WrapDriverContext,
    pluginFile: string,
    func: FunctionObject,
    appDirectory: string,
    defaultAppDirectry?: string
  ): Promise<string | undefined> {
    let staticTemplateFile = path.resolve(
      defaultAppDirectry ?? path.dirname(pluginFile),
      func.capabilities!.response_semantics!.static_template!.file as string
    );
    let checkExistenceRes = await this.validateReferencedFile(
      staticTemplateFile,
      defaultAppDirectry ?? appDirectory
    );
    if (checkExistenceRes.isOk()) {
      return staticTemplateFile;
    }

    if (defaultAppDirectry) {
      // Try generated folder
      staticTemplateFile = path.resolve(
        appDirectory,
        func.capabilities!.response_semantics!.static_template!.file as string
      );
      checkExistenceRes = await this.validateReferencedFile(staticTemplateFile, appDirectory);
    }

    if (checkExistenceRes.isErr()) {
      delete func.capabilities!.response_semantics!.static_template;
      context.logProvider.warning(
        getLocalizedString(
          "plugins.appstudio.createPackage.aiPlugin.invalidFilePropertyWarning",
          pluginFile,
          func.name
        )
      );
      return undefined;
    }

    return staticTemplateFile;
  }
}
