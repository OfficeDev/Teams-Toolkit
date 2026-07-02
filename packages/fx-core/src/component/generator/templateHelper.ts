// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ConfigFolderName } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { featureFlagManager, FeatureFlags } from "../../common/featureFlags";

const packageJson = require("../../../package.json");

/**
 * Determines whether to use local templates based on environment variables and package version.
 * Returns true if:
 * - TEMPLATE_VERSION env variable is set to "local", OR
 * - Package version contains "alpha" (daily build version)
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

  return false;
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
