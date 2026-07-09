// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError, UserError } from "@microsoft/teamsfx-api";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import {
  STEP_UNIFY_PROJECT_ID,
  STEP_UPGRADE_EXISTING_PROJECT,
  metaOsUnifyProjectId,
  metaOsUpgradeExistingProject,
} from "../../../../src/v4/runtime/steps/metaOs";
import { StepContext } from "../../../../src/v4/pipeline/runScaffoldPipeline";
import { assert } from "vitest";

function makeCtx(initial: Record<string, string> = {}): {
  ctx: StepContext;
  files: Map<string, Buffer>;
} {
  const files = new Map<string, Buffer>();
  for (const [filePath, body] of Object.entries(initial)) {
    files.set(filePath, Buffer.from(body, "utf8"));
  }
  return {
    files,
    ctx: {
      read: (filePath) => files.get(filePath),
      write: (filePath, data) => {
        files.set(filePath, data);
      },
      manifestWrapper: () => ({ addAction: () => undefined }),
    },
  };
}

function text(files: Map<string, Buffer>, filePath: string): string {
  return files.get(filePath)?.toString("utf8") ?? "";
}

function json(files: Map<string, Buffer>, filePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text(files, filePath));
  assert.isTrue(typeof parsed === "object" && parsed !== null && !Array.isArray(parsed));
  return parsed as Record<string, unknown>;
}

function baseManifest(actions: Record<string, unknown>[] = []): Record<string, unknown> {
  return {
    id: "old-app-id",
    extensions: [
      { runtimes: "not-an-array" },
      {
        runtimes: [
          { code: { script: "src/commands/other.js" } },
          {
            code: { script: "src/commands/commands.js" },
            actions,
          },
        ],
      },
    ],
  };
}

