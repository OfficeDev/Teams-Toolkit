// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError } from "@microsoft/teamsfx-api";
import * as fs from "fs-extra";
import * as path from "path";
import { getTemplatesFolder } from "../../folder";
import {
  BundledTemplateArtifacts,
  TemplateArtifactKind,
  artifactFileName,
  computeArtifactDigest,
} from "./templateArtifacts";
import { BundledFloor, computeDigest } from "./templateSource";

/** Bundled v4 template floor for offline-by-default resolution. */

const SOURCE = "Scaffold";

/** The directory the build bakes the floor into. */
export function bundledFloorDir(): string {
  return path.join(getTemplatesFolder(), "v4");
}

/** Build a {@link BundledFloor} from raw bytes — digest computed, never baked. */
export function bundledFloorFrom(version: string, bytes: Buffer, location: string): BundledFloor {
  return { version, digest: computeDigest(bytes), location };
}

interface FloorManifest {
  version: string;
}

function isFloorManifest(value: unknown): value is FloorManifest {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).version === "string"
  );
}

/** Load the baked floor; missing or malformed artifacts are hard errors. */
export function loadBundledFloor(floorDir: string = bundledFloorDir()): BundledFloor {
  const manifestPath = path.join(floorDir, "floor.json");
  const zipPath = path.join(floorDir, "templates.zip");

  let manifest: unknown;
  try {
    manifest = fs.readJsonSync(manifestPath);
  } catch {
    throw new SystemError({
      source: SOURCE,
      name: "BundledFloorMissing",
      message: `The bundled floor manifest is missing or unreadable at "${manifestPath}".`,
    });
  }
  if (!isFloorManifest(manifest)) {
    throw new SystemError({
      source: SOURCE,
      name: "BundledFloorMalformed",
      message: `The bundled floor manifest at "${manifestPath}" has no string "version".`,
    });
  }

  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(zipPath);
  } catch {
    throw new SystemError({
      source: SOURCE,
      name: "BundledFloorMissing",
      message: `The bundled floor package is missing or unreadable at "${zipPath}".`,
    });
  }

  return bundledFloorFrom(manifest.version, bytes, zipPath);
}

function bundledArtifactDigest(floorDir: string, kind: TemplateArtifactKind): string {
  const location = path.join(floorDir, artifactFileName(kind));
  try {
    return computeArtifactDigest(fs.readFileSync(location));
  } catch {
    throw new SystemError({
      source: SOURCE,
      name: "BundledTemplateArtifactMissing",
      message: `The bundled v4 template artifact is missing or unreadable at "${location}".`,
    });
  }
}

/** Load the baked staged artifacts used by the final v4 distribution resolver. */
export function loadBundledTemplateArtifacts(
  floorDir: string = bundledFloorDir()
): BundledTemplateArtifacts {
  const floor = loadBundledFloor(floorDir);
  const createSelectorFile = artifactFileName("create-selector");
  const modifySelectorFile = artifactFileName("modify-selector");
  const metadataFile = artifactFileName("metadata");
  const templatesFile = artifactFileName("templates");
  return {
    version: floor.version,
    artifacts: {
      "create-selector": {
        kind: "create-selector",
        file: createSelectorFile,
        digest: bundledArtifactDigest(floorDir, "create-selector"),
      },
      "modify-selector": {
        kind: "modify-selector",
        file: modifySelectorFile,
        digest: bundledArtifactDigest(floorDir, "modify-selector"),
      },
      metadata: {
        kind: "metadata",
        file: metadataFile,
        digest: bundledArtifactDigest(floorDir, "metadata"),
      },
      templates: { kind: "templates", file: templatesFile, digest: floor.digest },
    },
    locations: {
      "create-selector": path.join(floorDir, createSelectorFile),
      "modify-selector": path.join(floorDir, modifySelectorFile),
      metadata: path.join(floorDir, metadataFile),
      templates: floor.location,
    },
  };
}
