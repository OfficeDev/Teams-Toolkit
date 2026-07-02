// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError } from "@microsoft/teamsfx-api";
import { Result } from "neverthrow";
import templateConfig from "../common/templates-config.json";
import { defaultTryLimits } from "../component/generator/constant";
import {
  TemplateArtifactKind,
  TemplateArtifactSnapshot,
  createTemplateArtifactPort,
  loadBundledTemplateArtifacts,
  resolveTemplateArtifactSnapshot,
} from "../v4";

export function resolveV4TemplateArtifactSnapshot(
  requiredKind: TemplateArtifactKind
): Promise<Result<TemplateArtifactSnapshot, FxError>> {
  const port = createTemplateArtifactPort(
    {
      templatesV4TagListURL: templateConfig.templatesV4TagListURL,
      templateDownloadBaseURL: templateConfig.templateDownloadBaseURL,
      tryLimits: defaultTryLimits,
    },
    loadBundledTemplateArtifacts()
  );
  return resolveTemplateArtifactSnapshot({
    range: templateConfig.v4.range,
    bundled: templateConfig.v4.bundled,
    requiredKind,
    port,
  });
}
