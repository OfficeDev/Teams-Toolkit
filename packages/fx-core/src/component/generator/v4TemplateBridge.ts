// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import { merge } from "lodash";
import path from "path";
import { TelemetryProperty } from "../../common/telemetry";
import templateConfig from "../../common/templates-config.json";
import {
  Answers,
  CallerFloor,
  DeclarativeLocator,
  TemplateFileEntry,
  TemplateLocator,
  TemplateSource,
  createRealRuntime,
  openDeclarativePackage,
  scaffold,
} from "../../v4";
import * as bundledFloorMod from "../../v4/distribution/bundledFloor";
import * as templatePackageMod from "../../v4/distribution/templatePackage";
import * as templateSourceMod from "../../v4/distribution/templateSource";
import * as templateSourcePortMod from "../../v4/distribution/templateSourcePort";
import { defaultTryLimits } from "./constant";
import { TemplateOutputPathError } from "./error";
import { GeneratorContext } from "./generatorAction";

export const v4TemplateBridgeDeps = {
  createTemplateSourcePort: templateSourcePortMod.createTemplateSourcePort,
  loadBundledFloor: bundledFloorMod.loadBundledFloor,
  resolveLocalTemplateSource: templateSourceMod.resolveLocalTemplateSource,
  loadResolvedPackage: templateSourcePortMod.loadResolvedPackage,
  openTemplatePackage: templatePackageMod.openTemplatePackage,
};

export interface ResolvedV4ChannelPackage {
  source: TemplateSource;
  bytes: Buffer;
}

/**
 * Resolve a template entry's relative name to an absolute path and verify it
 * stays within `destination`. The entry name originates from the (untrusted)
 * template archive, so a `../` segment could otherwise escape the project
 * directory (zip-slip). Throws `TemplateOutputPathError` on escape.
 */
function resolveTemplateOutputPath(destination: string, entryName: string): string {
  const base = path.resolve(destination);
  const outputPath = path.resolve(base, entryName);
  const relative = path.relative(base, outputPath);
  // Reject only an actual parent-directory escape: a relative path that is the
  // `..` segment itself or starts with `..<sep>`, or an absolute path. A leading
  // `""` means the entry resolves to `base` itself (no filename). A filename
  // that merely starts with ".." (e.g. "..foo") stays in-root and is allowed.
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative)
  ) {
    throw new TemplateOutputPathError(entryName);
  }
  return outputPath;
}

/**
 * Render the located template's entries onto disk using the v3
 * `GeneratorContext` rename/data/filter functions verbatim, so the output is
 * byte-identical to the legacy `unzip` path.
 *
 * `openTemplatePackage` strips the `<language>/<scenario>/` prefix, but the v3
 * `filterFn`/`fileNameReplaceFn` expect entry paths still rooted at
 * `${context.name}/`; the prefix is re-added here before applying them. The
 * data-replace function receives the basename, matching `unzip`'s
 * `dataReplaceFn(entry.name, ...)` call.
 */
export async function renderTemplateEntries(
  context: GeneratorContext,
  entries: TemplateFileEntry[]
): Promise<string[]> {
  const output: string[] = [];
  for (const entry of entries) {
    const entryName = `${context.name}/${entry.path}`;
    if (context.filterFn && !context.filterFn(entryName)) {
      continue;
    }
    const finalName = context.fileNameReplaceFn
      ? context.fileNameReplaceFn(entryName, entry.data)
      : entryName;
    const finalData = context.fileDataReplaceFn
      ? context.fileDataReplaceFn(path.basename(entry.path), entry.data)
      : entry.data;
    const filePath = resolveTemplateOutputPath(context.destination, finalName);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, finalData);
    output.push(finalName);
  }
  return output;
}

/**
 * Resolve the v4 distribution channel and load the located package bytes — the
 * steps `scaffoldFromV4Channel` and `scaffoldDeclarativeFromV4Channel` share
 * verbatim (resolve the source, record its telemetry, read the bytes).
 *
 * Transitional (ADR-0006 INV-T2): the create/modify content path resolves
 * LOCAL-only via `resolveLocalTemplateSource` — `max(cache, floor)`, never the
 * network — so it agrees with the selector/metadata gate within one invocation
 * and the scaffold never blocks on a download. The online resolve lives solely
 * in the background cache-warmer (`fetchOnlineTemplateMetadata`), which warms
 * the cache the *next* invocation reads. Local resolution is total, so the only
 * expected failure here is reading the bytes; `telemetryProps` is still
 * populated with the resolved `source` before the read so a read failure stays
 * attributable.
 *
 * Synchronous: both `resolveLocalTemplateSource` and `loadResolvedPackage` are
 * synchronous. Expected failures surface as thrown `FxError`s, matching how the
 * legacy local-template action rejects.
 */
