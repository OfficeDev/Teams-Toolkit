// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios, { AxiosResponse } from "axios";
import * as fs from "fs-extra";
import os from "os";
import * as path from "path";
import { assert, vi } from "vitest";
import {
  BundledFloor,
  computeDigest,
  TemplateSource,
} from "../../../src/v4/distribution/templateSource";
import {
  V4_TAG_PREFIX,
  ZIP_EXT,
  cacheFile,
  createTemplateSourcePort,
  loadResolvedPackage,
  parseTagList,
  templateZipUrl,
} from "../../../src/v4/distribution/templateSourcePort";

describe("templateSourcePort pure helpers (v4)", () => {
  describe("parseTagList (NDJSON, decision #7)", () => {
    it("parses one { version, digest } object per line", () => {
      const ndjson = [
        `{"version":"6.11.0","digest":"sha256:aaa"}`,
        `{"version":"6.11.1","digest":"sha256:bbb"}`,
      ].join("\n");
      const entries = parseTagList(ndjson);
      assert.deepEqual(entries, [
        { version: "6.11.0", digest: "sha256:aaa" },
        { version: "6.11.1", digest: "sha256:bbb" },
      ]);
    });

    it("ignores blank lines and trailing CR", () => {
      const ndjson = `\r\n{"version":"6.11.0","digest":"sha256:aaa"}\r\n\n`;
      const entries = parseTagList(ndjson);
      assert.lengthOf(entries, 1);
      assert.strictEqual(entries[0].version, "6.11.0");
    });

    it("returns an empty array for an empty document", () => {
      assert.deepEqual(parseTagList(""), []);
      assert.deepEqual(parseTagList("\n\n"), []);
    });

    it("throws a hard error on a non-JSON line (no silent skip)", () => {
      const ndjson = `{"version":"6.11.0","digest":"sha256:aaa"}\nnot-json`;
      expect(() => parseTagList(ndjson)).toThrow(/Malformed.*line 2/);
    });

    it("throws a hard error when version or digest is missing", () => {
      expect(() => parseTagList(`{"version":"6.11.0"}`)).toThrow(/Malformed/);
      expect(() => parseTagList(`{"digest":"sha256:aaa"}`)).toThrow(/Malformed/);
    });

    it("throws when a field has the wrong type", () => {
      expect(() => parseTagList(`{"version":6,"digest":"sha256:aaa"}`)).toThrow(/Malformed/);
    });

    it("throws when a line is valid JSON but not an object (number / null)", () => {
      expect(() => parseTagList(`123`)).toThrow(/Malformed/);
      expect(() => parseTagList(`null`)).toThrow(/Malformed/);
    });
  });

  describe("templateZipUrl", () => {
    it("builds a templates-v4@ prefixed download URL", () => {
      const url = templateZipUrl("https://example.com/dl", "6.11.0");
      assert.strictEqual(url, "https://example.com/dl/templates-v4@6.11.0/templates.zip");
    });
  });

  describe("cacheFile", () => {
    it("places the package under ~/.fx/templates-cache with the v4 prefix", () => {
      const file = cacheFile("6.11.0");
      assert.strictEqual(
        file,
        path.join(os.homedir(), ".fx", "templates-cache", `${V4_TAG_PREFIX}6.11.0.zip`)
      );
    });
  });
});

