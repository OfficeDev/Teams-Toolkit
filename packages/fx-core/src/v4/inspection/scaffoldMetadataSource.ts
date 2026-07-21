// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import * as fs from "fs-extra";
import { Result, err, ok } from "neverthrow";
import * as path from "path";
import { getLocalizedString } from "../../common/localizeUtils";
import { ScaffoldMetadataSource } from "./scaffoldCatalog";

const SOURCE = "Scaffold";
const PACKAGE_METADATA_FILES = new Set(["descriptor.json", "questions.json", "pipeline.json"]);

function metadataSourceError(error: unknown): FxError {
  const options = {
    source: SOURCE,
    name: "ScaffoldMetadataSourceReadFailed",
    message: getLocalizedString("core.v4.scaffoldMetadataSourceReadFailed"),
  };
  return error instanceof Error ? new SystemError({ ...options, error }) : new SystemError(options);
}

function isMetadataFile(relativePath: string): boolean {
  const segments = relativePath.split("/");
  if (segments.length === 3 && segments[0] === "_shared" && segments[1] === "questions") {
    return segments[2].endsWith(".json");
  }
  if (segments[0] !== "create" && segments[0] !== "modify") {
    return false;
  }
  if (segments.length === 2 && segments[1] === "selector.json") {
    return true;
  }
  return segments.length > 2 && PACKAGE_METADATA_FILES.has(segments[segments.length - 1]);
}

function collectMetadataFiles(directory: string, relativeDirectory: string, files: string[]): void {
  const entries = fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name !== "content" &&
        !(relativeDirectory.length === 0 && entry.name === "schema")
      ) {
        collectMetadataFiles(path.join(directory, entry.name), relativePath, files);
      }
    } else if (entry.isFile() && isMetadataFile(relativePath)) {
      files.push(relativePath);
    }
  }
}

/** Adapt immutable staged metadata archive bytes to the catalog source port. */
export function metadataArchiveSource(bytes: Buffer): ScaffoldMetadataSource {
  return { load: () => ok(bytes) };
}

/** Adapt the authored `templates/v4` directory to a metadata-only in-memory archive. */
export function authoredDirectoryMetadataSource(root: string): ScaffoldMetadataSource {
  return {
    load: (): Result<Buffer, FxError> => {
      try {
        const resolvedRoot = path.resolve(root);
        const files: string[] = [];
        collectMetadataFiles(resolvedRoot, "", files);
        const zip = new AdmZip();
        for (const file of files) {
          zip.addFile(`v4/${file}`, fs.readFileSync(path.join(resolvedRoot, file)));
        }
        return ok(zip.toBuffer());
      } catch (error) {
        return err(metadataSourceError(error));
      }
    },
  };
}