function resolveChannelPackageBytes(
  context: GeneratorContext,
  telemetryProps?: Record<string, string>,
  resolvedPackage?: ResolvedV4ChannelPackage
): ResolvedV4ChannelPackage {
  if (resolvedPackage !== undefined) {
    merge(telemetryProps, {
      [TelemetryProperty.TemplatePackageSource]: resolvedPackage.source.origin,
      [TelemetryProperty.TemplatePackageVersion]: resolvedPackage.source.version,
      [TelemetryProperty.TemplatePackageDigest]: resolvedPackage.source.digest,
    });
    return resolvedPackage;
  }

  const channelConfig = {
    templatesV4TagListURL: templateConfig.templatesV4TagListURL,
    templateDownloadBaseURL: templateConfig.templateDownloadBaseURL,
    tryLimits: context.tryLimits ?? defaultTryLimits,
  };
  const port = v4TemplateBridgeDeps.createTemplateSourcePort(
    channelConfig,
    v4TemplateBridgeDeps.loadBundledFloor()
  );

  const source = v4TemplateBridgeDeps.resolveLocalTemplateSource({
    range: templateConfig.v4.range,
    port,
  });
  merge(telemetryProps, {
    [TelemetryProperty.TemplatePackageSource]: source.origin,
    [TelemetryProperty.TemplatePackageVersion]: source.version,
    [TelemetryProperty.TemplatePackageDigest]: source.digest,
  });

  const bytesResult = v4TemplateBridgeDeps.loadResolvedPackage(source, port);
  if (bytesResult.isErr()) {
    throw bytesResult.error;
  }
  return { source, bytes: bytesResult.value };
}

/**
 * v3 → v4 wiring (one-way; v3 may call into the v4 barrel, v4 knows nothing of
 * v3). Resolves the scaffold template through the v4 distribution channel, then
 * renders the located template's entries onto disk via the v3 GeneratorContext.
 */
export async function scaffoldFromV4Channel(
  context: GeneratorContext,
  locator: TemplateLocator,
  telemetryProps?: Record<string, string>,
  resolvedPackage?: ResolvedV4ChannelPackage
): Promise<TemplateSource> {
  const { source, bytes } = resolveChannelPackageBytes(context, telemetryProps, resolvedPackage);

  const entriesResult = v4TemplateBridgeDeps.openTemplatePackage(bytes, locator);
  if (entriesResult.isErr()) {
    throw entriesResult.error;
  }

  context.outputs = await renderTemplateEntries(context, entriesResult.value);
  return source;
}

/**
 * List the files already present under `dest`, as content-relative,
 * forward-slash paths — the create-empty contract's `existing` set
 * (`run-scaffold-pipeline` `TargetDir.existing`). An absent directory reads as
 * empty (EAFP: read, don't stat first).
 */
async function listExistingRelativeFiles(dest: string): Promise<string[]> {
  const results: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const names = await fs.readdir(dir).catch(() => undefined);
    if (!names) {
      return; // the directory (or a subdirectory) does not exist — nothing existing
    }
    for (const name of names) {
      const full = path.join(dir, name);
      const stat = await fs.stat(full);
      if (stat.isDirectory()) {
        await walk(full);
      } else {
        results.push(path.relative(dest, full).replace(/\\/g, "/"));
      }
    }
  };
  await walk(dest);
  return results;
}

/**
 * v3 → v4 wiring for the declarative engine: resolve the template through the
 * same v4 distribution channel, then run the authored declarative package
 * (`descriptor` + `pipeline` + `content`) through `scaffold` onto disk, instead
 * of the v3 render path. The package is located by `{kind, templateId}` and
 * materialized by the on-disk runtime rooted at `context.destination`.
 *
 * `answers` and `callerFloor` are supplied by the caller: the v3 surface maps
 * its question values into them (v3 → v4 is allowed; v4 derives the rest from
 * the descriptor). The resolved `source` telemetry is recorded by the shared
 * resolve step before the package is opened.
 *
 * Expected failures (resolution, read, an unmet create-empty contract, an
 * engine break) surface as thrown `FxError`s, matching `scaffoldFromV4Channel`.
 */
export async function scaffoldDeclarativeFromV4Channel(
  context: GeneratorContext,
  locator: DeclarativeLocator,
  answers: Answers,
  callerFloor: CallerFloor,
  telemetryProps?: Record<string, string>,
  flagReader?: (name: string) => boolean,
  resolvedPackage?: ResolvedV4ChannelPackage
): Promise<TemplateSource> {
  const { source, bytes } = resolveChannelPackageBytes(context, telemetryProps, resolvedPackage);

  const loaded = openDeclarativePackage(bytes, locator);
  if (loaded.isErr()) {
    throw loaded.error;
  }

  const existing = await listExistingRelativeFiles(context.destination);
  const result = await scaffold(
    {
      descriptor: loaded.value.descriptor,
      pipeline: loaded.value.pipeline,
      content: loaded.value.content,
      answers,
      callerFloor,
      targetDir: { path: context.destination, existing },
    },
    createRealRuntime(context.destination, flagReader)
  );
  if (result.isErr()) {
    throw result.error;
  }

  context.outputs = result.value.written;
  return source;
}
