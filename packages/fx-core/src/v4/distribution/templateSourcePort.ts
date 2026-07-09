// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import axios, { AxiosResponse } from "axios";
import { Result, err, ok } from "neverthrow";
import * as fs from "fs-extra";
import * as path from "path";
import os from "os";
import { sendRequestWithRetry } from "../../common/requestUtils";
import {
  BundledFloor,
  CachedPackage,
  TagEntry,
  TemplateSource,
  TemplateSourcePort,
  computeDigest,
} from "./templateSource";

/** Production wiring of {@link TemplateSourcePort}. See resolve-template-source spec. */

const SOURCE = "Scaffold";

/** v4 channel prefix and naming (ADR-0006 channel isolation). */
// eslint-disable-next-line no-secrets/no-secrets
export const V4_TAG_PREFIX = "templates-v4@";
export const ZIP_EXT = ".zip";

export interface TemplateChannelConfig {
  /** NDJSON tag-list URL for the v4 channel (separate from the frozen v3 `tagListURL`). */
  templatesV4TagListURL: string;
  /** Base URL release assets are downloaded from. */
  templateDownloadBaseURL: string;
  /** Network retry budget. */
  tryLimits: number;
}

/** Parse the NDJSON tag list; malformed nonblank lines are hard errors. */
export function parseTagList(ndjson: string): TagEntry[] {
  const entries: TagEntry[] = [];
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
      throw new SystemError({
        source: SOURCE,
        name: "TemplateTagListMalformed",
        message: `Malformed v4 tag-list entry on line ${i + 1}: not valid JSON.`,
      });
    }
    if (!isTagEntry(parsed)) {
      throw new SystemError({
        source: SOURCE,
        name: "TemplateTagListMalformed",
        message: `Malformed v4 tag-list entry on line ${i + 1}: missing "version" or "digest".`,
      });
    }
    entries.push({ version: parsed.version, digest: parsed.digest });
  }
  return entries;
}

function isTagEntry(value: unknown): value is TagEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return typeof v.version === "string" && typeof v.digest === "string";
}

/** The download URL for a v4 template package version. */
export function templateZipUrl(baseURL: string, version: string): string {
  return `${baseURL}/${V4_TAG_PREFIX}${version}/templates${ZIP_EXT}`;
}

/** The on-disk cache directory for the v4 template packages. */
export function cacheDir(): string {
  return path.join(os.homedir(), ".fx", "templates-cache");
}

/** The cache file path for one version. */
export function cacheFile(version: string): string {
  return path.join(cacheDir(), `${V4_TAG_PREFIX}${version}${ZIP_EXT}`);
}

/** Build the production port; the bundled floor is injected. */
export function createTemplateSourcePort(
  config: TemplateChannelConfig,
  floor: BundledFloor
): TemplateSourcePort {
  const memo = new Map<string, CachedPackage>();

  // Warm disk cache once so offline resolution sees prior downloads.
  let warmed = false;
  const warm = (): void => {
    if (warmed) {
      return;
    }
    warmed = true;
    let names: string[] = [];
    try {
      names = fs.readdirSync(cacheDir());
    } catch {
      return; // EAFP: no cache dir yet → empty index
    }
    for (const name of names) {
      if (!name.startsWith(V4_TAG_PREFIX) || !name.endsWith(ZIP_EXT)) {
        continue;
      }
      const version = name.slice(V4_TAG_PREFIX.length, name.length - ZIP_EXT.length);
      try {
        const bytes = fs.readFileSync(path.join(cacheDir(), name));
        memo.set(version, { digest: computeDigest(bytes), bytes });
      } catch {
        /* istanbul ignore next -- defensive: a listed cache file vanishing/locked between readdir and read is not reproducible */
        continue; // a vanished/locked file is simply not indexed
      }
    }
  };

  return {
    env: (name: string): string | undefined => process.env[name],

    tagList: async (): Promise<TagEntry[]> => {
      const res: AxiosResponse<string> = await sendRequestWithRetry(
        () => axios.get(config.templatesV4TagListURL, { responseType: "text" }),
        config.tryLimits
      );
      return parseTagList(res.data);
    },

    packages: async (version: string): Promise<Buffer> => {
      const res: AxiosResponse<ArrayBuffer> = await sendRequestWithRetry(
        () =>
          axios.get(templateZipUrl(config.templateDownloadBaseURL, version), {
            responseType: "arraybuffer",
          }),
        config.tryLimits
      );
      return Buffer.from(res.data);
    },

    cache: {
      get: (version: string): CachedPackage | undefined => {
        warm();
        return memo.get(version);
      },
      put: (version: string, digest: string, bytes: Buffer): void => {
        fs.ensureDirSync(cacheDir());
        fs.writeFileSync(cacheFile(version), bytes);
        memo.set(version, { digest, bytes });
      },
      keys: (): string[] => {
        warm();
        return [...memo.keys()];
      },
    },

    floor,
  };
}

/** Load bytes for an already-resolved source; never re-download here. */
export function loadResolvedPackage(
  source: TemplateSource,
  port: TemplateSourcePort
): Result<Buffer, FxError> {
  let bytes: Buffer;
  if (source.origin === "bundled" || source.origin === "bundled-fallback") {
    try {
      bytes = fs.readFileSync(source.location);
    } catch {
      return err(
        new SystemError({
          source: SOURCE,
          name: "TemplatePackageUnreadable",
          message: `The resolved bundled template package at "${source.location}" is missing or unreadable.`,
        })
      );
    }
  } else {
    const cached = port.cache.get(source.version);
    if (cached === undefined) {
      return err(
        new SystemError({
          source: SOURCE,
          name: "TemplatePackageNotCached",
          message: `The resolved template package "${source.version}" is not present in the local cache.`,
        })
      );
    }
    bytes = cached.bytes;
  }

  const digest = computeDigest(bytes);
  if (digest !== source.digest) {
    return err(
      new SystemError({
        source: SOURCE,
        name: "TemplateDigestMismatch",
        message: `The resolved template package "${source.version}" failed its integrity check: expected ${source.digest}, got ${digest}.`,
      })
    );
  }
  return ok(bytes);
}
