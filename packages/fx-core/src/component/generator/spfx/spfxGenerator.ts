// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */

import { hooks } from "@feathersjs/hooks/lib";
import {
  AppPackageFolderName,
  Context,
  err,
  FxError,
  GeneratorResult,
  Inputs,
  IProgressHandler,
  IStaticTab,
  LogLevel,
  ok,
  Platform,
  Result,
  Stage,
  SystemError,
  UserError,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { camelCase, merge } from "lodash";
import { EOL } from "os";
import * as path from "path";
import semver from "semver";
import * as util from "util";
import { jsonUtils } from "../../../common/jsonUtils";
import { getDefaultString, getLocalizedString } from "../../../common/localizeUtils";
import { FileNotFoundError, UserCancelError } from "../../../error";
import {
  ProgrammingLanguage,
  QuestionNames,
  SPFxVersionOptionIds,
} from "../../../question/constants";
import { TabCapabilityOptions } from "../../../question/scaffold/vsc/CapabilityOptions";
import { cpUtils } from "../../deps-checker";
import { manifestUtils } from "../../driver/teamsApp/utils/ManifestUtils";
import { ActionContext, ActionExecutionMW } from "../../middleware/actionExecutionMW";
import { envUtil } from "../../utils/envUtil";
import { DefaultTemplateGenerator } from "../defaultGenerator";
import { Generator } from "../generator";
import { TemplateInfo } from "../templates/templateInfo";
import { GeneratorChecker } from "./depsChecker/generatorChecker";
import { YoChecker } from "./depsChecker/yoChecker";
import {
  CannotFindPropertyfromJsonError,
  CopyExistingSPFxSolutionError,
  ImportSPFxSolutionError,
  LatestPackageInstallError,
  PackageTargetVersionInstallError,
  RetrieveSPFxInfoError,
  ScaffoldError,
  SolutionVersionMissingError,
  UpdateSPFxTemplateError,
  YoGeneratorScaffoldError,
} from "./error";
import { Constants, ManifestTemplate } from "./utils/constants";
import { ProgressHelper } from "./utils/progress-helper";
import { telemetryHelper } from "./utils/telemetry-helper";
import { TelemetryEvents, TelemetryProperty } from "./utils/telemetryEvents";
import { getShellOptionValue, Utils } from "./utils/utils";

export class SPFxGenerator {
  @hooks([
    ActionExecutionMW({
      enableTelemetry: true,
      telemetryComponentName: Constants.PLUGIN_DEV_NAME,
      telemetryEventName: TelemetryEvents.Generate,
      errorSource: Constants.PLUGIN_DEV_NAME,
    }),
  ])
  public static async generate(
    context: Context,
    inputs: Inputs,
    destinationPath: string,
    actionContext?: ActionContext
  ): Promise<Result<undefined, FxError>> {
    const spfxSolution = inputs[QuestionNames.SPFxSolution];
    merge(actionContext?.telemetryProps, {
      [TelemetryProperty.SPFxSolution]: spfxSolution,
    });

    if (spfxSolution === "new") {
      return await this.newSPFxProject(context, inputs, destinationPath);
    } else {
      return await this.importSPFxProject(context, inputs, destinationPath, actionContext);
    }
  }

  private static async newSPFxProject(
    context: Context,
    inputs: Inputs,
    destinationPath: string
  ): Promise<Result<undefined, FxError>> {
    const yeomanRes = await this.doYeomanScaffold(context, inputs, destinationPath);
    if (yeomanRes.isErr()) return err(yeomanRes.error);

    const templateRes = await Generator.generateTemplate(
      context,
      destinationPath,
      Constants.TEMPLATE_NAME,
      "ts"
    );
    if (templateRes.isErr()) return err(templateRes.error);

    return ok(undefined);
  }

  private static async importSPFxProject(
    context: Context,
    inputs: Inputs,
    destinationPath: string,
    actionContext?: ActionContext
  ): Promise<Result<undefined, FxError>> {
    const importProgress = context.userInteraction.createProgressBar(
      getLocalizedString("plugins.spfx.import.title"),
      3
    );
    await importProgress.start();

    const importDetails = [];
    try {
      // Copy & paste existing SPFx solution
      await importProgress.next(getLocalizedString("plugins.spfx.import.copyExistingSPFxSolution"));
      const spfxFolder = inputs[QuestionNames.SPFxFolder] as string;
      const destSpfxFolder = path.join(destinationPath, "src");
      importDetails.push(
        EOL +
          `(.) Processing: Copying existing SPFx solution from ${spfxFolder} to ${destSpfxFolder}...`
      );
      await this.copySPFxSolution(spfxFolder, destSpfxFolder);
      importDetails.push(`(√) Done: Succeeded to copy existing SPFx solution.`);

      // Retrieve solution info to generate template
      await importProgress.next(getLocalizedString("plugins.spfx.import.generateSPFxTemplates"));
      importDetails.push(`(.) Processing: Reading web part manifest in SPFx solution...`);
      const webpartManifest = await this.getWebpartManifest(spfxFolder);
      if (
        !webpartManifest ||
        !webpartManifest["id"] ||
        !webpartManifest["preconfiguredEntries"][0].title.default
      ) {
        importDetails.push(
          `(×) Error: Failed to Read web part manifest due to invalid ${
            !webpartManifest
              ? "web part manifest"
              : !webpartManifest["id"]
                ? "web part manifest id"
                : "preconfiguredEntries title in web part manifest file"
          }!`
        );
        throw RetrieveSPFxInfoError();
      }
      importDetails.push(`(√) Done: Succeeded to retrieve web part manifest in SPFx solution.`);
      if (!context.templateVariables) {
        context.templateVariables = Generator.getDefaultVariables(inputs[QuestionNames.AppName]);
      }

      const nodeVersion = await this.getNodeVersion(destSpfxFolder, context);
      const yoInfoPath = path.join(inputs[QuestionNames.SPFxFolder], Constants.YO_RC_FILE);
      const SPFxVersion = await this.getSolutionVersion(yoInfoPath);
      context.templateVariables["SpfxNodeVersion"] = nodeVersion;
      context.templateVariables["componentId"] = webpartManifest["id"];
      context.templateVariables["webpartName"] =
        webpartManifest["preconfiguredEntries"][0].title.default;
      context.templateVariables["useNewDevUrl"] = semver.gte(SPFxVersion, "1.21.0") ? "true" : "";

      importDetails.push(
        `(.) Processing: Generating SPFx project templates with app name: ${
          inputs[QuestionNames.AppName] as string
        }, component id: ${webpartManifest["id"] as string}, web part name: ${
          webpartManifest["preconfiguredEntries"][0].title.default as string
        }`
      );
      const templateRes = await Generator.generateTemplate(
        context,
        destinationPath,
        Constants.TEMPLATE_NAME,
        "ts"
      );
      if (templateRes.isErr()) {
        importDetails.push(`(×) Error: Failed to generate SPFx project templates!`);
        throw templateRes.error;
      }
      importDetails.push(`(√) Done: Succeeded to generate SPFx project templates.`);

      // Update manifest and related files
      await importProgress.next(getLocalizedString("plugins.spfx.import.updateTemplates"));
      await this.updateSPFxTemplate(
        spfxFolder,
        destinationPath,
        importDetails,
        semver.gte(SPFxVersion, "1.21.0")
      );
    } catch (error) {
      await importProgress.end(false);

      importDetails.push(
        getLocalizedString("plugins.spfx.import.log.fail", context.logProvider?.getLogFilePath())
      );
      await context.logProvider.logInFile(LogLevel.Info, importDetails.join(EOL));
      void context.logProvider.error(
        getLocalizedString("plugins.spfx.import.log.fail", context.logProvider?.getLogFilePath())
      );

      if (error instanceof UserError || error instanceof SystemError) {
        return err(error);
      }
      return err(ImportSPFxSolutionError(error as any));
    }

    await importProgress.end(true);

    importDetails.push(
      getLocalizedString("plugins.spfx.import.log.success", context.logProvider?.getLogFilePath())
    );
    await context.logProvider.logInFile(LogLevel.Info, importDetails.join(EOL));
    void context.logProvider.info(
      getLocalizedString("plugins.spfx.import.log.success", context.logProvider?.getLogFilePath())
    );
    void context.userInteraction.showMessage(
      "info",
      getLocalizedString("plugins.spfx.import.success", destinationPath),
      false
    );

    return ok(undefined);
  }

  public static async doYeomanScaffold(
    context: Context,
    inputs: Inputs,
    destinationPath: string
  ): Promise<Result<string, FxError>> {
    const ui = context.userInteraction;
    const progressHandler = await ProgressHelper.startScaffoldProgressHandler(
      ui,
      inputs.stage == Stage.addWebpart
    );
    let shouldInstallLocally =
      inputs[QuestionNames.SPFxInstallPackage] === SPFxVersionOptionIds.installLocally;
    try {
      const webpartName = inputs[QuestionNames.SPFxWebpartName] as string;
      const framework = inputs[QuestionNames.SPFxFramework] as string;
      const solutionName = inputs[QuestionNames.AppName] as string;
      const isAddSPFx = inputs.stage == Stage.addWebpart;

      const componentName = Utils.normalizeComponentName(webpartName);
      const componentNameCamelCase = camelCase(componentName);

      await progressHandler?.next(getLocalizedString("plugins.spfx.scaffold.dependencyCheck"));

      const yoChecker = new YoChecker(context.logProvider);
      const spGeneratorChecker = new GeneratorChecker(context.logProvider);

      let targetVersion = Constants.LatestVersion;
      let localVersion: string | undefined = undefined;

      if (isAddSPFx) {
        const yoInfoPath = path.join(inputs[QuestionNames.SPFxFolder], Constants.YO_RC_FILE);
        targetVersion = await this.getSolutionVersion(yoInfoPath);
        if (!targetVersion) {
          context.logProvider.error(
            getLocalizedString("plugins.spfx.addWebPart.cannotFindSolutionVersion", yoInfoPath)
          );
          throw SolutionVersionMissingError(yoInfoPath);
        }

        const versions = await Promise.all([
          spGeneratorChecker.findLocalInstalledVersion(),
          spGeneratorChecker.findGloballyInstalledVersion(undefined, false),
        ]);
        localVersion = versions[0];
        shouldInstallLocally = await this.shouldAddWebPartWithLocalDependencies(
          targetVersion,
          versions[1],
          localVersion,
          context
        );
      }

      if (shouldInstallLocally) {
        await this.ensureLocalDependencies(
          targetVersion,
          localVersion,
          inputs,
          context,
          yoChecker,
          spGeneratorChecker,
          progressHandler
        );
      } else {
        const isLowerVersion =
          !!inputs.globalSpfxPackageVersion &&
          semver.lt(
            inputs.globalSpfxPackageVersion,
            Constants.RecommendedLowestSpfxVersion.substring(1)
          );
        if (isLowerVersion) {
          context.telemetryReporter?.sendTelemetryEvent(TelemetryEvents.UseNotRecommendedVersion);
        }
      }

      await progressHandler?.next(
        getLocalizedString(
          isAddSPFx
            ? "driver.spfx.add.progress.scaffoldWebpart"
            : "plugins.spfx.scaffold.scaffoldProject"
        )
      );
      if (inputs.platform === Platform.VSCode) {
        (context.logProvider as any).outputChannel.show();
      }

      const yoEnv: NodeJS.ProcessEnv = process.env;
      if (yoEnv.PATH) {
        yoEnv.PATH = shouldInstallLocally
          ? `${yoChecker.getBinFolders().join(path.delimiter)}${path.delimiter}${
              process.env.PATH ?? ""
            }`
          : process.env.PATH;
      } else {
        yoEnv.Path = shouldInstallLocally
          ? `${yoChecker.getBinFolders().join(path.delimiter)}${path.delimiter}${
              process.env.Path ?? ""
            }`
          : process.env.Path;
      }

      const args = [
        shouldInstallLocally ? spGeneratorChecker.getSpGeneratorPath() : "@microsoft/sharepoint",
        "--skip-install",
        "true",
        "--component-type",
        "webpart",
        "--component-name",
        webpartName,
        "--environment",
        "spo",
        "--skip-feature-deployment",
        "true",
        "--is-domain-isolated",
        "false",
      ];
      if (framework) {
        args.push("--framework", framework);
      }
      if (solutionName) {
        args.push("--solution-name", `"${solutionName}"`);
      }

      try {
        await cpUtils.executeCommand(
          isAddSPFx ? inputs[QuestionNames.SPFxFolder] : destinationPath,
          context.logProvider,
          {
            timeout: 2 * 60 * 1000,
            env: yoEnv,
            shell: getShellOptionValue(),
          },
          "yo",
          ...args
        );
      } catch (yoError) {
        if ((yoError as any).message) {
          void context.logProvider.error((yoError as any).message);
        }
        throw YoGeneratorScaffoldError();
      }

      const newPath = path.join(destinationPath, "src");
      if (!isAddSPFx) {
        const currentPath = path.join(destinationPath, solutionName);
        await fs.rename(currentPath, newPath);
      }

      await progressHandler?.next(getLocalizedString("plugins.spfx.scaffold.updateManifest"));
      const manifestPath = `${newPath}/src/webparts/${componentNameCamelCase}/${componentName}WebPart.manifest.json`;
      const manifest = await fs.readFile(manifestPath, "utf8");
      let manifestString = manifest.toString();
      manifestString = manifestString.replace(
        `"supportedHosts": ["SharePointWebPart"]`,
        `"supportedHosts": ["SharePointWebPart", "TeamsPersonalApp", "TeamsTab"]`
      );
      await fs.writeFile(manifestPath, manifestString);

      const matchHashComment = new RegExp(/(\/\/ .*)/, "gi");
      const manifestJson = JSON.parse(manifestString.replace(matchHashComment, "").trim());
      const componentId = manifestJson.id;

      if (!context.templateVariables) {
        context.templateVariables = Generator.getDefaultVariables(solutionName ?? "");
      }

      if (shouldInstallLocally) {
        context.templateVariables["useNewDevUrl"] = "true";
      } else {
        const SPFxVersion = await spGeneratorChecker.findGloballyInstalledVersion(undefined, false);
        context.templateVariables["useNewDevUrl"] =
          SPFxVersion && semver.gte(SPFxVersion, "1.21.0") ? "true" : "";
      }

      if (!isAddSPFx) {
        context.templateVariables["componentId"] = componentId;
        context.templateVariables["webpartName"] = webpartName;

        const nodeVersion = await this.getNodeVersion(newPath, context);
        context.templateVariables["SpfxNodeVersion"] = nodeVersion;
      }

      // remove dataVersion() function, related issue: https://github.com/SharePoint/sp-dev-docs/issues/6469
      const webpartFile = `${newPath}/src/webparts/${componentNameCamelCase}/${componentName}WebPart.ts`;
      const codeFile = await fs.readFile(webpartFile, "utf8");
      let codeString = codeFile.toString();
      codeString = codeString.replace(
        `  protected get dataVersion(): Version {\r\n    return Version.parse('1.0');\r\n  }\r\n\r\n`,
        ``
      );
      codeString = codeString.replace(
        `import { Version } from '@microsoft/sp-core-library';\r\n`,
        ``
      );
      await fs.writeFile(webpartFile, codeString);

      // remove .vscode
      const debugPath = `${newPath}/.vscode`;
      if (await fs.pathExists(debugPath)) {
        await fs.remove(debugPath);
      }

      await progressHandler?.end(true);
      return ok(componentId);
    } catch (error) {
      await progressHandler?.end(false);
      return err(ScaffoldError(error as Error));
    }
  }

  public static async getSolutionVersion(yoInfoPath: string): Promise<string> {
    if (await fs.pathExists(yoInfoPath)) {
      const yoInfo = await fs.readJson(yoInfoPath);
      if (yoInfo["@microsoft/generator-sharepoint"]) {
        return yoInfo["@microsoft/generator-sharepoint"][Constants.YO_RC_VERSION];
      }
    } else {
      throw new FileNotFoundError(Constants.PLUGIN_NAME, yoInfoPath);
    }
    return "";
  }

  private static async ensureLocalDependencies(
    targetSPFxVersion: string,
    localSPFxVersion: string | undefined,
    inputs: Inputs,
    context: Context,
    yoChecker: YoChecker,
    spGeneratorChecker: GeneratorChecker,
    progressHandler?: IProgressHandler
  ) {
    let needInstallYo = false;
    let needInstallGenerator = false;
    const isAddWebPart = targetSPFxVersion !== Constants.LatestVersion;

    // yo
    if (!isAddWebPart) {
      const latestYoInstalled = await yoChecker.isLatestInstalled();
      needInstallYo = !latestYoInstalled;
    } else {
      const localYoVersion = await yoChecker.findLocalInstalledVersion();
      needInstallYo = !localYoVersion;
    }

    // spfx generator
    if (!isAddWebPart) {
      const latestGeneratorInstalled = await spGeneratorChecker.isLatestInstalled(
        inputs.latestSpfxPackageVersion
      );
      needInstallGenerator = !latestGeneratorInstalled;
    } else {
      // we have check and confirmed with user before install/upgrade dependencies for user
      needInstallGenerator = !localSPFxVersion || semver.lt(localSPFxVersion, targetSPFxVersion);
    }

    if (needInstallYo || needInstallGenerator) {
      await progressHandler?.next(getLocalizedString("plugins.spfx.scaffold.dependencyInstall"));

      if (needInstallYo) {
        const yoRes = await yoChecker.ensureDependency(context, Constants.LatestVersion);
        if (yoRes.isErr()) {
          if (isAddWebPart) {
            throw PackageTargetVersionInstallError(
              Constants.YeomanPackageName,
              Constants.LatestVersion
            );
          } else {
            throw LatestPackageInstallError();
          }
        }
      }

      if (needInstallGenerator) {
        const spGeneratorRes = await spGeneratorChecker.ensureDependency(
          context,
          targetSPFxVersion
        );
        if (spGeneratorRes.isErr()) {
          if (isAddWebPart) {
            throw PackageTargetVersionInstallError(
              Constants.GeneratorPackageName,
              targetSPFxVersion
            );
          } else {
            throw LatestPackageInstallError();
          }
        }
      }
    }
  }

  // return shouldUseLocal
  public static async shouldAddWebPartWithLocalDependencies(
    solutionVersion: string,
    globalVersion: string | undefined,
    localVersion: string | undefined,
    context: Context
  ): Promise<boolean> {
    if (globalVersion === solutionVersion) {
      // use globally installed pacakge to add web part
      context.telemetryReporter?.sendTelemetryEvent(TelemetryEvents.CheckAddWebPartPackage, {
        [TelemetryProperty.PackageSource]: "global",
      });
      return false;
    }

    if (localVersion === solutionVersion) {
      // use locally installed package to add web part
      context.telemetryReporter?.sendTelemetryEvent(TelemetryEvents.CheckAddWebPartPackage, {
        [TelemetryProperty.PackageSource]: "local",
        [TelemetryProperty.UserAction]: "none",
      });
      return true;
    }

    const displayedSolutionVersion = `v${solutionVersion}`;
    const displayedLocalVersion = localVersion ? `v${localVersion}` : undefined;
    const displayedGlobalVersion = globalVersion ? `v${globalVersion}` : undefined;
    let userAnswer: string | undefined;
    let continueText: string;
    let defaultContinueText: string;
    if (!localVersion) {
      // ask user to confirm to install locally
      continueText = getLocalizedString("plugins.spfx.addWebPart.install");
      defaultContinueText = getDefaultString("plugins.spfx.addWebPart.install");
      const res = await context.userInteraction.showMessage(
        "info",
        getLocalizedString(
          "plugins.spfx.addWebPart.confirmInstall",
          displayedSolutionVersion,
          displayedSolutionVersion
        ),
        true,
        continueText
      );
      userAnswer = res.isOk() ? res.value : undefined;
    } else if (semver.lt(localVersion, solutionVersion)) {
      // ask user to confirm to upgrade local SPFx
      continueText = getLocalizedString("plugins.spfx.addWebPart.upgrade");
      defaultContinueText = getDefaultString("plugins.spfx.addWebPart.upgrade");
      const res = await context.userInteraction.showMessage(
        "info",
        getLocalizedString(
          "plugins.spfx.addWebPart.confirmUpgrade",
          displayedLocalVersion,
          displayedSolutionVersion,
          displayedSolutionVersion
        ),
        true,
        continueText
      );
      userAnswer = res.isOk() ? res.value : undefined;
    } else {
      // localVersion > solutionVersion
      // ask user to confirm to continue, learn more or cancel
      continueText = getLocalizedString("plugins.spfx.addWebPart.versionMismatch.continue");
      defaultContinueText = getDefaultString("plugins.spfx.addWebPart.versionMismatch.continue");
      let userSelected;
      const helpText = getLocalizedString("plugins.spfx.addWebPart.versionMismatch.help");
      do {
        const res = await context.userInteraction.showMessage(
          "info",
          getLocalizedString(
            "plugins.spfx.addWebPart.versionMismatch.continueConfirm",
            displayedSolutionVersion,
            displayedLocalVersion
          ),
          true,
          helpText,
          continueText
        );
        userSelected = res.isOk() ? res.value : undefined;
        if (userSelected === helpText) {
          context.telemetryReporter?.sendTelemetryEvent(TelemetryEvents.LearnMoreVersionMismatch);
          void context.userInteraction.openUrl(Constants.AddWebpartHelpLink);
        }
      } while (userSelected === helpText);

      userAnswer = userSelected;

      context.logProvider.log(
        LogLevel.Warning,
        displayedGlobalVersion
          ? getLocalizedString(
              "plugins.spfx.addWebPart.versionMismatch.output",
              displayedSolutionVersion,
              displayedGlobalVersion,
              displayedLocalVersion,
              displayedLocalVersion,
              Constants.AddWebpartHelpLink
            )
          : getLocalizedString(
              "plugins.spfx.addWebPart.versionMismatch.localOnly.output",
              displayedSolutionVersion,
              displayedLocalVersion,
              displayedLocalVersion,
              Constants.AddWebpartHelpLink
            )
      );
    }

    context.telemetryReporter?.sendTelemetryEvent(TelemetryEvents.CheckAddWebPartPackage, {
      [TelemetryProperty.PackageSource]: "local",
      [TelemetryProperty.UserAction]: defaultContinueText,
      [TelemetryProperty.ConfirmAddWebPartResult]: !userAnswer ? "Cancel" : defaultContinueText,
    });

    if (userAnswer !== continueText) {
      throw new UserCancelError(Constants.PLUGIN_NAME);
    } else {
      return true;
    }
  }

  public static async copySPFxSolution(src: string, dest: string) {
    try {
      await fs.ensureDir(dest);
      await fs.copy(src, dest, {
        overwrite: true,
        recursive: true,
        filter: (file) => {
          return file.indexOf("node_modules") < 0;
        },
      });
    } catch (e) {
      throw CopyExistingSPFxSolutionError(e as any);
    }
  }

  public static async getWebpartManifest(spfxFolder: string): Promise<any | undefined> {
    const webpartsDir = path.join(spfxFolder, "src", "webparts");
    if (await fs.pathExists(webpartsDir)) {
      const webparts = (await fs.readdir(webpartsDir)).filter((file) =>
        fs.statSync(path.join(webpartsDir, file)).isDirectory()
      );
      if (webparts.length < 1) {
        return undefined;
      }

      const webpartManifest = (await fs.readdir(path.join(webpartsDir, webparts[0]))).find((file) =>
        file.endsWith("WebPart.manifest.json")
      );
      if (webpartManifest === undefined) {
        throw new FileNotFoundError(
          Constants.PLUGIN_NAME,
          path.join(
            webpartsDir,
            webparts[0],
            `${webparts[0].split(path.sep).pop() as string}WebPart.manifest.json`
          ),
          Constants.IMPORT_HELP_LINK
        );
      }

      const matchHashComment = new RegExp(/(\/\/ .*)/, "gi");
      const manifest = JSON.parse(
        (await fs.readFile(path.join(webpartsDir, webparts[0], webpartManifest), "utf8"))
          .toString()
          .replace(matchHashComment, "")
          .trim()
      );
      return manifest;
    }
    return undefined;
  }

  public static async updateSPFxTemplate(
    spfxFolder: string,
    destinationPath: string,
    importDetails: string[],
    useNewDevUrl: boolean
  ) {
    try {
      importDetails.push(`(.) Processing: Loading manifest.local.json...`);
      const localManifestRes = await manifestUtils._readAppManifest(
        path.join(destinationPath, AppPackageFolderName, "manifest.local.json")
      );
      if (localManifestRes.isErr()) throw localManifestRes.error;
      const localManifest = localManifestRes.value;
      importDetails.push(`(√) Done: Succeeded to load manifest.local.json.`);

      importDetails.push(`(.) Processing: Loading manifest.json...`);
      const remoteManifestRes = await manifestUtils._readAppManifest(
        path.join(destinationPath, AppPackageFolderName, "manifest.json")
      );
      if (remoteManifestRes.isErr()) throw remoteManifestRes.error;
      let remoteManifest = remoteManifestRes.value;
      importDetails.push(`(√) Done: Succeeded to load manifest.json.`);

      const webpartsDir = path.join(spfxFolder, "src", "webparts");
      const webparts = (await fs.readdir(webpartsDir)).filter((file) =>
        fs.statSync(path.join(webpartsDir, file)).isDirectory()
      );
      if (webparts.length > 1) {
        importDetails.push(
          `(.) Processing: There're multiple web parts in the SPFx solution, exposing each of them in Teams manifest...`
        );
        for (let i = 1; i < webparts.length; i++) {
          const webpart = webparts[i];
          const webpartManifestFile = (await fs.readdir(path.join(webpartsDir, webpart))).find(
            (file) => file.endsWith("WebPart.manifest.json")
          );

          if (webpartManifestFile === undefined) {
            importDetails.push(
              ` [${i}] Web part manifest doesn't exist at ${path.join(
                webpartsDir,
                webpart,
                `${webpart as string}WebPart.manifest.json`
              )}, skip...`
            );
            continue;
          }

          const matchHashComment = new RegExp(/(\/\/ .*)/, "gi");
          const webpartManifest = JSON.parse(
            (await fs.readFile(path.join(webpartsDir, webpart, webpartManifestFile), "utf8"))
              .toString()
              .replace(matchHashComment, "")
              .trim()
          );
          importDetails.push(
            ` [${i}] Adding web part to Teams manifest with component id: ${
              webpartManifest["id"] as string
            }, web part name: ${
              webpartManifest["preconfiguredEntries"][0].title.default as string
            }...`
          );
          const componentId = webpartManifest["id"];
          const webpartName = webpartManifest["preconfiguredEntries"][0].title.default;
          const remoteStaticSnippet: IStaticTab = {
            entityId: componentId,
            name: webpartName,
            contentUrl: util.format(ManifestTemplate.REMOTE_CONTENT_URL, componentId),
            websiteUrl: ManifestTemplate.WEBSITE_URL,
            scopes: ["personal"],
          };
          const localStaticSnippet: IStaticTab = {
            entityId: componentId,
            name: webpartName,
            contentUrl: util.format(
              useNewDevUrl
                ? ManifestTemplate.LOCAL_CONTENT_URL_NEW
                : ManifestTemplate.LOCAL_CONTENT_URL,
              componentId
            ),
            websiteUrl: ManifestTemplate.WEBSITE_URL,
            scopes: ["personal"],
          };
          localManifest.staticTabs?.push(localStaticSnippet);
          remoteManifest.staticTabs?.push(remoteStaticSnippet);
        }
        importDetails.push(`(√) Done: Succeeded to expose additional web parts in Teams manifest.`);
      }

      if (await fs.pathExists(path.join(spfxFolder, "teams", "manifest.json"))) {
        importDetails.push(
          `(.) Processing: There's existing Teams manifest under ${path.join(
            spfxFolder,
            "teams",
            "manifest.json"
          )}, updating default template...`
        );
        const existingManifest = await fs.readJson(path.join(spfxFolder, "teams", "manifest.json"));

        importDetails.push(
          `(.) Processing: Writing existing app id in manifest.json to TEAMS_APP_ID in env.dev...`
        );
        await envUtil.writeEnv(destinationPath, "dev", { TEAMS_APP_ID: existingManifest.id });
        importDetails.push(`(√) Done: Succeeded to write existing app id to env.dev.`);

        importDetails.push(`(.) Processing: Updating default manifest with existing one...`);
        existingManifest.$schema = remoteManifest.$schema;
        existingManifest.manifestVersion = remoteManifest.manifestVersion;
        existingManifest.id = remoteManifest.id;
        existingManifest.icons = remoteManifest.icons;
        existingManifest.staticTabs = remoteManifest.staticTabs;
        existingManifest.configurableTabs = remoteManifest.configurableTabs;

        remoteManifest = existingManifest;
      }

      // Truncate manifest app name if exceed limitation
      localManifest.name.short = Utils.truncateAppShortName(localManifest.name.short);
      remoteManifest.name.short = Utils.truncateAppShortName(remoteManifest.name.short);

      importDetails.push(`(.) Processing: Writing to save changes to manifest.local.json...`);
      await manifestUtils._writeAppManifest(
        localManifest,
        path.join(destinationPath, AppPackageFolderName, "manifest.local.json")
      );
      importDetails.push(`(√) Done: Succeeded to write manifest.local.json.`);

      importDetails.push(`(.) Processing: Writing to save changes to manifest.json...`);
      await manifestUtils._writeAppManifest(
        remoteManifest,
        path.join(destinationPath, AppPackageFolderName, "manifest.json")
      );
      importDetails.push(`(√) Done: Succeeded to write manifest.json.`);

      let colorUpdated = false,
        outlineUpdated = false;
      if (await fs.pathExists(path.join(spfxFolder, "teams"))) {
        for (const file of await fs.readdir(path.join(spfxFolder, "teams"))) {
          if (file.endsWith("color.png") && !colorUpdated) {
            importDetails.push(
              `(.) Processing: Updating color.png with existing ${path.join(
                spfxFolder,
                "teams",
                file
              )}`
            );
            await fs.copyFile(
              path.join(spfxFolder, "teams", file),
              path.join(destinationPath, AppPackageFolderName, "color.png")
            );
            colorUpdated = true;
            importDetails.push(`(√) Done: Succeeded to update color.png.`);
          }
          if (file.endsWith("outline.png") && !outlineUpdated) {
            importDetails.push(
              `(.) Processing: Updating outline.png with existing ${path.join(
                spfxFolder,
                "teams",
                file
              )}`
            );
            await fs.copyFile(
              path.join(spfxFolder, "teams", file),
              path.join(destinationPath, AppPackageFolderName, "outline.png")
            );
            outlineUpdated = true;
            importDetails.push(`(√) Done: Succeeded to update outline.png.`);
          }
        }
      }
    } catch (e) {
      throw UpdateSPFxTemplateError(e as any);
    }
  }

  public static async getNodeVersion(solutionPath: string, context: Context): Promise<string> {
    const packageJsonPath = path.join(solutionPath, Constants.PACKAGE_JSON_FILE);

    if (await fs.pathExists(packageJsonPath)) {
      const jsonContentRes = await jsonUtils.readJSONFile(packageJsonPath);
      if (jsonContentRes.isErr()) {
        telemetryHelper.sendErrorEvent(
          context,
          TelemetryEvents.GetSpfxNodeVersionFailed,
          jsonContentRes.error
        );
      } else {
        const packageJson = jsonContentRes.value;
        if (!packageJson.engines) {
          telemetryHelper.sendErrorEvent(
            context,
            TelemetryEvents.GetSpfxNodeVersionFailed,
            CannotFindPropertyfromJsonError("engines")
          );
        } else {
          if (!packageJson.engines.node) {
            telemetryHelper.sendErrorEvent(
              context,
              TelemetryEvents.GetSpfxNodeVersionFailed,
              CannotFindPropertyfromJsonError("engines.node")
            );
          } else {
            return packageJson.engines.node as string;
          }
        }
      }
    } else {
      telemetryHelper.sendErrorEvent(
        context,
        TelemetryEvents.GetSpfxNodeVersionFailed,
        new FileNotFoundError(Constants.PLUGIN_NAME, packageJsonPath)
      );
    }

    return Constants.DEFAULT_NODE_VERSION;
  }
}

export class SPFxGeneratorNew extends DefaultTemplateGenerator {
  componentName = "spfx-new-generator";
  public override activate(context: Context, inputs: Inputs): boolean {
    const capability = inputs[QuestionNames.Capabilities] as string;
    const spfxSolution = inputs[QuestionNames.SPFxSolution];
    return capability === TabCapabilityOptions.SPFxTab().id && spfxSolution === "new";
  }
  public override async getTemplateInfos(
    context: Context,
    inputs: Inputs,
    destinationPath: string,
    actionContext?: ActionContext
  ): Promise<Result<TemplateInfo[], FxError>> {
    const spfxSolution = inputs[QuestionNames.SPFxSolution];
    merge(actionContext?.telemetryProps, {
      [TelemetryProperty.SPFxSolution]: spfxSolution,
    });
    const yeomanRes = await SPFxGenerator.doYeomanScaffold(context, inputs, destinationPath);
    if (yeomanRes.isErr()) return err(yeomanRes.error);
    return ok([
      {
        templateName: Constants.TEMPLATE_NAME,
        language: ProgrammingLanguage.TS,
        replaceMap: context.templateVariables || {},
      },
    ]);
  }
}

export class SPFxGeneratorImport extends DefaultTemplateGenerator {
  componentName = "spfx-import-generator";
  importDetails: string[] = [];
  public override activate(context: Context, inputs: Inputs): boolean {
    const capability = inputs[QuestionNames.Capabilities] as string;
    const spfxSolution = inputs[QuestionNames.SPFxSolution];
    return capability === TabCapabilityOptions.SPFxTab().id && spfxSolution !== "new";
  }

  public override async getTemplateInfos(
    context: Context,
    inputs: Inputs,
    destinationPath: string,
    actionContext?: ActionContext
  ): Promise<Result<TemplateInfo[], FxError>> {
    this.importDetails = [];
    try {
      const spfxSolution = inputs[QuestionNames.SPFxSolution];
      merge(actionContext?.telemetryProps, {
        [TelemetryProperty.SPFxSolution]: spfxSolution,
      });
      const spfxFolder = inputs[QuestionNames.SPFxFolder] as string;
      const destSpfxFolder = path.join(destinationPath, "src");
      this.importDetails.push(
        EOL +
          `(.) Processing: Copying existing SPFx solution from ${spfxFolder} to ${destSpfxFolder}...`
      );
      await SPFxGenerator.copySPFxSolution(spfxFolder, destSpfxFolder);
      this.importDetails.push(`(√) Done: Succeeded to copy existing SPFx solution.`);
      this.importDetails.push(`(.) Processing: Reading web part manifest in SPFx solution...`);
      const webpartManifest = await SPFxGenerator.getWebpartManifest(spfxFolder);
      if (
        !webpartManifest ||
        !webpartManifest["id"] ||
        !webpartManifest["preconfiguredEntries"][0].title.default
      ) {
        this.importDetails.push(
          `(×) Error: Failed to Read web part manifest due to invalid ${
            !webpartManifest
              ? "web part manifest"
              : !webpartManifest["id"]
                ? "web part manifest id"
                : "preconfiguredEntries title in web part manifest file"
          }!`
        );
        throw RetrieveSPFxInfoError();
      }
      this.importDetails.push(
        `(√) Done: Succeeded to retrieve web part manifest in SPFx solution.`
      );
      if (!context.templateVariables) {
        context.templateVariables = Generator.getDefaultVariables(inputs[QuestionNames.AppName]);
      }
      const nodeVersion = await SPFxGenerator.getNodeVersion(destSpfxFolder, context);
      const yoInfoPath = path.join(inputs[QuestionNames.SPFxFolder], Constants.YO_RC_FILE);
      const SPFxVersion = await SPFxGenerator.getSolutionVersion(yoInfoPath);
      context.templateVariables["SpfxNodeVersion"] = nodeVersion;
      context.templateVariables["componentId"] = webpartManifest["id"];
      context.templateVariables["webpartName"] =
        webpartManifest["preconfiguredEntries"][0].title.default;
      context.templateVariables["useNewDevUrl"] = semver.gte(SPFxVersion, "1.21.0") ? "true" : "";
      this.importDetails.push(
        `(.) Processing: Generating SPFx project templates with app name: ${
          inputs[QuestionNames.AppName] as string
        }, component id: ${webpartManifest["id"] as string}, web part name: ${
          webpartManifest["preconfiguredEntries"][0].title.default as string
        }`
      );
      return ok([
        {
          templateName: Constants.TEMPLATE_NAME,
          language: ProgrammingLanguage.TS,
          replaceMap: context.templateVariables,
        },
      ]);
    } catch (error) {
      this.importDetails.push(
        getLocalizedString("plugins.spfx.import.log.fail", context.logProvider?.getLogFilePath())
      );
      await context.logProvider.logInFile(LogLevel.Info, this.importDetails.join(EOL));
      void context.logProvider.error(
        getLocalizedString("plugins.spfx.import.log.fail", context.logProvider?.getLogFilePath())
      );

      if (error instanceof UserError || error instanceof SystemError) {
        return err(error);
      }
      return err(ImportSPFxSolutionError(error as any));
    }
  }

  public override async post(
    context: Context,
    inputs: Inputs,
    destinationPath: string,
    actionContext?: ActionContext
  ): Promise<Result<GeneratorResult, FxError>> {
    try {
      const spfxFolder = inputs[QuestionNames.SPFxFolder] as string;
      const useNewDevUrl = context.templateVariables?.["useNewDevUrl"] as string;
      await SPFxGenerator.updateSPFxTemplate(
        spfxFolder,
        destinationPath,
        this.importDetails,
        useNewDevUrl == "true"
      );
      this.importDetails.push(
        getLocalizedString("plugins.spfx.import.log.success", context.logProvider?.getLogFilePath())
      );
      await context.logProvider.logInFile(LogLevel.Info, this.importDetails.join(EOL));
      void context.logProvider.info(
        getLocalizedString("plugins.spfx.import.log.success", context.logProvider?.getLogFilePath())
      );
      void context.userInteraction.showMessage(
        "info",
        getLocalizedString("plugins.spfx.import.success", destinationPath),
        false
      );
      return ok({});
    } catch (error) {
      this.importDetails.push(
        getLocalizedString("plugins.spfx.import.log.fail", context.logProvider?.getLogFilePath())
      );
      await context.logProvider.logInFile(LogLevel.Info, this.importDetails.join(EOL));
      void context.logProvider.error(
        getLocalizedString("plugins.spfx.import.log.fail", context.logProvider?.getLogFilePath())
      );
      if (error instanceof UserError || error instanceof SystemError) {
        return err(error);
      }
      return err(ImportSPFxSolutionError(error as any));
    }
  }
}
