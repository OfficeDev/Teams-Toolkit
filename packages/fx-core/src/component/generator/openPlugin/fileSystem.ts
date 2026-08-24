// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import * as path from "path";
import { OpenPluginInputError } from "./errors";
import { resolveWithinRoot } from "./spec";

export type ExpectedPathKind = "file" | "directory";

export type InspectedPath =
  | { status: "ok"; path: string }
  | { status: "missing" }
  | { status: "outside" }
  | { status: "wrong-kind"; actualKind: string };

export type SkippedSymbolicLinkHandler = (relativePath: string, resolvesOutside: boolean) => void;

export async function resolvePluginRoot(root: string): Promise<string> {
  const requestedRoot = path.resolve(root);
  let realRoot: string;
  try {
    realRoot = await fs.realpath(requestedRoot);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      throw new OpenPluginInputError(`Plugin directory not found: ${requestedRoot}`);
    }
    throw error;
  }
  const stat = await fs.stat(realRoot);
  if (!stat.isDirectory()) {
    throw new OpenPluginInputError(`Plugin path is not a directory: ${requestedRoot}`);
  }
  return realRoot;
}

export async function inspectPathWithinRoot(
  realRoot: string,
  relativePath: string,
  expectedKind: ExpectedPathKind
): Promise<InspectedPath> {
  const lexicalPath = resolveWithinRoot(realRoot, relativePath);
  if (!lexicalPath) return { status: "outside" };

  const relative = path.relative(realRoot, lexicalPath);
  const segments = relative === "" ? [] : relative.split(path.sep);
  let inspectedPath = realRoot;
  let stat: fs.Stats;
  try {
    stat = await fs.lstat(inspectedPath);
    if (stat.isSymbolicLink()) {
      return { status: "wrong-kind", actualKind: "symbolic link" };
    }
    for (const [index, segment] of segments.entries()) {
      if (!stat.isDirectory()) {
        return { status: "wrong-kind", actualKind: describeKind(stat) };
      }
      inspectedPath = path.join(inspectedPath, segment);
      stat = await fs.lstat(inspectedPath);
      if (stat.isSymbolicLink()) {
        const targetPath = await fs.realpath(inspectedPath);
        return isPathWithinRoot(realRoot, targetPath)
          ? { status: "wrong-kind", actualKind: "symbolic link" }
          : { status: "outside" };
      }
      if (index < segments.length - 1 && !stat.isDirectory()) {
        return { status: "wrong-kind", actualKind: describeKind(stat) };
      }
    }
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return { status: "missing" };
    }
    throw error;
  }

  if (expectedKind === "file" && !stat.isFile()) {
    return { status: "wrong-kind", actualKind: describeKind(stat) };
  }
  if (expectedKind === "directory" && !stat.isDirectory()) {
    return { status: "wrong-kind", actualKind: describeKind(stat) };
  }
  return { status: "ok", path: lexicalPath };
}

export async function copyDirectoryWithoutSymbolicLinks(
  sourceDirectory: string,
  destinationDirectory: string,
  onSkippedSymbolicLink: SkippedSymbolicLinkHandler
): Promise<void> {
  const sourceStat = await fs.lstat(sourceDirectory);
  if (sourceStat.isSymbolicLink()) {
    let resolvesOutside = true;
    try {
      const targetPath = await fs.realpath(sourceDirectory);
      resolvesOutside = !isPathWithinRoot(path.dirname(sourceDirectory), targetPath);
    } catch {
      // Broken links are rejected with the same conservative warning.
    }
    onSkippedSymbolicLink(".", resolvesOutside);
    return;
  }
  const realSourceDirectory = await fs.realpath(sourceDirectory);
  await fs.copy(realSourceDirectory, destinationDirectory, {
    filter: async (sourcePath) => {
      const stat = await fs.lstat(sourcePath);
      if (!stat.isSymbolicLink()) return true;

      let resolvesOutside = true;
      try {
        const targetPath = await fs.realpath(sourcePath);
        resolvesOutside = !isPathWithinRoot(realSourceDirectory, targetPath);
      } catch {
        // Broken links are rejected with the same conservative warning.
      }
      onSkippedSymbolicLink(path.relative(realSourceDirectory, sourcePath), resolvesOutside);
      return false;
    },
  });
}

function isPathWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

function describeKind(stat: fs.Stats): string {
  if (stat.isDirectory()) return "directory";
  if (stat.isFile()) return "file";
  return "filesystem entry";
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === code;
}
