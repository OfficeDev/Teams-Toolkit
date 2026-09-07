// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks/lib";
import {
  Colors,
  DeclarativeCopilotManifestSchema,
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
import * as workerAgents from "../../../core/workerAgents";
import { UserCancelError } from "../../../error";
import { FileNotFoundError, InvalidActionInputError, JSONSyntaxError } from "../../../error/common";
import {
  AppPackageFileSystemError,
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
      const validationResult = await this.validateReferencedFile(filePath, appDirectory, file);
      if (validationResult.isErr()) {
        return err(validationResult.error);
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
        const fileName = path.resolve(appDirectory, file);
        const validationResult = await this.validateReferencedFile(fileName, appDirectory, file);
        if (validationResult.isErr()) {
          return err(validationResult.error);
        }
      }
    }
    if (defaultLanguageFile) {
      const fileName = path.resolve(appDirectory, defaultLanguageFile);
      const validationResult = await this.validateReferencedFile(
        fileName,
        appDirectory,
        defaultLanguageFile
      );
      if (validationResult.isErr()) {
        return err(validationResult.error);
      }
    }

    const zip = new AdmZip();
    const resolvedJsonFiles = new Map<string, string>();
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
        appDirectory,
        apiSpecificationFile
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
              appDirectory,
              command.apiResponseRenderingTemplateFile
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
        appDirectory,
        declarativeAgents[0].file
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
          : undefined,
        resolvedJsonFiles
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
        const workerManifestSnapshots = new Map<string, DeclarativeCopilotManifestSchema>();
        const graphResult = await workerAgents.validateWorkerAgentGraph({
          projectPath: context.projectPath,
          packageRootPath: hasTTKGeneratedFolder ? generatedFolder : appDirectory,
          rootManifestPath: declarativeAgentManifestFile,
          rootDocument: manifest,
          signal: context.signal,
          loadManifest: async (manifestPath) => {
            const result = await copilotGptManifestUtils.getManifest(manifestPath, context);
            if (result.isErr()) return err(result.error);
            workerManifestSnapshots.set(manifestPath, result.value);
            return ok({
              content: JSON.stringify(result.value, undefined, 4),
              document: result.value,
            });
          },
        });
        if (graphResult.isErr()) return err(graphResult.error);
        const graphError = workerAgents.workerValidationError(graphResult.value);
        if (graphError) return err(graphError);

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
              hasTTKGeneratedFolder ? appDirectory : undefined,
              resolvedJsonFiles,
              pluginFile
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
                  appDirectory,
                  file
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
                  appDirectory,
                  skill.folder
                );
                if (checkExistenceRes.isErr()) {
                  return err(checkExistenceRes.error);
                }

                const skillMdPath = path.join(skillFolderAbsolutePath, "SKILL.md");
                if (!(await fs.pathExists(skillMdPath))) {
                  return err(
                    new FileNotFoundError(
                      actionName,
                      path.basename(skillMdPath),
                      "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
                    )
                  );
                }

                await this.addLocalFolderRecursive(zip, skillFolderAbsolutePath, appDirectory);
              }
            }
          }
        }

        for (const worker of graphResult.value.localManifests) {
          if (context.signal?.aborted) return err(new UserCancelError(actionName));
          const addWorkerResult = await this.addResolvedManifestSnapshot(
            zip,
            normalizePath(worker.packagePath, true),
            worker.absolutePath,
            worker.content,
            shouldwriteAllManifest ? path.join(jsonFileDir, worker.packagePath) : undefined,
            resolvedJsonFiles
          );
          if (context.signal?.aborted) return err(new UserCancelError(actionName));
          if (addWorkerResult.isErr()) return err(addWorkerResult.error);
          const workerManifest = workerManifestSnapshots.get(worker.absolutePath);
          if (!workerManifest) {
            return err(
              new InvalidActionInputError(
                actionName,
                [worker.packagePath],
                "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
              )
            );
          }
          const workerDependencyResult = await this.addWorkerAgentDependencies(
            zip,
            workerManifest,
            worker.lexicalPath,
            worker.packagePath,
            appDirectory,
            hasTTKGeneratedFolder ? generatedFolder : appDirectory,
            context,
            !shouldwriteAllManifest ? undefined : jsonFileDir,
            resolvedJsonFiles
          );
          if (workerDependencyResult.isErr()) return err(workerDependencyResult.error);
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
        appDirectory,
        appDirectory,
        appDirectory,
        context.signal
      );
      if (addSkillsRes.isErr()) {
        return err(addSkillsRes.error);
      }
    }

    const teamsManifestAgentConnectors = (
      manifest as TeamsManifestVDevPreview.TeamsManifestVDevPreview
    ).agentConnectors;
    if (teamsManifestAgentConnectors?.length) {
      const addConnectorsRes = await this.addAgentConnectorFiles(
        zip,
        teamsManifestAgentConnectors,
        appDirectory
      );
      if (addConnectorsRes.isErr()) {
        return err(addConnectorsRes.error);
      }
    }

    if (resolvedJsonFiles.has(teamsManifestJsonFileName)) {
      return err(
        new InvalidActionInputError(
          actionName,
          ["outputFolder"],
          "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
        )
      );
    }
    resolvedJsonFiles.set(teamsManifestJsonFileName, JSON.stringify(manifest, null, 4));
    const outputFileNames = [zipFileName, ...resolvedJsonFiles.keys()];
    const canonicalOutputPaths: string[] = [];
    let hasInvalidOutputPath = false;
    for (const outputFileName of outputFileNames) {
      let canonicalOutputPath: string;
      try {
        if (await this.isDirectory(outputFileName)) {
          hasInvalidOutputPath = true;
          break;
        }
        canonicalOutputPath = await this.getCanonicalDestinationPath(outputFileName);
      } catch (error) {
        return err(new AppPackageFileSystemError(error, outputFileName));
      }
      if (
        canonicalOutputPaths.some(
          (outputPath) =>
            this.isPathContained(outputPath, canonicalOutputPath) ||
            this.isPathContained(canonicalOutputPath, outputPath)
        )
      ) {
        hasInvalidOutputPath = true;
        break;
      }
      canonicalOutputPaths.push(canonicalOutputPath);
    }
    if (hasInvalidOutputPath) {
      return err(
        new InvalidActionInputError(
          actionName,
          ["outputZipPath", args.outputJsonPath ? "outputJsonPath" : "outputFolder"],
          "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
        )
      );
    }

    const stagedZipFileName = this.getStagedOutputPath(zipFileName);
    const maxPackageSize = 10 * 1024 * 1024;
    try {
      zip.writeZip(stagedZipFileName);

      const zipStats = await fs.stat(stagedZipFileName);
      if (zipStats.size > maxPackageSize) {
        return err(new AppPackageSizeExceededError(zipStats.size, maxPackageSize));
      }

      await this.publishOutputs(stagedZipFileName, zipFileName, resolvedJsonFiles);
    } catch (error) {
      return err(
        error instanceof AppPackageFileSystemError
          ? error
          : new AppPackageFileSystemError(error, zipFileName)
      );
    } finally {
      await fs.remove(stagedZipFileName).catch(() => {});
    }

    const builtSuccess = [
      { content: "(√)Done: ", color: Colors.BRIGHT_GREEN },
      { content: "App Package ", color: Colors.BRIGHT_WHITE },
      { content: zipFileName, color: Colors.BRIGHT_MAGENTA },
      { content: " built successfully!", color: Colors.BRIGHT_WHITE },
    ];
    context.logProvider.info(builtSuccess);
    return ok(new Map());
  }

  private async addWorkerAgentDependencies(
    zip: AdmZip,
    manifest: DeclarativeCopilotManifestSchema,
    manifestPath: string,
    manifestReference: string,
    appDirectory: string,
    packageRootDirectory: string,
    context: WrapDriverContext,
    outputDirectory?: string,
    resolvedJsonFiles?: Map<string, string>
  ): Promise<Result<undefined, FxError>> {
    if (manifest.actions !== undefined && !Array.isArray(manifest.actions)) {
      return err(
        new InvalidActionInputError(
          actionName,
          [`actions (in ${path.basename(manifestPath)}) must be an array`],
          "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
        )
      );
    }
    if (manifest.capabilities !== undefined && !Array.isArray(manifest.capabilities)) {
      return err(
        new InvalidActionInputError(
          actionName,
          [`capabilities (in ${path.basename(manifestPath)}) must be an array`],
          "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
        )
      );
    }
    if (Array.isArray(manifest.actions)) {
      for (const pluginFile of manifest.actions.map((action) => action.file)) {
        if (context.signal?.aborted) return err(new UserCancelError(actionName));
        const pluginFileAbsolutePath = path.resolve(path.dirname(manifestPath), pluginFile);
        const pluginFileRelativePath = path.relative(packageRootDirectory, pluginFileAbsolutePath);
        const addPluginResult = await this.addPlugin(
          zip,
          normalizePath(pluginFileRelativePath, manifestReference.concat(pluginFile).includes("/")),
          packageRootDirectory,
          context,
          outputDirectory,
          undefined,
          resolvedJsonFiles,
          pluginFile
        );
        if (context.signal?.aborted) return err(new UserCancelError(actionName));
        if (addPluginResult.isErr()) return err(addPluginResult.error);
      }
    }
    if (Array.isArray(manifest.capabilities)) {
      const files = new Set<string>();
      for (const capability of manifest.capabilities.filter(
        (item) => item.name === DeclarativeCopilotCapabilityName.EmbeddedKnowledge
      )) {
        for (const file of capability.files ?? []) {
          if (file.file) files.add(file.file);
        }
      }
      for (const file of files) {
        if (context.signal?.aborted) return err(new UserCancelError(actionName));
        const absolutePath = path.resolve(path.dirname(manifestPath), file);
        const validationResult = await this.validateReferencedFile(
          absolutePath,
          appDirectory,
          file
        );
        if (context.signal?.aborted) return err(new UserCancelError(actionName));
        if (validationResult.isErr()) return err(validationResult.error);
        this.addFileInZip(
          zip,
          path.dirname(path.relative(packageRootDirectory, absolutePath)),
          absolutePath
        );
      }
    }
    if (featureFlagManager.getBooleanValue(FeatureFlags.AgentSkillsManifest)) {
      const legacySkills = Reflect.get(manifest, "x-agent_skills");
      const agentSkills = manifest.agent_skills ?? legacySkills;
      if (Array.isArray(agentSkills)) {
        const folders: { folder: string }[] = [];
        for (const skill of agentSkills) {
          if (typeof skill === "object" && skill !== null) {
            const folder = Reflect.get(skill, "folder");
            if (typeof folder === "string") folders.push({ folder });
          }
        }
        const addSkillsResult = await this.addAgentSkillFolders(
          zip,
          folders,
          appDirectory,
          path.dirname(manifestPath),
          packageRootDirectory,
          context.signal
        );
        if (context.signal?.aborted) return err(new UserCancelError(actionName));
        if (addSkillsResult.isErr()) return err(addSkillsResult.error);
      }
    }
    return ok(undefined);
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
    directory: string,
    originalReference?: string
  ): Promise<Result<undefined, FxError>> {
    const displayDirectory = path.resolve(directory);
    const resolvedFile = path.resolve(file);
    const fileReference = originalReference ?? path.relative(displayDirectory, resolvedFile);
    if (!this.isPathContained(directory, file)) {
      return err(
        new InvalidFileOutsideOfTheDirectotryError(fileReference, resolvedFile, displayDirectory)
      );
    }

    if (!(await fs.pathExists(file))) {
      return err(
        new FileNotFoundError(
          actionName,
          path.basename(file),
          "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
        )
      );
    }

    let realFile: string;
    let realDirectory: string;
    try {
      realFile = await fs.realpath(file);
      realDirectory = await fs.realpath(directory);
    } catch (error) {
      return err(new AppPackageFileSystemError(error, file));
    }
    if (!this.isPathContained(realDirectory, realFile)) {
      return err(
        new InvalidFileOutsideOfTheDirectotryError(fileReference, realFile, displayDirectory)
      );
    }

    return ok(undefined);
  }

  private isPathContained(directory: string, file: string): boolean {
    const relativePath = path.relative(directory, file);
    return (
      relativePath === "" ||
      (relativePath !== ".." &&
        !relativePath.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relativePath))
    );
  }

  private async addAgentSkillFolders(
    zip: AdmZip,
    agentSkills: { folder: string }[],
    appDirectory: string,
    referenceDirectory = appDirectory,
    packageRootDirectory = appDirectory,
    signal?: AbortSignal
  ): Promise<Result<undefined, FxError>> {
    for (const skill of agentSkills) {
      if (signal?.aborted) return err(new UserCancelError(actionName));
      const skillFolderAbs = path.resolve(referenceDirectory, skill.folder);
      const validationResult = await this.validateReferencedFile(
        skillFolderAbs,
        appDirectory,
        skill.folder
      );
      if (signal?.aborted) return err(new UserCancelError(actionName));
      if (validationResult.isErr()) {
        return err(validationResult.error);
      }
      const skillMdPath = path.join(skillFolderAbs, "SKILL.md");
      const skillExists = await fs.pathExists(skillMdPath);
      if (signal?.aborted) return err(new UserCancelError(actionName));
      if (!skillExists) {
        return err(
          new FileNotFoundError(
            actionName,
            path.basename(skillMdPath),
            "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
          )
        );
      }
      const addFolderResult = await this.addLocalFolderRecursive(
        zip,
        skillFolderAbs,
        appDirectory,
        packageRootDirectory,
        signal
      );
      if (addFolderResult.isErr()) return err(addFolderResult.error);
    }
    return ok(undefined);
  }

  private async addAgentConnectorFiles(
    zip: AdmZip,
    agentConnectors: TeamsManifestVDevPreview.AgentConnector[],
    appDirectory: string
  ): Promise<Result<undefined, FxError>> {
    for (const connector of agentConnectors) {
      const mcpToolDescriptionFile =
        connector.toolSource?.remoteMcpServer?.mcpToolDescription?.file;
      if (!mcpToolDescriptionFile) {
        continue;
      }
      const mcpFileAbsolutePath = path.resolve(appDirectory, mcpToolDescriptionFile);
      const checkExistenceRes = await this.validateReferencedFile(
        mcpFileAbsolutePath,
        appDirectory,
        mcpToolDescriptionFile
      );
      if (checkExistenceRes.isErr()) {
        return err(checkExistenceRes.error);
      }
      const dir = path.dirname(mcpToolDescriptionFile);
      this.addFileInZip(zip, dir, mcpFileAbsolutePath);
    }
    return ok(undefined);
  }

  private async addLocalFolderRecursive(
    zip: AdmZip,
    folderAbs: string,
    appDirectory: string,
    packageRootDirectory = appDirectory,
    signal?: AbortSignal
  ): Promise<Result<undefined, FxError>> {
    if (signal?.aborted) return err(new UserCancelError(actionName));
    const entries = await fs.readdir(folderAbs, { withFileTypes: true });
    if (signal?.aborted) return err(new UserCancelError(actionName));
    const realAppDirectory = await fs.realpath(appDirectory);
    if (signal?.aborted) return err(new UserCancelError(actionName));
    for (const entry of entries) {
      if (signal?.aborted) return err(new UserCancelError(actionName));
      const entryAbs = path.join(folderAbs, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        const addFolderResult = await this.addLocalFolderRecursive(
          zip,
          entryAbs,
          appDirectory,
          packageRootDirectory,
          signal
        );
        if (addFolderResult.isErr()) return err(addFolderResult.error);
      } else if (entry.isFile()) {
        const realEntryAbs = await fs.realpath(entryAbs);
        if (signal?.aborted) return err(new UserCancelError(actionName));
        if (!this.isPathContained(realAppDirectory, realEntryAbs)) {
          continue;
        }
        const relDir = path.dirname(path.relative(packageRootDirectory, entryAbs));
        zip.addLocalFile(entryAbs, normalizePath(relDir, true));
      }
    }
    return ok(undefined);
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
    defaultAppDirectry?: string,
    resolvedJsonFiles?: Map<string, string>,
    originalReference?: string
  ): Promise<Result<undefined, FxError>> {
    const pluginFile = path.resolve(appDirectory, pluginRelativePath);
    const checkExistenceRes = await this.validateReferencedFile(
      pluginFile,
      appDirectory,
      originalReference ?? pluginRelativePath
    );
    if (context.signal?.aborted) return err(new UserCancelError(actionName));
    if (checkExistenceRes.isErr()) {
      return err(checkExistenceRes.error);
    }

    let pluginFileContent;
    try {
      pluginFileContent = (await fs.readJSON(pluginFile)) as PluginManifestSchema;
      if (context.signal?.aborted) return err(new UserCancelError(actionName));
    } catch (e) {
      return err(new JSONSyntaxError(pluginFile, e, actionName));
    }

    let containExternalAdaptiveCard = false;
    if (pluginFileContent.functions) {
      for (const func of pluginFileContent.functions) {
        if (func.capabilities?.response_semantics?.static_template?.file) {
          const staticTemplateFileResult = await this.getAdaptiveCardTemplateFile(
            context,
            pluginFile,
            func,
            appDirectory,
            defaultAppDirectry
          );
          if (context.signal?.aborted) return err(new UserCancelError(actionName));
          if (staticTemplateFileResult.isErr()) {
            return err(staticTemplateFileResult.error);
          }
          const staticTemplateFile = staticTemplateFileResult.value;
          if (!staticTemplateFile) {
            continue;
          }

          if (Object.keys(func.capabilities.response_semantics.static_template).length > 1) {
            context.logProvider.warning(
              getLocalizedString(
                "plugins.appstudio.createPackage.aiPlugin.overrideWarning",
                path.basename(pluginFile),
                func.name
              )
            );
          }

          const staticTemplateFileContent = await fs.readJSON(staticTemplateFile);
          if (context.signal?.aborted) return err(new UserCancelError(actionName));
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
      if (context.signal?.aborted) return err(new UserCancelError(actionName));
    }

    let addFileWithVariableRes: Result<undefined, FxError>;
    try {
      if (namespaceContainsUnderscore || containExternalAdaptiveCard) {
        const processedFunctionRes = await expandVariableWithFunction(
          JSON.stringify(pluginFileContent),
          context,
          undefined,
          true,
          ManifestType.PluginManifest,
          pluginFile
        );
        if (context.signal?.aborted) return err(new UserCancelError(actionName));
        if (processedFunctionRes.isErr()) {
          return err(processedFunctionRes.error);
        }
        pluginFileContent = JSON.parse(processedFunctionRes.value);
        tempFolder = await fs.mkdtemp(path.join(appDirectory, ".tmp-"));
        if (context.signal?.aborted) return err(new UserCancelError(actionName));
        const tempFolderValidation = await this.validateReferencedFile(tempFolder, appDirectory);
        if (context.signal?.aborted) return err(new UserCancelError(actionName));
        if (tempFolderValidation.isErr()) {
          return err(tempFolderValidation.error);
        }
        tmpPluginFile = path.join(tempFolder, `tmp-ai-plugin-${uuid.v4().slice(0, 6)}.json`);
        await fs.writeJSON(tmpPluginFile, pluginFileContent, { spaces: 4 });
        if (context.signal?.aborted) return err(new UserCancelError(actionName));
      }

      addFileWithVariableRes = await this.addFileWithVariable(
        zip,
        pluginRelativePath,
        tmpPluginFile,
        ManifestType.PluginManifest,
        context,
        !outputDirectory
          ? undefined
          : path.join(outputDirectory, path.relative(appDirectory, pluginFile)),
        resolvedJsonFiles
      );
      if (context.signal?.aborted) return err(new UserCancelError(actionName));
    } finally {
      if (tempFolder) {
        await fs.remove(tempFolder);
      }
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
    if (context.signal?.aborted) return err(new UserCancelError(actionName));
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
          const checkExistenceRes = await this.validateReferencedFile(
            specFile,
            appDirectory,
            runtime.spec.url
          );
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
          const checkExistenceRes = await this.validateReferencedFile(
            mcpFile,
            appDirectory,
            (runtime as any).spec.mcp_tool_description.file
          );
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
    outputPath?: string,
    resolvedJsonFiles?: Map<string, string>
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

    return this.addResolvedManifestSnapshot(
      zip,
      entryName,
      filePath,
      content,
      outputPath,
      resolvedJsonFiles
    );
  }

  private async addResolvedManifestSnapshot(
    zip: AdmZip,
    entryName: string,
    filePath: string,
    content: string,
    outputPath?: string,
    resolvedJsonFiles?: Map<string, string>
  ): Promise<Result<undefined, FxError>> {
    const attr = await fs.stat(filePath);
    zip.addFile(entryName, Buffer.from(content), "", attr.mode);

    if (outputPath && path.extname(outputPath).toLowerCase() === ".json") {
      const resolvedOutputPath = `${outputPath.substring(0, outputPath.length - 5)}.${
        process.env.TEAMSFX_ENV!
      }.json`;
      if (resolvedJsonFiles?.has(resolvedOutputPath)) {
        return err(
          new InvalidActionInputError(
            actionName,
            ["outputFolder"],
            "https://aka.ms/teamsfx-actions/teamsapp-zipAppPackage"
          )
        );
      }
      resolvedJsonFiles?.set(resolvedOutputPath, content);
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
    await fs.outputFile(jsonFileName, content);
    await fs.chmod(jsonFileName, 0o444);
  }

  private getStagedOutputPath(outputPath: string): string {
    return path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.${uuid.v4()}.tmp`);
  }

  private async isDirectory(filePath: string): Promise<boolean> {
    try {
      return (await fs.stat(filePath)).isDirectory();
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  private async getCanonicalDestinationPath(outputPath: string): Promise<string> {
    try {
      return await fs.realpath(outputPath);
    } catch (error) {
      if (!this.isFileNotFoundError(error)) {
        throw error;
      }
    }

    const missingDirectories: string[] = [];
    let ancestor = path.dirname(outputPath);
    while (true) {
      try {
        const realAncestor = await fs.realpath(ancestor);
        return path.join(realAncestor, ...missingDirectories, path.basename(outputPath));
      } catch (error) {
        if (!this.isFileNotFoundError(error)) {
          throw error;
        }
        const parent = path.dirname(ancestor);
        if (parent === ancestor) {
          throw error;
        }
        missingDirectories.unshift(path.basename(ancestor));
        ancestor = parent;
      }
    }
  }

  private async publishOutputs(
    stagedZipFile: string,
    outputZipFile: string,
    jsonFiles: Map<string, string>
  ): Promise<void> {
    const stagedJsonFiles = new Map<string, string>();
    const backupFiles = new Map<string, string>();
    const publishedFiles: string[] = [];
    let publicationError: unknown;
    try {
      for (const [jsonFile, content] of jsonFiles) {
        const stagedJsonFile = this.getStagedOutputPath(jsonFile);
        stagedJsonFiles.set(jsonFile, stagedJsonFile);
        await this.writeJsonFile(stagedJsonFile, content);
      }
      for (const [jsonFile, stagedJsonFile] of stagedJsonFiles) {
        await this.backUpOutputFile(jsonFile, backupFiles);
        await fs.rename(stagedJsonFile, jsonFile);
        publishedFiles.push(jsonFile);
      }
      await this.backUpOutputFile(outputZipFile, backupFiles);
      await fs.rename(stagedZipFile, outputZipFile);
      publishedFiles.push(outputZipFile);
    } catch (error) {
      let rollbackError: unknown;
      for (const publishedFile of publishedFiles.reverse()) {
        try {
          await fs.chmod(publishedFile, 0o777);
        } catch (cleanupError) {
          if (!this.isFileNotFoundError(cleanupError)) {
            rollbackError ??= cleanupError;
          }
        }
        try {
          await fs.remove(publishedFile);
        } catch (cleanupError) {
          rollbackError ??= cleanupError;
        }
      }
      for (const [outputFile, backupFile] of Array.from(backupFiles.entries()).reverse()) {
        try {
          await fs.rename(backupFile, outputFile);
        } catch (restoreError) {
          rollbackError ??= restoreError;
        }
      }
      if (rollbackError) {
        publicationError = rollbackError;
      } else {
        publicationError = error;
      }
    }

    let stagedCleanupError: unknown;
    for (const stagedJsonFile of stagedJsonFiles.values()) {
      try {
        await fs.remove(stagedJsonFile);
      } catch (error) {
        stagedCleanupError ??= error;
      }
    }
    if (publicationError) {
      throw new AppPackageFileSystemError(publicationError, outputZipFile);
    }
    if (stagedCleanupError) {
      throw new AppPackageFileSystemError(stagedCleanupError, outputZipFile);
    }

    for (const backupFile of backupFiles.values()) {
      await fs.chmod(backupFile, 0o600).catch(() => {});
      await fs.remove(backupFile).catch(() => {});
    }
  }

  private async backUpOutputFile(
    outputFile: string,
    backupFiles: Map<string, string>
  ): Promise<void> {
    const backupFile = this.getStagedOutputPath(outputFile);
    try {
      await fs.rename(outputFile, backupFile);
      backupFiles.set(outputFile, backupFile);
    } catch (error) {
      if (!this.isFileNotFoundError(error)) {
        throw error;
      }
    }
  }

  private isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }

  private async getAdaptiveCardTemplateFile(
    context: WrapDriverContext,
    pluginFile: string,
    func: FunctionObject,
    appDirectory: string,
    defaultAppDirectry?: string
  ): Promise<Result<string | undefined, FxError>> {
    let staticTemplateFile = path.resolve(
      defaultAppDirectry ?? path.dirname(pluginFile),
      func.capabilities!.response_semantics!.static_template!.file as string
    );
    let checkExistenceRes = await this.validateReferencedFile(
      staticTemplateFile,
      defaultAppDirectry ?? appDirectory,
      func.capabilities!.response_semantics!.static_template!.file as string
    );
    if (checkExistenceRes.isOk()) {
      return ok(staticTemplateFile);
    }
    if (checkExistenceRes.error instanceof InvalidFileOutsideOfTheDirectotryError) {
      return err(checkExistenceRes.error);
    }

    if (defaultAppDirectry) {
      // Try generated folder
      staticTemplateFile = path.resolve(
        appDirectory,
        func.capabilities!.response_semantics!.static_template!.file as string
      );
      checkExistenceRes = await this.validateReferencedFile(
        staticTemplateFile,
        appDirectory,
        func.capabilities!.response_semantics!.static_template!.file as string
      );
    }

    if (checkExistenceRes.isErr()) {
      if (checkExistenceRes.error instanceof InvalidFileOutsideOfTheDirectotryError) {
        return err(checkExistenceRes.error);
      }
      delete func.capabilities!.response_semantics!.static_template;
      context.logProvider.warning(
        getLocalizedString(
          "plugins.appstudio.createPackage.aiPlugin.invalidFilePropertyWarning",
          path.basename(pluginFile),
          func.name
        )
      );
      return ok(undefined);
    }

    return ok(staticTemplateFile);
  }
}
