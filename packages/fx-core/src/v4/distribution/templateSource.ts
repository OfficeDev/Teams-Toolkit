// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError, UserError } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import * as crypto from "crypto";
import semver from "semver";

/** v4 template-distribution resolution. See resolve-template-source spec and ADR-0006. */

const SOURCE = "Scaffold";

/** Where the resolved template-package bytes come from. */
export type TemplateOrigin = "bundled" | "online" | "cache" | "bundled-fallback";

/** A channel-published version paired with its expected content digest. */
export interface TagEntry {
  version: string;
  digest: string;
}

/** A cached template package: its content digest and the bytes themselves. */
export interface CachedPackage {
  digest: string;
  bytes: Buffer;
}

/** The bundled floor baked into the engine binary. */
export interface BundledFloor {
  version: string;
  digest: string;
  location: string;
}

/** Narrow template-source port. */
export interface TemplateSourcePort {
  /** Read an environment variable (e.g. `TEMPLATE_VERSION`). */
  env(name: string): string | undefined;
  /** The channel's published `{ version, digest }` entries. */
  tagList(): Promise<TagEntry[]>;
  /** Download a package's bytes for a version. */
  packages(version: string, expectedDigest: string): Promise<Buffer>;
  /** The local digest-keyed package cache. */
  cache: {
    get(version: string): CachedPackage | undefined;
    put(version: string, digest: string, bytes: Buffer): void;
    keys(): string[];
  };
  /** The bundled floor baked into the engine. */
  floor: BundledFloor;
}

/** The single resolved source a scaffold run will use. */
export interface TemplateSource {
  origin: TemplateOrigin;
  version: string;
  digest: string;
  location: string;
  /** Set when the resolved source diverged from the intended online source. */
  warning?: string;
}

export interface ResolveTemplateSourceInput {
  /** SemVer range the build is permitted to resolve within. */
  range: string;
  /** `true` for bundled floor resolution; `false` for release-channel resolution. */
  bundled: boolean;
  port: TemplateSourcePort;
}

/** Inputs for the no-network local-first resolver. */
export interface ResolveLocalTemplateSourceInput {
  /** SemVer range the build is permitted to resolve within. */
  range: string;
  port: TemplateSourcePort;
}

/** sha256 content hash of a package's bytes, prefixed `sha256:`. */
export function computeDigest(bytes: Buffer): string {
  return "sha256:" + crypto.createHash("sha256").update(bytes).digest("hex");
}

/** Resolve to exactly one `TemplateSource` before any template is read. */
export async function resolveTemplateSource(
  input: ResolveTemplateSourceInput
): Promise<Result<TemplateSource, FxError>> {
  const { range, bundled, port } = input;

  const templateVersion = port.env("TEMPLATE_VERSION");
  if (templateVersion === "local") {
    return ok(floorSource(port.floor));
  }
  if (templateVersion) {
    return pinnedOnline(templateVersion, port);
  }
  if (bundled) {
    return ok(floorSource(port.floor));
  }
  return resolveOnline(range, port);
}

/** Resolve a local source without touching the network. */
export function resolveLocalTemplateSource(input: ResolveLocalTemplateSourceInput): TemplateSource {
  const { range, port } = input;
  if (port.env("TEMPLATE_VERSION") === "local") {
    return floorSource(port.floor);
  }
  const highestCached = highestCachedAboveFloor(range, port);
  if (highestCached) {
    const cached = port.cache.get(highestCached);
    /* istanbul ignore else -- highestCached is drawn from cache.keys(); a miss
       means the cache mutated mid-resolution, so we degrade to the floor. */
    if (cached) {
      return {
        origin: "cache",
        version: highestCached,
        digest: cached.digest,
        location: cacheLocation(highestCached),
      };
    }
  }
  return floorSource(port.floor);
}

function floorSource(floor: BundledFloor): TemplateSource {
  return {
    origin: "bundled",
    version: floor.version,
    digest: floor.digest,
    location: floor.location,
  };
}

async function pinnedOnline(
  version: string,
  port: TemplateSourcePort
): Promise<Result<TemplateSource, FxError>> {
  let tags: TagEntry[];
  try {
    tags = await port.tagList();
  } catch (e) {
    // A pin never falls back; keep channel failures inside the Result contract.
    return err(asTagListError(e));
  }
  const entry = tags.find((t) => t.version === version);
  if (!entry) {
    return err(
      new UserError({
        source: SOURCE,
        name: "TemplatePinnedVersionNotFound",
        message: `Pinned template version "${version}" is not published on the release channel.`,
      })
    );
  }
  return fetchVerify(entry, port, "online");
}

