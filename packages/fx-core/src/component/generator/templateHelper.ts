// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ConfigFolderName } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { featureFlagManager, FeatureFlags } from "../../common/featureFlags";
import templateConfig from "../../common/templates-config.json";

const packageJson = require("../../../package.json");

/**
 * Determines whether to use local (in-tree, bundled) templates & metadata.
 * Returns true if:
 * - TEMPLATE_VERSION env variable is set to "local", OR
 * - Package version contains "alpha" (daily build version), OR
 * - The build-time `useLocalTemplate` flag in templates-config.json is true.
 *
 * The `useLocalTemplate` flag is committed `true` on dev and only flipped to
 * `false` for a stable production release (see
 * `.github/scripts/fxcore-sync-up-version.js`), so dev / PR / prerelease builds
 * always read the bundled templates & metadata, keeping every CD-built vsix
 * self-contained. An explicit non-"local" TEMPLATE_VERSION still forces a
 * download of that specific version.
 */
export function useLocalTemplate(): boolean {
  const templateVersionEnv = process.env["TEMPLATE_VERSION"];
  if (templateVersionEnv === "local") {
    return true;
  }
  const version: string = packageJson.version;
  if (version.includes("alpha")) {
    // daily build version
    return true;
  }
  if (templateVersionEnv) {
    // An explicit template version is requested → download that version.
    return false;
  }

  return templateConfig.useLocalTemplate === true;
}

/**
 * V4 front doors resolve selector/metadata through the staged artifact cache.
 * The legacy metadata/UI readers still read bundled data unless a pre-existing
 * v4 metadata cache marker is present; final staged metadata warming does not
 * write this marker.
 */
export function useBundledMetadataForV4(): boolean {
  if (!featureFlagManager.getBooleanValue(FeatureFlags.V4Enabled)) {
    return false;
  }
  const v4VersionFile = path.join(
    os.homedir(),
    `.${String(ConfigFolderName)}`,
    "template-version-v4.txt"
  );
  return !fs.pathExistsSync(v4VersionFile);
}
