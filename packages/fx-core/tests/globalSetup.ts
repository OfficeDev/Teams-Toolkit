// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import { join, resolve } from "node:path";

const generatedArtifactPaths = [
  "path",
  "projectPath",
  "pluginManifestPath",
  join("mock", "path", ".kiotabin"),
  join("mock", "to", "kiota", ".kiotabin"),
];

async function clearGeneratedTestArtifacts(): Promise<void> {
  await Promise.all(
    generatedArtifactPaths.map(async (relativePath) => {
      const absolutePath = resolve(process.cwd(), relativePath);
      await fs.remove(absolutePath);
    })
  );
}

export default async function globalSetup() {
  await clearGeneratedTestArtifacts();

  return async () => {
    await clearGeneratedTestArtifacts();
  };
}
