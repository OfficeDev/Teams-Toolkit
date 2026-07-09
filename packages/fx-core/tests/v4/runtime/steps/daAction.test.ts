// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError } from "@microsoft/teamsfx-api";
import {
  STEP_REGISTER_PLUGIN_MANIFEST,
  daActionRegisterPluginManifest,
} from "../../../../src/v4/runtime/steps/daAction";
import { StepContext } from "../../../../src/v4/pipeline/runScaffoldPipeline";
import { STEP_REGISTRY } from "../../../../src/v4/runtime/runtimeRegistry";
import { assert } from "vitest";

/** A minimal in-memory `StepContext` whose read/write share one file map. */
function makeCtx(initial: Record<string, string> = {}): {
  ctx: StepContext;
  files: Map<string, Buffer>;
} {
  const files = new Map<string, Buffer>();
  for (const [path, body] of Object.entries(initial)) {
    files.set(path, Buffer.from(body, "utf8"));
  }
  const ctx: StepContext = {
    read: (path) => files.get(path),
    write: (path, data) => {
      files.set(path, data);
    },
    manifestWrapper: () => ({ addAction: () => undefined }),
  };
  return { ctx, files };
}

function text(files: Map<string, Buffer>, path: string): string {
  return files.get(path)?.toString("utf8") ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

function readJsonObject(files: Map<string, Buffer>, path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text(files, path));
  assert.isTrue(isRecord(parsed));
  return parsed;
}

function actions(manifest: Record<string, unknown>): Record<string, unknown>[] {
  const value = manifest.actions;
  assert.isTrue(isRecordArray(value));
  return value;
}

describe("da-action steps (v4)", () => {
  describe(STEP_REGISTER_PLUGIN_MANIFEST, () => {
    it("is registered in the v4 step registry", () => {
      assert.strictEqual(
        STEP_REGISTRY.get(STEP_REGISTER_PLUGIN_MANIFEST),
        daActionRegisterPluginManifest
      );
    });

    it("validateParams: passes when teamsManifestPath/pluginManifestPath are strings", () => {
      assert.isUndefined(
        daActionRegisterPluginManifest.validateParams({
          teamsManifestPath: "appPackage/manifest.json",
          pluginManifestPath: "appPackage/ai-plugin-apigithubc.json",
        })
      );
    });

    it("SCN-ADD-MCP-04: derives the DA manifest path and registers the plugin manifest", async () => {
      const { ctx, files } = makeCtx({
        "appPackage/manifest.json": JSON.stringify({
          declarativeAgents: [{ file: "declarativeAgent.json" }],
        }),
        "appPackage/declarativeAgent.json": JSON.stringify({ name: "Agent" }),
      });

      const res = await daActionRegisterPluginManifest.apply(
        {
          teamsManifestPath: "appPackage/manifest.json",
          pluginManifestPath: "appPackage/ai-plugin-apigithubc.json",
        },
        ctx
      );

      assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
      const manifest = readJsonObject(files, "appPackage/declarativeAgent.json");
      assert.deepInclude(actions(manifest), {
        id: "apigithubc",
        file: "ai-plugin-apigithubc.json",
      });
    });

    it("SCN-ADD-MCP-05: upserts by pluginManifestPath so a re-run does not duplicate the action", async () => {
      const { ctx, files } = makeCtx({
        "appPackage/manifest.json": JSON.stringify({
          declarativeAgents: [{ file: "declarativeAgent.json" }],
        }),
        "appPackage/declarativeAgent.json": JSON.stringify({
          actions: [{ id: "apigithubc", file: "ai-plugin-apigithubc.json" }],
        }),
      });

      await daActionRegisterPluginManifest.apply(
        {
          teamsManifestPath: "appPackage/manifest.json",
          pluginManifestPath: "appPackage/ai-plugin-apigithubc.json",
        },
        ctx
      );

      const manifest = readJsonObject(files, "appPackage/declarativeAgent.json");
      assert.lengthOf(actions(manifest), 1);
    });

    it("errors when the Teams manifest does not point at a DA manifest", async () => {
      const { ctx } = makeCtx({ "appPackage/manifest.json": JSON.stringify({}) });
      const res = await daActionRegisterPluginManifest.apply(
        {
          teamsManifestPath: "appPackage/manifest.json",
          pluginManifestPath: "appPackage/ai-plugin-apigithubc.json",
        },
        ctx
      );
      assert.isTrue(res.isErr());
      assert.instanceOf(res._unsafeUnwrapErr(), SystemError);
    });
  });
});
