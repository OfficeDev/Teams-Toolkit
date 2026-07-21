// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError } from "@microsoft/teamsfx-api";
import {
  STEP_REGISTER_PLUGIN_MANIFEST,
  daActionRegisterPluginManifest,
} from "../../../../src/v4/runtime/steps/daAction";
import { StepContext } from "../../../../src/v4/pipeline/runScaffoldPipeline";
import {
  NOOP_MANIFEST_WRAPPER,
  STEP_REGISTRY,
  buildPipelinePort,
} from "../../../../src/v4/runtime/runtimeRegistry";
import { assert } from "vitest";
import { ok } from "neverthrow";
import { createInMemoryRuntime } from "../../../../src/v4/runtime/inMemoryRuntime";

/** A minimal in-memory `StepContext` whose read/write share one file map. */
function makeCtx(initial: Record<string, string> = {}): {
  ctx: StepContext;
  files: Map<string, Buffer>;
} {
  const files = new Map<string, Buffer>();
  const runtime = createInMemoryRuntime();
  for (const [path, body] of Object.entries(initial)) {
    runtime.files.set(path, Buffer.from(body, "utf8"));
  }
  const ctx: StepContext = {
    read: runtime.port.read,
    write: runtime.port.write,
    writeEnvironment: runtime.port.writeEnvironment,
    manifestWrapper: runtime.port.manifestWrapper,
  };
  return { ctx, files: runtime.files };
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

    it("returns an explicit error when a runtime has no manifest mutation adapter", () => {
      const result = NOOP_MANIFEST_WRAPPER.registerDeclarativeAgentAction(
        "appPackage/manifest.json",
        "appPackage/ai-plugin.json"
      );

      assert.isTrue(result.isErr());
      assert.strictEqual(result._unsafeUnwrapErr().name, "ManifestMutationUnavailable");
    });

    it("validateParams: passes when teamsManifestPath/pluginManifestPath are strings", () => {
      assert.isUndefined(
        daActionRegisterPluginManifest.validateParams({
          teamsManifestPath: "appPackage/manifest.json",
          pluginManifestPath: "appPackage/ai-plugin-apigithubc.json",
        })
      );
    });

    it("AC-12: delegates path-aware mutation to the manifest wrapper without reading JSON", async () => {
      const registrations: [string, string][] = [];
      const wrapper = {
        registerDeclarativeAgentAction: (teamsManifestPath: string, pluginManifestPath: string) => {
          registrations.push([teamsManifestPath, pluginManifestPath]);
          return ok(undefined);
        },
      };
      const ctx: StepContext = {
        read: () => {
          throw new Error("the step must not parse manifests directly");
        },
        write: () => {
          throw new Error("the step must not write manifests directly");
        },
        writeEnvironment: () => Promise.resolve(ok(undefined)),
        manifestWrapper: () => wrapper,
      };

      const res = await daActionRegisterPluginManifest.apply(
        {
          teamsManifestPath: "appPackage/manifest.json",
          pluginManifestPath: "appPackage/ai-plugin-apigithubc.json",
        },
        ctx
      );

      assert.isTrue(res.isOk(), res.isErr() ? res.error.message : "expected ok");
      assert.deepEqual(registrations, [
        ["appPackage/manifest.json", "appPackage/ai-plugin-apigithubc.json"],
      ]);
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

    it.each([
      {
        name: "missing Teams manifest",
        initial: {},
        errorName: "DaActionTeamsManifestMissing",
      },
      {
        name: "invalid Teams manifest",
        initial: { "appPackage/manifest.json": "{" },
        errorName: "DaActionTeamsManifestInvalid",
      },
      {
        name: "missing declarative agent manifest",
        initial: {
          "appPackage/manifest.json": JSON.stringify({
            declarativeAgents: [{ file: "declarativeAgent.json" }],
          }),
        },
        errorName: "DaActionManifestMissing",
      },
      {
        name: "invalid declarative agent manifest",
        initial: {
          "appPackage/manifest.json": JSON.stringify({
            declarativeAgents: [{ file: "declarativeAgent.json" }],
          }),
          "appPackage/declarativeAgent.json": "{",
        },
        errorName: "DaActionManifestInvalid",
      },
    ])("returns a distinct error for $name", async ({ initial, errorName }) => {
      const { ctx } = makeCtx(initial);

      const result = await daActionRegisterPluginManifest.apply(
        {
          teamsManifestPath: "appPackage/manifest.json",
          pluginManifestPath: "appPackage/ai-plugin.json",
        },
        ctx
      );

      assert.isTrue(result.isErr());
      assert.strictEqual(result._unsafeUnwrapErr().name, errorName);
    });

    it("returns a distinct error when the declarative agent manifest cannot be written", () => {
      const runtime = createInMemoryRuntime();
      const port = buildPipelinePort(
        runtime.exprPort,
        {
          read: (filePath): Buffer | undefined => {
            if (filePath === "appPackage/manifest.json") {
              return Buffer.from(
                JSON.stringify({ declarativeAgents: [{ file: "declarativeAgent.json" }] })
              );
            }
            if (filePath === "appPackage/declarativeAgent.json") {
              return Buffer.from(JSON.stringify({ name: "Agent" }));
            }
            return undefined;
          },
          write: (): void => {
            throw new Error("write failed at C:\\secret\\project");
          },
        },
        runtime.port.writeEnvironment
      );

      const result = port
        .manifestWrapper()
        .registerDeclarativeAgentAction("appPackage/manifest.json", "appPackage/ai-plugin.json");

      assert.isTrue(result.isErr());
      assert.strictEqual(result._unsafeUnwrapErr().name, "DaActionManifestWriteFailed");
      assert.notInclude(result._unsafeUnwrapErr().message, "C:\\secret\\project");
    });
  });
});
