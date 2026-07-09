// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError } from "@microsoft/teamsfx-api";
import * as fs from "fs-extra";
import * as path from "path";
import { ExpressionRuntimePort } from "../expression/evaluateExpression";
import { createExpressionPort } from "./whitelist";
import { ScaffoldRuntime } from "./scaffold";
import { FileSink, buildPipelinePort } from "./runtimeRegistry";

/** On-disk scaffold runtime with writes contained under one output root. */

const SOURCE = "Scaffold";

/** `UserError`-free engine bug: a write/read path escaped the scaffold root. */
const SCAFFOLD_PATH_ESCAPE = "ScaffoldPathEscape";

/** Resolve a target-relative path under `rootDir`, rejecting parent-directory escape. */
function containedPath(rootDir: string, entryPath: string): string {
  const base = path.resolve(rootDir);
  const out = path.resolve(base, entryPath);
  const rel = path.relative(base, out);
  if (rel === "" || rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
    throw new SystemError({
      source: SOURCE,
      name: SCAFFOLD_PATH_ESCAPE,
      message: `The scaffold tried to write outside the output directory: "${entryPath}".`,
    });
  }
  return out;
}

/** Narrow an unknown thrown value to one carrying a string-ish `code` field. */
function hasCode(error: unknown): error is { code: unknown } {
  return typeof error === "object" && error !== null && "code" in error;
}

/** True for a "file does not exist" read failure (EAFP: read, don't stat first). */
function isFileNotFound(error: unknown): boolean {
  return hasCode(error) && error.code === "ENOENT";
}

/** A composed on-disk runtime: the two ports `scaffold` needs, plus the output root. */
export interface RealRuntime extends ScaffoldRuntime {
  /** The output directory every write/read is contained under. */
  rootDir: string;
}

/** Build an on-disk runtime rooted at `rootDir`. */
export function createRealRuntime(
  rootDir: string,
  flagReader?: (name: string) => boolean
): RealRuntime {
  const exprPort: ExpressionRuntimePort = createExpressionPort(flagReader);
  const sink: FileSink = {
    write: (entryPath: string, data: Buffer): void => {
      const target = containedPath(rootDir, entryPath);
      fs.ensureDirSync(path.dirname(target));
      fs.writeFileSync(target, data);
    },
    read: (entryPath: string): Buffer | undefined => {
      const target = containedPath(rootDir, entryPath);
      try {
        return fs.readFileSync(target);
      } catch (error) {
        if (isFileNotFound(error)) {
          return undefined;
        }
        throw error;
      }
    },
  };
  const port = buildPipelinePort(exprPort, sink);
  return { rootDir, exprPort, port };
}
