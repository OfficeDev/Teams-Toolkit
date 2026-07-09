// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/** Shared v4 data nouns that cross operation boundaries. */

// --- collect-inputs to build-render-context ---

/** Resolved answers, including provider `derived.<id>.<key>` values. */
export type Answers = Record<string, string | string[]>;

// --- caller to build-render-context to run-scaffold-pipeline ---

/** Caller-injected identifier floor such as `appName` and `language`. */
export type CallerFloor = Record<string, string>;

/** Render variables used by content templates and step `with` values. */
export type RenderVars = Record<string, string | string[]>;

// --- caller / bridge to open-template-package to run-scaffold-pipeline ---

/** Names which legacy-layout template inside the package to open. */
export interface TemplateLocator {
  language: string;
  scenario: string;
}

/** Names which declarative package inside the channel zip to open. */
export interface DeclarativeLocator {
  /** The package namespace: `create` or `modify`. */
  kind: string;
  /** The package id within the kind, e.g. `da/mcp-server`. */
  templateId: string;
}

/** One file from the located template content root. */
export interface TemplateFileEntry {
  /** Path relative to the located template's content root, forward-slash normalized. */
  path: string;
  /** The file's raw bytes, verbatim — unrendered, `.tpl` suffix intact. */
  data: Buffer;
}
