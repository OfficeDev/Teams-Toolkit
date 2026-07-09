// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ConfigFolderName, IQTreeNode, Platform } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { FeatureFlags, featureFlagManager } from "../../../common/featureFlags";
import { TOOLS } from "../../../common/globalVars";
import * as templateHelper from "../../../component/generator/templateHelper";
import * as folder from "../../../folder";
import { constructNode } from "../constructNode";

/**
 * Load the wizard question tree from wizardNode.json.
 * Combined JSON with all sub-trees inlined.
 */
export function getRootProjectTypeNode(platform: Platform = Platform.VSCode): IQTreeNode {
  return loadUiNode("wizardNode.json", platform);
}

/**
 * Load the TDP wizard question tree from tdpNode.json.
 * Subset of wizard options for Teams Developer Portal import flow.
 */
export function getTdpProjectTypeNode(platform: Platform = Platform.VSCode): IQTreeNode {
  return loadUiNode("tdpNode.json", platform);
}

function loadUiNode(fileName: string, platform: Platform): IQTreeNode {
  const cachedJsonPath = path.join(os.homedir(), `.${String(ConfigFolderName)}`, "ui", fileName);

  // `constructNode` rebuilds this tree against THIS fx-core's `QuestionNames`,
  // option ids, and `onDidSelection` callbacks, and the v4 front-door adapter
  // (`applyV3PreFill`) pre-fills the v3 inputs against those same local names
  // (e.g. `inputs[QuestionNames.ActionType]`). A downloaded `~/.fx/ui` copy can
  // lag the local code (a dev build ahead of the published v4 metadata, or a
  // leftover cache from an earlier version); when its action-type node name
  // drifts from the pre-fill key the already-answered question is no longer
  // suppressed and is asked a second time. On the v4 channel, pin the UI tree to
  // the bundled artifact that ships with this fx-core so the v3 walk always
  // matches the adapter. (Metadata descriptors keep the `useBundledMetadataForV4`
  // escape hatch in metadata/index.ts — they carry no local code bindings.)
  const v4Enabled = featureFlagManager.getBooleanValue(FeatureFlags.V4Enabled);

  let jsonPath: string;
  let source: string;
  if (!v4Enabled && !templateHelper.useLocalTemplate() && fs.pathExistsSync(cachedJsonPath)) {
    jsonPath = cachedJsonPath;
    source = "cache";
  } else {
    jsonPath = path.join(folder.getTemplatesFolder(), "ui", fileName);
    source = "bundled";
  }

  const content = fs.readFileSync(jsonPath, "utf-8");
  TOOLS?.logProvider?.info(`[Dynamic Template] Loaded ${fileName} from ${source}: ${jsonPath}`);
  return constructNode(content, platform);
}