// Per ADR-0013: the thin IO adapter is covered by ONE integration test over a
// real temp cache directory (os.homedir stubbed to the boundary; only the
// network edge is stubbed), not by mock-heavy micro-units.
describe("createTemplateSourcePort (v4, integration over real fs)", () => {
  const sandbox = vi;
  const floor: BundledFloor = {
    version: "6.10.1",
    digest: "sha256:floor",
    location: "bundled://6.10.1",
  };
  const config = {
    templatesV4TagListURL: "https://example.com/tags.ndjson",
    templateDownloadBaseURL: "https://example.com/dl",
    tryLimits: 1,
  };
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = path.join(
      os.tmpdir(),
      `v4-port-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    vi.spyOn(os, "homedir").mockReturnValue(tmpHome);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.removeSync(tmpHome);
  });

  it("warms the in-memory index from a real cache directory, filtering non-matching files", () => {
    const cacheDirPath = path.join(tmpHome, ".fx", "templates-cache");
    fs.ensureDirSync(cacheDirPath);
    const bytes = Buffer.from("zip-bytes-6.10.4");
    fs.writeFileSync(path.join(cacheDirPath, `${V4_TAG_PREFIX}6.10.4${ZIP_EXT}`), bytes);
    fs.writeFileSync(path.join(cacheDirPath, "unrelated.txt"), "ignored");

    const port = createTemplateSourcePort(config, floor);
    assert.deepEqual(port.cache.keys(), ["6.10.4"]);
    const got = port.cache.get("6.10.4");
    assert.isDefined(got);
    assert.strictEqual(got?.digest, computeDigest(bytes));
  });

  it("returns an empty index when the cache directory does not exist", () => {
    const port = createTemplateSourcePort(config, floor);
    assert.deepEqual(port.cache.keys(), []);
  });

  it("put writes the package to disk and indexes it", () => {
    const port = createTemplateSourcePort(config, floor);
    const bytes = Buffer.from("zip-bytes-6.10.7");
    const digest = computeDigest(bytes);
    port.cache.put("6.10.7", digest, bytes);
    assert.isTrue(fs.existsSync(cacheFile("6.10.7")));
    assert.strictEqual(port.cache.get("6.10.7")?.digest, digest);
  });

  it("env reads the real process environment", () => {
    const port = createTemplateSourcePort(config, floor);
    process.env.__V4_PORT_TEST__ = "yes";
    assert.strictEqual(port.env("__V4_PORT_TEST__"), "yes");
    delete process.env.__V4_PORT_TEST__;
  });

  it("tagList fetches and parses the NDJSON channel document", async () => {
    const ndjson = `{"version":"6.11.0","digest":"sha256:aaa"}`;
    vi.spyOn(axios, "get").mockResolvedValue({ status: 200, data: ndjson } as AxiosResponse);
    const port = createTemplateSourcePort(config, floor);
    const tags = await port.tagList();
    assert.deepEqual(tags, [{ version: "6.11.0", digest: "sha256:aaa" }]);
  });

  it("packages downloads the version zip as a Buffer", async () => {
    const payload = Buffer.from("zip-payload");
    vi.spyOn(axios, "get").mockResolvedValue({ status: 200, data: payload } as AxiosResponse);
    const port = createTemplateSourcePort(config, floor);
    const buf = await port.packages("6.11.0", "sha256:aaa");
    assert.isTrue(Buffer.isBuffer(buf));
    assert.strictEqual(buf.toString(), "zip-payload");
    assert.strictEqual(
      templateZipUrl(config.templateDownloadBaseURL, "6.11.0"),
      "https://example.com/dl/templates-v4@6.11.0/templates.zip"
    );
  });
});

// loadResolvedPackage is part of the thin IO adapter: tested over a real temp
// filesystem (ADR-0013), not mock-heavy micro-units. It must never reach the
// network — an online/cache source is already cached by resolution.
describe("loadResolvedPackage (v4, integration over real fs)", () => {
  const sandbox = vi;
  let tmpHome: string;
  let tmpDir: string;

  const config = {
    templatesV4TagListURL: "https://example.com/tags.ndjson",
    templateDownloadBaseURL: "https://example.com/dl",
    tryLimits: 1,
  };

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `v4-load-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    tmpHome = path.join(tmpDir, "home");
    fs.ensureDirSync(tmpDir);
    vi.spyOn(os, "homedir").mockReturnValue(tmpHome);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.removeSync(tmpDir);
  });

  function floorFor(bytes: Buffer): BundledFloor {
    const location = path.join(tmpDir, "floor.zip");
    fs.writeFileSync(location, bytes);
    return { version: "6.10.1", digest: computeDigest(bytes), location };
  }

  it("reads a bundled-floor source from disk and verifies its digest", () => {
    const bytes = Buffer.from("floor-zip-bytes");
    const floor = floorFor(bytes);
    const port = createTemplateSourcePort(config, floor);
    const source: TemplateSource = {
      origin: "bundled",
      version: floor.version,
      digest: floor.digest,
      location: floor.location,
    };
    const res = loadResolvedPackage(source, port);
    assert.isTrue(res.isOk());
    assert.strictEqual(res._unsafeUnwrap().toString(), "floor-zip-bytes");
  });

  it("reads a bundled-fallback source the same way as bundled", () => {
    const bytes = Buffer.from("fallback-zip-bytes");
    const floor = floorFor(bytes);
    const port = createTemplateSourcePort(config, floor);
    const source: TemplateSource = {
      origin: "bundled-fallback",
      version: floor.version,
      digest: floor.digest,
      location: floor.location,
      warning: "offline",
    };
    const res = loadResolvedPackage(source, port);
    assert.strictEqual(res._unsafeUnwrap().toString(), "fallback-zip-bytes");
  });

  it("errors when the bundled-floor file is missing", () => {
    const floor: BundledFloor = {
      version: "6.10.1",
      digest: "sha256:floor",
      location: path.join(tmpDir, "does-not-exist.zip"),
    };
    const port = createTemplateSourcePort(config, floor);
    const source: TemplateSource = {
      origin: "bundled",
      version: floor.version,
      digest: floor.digest,
      location: floor.location,
    };
    const res = loadResolvedPackage(source, port);
    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, "TemplatePackageUnreadable");
  });

  it("returns cached bytes for an online source without any network call", () => {
    const floorBytes = Buffer.from("floor");
    const port = createTemplateSourcePort(config, floorFor(floorBytes));
    const axiosGet = vi.spyOn(axios, "get");
    const bytes = Buffer.from("online-zip-6.11.2");
    const digest = computeDigest(bytes);
    port.cache.put("6.11.2", digest, bytes);
    const source: TemplateSource = {
      origin: "online",
      version: "6.11.2",
      digest,
      location: "templates-v4@6.11.2",
    };
    const res = loadResolvedPackage(source, port);
    assert.strictEqual(res._unsafeUnwrap().toString(), "online-zip-6.11.2");
    assert.isTrue(axiosGet.mock.calls.length === 0);
  });

  it("errors (never re-downloads) when a cache source is not present in the cache", () => {
    const floorBytes = Buffer.from("floor");
    const port = createTemplateSourcePort(config, floorFor(floorBytes));
    const axiosGet = vi.spyOn(axios, "get");
    const source: TemplateSource = {
      origin: "cache",
      version: "6.11.9",
      digest: "sha256:whatever",
      location: "templates-v4@6.11.9",
    };
    const res = loadResolvedPackage(source, port);
    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, "TemplatePackageNotCached");
    assert.isTrue(axiosGet.mock.calls.length === 0);
  });

  it("errors when the loaded bytes do not match source.digest (integrity)", () => {
    const bytes = Buffer.from("tampered");
    const floor = floorFor(bytes);
    const port = createTemplateSourcePort(config, floor);
    const source: TemplateSource = {
      origin: "bundled",
      version: floor.version,
      digest: "sha256:expected-something-else",
      location: floor.location,
    };
    const res = loadResolvedPackage(source, port);
    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, "TemplateDigestMismatch");
  });
});
