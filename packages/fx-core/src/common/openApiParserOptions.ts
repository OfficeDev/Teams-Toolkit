// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ParseOptions, ProjectType } from "@microsoft/m365-spec-parser";
import { Platform } from "@microsoft/teamsfx-api";
import { featureFlagManager, FeatureFlags } from "./featureFlags";

export function getParserOptions(
  type: ProjectType,
  isDeclarativeAgent?: boolean,
  platform?: string
): ParseOptions {
  return type === ProjectType.Copilot
    ? {
        isGptPlugin: isDeclarativeAgent,
        allowAPIKeyAuth: false,
        allowBearerTokenAuth: platform !== Platform.VS,
        allowMultipleParameters: true,
        allowOauth2: platform !== Platform.VS,
        projectType: ProjectType.Copilot,
        allowMissingId: true,
        allowSwagger: true,
        allowMethods: [
          "get",
          "post",
          "put",
          "delete",
          "patch",
          "head",
          "connect",
          "options",
          "trace",
        ],
        allowResponseSemantics: true,
        allowConversationStarters: false,
        allowConfirmation: false,
      }
    : type === ProjectType.TeamsAi
      ? {
          allowAPIKeyAuth: true,
          allowBearerTokenAuth: true,
          allowMultipleParameters: true,
          allowOauth2: true,
          projectType: ProjectType.TeamsAi,
          allowMethods: [
            "get",
            "post",
            "put",
            "delete",
            "patch",
            "head",
            "connect",
            "options",
            "trace",
          ],
        }
      : {
          projectType: type,
          allowBearerTokenAuth: platform !== Platform.VS,
          allowMultipleParameters: true,
          allowOauth2: featureFlagManager.getBooleanValue(FeatureFlags.SMEOAuth),
        };
}
