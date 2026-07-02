// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { randomUUID } from "crypto";
import { UserError } from "@microsoft/teamsfx-api";
import { assert } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { REQUIRE_EMPTY_TARGET } from "../../../src/v4/pipeline/runScaffoldPipeline";
import { createInMemoryRuntime } from "../../../src/v4/runtime/inMemoryRuntime";
import { scaffold } from "../../../src/v4/runtime/scaffold";
import { loadV4Package, readJsonObject, runV4Package, text } from "./helpers/scenarioHarness";

/**
 * T3 scenario tier: the `office-addin-config` create package scaffolded under
 * `InMemoryRuntime`.
 *
 * Spec: docs/03-specs/scenarios/office-addin/create-office-addin-config.md
 * (SCN-CREATE-OFFICE-CONFIG-01..04)
 */

const templatePackage = loadV4Package("create", "office-addin-config");
const callerFloor = { appName: "Office Import", language: "common" };

function writeFile(root: string, relativePath: string, body: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, "utf8");
}

function sourceManifest(): string {
  return JSON.stringify(
    {
      id: "source-manifest-id",
      extensions: [
        {
          requirements: { scopes: ["workbook"] },
          runtimes: [{ code: { page: "https://localhost:3000/taskpane.html" } }],
        },
      ],
      authorization: { permissions: { resourceSpecific: [] } },
    },
    null,
    2
  );
}

function createSourceProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `office-config-${randomUUID()}-`));
  writeFile(root, "manifest.json", sourceManifest());
  writeFile(root, "package.json", JSON.stringify({ scripts: { build: "echo build" } }, null, 2));
  writeFile(root, "src/taskpane/taskpane.ts", "export const taskpane = true;\n");
  writeFile(root, "env/.env.dev", "TEAMSFX_ENV=old\nSHOULD_NOT_SURVIVE=true\n");
  writeFile(root, "m365agents.yml", "source yaml\n");
  writeFile(root, "node_modules/pkg/index.js", "skip me\n");
  return root;
}

async function run() {
  const sourceFolder = createSourceProject();
  try {
    return await runV4Package(templatePackage, {
      callerFloor,
      answers: {
        officeAddinFolder: sourceFolder,
        officeAddinManifest: path.join(sourceFolder, "manifest.json"),
      },
    });
  } finally {
    fs.rmSync(sourceFolder, { recursive: true, force: true });
  }
}

describe("SCN-OFFICE-CREATE-OFFICE-ADDIN-CONFIG (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-OFFICE-CONFIG-01: imports source files and writes Toolkit config", async () => {
    const { files } = await run();
    assert.isTrue(files.has("manifest.json"));
    assert.isTrue(files.has("package.json"));
    assert.isTrue(files.has("src/taskpane/taskpane.ts"));
    assert.isTrue(files.has("m365agents.yml"));
    assert.isTrue(files.has("env/.env.dev"));
    assert.isTrue(files.has("infra/azure.bicep"));
    assert.isTrue(files.has(".vscode/extensions.json"));
    assert.isFalse(files.has("node_modules/pkg/index.js"));
  });

  it("SCN-CREATE-OFFICE-CONFIG-02: rendered Toolkit config wins over copied source config", async () => {
    const { files } = await run();
    assert.include(text(files, "env/.env.dev"), "TEAMSFX_ENV=dev");
    assert.notInclude(text(files, "env/.env.dev"), "SHOULD_NOT_SURVIVE");
    assert.notStrictEqual(text(files, "m365agents.yml"), "source yaml\n");
    const manifest = readJsonObject(files, "manifest.json");
    assert.strictEqual(manifest.id, "source-manifest-id");
  });

  it("SCN-CREATE-OFFICE-CONFIG-03: import step runs after require-empty-target", async () => {
    const { outcome } = await run();
    assert.deepStrictEqual(outcome.stepsRun, [
      "require-empty-target",
      "officeaddin/import-existing-project",
    ]);
  });

  it("SCN-CREATE-OFFICE-CONFIG-04: a non-empty target fails require-empty-target first", async () => {
    const runtime = createInMemoryRuntime();
    const sourceFolder = createSourceProject();
    try {
      const result = await scaffold(
        {
          descriptor: templatePackage.descriptor,
          pipeline: templatePackage.pipeline,
          content: templatePackage.content,
          answers: {
            officeAddinFolder: sourceFolder,
            officeAddinManifest: path.join(sourceFolder, "manifest.json"),
          },
          callerFloor,
          targetDir: { path: "/out", existing: ["README.md"] },
        },
        runtime
      );
      assert.isTrue(result.isErr());
      const error = result._unsafeUnwrapErr();
      assert.instanceOf(error, UserError);
      assert.strictEqual(error.name, REQUIRE_EMPTY_TARGET);
      assert.strictEqual(runtime.files.size, 0);
    } finally {
      fs.rmSync(sourceFolder, { recursive: true, force: true });
    }
  });
});
