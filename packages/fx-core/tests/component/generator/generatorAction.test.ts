// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { MissKeyError } from "../../../src/component/generator/error";
import { sampleDefaultOnActionError } from "../../../src/component/generator/generator";
import {
  downloadDirectoryAction,
  GeneratorContext,
} from "../../../src/component/generator/generatorAction";
import { MockTools } from "../../core/utils";
import { assert } from "vitest";

describe("Generator Actions", async () => {
  const tools = new MockTools();

  it("downloadDirectoryAction has no sampleInfo", async () => {
    const generatorContext: GeneratorContext = {
      name: "test",
      destination: "test",
      logProvider: tools.logProvider,
      onActionError: sampleDefaultOnActionError,
    };
    try {
      await downloadDirectoryAction.run(generatorContext);
      assert.fail("Expected downloadDirectoryAction.run to reject");
    } catch (e: unknown) {
      assert.isTrue(e instanceof MissKeyError);
      assert.equal((e as MissKeyError).message, "Unable to find key sampleInfo");
    }
  });
});
