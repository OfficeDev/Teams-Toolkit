// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import AdmZip from "adm-zip";
import { openTemplatePackage } from "../../../src/v4/distribution/templatePackage";
import { assert } from "vitest";

/** Build an in-memory zip from a `{ entryName: contents }` map. */
function zipOf(files: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [name, contents] of Object.entries(files)) {
    zip.addFile(name, Buffer.isBuffer(contents) ? contents : Buffer.from(contents));
  }
  return zip.toBuffer();
}

describe("open-template-package (v4)", () => {
  // AC-01 — locate one subtree, strip the locator prefix
  it("AC-01: returns the located subtree with the prefix stripped", () => {
    const bytes = zipOf({
      "common/da-basic/README.md": "hello",
      "common/da-basic/m365agents.yml.tpl": "version: 1",
      "common/other/should-not-appear.txt": "x",
    });
    const res = openTemplatePackage(bytes, { language: "common", scenario: "da-basic" });
    assert.isTrue(res.isOk());
    const paths = res._unsafeUnwrap().map((e) => e.path);
    assert.deepEqual(paths, ["README.md", "m365agents.yml.tpl"]);
  });

  // AC-02 — nested relative paths preserved + slash-normalized
  it("AC-02: preserves nested relative paths", () => {
    const bytes = zipOf({
      "common/da-basic/appPackage/manifest.json.tpl": "{}",
    });
    const res = openTemplatePackage(bytes, { language: "common", scenario: "da-basic" });
    const paths = res._unsafeUnwrap().map((e) => e.path);
    assert.deepEqual(paths, ["appPackage/manifest.json.tpl"]);
  });

  // AC-03 — directory entries excluded
  it("AC-03: excludes directory entries", () => {
    const zip = new AdmZip();
    zip.addFile("common/da-basic/appPackage/", Buffer.alloc(0)); // directory entry
    zip.addFile("common/da-basic/appPackage/color.png", Buffer.from([1, 2, 3]));
    const res = openTemplatePackage(zip.toBuffer(), {
      language: "common",
      scenario: "da-basic",
    });
    const paths = res._unsafeUnwrap().map((e) => e.path);
    assert.deepEqual(paths, ["appPackage/color.png"]);
  });

  // AC-04 — bytes returned verbatim, no render
  it("AC-04: returns .tpl bytes verbatim without rendering", () => {
    const body = "name: {{appName}}";
    const bytes = zipOf({ "common/da-basic/m365agents.yml.tpl": body });
    const res = openTemplatePackage(bytes, { language: "common", scenario: "da-basic" });
    const entry = res._unsafeUnwrap()[0];
    assert.strictEqual(entry.data.toString(), body);
    assert.strictEqual(entry.path, "m365agents.yml.tpl");
  });

  // AC-05 — zero-match locator is a hard error
  it("AC-05: a locator matching zero entries is a SystemError", () => {
    const bytes = zipOf({ "common/da-basic/README.md": "x" });
    const res = openTemplatePackage(bytes, { language: "ts", scenario: "missing" });
    assert.isTrue(res.isErr());
    const error = res._unsafeUnwrapErr();
    assert.match(error.message, /ts\/missing|not found/i);
  });

  // AC-06 — invalid archive is a hard error
  it("AC-06: invalid zip bytes raise a SystemError", () => {
    const res = openTemplatePackage(Buffer.from("not a zip at all"), {
      language: "common",
      scenario: "da-basic",
    });
    assert.isTrue(res.isErr());
  });

  // AC-07 — determinism: identical inputs → identical sorted order
  it("AC-07: returns entries sorted by path, deterministically", () => {
    const bytes = zipOf({
      "common/da-basic/z.txt": "z",
      "common/da-basic/a.txt": "a",
      "common/da-basic/m/n.txt": "n",
    });
    const first = openTemplatePackage(bytes, { language: "common", scenario: "da-basic" })
      ._unsafeUnwrap()
      .map((e) => e.path);
    const second = openTemplatePackage(bytes, { language: "common", scenario: "da-basic" })
      ._unsafeUnwrap()
      .map((e) => e.path);
    assert.deepEqual(first, ["a.txt", "m/n.txt", "z.txt"]);
    assert.deepEqual(first, second);
  });

  // AC-08 — prefix boundary: "da" must not match "da-basic"
  it("AC-08: prefix match respects the trailing-slash boundary", () => {
    const bytes = zipOf({
      "common/da/only.txt": "da",
      "common/da-basic/other.txt": "basic",
    });
    const res = openTemplatePackage(bytes, { language: "common", scenario: "da" });
    const paths = res._unsafeUnwrap().map((e) => e.path);
    assert.deepEqual(paths, ["only.txt"]);
  });

  // AC-09 — empty files are retained
  it("AC-09: retains zero-byte files as Buffer(0) entries", () => {
    const bytes = zipOf({
      "common/da-basic/.gitkeep": Buffer.alloc(0),
      "common/da-basic/README.md": "x",
    });
    const entries = openTemplatePackage(bytes, {
      language: "common",
      scenario: "da-basic",
    })._unsafeUnwrap();
    const gitkeep = entries.find((e) => e.path === ".gitkeep");
    assert.isDefined(gitkeep);
    assert.strictEqual(gitkeep!.data.length, 0);
  });

  // AC-10 — Zip-Slip guard: a `..` segment in a located entry is a hard error
  it("AC-10: rejects a located entry whose path contains a .. segment", () => {
    const zip = new AdmZip();
    zip.addFile("common/da-basic/README.md", Buffer.from("ok"));
    zip.addFile("common/da-basic/evil.txt", Buffer.from("pwned"));
    // adm-zip canonicalizes `..` at add time, so set the raw traversal name directly.
    const evil = zip.getEntries().find((e) => e.entryName.endsWith("evil.txt"));
    assert.isDefined(evil);
    evil!.entryName = "common/da-basic/../evil.txt";
    const res = openTemplatePackage(zip.toBuffer(), { language: "common", scenario: "da-basic" });
    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, "TemplatePackageUnsafePath");
  });
});
