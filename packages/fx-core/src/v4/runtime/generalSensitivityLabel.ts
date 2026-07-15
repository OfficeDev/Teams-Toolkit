// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { M365TokenProvider, signedIn } from "@microsoft/teamsfx-api";
import { GraphClient } from "../../client/graphClient";
import { ListSensitivityLabelScope } from "../../common/constants";
import {
  GeneralSensitivityLabelService,
  NOOP_GENERAL_SENSITIVITY_LABEL_SERVICE,
} from "./steps/daSensitivity";

/** Build the non-interactive, best-effort Graph adapter used by the real scaffold runtime. */
export function createGeneralSensitivityLabelService(
  tokenProvider: M365TokenProvider | undefined
): GeneralSensitivityLabelService {
  if (tokenProvider === undefined) {
    return NOOP_GENERAL_SENSITIVITY_LABEL_SERVICE;
  }

  return {
    resolveId: async (): Promise<string | undefined> => {
      try {
        const status = await tokenProvider.getStatus({
          scopes: [ListSensitivityLabelScope],
          showDialog: false,
        });
        if (
          status.isErr() ||
          status.value.status !== signedIn ||
          status.value.token === undefined
        ) {
          return undefined;
        }

        const result = await new GraphClient(tokenProvider).getGeneralSentivityLabel(
          status.value.token
        );
        return result.isOk() ? result.value.id : undefined;
      } catch {
        return undefined;
      }
    },
  };
}
