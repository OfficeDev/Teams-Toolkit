// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs";
import * as path from "path";
import { renderMustache } from "../../../src/v4/runtime/renderMustache";
import { assert } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../../../..");
const TEMPLATES_V4_ROOT = path.join(REPO_ROOT, "templates/v4");
const TEAMS_MANIFEST_1_30_SCHEMA =
  "https://developer.microsoft.com/json-schemas/teams/v1.30/MicrosoftTeams.schema.json";
const TEAMS_MANIFEST_DEV_PREVIEW_SCHEMA =
  "https://developer.microsoft.com/json-schemas/teams/vDevPreview/MicrosoftTeams.schema.json";
const DEV_PREVIEW_MANIFESTS = new Set([
  "templates/v4/create/office-addin-excel-cfshortcut/content/typescript/appPackage/manifest.json.tpl",
  "templates/v4/create/office-addin-excel-customfunctions/content/typescript/appPackage/manifest.json.tpl",
  "templates/v4/create/office-addin-sso-naa/content/typescript/appPackage/manifest.json.tpl",
  "templates/v4/create/office-addin-wxpo-taskpane/content/typescript/appPackage/manifest.json.tpl",
]);

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

function localSchemaReferences(filePath: string): string[] {
  const text = fs.readFileSync(filePath, "utf8");
  const refs: string[] = [];
  for (const match of text.matchAll(/"\$schema"\s*:\s*"([^"]+)"/g)) {
    const ref = match[1];
    if (ref.startsWith(".")) {
      refs.push(ref);
    }
  }
  return refs;
}

function requiredField(filePath: string, field: string): string {
  const text = fs.readFileSync(filePath, "utf8");
  const match = new RegExp(`"${field}"\\s*:\\s*"([^"]+)"`).exec(text);
  if (!match) {
    assert.fail(`${path.relative(REPO_ROOT, filePath).replace(/\\/g, "/")} must declare ${field}`);
  }
  return match[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function renderedManifest(
  filePath: string,
  renderVars: Record<string, string>
): Record<string, unknown> {
  const relativePath = path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
  const rendered = renderMustache(fs.readFileSync(filePath, "utf8"), renderVars);
  if (rendered.isErr()) {
    assert.fail(`${relativePath} must render: ${rendered.error.message}`);
  }
  const parsed: unknown = JSON.parse(rendered.value);
  if (!isRecord(parsed)) {
    assert.fail(`${relativePath} must render to a JSON object`);
  }
  return parsed;
}

describe("v4 schema references", () => {
  it("every local $schema reference resolves to an existing schema file", () => {
    const schemaReferenceFiles = listFiles(
      TEMPLATES_V4_ROOT,
      (name) => name.endsWith(".json") || name.endsWith(".json.tpl") || name.endsWith(".tour")
    );

    for (const filePath of schemaReferenceFiles) {
      for (const schemaRef of localSchemaReferences(filePath)) {
        const schemaPath = schemaRef.split("#")[0];
        const resolved = path.resolve(path.dirname(filePath), schemaPath);
        assert.isTrue(
          fs.existsSync(resolved),
          `${path.relative(REPO_ROOT, filePath).replace(/\\/g, "/")} $schema '${schemaRef}' must resolve to an existing file`
        );
      }
    }
  });

  it("every stable Teams manifest template uses schema and manifest version 1.30", () => {
    const manifestFiles = listFiles(TEMPLATES_V4_ROOT, (name) => name === "manifest.json.tpl");

    for (const filePath of manifestFiles) {
      const relativePath = path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
      if (DEV_PREVIEW_MANIFESTS.has(relativePath)) {
        continue;
      }
      assert.strictEqual(requiredField(filePath, "manifestVersion"), "1.30", relativePath);
      assert.strictEqual(
        requiredField(filePath, "\\$schema"),
        TEAMS_MANIFEST_1_30_SCHEMA,
        relativePath
      );
    }
  });

  it("every rendered 1.30 bot declares the 1.30 bot defaults", () => {
    const manifestFiles = listFiles(TEMPLATES_V4_ROOT, (name) => name === "manifest.json.tpl");

    for (const filePath of manifestFiles) {
      const relativePath = path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
      if (DEV_PREVIEW_MANIFESTS.has(relativePath)) {
        continue;
      }
      for (const renderVars of [{}, { CEAEnabled: "true" }]) {
        const manifest = renderedManifest(filePath, renderVars);
        const bots = manifest["bots"];
        if (bots !== undefined) {
          assert.isTrue(Array.isArray(bots), relativePath);
          if (Array.isArray(bots)) {
            for (const bot of bots) {
              assert.isTrue(isRecord(bot), relativePath);
              if (!isRecord(bot)) {
                continue;
              }
              assert.strictEqual(bot["supportsTargetedMessages"], false, relativePath);
              const commandLists = bot["commandLists"];
              if (commandLists === undefined) {
                continue;
              }
              assert.isTrue(Array.isArray(commandLists), relativePath);
              if (!Array.isArray(commandLists)) {
                continue;
              }
              for (const commandList of commandLists) {
                assert.isTrue(isRecord(commandList), relativePath);
                if (isRecord(commandList)) {
                  assert.deepStrictEqual(commandList["triggers"], ["mention"], relativePath);
                }
              }
            }
          }
        }

        const composeExtensions = manifest["composeExtensions"];
        if (composeExtensions !== undefined) {
          assert.isTrue(Array.isArray(composeExtensions), relativePath);
          if (Array.isArray(composeExtensions)) {
            for (const composeExtension of composeExtensions) {
              if (!isRecord(composeExtension) || !Array.isArray(composeExtension["commands"])) {
                continue;
              }
              for (const command of composeExtension["commands"]) {
                assert.isTrue(isRecord(command), relativePath);
                if (isRecord(command)) {
                  assert.isUndefined(command["triggers"], relativePath);
                }
              }
            }
          }
        }
      }
    }
  });

  it("only the Office Add-in templates use the devPreview Teams manifest schema", () => {
    const manifestFiles = listFiles(TEMPLATES_V4_ROOT, (name) => name === "manifest.json.tpl");
    const previewManifests = manifestFiles
      .filter((filePath) => requiredField(filePath, "manifestVersion") === "devPreview")
      .map((filePath) => path.relative(REPO_ROOT, filePath).replace(/\\/g, "/"));

    assert.deepStrictEqual(previewManifests, [...DEV_PREVIEW_MANIFESTS].sort());
    for (const relativePath of previewManifests) {
      assert.strictEqual(
        requiredField(path.join(REPO_ROOT, relativePath), "\\$schema"),
        TEAMS_MANIFEST_DEV_PREVIEW_SCHEMA,
        relativePath
      );
    }
  });
});
