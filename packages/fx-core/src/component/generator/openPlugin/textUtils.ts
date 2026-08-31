// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Truncate `text` to at most `maxLength` Unicode code points, preferring a word
 * boundary when the cut would land mid-word. If no usable boundary exists
 * within the first 50% of the limit, falls back to a hard cut.
 */
export function truncateAtWordBoundary(text: string | undefined, maxLength: number): string {
  if (!text) {
    return "";
  }
  const codePoints = [...text];
  if (codePoints.length <= maxLength) {
    return text;
  }
  const truncated = codePoints.slice(0, maxLength);
  if (/\s/.test(codePoints[maxLength])) {
    return truncated.join("").trimEnd();
  }
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > Math.floor(maxLength * 0.5)) {
    return truncated.slice(0, lastSpace).join("").trimEnd();
  }
  return truncated.join("").trimEnd();
}

/**
 * Convert a kebab-case identifier to a Title Case display name.
 * Empty segments and stray dashes are ignored.
 */
export function toTitleCaseFromKebab(name: string | undefined): string {
  if (!name) {
    return "";
  }
  return name
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.substring(1).toLowerCase())
    .join(" ");
}
