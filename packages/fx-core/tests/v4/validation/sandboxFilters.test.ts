// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import path from "path";
import { assert } from "vitest";
import { FeatureFlagName } from "../../../src/common/featureFlags";
import { parsePipeline } from "../../../src/v4/runtime/packageParse";

const CREATE_TEMPLATES_ROOT = path.resolve(__dirname, "../../../../../templates/v4/create");
const SANDBOX_FLAG_CONDITION = `!featureFlag('${FeatureFlagName.SandBoxedTeam}')`;
const SANDBOX_SOURCE_FILE_NAMES = new Set([
  "m365agents.sandbox.yml.tpl",
  "teamsapp.sandbox.yml.tpl",
  ".env.sandbox",
  ".env.sandbox.user.tpl",
]);
const SANDBOX_OUTPUT_PATHS = [
  "m365agents.sandbox.yml",
  "teamsapp.sandbox.yml",
  "env/.env.sandbox",
  "env/.env.sandbox.user",
];

interface RenderFilter {
  when?: string;
  exclude?: unknown;
}

function findTemplateRoots(directory: string): string[] {
  const roots: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const child = path.join(directory, entry.name);
    if (fs.existsSync(path.join(child, "pipeline.json"))) {
      roots.push(child);
    }
    roots.push(...findTemplateRoots(child));
  }
  return roots;
}

function containsSandboxSource(directory: string): boolean {
  return fs.readdirSync(directory, { withFileTypes: true }).some((entry) => {
    if (entry.isDirectory()) {
      return containsSandboxSource(path.join(directory, entry.name));
    }
    return SANDBOX_SOURCE_FILE_NAMES.has(entry.name);
  });
}

function isRenderFilter(value: unknown): value is RenderFilter {
  return typeof value === "object" && value !== null;
}

describe("v4 sandbox template filters", () => {
  it("AC-23: every create package containing sandbox files declares the sandbox render filter", () => {
    const templatesWithSandboxFiles = findTemplateRoots(CREATE_TEMPLATES_ROOT).filter(
      (templateRoot) => {
        const contentRoot = path.join(templateRoot, "content");
        return fs.existsSync(contentRoot) && containsSandboxSource(contentRoot);
      }
    );

    assert.isNotEmpty(templatesWithSandboxFiles, "expected authored sandbox templates");
    for (const templateRoot of templatesWithSandboxFiles) {
      const templateId = path.relative(CREATE_TEMPLATES_ROOT, templateRoot).replace(/\\/g, "/");
      const pipeline = parsePipeline(
        JSON.parse(fs.readFileSync(path.join(templateRoot, "pipeline.json"), "utf8"))
      );
      if (pipeline.isErr()) {
        assert.fail(`${templateId} has an invalid pipeline: ${pipeline.error.message}`);
      }
      const filters: unknown = pipeline.value.render?.filters;
      const sandboxFilter = Array.isArray(filters)
        ? filters.filter(isRenderFilter).find((filter) => filter.when === SANDBOX_FLAG_CONDITION)
        : undefined;

      assert.exists(sandboxFilter, `${templateId} must declare the sandbox render filter`);
      const excludedPaths = sandboxFilter?.exclude;
      assert.isTrue(
        Array.isArray(excludedPaths),
        `${templateId} sandbox render filter must declare excluded paths`
      );
      if (!Array.isArray(excludedPaths)) {
        continue;
      }
      assert.sameMembers(
        excludedPaths,
        SANDBOX_OUTPUT_PATHS,
        `${templateId} must exclude every sandbox output path`
      );
    }
  });
});
