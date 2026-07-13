// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { assert } from "vitest";
import { createDefaultCreateOptionsProviders } from "../../../src/v4/providers/createOptionsProviders";
import { STEP_REGISTRY } from "../../../src/v4/runtime/runtimeRegistry";
import {
  templateCapabilities,
  templateCapabilityOutputs,
} from "../../../src/v4/validation/capabilityCatalog";
import { createDefaultCreateInputValidators } from "../../../src/v4/validators/createInputValidators";

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

describe("v4/validation/capabilityCatalog", () => {
  it("AC-23/24: every runtime step has exactly one source-owned capability floor", () => {
    const runtimeSteps = new Set(["require-empty-target", ...STEP_REGISTRY.keys()]);

    assert.deepEqual(sorted(templateCapabilities("step")), sorted(runtimeSteps));
  });

  it("AC-23/24: every default provider has exactly one source-owned capability floor", () => {
    const providers = createDefaultCreateOptionsProviders(
      async () => ({ tools: [], requiresAuth: false }),
      async () => []
    );

    assert.deepEqual(sorted(templateCapabilities("provider")), sorted(Object.keys(providers)));
  });

  it("INPUT-25: provider derived schemas exactly match source-owned capability outputs", () => {
    const providers = createDefaultCreateOptionsProviders(
      async () => ({ tools: [], requiresAuth: false }),
      async () => []
    );

    for (const [id, provider] of Object.entries(providers)) {
      assert.deepEqual(
        sorted(templateCapabilityOutputs("provider", id)),
        sorted(provider.derivedSchema ?? []),
        id
      );
    }
  });

  it("AC-23/24: every default validator has exactly one source-owned capability floor", () => {
    const validators = createDefaultCreateInputValidators();

    assert.deepEqual(sorted(templateCapabilities("validator")), sorted(Object.keys(validators)));
  });
});
