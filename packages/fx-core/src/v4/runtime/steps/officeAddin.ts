// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError, UserError } from "@microsoft/teamsfx-api";
import * as fs from "fs-extra";
import * as officeAddinProject from "office-addin-project";
import * as os from "os";
import * as path from "path";
import { Result, err, ok } from "neverthrow";
import { RegisteredStep, StepContext, StepParams } from "../../pipeline/runScaffoldPipeline";

/** Office Add-in post-render import steps. */

const SOURCE = "Scaffold";

export const STEP_IMPORT_EXISTING_OFFICE_ADDIN_PROJECT = "officeaddin/import-existing-project";

const RENDERED_CONFIG_FILES = [
  ".gitignore",
  ".vscode/extensions.json",
  "env/.env.dev",
  "infra/azure.bicep",
  "infra/azure.parameters.json",
  "m365agents.yml",
];

function systemError(name: string, message: string): SystemError {
  return new SystemError({ source: SOURCE, name, message });
}

function userError(name: string, message: string): UserError {
  return new UserError({ source: SOURCE, name, message });
}

function stringParam(params: StepParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExcludedSourcePath(relativePath: string): boolean {
  return relativePath.split("/").includes("node_modules");
}

function resolveContainedPath(root: string, selectedPath: string): Result<string, FxError> {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.isAbsolute(selectedPath)
    ? path.resolve(selectedPath)
    : path.resolve(resolvedRoot, selectedPath);
  if (resolvedPath === resolvedRoot || resolvedPath.startsWith(resolvedRoot + path.sep)) {
    return ok(resolvedPath);
  }
  return err(
    userError(
      "OfficeAddinManifestOutsideSource",
      "The selected Office Add-in manifest must be inside the selected project folder."
    )
  );
}

async function copySourceFiles(sourceFolder: string, destinationFolder: string): Promise<void> {
  const root = path.resolve(sourceFolder);
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(root, fullPath).replace(/\\/g, "/");
      if (isExcludedSourcePath(relativePath)) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      const destinationPath = path.join(destinationFolder, relativePath);
      await fs.ensureDir(path.dirname(destinationPath));
      await fs.copyFile(fullPath, destinationPath);
    }
  };
  await walk(root);
}

async function writeTempFile(root: string, relativePath: string, data: Buffer): Promise<void> {
  const destinationPath = path.join(root, relativePath);
  await fs.ensureDir(path.dirname(destinationPath));
  await fs.writeFile(destinationPath, data);
}

async function overlayRenderedConfig(ctx: StepContext, destinationFolder: string): Promise<void> {
  for (const filePath of RENDERED_CONFIG_FILES) {
    const current = ctx.read(filePath);
    if (current !== undefined) {
      await writeTempFile(destinationFolder, filePath, current);
    }
  }
}

async function writeTempTreeToContext(root: string, ctx: StepContext): Promise<void> {
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      const relativePath = path.relative(root, fullPath).replace(/\\/g, "/");
      ctx.write(relativePath, await fs.readFile(fullPath));
    }
  };
  await walk(root);
}

async function ensurePackageJsonForConvert(root: string): Promise<void> {
  const packageJsonPath = path.join(root, "package.json");
  let packageJson: unknown = {};
  try {
    packageJson = await fs.readJson(packageJsonPath);
  } catch {
    packageJson = {};
  }
  const writablePackageJson = isRecord(packageJson) ? packageJson : {};
  if (!isRecord(writablePackageJson.scripts)) {
    writablePackageJson.scripts = {};
  }
  await fs.writeJson(packageJsonPath, writablePackageJson, { spaces: 2 });
}

async function convertXmlManifestIfNeeded(manifestPath: string, root: string): Promise<void> {
  if (!manifestPath.toLowerCase().endsWith(".xml")) {
    return;
  }
  await ensurePackageJsonForConvert(root);
  const previousCwd = process.cwd();
  process.chdir(root);
  try {
    await officeAddinProject.convertProject(manifestPath, "./backup.zip", root, true);
  } finally {
    process.chdir(previousCwd);
  }
}

async function importExistingOfficeAddinProject(
  ctx: StepContext,
  sourceFolder: string,
  manifestPath: string
): Promise<Result<void, FxError>> {
  const containedManifest = resolveContainedPath(sourceFolder, manifestPath);
  if (containedManifest.isErr()) {
    return err(containedManifest.error);
  }
  const sourceRoot = path.resolve(sourceFolder);
  const manifestRelativePath = path.relative(sourceRoot, containedManifest.value);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m365atk-office-addin-"));
  try {
    await copySourceFiles(sourceRoot, tempRoot);
    await convertXmlManifestIfNeeded(path.join(tempRoot, manifestRelativePath), tempRoot);
    await overlayRenderedConfig(ctx, tempRoot);
    await writeTempTreeToContext(tempRoot, ctx);
    return ok(undefined);
  } catch {
    return err(
      userError(
        // eslint-disable-next-line no-secrets/no-secrets
        "OfficeAddinSourceProjectInvalid",
        "The Office Add-in project folder could not be imported."
      )
    );
  } finally {
    await fs.remove(tempRoot);
  }
}

export const officeAddinImportExistingProject: RegisteredStep = {
  validateParams(resolved: StepParams): string | undefined {
    if (stringParam(resolved, "sourceFolder") === undefined) {
      return "missing string parameter 'sourceFolder'";
    }
    if (stringParam(resolved, "manifestPath") === undefined) {
      return "missing string parameter 'manifestPath'";
    }
    return undefined;
  },

  async apply(resolved: StepParams, ctx: StepContext): Promise<Result<void, FxError>> {
    const sourceFolder = stringParam(resolved, "sourceFolder");
    const manifestPath = stringParam(resolved, "manifestPath");
    if (sourceFolder === undefined || manifestPath === undefined) {
      // eslint-disable-next-line no-secrets/no-secrets
      return err(systemError("OfficeAddinImportParams", "resolved parameters are not all valid"));
    }
    return importExistingOfficeAddinProject(ctx, sourceFolder, manifestPath);
  },
};
