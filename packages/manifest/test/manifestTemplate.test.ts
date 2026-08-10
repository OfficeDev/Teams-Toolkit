// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import "mocha";
import { assert } from "chai";
import fs from "fs-extra";
import os from "os";
import path from "path";
import {
  expandEnvironmentVariable,
  getEnvironmentVariables,
  expandFileFunctionMacros,
  processManifestFunction,
  resolveManifest,
  ManifestType,
  UnsupportedFileFormatError,
  InvalidFunctionError,
  InvalidFunctionParameterError,
  ReadFileError,
  FileNotFoundError,
  FileReferenceOutsideManifestDirectoryError,
  MissingEnvironmentVariablesError,
} from "../src/manifestTemplate";

describe("manifestTemplate", () => {
  let tmpDir: string;
  let fromPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "manifest-template-"));
    fromPath = path.join(tmpDir, "declarativeAgent.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFixture(name: string, content: string): void {
    fs.writeFileSync(path.join(tmpDir, name), content);
  }

  describe("expandEnvironmentVariable", () => {
    it("replaces a defined variable", () => {
      assert.strictEqual(expandEnvironmentVariable("a ${{FOO}} b", { FOO: "x" }), "a x b");
    });

    it("leaves an undefined variable untouched", () => {
      assert.strictEqual(expandEnvironmentVariable("a ${{FOO}} b", {}), "a ${{FOO}} b");
    });

    it("substitutes APP_NAME_SUFFIX even when empty", () => {
      assert.strictEqual(
        expandEnvironmentVariable("name${{APP_NAME_SUFFIX}}", { APP_NAME_SUFFIX: "" }),
        "name"
      );
    });
  });

  describe("getEnvironmentVariables", () => {
    it("returns de-duplicated variable names", () => {
      assert.deepStrictEqual(getEnvironmentVariables("${{A}} ${{B}} ${{A}}"), ["A", "B"]);
    });

    it("returns an empty array when there are none", () => {
      assert.deepStrictEqual(getEnvironmentVariables("no placeholders"), []);
    });
  });

  describe("expandFileFunctionMacros", () => {
    it("inlines a .txt file", async () => {
      writeFixture("instruction.txt", "hello");
      const out = await expandFileFunctionMacros("$[file('instruction.txt')]", false, {
        fromPath,
      });
      assert.strictEqual(out.content, "hello");
      assert.strictEqual(out.functionCount, 1);
    });

    it("JSON-escapes inlined content when isJson is true", async () => {
      writeFixture("instruction.txt", 'a "quote"\r\nsecond');
      const out = await expandFileFunctionMacros(`{"i":"$[file('instruction.txt')]"}`, true, {
        fromPath,
      });
      assert.strictEqual(JSON.parse(out.content).i, 'a "quote"\nsecond');
    });

    it("strips a leading BOM and normalizes CRLF", async () => {
      writeFixture("bom.md", "\uFEFFline1\r\nline2");
      const out = await expandFileFunctionMacros("$[file('bom.md')]", false, { fromPath });
      assert.strictEqual(out.content, "line1\nline2");
    });

    it("expands ${{env}} inside the embedded file", async () => {
      writeFixture("instruction.txt", "value is ${{FOO}}");
      const out = await expandFileFunctionMacros("$[file('instruction.txt')]", false, {
        fromPath,
        envs: { FOO: "bar" },
      });
      assert.strictEqual(out.content, "value is bar");
    });

    it("resolves an env variable used as the file() parameter", async () => {
      writeFixture("byEnv.txt", "content");
      const out = await expandFileFunctionMacros("$[file(${{FILE_PATH}})]", false, {
        fromPath,
        envs: { FILE_PATH: "byEnv.txt" },
      });
      assert.strictEqual(out.content, "content");
    });

    it("resolves a nested file(file(...)) call", async () => {
      writeFixture("outer.txt", "inner.txt");
      writeFixture("inner.txt", "nested content");
      const out = await expandFileFunctionMacros("$[file( file( 'outer.txt' ))]", false, {
        fromPath,
      });
      assert.strictEqual(out.content, "nested content");
    });

    it("leaves content without a function untouched", async () => {
      const out = await expandFileFunctionMacros("no macros here", false, { fromPath });
      assert.strictEqual(out.content, "no macros here");
      assert.strictEqual(out.functionCount, 0);
    });
  });

  describe("processManifestFunction errors", () => {
    it("throws InvalidFunctionError for a non-file function", async () => {
      try {
        await processManifestFunction("env('X')", undefined, fromPath);
        assert.fail("should have thrown");
      } catch (e) {
        assert.instanceOf(e, InvalidFunctionError);
        assert.strictEqual((e as InvalidFunctionError).token, "env('X')");
      }
    });

    it("throws InvalidFunctionParameterError for an unquoted parameter", async () => {
      try {
        await processManifestFunction("file(instruction.md)", undefined, fromPath);
        assert.fail("should have thrown");
      } catch (e) {
        assert.instanceOf(e, InvalidFunctionParameterError);
      }
    });

    it("throws UnsupportedFileFormatError for a disallowed extension", async () => {
      try {
        await processManifestFunction("file('logo.png')", undefined, fromPath);
        assert.fail("should have thrown");
      } catch (e) {
        assert.instanceOf(e, UnsupportedFileFormatError);
        assert.strictEqual((e as UnsupportedFileFormatError).filePath, "logo.png");
      }
    });

    it("throws FileNotFoundError when the file is absent", async () => {
      try {
        await processManifestFunction("file('missing.txt')", undefined, fromPath);
        assert.fail("should have thrown");
      } catch (e) {
        assert.instanceOf(e, FileNotFoundError);
      }
    });

    it("throws ReadFileError when the target cannot be read", async () => {
      // A directory at the target path makes readFile fail (EISDIR).
      fs.mkdirSync(path.join(tmpDir, "instruction.txt"));
      try {
        await processManifestFunction("file('instruction.txt')", undefined, fromPath);
        assert.fail("should have thrown");
      } catch (e) {
        assert.instanceOf(e, ReadFileError);
        assert.isDefined((e as ReadFileError).cause);
      }
    });
  });

  describe("path traversal protection", () => {
    it("rejects a relative file() path that escapes the manifest directory", async () => {
      // A sibling file next to the manifest directory must not be reachable.
      fs.writeFileSync(path.join(os.tmpdir(), "outside-secret.txt"), "secret");
      try {
        await processManifestFunction("file('../outside-secret.txt')", undefined, fromPath);
        assert.fail("should have thrown");
      } catch (e) {
        assert.instanceOf(e, FileReferenceOutsideManifestDirectoryError);
        assert.strictEqual(
          (e as FileReferenceOutsideManifestDirectoryError).manifestDirectory,
          path.resolve(tmpDir)
        );
      } finally {
        fs.rmSync(path.join(os.tmpdir(), "outside-secret.txt"), { force: true });
      }
    });

    it("rejects an absolute file() path outside the manifest directory", async () => {
      const outside = path.join(os.tmpdir(), "outside-abs.txt");
      fs.writeFileSync(outside, "secret");
      try {
        await processManifestFunction(`file('${outside}')`, undefined, fromPath);
        assert.fail("should have thrown");
      } catch (e) {
        assert.instanceOf(e, FileReferenceOutsideManifestDirectoryError);
        // The reported reference is the basename, never the full external path.
        assert.strictEqual(
          (e as FileReferenceOutsideManifestDirectoryError).fileReference,
          "outside-abs.txt"
        );
      } finally {
        fs.rmSync(outside, { force: true });
      }
    });

    it("allows a file inside the manifest directory", async () => {
      writeFixture("inside.txt", "ok");
      const out = await processManifestFunction("file('inside.txt')", undefined, fromPath);
      assert.strictEqual(out, "ok");
    });
  });

  describe("resolveManifest", () => {
    it("expands file() then env for a declarative-agent manifest", async () => {
      writeFixture("instruction.txt", "do ${{TASK}}");
      const out = await resolveManifest(`{"i":"$[file('instruction.txt')]"}`, {
        fromPath,
        manifestType: ManifestType.DeclarativeCopilotManifest,
        envs: { TASK: "things" },
      });
      assert.strictEqual(JSON.parse(out.content).i, "do things");
      assert.strictEqual(out.functionCount, 1);
    });

    it("skips file() expansion for an ApiSpec", async () => {
      const input = "$[file('instruction.txt')]";
      const out = await resolveManifest(input, {
        fromPath,
        manifestType: ManifestType.ApiSpec,
      });
      assert.strictEqual(out.content, input);
      assert.strictEqual(out.functionCount, 0);
    });

    it("throws MissingEnvironmentVariablesError for an unresolved variable", async () => {
      try {
        await resolveManifest("${{NOPE}}", {
          fromPath,
          manifestType: ManifestType.DeclarativeCopilotManifest,
          envs: {},
        });
        assert.fail("should have thrown");
      } catch (e) {
        assert.instanceOf(e, MissingEnvironmentVariablesError);
        assert.strictEqual((e as MissingEnvironmentVariablesError).fromPath, fromPath);
      }
    });
  });
});
