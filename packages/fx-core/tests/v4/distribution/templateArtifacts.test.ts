// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError } from "@microsoft/teamsfx-api";
import axios, { AxiosResponse } from "axios";
import * as fs from "fs-extra";
import os from "os";
import * as path from "path";
import { assert, vi } from "vitest";
import {
  BundledTemplateArtifacts,
  CachedTemplateArtifact,
  TemplateArtifactKind,
  TemplateArtifactPort,
  V4TemplateTagEntry,
  artifactCacheFile,
  artifactUrl,
  computeArtifactDigest,
  createTemplateArtifactPort,
  parseArtifactTagList,
  resolveTemplateArtifactSnapshot,
} from "../../../src/v4/distribution/templateArtifacts";

class FakeArtifactPort implements TemplateArtifactPort {
  public tagListCalls = 0;
  public downloads: Array<{ version: string; kind: TemplateArtifactKind }> = [];
  public deleted: Array<{ version: string; kind: TemplateArtifactKind }> = [];
  private readonly envMap: Record<string, string | undefined>;
  private readonly tags: V4TemplateTagEntry[];
  private readonly tagListError: Error | undefined;
  private readonly served: Record<string, Record<TemplateArtifactKind, Buffer | undefined>>;
  private readonly store = new Map<string, CachedTemplateArtifact>();
  private readonly putFailures = new Set<string>();
  public readonly bundled: BundledTemplateArtifacts;

  constructor(opts: {
    env?: Record<string, string | undefined>;
    tags?: V4TemplateTagEntry[];
    tagListError?: Error;
    served?: Record<string, Record<TemplateArtifactKind, Buffer | undefined>>;
    cache?: Array<{ version: string; kind: TemplateArtifactKind; digest: string; bytes: Buffer }>;
    putFailures?: Array<{ version: string; kind: TemplateArtifactKind }>;
    bundled?: BundledTemplateArtifacts;
  }) {
    this.envMap = opts.env ?? {};
    this.tags = opts.tags ?? [];
    this.tagListError = opts.tagListError;
    this.served = opts.served ?? {};
    this.bundled = opts.bundled ?? bundledArtifacts("6.10.0");
    for (const cached of opts.cache ?? []) {
      this.store.set(cacheKey(cached.version, cached.kind), {
        digest: cached.digest,
        bytes: cached.bytes,
      });
    }
    for (const failure of opts.putFailures ?? []) {
      this.putFailures.add(cacheKey(failure.version, failure.kind));
    }
  }

  env(name: string): string | undefined {
    return this.envMap[name];
  }

  tagList(): Promise<V4TemplateTagEntry[]> {
    this.tagListCalls++;
    if (this.tagListError) {
      return Promise.reject(this.tagListError);
    }
    return Promise.resolve(this.tags);
  }

  download(version: string, ref: { kind: TemplateArtifactKind }): Promise<Buffer> {
    this.downloads.push({ version, kind: ref.kind });
    const versionArtifacts = this.served[version];
    const bytes = versionArtifacts?.[ref.kind];
    if (!bytes) {
      return Promise.reject(new Error(`No artifact ${ref.kind} for ${version}`));
    }
    return Promise.resolve(bytes);
  }

  cache = {
    get: (version: string, kind: TemplateArtifactKind): CachedTemplateArtifact | undefined =>
      this.store.get(cacheKey(version, kind)),
    put: (version: string, kind: TemplateArtifactKind, digest: string, bytes: Buffer): void => {
      const key = cacheKey(version, kind);
      if (this.putFailures.has(key)) {
        throw new Error(`put failed for ${key}`);
      }
      this.store.set(key, { digest, bytes });
    },
    keys: (kind: TemplateArtifactKind): string[] => {
      const versions: string[] = [];
      for (const key of this.store.keys()) {
        const parsed = parseCacheKey(key);
        if (parsed?.kind === kind) {
          versions.push(parsed.version);
        }
      }
      return versions;
    },
    delete: (version: string, kind: TemplateArtifactKind): void => {
      this.deleted.push({ version, kind });
      this.store.delete(cacheKey(version, kind));
    },
  };
}

