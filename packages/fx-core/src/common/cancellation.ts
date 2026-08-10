// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Inputs } from "@microsoft/teamsfx-api";
import { UserCancelError } from "../error";

type CancellableInputs = Inputs & { abortSignal?: AbortSignal };

export function getAbortSignal(inputs: Inputs): AbortSignal | undefined {
  return (inputs as CancellableInputs).abortSignal;
}

/** Stops a cooperatively cancellable FxCore operation at a safe boundary. */
export function throwIfAborted(inputs: Inputs): void {
  if (getAbortSignal(inputs)?.aborted) {
    throw new UserCancelError("FxCoreClient");
  }
}
