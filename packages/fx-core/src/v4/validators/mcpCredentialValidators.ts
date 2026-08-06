// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { getLocalizedString } from "../../common/localizeUtils";
import { Validator } from "../collectInputs/collectInputs";

function requiredCredential(localizationKey: string): Validator {
  return (value: string): string | undefined =>
    value.trim().length > 0 ? undefined : getLocalizedString(localizationKey);
}

export const mcpOauthClientIdRequiredValidator = requiredCredential(
  "core.createProjectQuestion.mcpForDa.ClientId.required"
);

export const mcpOauthClientSecretRequiredValidator = requiredCredential(
  "core.createProjectQuestion.mcpForDa.ClientSecret.required"
);

export const mcpEntraClientIdRequiredValidator = requiredCredential(
  "core.createProjectQuestion.mcpForDa.EntraClientId.required"
);
