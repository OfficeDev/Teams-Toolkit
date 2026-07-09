// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { getLocalizedString } from "../../common/localizeUtils";

/**
 * Shared keyPrefix-based localization for the v4 create prompts. Both the Q1
 * selector walk and the Q2/Q3 collect-inputs bridge resolve user-visible text
 * the same way: look up `<keyPrefix>.<suffix>` in the NLS bundle, and fall back
 * to the authored literal when no key is registered.
 */

/** Localize a raw string when it is itself an NLS key, else return it verbatim. */
export function localizeText(text: string | undefined): string | undefined {
  if (text === undefined) {
    return undefined;
  }
  const localized = getLocalizedString(text);
  return localized.length > 0 ? localized : text;
}

/** Resolve `<keyPrefix>.<suffix>` via NLS, falling back to the literal `fallback`. */
export function localizePrefixedText(
  keyPrefix: string | undefined,
  suffix: string,
  fallback: string | undefined
): string | undefined {
  if (keyPrefix !== undefined) {
    const localized = getLocalizedString(`${keyPrefix}.${suffix}`);
    if (localized.length > 0) {
      return localized;
    }
  }
  return localizeText(fallback);
}
