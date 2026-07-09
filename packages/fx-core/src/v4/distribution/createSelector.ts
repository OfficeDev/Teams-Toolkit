// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import { Result, err, ok } from "neverthrow";
import { SelectorSpec } from "../buildTarget/resolveBuildTarget";
import {
  SelectorPresentation,
  parseSelectorPresentation,
  parseSelectorSpec,
} from "../buildTarget/parseSelector";

/** Load the v4 create/modify selectors. See resolve-build-target spec. */

const SOURCE = "Scaffold";

export type SelectorKind = "create" | "modify";

/** The selector's fixed entry path inside the channel `templates.zip`. */
function selectorEntry(kind: SelectorKind): string {
  return `v4/${kind}/selector.json`;
}

function parseSelectorJson(selectorRaw: string, sourcePath: string): Result<unknown, FxError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(selectorRaw);
  } catch {
    return err(
      new SystemError({
        source: SOURCE,
        name: "PackageFileInvalid",
        message: `The template package file "${sourcePath}" is not valid JSON.`,
      })
    );
  }

  return ok(parsed);
}

/** Read and JSON-parse the single selector entry from the full package zip. */
function readSelectorRawFromZip(bytes: Buffer, kind: SelectorKind): Result<unknown, FxError> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(bytes);
  } catch {
    return err(
      new SystemError({
        source: SOURCE,
        name: "TemplatePackageCorrupt",
        message: "The resolved template package is not a valid archive.",
      })
    );
  }

  const selectorPath = selectorEntry(kind);
  let selectorRaw: string | undefined;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      continue;
    }
    const name = entry.entryName.replace(/\\/g, "/");
    if (name === selectorPath) {
      selectorRaw = entry.getData().toString("utf8");
      break;
    }
  }

  if (selectorRaw === undefined) {
    return err(
      new SystemError({
        source: SOURCE,
        name: "PackageFileMissing",
        message: `The template package is missing "${selectorPath}".`,
      })
    );
  }

  return parseSelectorJson(selectorRaw, selectorPath);
}

export function openSelector(bytes: Buffer, kind: SelectorKind): Result<SelectorSpec, FxError> {
  const raw = readSelectorRawFromZip(bytes, kind);
  if (raw.isErr()) {
    return err(raw.error);
  }
  return parseSelectorSpec(raw.value);
}

export function openSelectorPresentation(
  bytes: Buffer,
  kind: SelectorKind
): Result<SelectorPresentation, FxError> {
  const raw = readSelectorRawFromZip(bytes, kind);
  if (raw.isErr()) {
    return err(raw.error);
  }
  return parseSelectorPresentation(raw.value);
}

export function openSelectorFromJsonBytes(
  bytes: Buffer,
  kind: SelectorKind
): Result<SelectorSpec, FxError> {
  const selectorPath = selectorEntry(kind);
  const raw = parseSelectorJson(bytes.toString("utf8"), selectorPath);
  if (raw.isErr()) {
    return err(raw.error);
  }
  return parseSelectorSpec(raw.value);
}

export function openSelectorPresentationFromJsonBytes(
  bytes: Buffer,
  kind: SelectorKind
): Result<SelectorPresentation, FxError> {
  const selectorPath = selectorEntry(kind);
  const raw = parseSelectorJson(bytes.toString("utf8"), selectorPath);
  if (raw.isErr()) {
    return err(raw.error);
  }
  return parseSelectorPresentation(raw.value);
}

export function openCreateSelector(bytes: Buffer): Result<SelectorSpec, FxError> {
  return openSelector(bytes, "create");
}

export function openModifySelector(bytes: Buffer): Result<SelectorSpec, FxError> {
  return openSelector(bytes, "modify");
}

/** Open the selector presentation projection for the live Q1 prompt face. */
export function openCreateSelectorPresentation(
  bytes: Buffer
): Result<SelectorPresentation, FxError> {
  return openSelectorPresentation(bytes, "create");
}

export function openModifySelectorPresentation(
  bytes: Buffer
): Result<SelectorPresentation, FxError> {
  return openSelectorPresentation(bytes, "modify");
}
