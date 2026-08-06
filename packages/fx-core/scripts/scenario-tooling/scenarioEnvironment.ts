// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FeatureFlagName, FeatureFlags } from "../../src/common/featureFlags";
import { ScenarioDiagnostic, ScenarioReviewContext } from "./scenarioCatalog";

interface ScenarioEnvironmentProfile {
  surface: string;
  featureFlags: Readonly<Record<string, boolean>>;
}

export interface ResolvedScenarioEnvironment {
  profileId: string;
  featureFlags: Readonly<Record<string, boolean>>;
}

const ENVIRONMENT_PROFILES: Readonly<Record<string, ScenarioEnvironmentProfile>> = {
  "vscode-shipped": {
    surface: "vscode",
    featureFlags: {
      [FeatureFlagName.ChatParticipantUIEntries]: true,
    },
  },
  "vscode-v4-preview": {
    surface: "vscode",
    featureFlags: {
      [FeatureFlagName.ChatParticipantUIEntries]: true,
      [FeatureFlagName.V4Enabled]: true,
    },
  },
  "cli-shipped": {
    surface: "cli",
    featureFlags: {},
  },
  "cli-v4-preview": {
    surface: "cli",
    featureFlags: {
      [FeatureFlagName.V4Enabled]: true,
    },
  },
};

function hasOwn(value: object, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, name);
}

function registryDefaults(): Record<string, boolean> {
  return Object.fromEntries(
    Object.values(FeatureFlags).map((flag) => [
      flag.name,
      flag.defaultValue === "true" || flag.defaultValue === "1",
    ])
  );
}

function diagnostic(code: string, relativePath: string, message: string): ScenarioDiagnostic {
  return { severity: "error", code, relativePath, message };
}

export function resolveScenarioEnvironment(
  context: ScenarioReviewContext,
  contextIndex: number,
  relativePath: string
): { environment?: ResolvedScenarioEnvironment; diagnostics: ScenarioDiagnostic[] } {
  const profile = hasOwn(ENVIRONMENT_PROFILES, context.environmentProfile)
    ? ENVIRONMENT_PROFILES[context.environmentProfile]
    : undefined;
  if (profile === undefined) {
    return {
      diagnostics: [
        diagnostic(
          "UnknownEnvironmentProfile",
          relativePath,
          `Review context at index ${contextIndex} names an unknown environment profile.`
        ),
      ],
    };
  }
  if (profile.surface !== context.surface) {
    return {
      diagnostics: [
        diagnostic(
          "EnvironmentProfileSurfaceMismatch",
          relativePath,
          `Review context at index ${contextIndex} uses an environment profile for another surface.`
        ),
      ],
    };
  }
  const defaults = registryDefaults();
  const unknownOverrides = Object.keys(context.featureFlags).filter(
    (name) => !hasOwn(defaults, name)
  );
  if (unknownOverrides.length > 0) {
    return {
      diagnostics: [
        diagnostic(
          "UnknownFeatureFlag",
          relativePath,
          `Review context at index ${contextIndex} overrides an unregistered feature flag.`
        ),
      ],
    };
  }
  return {
    environment: {
      profileId: context.environmentProfile,
      featureFlags: {
        ...defaults,
        ...profile.featureFlags,
        ...context.featureFlags,
      },
    },
    diagnostics: [],
  };
}
