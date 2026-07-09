// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author yefuwang@microsoft.com
 */

import {
  Context,
  err,
  FxError,
  GeneratorResult,
  Inputs,
  ManifestUtil,
  ok,
  Result,
  TeamsManifestVDevPreview,
  UserError,
} from "@microsoft/teamsfx-api";
import fse from "fs-extra";
import * as officeAddinProject from "office-addin-project";
import path from "path";
import { getLocalizedString } from "../../../common/localizeUtils";
import { getUuid } from "../../../common/stringUtils";
import { assembleError } from "../../../error";
import { ProgrammingLanguage, QuestionNames } from "../../../question/constants";
import { ActionContext } from "../../middleware/actionExecutionMW";
import { envUtil } from "../../utils/envUtil";
import { DefaultTemplateGenerator } from "../defaultGenerator";
import { TemplateInfo } from "../templates/templateInfo";
import { TemplateNames } from "../templates/templateNames";
import { HelperMethods } from "./helperMethods";

export const officeAddinGeneratorDeps = {
  convertProject: officeAddinProject.convertProject,
};

/**
 * case 1: project-type=office-xml-addin-type AND addin-host=outlook
 * case 2: project-type=office-addin-type (addin-host=undefined)
 * case 3: project-type=outlook-addin-type (addin-host=undefined)
 */
export class OfficeAddinGenerator {
  public static async doScaffolding(
    context: Context,
    inputs: Inputs,
    destinationPath: string
  ): Promise<Result<undefined, FxError>> {
    const addinRoot = destinationPath;
    const fromFolder = inputs[QuestionNames.OfficeAddinFolder];
    const workingDir = process.cwd();
    const importProgressStr = getLocalizedString(
      "core.generator.officeAddin.importOfficeProject.title"
    );
    const importProgress = context.userInteraction.createProgressBar(importProgressStr, 3);

    process.chdir(addinRoot);
    try {
      if (fromFolder) {
        // Validate the source project early to avoid cryptic failures when the user
        // points at a manifest-only project.
        // Without `package.json`, that project package's `convertProject` would
        // ultimately call `Object.keys(content.scripts)` on undefined and throw runtime errors.
        const sourceManifestFileEarly: string = inputs[QuestionNames.OfficeAddinManifest];
        if (
          sourceManifestFileEarly &&
          sourceManifestFileEarly.endsWith(".xml") &&
          !(await fse.pathExists(path.join(fromFolder, "package.json")))
        ) {
          await importProgress.end(false, true);
          process.chdir(workingDir);
          return err(
            new UserError({
              source: "office-addin-generator",
              name: "ManifestOnlyAddinNotSupported",
              message: getLocalizedString(
                "core.generator.officeAddin.importProject.manifestOnlyNotSupported",
                fromFolder
              ),
            })
          );
        }
        await importProgress.start();
        // from existing project
        await importProgress.next(
          getLocalizedString("core.generator.officeAddin.importProject.copyFiles")
        );
        HelperMethods.copyAddinFiles(fromFolder, addinRoot);
        const sourceManifestFile: string = inputs[QuestionNames.OfficeAddinManifest];
        let manifestFile: string = sourceManifestFile.replace(fromFolder, addinRoot);
        await importProgress.next(
          getLocalizedString("core.generator.officeAddin.importProject.convertProject")
        );
        if (manifestFile.endsWith(".xml")) {
          // The convertProject reads `./package.json` and calls `Object.keys(content.scripts)` unconditionally.
          // Formanifest-only Office Add-in projects there is no package.json (or no
          // `scripts` field), which would otherwise crash with runtime errors. Ensure a minimal
          // package.json with a `scripts` object exists before converting.
          await OfficeAddinGenerator.ensurePackageJsonForConvert(addinRoot);
          // Need to convert to json project first
          await officeAddinGeneratorDeps.convertProject(
            manifestFile,
            "./backup.zip",
            addinRoot,
            true
          );
          manifestFile = manifestFile.replace(/\.xml$/, ".json");
        }
        inputs[QuestionNames.OfficeAddinHost] = await getHost(manifestFile);
        await importProgress.next(
          getLocalizedString("core.generator.officeAddin.importProject.updateManifest")
        );
        await HelperMethods.updateManifest(destinationPath, manifestFile);
      }
      process.chdir(workingDir);
      await importProgress.end(true, true);
      return ok(undefined);
    } catch (e) {
      process.chdir(workingDir);
      await importProgress.end(false, true);
      return err(assembleError(e as Error));
    }
  }