async function resolveOnline(
  range: string,
  port: TemplateSourcePort
): Promise<Result<TemplateSource, FxError>> {
  let tags: TagEntry[];
  try {
    tags = await port.tagList();
  } catch (e) {
    // Malformed channel data is a hard error; only reachability failures fall back.
    if (isMalformedTagList(e)) {
      return err(e);
    }
    return ok(offlineFallback(range, port));
  }

  const picked = semver.maxSatisfying(
    tags.map((t) => t.version),
    range
  );

  if (!picked) {
    // Reachable channel with no satisfying version is a compatibility problem.
    if (semver.satisfies(port.floor.version, range)) {
      return ok(floorFallback(port.floor));
    }
    return err(
      new UserError({
        source: SOURCE,
        name: "TemplateVersionMismatch",
        message: `No published template version satisfies range "${range}", and the bundled floor "${port.floor.version}" does not satisfy it either. The engine and template versions are incompatible.`,
      })
    );
  }

  if (picked === port.floor.version) {
    return ok(floorSource(port.floor));
  }

  const entry = tags.find((t) => t.version === picked);
  /* istanbul ignore if -- defensive: `picked` is drawn from `tags`, so a miss
     means the tag list mutated mid-resolution; not reproducible in a unit. */
  if (!entry) {
    return err(
      new SystemError({
        source: SOURCE,
        name: "TemplateTagListInconsistent",
        message: `Resolved version "${picked}" is no longer present in the tag list.`,
      })
    );
  }
  return fetchVerify(entry, port, "online");
}

/** Malformed channel tag-lists are hard errors, distinct from unreachable channels. */
function isMalformedTagList(e: unknown): e is SystemError {
  return e instanceof SystemError && e.name === "TemplateTagListMalformed";
}

/** Preserve an existing FxError; wrap other tag-list failures as SystemError. */
function asTagListError(e: unknown): FxError {
  if (e instanceof UserError || e instanceof SystemError) {
    return e;
  }
  /* istanbul ignore next -- the port rejects with an Error; the String(e)
     fallback is defensive for non-Error rejections, not reproducible in a unit. */
  const message = e instanceof Error ? e.message : String(e);
  return new SystemError({
    source: SOURCE,
    name: "TemplateTagListUnavailable",
    message: `Failed to read the template release channel: ${message}.`,
  });
}

/** Preserve an existing FxError; wrap other download failures as SystemError. */
function asDownloadError(e: unknown, version: string): FxError {
  if (e instanceof UserError || e instanceof SystemError) {
    return e;
  }
  /* istanbul ignore next -- the port rejects with an Error; the String(e)
     fallback is defensive for non-Error rejections, not reproducible in a unit. */
  const message = e instanceof Error ? e.message : String(e);
  return new SystemError({
    source: SOURCE,
    name: "TemplateDownloadFailed",
    message: `Failed to download template "${version}" from the release channel: ${message}.`,
  });
}

async function fetchVerify(
  entry: TagEntry,
  port: TemplateSourcePort,
  origin: "online"
): Promise<Result<TemplateSource, FxError>> {
  const cached = port.cache.get(entry.version);
  if (cached && cached.digest === entry.digest) {
    return ok({
      origin: "cache",
      version: entry.version,
      digest: entry.digest,
      location: cacheLocation(entry.version),
    });
  }

  let bytes: Buffer;
  try {
    bytes = await port.packages(entry.version, entry.digest);
  } catch (e) {
    // Keep download rejections inside the Result contract.
    return err(asDownloadError(e, entry.version));
  }
  const computed = computeDigest(bytes);
  if (computed !== entry.digest) {
    return err(
      new SystemError({
        source: SOURCE,
        name: "TemplateDigestMismatch",
        message: `Downloaded template "${entry.version}" failed integrity check: expected ${entry.digest}, got ${computed}.`,
      })
    );
  }

  port.cache.put(entry.version, entry.digest, bytes);
  return ok({
    origin,
    version: entry.version,
    digest: entry.digest,
    location: cacheLocation(entry.version),
  });
}

/** Highest cached version satisfying `range` that strictly beats the floor. */
function highestCachedAboveFloor(range: string, port: TemplateSourcePort): string | undefined {
  const cachedSatisfying = port.cache.keys().filter((v) => semver.satisfies(v, range));
  const highestCached = semver.maxSatisfying(cachedSatisfying, range);
  const floorSatisfies = semver.satisfies(port.floor.version, range);
  if (highestCached && (!floorSatisfies || semver.gt(highestCached, port.floor.version))) {
    return highestCached;
  }
  return undefined;
}

/** Reached when the channel is unreachable. */
function offlineFallback(range: string, port: TemplateSourcePort): TemplateSource {
  const highestCached = highestCachedAboveFloor(range, port);
  if (highestCached) {
    const cached = port.cache.get(highestCached);
    /* istanbul ignore else -- highestCached is drawn from cache.keys(); a miss
       means the cache mutated mid-resolution, so we degrade to the floor. */
    if (cached) {
      return {
        origin: "cache",
        version: highestCached,
        digest: cached.digest,
        location: cacheLocation(highestCached),
        warning: offlineWarning(range),
      };
    }
  }

  return { ...floorFallback(port.floor), warning: offlineWarning(range) };
}

function floorFallback(floor: BundledFloor): TemplateSource {
  return {
    origin: "bundled-fallback",
    version: floor.version,
    digest: floor.digest,
    location: floor.location,
    warning: `Falling back to the bundled template floor "${floor.version}".`,
  };
}

function offlineWarning(range: string): string {
  return `The template release channel was unreachable; resolved offline within range "${range}".`;
}

function cacheLocation(version: string): string {
  // eslint-disable-next-line no-secrets/no-secrets
  return `templates-v4@${version}`;
}
