// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError, UserError } from "@microsoft/teamsfx-api";
import axios, { AxiosResponse } from "axios";
import * as fs from "fs-extra";
import { Result, err, ok } from "neverthrow";
import * as path from "path";
import os from "os";
import semver from "semver";
import { sendRequestWithRetry } from "../../common/requestUtils";
import { TemplateSource, computeDigest } from "./templateSource";

/** Shared v4 staged artifact distribution model. */

const SOURCE = "Scaffold";

// eslint-disable-next-line no-secrets/no-secrets
const V4_TAG_PREFIX = "templates-v4@";

export type TemplateArtifactKind = "create-selector" | "modify-selector" | "metadata" | "templates";

export type TemplateArtifactOrigin = "bundled" | "online" | "cache" | "bundled-fallback";

export interface TemplateArtifactRef {
  kind: TemplateArtifactKind;
  file: string;
  digest: string;
}

export interface V4TemplateTagEntry {
  version: string;
  artifacts: Record<TemplateArtifactKind, TemplateArtifactRef>;
}

export interface CachedTemplateArtifact {
  digest: string;
  bytes: Buffer;
}

export interface BundledTemplateArtifacts {
  version: string;
  artifacts: Record<TemplateArtifactKind, TemplateArtifactRef>;
  locations: Record<TemplateArtifactKind, string>;
}

export interface TemplateArtifactPort {
  env(name: string): string | undefined;
  tagList(): Promise<V4TemplateTagEntry[]>;
  download(version: string, ref: TemplateArtifactRef): Promise<Buffer>;
  cache: {
    get(version: string, kind: TemplateArtifactKind): CachedTemplateArtifact | undefined;
    put(version: string, kind: TemplateArtifactKind, digest: string, bytes: Buffer): void;
    keys(kind: TemplateArtifactKind): string[];
    delete(version: string, kind: TemplateArtifactKind): void;
  };
  bundled: BundledTemplateArtifacts;
}

export interface TemplateArtifactSnapshot {
  version: string;
  origin: TemplateArtifactOrigin;
  artifacts: Record<TemplateArtifactKind, TemplateArtifactRef>;
  bytes(kind: TemplateArtifactKind): Promise<Result<Buffer, FxError>>;
}

export interface ResolveTemplateArtifactSnapshotInput {
  range: string;
  bundled: boolean;
  requiredKind: TemplateArtifactKind;
  port: TemplateArtifactPort;
}

export interface TemplateArtifactChannelConfig {
  templatesV4TagListURL: string;
  templateDownloadBaseURL: string;
  tryLimits: number;
}

export const computeArtifactDigest = computeDigest;

export function templateSourceFromArtifactSnapshot(
  snapshot: TemplateArtifactSnapshot
): TemplateSource {
  const templates = snapshot.artifacts.templates;
  return {
    origin: snapshot.origin,
    version: snapshot.version,
    digest: templates.digest,
    location: templates.file,
  };
}

export function artifactUrl(baseURL: string, version: string, ref: TemplateArtifactRef): string {
  return `${baseURL}/${V4_TAG_PREFIX}${version}/${ref.file}`;
}

export function artifactCacheFile(version: string, kind: TemplateArtifactKind): string {
  return path.join(artifactCacheVersionDir(version), artifactFileName(kind));
}

export function parseArtifactTagList(ndjson: string): V4TemplateTagEntry[] {
  const entries: V4TemplateTagEntry[] = [];
  const lines = ndjson.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "").trim();
    if (line.length === 0) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw malformedTagList(i, "not valid JSON");
    }
    const entry = readTagEntry(parsed);
    if (!entry) {
      throw malformedTagList(i, "missing final v4 staged artifacts");
    }
    entries.push(entry);
  }
  return entries;
}

export async function resolveTemplateArtifactSnapshot(
  input: ResolveTemplateArtifactSnapshotInput
): Promise<Result<TemplateArtifactSnapshot, FxError>> {
  const { range, bundled, requiredKind, port } = input;
  if (bundled || port.env("TEMPLATE_VERSION") === "local") {
    return ok(bundledSnapshot(port));
  }

  let tags: V4TemplateTagEntry[];
  const templateVersion = port.env("TEMPLATE_VERSION");
  try {
    tags = await port.tagList();
  } catch (e) {
    if (e instanceof UserError || e instanceof SystemError) {
      return err(e);
    }
    if (templateVersion) {
      return err(asTagListError(e));
    }
    return fallbackSnapshot(range, port);
  }

  const entryResult = templateVersion
    ? pinnedEntry(templateVersion, tags)
    : rangedEntry(range, tags);
  if (entryResult.isErr()) {
    return err(entryResult.error);
  }

  const entry = entryResult.value;
  const artifactResult = await ensureCachedArtifact(entry, requiredKind, port, templateVersion);
  if (artifactResult.isErr()) {
    return err(artifactResult.error);
  }

  return ok(onlineSnapshot(entry, artifactResult.value, port, templateVersion));
}

