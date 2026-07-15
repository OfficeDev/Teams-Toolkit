// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ScaffoldRequest, scaffold } from "../../../src/v4/runtime/scaffold";
import { createInMemoryRuntime } from "../../../src/v4/runtime/inMemoryRuntime";
import { createStepRegistry } from "../../../src/v4/runtime/runtimeRegistry";
import { assert } from "vitest";
import {
  isRecord,
  loadV4Package,
  readJsonObject,
  V4ScenarioOutcome,
} from "./helpers/scenarioHarness";

const STEP_SET_SENSITIVITY_LABEL = "da/set-sensitivity-label";
const FEATURE_FLAG = "TEAMSFX_SENSITIVITY_LABEL";
const noActionPackage = loadV4Package("create", "da/no-action");

interface RunResult {
  files: Map<string, Buffer>;
  outcome: V4ScenarioOutcome;
  resolveCalls: number;
}

async function runNoAction(
  flagEnabled: boolean,
  injectSensitivityService = true
): Promise<RunResult> {
  let resolveCalls = 0;
  const flagReader = (name: string): boolean => name === FEATURE_FLAG && flagEnabled;
  const runtime = injectSensitivityService
    ? createInMemoryRuntime(
        flagReader,
        createStepRegistry({
          resolveId: async (): Promise<string> => {
            resolveCalls += 1;
            return "general-label-id";
          },
        })
      )
    : createInMemoryRuntime(flagReader);
  const request: ScaffoldRequest = {
    descriptor: noActionPackage.descriptor,
    pipeline: noActionPackage.pipeline,
    content: noActionPackage.content,
    answers: {},
    callerFloor: { appName: "MyAgent", language: "common" },
    targetDir: { path: "/out", existing: [] },
  };
  const result = await scaffold(request, runtime);
  if (result.isErr()) {
    assert.fail(result.error.message);
  }
  return { files: runtime.files, outcome: result.value, resolveCalls };
}

function pipelineSteps(templateId: string): Record<string, unknown>[] {
  const pipeline = loadV4Package("create", templateId).pipeline;
  if (!isRecord(pipeline) || !Array.isArray(pipeline.steps)) {
    assert.fail(`${templateId} pipeline must declare steps`);
  }
  const steps = pipeline.steps.filter(isRecord);
  assert.lengthOf(steps, pipeline.steps.length);
  return steps;
}

describe("SCN-DA-SENSITIVITY-LABEL (v4)", () => {
  it("SCN-SENS-01: flag-on scaffold applies the resolved label after render", async () => {
    const { files, outcome, resolveCalls } = await runNoAction(true);
    const manifest = readJsonObject(files, "appPackage/declarativeAgent.json");
    const sensitivityLabel = manifest.sensitivity_label;

    assert.include(outcome.stepsRun, STEP_SET_SENSITIVITY_LABEL);
    assert.strictEqual(resolveCalls, 1);
    assert.isTrue(isRecord(sensitivityLabel));
    assert.strictEqual(sensitivityLabel.id, "general-label-id");
  });

  it("SCN-SENS-02: flag-off scaffold skips lookup and leaves the manifest unlabeled", async () => {
    const { files, outcome, resolveCalls } = await runNoAction(false);
    const manifest = readJsonObject(files, "appPackage/declarativeAgent.json");

    assert.include(outcome.stepsSkipped, STEP_SET_SENSITIVITY_LABEL);
    assert.strictEqual(resolveCalls, 0);
    assert.notProperty(manifest, "sensitivity_label");
  });

  it("feature-on offline runtimes use the default no-op registry binding", async () => {
    const { files, outcome, resolveCalls } = await runNoAction(true, false);
    const manifest = readJsonObject(files, "appPackage/declarativeAgent.json");

    assert.include(outcome.stepsRun, STEP_SET_SENSITIVITY_LABEL);
    assert.strictEqual(resolveCalls, 0);
    assert.notProperty(manifest, "sensitivity_label");
  });

  it("SCN-SENS-03: every retained DA create route declares one guarded label step", () => {
    const routes: Record<string, string> = {
      "da/no-action": "appPackage/declarativeAgent.json",
      "da/api-plugin-from-scratch": "appPackage/repairDeclarativeAgent.json",
      "da/api-plugin-from-scratch-bearer": "appPackage/repairDeclarativeAgent.json",
      "da/api-plugin-from-scratch-oauth": "appPackage/repairDeclarativeAgent.json",
      "da/api-plugin-from-existing-api": "appPackage/declarativeAgent.json",
      "da/graph-connector": "appPackage/declarativeAgent.json",
      "da/mcp-server": "appPackage/declarativeAgent.json",
      "da/mcp-server-static": "appPackage/declarativeAgent.json",
      "da/skill": "appPackage/declarativeAgent.json",
    };

    for (const [templateId, manifestPath] of Object.entries(routes)) {
      const descriptor = loadV4Package("create", templateId).descriptor;
      assert.isTrue(isRecord(descriptor), templateId);
      assert.strictEqual(descriptor.minEngineVersion, "6.11.0", templateId);
      const steps = pipelineSteps(templateId);
      const matches = steps.filter((step) => step.step === STEP_SET_SENSITIVITY_LABEL);
      assert.lengthOf(matches, 1, templateId);
      assert.strictEqual(matches[0].when, `featureFlag('${FEATURE_FLAG}')`, templateId);
      assert.deepStrictEqual(matches[0].with, { manifestPath }, templateId);
      assert.isAbove(steps.indexOf(matches[0]), 0, templateId);
      assert.strictEqual(steps[0].step, "require-empty-target", templateId);
    }
  });
});
