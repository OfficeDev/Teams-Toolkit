// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError, UserError } from "@microsoft/teamsfx-api";
import { assert } from "vitest";
import {
  BundledFloor,
  CachedPackage,
  TagEntry,
  TemplateSourcePort,
  computeDigest,
  resolveLocalTemplateSource,
  resolveTemplateSource,
} from "../../../src/v4/distribution/templateSource";

// In-memory fake of the narrow TemplateSourcePort (no real fs / network).
class FakePort implements TemplateSourcePort {
  public httpCalls = 0;
  public downloads: string[] = [];
  private readonly envMap: Record<string, string | undefined>;
  private readonly tags?: TagEntry[];
  private readonly tagListThrows: boolean;
  private readonly tagListError?: Error;
  private readonly packagesError?: Error;
  private readonly store = new Map<string, CachedPackage>();
  public readonly floor: BundledFloor;
  /** Bytes the channel will serve per version (for the download path). */
  private readonly serve: Record<string, Buffer>;

  constructor(opts: {
    env?: Record<string, string | undefined>;
    tags?: TagEntry[];
    tagListThrows?: boolean;
    tagListError?: Error;
    packagesError?: Error;
    floor: BundledFloor;
    cache?: Array<{ version: string; digest: string; bytes: Buffer }>;
    serve?: Record<string, Buffer>;
  }) {
    this.envMap = opts.env ?? {};
    this.tags = opts.tags;
    this.tagListThrows = opts.tagListThrows ?? false;
    this.tagListError = opts.tagListError;
    this.packagesError = opts.packagesError;
    this.floor = opts.floor;
    this.serve = opts.serve ?? {};
    for (const c of opts.cache ?? []) {
      this.store.set(c.version, { digest: c.digest, bytes: c.bytes });
    }
  }

  env(name: string): string | undefined {
    return this.envMap[name];
  }

  tagList(): Promise<TagEntry[]> {
    this.httpCalls++;
    if (this.tagListError) {
      return Promise.reject(this.tagListError);
    }
    if (this.tagListThrows) {
      return Promise.reject(new Error("network unreachable"));
    }
    return Promise.resolve(this.tags ?? []);
  }

  packages(version: string): Promise<Buffer> {
    this.httpCalls++;
    this.downloads.push(version);
    if (this.packagesError) {
      return Promise.reject(this.packagesError);
    }
    const bytes = this.serve[version];
    if (!bytes) {
      return Promise.reject(new Error(`no bytes served for ${version}`));
    }
    return Promise.resolve(bytes);
  }

  cache = {
    get: (version: string): CachedPackage | undefined => this.store.get(version),
    put: (version: string, digest: string, bytes: Buffer): void => {
      this.store.set(version, { digest, bytes });
    },
    keys: (): string[] => [...this.store.keys()],
  };

  cacheHas(version: string): boolean {
    return this.store.has(version);
  }
}

function bytesFor(label: string): Buffer {
  return Buffer.from(`template-bytes:${label}`);
}

