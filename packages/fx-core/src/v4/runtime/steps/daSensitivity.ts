// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { RegisteredStep, StepContext, StepParams } from "../../pipeline/runScaffoldPipeline";

const SOURCE = "Scaffold";

/** Engine step name `da/set-sensitivity-label`. */
export const STEP_SET_SENSITIVITY_LABEL = "da/set-sensitivity-label";

function systemError(name: string, message: string): SystemError {
  return new SystemError({ source: SOURCE, name, message });
}

function manifestPath(params: StepParams): string | undefined {
  const value = params.manifestPath;
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/** Best-effort service used by the sensitivity-label step. */
export interface GeneralSensitivityLabelService {
  resolveId(): Promise<string | undefined>;
}

/** Offline/default service used when no authenticated M365 adapter is registered. */
export const NOOP_GENERAL_SENSITIVITY_LABEL_SERVICE: GeneralSensitivityLabelService = {
  resolveId: (): Promise<undefined> => Promise.resolve(undefined),
};

/** Bind the General-label lookup dependency into its registered step. */
export function createDaSetSensitivityLabelStep(
  generalSensitivityLabel: GeneralSensitivityLabelService
): RegisteredStep {
  return {
    validateParams(resolved: StepParams): string | undefined {
      return manifestPath(resolved) === undefined
        ? "missing non-empty string parameter 'manifestPath'"
        : undefined;
    },
    async apply(resolved: StepParams, ctx: StepContext): Promise<Result<void, FxError>> {
      const path = manifestPath(resolved);
      if (path === undefined) {
        return err(
          systemError("DaSensitivityLabelParams", "resolved manifestPath is not a non-empty string")
        );
      }

      const id = await generalSensitivityLabel.resolveId();
      if (id === undefined) {
        return ok(undefined);
      }

      const wrapper = ctx.manifestWrapper("declarativeAgent");
      if (wrapper.setSensitivityLabel === undefined) {
        return err(
          systemError(
            "DaSensitivityLabelWrapperMissing",
            "the Declarative Agent manifest wrapper cannot set a sensitivity label"
          )
        );
      }
      return wrapper.setSensitivityLabel(path, id);
    },
  };
}

/** Default step binding for offline runtimes and compatibility consumers. */
export const daSetSensitivityLabel = createDaSetSensitivityLabelStep(
  NOOP_GENERAL_SENSITIVITY_LABEL_SERVICE
);
