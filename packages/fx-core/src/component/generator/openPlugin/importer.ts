// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { err, FxError, ok, Result, SystemError, UserError } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import yaml from "js-yaml";
import * as path from "path";
import { createContext } from "../../../common/globalVars";
import { Generator } from "../generator";
import { TemplateNames } from "../templates/templateNames";
import { resolveOpenPluginMcpAuth } from "./authResolver";
import { applyIcons } from "./iconStrategy";
import { mapToTtkProject, validateMcpServerCount } from "./mapper";
import { readOpenPluginDir } from "./parser";
import { ImportInputs } from "./types";

export const OPEN_PLUGIN_IMPORT_SOURCE = "OpenPluginImport";

export interface ImportResult {
  projectPath: string;
  warnings: string[];
}

/**
 * Import an Open Plugin / Claude Code plugin / Cursor plugin directory into
 * a scaffolded Microsoft 365 Agents Toolkit project. The output is a usable
 * ATK project; run `atk teamsapp package` from inside it to produce the
 * upload zip.
 *
 * Static baseline files (m365agents.yml, README, .gitignore, .vscode, env)
 * come from the `open-plugin-import` template, which ships in the standard
 * template release pipeline and can be updated independently of fx-core.
 * Variable-length outputs (manifest, skill folders, icons) are written as
 * the post-scaffold step here.
 */
export async function importOpenPlugin(
  inputs: ImportInputs
): Promise<Result<ImportResult, FxError>> {
  try {
    if (!inputs.path) {
      return err(
        new UserError(OPEN_PLUGIN_IMPORT_SOURCE, "MissingPluginPath", "--path is required.")
      );
    }
    const parsed = await readOpenPluginDir(inputs.path);
    const defaultOutput = path.join(process.cwd(), parsed.manifest.name);
    const projectPath = path.resolve(inputs.output ?? defaultOutput);

    if (await fs.pathExists(projectPath)) {
      const entries = await fs.readdir(projectPath);
      if (entries.length > 0) {
        return err(
          new UserError(
            OPEN_PLUGIN_IMPORT_SOURCE,
            "OutputDirectoryNotEmpty",
            `Output directory is not empty: ${projectPath}. Choose a different --output path or empty the directory.`
          )
        );
      }
    }
    validateMcpServerCount(parsed.mcpServers);

    const authResolution = await resolveOpenPluginMcpAuth(parsed, inputs.defaultAuthType ?? "Auto");
    if (authResolution.isErr()) {
      return err(authResolution.error);
    }
    const { manifest, copyOps, warnings } = mapToTtkProject(
      parsed,
      inputs,
      authResolution.value.authTypes
    );
    warnings.push(...authResolution.value.warnings);

    // 1. Scaffold the static baseline from the open-plugin-import template.
    const ctx = createContext();
    ctx.templateVariables = { appName: parsed.manifest.name };
    const scaffoldRes = await Generator.generateTemplate(
      ctx,
      projectPath,
      TemplateNames.OpenPluginImport,
      "common"
    );
    if (scaffoldRes.isErr()) return err(scaffoldRes.error);

    // 2. Post-scaffold: write the dynamic outputs.
    const appPackageDir = path.join(projectPath, "appPackage");
    await fs.ensureDir(appPackageDir);

    // Manifest (vDevPreview agentSkills/agentConnectors are variable-length).
    await fs.writeJSON(path.join(appPackageDir, "manifest.json"), manifest, { spaces: 4 });

    // Copy skill folders and (when present) the commands folder.
    for (const op of copyOps) {
      await fs.copy(op.src, path.join(projectPath, op.destRelative));
    }

    // Strip SKILL.md frontmatter fields that Teams Developer Portal rejects.
    // Allowed: name, description, license, metadata, compatibility.
    await sanitizeSkillFiles(path.join(appPackageDir, "skills"), warnings);

    // Icons.
    await applyIcons(parsed, appPackageDir, warnings);

    return ok({ projectPath, warnings });
  } catch (e) {
    if (e instanceof UserError || e instanceof SystemError) {
      return err(e);
    }
    const message = e instanceof Error ? e.message : String(e);
    return err(
      new SystemError({
        source: OPEN_PLUGIN_IMPORT_SOURCE,
        name: "ImportOpenPluginFailed",
        message,
        displayMessage: message,
      })
    );
  }
}

// Teams Developer Portal accepts only these SKILL.md frontmatter keys.
const ALLOWED_SKILL_FRONTMATTER_KEYS = new Set([
  "name",
  "description",
  "license",
  "metadata",
  "compatibility",
]);

/**
 * Walk every `skills/<name>/SKILL.md` and remove top-level frontmatter keys
 * that aren't on the M365 allow-list (e.g. Claude-specific `user-invocable`,
 * `argument-hint`). Records each removal as a warning. Files without a
 * frontmatter block are left untouched.
 */
async function sanitizeSkillFiles(skillsRoot: string, warnings: string[]): Promise<void> {
  if (!(await fs.pathExists(skillsRoot))) return;
  const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMd = path.join(skillsRoot, entry.name, "SKILL.md");
    if (!(await fs.pathExists(skillMd))) continue;
    const original = await fs.readFile(skillMd, "utf8");
    const { content, removedKeys } = stripDisallowedFrontmatter(original);
    if (removedKeys.length > 0) {
      await fs.writeFile(skillMd, content, "utf8");
      warnings.push(
        `Removed unsupported SKILL.md frontmatter field(s) from skills/${
          entry.name
        }: ${removedKeys.join(", ")}.`
      );
    }
  }
}

export function stripDisallowedFrontmatter(source: string): {
  content: string;
  removedKeys: string[];
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(source);
  if (!match) return { content: source, removedKeys: [] };
  const parsed = yaml.load(match[1]);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { content: source, removedKeys: [] };
  }
  const obj = parsed as Record<string, unknown>;
  const removedKeys: string[] = [];
  const kept: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (ALLOWED_SKILL_FRONTMATTER_KEYS.has(key)) {
      kept[key] = obj[key];
    } else {
      removedKeys.push(key);
    }
  }
  if (removedKeys.length === 0) return { content: source, removedKeys: [] };
  const dumped = yaml.dump(kept, { lineWidth: -1 }).replace(/\n$/, "");
  const trailing = match[2] || "\n";
  const rebuilt = `---\n${dumped}\n---${trailing}` + source.slice(match[0].length);
  return { content: rebuilt, removedKeys };
}
