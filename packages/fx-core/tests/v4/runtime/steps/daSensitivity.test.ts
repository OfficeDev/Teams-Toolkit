// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError } from "@microsoft/teamsfx-api";
import { Result, ok } from "neverthrow";
import { StepContext } from "../../../../src/v4/pipeline/runScaffoldPipeline";
import { createExpressionPort } from "../../../../src/v4/runtime/whitelist";
import { buildPipelinePort, createStepRegistry } from "../../../../src/v4/runtime/runtimeRegistry";
import {
  STEP_SET_SENSITIVITY_LABEL,
  createDaSetSensitivityLabelStep,
} from "../../../../src/v4/runtime/steps/daSensitivity";
import { assert } from "vitest";

function makeContext(labelId: string | undefined): {
  step: ReturnType<typeof createDaSetSensitivityLabelStep>;
  ctx: StepContext;
  mutations: Array<{ path: string; id: string }>;
} {
  const mutations: Array<{ path: string; id: string }> = [];
  const ctx: StepContext = {
    read: (): Buffer | undefined => undefined,
    write: (): void => undefined,
    writeEnvironment: () => Promise.resolve(ok(undefined)),
    manifestWrapper: () => ({
      registerDeclarativeAgentAction: (): Result<void, FxError> => ok(undefined),
      setSensitivityLabel: (path: string, id: string): Result<void, FxError> => {
        mutations.push({ path, id });
        return ok(undefined);
      },
    }),
  };
  const step = createDaSetSensitivityLabelStep({
    resolveId: async (): Promise<string | undefined> => labelId,
  });
  return { step, ctx, mutations };
}

describe(STEP_SET_SENSITIVITY_LABEL, () => {
  it("SENS-01: resolves the General label and applies it through the DA wrapper", async () => {
    const { step, ctx, mutations } = makeContext("general-label-id");

    const result = await step.apply({ manifestPath: "appPackage/declarativeAgent.json" }, ctx);

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    assert.deepStrictEqual(mutations, [
      { path: "appPackage/declarativeAgent.json", id: "general-label-id" },
    ]);
  });

  it("SENS-02: succeeds without mutation when no General label id is available", async () => {
    const { step, ctx, mutations } = makeContext(undefined);

    const result = await step.apply({ manifestPath: "appPackage/declarativeAgent.json" }, ctx);

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    assert.isEmpty(mutations);
  });

  it("SENS-03: rejects an absent or empty manifestPath", () => {
    const { step } = makeContext(undefined);
    assert.isDefined(step.validateParams({}));
    assert.isDefined(step.validateParams({ manifestPath: "" }));
  });

  it("returns a SystemError when the manifest cannot be read", async () => {
    const stepRegistry = createStepRegistry({
      resolveId: async (): Promise<string> => "general-label-id",
    });
    const port = buildPipelinePort(
      createExpressionPort(),
      {
        read: (): Buffer | undefined => {
          throw new Error("read failed at C:\\secret\\project");
        },
        write: (): void => undefined,
      },
      () => Promise.resolve(ok(undefined)),
      stepRegistry
    );
    const step = port.stepRegistry(STEP_SET_SENSITIVITY_LABEL);
    if (step === undefined) {
      assert.fail(`${STEP_SET_SENSITIVITY_LABEL} is not registered`);
    }

    const result = await step.apply(
      { manifestPath: "appPackage/declarativeAgent.json" },
      {
        read: port.read,
        write: port.write,
        writeEnvironment: port.writeEnvironment,
        manifestWrapper: port.manifestWrapper,
      }
    );

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.strictEqual(result.error.name, "DaSensitivityLabelManifestReadFailed");
      assert.notInclude(result.error.message, "C:\\secret\\project");
    }
  });

  it("returns a distinct SystemError when the manifest is missing", async () => {
    const stepRegistry = createStepRegistry({
      resolveId: async (): Promise<string> => "general-label-id",
    });
    const port = buildPipelinePort(
      createExpressionPort(),
      {
        read: (): Buffer | undefined => undefined,
        write: (): void => undefined,
      },
      () => Promise.resolve(ok(undefined)),
      stepRegistry
    );
    const step = port.stepRegistry(STEP_SET_SENSITIVITY_LABEL);
    if (step === undefined) {
      assert.fail(`${STEP_SET_SENSITIVITY_LABEL} is not registered`);
    }

    const result = await step.apply(
      { manifestPath: "appPackage/declarativeAgent.json" },
      {
        read: port.read,
        write: port.write,
        writeEnvironment: port.writeEnvironment,
        manifestWrapper: port.manifestWrapper,
      }
    );

    assert.isTrue(result.isErr());
    assert.strictEqual(result._unsafeUnwrapErr().name, "DaSensitivityLabelManifestMissing");
  });

  it("returns a distinct SystemError when the manifest is invalid", async () => {
    const stepRegistry = createStepRegistry({
      resolveId: async (): Promise<string> => "general-label-id",
    });
    const port = buildPipelinePort(
      createExpressionPort(),
      {
        read: (): Buffer => Buffer.from("{"),
        write: (): void => undefined,
      },
      () => Promise.resolve(ok(undefined)),
      stepRegistry
    );
    const step = port.stepRegistry(STEP_SET_SENSITIVITY_LABEL);
    if (step === undefined) {
      assert.fail(`${STEP_SET_SENSITIVITY_LABEL} is not registered`);
    }

    const result = await step.apply(
      { manifestPath: "appPackage/declarativeAgent.json" },
      {
        read: port.read,
        write: port.write,
        writeEnvironment: port.writeEnvironment,
        manifestWrapper: port.manifestWrapper,
      }
    );

    assert.isTrue(result.isErr());
    assert.strictEqual(result._unsafeUnwrapErr().name, "DaSensitivityLabelManifestInvalid");
  });

  it("returns a distinct SystemError when the manifest cannot be written", async () => {
    const stepRegistry = createStepRegistry({
      resolveId: async (): Promise<string> => "general-label-id",
    });
    const port = buildPipelinePort(
      createExpressionPort(),
      {
        read: (): Buffer =>
          Buffer.from(
            JSON.stringify({
              $schema:
                "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.7/schema.json",
              version: "v1.7",
              name: "Test agent",
              description: "Test agent",
              instructions: "Test instructions",
            })
          ),
        write: (): void => {
          throw new Error("write failed at C:\\secret\\project");
        },
      },
      () => Promise.resolve(ok(undefined)),
      stepRegistry
    );
    const step = port.stepRegistry(STEP_SET_SENSITIVITY_LABEL);
    if (step === undefined) {
      assert.fail(`${STEP_SET_SENSITIVITY_LABEL} is not registered`);
    }

    const result = await step.apply(
      { manifestPath: "appPackage/declarativeAgent.json" },
      {
        read: port.read,
        write: port.write,
        writeEnvironment: port.writeEnvironment,
        manifestWrapper: port.manifestWrapper,
      }
    );

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.strictEqual(result.error.name, "DaSensitivityLabelManifestWriteFailed");
      assert.notInclude(result.error.message, "C:\\secret\\project");
    }
  });
});
