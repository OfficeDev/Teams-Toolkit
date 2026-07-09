// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { randomUUID } from "crypto";
import { assert } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  isRecord,
  isRecordArray,
  loadV4Package,
  readJsonObject,
  runV4Package,
  text,
} from "./helpers/scenarioHarness";

/**
 * T3 scenario tier: the `declarative-agent-meta-os-upgrade-project` create package
 * scaffolded under `InMemoryRuntime`.
 *
 * Spec: docs/03-specs/scenarios/da/create-metaos-upgrade-project.md
 * (SCN-CREATE-METAOS-UPGRADE-01..06)
 */

const templatePackage = loadV4Package("create", "declarative-agent-meta-os-upgrade-project");
const callerFloor = { appName: "MetaOS Upgrade", language: "common" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function writeFile(root: string, relativePath: string, body: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, "utf8");
}

function sourceManifest(): string {
  return JSON.stringify(
    {
      id: "source-id",
      extensions: [
        {
          runtimes: [
            {
              code: { script: "commands.js" },
              actions: [{ id: "existing", type: "executeDataFunction" }],
            },
          ],
        },
      ],
    },
    null,
    2
  );
}

function sourcePackageJson(): string {
  return JSON.stringify(
    {
      devDependencies: {
        "office-addin-debugging": "5.0.0",
      },
    },
    null,
    2
  );
}

function createSourceProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `metaos-upgrade-${randomUUID()}-`));
  writeFile(root, "appPackage/manifest.json", sourceManifest());
  writeFile(root, "src/commands/commands.ts", "export const marker = true;\n");
  writeFile(root, "package.json", sourcePackageJson());
  writeFile(root, "src/taskpane/taskpane.ts", "export const taskpane = true;\n");
  writeFile(root, "README.md", "skip me\n");
  writeFile(root, "m365agents.yml", "skip me\n");
  writeFile(root, "package-lock.json", "skip me\n");
  writeFile(root, "env/.env.dev", "TEAMS_APP_ID=old\n");
  writeFile(root, "node_modules/pkg/index.js", "skip me\n");
  return root;
}

async function run() {
  const sourceFolder = createSourceProject();
  try {
    return await runV4Package(templatePackage, {
      callerFloor,
      answers: { officeAddinFolder: sourceFolder },
    });
  } finally {
    fs.rmSync(sourceFolder, { recursive: true, force: true });
  }
}

describe("SCN-DA-CREATE-METAOS-UPGRADE-PROJECT (v4, T3 InMemoryRuntime)", () => {
  it("SCN-CREATE-METAOS-UPGRADE-01: copies source files and excludes generated/runtime files", async () => {
    const { files } = await run();
    assert.isTrue(files.has("src/taskpane/taskpane.ts"));
    assert.isTrue(files.has("appPackage/manifest.json"));
    assert.isFalse(files.has("README.md"));
    assert.notInclude(text(files, "m365agents.yml"), "skip me");
    assert.isFalse(files.has("package-lock.json"));
    assert.isFalse(files.has("node_modules/pkg/index.js"));
  });

  it("SCN-CREATE-METAOS-UPGRADE-02: updates manifest with DA and Office action ids", async () => {
    const { files } = await run();
    const manifest = readJsonObject(files, "appPackage/manifest.json");
    assert.deepEqual(manifest.copilotAgents, {
      declarativeAgents: [{ id: "declarativeAgentAlc", file: "declarativeAgent.json" }],
    });
    const extensions = manifest.extensions;
    assert.isTrue(isRecordArray(extensions));
    const runtimes = extensions[0].runtimes;
    assert.isTrue(isRecordArray(runtimes));
    const actions = runtimes[0].actions;
    assert.isTrue(isRecordArray(actions));
    assert.deepInclude(actions, { id: "addfooter", type: "executeDataFunction" });
    assert.deepInclude(actions, { id: "fillcolor", type: "executeDataFunction" });
    assert.deepInclude(actions, { id: "addtexttoslide", type: "executeDataFunction" });
  });

  it("SCN-CREATE-METAOS-UPGRADE-03: generates DA and action manifests", async () => {
    const { files } = await run();
    const agent = readJsonObject(files, "appPackage/declarativeAgent.json");
    assert.isTrue(isRecordArray(agent.actions));
    assert.deepInclude(agent.actions, { id: "alchemyPlugin", file: "alchemy-plugin.json" });
    const action = readJsonObject(files, "appPackage/alchemy-plugin.json");
    assert.strictEqual(action.schema_version, "v2.3");
    assert.strictEqual(action.namespace, "AddInFunctions");
    assert.isTrue(isRecordArray(action.functions));
    assert.sameMembers(
      action.functions.map((item) => item.name),
      ["addfooter", "fillcolor", "addtexttoslide"]
    );
  });

  it("SCN-CREATE-METAOS-UPGRADE-04: appends command handlers and upgrades office-addin-debugging", async () => {
    const { files } = await run();
    assert.include(text(files, "src/commands/commands.ts"), "Office.actions.associate");
    const packageJson = readJsonObject(files, "package.json");
    const devDependencies = packageJson.devDependencies;
    assert.isTrue(isRecord(devDependencies));
    assert.deepInclude(devDependencies, {
      "office-addin-debugging": "6.0.6",
    });
  });

  it("SCN-CREATE-METAOS-UPGRADE-05: unifies manifest id and env TEAMS_APP_ID", async () => {
    const { files } = await run();
    const manifest = readJsonObject(files, "appPackage/manifest.json");
    assert.isString(manifest.id);
    const manifestId = typeof manifest.id === "string" ? manifest.id : "";
    assert.match(manifestId, UUID);
    assert.include(text(files, "env/.env.dev"), `TEAMS_APP_ID=${manifestId}`);
    assert.include(text(files, "env/.env.dev"), "TEAMSFX_ENV=dev");
    assert.notInclude(text(files, "env/.env.dev"), "old");
  });

  it("SCN-CREATE-METAOS-UPGRADE-06: renders lifecycle baseline and runs only the upgrade step", async () => {
    const { outcome } = await run();
    assert.includeMembers(outcome.written, ["m365agents.yml", "env/.env.dev"]);
    assert.deepStrictEqual(outcome.stepsRun, ["metaos/upgrade-existing-project"]);
    assert.isEmpty(outcome.stepsSkipped);
  });
});
