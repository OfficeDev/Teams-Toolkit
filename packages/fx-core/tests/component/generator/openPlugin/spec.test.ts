// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as path from "path";
import { chai } from "vitest";
import {
  isPortableRelativePath,
  isSupportedMcpServerType,
  isValidPluginName,
  normalizePortableRelativePath,
  normalizePluginName,
  PLUGIN_NAME_MAX_LENGTH,
  PLUGIN_NAME_PATTERN,
  resolveWithinRoot,
} from "../../../../src/component/generator/openPlugin/spec";

describe("openPlugin.spec", () => {
  describe("isValidPluginName", () => {
    const valid = ["a", "demo-plugin", "demo.plugin", "a1", "my-plugin.v2", "a".repeat(64)];
    for (const name of valid) {
      it(`accepts "${name.length > 20 ? name.slice(0, 17) + "..." : name}"`, () => {
        chai.expect(isValidPluginName(name)).to.equal(true);
      });
    }

    const invalid = [
      "",
      "Demo-Plugin", // uppercase
      "-leading",
      "trailing-",
      ".leading",
      "trailing.",
      "double--hyphen",
      "double..dot",
      "has space",
      "has_underscore",
      "a".repeat(65), // exceeds maxLength
    ];
    for (const name of invalid) {
      it(`rejects "${name.length > 20 ? name.slice(0, 17) + "..." : name}"`, () => {
        chai.expect(isValidPluginName(name)).to.equal(false);
      });
    }
  });

  describe("portable relative paths", () => {
    it("rejects POSIX, Windows, UNC, and drive-relative paths on every platform", () => {
      for (const value of [
        "/etc/passwd",
        "C:\\temp\\file.json",
        "C:file.json",
        "\\\\server\\share",
      ]) {
        chai.expect(isPortableRelativePath(value)).to.equal(false);
        chai.expect(normalizePortableRelativePath(value)).to.equal(undefined);
      }
    });

    it("rejects paths that normalize to the root or escape it", () => {
      for (const value of [".", "child/..", "child\\..", "../outside", "a/../../outside"]) {
        chai.expect(normalizePortableRelativePath(value)).to.equal(undefined);
      }
    });

    it("rejects Windows-equivalent and non-portable file names on every platform", () => {
      for (const value of [
        "tool.json.",
        "tool.json ",
        "folder./tool.json",
        "folder /tool.json",
        "CON",
        "nested/prn.json",
        "COM1.txt",
        "tools.json:stream",
        "bad?.json",
        "folder/",
        "folder\\",
      ]) {
        chai.expect(normalizePortableRelativePath(value)).to.equal(undefined);
      }
    });

    it("normalizes relative paths to portable separators", () => {
      chai
        .expect(normalizePortableRelativePath("./descriptions\\nested/../file.json"))
        .to.equal("descriptions/file.json");
    });
  });

  describe("normalizePluginName", () => {
    const cases: Array<[string, string]> = [
      ["Demo Plugin", "demo-plugin"],
      ["My  Fancy -- Plugin!!", "my-fancy-plugin"],
      ["  spaced  ", "spaced"],
      ["UPPER", "upper"],
      ["has_underscore", "has-underscore"],
      ["--leading-and-trailing--", "leading-and-trailing"],
      ["dots...everywhere", "dots.everywhere"],
      // ".-." is already spec-valid (no "--" or ".."), so it passes through.
      ["a.-.b", "a.-.b"],
      ["contoso.com/my plugin", "contoso.com-my-plugin"],
    ];
    for (const [input, expected] of cases) {
      it(`"${input}" -> "${expected}"`, () => {
        chai.expect(normalizePluginName(input)).to.equal(expected);
      });
    }

    it("falls back when nothing usable remains", () => {
      chai.expect(normalizePluginName("!!!")).to.equal("exported-plugin");
      chai.expect(normalizePluginName("", "custom-fallback")).to.equal("custom-fallback");
    });

    it("truncates to the schema maximum without a trailing separator", () => {
      const out = normalizePluginName("a".repeat(70));
      chai.expect(out.length).to.equal(PLUGIN_NAME_MAX_LENGTH);
    });

    it("disambiguates Windows reserved device names on every platform", () => {
      for (const input of ["con", "AUX", "nul.json", "com1", "LPT9.plugin"]) {
        const output = normalizePluginName(input);
        chai.expect(output).to.match(/^plugin-/);
        chai.expect(output.length).to.be.at.most(PLUGIN_NAME_MAX_LENGTH);
      }
    });

    it("always produces a name matching the published pattern", () => {
      const inputs = [
        "Demo Plugin",
        "!!!weird---name...",
        "a".repeat(200),
        "Ünïcødé Plugin",
        "123",
        "-",
      ];
      for (const input of inputs) {
        const out = normalizePluginName(input);
        chai
          .expect(PLUGIN_NAME_PATTERN.test(out), `"${input}" produced invalid "${out}"`)
          .to.equal(true);
        chai.expect(out.length).to.be.at.most(PLUGIN_NAME_MAX_LENGTH);
      }
    });
  });

  describe("isSupportedMcpServerType", () => {
    it("accepts the three 1.0.0 transports", () => {
      for (const t of ["stdio", "streamable-http", "sse"]) {
        chai.expect(isSupportedMcpServerType(t)).to.equal(true);
      }
    });

    it("rejects the pre-1.0.0 'http' type and other values", () => {
      for (const t of ["http", "HTTP", "websocket", "", undefined, null, 42]) {
        chai.expect(isSupportedMcpServerType(t)).to.equal(false);
      }
    });
  });

  describe("resolveWithinRoot", () => {
    const root = path.resolve("/tmp/plugin-root");

    it("resolves paths inside the root", () => {
      chai.expect(resolveWithinRoot(root, "skills")).to.equal(path.join(root, "skills"));
      chai.expect(resolveWithinRoot(root, "./a/b")).to.equal(path.join(root, "a", "b"));
    });

    it("allows the root itself", () => {
      chai.expect(resolveWithinRoot(root, ".")).to.equal(root);
    });

    it("allows an in-root segment whose name starts with two dots", () => {
      chai
        .expect(resolveWithinRoot(root, "..cache/file.txt"))
        .to.equal(path.join(root, "..cache", "file.txt"));
    });

    it("rejects traversal outside the root", () => {
      chai.expect(resolveWithinRoot(root, "..")).to.equal(undefined);
      chai.expect(resolveWithinRoot(root, "../outside")).to.equal(undefined);
      chai.expect(resolveWithinRoot(root, "a/../../outside")).to.equal(undefined);
    });

    it("rejects absolute paths that escape the root", () => {
      chai.expect(resolveWithinRoot(root, path.resolve("/etc/passwd"))).to.equal(undefined);
    });
  });
});
