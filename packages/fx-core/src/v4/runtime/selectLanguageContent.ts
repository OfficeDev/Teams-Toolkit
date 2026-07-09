// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { TemplateFileEntry } from "../model/dataModel";

/** Select the active language subtree before render. See select-language-content spec. */

/** The reserved language id for language-agnostic templates. */
export const COMMON_LANGUAGE = "common";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read the descriptor's declared `languages`, defaulting to the agnostic `["common"]`. */
function descriptorLanguages(descriptor: unknown): string[] {
  if (isRecord(descriptor) && Array.isArray(descriptor.languages)) {
    const languages = descriptor.languages.filter(
      (entry): entry is string => typeof entry === "string"
    );
    if (languages.length > 0) {
      return languages;
    }
  }
  return [COMMON_LANGUAGE];
}

/** Select the content subtree the render phase should consume for `language`. */
export function selectLanguageContent(
  descriptor: unknown,
  content: TemplateFileEntry[],
  language: string
): TemplateFileEntry[] {
  // A `["common"]` package is never partitioned, regardless of the requested language.
  if (descriptorLanguages(descriptor).includes(COMMON_LANGUAGE)) {
    return content;
  }
  // A partitioned package keeps only the selected language subtree.
  const prefix = `${language}/`;
  const selected: TemplateFileEntry[] = [];
  for (const entry of content) {
    if (entry.path.startsWith(prefix)) {
      selected.push({ path: entry.path.slice(prefix.length), data: entry.data });
    }
  }
  return selected;
}
