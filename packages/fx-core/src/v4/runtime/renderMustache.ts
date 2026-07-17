// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import Mustache from "mustache";
import { Result, err, ok } from "neverthrow";
import { RenderVars } from "../model/dataModel";

/** Single Mustache surface for `.tpl` paths/bodies and step `with` values. */

const SOURCE = "Scaffold";

/** `SystemError` name — a malformed template body the render surface cannot parse. */
export const RENDER_PARSE_ERROR = "RenderParseError";

const DELIMITERS: [string, string] = ["{{", "}}"];

// Private-use sentinels keep producer-less tokens inert through Mustache.
const SENTINEL_OPEN = "\uE000";
const SENTINEL_CLOSE = "\uE001";
const VALUE_SENTINEL_OPEN = "\uE002";
const VALUE_SENTINEL_CLOSE = "\uE003";

// Bare value tokens only; section/comment/partial tags carry a rejected sigil.
const VALUE_TOKEN = /\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g;
const SENTINEL_TOKEN = /\uE000([^\uE001]+)\uE001/g;
const VALUE_SENTINEL_TOKEN = /\uE002([^\uE003]+)\uE003/g;

export function renderMustache(template: string, renderVars: RenderVars): Result<string, FxError> {
  // Protect producer-less tokens and exact flat dotted keys from Mustache's nested lookup.
  const guarded = template.replace(VALUE_TOKEN, (match: string, name: string) => {
    if (!(name in renderVars)) {
      return `${SENTINEL_OPEN}${name}${SENTINEL_CLOSE}`;
    }
    return name.includes(".") ? `${VALUE_SENTINEL_OPEN}${name}${VALUE_SENTINEL_CLOSE}` : match;
  });

  const previousEscape = Mustache.escape;
  Mustache.escape = (value) => value; // no HTML escaping — URLs and ${{…}} refs pass through
  let rendered: string;
  try {
    rendered = Mustache.render(guarded, renderVars, {}, DELIMITERS);
  } catch (error) {
    return err(
      new SystemError({
        source: SOURCE,
        name: RENDER_PARSE_ERROR,
        message: `Failed to render a template body: ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
    );
  } finally {
    Mustache.escape = previousEscape;
  }

  // Restore protected producer-less tokens verbatim.
  const restoredMissing = rendered.replace(
    SENTINEL_TOKEN,
    (_match: string, name: string) => `{{${name}}}`
  );
  const result = restoredMissing.replace(VALUE_SENTINEL_TOKEN, (_match: string, name: string) =>
    String(renderVars[name])
  );
  return ok(result);
}
