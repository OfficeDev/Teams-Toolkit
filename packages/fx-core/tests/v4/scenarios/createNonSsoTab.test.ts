// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs";
import * as path from "path";
import { UserError } from "@microsoft/teamsfx-api";
import { assert } from "vitest";
import { REQUIRE_EMPTY_TARGET } from "../../../src/v4/pipeline/runScaffoldPipeline";
import { createInMemoryRuntime } from "../../../src/v4/runtime/inMemoryRuntime";
import { scaffold } from "../../../src/v4/runtime/scaffold";
import {
  isRecord,
  loadV4Package,
  readJsonObject,
  recordProperty,
  runV4Package,
  text,
} from "./helpers/scenarioHarness";

/**
 * T3 scenario tier: the `non-sso-tab` create package scaffolded under `InMemoryRuntime`.
 *
 * Spec: docs/03-specs/scenarios/teams/create-non-sso-tab.md
 * (SCN-CREATE-NONSSO-TAB-01..06)
 */

const templatePackage = loadV4Package("create", "non-sso-tab");
const appName = "My Tab App";

function descriptorLanguages(): string[] {
  if (!isRecord(templatePackage.descriptor)) {
    assert.fail("expected descriptor to be an object");
  }
  const languages = templatePackage.descriptor.languages;
  if (!Array.isArray(languages)) {
    assert.fail("expected descriptor languages to be an array");
  }
  return languages.map((language) => {
    if (typeof language !== "string") {
      assert.fail("expected descriptor language to be a string");
    }
    return language;
  });
}

async function run(language: "typescript" = "typescript") {
  return runV4Package(templatePackage, { callerFloor: { appName, language } });
}

function tsupEntries(templateName: string, tsupConfig: string): string[] {
  assert.match(tsupConfig, /bundle:\s*false/, `${templateName} must remain unbundled`);
  const entryList = tsupConfig.match(/entry:\s*\[([^\]]+)\]/);
  assert.isNotNull(entryList, `${templateName} must declare its tsup entries`);
  return Array.from((entryList?.[1] ?? "").matchAll(/["']([^"']+)["']/g), (match) => match[1]);
}

describe("SCN-TEAMS-CREATE-NONSSO-TAB (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-NONSSO-TAB-01: TypeScript scaffold writes the Teams tab file set", async () => {
    const { outcome } = await run("typescript");
    assert.include(outcome.written, "package.json");
    assert.include(outcome.written, "src/index.ts");
    assert.include(outcome.written, "src/Tab/App.tsx");
    assert.include(outcome.written, "appPackage/manifest.json");
    assert.include(outcome.written, "infra/azure.bicep");
    assert.include(outcome.written, "m365agents.yml");
  });

  it("SCN-CREATE-NONSSO-TAB-02: package and manifest render appName-derived values", async () => {
    const { files } = await run("typescript");
    const pkg = readJsonObject(files, "package.json");
    assert.strictEqual(pkg.name, "mytabapp");

    const manifest = readJsonObject(files, "appPackage/manifest.json");
    const name = recordProperty(manifest, "name");
    assert.strictEqual(name.short, "My Tab App${{APP_NAME_SUFFIX}}");
  });

  it("SCN-CREATE-NONSSO-TAB-03: descriptor exposes TypeScript only", () => {
    assert.deepStrictEqual(descriptorLanguages(), ["typescript"]);
  });

  it("SCN-CREATE-NONSSO-TAB-04: only require-empty-target runs", async () => {
    const { outcome } = await run("typescript");
    assert.deepStrictEqual(outcome.stepsRun, ["require-empty-target"]);
  });

  it("SCN-CREATE-NONSSO-TAB-05: a non-empty target fails require-empty-target first", async () => {
    const runtime = createInMemoryRuntime();
    const result = await scaffold(
      {
        descriptor: templatePackage.descriptor,
        pipeline: templatePackage.pipeline,
        content: templatePackage.content,
        answers: {},
        callerFloor: { appName, language: "typescript" },
        targetDir: { path: "/out", existing: ["README.md"] },
      },
      runtime
    );
    assert.isTrue(result.isErr());
    const error = result._unsafeUnwrapErr();
    assert.instanceOf(error, UserError);
    assert.strictEqual(error.name, REQUIRE_EMPTY_TARGET);
    assert.strictEqual(runtime.files.size, 0);
  });

  it("SCN-CREATE-NONSSO-TAB-06: v4 declares its proxy module without dropping the v3 server entry", async () => {
    const v3TemplateDir = path.resolve(templatePackage.packageDir, "../../../vsc/ts/basic-tab");
    const v3Entries = tsupEntries(
      "v3 basic-tab",
      fs.readFileSync(path.join(v3TemplateDir, "tsup.config.js"), "utf8")
    );

    const { files } = await run("typescript");
    assert.match(text(files, "src/index.ts"), /^import "\.\/proxy";/m);
    assert.deepStrictEqual(tsupEntries("v4 non-sso-tab", text(files, "tsup.config.js")), [
      ...v3Entries,
      "src/proxy.ts",
    ]);
  });
});
