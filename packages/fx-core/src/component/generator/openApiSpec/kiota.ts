// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * @author yuqzho@microsoft.com, KennethBWSong, SLdragon, Ning Tang
 */

import { ProjectType } from "@microsoft/m365-spec-parser";
import {
  Context,
  FxError,
  GeneratorResult,
  Inputs,
  TeamsManifestLatest,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { err, ok, Result } from "neverthrow";
import path from "path";
import { parseAndUpdatePluginManifestForKiota } from "../../../common/daSpecParser";
import { QuestionNames } from "../../../question";
import { copilotGptManifestUtils } from "../../driver/teamsApp/utils/CopilotGptManifestUtils";
import { defaultDeclarativeAgentActionId, defaultDeclarativeAgentManifestFileName } from "./const";
import { copyKiotaFolder, generateAdaptiveCardInPluginManifestForKiota } from "./helper";

export async function kiotaPostProcess(
  context: Context,
  inputs: Inputs,
  destinationPath: string,
  openapiSpecPath: string,
  pluginManifestPath: string,
  manifestPath: string,
  templateType: ProjectType,
  isDeclarativeAgent: boolean
): Promise<Result<GeneratorResult, FxError>> {
  // For Kiota integration scenario, we need to:
  // 1. Copy openapi spec file
  await fs.copyFile(inputs[QuestionNames.ApiSpecLocation].trim(), openapiSpecPath);

  // 2. Copy plugin manifest file
  await fs.copyFile(inputs[QuestionNames.ActionManifestPath], pluginManifestPath);

  // 2.1 Need to update the plugin manifest file
  await parseAndUpdatePluginManifestForKiota(pluginManifestPath, true);

  // 3. add action in da manifest
  const addActionResult = await copilotGptManifestUtils.updateDeclarativeAgentManifest(
    manifestPath,
    defaultDeclarativeAgentManifestFileName,
    defaultDeclarativeAgentActionId,
    pluginManifestPath
  );
  if (addActionResult.isErr()) {
    return err(addActionResult.error);
  }

  // 5. Update plugin manifest to add ac info (optional)
  await generateAdaptiveCardInPluginManifestForKiota(pluginManifestPath, openapiSpecPath, context);

  // 5. Copy .kiota folder
  await copyKiotaFolder(inputs[QuestionNames.ActionManifestPath], destinationPath);
  return ok({ warnings: undefined });
}
