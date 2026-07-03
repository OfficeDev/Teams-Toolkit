// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { TeamsManifestLatest } from "./generated-types";

/**
 * Creates a new Teams manifest object populated with the latest schema (v1.28)
 * and the same default field values previously provided by the deprecated
 * `TeamsAppManifest` class constructor.
 *
 * Use this in place of `new TeamsAppManifest()` when a fully-populated default
 * manifest object is needed.
 *
 * @returns A `TeamsManifestLatest` object with default values.
 */
export function createDefaultTeamsManifest(): TeamsManifestLatest {
  return {
    $schema:
      "https://developer.microsoft.com/en-us/json-schemas/teams/v1.28/MicrosoftTeams.schema.json",
    manifestVersion: "1.28",
    version: "1.0.0",
    id: "{{AppId}}",
    developer: {
      name: "Teams App, Inc.",
      mpnId: "",
      websiteUrl: "https://localhost:3000",
      privacyUrl: "https://localhost:3000/privacy",
      termsOfUseUrl: "https://localhost:3000/termsofuse",
    },
    name: {
      short: "{{AppName}}",
      full: "This field is not used",
    },
    description: {
      short: "Short description for {{AppName}}.",
      full: "Full description of {{AppName}}.",
    },
    icons: { outline: "outline.png", color: "color.png" },
    accentColor: "#FFFFFF",
    permissions: ["identity", "messageTeamMembers"],
    validDomains: ["localhost:3000"],
  };
}
