// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs";
import * as path from "path";
import { assert } from "vitest";

type TemplateKind = "create" | "modify";

interface TemplateDescriptorIndexEntry {
  kind: TemplateKind;
  id: string;
  spec: string;
  descriptorPath: string;
}

interface ScenarioTestIndexEntry {
  filePath: string;
  title: string;
}

const REPO_ROOT = path.resolve(__dirname, "../../../../..");
const TEMPLATES_V4_ROOT = path.join(REPO_ROOT, "templates/v4");
const SCENARIO_TEST_ROOT = path.join(REPO_ROOT, "packages/fx-core/tests/v4/scenarios");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonObject(filePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!isRecord(parsed)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }
  return parsed;
}

function requiredString(record: Record<string, unknown>, key: string, filePath: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`${filePath} must define string property '${key}'`);
  }
  return value;
}

function listFiles(root: string, matches: (name: string) => boolean): string[] {
  const result: string[] = [];
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, name);
      if (fs.statSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else if (matches(name)) {
        result.push(fullPath);
      }
    }
  };
  walk(root);
  return result.sort();
}

function descriptorIndex(): TemplateDescriptorIndexEntry[] {
  const entries: TemplateDescriptorIndexEntry[] = [];
  for (const kind of ["create", "modify"] satisfies TemplateKind[]) {
    const root = path.join(TEMPLATES_V4_ROOT, kind);
    for (const descriptorPath of listFiles(root, (name) => name === "descriptor.json")) {
      const descriptor = readJsonObject(descriptorPath);
      entries.push({
        kind,
        id: requiredString(descriptor, "id", descriptorPath),
        spec: requiredString(descriptor, "spec", descriptorPath),
        descriptorPath: path.relative(REPO_ROOT, descriptorPath).replace(/\\/g, "/"),
      });
    }
  }
  return entries.sort((left, right) => left.id.localeCompare(right.id));
}

function acceptanceCriteriaIds(specText: string): string[] {
  const ids = new Set<string>();
  for (const match of specText.matchAll(/\|\s*(SCN-[A-Z0-9-]+-\d+)\s*\|/g)) {
    ids.add(match[1]);
  }
  return [...ids].sort();
}

function scenarioTests(): Map<string, ScenarioTestIndexEntry[]> {
  const byAcId = new Map<string, ScenarioTestIndexEntry[]>();
  for (const testPath of listFiles(SCENARIO_TEST_ROOT, (name) => name.endsWith(".test.ts"))) {
    const text = fs.readFileSync(testPath, "utf8");
    for (const match of text.matchAll(/\bit\("([^"]+)"/g)) {
      const title = match[1];
      const acIds = [...title.matchAll(/SCN-[A-Z0-9-]+-\d+/g)].map((item) => item[0]);
      for (const acId of acIds) {
        const existing = byAcId.get(acId) ?? [];
        existing.push({
          filePath: path.relative(REPO_ROOT, testPath).replace(/\\/g, "/"),
          title,
        });
        byAcId.set(acId, existing);
      }
    }
  }
  return byAcId;
}

function selectorV4TemplateIds(kind: TemplateKind): string[] {
  const selectorPath = path.join(TEMPLATES_V4_ROOT, kind, "selector.json");
  const selector = readJsonObject(selectorPath);
  const routes = selector.routes;
  if (!Array.isArray(routes)) {
    throw new Error(`${selectorPath} must define a routes array`);
  }
  const ids = new Set<string>();
  for (const route of routes) {
    if (!isRecord(route)) {
      continue;
    }
    if (route.engine === "v4" && typeof route.templateId === "string") {
      ids.add(route.templateId);
    }
  }
  return [...ids].sort();
}

describe("v4 scenario parity", () => {
  it("SCN-PARITY-01: every descriptor points at a matching Scenario Spec", () => {
    for (const descriptor of descriptorIndex()) {
      const specPath = path.join(REPO_ROOT, descriptor.spec);
      const specText = fs.readFileSync(specPath, "utf8");
      assert.include(
        specText,
        `**Template id:** \`${descriptor.id}\` (${descriptor.kind})`,
        `${descriptor.descriptorPath} spec metadata must match descriptor id/kind`
      );
      assert.isNotEmpty(
        acceptanceCriteriaIds(specText),
        `${descriptor.spec} must define Scenario Acceptance Criteria`
      );
    }
  });

  it("SCN-PARITY-02: every v4 selector route resolves to a descriptor", () => {
    const descriptorsByKind = new Map<TemplateKind, Set<string>>();
    for (const kind of ["create", "modify"] satisfies TemplateKind[]) {
      descriptorsByKind.set(
        kind,
        new Set(
          descriptorIndex()
            .filter((item) => item.kind === kind)
            .map((item) => item.id)
        )
      );
    }

    for (const kind of ["create", "modify"] satisfies TemplateKind[]) {
      const descriptorIds = descriptorsByKind.get(kind) ?? new Set<string>();
      for (const templateId of selectorV4TemplateIds(kind)) {
        assert.isTrue(
          descriptorIds.has(templateId),
          `templates/v4/${kind}/selector.json v4 route '${templateId}' must have a descriptor`
        );
      }
    }
  });

  it("SCN-PARITY-03: every Scenario AC has exactly one scenario-tier test", () => {
    const testsByAcId = scenarioTests();
    for (const descriptor of descriptorIndex()) {
      const specText = fs.readFileSync(path.join(REPO_ROOT, descriptor.spec), "utf8");
      for (const acId of acceptanceCriteriaIds(specText)) {
        const matches = testsByAcId.get(acId) ?? [];
        assert.lengthOf(
          matches,
          1,
          `${descriptor.spec} ${acId} must map to exactly one scenario test; found ${matches
            .map((item) => `${item.filePath}: ${item.title}`)
            .join(" | ")}`
        );
      }
    }
  });
});
