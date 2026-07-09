// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import * as fs from "fs-extra";
import * as path from "path";
import { Result, err, ok } from "neverthrow";
import { TemplateFileEntry } from "../model/dataModel";

/** Load a declarative package from an authored directory. See open-template-package spec. */

const SOURCE = "Scaffold";

/** A parsed declarative package: shape files plus optional raw content. */
export interface LoadedPackage {
  /** The package's parsed `descriptor.json` (its `replaceMap` drives the render vars). */
  descriptor: unknown;
  /** The package's parsed `pipeline.json`. */
  pipeline: unknown;
  /** The opened `content/**` entries (raw bytes, `.tpl` suffix intact, sorted); empty for pipeline-only packages. */
  content: TemplateFileEntry[];
}

/** Read + parse one top-level package JSON file (EAFP: read, don't stat first). */
function readPackageJson(dir: string, file: string): Result<unknown, FxError> {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(dir, file), "utf8");
  } catch {
    return err(
      new SystemError({
        source: SOURCE,
        name: "PackageFileMissing",
        message: `The template package is missing "${file}".`,
      })
    );
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return ok(parsed);
  } catch {
    return err(
      new SystemError({
        source: SOURCE,
        name: "PackageFileInvalid",
        message: `The template package file "${file}" is not valid JSON.`,
      })
    );
  }
}

/** Recurse `content/**` into raw, forward-slash-pathed entries rooted at `root`. */
function walkContent(root: string, dir: string, out: TemplateFileEntry[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkContent(root, full, out);
    } else {
      out.push({
        path: path.relative(root, full).replace(/\\/g, "/"),
        data: fs.readFileSync(full),
      });
    }
  }
}

/** Load optional `content/**` as deterministically ordered raw entries. */
function loadContent(contentRoot: string): Result<TemplateFileEntry[], FxError> {
  const entries: TemplateFileEntry[] = [];
  try {
    walkContent(contentRoot, contentRoot, entries);
  } catch (error) {
    if (isMissingContentRoot(error, contentRoot)) {
      return ok([]);
    }
    return err(
      new SystemError({
        source: SOURCE,
        name: "PackageContentReadFailed",
        message: `The template package's "content" directory could not be read.`,
      })
    );
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return ok(entries);
}

function hasCodeAndPath(error: unknown): error is { code: unknown; path?: unknown } {
  return typeof error === "object" && error !== null && "code" in error;
}

function isMissingContentRoot(error: unknown, contentRoot: string): boolean {
  if (!hasCodeAndPath(error) || error.code !== "ENOENT" || typeof error.path !== "string") {
    return false;
  }
  return path.resolve(error.path) === path.resolve(contentRoot);
}

/** Load a declarative template package from its authored directory. */
export function loadPackageDir(dir: string): Result<LoadedPackage, FxError> {
  const descriptor = readPackageJson(dir, "descriptor.json");
  if (descriptor.isErr()) {
    return err(descriptor.error);
  }
  const pipeline = readPackageJson(dir, "pipeline.json");
  if (pipeline.isErr()) {
    return err(pipeline.error);
  }
  const content = loadContent(path.join(dir, "content"));
  if (content.isErr()) {
    return err(content.error);
  }
  return ok({
    descriptor: descriptor.value,
    pipeline: pipeline.value,
    content: content.value,
  });
}