function readTagEntry(value: unknown): V4TemplateTagEntry | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const version = Reflect.get(value, "version");
  const artifacts = Reflect.get(value, "artifacts");
  if (typeof version !== "string" || !isObject(artifacts) || Reflect.has(value, "digest")) {
    return undefined;
  }

  const createSelector = readArtifactRef(artifacts, "create-selector");
  const modifySelector = readArtifactRef(artifacts, "modify-selector");
  const metadata = readArtifactRef(artifacts, "metadata");
  const templates = readArtifactRef(artifacts, "templates");
  if (!createSelector || !modifySelector || !metadata || !templates) {
    return undefined;
  }

  return {
    version,
    artifacts: {
      "create-selector": createSelector,
      "modify-selector": modifySelector,
      metadata,
      templates,
    },
  };
}

function readArtifactRef(
  artifacts: object,
  kind: TemplateArtifactKind
): TemplateArtifactRef | undefined {
  const value = Reflect.get(artifacts, kind);
  if (!isObject(value)) {
    return undefined;
  }
  const file = Reflect.get(value, "file");
  const digest = Reflect.get(value, "digest");
  if (file !== artifactFileName(kind) || typeof digest !== "string") {
    return undefined;
  }
  return { kind, file, digest };
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function malformedTagList(lineIndex: number, reason: string): SystemError {
  return new SystemError({
    source: SOURCE,
    name: "TemplateTagListMalformed",
    message: `Malformed v4 tag-list entry on line ${lineIndex + 1}: ${reason}.`,
  });
}

export function artifactFileName(kind: TemplateArtifactKind): string {
  switch (kind) {
    case "create-selector":
      return "create-selector.json";
    case "modify-selector":
      return "modify-selector.json";
    case "metadata":
      return "templates-metadata.zip";
    case "templates":
      return "templates.zip";
  }
}

function artifactCacheVersionDir(version: string): string {
  return path.join(artifactCacheRootDir(), `${V4_TAG_PREFIX}${version}`);
}

function artifactCacheRootDir(): string {
  return path.join(os.homedir(), ".fx", "templates-cache");
}

function pinnedEntry(
  version: string,
  tags: V4TemplateTagEntry[]
): Result<V4TemplateTagEntry, FxError> {
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
  return ok(entry);
}

function rangedEntry(
  range: string,
  tags: V4TemplateTagEntry[]
): Result<V4TemplateTagEntry, FxError> {
  const picked = semver.maxSatisfying(
    tags.map((t) => t.version),
    range
  );
  if (!picked) {
    return err(
      new UserError({
        source: SOURCE,
        name: "TemplateVersionMismatch",
        message: `No published template version satisfies range "${range}".`,
      })
    );
  }
  const entry = tags.find((t) => t.version === picked);
  if (!entry) {
    return err(
      new SystemError({
        source: SOURCE,
        name: "TemplateTagListInconsistent",
        message: `Resolved version "${picked}" is no longer present in the tag list.`,
      })
    );
  }
  return ok(entry);
}

async function ensureCachedArtifact(
  entry: V4TemplateTagEntry,
  kind: TemplateArtifactKind,
  port: TemplateArtifactPort,
  protectedVersion?: string
): Promise<Result<"online" | "cache", FxError>> {
  const ref = entry.artifacts[kind];
  const cached = port.cache.get(entry.version, kind);
  if (cached && cached.digest === ref.digest) {
    return ok("cache");
  }

  let bytes: Buffer;
  try {
    bytes = await port.download(entry.version, ref);
  } catch (e) {
    return err(asDownloadError(e, entry.version, kind));
  }

  const digest = computeArtifactDigest(bytes);
  if (digest !== ref.digest) {
    return err(
      new SystemError({
        source: SOURCE,
        name: "TemplateDigestMismatch",
        message: `Downloaded template artifact "${kind}" for "${entry.version}" failed integrity check: expected ${ref.digest}, got ${digest}.`,
      })
    );
  }

  try {
    port.cache.put(entry.version, kind, ref.digest, bytes);
  } catch (e) {
    return err(asCacheWriteError(e, entry.version, kind));
  }
  gcOlderVersionsForLine(entry.version, kind, port, protectedVersion);
  return ok("online");
}

function onlineSnapshot(
  entry: V4TemplateTagEntry,
  origin: "online" | "cache",
  port: TemplateArtifactPort,
  protectedVersion?: string
): TemplateArtifactSnapshot {
  return {
    version: entry.version,
    origin,
    artifacts: entry.artifacts,
    bytes: async (kind: TemplateArtifactKind): Promise<Result<Buffer, FxError>> => {
      const artifactResult = await ensureCachedArtifact(entry, kind, port, protectedVersion);
      if (artifactResult.isErr()) {
        return err(artifactResult.error);
      }
      const cached = port.cache.get(entry.version, kind);
      if (!cached) {
        return err(
          new SystemError({
            source: SOURCE,
            name: "TemplateArtifactNotCached",
            message: `Template artifact "${kind}" for "${entry.version}" is not present in the local cache.`,
          })
        );
      }
      return ok(cached.bytes);
    },
  };
}

function bundledSnapshot(
  port: TemplateArtifactPort,
  origin: TemplateArtifactOrigin = "bundled"
): TemplateArtifactSnapshot {
  return {
    version: port.bundled.version,
    origin,
    artifacts: port.bundled.artifacts,
    bytes: (kind: TemplateArtifactKind): Promise<Result<Buffer, FxError>> => {
      const location = port.bundled.locations[kind];
      try {
        return Promise.resolve(ok(fs.readFileSync(location)));
      } catch {
        return Promise.resolve(
          err(
            new SystemError({
              source: SOURCE,
              name: "BundledArtifactUnreadable",
              message: `The bundled template artifact "${kind}" is missing or unreadable.`,
            })
          )
        );
      }
    },
  };
}

function gcOlderVersionsForLine(
  version: string,
  kind: TemplateArtifactKind,
  port: TemplateArtifactPort,
  protectedVersion?: string
): void {
  const parsed = semver.parse(version);
  if (!parsed) {
    return;
  }
  const versionsInLine = port.cache.keys(kind).filter((candidate) => {
    const candidateVersion = semver.parse(candidate);
    return (
      candidateVersion !== null &&
      candidateVersion.major === parsed.major &&
      candidateVersion.minor === parsed.minor
    );
  });
  const highest = semver.maxSatisfying(versionsInLine, `${parsed.major}.${parsed.minor}.x`);
  if (!highest) {
    return;
  }
  for (const candidate of versionsInLine) {
    if (candidate !== highest && candidate !== protectedVersion) {
      port.cache.delete(candidate, kind);
    }
  }
}

function fallbackSnapshot(
  range: string,
  port: TemplateArtifactPort
): Result<TemplateArtifactSnapshot, FxError> {
  const cached = highestCompleteCachedVersion(range, port);
  const floorSatisfies = semver.satisfies(port.bundled.version, range);
  if (cached && (!floorSatisfies || semver.gt(cached.version, port.bundled.version))) {
    return ok(cachedSnapshot(cached.version, port));
  }
  if (floorSatisfies) {
    return ok(bundledSnapshot(port, "bundled-fallback"));
  }
  return err(
    new UserError({
      source: SOURCE,
      name: "TemplateVersionMismatch",
      message: `No cached or bundled template artifact version satisfies range "${range}".`,
    })
  );
}

function highestCompleteCachedVersion(
  range: string,
  port: TemplateArtifactPort
): { version: string } | undefined {
  const kinds: TemplateArtifactKind[] = [
    "create-selector",
    "modify-selector",
    "metadata",
    "templates",
  ];
  const versions = port.cache
    .keys("templates")
    .filter((version) => kinds.every((kind) => port.cache.get(version, kind) !== undefined));
  const picked = semver.maxSatisfying(versions, range);
  return picked ? { version: picked } : undefined;
}

function cachedSnapshot(version: string, port: TemplateArtifactPort): TemplateArtifactSnapshot {
  const artifacts: Record<TemplateArtifactKind, TemplateArtifactRef> = {
    "create-selector": cachedRef(version, "create-selector", port),
    "modify-selector": cachedRef(version, "modify-selector", port),
    metadata: cachedRef(version, "metadata", port),
    templates: cachedRef(version, "templates", port),
  };
  return {
    version,
    origin: "cache",
    artifacts,
    bytes: (kind: TemplateArtifactKind): Promise<Result<Buffer, FxError>> => {
      const cached = port.cache.get(version, kind);
      if (!cached) {
        return Promise.resolve(
          err(
            new SystemError({
              source: SOURCE,
              name: "TemplateArtifactNotCached",
              message: `Template artifact "${kind}" for "${version}" is not present in the local cache.`,
            })
          )
        );
      }
      return Promise.resolve(ok(cached.bytes));
    },
  };
}

function cachedRef(
  version: string,
  kind: TemplateArtifactKind,
  port: TemplateArtifactPort
): TemplateArtifactRef {
  const cached = port.cache.get(version, kind);
  return { kind, file: artifactFileName(kind), digest: cached?.digest ?? "" };
}

function asTagListError(e: unknown): FxError {
  if (e instanceof UserError || e instanceof SystemError) {
    return e;
  }
  const message = e instanceof Error ? e.message : String(e);
  return new SystemError({
    source: SOURCE,
    name: "TemplateTagListUnavailable",
    message: `Failed to read the template release channel: ${message}.`,
  });
}

function asDownloadError(e: unknown, version: string, kind: TemplateArtifactKind): FxError {
  if (e instanceof UserError || e instanceof SystemError) {
    return e;
  }
  const message = e instanceof Error ? e.message : String(e);
  return new SystemError({
    source: SOURCE,
    name: "TemplateDownloadFailed",
    message: `Failed to download template artifact "${kind}" for "${version}" from the release channel: ${message}.`,
  });
}

function asCacheWriteError(e: unknown, version: string, kind: TemplateArtifactKind): FxError {
  if (e instanceof UserError || e instanceof SystemError) {
    return e;
  }
  const message = e instanceof Error ? e.message : String(e);
  return new SystemError({
    source: SOURCE,
    name: "TemplateArtifactCacheWriteFailed",
    message: `Failed to cache template artifact "${kind}" for "${version}": ${message}.`,
  });
}

export function createTemplateArtifactPort(
  config: TemplateArtifactChannelConfig,
  bundled: BundledTemplateArtifacts
): TemplateArtifactPort {
  const memo = new Map<TemplateArtifactKind, Map<string, CachedTemplateArtifact>>();
  const warmed = new Set<TemplateArtifactKind>();

  function artifactMap(kind: TemplateArtifactKind): Map<string, CachedTemplateArtifact> {
    let map = memo.get(kind);
    if (map === undefined) {
      map = new Map<string, CachedTemplateArtifact>();
      memo.set(kind, map);
    }
    return map;
  }

  function warm(kind: TemplateArtifactKind): void {
    if (warmed.has(kind)) {
      return;
    }
    warmed.add(kind);
    let names: string[] = [];
    try {
      names = fs.readdirSync(artifactCacheRootDir());
    } catch {
      return;
    }
    const fileName = artifactFileName(kind);
    for (const name of names) {
      if (!name.startsWith(V4_TAG_PREFIX)) {
        continue;
      }
      const version = name.slice(V4_TAG_PREFIX.length);
      const filePath = path.join(artifactCacheRootDir(), name, fileName);
      try {
        const bytes = fs.readFileSync(filePath);
        artifactMap(kind).set(version, { digest: computeArtifactDigest(bytes), bytes });
      } catch {
        continue;
      }
    }
  }

  return {
    env: (name: string): string | undefined => process.env[name],

    tagList: async (): Promise<V4TemplateTagEntry[]> => {
      const res: AxiosResponse<string> = await sendRequestWithRetry(
        () => axios.get(config.templatesV4TagListURL, { responseType: "text" }),
        config.tryLimits
      );
      return parseArtifactTagList(res.data);
    },

    download: async (version: string, ref: TemplateArtifactRef): Promise<Buffer> => {
      const res: AxiosResponse<ArrayBuffer> = await sendRequestWithRetry(
        () =>
          axios.get(artifactUrl(config.templateDownloadBaseURL, version, ref), {
            responseType: "arraybuffer",
          }),
        config.tryLimits
      );
      return Buffer.from(res.data);
    },

    cache: {
      get: (version: string, kind: TemplateArtifactKind): CachedTemplateArtifact | undefined => {
        warm(kind);
        return artifactMap(kind).get(version);
      },
      put: (version: string, kind: TemplateArtifactKind, digest: string, bytes: Buffer): void => {
        const target = artifactCacheFile(version, kind);
        fs.ensureDirSync(path.dirname(target));
        const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(temp, bytes);
        fs.renameSync(temp, target);
        artifactMap(kind).set(version, { digest, bytes });
        warmed.add(kind);
      },
      keys: (kind: TemplateArtifactKind): string[] => {
        warm(kind);
        return [...artifactMap(kind).keys()];
      },
      delete: (version: string, kind: TemplateArtifactKind): void => {
        const file = artifactCacheFile(version, kind);
        try {
          fs.removeSync(file);
        } catch {
          // Best-effort cache GC; an undeletable stale cache file should not fail resolution.
        }
        artifactMap(kind).delete(version);
      },
    },

    bundled,
  };
}