describe("templateArtifacts (v4 staged artifacts)", () => {
  it("AC-SA-01: parses final multi-artifact tag-list entries without a top-level digest", () => {
    const ndjson = JSON.stringify({
      version: "6.11.0",
      artifacts: tagArtifacts("6.11.0"),
    });

    const entries = parseArtifactTagList(ndjson);

    assert.lengthOf(entries, 1);
    assert.strictEqual(entries[0].version, "6.11.0");
    assert.strictEqual(entries[0].artifacts["create-selector"].kind, "create-selector");
    assert.strictEqual(entries[0].artifacts.templates.file, "templates.zip");
    assert.notProperty(entries[0], "digest");
  });

  it("AC-SA-02: rejects earlier single-digest v4 tag-list entries", () => {
    expect(() => parseArtifactTagList(`{"version":"6.11.0","digest":"sha256:aaa"}`)).toThrow(
      /Malformed/
    );
  });

  it("AC-SA-02b: rejects final entries that still carry a top-level digest", () => {
    const ndjson = JSON.stringify({
      version: "6.11.0",
      digest: "sha256:legacy",
      artifacts: tagArtifacts("6.11.0"),
    });

    expect(() => parseArtifactTagList(ndjson)).toThrow(/Malformed/);
  });

  it("AC-SA-02c: rejects invalid JSON and malformed artifact references", () => {
    expect(() => parseArtifactTagList("not-json")).toThrow(/not valid JSON/);
    expect(() =>
      parseArtifactTagList("\r\n  \n" + JSON.stringify(tagEntry("6.11.0")))
    ).not.toThrow();
    expect(() => parseArtifactTagList("null")).toThrow(/Malformed/);

    const wrongFile = tagEntry("6.11.0");
    wrongFile.artifacts.metadata.file = "metadata.zip";
    expect(() => parseArtifactTagList(JSON.stringify(wrongFile))).toThrow(/Malformed/);

    const missingArtifacts = JSON.stringify({ version: "6.11.0", artifacts: {} });
    expect(() => parseArtifactTagList(missingArtifacts)).toThrow(/Malformed/);
  });

  it("AC-SA-03: builds artifact URLs and cache paths from known artifact kinds", () => {
    const ref = tagEntry("6.11.0").artifacts.metadata;

    assert.strictEqual(
      artifactUrl("https://example.com/releases", "6.11.0", ref),
      "https://example.com/releases/templates-v4@6.11.0/templates-metadata.zip"
    );
    assert.match(artifactCacheFile("6.11.0", "metadata"), /templates-v4@6\.11\.0/);
    assert.match(artifactCacheFile("6.11.0", "metadata"), /templates-metadata\.zip$/);
  });

  it("AC-SA-04: resolves online refs and downloads the required artifact after digest verification", async () => {
    const bytes = bytesFor("create-selector", "6.11.0");
    const port = new FakeArtifactPort({
      tags: [tagEntry("6.11.0", { "create-selector": computeArtifactDigest(bytes) })],
      served: { "6.11.0": servedArtifacts({ "create-selector": bytes }) },
    });

    const result = await resolveTemplateArtifactSnapshot({
      range: "^6.11.0",
      bundled: false,
      requiredKind: "create-selector",
      port,
    });

    assert.isTrue(result.isOk());
    const snapshot = result._unsafeUnwrap();
    assert.strictEqual(snapshot.version, "6.11.0");
    assert.strictEqual(snapshot.origin, "online");
    assert.deepEqual(port.downloads, [{ version: "6.11.0", kind: "create-selector" }]);
    const cached = port.cache.get("6.11.0", "create-selector");
    assert.strictEqual(cached?.bytes.toString(), bytes.toString());
  });

  it("AC-SA-05: loads a cached required artifact without network", async () => {
    const bytes = bytesFor("metadata", "6.11.1");
    const digest = computeArtifactDigest(bytes);
    const port = new FakeArtifactPort({
      tags: [tagEntry("6.11.1", { metadata: digest })],
      cache: [{ version: "6.11.1", kind: "metadata", digest, bytes }],
    });

    const result = await resolveTemplateArtifactSnapshot({
      range: "^6.11.0",
      bundled: false,
      requiredKind: "metadata",
      port,
    });

    assert.strictEqual(result._unsafeUnwrap().origin, "cache");
    assert.deepEqual(port.downloads, []);
  });

  it("AC-SA-06: keeps only the highest cached version per major.minor and artifact kind", async () => {
    const oldBytes = bytesFor("metadata", "6.11.0");
    const newBytes = bytesFor("metadata", "6.11.2");
    const port = new FakeArtifactPort({
      tags: [tagEntry("6.11.2", { metadata: computeArtifactDigest(newBytes) })],
      cache: [
        {
          version: "6.11.0",
          kind: "metadata",
          digest: computeArtifactDigest(oldBytes),
          bytes: oldBytes,
        },
      ],
      served: { "6.11.2": servedArtifacts({ metadata: newBytes }) },
    });

    const result = await resolveTemplateArtifactSnapshot({
      range: "^6.11.0",
      bundled: false,
      requiredKind: "metadata",
      port,
    });

    assert.isTrue(result.isOk());
    assert.deepEqual(port.cache.keys("metadata"), ["6.11.2"]);
    assert.deepEqual(port.deleted, [{ version: "6.11.0", kind: "metadata" }]);
  });

  it("AC-SA-07: does not delete another major.minor line when caching a newer artifact", async () => {
    const retainedBytes = bytesFor("templates", "6.10.9");
    const newBytes = bytesFor("templates", "6.11.0");
    const port = new FakeArtifactPort({
      tags: [tagEntry("6.11.0", { templates: computeArtifactDigest(newBytes) })],
      cache: [
        {
          version: "6.10.9",
          kind: "templates",
          digest: computeArtifactDigest(retainedBytes),
          bytes: retainedBytes,
        },
      ],
      served: { "6.11.0": servedArtifacts({ templates: newBytes }) },
    });

    const result = await resolveTemplateArtifactSnapshot({
      range: "^6.11.0",
      bundled: false,
      requiredKind: "templates",
      port,
    });

    assert.isTrue(result.isOk());
    assert.sameMembers(port.cache.keys("templates"), ["6.10.9", "6.11.0"]);
    assert.deepEqual(port.deleted, []);
  });

  it("AC-SA-08: does not delete old cache when writing the new artifact fails", async () => {
    const oldBytes = bytesFor("metadata", "6.11.0");
    const newBytes = bytesFor("metadata", "6.11.1");
    const port = new FakeArtifactPort({
      tags: [tagEntry("6.11.1", { metadata: computeArtifactDigest(newBytes) })],
      cache: [
        {
          version: "6.11.0",
          kind: "metadata",
          digest: computeArtifactDigest(oldBytes),
          bytes: oldBytes,
        },
      ],
      served: { "6.11.1": servedArtifacts({ metadata: newBytes }) },
      putFailures: [{ version: "6.11.1", kind: "metadata" }],
    });

    const result = await resolveTemplateArtifactSnapshot({
      range: "^6.11.0",
      bundled: false,
      requiredKind: "metadata",
      port,
    });

    assert.isTrue(result.isErr());
    assert.instanceOf(result._unsafeUnwrapErr(), SystemError);
    assert.deepEqual(port.cache.keys("metadata"), ["6.11.0"]);
    assert.deepEqual(port.deleted, []);
  });

  it("AC-SA-08b: keeps a pinned lower patch readable when a higher patch is cached", async () => {
    const pinnedBytes = bytesFor("metadata", "6.11.1");
    const higherBytes = bytesFor("metadata", "6.11.2");
    const port = new FakeArtifactPort({
      env: { TEMPLATE_VERSION: "6.11.1" },
      tags: [tagEntry("6.11.1", { metadata: computeArtifactDigest(pinnedBytes) })],
      cache: [
        {
          version: "6.11.2",
          kind: "metadata",
          digest: computeArtifactDigest(higherBytes),
          bytes: higherBytes,
        },
      ],
      served: { "6.11.1": servedArtifacts({ metadata: pinnedBytes }) },
    });

    const result = await resolveTemplateArtifactSnapshot({
      range: "^6.11.0",
      bundled: false,
      requiredKind: "metadata",
      port,
    });

    assert.isTrue(result.isOk());
    const bytes = await result._unsafeUnwrap().bytes("metadata");
    assert.strictEqual(bytes._unsafeUnwrap().toString(), pinnedBytes.toString());
    assert.sameMembers(port.cache.keys("metadata"), ["6.11.1", "6.11.2"]);
    assert.deepEqual(port.deleted, []);
  });

  it("AC-SA-08c: reports pinned version, download, and digest errors", async () => {
    const missingPinned = await resolveTemplateArtifactSnapshot({
      range: "^6.11.0",
      bundled: false,
      requiredKind: "metadata",
      port: new FakeArtifactPort({
        env: { TEMPLATE_VERSION: "6.11.9" },
        tags: [tagEntry("6.11.0")],
      }),
    });
    assert.strictEqual(missingPinned._unsafeUnwrapErr().name, "TemplatePinnedVersionNotFound");

    const downloadFailure = await resolveTemplateArtifactSnapshot({
      range: "^6.11.0",
      bundled: false,
      requiredKind: "metadata",
      port: new FakeArtifactPort({ tags: [tagEntry("6.11.0")] }),
    });
    assert.strictEqual(downloadFailure._unsafeUnwrapErr().name, "TemplateDownloadFailed");

    const digestFailure = await resolveTemplateArtifactSnapshot({
      range: "^6.11.0",
      bundled: false,
      requiredKind: "metadata",
      port: new FakeArtifactPort({
        tags: [tagEntry("6.11.0", { metadata: "sha256:expected" })],
        served: { "6.11.0": servedArtifacts({ metadata: Buffer.from("actual") }) },
      }),
    });
    assert.strictEqual(digestFailure._unsafeUnwrapErr().name, "TemplateDigestMismatch");

    const rangeMismatch = await resolveTemplateArtifactSnapshot({
      range: "^7.0.0",
      bundled: false,
      requiredKind: "metadata",
      port: new FakeArtifactPort({ tags: [tagEntry("6.11.0")] }),
    });
    assert.strictEqual(rangeMismatch._unsafeUnwrapErr().name, "TemplateVersionMismatch");
  });

  it("AC-SA-08d: propagates artifact download and cache write SystemErrors unchanged", async () => {
    const downloadError = new SystemError({
      source: "Test",
      name: "DownloadSystemError",
      message: "download failed",
    });
    const downloadPort = new FakeArtifactPort({ tags: [tagEntry("6.11.0")] });
    downloadPort.download = () => Promise.reject(downloadError);

    const downloadResult = await resolveTemplateArtifactSnapshot({
      range: "^6.11.0",
      bundled: false,
      requiredKind: "metadata",
      port: downloadPort,
    });
    assert.strictEqual(downloadResult._unsafeUnwrapErr(), downloadError);

    const bytes = bytesFor("metadata", "6.11.0");
    const cacheError = new SystemError({
      source: "Test",
      name: "CacheSystemError",
      message: "cache failed",
    });
    const cachePort = new FakeArtifactPort({
      tags: [tagEntry("6.11.0", { metadata: computeArtifactDigest(bytes) })],
      served: { "6.11.0": servedArtifacts({ metadata: bytes }) },
    });
    cachePort.cache.put = () => {
      throw cacheError;
    };

    const cacheResult = await resolveTemplateArtifactSnapshot({
      range: "^6.11.0",
      bundled: false,
      requiredKind: "metadata",
      port: cachePort,
    });
    assert.strictEqual(cacheResult._unsafeUnwrapErr(), cacheError);
  });

  it("AC-SA-09: returns the bundled snapshot when bundled=true or TEMPLATE_VERSION=local", async () => {
    const bundled = bundledArtifacts("6.10.5");
    const bundledPort = new FakeArtifactPort({ tags: [tagEntry("6.11.0")], bundled });
    const localPort = new FakeArtifactPort({
      env: { TEMPLATE_VERSION: "local" },
      tags: [tagEntry("6.11.0")],
      bundled,
    });

    const bundledResult = await resolveTemplateArtifactSnapshot({
      range: "^6.10.0",
      bundled: true,
      requiredKind: "create-selector",
      port: bundledPort,
    });
    const localResult = await resolveTemplateArtifactSnapshot({
      range: "^6.10.0",
      bundled: false,
      requiredKind: "create-selector",
      port: localPort,
    });

    assert.strictEqual(bundledResult._unsafeUnwrap().origin, "bundled");
    assert.strictEqual(localResult._unsafeUnwrap().origin, "bundled");
    assert.strictEqual(bundledPort.tagListCalls, 0);
    assert.strictEqual(localPort.tagListCalls, 0);
  });

  it("AC-SA-09b: reads bundled artifact bytes and reports unreadable bundled files", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "v4-bundled-bytes-"));
    const selectorPath = path.join(tmp, "create-selector.json");
    fs.writeFileSync(selectorPath, "selector-bytes");
    const bundled = bundledArtifacts("6.10.5");
    bundled.locations["create-selector"] = selectorPath;
    const readable = await resolveTemplateArtifactSnapshot({
      range: "^6.10.0",
      bundled: true,
      requiredKind: "create-selector",
      port: new FakeArtifactPort({ bundled }),
    });

    const bytes = await readable._unsafeUnwrap().bytes("create-selector");
    assert.strictEqual(bytes._unsafeUnwrap().toString(), "selector-bytes");

    bundled.locations["modify-selector"] = path.join(tmp, "missing.json");
    const missing = await readable._unsafeUnwrap().bytes("modify-selector");
    assert.strictEqual(missing._unsafeUnwrapErr().name, "BundledArtifactUnreadable");
    fs.removeSync(tmp);
  });

  it("AC-SA-10: non-interactive direct resolution downloads templates.zip only", async () => {
    const bytes = bytesFor("templates", "6.11.0");
    const port = new FakeArtifactPort({
      tags: [tagEntry("6.11.0", { templates: computeArtifactDigest(bytes) })],
      served: { "6.11.0": servedArtifacts({ templates: bytes }) },
    });

    const result = await resolveTemplateArtifactSnapshot({
      range: "^6.11.0",
      bundled: false,
      requiredKind: "templates",
      port,
    });

    assert.isTrue(result.isOk());
    assert.deepEqual(port.downloads, [{ version: "6.11.0", kind: "templates" }]);
  });

  it("AC-SA-10b: one snapshot lazily downloads later artifact kinds against the same version", async () => {
    const selectorBytes = bytesFor("create-selector", "6.11.0");
    const metadataBytes = bytesFor("metadata", "6.11.0");
    const port = new FakeArtifactPort({
      tags: [
        tagEntry("6.11.0", {
          "create-selector": computeArtifactDigest(selectorBytes),
          metadata: computeArtifactDigest(metadataBytes),
        }),
      ],
      served: {
        "6.11.0": servedArtifacts({
          "create-selector": selectorBytes,
          metadata: metadataBytes,
        }),
      },
    });

    const result = await resolveTemplateArtifactSnapshot({
      range: "^6.11.0",
      bundled: false,
      requiredKind: "create-selector",
      port,
    });
    const metadata = await result._unsafeUnwrap().bytes("metadata");

    assert.strictEqual(metadata._unsafeUnwrap().toString(), metadataBytes.toString());
    assert.deepEqual(port.downloads, [
      { version: "6.11.0", kind: "create-selector" },
      { version: "6.11.0", kind: "metadata" },
    ]);
  });

  it("AC-SA-10c: lazy artifact reads return download and missing-cache errors", async () => {
    const selectorBytes = bytesFor("create-selector", "6.11.0");
    const metadataBytes = bytesFor("metadata", "6.11.0");
    const downloadPort = new FakeArtifactPort({
      tags: [
        tagEntry("6.11.0", {
          "create-selector": computeArtifactDigest(selectorBytes),
          metadata: computeArtifactDigest(metadataBytes),
        }),
      ],
      served: { "6.11.0": servedArtifacts({ "create-selector": selectorBytes }) },
    });
    const snapshotResult = await resolveTemplateArtifactSnapshot({
      range: "^6.11.0",
      bundled: false,
      requiredKind: "create-selector",
      port: downloadPort,
    });

    const lazyDownload = await snapshotResult._unsafeUnwrap().bytes("metadata");
    assert.strictEqual(lazyDownload._unsafeUnwrapErr().name, "TemplateDownloadFailed");

    const missingCachePort = new FakeArtifactPort({
      tags: [
        tagEntry("6.11.0", {
          "create-selector": computeArtifactDigest(selectorBytes),
          metadata: computeArtifactDigest(metadataBytes),
        }),
      ],
      served: {
        "6.11.0": servedArtifacts({
          "create-selector": selectorBytes,
          metadata: metadataBytes,
        }),
      },
    });
    const originalPut = missingCachePort.cache.put;
    missingCachePort.cache.put = (version, kind, digest, bytes): void => {
      if (kind !== "metadata") {
        originalPut(version, kind, digest, bytes);
      }
    };
    const missingCacheSnapshot = await resolveTemplateArtifactSnapshot({
      range: "^6.11.0",
      bundled: false,
      requiredKind: "create-selector",
      port: missingCachePort,
    });

    const missingCache = await missingCacheSnapshot._unsafeUnwrap().bytes("metadata");
    assert.strictEqual(missingCache._unsafeUnwrapErr().name, "TemplateArtifactNotCached");
  });

  it("AC-SA-15: falls back to bundled floor when the ranged tag list is unreachable", async () => {
    const port = new FakeArtifactPort({
      tagListError: new Error("offline"),
      bundled: bundledArtifacts("6.10.5"),
    });

    const result = await resolveTemplateArtifactSnapshot({
      range: "~6.10.0",
      bundled: false,
      requiredKind: "create-selector",
      port,
    });

    assert.isTrue(result.isOk());
    assert.strictEqual(result._unsafeUnwrap().origin, "bundled-fallback");
    assert.strictEqual(result._unsafeUnwrap().version, "6.10.5");
  });

  it("AC-SA-16: falls back to the highest complete cached snapshot when tag list is unreachable", async () => {
    const port = new FakeArtifactPort({
      tagListError: new Error("offline"),
      bundled: bundledArtifacts("6.10.0"),
      cache: cachedArtifactSet("6.10.6"),
    });

    const result = await resolveTemplateArtifactSnapshot({
      range: "~6.10.0",
      bundled: false,
      requiredKind: "metadata",
      port,
    });

    assert.isTrue(result.isOk());
    assert.strictEqual(result._unsafeUnwrap().origin, "cache");
    assert.strictEqual(result._unsafeUnwrap().version, "6.10.6");
    const bytes = await result._unsafeUnwrap().bytes("metadata");
    assert.strictEqual(bytes._unsafeUnwrap().toString(), bytesFor("metadata", "6.10.6").toString());

    port.cache.delete("6.10.6", "metadata");
    const missing = await result._unsafeUnwrap().bytes("metadata");
    assert.strictEqual(missing._unsafeUnwrapErr().name, "TemplateArtifactNotCached");
  });

  it("AC-SA-16b: reports mismatch when no fallback cache or bundled floor satisfies the range", async () => {
    const port = new FakeArtifactPort({
      tagListError: new Error("offline"),
      bundled: bundledArtifacts("6.10.0"),
    });

    const result = await resolveTemplateArtifactSnapshot({
      range: "^7.0.0",
      bundled: false,
      requiredKind: "metadata",
      port,
    });

    assert.strictEqual(result._unsafeUnwrapErr().name, "TemplateVersionMismatch");
  });

  it("AC-SA-16c: pinned non-semver cache does not run line-based GC", async () => {
    const bytes = bytesFor("metadata", "not-semver");
    const port = new FakeArtifactPort({
      env: { TEMPLATE_VERSION: "not-semver" },
      tags: [tagEntry("not-semver", { metadata: computeArtifactDigest(bytes) })],
      served: { "not-semver": servedArtifacts({ metadata: bytes }) },
    });

    const result = await resolveTemplateArtifactSnapshot({
      range: "^6.11.0",
      bundled: false,
      requiredKind: "metadata",
      port,
    });

    assert.isTrue(result.isOk());
    assert.deepEqual(port.deleted, []);
  });

  it("AC-SA-17: does not fall back when a pinned version cannot read the tag list", async () => {
    const port = new FakeArtifactPort({
      env: { TEMPLATE_VERSION: "6.10.6" },
      tagListError: new Error("offline"),
      bundled: bundledArtifacts("6.10.5"),
      cache: cachedArtifactSet("6.10.6"),
    });

    const result = await resolveTemplateArtifactSnapshot({
      range: "~6.10.0",
      bundled: false,
      requiredKind: "metadata",
      port,
    });

    assert.isTrue(result.isErr());
  });

  it("AC-SA-18: propagates malformed tag-list errors instead of falling back", async () => {
    const port = new FakeArtifactPort({
      tagListError: new SystemError({
        source: "Scaffold",
        name: "TemplateTagListMalformed",
        message: "malformed",
      }),
      bundled: bundledArtifacts("6.10.5"),
    });

    const result = await resolveTemplateArtifactSnapshot({
      range: "~6.10.0",
      bundled: false,
      requiredKind: "metadata",
      port,
    });

    assert.isTrue(result.isErr());
    assert.strictEqual(result._unsafeUnwrapErr().name, "TemplateTagListMalformed");
  });
});