describe("resolveTemplateSource (v4)", () => {
  it("AC-01: bundled=true resolves the bundled floor with no network call", async () => {
    const port = new FakePort({
      tags: [{ version: "6.10.5", digest: "sha256:x" }],
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~6.10", bundled: true, port });
    assert.isTrue(res.isOk());
    const src = res._unsafeUnwrap();
    assert.strictEqual(src.origin, "bundled");
    assert.strictEqual(src.version, "6.10.1");
    assert.strictEqual(src.digest, "sha256:floor");
    assert.strictEqual(port.httpCalls, 0);
  });

  it("AC-02: TEMPLATE_VERSION=local overrides bundled=false and uses the floor", async () => {
    const port = new FakePort({
      env: { TEMPLATE_VERSION: "local" },
      tags: [{ version: "6.10.5", digest: "sha256:x" }],
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~6.10", bundled: false, port });
    const src = res._unsafeUnwrap();
    assert.strictEqual(src.origin, "bundled");
    assert.strictEqual(port.httpCalls, 0);
  });

  it("AC-03: TEMPLATE_VERSION=<version> pins that online version with the tag-list digest", async () => {
    const bytes = bytesFor("6.11.2");
    const digest = computeDigest(bytes);
    const port = new FakePort({
      env: { TEMPLATE_VERSION: "6.11.2" },
      tags: [{ version: "6.11.2", digest }],
      serve: { "6.11.2": bytes },
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~6.10", bundled: false, port });
    const src = res._unsafeUnwrap();
    assert.strictEqual(src.origin, "online");
    assert.strictEqual(src.version, "6.11.2");
    assert.strictEqual(src.digest, digest);
  });

  it("AC-04: bundled=false resolves the highest channel version above the floor and records its digest", async () => {
    const bytes = bytesFor("6.10.5");
    const digest = computeDigest(bytes);
    const port = new FakePort({
      tags: [
        { version: "6.10.1", digest: "sha256:floor" },
        { version: "6.10.5", digest },
      ],
      serve: { "6.10.5": bytes },
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~6.10", bundled: false, port });
    const src = res._unsafeUnwrap();
    assert.strictEqual(src.origin, "online");
    assert.strictEqual(src.version, "6.10.5");
    assert.strictEqual(src.digest, digest);
    assert.isTrue(port.cacheHas("6.10.5"));
  });

  it("AC-05: highest satisfier equal to the floor resolves the floor without downloading", async () => {
    const port = new FakePort({
      tags: [{ version: "6.10.1", digest: "sha256:floor" }],
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~6.10", bundled: false, port });
    const src = res._unsafeUnwrap();
    assert.strictEqual(src.origin, "bundled");
    assert.strictEqual(src.version, "6.10.1");
    assert.lengthOf(port.downloads, 0);
  });

  it("AC-06: a cache hit with a matching digest returns the cached bytes with zero download", async () => {
    const bytes = bytesFor("6.10.5");
    const digest = computeDigest(bytes);
    const port = new FakePort({
      tags: [{ version: "6.10.5", digest }],
      cache: [{ version: "6.10.5", digest, bytes }],
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~6.10", bundled: false, port });
    const src = res._unsafeUnwrap();
    assert.strictEqual(src.origin, "cache");
    assert.strictEqual(src.version, "6.10.5");
    assert.lengthOf(port.downloads, 0);
  });

  it("AC-07: channel unreachable falls back to max(cache, floor) = cache, with a warning", async () => {
    const bytes = bytesFor("6.10.4");
    const digest = computeDigest(bytes);
    const port = new FakePort({
      tagListThrows: true,
      cache: [{ version: "6.10.4", digest, bytes }],
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~6.10", bundled: false, port });
    const src = res._unsafeUnwrap();
    assert.strictEqual(src.origin, "cache");
    assert.strictEqual(src.version, "6.10.4");
    assert.isDefined(src.warning);
  });

  it("AC-08: channel unreachable with empty cache falls back to the floor, with a warning", async () => {
    const port = new FakePort({
      tagListThrows: true,
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~6.10", bundled: false, port });
    const src = res._unsafeUnwrap();
    assert.strictEqual(src.origin, "bundled-fallback");
    assert.strictEqual(src.version, "6.10.1");
    assert.isDefined(src.warning);
  });

  it("AC-09: a stable range excludes -beta versions", async () => {
    const bytes = bytesFor("6.11.0");
    const digest = computeDigest(bytes);
    const port = new FakePort({
      tags: [
        { version: "6.11.0", digest },
        { version: "6.12.0-beta.1", digest: "sha256:beta" },
      ],
      serve: { "6.11.0": bytes },
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~6.11", bundled: false, port });
    const src = res._unsafeUnwrap();
    assert.strictEqual(src.version, "6.11.0");
  });

  it("AC-10: a beta range naming the prerelease segment resolves the -beta version", async () => {
    const bytes = bytesFor("6.12.0-beta.1");
    const digest = computeDigest(bytes);
    const port = new FakePort({
      tags: [{ version: "6.12.0-beta.1", digest }],
      serve: { "6.12.0-beta.1": bytes },
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({
      range: ">=6.12.0-beta <6.13.0",
      bundled: false,
      port,
    });
    const src = res._unsafeUnwrap();
    assert.strictEqual(src.version, "6.12.0-beta.1");
  });

  it("AC-11: a digest mismatch is a hard error; the cache is not written", async () => {
    const realBytes = bytesFor("6.10.5");
    const port = new FakePort({
      tags: [{ version: "6.10.5", digest: "sha256:WRONG-EXPECTED" }],
      serve: { "6.10.5": realBytes },
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~6.10", bundled: false, port });
    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, "TemplateDigestMismatch");
    assert.isFalse(port.cacheHas("6.10.5"));
  });

  it("AC-12: bundled=true never reads package.json#version (a beta build still resolves the floor)", async () => {
    // package.json#version is irrelevant by construction: the function never reads it.
    const port = new FakePort({
      tags: [{ version: "9.9.9", digest: "sha256:x" }],
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~6.10", bundled: true, port });
    const src = res._unsafeUnwrap();
    assert.strictEqual(src.origin, "bundled");
    assert.strictEqual(src.version, "6.10.1");
  });

  it("AC-13: identical inputs and tag-list state resolve identically", async () => {
    const bytes = bytesFor("6.10.5");
    const digest = computeDigest(bytes);
    const make = () =>
      new FakePort({
        tags: [{ version: "6.10.5", digest }],
        serve: { "6.10.5": bytes },
        floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
      });
    const a = (
      await resolveTemplateSource({ range: "~6.10", bundled: false, port: make() })
    )._unsafeUnwrap();
    const b = (
      await resolveTemplateSource({ range: "~6.10", bundled: false, port: make() })
    )._unsafeUnwrap();
    assert.deepEqual(
      { origin: a.origin, version: a.version, digest: a.digest },
      { origin: b.origin, version: b.version, digest: b.digest }
    );
  });

  it("AC-14: empty tag-list with a satisfying floor falls back to the floor, with a warning", async () => {
    const port = new FakePort({
      tags: [],
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~6.10", bundled: false, port });
    const src = res._unsafeUnwrap();
    assert.strictEqual(src.origin, "bundled-fallback");
    assert.strictEqual(src.version, "6.10.1");
    assert.isDefined(src.warning);
  });

  it("AC-15: empty tag-list with a non-satisfying floor is a UserError (no silent substitution)", async () => {
    const port = new FakePort({
      tags: [],
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~7.0", bundled: false, port });
    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, "TemplateVersionMismatch");
  });

  it("AC-16: a pinned TEMPLATE_VERSION absent from the tag-list is a UserError with no fallback", async () => {
    const floorBytes = bytesFor("6.10.1");
    const port = new FakePort({
      env: { TEMPLATE_VERSION: "6.99.0" },
      // tag-list reachable but does NOT list the pinned version; a satisfying
      // floor/cache exists to prove resolution does NOT silently fall back.
      tags: [{ version: "6.10.5", digest: "sha256:other" }],
      cache: [{ version: "6.10.5", digest: "sha256:other", bytes: bytesFor("6.10.5") }],
      floor: { version: "6.10.1", digest: computeDigest(floorBytes), location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~6.10", bundled: false, port });
    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, "TemplatePinnedVersionNotFound");
    assert.lengthOf(port.downloads, 0);
  });

  it("AC-17: a malformed tag-list document is propagated as a hard error, not an offline fallback", async () => {
    const malformed = new SystemError({
      source: "Scaffold",
      name: "TemplateTagListMalformed",
      message: "Malformed v4 tag-list entry on line 1: not valid JSON.",
    });
    const port = new FakePort({
      tagListError: malformed,
      // a satisfying cache + floor exist to prove resolution does NOT fall back.
      cache: [{ version: "6.10.4", digest: "sha256:c", bytes: bytesFor("6.10.4") }],
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~6.10", bundled: false, port });
    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, "TemplateTagListMalformed");
  });

  it("AC-18: a pinned version whose tag-list fetch rejects surfaces an error and never falls back", async () => {
    const port = new FakePort({
      env: { TEMPLATE_VERSION: "6.11.2" },
      tagListThrows: true,
      cache: [{ version: "6.10.4", digest: "sha256:c", bytes: bytesFor("6.10.4") }],
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~6.10", bundled: false, port });
    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, "TemplateTagListUnavailable");
    assert.lengthOf(port.downloads, 0);
  });

  it("AC-18: a pinned version preserves an existing FxError from the tag-list fetch", async () => {
    const malformed = new UserError({
      source: "Scaffold",
      name: "TemplateTagListMalformed",
      message: 'Malformed v4 tag-list entry on line 2: missing "digest".',
    });
    const port = new FakePort({
      env: { TEMPLATE_VERSION: "6.11.2" },
      tagListError: malformed,
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~6.10", bundled: false, port });
    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, "TemplateTagListMalformed");
  });

  it("AC-19: a download rejection surfaces as an error instead of throwing", async () => {
    const bytes = bytesFor("6.11.0");
    const port = new FakePort({
      // tag is published so the version is picked, but no bytes are served, so
      // the download rejects; the neverthrow contract must still hold.
      tags: [{ version: "6.11.0", digest: computeDigest(bytes) }],
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~6.11", bundled: false, port });
    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, "TemplateDownloadFailed");
    assert.deepEqual(port.downloads, ["6.11.0"]);
  });

  it("AC-19: a download rejection preserves an existing FxError", async () => {
    const bytes = bytesFor("6.11.0");
    const existing = new UserError({
      source: "Scaffold",
      name: "TemplateDigestMismatch",
      message: "boom",
    });
    const port = new FakePort({
      tags: [{ version: "6.11.0", digest: computeDigest(bytes) }],
      packagesError: existing,
      floor: { version: "6.10.1", digest: "sha256:floor", location: "bundled://6.10.1" },
    });
    const res = await resolveTemplateSource({ range: "~6.11", bundled: false, port });
    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, "TemplateDigestMismatch");
  });
});

describe("resolveLocalTemplateSource (v4)", () => {
  const floor: BundledFloor = {
    version: "6.10.1",
    digest: "sha256:floor",
    location: "bundled://6.10.1",
  };

  it("AC-T1: TEMPLATE_VERSION=local resolves the floor, ignoring a higher cached version, no network", () => {
    const port = new FakePort({
      env: { TEMPLATE_VERSION: "local" },
      cache: [{ version: "6.10.5", digest: "sha256:c5", bytes: bytesFor("6.10.5") }],
      floor,
    });
    const src = resolveLocalTemplateSource({ range: "~6.10", port });
    assert.strictEqual(src.origin, "bundled");
    assert.strictEqual(src.version, "6.10.1");
    assert.strictEqual(src.digest, "sha256:floor");
    assert.strictEqual(port.httpCalls, 0);
    assert.deepEqual(port.downloads, []);
  });

  it("AC-T2: no TEMPLATE_VERSION and an empty cache resolves the satisfying floor, no network", () => {
    const port = new FakePort({ floor });
    const src = resolveLocalTemplateSource({ range: "~6.10", port });
    assert.strictEqual(src.origin, "bundled");
    assert.strictEqual(src.version, "6.10.1");
    assert.strictEqual(port.httpCalls, 0);
  });

  it("AC-T3: a cached version above the floor satisfying the range wins, no network", () => {
    const port = new FakePort({
      cache: [{ version: "6.10.5", digest: "sha256:c5", bytes: bytesFor("6.10.5") }],
      floor,
    });
    const src = resolveLocalTemplateSource({ range: "~6.10", port });
    assert.strictEqual(src.origin, "cache");
    assert.strictEqual(src.version, "6.10.5");
    assert.strictEqual(src.digest, "sha256:c5");
    assert.strictEqual(port.httpCalls, 0);
    assert.deepEqual(port.downloads, []);
  });

  it("AC-T4: a cached version outside the range is ignored and the floor is resolved (INV-5)", () => {
    const port = new FakePort({
      cache: [{ version: "6.9.0", digest: "sha256:c9", bytes: bytesFor("6.9.0") }],
      floor,
    });
    const src = resolveLocalTemplateSource({ range: "~6.10", port });
    assert.strictEqual(src.origin, "bundled");
    assert.strictEqual(src.version, "6.10.1");
    assert.strictEqual(port.httpCalls, 0);
  });

  it("AC-T5: a cached version equal to the floor is a tie that resolves the floor (decision #2), no network", () => {
    const port = new FakePort({
      cache: [{ version: "6.10.1", digest: "sha256:c-tie", bytes: bytesFor("6.10.1") }],
      floor,
    });
    const src = resolveLocalTemplateSource({ range: "~6.10", port });
    assert.strictEqual(src.origin, "bundled");
    assert.strictEqual(src.version, "6.10.1");
    assert.strictEqual(src.digest, "sha256:floor");
    assert.strictEqual(port.httpCalls, 0);
  });

  it("AC-T6: local resolution never sets the offline fallback warning", () => {
    const floorPort = new FakePort({ floor });
    assert.isUndefined(resolveLocalTemplateSource({ range: "~6.10", port: floorPort }).warning);
    const cachePort = new FakePort({
      cache: [{ version: "6.10.5", digest: "sha256:c5", bytes: bytesFor("6.10.5") }],
      floor,
    });
    assert.isUndefined(resolveLocalTemplateSource({ range: "~6.10", port: cachePort }).warning);
  });

  it("AC-T7: two resolutions of the same state return the identical source (determinism, INV-6)", () => {
    const port = new FakePort({
      cache: [{ version: "6.10.5", digest: "sha256:c5", bytes: bytesFor("6.10.5") }],
      floor,
    });
    const first = resolveLocalTemplateSource({ range: "~6.10", port });
    const second = resolveLocalTemplateSource({ range: "~6.10", port });
    assert.deepEqual(first, second);
    assert.strictEqual(port.httpCalls, 0);
  });
});