  /**
   * Ensure a `package.json` with a `scripts` object exists at `addinRoot`.
   * The project package's `convertProject` reads
   * `./package.json` and unconditionally calls `Object.keys(content.scripts)`,
   * which throws runtime errors when the field is missing. Creating or
   * normalizing the file beforehand prevents the crash.
   */
  static async ensurePackageJsonForConvert(addinRoot: string): Promise<void> {
    const pkgJsonPath = path.join(addinRoot, "package.json");
    let pkg: { scripts?: Record<string, string>; [key: string]: unknown } = {};
    if (await fse.pathExists(pkgJsonPath)) {
      try {
        pkg = (await fse.readJSON(pkgJsonPath)) as typeof pkg;
      } catch {
        pkg = {};
      }
    }
    if (!pkg.scripts || typeof pkg.scripts !== "object") {
      pkg.scripts = {};
      await fse.writeJSON(pkgJsonPath, pkg, { spaces: 2 });
    }
  }
}

// TODO: update to handle different hosts when support for them is implemented
// TODO: handle multiple scopes
type OfficeHost = "Outlook" | "Word" | "Excel" | "PowerPoint"; // | "OneNote" | "Project"
export async function getHost(addinManifestPath: string): Promise<OfficeHost> {
  // Read add-in manifest file
  const addinManifest = (await ManifestUtil.loadFromPath(
    addinManifestPath
  )) as TeamsManifestVDevPreview.TeamsManifestVDevPreview;
  let host: OfficeHost = "Outlook";
  switch (addinManifest.extensions?.[0].requirements?.scopes?.[0]) {
    case "document":
      host = "Word";
      break;
    case "mail":
      host = "Outlook";
      break;
    // case "notebook":
    //   host = "OneNote";
    case "presentation":
      host = "PowerPoint";
      break;
    // case "project":
    //   host = "Project";
    case "workbook":
      host = "Excel";
      break;
  }
  return host;
}

export class OfficeAddinGeneratorNew extends DefaultTemplateGenerator {
  componentName = "office-addin-generator";

  // activation condition
  public override activate(context: Context, inputs: Inputs): boolean {
    const templateName = inputs[QuestionNames.TemplateName];
    return [
      TemplateNames.OutlookTaskpane,
      TemplateNames.WXPTaskpane,
      TemplateNames.ExcelCFShortcut,
      TemplateNames.OfficeAddinCommon,
    ].includes(templateName);
  }

  public override async getTemplateInfos(
    context: Context,
    inputs: Inputs,
    destinationPath: string,
    actionContext?: ActionContext
  ): Promise<Result<TemplateInfo[], FxError>> {
    const templateName = inputs[QuestionNames.TemplateName];

    // Hanlde the MetaOS Project
    const res = await OfficeAddinGenerator.doScaffolding(context, inputs, destinationPath);
    if (res.isErr()) return err(res.error);
    return Promise.resolve(
      ok([
        {
          templateName: templateName,
          language: ProgrammingLanguage.TS,
          replaceMap: { manifestId: getUuid() },
        },
      ])
    );
  }

  public override async post(
    context: Context,
    inputs: Inputs,
    destinationPath: string,
    actionContext?: ActionContext
  ): Promise<Result<GeneratorResult, FxError>> {
    // Hanlde the MetaOS Project import
    const fromFolder = inputs[QuestionNames.OfficeAddinFolder];
    if (fromFolder) {
      // reset all env files
      const envRes = await envUtil.listEnv(destinationPath);
      if (envRes.isOk()) {
        const envs = envRes.value;
        for (const env of envs) {
          await envUtil.resetEnv(destinationPath, env, ["TEAMSFX_ENV", "APP_NAME_SUFFIX"]);
        }
      }
    }
    return ok({});
  }
}
