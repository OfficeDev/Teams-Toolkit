// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { afterEach, assert } from "vitest";
import { TelemetryProperty, telemetryUtils } from "../../src/common/telemetry";
import { ScriptExecutionError } from "../../src/error/script";

describe("telemetry", () => {
  afterEach(async () => {
    // Cleanup if needed
  });
  describe("extractMethodNamesFromErrorStack", () => {
    it("happy path", async () => {
      const stack = `FetchSampleInfoError: Unable to fetch sample info
        at FetchSampleInfoError.toFxError (\\somapath\\TeamsFx\\packages\\fx-core\\build\\component\\error\\componentError.js:45:20)
        at Object.sampleDefaultOnActionError [as onActionError] (\\somapath\\TeamsFx\\packages\\fx-core\\build\\component\\generator\\generator.js:173:59)
        at async Generator.generate (\\somapath\TeamsFx\\packages\\fx-core\\build\\component\\generator\\generator.js:105:21)
        at async Generator.generateSample (\\somapath\\TeamsFx\\packages\\fx-core\\build\\component\\generator\\generator.js:92:9)
        at async Generator.<anonymous> (\\somapath\\TeamsFx\\packages\\fx-core\\build\\component\\middleware\\actionExecutionMW.js:71:13)
        at async Coordinator.create (\\somapath\\TeamsFx\\packages\\fx-core\\build\\component\\coordinator\\index.js:165:25)
        at async Coordinator.<anonymous> (\\somapath\\TeamsFx\\packages\\fx-core\\build\\component\\middleware\\actionExecutionMW.js:71:13)
        at async Coordinator.<anonymous> (\\somapath\\TeamsFx\\packages\\fx-core\\build\\core\\globalVars.js:31:9)
        at async FxCore.createSampleProject (\\somapath\\TeamsFx\\packages\\fx-core\\build\\core\\FxCore.js:102:21)
        at async FxCore.<anonymous> (\\somapath\TeamsFx\\packages\\fx-core\\build\\component\\middleware\\questionMW.js:22:9)
        at async FxCore.ErrorHandlerMW (\\somapath\\TeamsFx\\packages\\fx-core\\build\\core\\middleware\\errorHandler.js:19:9)
        at async FxCore.<anonymous> (\\somapath\\TeamsFx\\packages\\fx-core\\build\\core\\globalVars.js:31:9)`;
      const expectedOutput = [
        "FetchSampleInfoError.toFxError",
        "Object.sampleDefaultOnActionError [as onActionError]",
        "async Generator.generate",
        "async Generator.generateSample",
        "async Generator.<anonymous>",
        "async Coordinator.create",
        "async Coordinator.<anonymous>",
        "async Coordinator.<anonymous>",
        "async FxCore.createSampleProject",
        "async FxCore.<anonymous>",
        "async FxCore.ErrorHandlerMW",
        "async FxCore.<anonymous>",
      ];
      const output = telemetryUtils.extractMethodNamesFromErrorStack(stack);
      assert.equal(output, expectedOutput.join(" | "));
    });
    it("input undefined", async () => {
      const output = telemetryUtils.extractMethodNamesFromErrorStack();
      assert.equal(output, "");
    });
  });

  describe("fillInErrorProperties", () => {
    it("happy path", async () => {
      const props: any = {};
      const error = new Error("error message");
      const fxError = new ScriptExecutionError(error, "test");
      fxError.telemetryProperties = {
        k1: "v1",
      };
      telemetryUtils.fillInErrorProperties(props, fxError);
      assert.equal(props[TelemetryProperty.ErrorMessage], "");
    });
  });
});
