// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { TemplateFileEntry } from "../../../src/v4/model/dataModel";
import { selectLanguageContent } from "../../../src/v4/runtime/selectLanguageContent";
import { assert } from "vitest";

/**
 * Tests for `select-language-content` — narrowing a package's flat `content/**`
 * to the active language subtree (ADR-0016 §5).
 *
 * Spec: docs/03-specs/operations/scaffolding/select-language-content.md
 * (SLC-01..05). AC-mapped tests use the SLC-* prefix; extra invariant checks are unprefixed.
 *
 * v4-owned (INV-7): imports no v3 symbol.
 */

/** A `TemplateFileEntry` with `path` and a byte body derived from the path. */
function entry(path: string): TemplateFileEntry {
  return { path, data: Buffer.from(path) };
}

/** The flat path list of an entry array (assertion shorthand). */
function paths(entries: TemplateFileEntry[]): string[] {
  return entries.map((e) => e.path);
}

describe("v4 runtime — selectLanguageContent (SLC)", () => {
  it("SLC-01: a ['common'] package with language 'common' is returned unchanged", () => {
    const content = [entry("appPackage/manifest.json.tpl"), entry("README.md")];
    const result = selectLanguageContent({ languages: ["common"] }, content, "common");
    assert.deepStrictEqual(result, content);
  });

  it("SLC-02: a ['common'] package keys off the declared axis, not the floor — a non-common language still returns it unchanged", () => {
    const content = [entry("appPackage/manifest.json.tpl"), entry("README.md")];
    const result = selectLanguageContent({ languages: ["common"] }, content, "typescript");
    assert.deepStrictEqual(result, content);
  });

  it("a descriptor with no declared languages defaults to ['common'] — returned unchanged", () => {
    const content = [entry("appPackage/manifest.json.tpl")];
    const result = selectLanguageContent({}, content, "typescript");
    assert.deepStrictEqual(result, content);
  });

  it("SLC-03: a partitioned package keeps only the selected language subtree, prefix stripped", () => {
    const content = [
      entry("typescript/package.json.tpl"),
      entry("typescript/src/functions/repairs.ts"),
      entry("javascript/package.json.tpl"),
      entry("javascript/src/functions/repairs.js"),
    ];
    const result = selectLanguageContent(
      { languages: ["typescript", "javascript"] },
      content,
      "typescript"
    );
    assert.deepStrictEqual(paths(result), ["package.json.tpl", "src/functions/repairs.ts"]);
  });

  it("SLC-04: selecting 'javascript' keeps only the javascript subtree, prefix stripped", () => {
    const content = [
      entry("typescript/package.json.tpl"),
      entry("typescript/src/functions/repairs.ts"),
      entry("javascript/package.json.tpl"),
      entry("javascript/src/functions/repairs.js"),
    ];
    const result = selectLanguageContent(
      { languages: ["typescript", "javascript"] },
      content,
      "javascript"
    );
    assert.deepStrictEqual(paths(result), ["package.json.tpl", "src/functions/repairs.js"]);
  });

  it("the stripped entries keep their original bytes", () => {
    const content = [entry("typescript/a.txt"), entry("javascript/a.txt")];
    const result = selectLanguageContent(
      { languages: ["typescript", "javascript"] },
      content,
      "javascript"
    );
    assert.lengthOf(result, 1);
    assert.strictEqual(result[0].path, "a.txt");
    // the body is unchanged — only the path prefix was removed.
    assert.strictEqual(result[0].data.toString("utf8"), "javascript/a.txt");
  });

  it("SLC-05: the selected subtree preserves input order", () => {
    const content = [
      entry("typescript/z.txt"),
      entry("javascript/ignored.txt"),
      entry("typescript/a.txt"),
      entry("typescript/m.txt"),
    ];
    const result = selectLanguageContent(
      { languages: ["typescript", "javascript"] },
      content,
      "typescript"
    );
    assert.deepStrictEqual(paths(result), ["z.txt", "a.txt", "m.txt"]);
  });
});