describe("createTemplateArtifactPort (v4 staged artifacts, real fs)", () => {
  const config = {
    templatesV4TagListURL: "https://example.com/tags.ndjson",
    templateDownloadBaseURL: "https://example.com/releases",
    tryLimits: 1,
  };
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = path.join(
      os.tmpdir(),
      `v4-artifacts-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    vi.spyOn(os, "homedir").mockReturnValue(tmpHome);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.removeSync(tmpHome);
  });

  it("AC-SA-11: tagList fetches and parses final staged-artifact NDJSON", async () => {
    const ndjson = JSON.stringify(tagEntry("6.11.0"));
    vi.spyOn(axios, "get").mockResolvedValue({ status: 200, data: ndjson } as AxiosResponse);

    const port = createTemplateArtifactPort(config, bundledArtifacts("6.10.0"));
    const entries = await port.tagList();

    assert.strictEqual(entries[0].version, "6.11.0");
    assert.strictEqual(entries[0].artifacts.metadata.file, "templates-metadata.zip");
  });

  it("AC-SA-12: download reads one release artifact by file name", async () => {
    const payload = Buffer.from("metadata-payload");
    const axiosGet = vi
      .spyOn(axios, "get")
      .mockResolvedValue({ status: 200, data: payload } as AxiosResponse);

    const port = createTemplateArtifactPort(config, bundledArtifacts("6.10.0"));
    const bytes = await port.download("6.11.0", tagEntry("6.11.0").artifacts.metadata);

    assert.strictEqual(bytes.toString(), "metadata-payload");
    assert.strictEqual(
      axiosGet.mock.calls[0][0],
      "https://example.com/releases/templates-v4@6.11.0/templates-metadata.zip"
    );
  });

  it("AC-SA-13: cache put writes through a temp file then indexes the artifact", () => {
    const bytes = Buffer.from("create-selector-cache");
    const digest = computeArtifactDigest(bytes);
    const port = createTemplateArtifactPort(config, bundledArtifacts("6.10.0"));

    port.cache.put("6.11.0", "create-selector", digest, bytes);

    assert.isTrue(fs.existsSync(artifactCacheFile("6.11.0", "create-selector")));
    assert.strictEqual(port.cache.get("6.11.0", "create-selector")?.digest, digest);
    const leftovers = fs.readdirSync(path.dirname(artifactCacheFile("6.11.0", "create-selector")));
    assert.notInclude(leftovers.join("\n"), ".tmp");
  });

  it("AC-SA-14: resolver GC deletes only older versions in the same major.minor/kind on disk", async () => {
    const oldBytes = Buffer.from("old-metadata");
    const retainedBytes = Buffer.from("retained-metadata");
    const newBytes = Buffer.from("new-metadata");
    const port = createTemplateArtifactPort(config, bundledArtifacts("6.10.0"));
    port.cache.put("6.11.0", "metadata", computeArtifactDigest(oldBytes), oldBytes);
    port.cache.put("6.10.9", "metadata", computeArtifactDigest(retainedBytes), retainedBytes);

    vi.spyOn(axios, "get").mockImplementation((url: string) => {
      if (url === config.templatesV4TagListURL) {
        return Promise.resolve({
          status: 200,
          data: JSON.stringify(tagEntry("6.11.2", { metadata: computeArtifactDigest(newBytes) })),
        } as AxiosResponse);
      }
      return Promise.resolve({ status: 200, data: newBytes } as AxiosResponse);
    });

    const result = await resolveTemplateArtifactSnapshot({
      range: "^6.11.0",
      bundled: false,
      requiredKind: "metadata",
      port,
    });

    assert.isTrue(result.isOk());
    assert.isFalse(fs.existsSync(artifactCacheFile("6.11.0", "metadata")));
    assert.isTrue(fs.existsSync(artifactCacheFile("6.10.9", "metadata")));
    assert.isTrue(fs.existsSync(artifactCacheFile("6.11.2", "metadata")));
  });

  it("AC-SA-14b: cache get warms pre-existing disk artifacts and skips unrelated or incomplete entries", () => {
    const artifactPath = artifactCacheFile("6.11.0", "metadata");
    fs.ensureDirSync(path.dirname(artifactPath));
    fs.writeFileSync(artifactPath, "metadata-from-disk");
    fs.ensureDirSync(path.join(tmpHome, ".fx", "templates-cache", "not-v4@6.11.0"));
    fs.ensureDirSync(path.dirname(artifactCacheFile("6.11.1", "metadata")));

    const port = createTemplateArtifactPort(config, bundledArtifacts("6.10.0"));
    const cached = port.cache.get("6.11.0", "metadata");

    assert.strictEqual(cached?.bytes.toString(), "metadata-from-disk");
    assert.strictEqual(cached?.digest, computeArtifactDigest(Buffer.from("metadata-from-disk")));
    assert.isUndefined(port.cache.get("6.11.1", "metadata"));
    assert.deepEqual(port.cache.keys("metadata"), ["6.11.0"]);
  });

  it("AC-SA-14c: cache warm treats a missing cache root as empty", () => {
    const port = createTemplateArtifactPort(config, bundledArtifacts("6.10.0"));

    assert.deepEqual(port.cache.keys("metadata"), []);
  });
});

function tagEntry(
  version: string,
  digestOverrides: Partial<Record<TemplateArtifactKind, string>> = {}
): V4TemplateTagEntry {
  return { version, artifacts: tagArtifacts(version, digestOverrides) };
}

function tagArtifacts(
  version: string,
  digestOverrides: Partial<Record<TemplateArtifactKind, string>> = {}
): V4TemplateTagEntry["artifacts"] {
  return {
    "create-selector": {
      kind: "create-selector",
      file: "create-selector.json",
      digest: digestOverrides["create-selector"] ?? `sha256:create-selector-${version}`,
    },
    "modify-selector": {
      kind: "modify-selector",
      file: "modify-selector.json",
      digest: digestOverrides["modify-selector"] ?? `sha256:modify-selector-${version}`,
    },
    metadata: {
      kind: "metadata",
      file: "templates-metadata.zip",
      digest: digestOverrides.metadata ?? `sha256:metadata-${version}`,
    },
    templates: {
      kind: "templates",
      file: "templates.zip",
      digest: digestOverrides.templates ?? `sha256:templates-${version}`,
    },
  };
}

function bundledArtifacts(version: string): BundledTemplateArtifacts {
  return {
    version,
    artifacts: tagArtifacts(version),
    locations: {
      "create-selector": `bundled://${version}/create-selector.json`,
      "modify-selector": `bundled://${version}/modify-selector.json`,
      metadata: `bundled://${version}/templates-metadata.zip`,
      templates: `bundled://${version}/templates.zip`,
    },
  };
}