describe("metaOs steps (v4)", () => {
  describe(STEP_UNIFY_PROJECT_ID, () => {
    it("validateParams reports missing parameters", () => {
      assert.strictEqual(
        metaOsUnifyProjectId.validateParams({ envPath: "env/.env.dev" }),
        "missing string parameter 'manifestPath'"
      );
      assert.strictEqual(
        metaOsUnifyProjectId.validateParams({ manifestPath: "appPackage/manifest.json" }),
        "missing string parameter 'envPath'"
      );
      assert.isUndefined(
        metaOsUnifyProjectId.validateParams({
          manifestPath: "appPackage/manifest.json",
          envPath: "env/.env.dev",
        })
      );
    });

    it("returns a parameter SystemError when apply receives invalid params", () => {
      const result = metaOsUnifyProjectId.apply(
        { manifestPath: "appPackage/manifest.json" },
        makeCtx().ctx
      );

      assert.isTrue(result.isErr());
      assert.instanceOf(result._unsafeUnwrapErr(), SystemError);
      assert.strictEqual(result._unsafeUnwrapErr().name, "MetaOsUnifyParams");
    });

    it("writes one project id to manifest and env, replacing an existing env value", () => {
      const { ctx, files } = makeCtx({
        "appPackage/manifest.json": JSON.stringify({ id: "old" }),
        "env/.env.dev": "TEAMSFX_ENV=dev\nTEAMS_APP_ID=old\n",
      });

      const result = metaOsUnifyProjectId.apply(
        { manifestPath: "appPackage/manifest.json", envPath: "env/.env.dev" },
        ctx
      );

      assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
      const manifestId = json(files, "appPackage/manifest.json").id;
      assert.isString(manifestId);
      assert.include(text(files, "env/.env.dev"), `TEAMS_APP_ID=${manifestId}`);
      assert.notInclude(text(files, "env/.env.dev"), "TEAMS_APP_ID=old");
    });

    it("appends TEAMS_APP_ID when env does not exist", () => {
      const { ctx, files } = makeCtx({
        "appPackage/manifest.json": JSON.stringify({ id: "old" }),
      });

      const result = metaOsUnifyProjectId.apply(
        { manifestPath: "appPackage/manifest.json", envPath: "env/.env.dev" },
        ctx
      );

      assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
      assert.include(text(files, "env/.env.dev"), "TEAMS_APP_ID=");
    });

    it("returns missing and invalid manifest errors", () => {
      const missing = metaOsUnifyProjectId.apply(
        { manifestPath: "appPackage/manifest.json", envPath: "env/.env.dev" },
        makeCtx().ctx
      );
      assert.isTrue(missing.isErr());
      assert.strictEqual(missing._unsafeUnwrapErr().name, "MetaOsManifestMissing");

      const invalid = metaOsUnifyProjectId.apply(
        { manifestPath: "appPackage/manifest.json", envPath: "env/.env.dev" },
        makeCtx({ "appPackage/manifest.json": "[]" }).ctx
      );
      assert.isTrue(invalid.isErr());
      assert.strictEqual(invalid._unsafeUnwrapErr().name, "MetaOsManifestInvalid");
    });
  });

  describe(STEP_UPGRADE_EXISTING_PROJECT, () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atk-metaos-step-"));
    });

    afterEach(() => {
      fs.removeSync(tempDir);
    });

    it("validateParams reports missing parameters", () => {
      assert.strictEqual(
        metaOsUpgradeExistingProject.validateParams({ appName: "My Addin" }),
        "missing string parameter 'sourceFolder'"
      );
      assert.strictEqual(
        metaOsUpgradeExistingProject.validateParams({ sourceFolder: tempDir }),
        "missing string parameter 'appName'"
      );
      assert.isUndefined(
        metaOsUpgradeExistingProject.validateParams({ sourceFolder: tempDir, appName: "My Addin" })
      );
    });

    it("returns parameter and unreadable source errors", () => {
      const paramsError = metaOsUpgradeExistingProject.apply(
        { sourceFolder: tempDir },
        makeCtx().ctx
      );
      assert.isTrue(paramsError.isErr());
      assert.instanceOf(paramsError._unsafeUnwrapErr(), SystemError);
      assert.strictEqual(paramsError._unsafeUnwrapErr().name, "MetaOsUpgradeParams");

      const sourceError = metaOsUpgradeExistingProject.apply(
        { sourceFolder: path.join(tempDir, "missing"), appName: "My Addin" },
        makeCtx().ctx
      );
      assert.isTrue(sourceError.isErr());
      assert.instanceOf(sourceError._unsafeUnwrapErr(), UserError);
      assert.strictEqual(sourceError._unsafeUnwrapErr().name, "MetaOsSourceProjectInvalid");
    });

    it("copies source files, skips excluded files, and extends the add-in into a DA project", () => {
      fs.ensureDirSync(path.join(tempDir, "appPackage"));
      fs.ensureDirSync(path.join(tempDir, "src/commands"));
      fs.ensureDirSync(path.join(tempDir, "env"));
      fs.ensureDirSync(path.join(tempDir, "node_modules/pkg"));
      fs.writeFileSync(path.join(tempDir, "README.md"), "skip readme");
      fs.writeFileSync(path.join(tempDir, "env/.env.dev"), "skip env");
      fs.writeFileSync(path.join(tempDir, "node_modules/pkg/index.js"), "skip module");
      fs.writeFileSync(
        path.join(tempDir, "src/commands/commands.ts"),
        "export const marker = true;\n"
      );
      fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ name: "addin" }));
      fs.writeFileSync(
        path.join(tempDir, "appPackage/manifest.json"),
        JSON.stringify(
          baseManifest([
            { id: "addfooter", type: "executeDataFunction" },
            { id: "fillcolor", type: "executeDataFunction" },
            { id: "addtexttoslide", type: "executeDataFunction" },
          ])
        )
      );
      const { ctx, files } = makeCtx({
        "appPackage/declarativeAgent.json": "{}",
        "appPackage/alchemy-plugin.json": "{}",
      });

      const result = metaOsUpgradeExistingProject.apply(
        { sourceFolder: tempDir, appName: "My Addin" },
        ctx
      );

      assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
      assert.isUndefined(files.get("README.md"));
      assert.notInclude(text(files, "env/.env.dev"), "skip env");
      assert.isUndefined(files.get("node_modules/pkg/index.js"));
      assert.include(text(files, "src/commands/commands.ts"), "Office.actions.associate");
      assert.include(text(files, "env/.env.dev"), "TEAMS_APP_ID=");

      const manifest = json(files, "appPackage/manifest.json");
      assert.isString(manifest.id);
      assert.include(text(files, "env/.env.dev"), `TEAMS_APP_ID=${manifest.id}`);
      assert.deepEqual(manifest.copilotAgents, {
        declarativeAgents: [{ id: "declarativeAgentAlc", file: "declarativeAgent1.json" }],
      });
      const da = json(files, "appPackage/declarativeAgent1.json");
      assert.strictEqual(da.name, "Add-in Skill + Agent for My Addin");
      const plugin = json(files, "appPackage/alchemy-plugin1.json");
      assert.strictEqual(plugin.namespace, "AddInFunctions");
      const packageJson = json(files, "package.json");
      assert.deepEqual(packageJson.devDependencies, { "office-addin-debugging": "6.0.6" });
    });

    it("returns manifest shape and missing command errors", () => {
      const noExtensions = makeCtx({
        "appPackage/manifest.json": JSON.stringify({ extensions: {} }),
        "src/commands/commands.ts": "",
        "package.json": "{}",
      });
      const shape = metaOsUpgradeExistingProject.apply(
        { sourceFolder: tempDir, appName: "My Addin" },
        noExtensions.ctx
      );
      assert.isTrue(shape.isErr());
      assert.strictEqual(shape._unsafeUnwrapErr().name, "MetaOsManifestShape");

      fs.ensureDirSync(path.join(tempDir, "appPackage"));
      fs.writeFileSync(
        path.join(tempDir, "appPackage/manifest.json"),
        JSON.stringify(baseManifest())
      );
      fs.writeFileSync(path.join(tempDir, "package.json"), "{}");
      const missingCommands = metaOsUpgradeExistingProject.apply(
        { sourceFolder: tempDir, appName: "My Addin" },
        makeCtx().ctx
      );
      assert.isTrue(missingCommands.isErr());
      assert.strictEqual(missingCommands._unsafeUnwrapErr().name, "MetaOsCommandsMissing");
    });
  });
});
