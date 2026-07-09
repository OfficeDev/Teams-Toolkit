// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError } from "@microsoft/teamsfx-api";
import { Result } from "neverthrow";
import templateConfig from "../../common/templates-config.json";
import * as bundledFloor from "../../v4/distribution/bundledFloor";
import {
  TemplateArtifactSnapshot,
  createTemplateArtifactPort,
  resolveTemplateArtifactSnapshot,
} from "../../v4/distribution/templateArtifacts";
import { defaultTryLimits } from "./constant";

/**
 * Resolve and warm the v4 metadata artifact using the same staged artifact
 * resolver as create/modify front doors.
 *
 * The final v4 channel publishes `templates-metadata.zip`, not the legacy v3
 * `metadata.zip`. Resolving this snapshot downloads, verifies, and caches the
 * metadata artifact without writing the legacy `~/.fx` metadata directory.
 *
 * An unreachable channel resolves to a bundled-fallback origin (not an error);
 * only a malformed tag list or a digest mismatch surfaces as `Result.err`.
 */
export function resolveV4MetadataSource(): Promise<Result<TemplateArtifactSnapshot, FxError>> {
  const port = createTemplateArtifactPort(
    {
      templatesV4TagListURL: templateConfig.templatesV4TagListURL,
      templateDownloadBaseURL: templateConfig.templateDownloadBaseURL,
      tryLimits: defaultTryLimits,
    },
    bundledFloor.loadBundledTemplateArtifacts()
  );
  return resolveTemplateArtifactSnapshot({
    range: templateConfig.v4.range,
    bundled: templateConfig.v4.bundled,
    requiredKind: "metadata",
    port,
  });
}