function servedArtifacts(
  artifacts: Partial<Record<TemplateArtifactKind, Buffer>>
): Record<TemplateArtifactKind, Buffer | undefined> {
  return {
    "create-selector": artifacts["create-selector"],
    "modify-selector": artifacts["modify-selector"],
    metadata: artifacts.metadata,
    templates: artifacts.templates,
  };
}

function bytesFor(kind: TemplateArtifactKind, version: string): Buffer {
  return Buffer.from(`${kind}:${version}`);
}

function cachedArtifactSet(
  version: string
): Array<{ version: string; kind: TemplateArtifactKind; digest: string; bytes: Buffer }> {
  const kinds: TemplateArtifactKind[] = [
    "create-selector",
    "modify-selector",
    "metadata",
    "templates",
  ];
  return kinds.map((kind) => {
    const bytes = bytesFor(kind, version);
    return { version, kind, digest: computeArtifactDigest(bytes), bytes };
  });
}

function cacheKey(version: string, kind: TemplateArtifactKind): string {
  return `${kind}:${version}`;
}

function parseCacheKey(key: string): { kind: TemplateArtifactKind; version: string } | undefined {
  const separator = key.indexOf(":");
  if (separator < 1) {
    return undefined;
  }
  const kind = key.slice(0, separator);
  const version = key.slice(separator + 1);
  if (
    kind !== "create-selector" &&
    kind !== "modify-selector" &&
    kind !== "metadata" &&
    kind !== "templates"
  ) {
    return undefined;
  }
  return { kind, version };
}
