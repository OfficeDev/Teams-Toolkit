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

export const OFFICE_ADDIN_HOSTS = ["word", "powerpoint", "outlook", "excel"] as const;

// Office add-in manifest requirement scope for each host.
const OFFICE_ADDIN_HOST_SCOPE: { [host: string]: string } = {
  outlook: "mail",
  excel: "workbook",
  word: "document",
  powerpoint: "presentation",
};

function getSelectedOfficeAddinHosts(inputs: Inputs): string[] {
  const hosts = inputs[QuestionNames.OfficeAddinHosts];
  // Fall back to all hosts when the question was not asked (CLI / non-interactive).
  return Array.isArray(hosts) && hosts.length > 0 ? hosts : [...OFFICE_ADDIN_HOSTS];
}

// Nested App Auth SSO template supports a single Office host.
const OFFICE_ADDIN_NAA_HOSTS = ["word", "excel", "powerpoint"] as const;

function getSelectedNaaHost(inputs: Inputs): string {
  const host = inputs[QuestionNames.OfficeAddinNaaHost];
  return typeof host === "string" && OFFICE_ADDIN_NAA_HOSTS.includes(host as any) ? host : "word";
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
      TemplateNames.ExcelCustomFunctions,
      TemplateNames.OfficeAddinSsoNaa,
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

    const replaceMap: { [key: string]: string } = { manifestId: getUuid() };
    if (templateName === TemplateNames.WXPTaskpane) {
      const hosts = getSelectedOfficeAddinHosts(inputs);
      for (const host of OFFICE_ADDIN_HOSTS) {
        replaceMap[host] = hosts.includes(host) ? "true" : "";
      }
      // Pre-join the manifest requirement scopes so the rendered JSON array stays
      // valid for any host subset (avoids trailing-comma issues in Mustache).
      replaceMap["manifestScopes"] = OFFICE_ADDIN_HOSTS.filter((host) => hosts.includes(host))
        .map((host) => `"${OFFICE_ADDIN_HOST_SCOPE[host]}"`)
        .join(",\n                    ");
    } else if (templateName === TemplateNames.OfficeAddinSsoNaa) {
      // NAA SSO supports a single host; its source code is host-agnostic, so only
      // the manifest scope and the debug host reflect the selection.
      const naaHost = getSelectedNaaHost(inputs);
      replaceMap["manifestScope"] = `"${OFFICE_ADDIN_HOST_SCOPE[naaHost]}"`;
    }

    return Promise.resolve(
      ok([
        {
          templateName: templateName,
          language: ProgrammingLanguage.TS,
          replaceMap,
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
    // Prune everything tied to the Office hosts that the user did not select.
    if (inputs[QuestionNames.TemplateName] === TemplateNames.WXPTaskpane) {
      const hosts = getSelectedOfficeAddinHosts(inputs);
      await pruneUnselectedOfficeAddinHosts(destinationPath, hosts, { removeSourceFiles: true });
    } else if (inputs[QuestionNames.TemplateName] === TemplateNames.OfficeAddinSsoNaa) {
      // NAA source is host-agnostic (runtime host switch); only trim the debug
      // config down to the single selected host.
      const naaHost = getSelectedNaaHost(inputs);
      await pruneUnselectedOfficeAddinHosts(destinationPath, [naaHost], {
        removeSourceFiles: false,
      });
    }

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

/**
 * Remove all references to unselected Office hosts from a scaffolded add-in
 * project: (optionally) per-host source files, the `.vscode/launch.json` debug
 * configurations/compounds (which drive the Run and Debug dropdown), and the
 * `package.json` debug scripts / default debug app. `hosts` is the set of hosts
 * to KEEP.
 */
async function pruneUnselectedOfficeAddinHosts(
  destinationPath: string,
  hosts: string[],
  options: { removeSourceFiles: boolean }
): Promise<void> {
  const unselected = OFFICE_ADDIN_HOSTS.filter((host) => !hosts.includes(host));

  // 1. Per-host source files (only for templates that ship one file per host).
  if (options.removeSourceFiles) {
    for (const host of unselected) {
      await fse.remove(path.join(destinationPath, "src", "taskpane", `${host}.ts`));
      await fse.remove(path.join(destinationPath, "src", "commands", `${host}.ts`));
    }
  }

  const isSelectedHostName = (name: string): boolean => {
    const firstToken = name.trim().split(/\s+/)[0]?.toLowerCase();
    // Keep entries that do not belong to any known host, or belong to a selected one.
    return !OFFICE_ADDIN_HOSTS.includes(firstToken as (typeof OFFICE_ADDIN_HOSTS)[number])
      ? true
      : hosts.includes(firstToken);
  };

  // 2. `.vscode/launch.json` — filter host-specific configurations and compounds
  //    so the Run and Debug dropdown only lists the selected hosts.
  const launchPath = path.join(destinationPath, ".vscode", "launch.json");
  if (await fse.pathExists(launchPath)) {
    const launch = await fse.readJson(launchPath);
    if (Array.isArray(launch.configurations)) {
      launch.configurations = launch.configurations.filter((c: { name?: string }) =>
        isSelectedHostName(c.name ?? "")
      );
    }
    if (Array.isArray(launch.compounds)) {
      launch.compounds = launch.compounds.filter((c: { name?: string }) =>
        isSelectedHostName(c.name ?? "")
      );
    }
    await fse.writeJson(launchPath, launch, { spaces: 2 });
  }

  // 3. `package.json` — drop the `start:desktop:<host>` scripts for unselected
  //    hosts and point the default debug app at a selected host.
  const packagePath = path.join(destinationPath, "package.json");
  if (await fse.pathExists(packagePath)) {
    const pkg = await fse.readJson(packagePath);
    if (pkg.scripts) {
      for (const host of unselected) {
        delete pkg.scripts[`start:desktop:${host}`];
      }
    }
    if (pkg.config && !hosts.includes(pkg.config.app_to_debug)) {
      pkg.config.app_to_debug = hosts[0];
    }
    await fse.writeJson(packagePath, pkg, { spaces: 2 });
  }
}
