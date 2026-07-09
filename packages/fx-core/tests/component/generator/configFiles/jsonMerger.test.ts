// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import os from "os";
import path from "path";
import { mergeJsonFile } from "../../../../src/component/generator/configFiles/jsonMerger";
import { assert, vi } from "vitest";

// Note: these tests exercise the on-disk merge behavior (fs + comment-json) to validate the rules.
describe("mergeJsonFile", () => {
  let sandbox: any;
  let tempDir: string;

  beforeEach(async () => {
    sandbox = vi;
    tempDir = path.join(os.tmpdir(), `json-merge-${Date.now()}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(tempDir);
  });

  it("no-ops when source file is missing", async () => {
    const sourcePath = path.join(tempDir, "missing.json");
    const targetPath = path.join(tempDir, "target.json");
    const content = '{"a":1,"b":[1,2]}';
    await fs.writeFile(targetPath, content);

    await mergeJsonFile(sourcePath, targetPath);

    const written = await fs.readFile(targetPath, "utf8");
    assert.equal(written.trim(), content);
  });

  it("copies source when target does not exist", async () => {
    const sourcePath = path.join(tempDir, "source.json");
    const targetPath = path.join(tempDir, "target.json");
    const content = '{"a":1,"b":[1,2]}';
    await fs.writeFile(sourcePath, content);

    await mergeJsonFile(sourcePath, targetPath);

    const written = await fs.readFile(targetPath, "utf8");
    assert.equal(written.trim(), content);
  });

  it("merges arrays with de-duplication", async () => {
    const sourcePath = path.join(tempDir, "source.json");
    const targetPath = path.join(tempDir, "target.json");
    await fs.writeFile(sourcePath, '{"arr":[1,2,{"a":1},{"a":2}]}');
    await fs.writeFile(targetPath, '{"arr":[1,{"a":1}]}');

    await mergeJsonFile(sourcePath, targetPath);

    const merged = await fs.readFile(targetPath, "utf8");
    const parsed = JSON.parse(merged);
    assert.deepEqual(parsed.arr, [1, { a: 1 }, 2, { a: 2 }]);
  });

  it("merges root arrays with de-duplication", async () => {
    const sourcePath = path.join(tempDir, "source.json");
    const targetPath = path.join(tempDir, "target.json");
    await fs.writeFile(sourcePath, '[1,2,{"a":1}]');
    await fs.writeFile(targetPath, '[1,{"a":1}]');

    await mergeJsonFile(sourcePath, targetPath);

    const parsed = JSON.parse(await fs.readFile(targetPath, "utf8"));
    assert.deepEqual(parsed, [1, { a: 1 }, 2]);
  });

  it("merges nested objects and keeps existing primitives", async () => {
    const sourcePath = path.join(tempDir, "source.json");
    const targetPath = path.join(tempDir, "target.json");
    await fs.writeFile(sourcePath, '{"outer":{"added":2},"a":2}');
    await fs.writeFile(targetPath, '{"outer":{"existing":1},"a":1}');

    await mergeJsonFile(sourcePath, targetPath);

    const parsed = JSON.parse(await fs.readFile(targetPath, "utf8"));
    assert.deepEqual(parsed.outer, { existing: 1, added: 2 });
    assert.equal(parsed.a, 1); // primitive not overwritten
  });

  it("does not overwrite when types differ", async () => {
    const sourcePath = path.join(tempDir, "source.json");
    const targetPath = path.join(tempDir, "target.json");
    await fs.writeFile(sourcePath, '{"prop":{"nested":true}}');
    await fs.writeFile(targetPath, '{"prop":5}');

    await mergeJsonFile(sourcePath, targetPath);

    const parsed = JSON.parse(await fs.readFile(targetPath, "utf8"));
    assert.strictEqual(parsed.prop, 5);
  });

  it("preserves existing comments while adding new properties", async () => {
    const sourcePath = path.join(tempDir, "source.json");
    const targetPath = path.join(tempDir, "target.json");
    await fs.writeFile(sourcePath, '{"newProp":true}');
    await fs.writeFile(
      targetPath,
      `{
// keep this comment
"existing": 1
}`
    );

    await mergeJsonFile(sourcePath, targetPath);

    const output = await fs.readFile(targetPath, "utf8");
    assert.include(output, "keep this comment");
    assert.include(output, "newProp");
  });

  it("throws when JSON cannot be parsed", async () => {
    const sourcePath = path.join(tempDir, "source.json");
    const targetPath = path.join(tempDir, "target.json");
    await fs.writeFile(sourcePath, "{ invalid");
    await fs.writeFile(targetPath, "{}");

    let caught = false;
    try {
      await mergeJsonFile(sourcePath, targetPath);
    } catch (e) {
      caught = true;
      assert.match((e as Error).message, /token|parse|syntax/i);
    }

    assert.isTrue(caught, "expected parse error to be thrown");
  });
});
