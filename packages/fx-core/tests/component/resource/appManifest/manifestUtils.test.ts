// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  AppManifestUtils,
  InputsWithProjectPath,
  Platform,
  TeamsAppManifest,
  TeamsManifest,
  TeamsManifestV1D14,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import "reflect-metadata";
import * as uuid from "uuid";
import { createContext, setTools } from "../../../../src/common/globalVars";
import { generateDriverContext } from "../../../../src/common/utils";
import { manifestUtils } from "../../../../src/component/driver/teamsApp/utils/ManifestUtils";
import {
  FileNotFoundError,
  JSONSyntaxError,
  MissingEnvironmentVariablesError,
} from "../../../../src/error/common";
import { MockTools } from "../../../core/utils";
import { newEnvInfoV3 } from "../../../helpers";
import { chai, vi } from "vitest";

describe("getManifest V3", () => {
  const sandbox = vi;
  let inputs: InputsWithProjectPath;
  let manifest: TeamsManifest;
  const manifestTemplate = `{
      "$schema": "https://developer.microsoft.com/en-us/json-schemas/teams/v1.14/MicrosoftTeams.schema.json",
      "manifestVersion": "1.14",
      "version": "1.0.0",
      "id": "{{state.fx-resource-appstudio.teamsAppId}}",
      "packageName": "com.microsoft.teams.extension",
      "developer": {
          "name": "Teams App, Inc.",
          "websiteUrl": "{{{state.fx-resource-frontend-hosting.endpoint}}}",
          "privacyUrl": "https://www.example.com/termofuse",
          "termsOfUseUrl": "https://www.example.com/privacy"
      },
      "icons": {
          "color": "{{config.manifest.icons.color}}",
          "outline": "{{config.manifest.icons.outline}}"
      },
      "name": {
          "short": "{{config.manifest.appName.short}}",
          "full": "{{config.manifest.appName.full}}"
      },
      "description": {
          "short": "{{config.manifest.description.short}}",
          "full": "{{config.manifest.description.full}}"
      },
      "accentColor": "#FFFFFF",
      "bots": [],
      "composeExtensions": [],
      "permissions": [
          "identity",
          "messageTeamMembers"
      ],
      "validDomains": [
          "{{state.fx-resource-frontend-hosting.domain}}"
      ],
      "webApplicationInfo": {
          "id": "{{state.fx-resource-aad-app-for-teams.clientId}}",
          "resource": "{{{state.fx-resource-aad-app-for-teams.applicationIdUris}}}"
      }
  }`;

  setTools(new MockTools());
  const context = generateDriverContext(createContext(), {
    platform: Platform.VSCode,
    projectPath: "",
  });
  beforeEach(async () => {
    inputs = {
      platform: Platform.VSCode,
      projectPath: ".",
    };
    manifest = TeamsManifestV1D14.Convert.toTeamsManifestV1D14(manifestTemplate);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("getManifestV3 MissingEnvironmentVariablesError", async () => {
    const envInfo = newEnvInfoV3();
    envInfo.envName = "dev";
    manifest.name.short = "${{MY_APP_NAME}}";
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(AppManifestUtils, "readTeamsManifest").mockResolvedValue(manifest);
    const res = await manifestUtils.getManifestV3("", context);
    chai.assert.isTrue(res.isErr() && res.error instanceof MissingEnvironmentVariablesError);
  });

  it("getManifestV3 - no manifest file", async () => {
    const envInfo = newEnvInfoV3();
    envInfo.envName = "dev";
    manifest.name.short = "${{MY_APP_NAME}}";
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    const res = await manifestUtils.getManifestV3("", context);
    chai.assert.isTrue(res.isErr() && res.error instanceof FileNotFoundError);
  });

  it("getManifestV3 - invalid JSON format", async () => {
    const envInfo = newEnvInfoV3();
    envInfo.envName = "dev";
    manifest.name.short = "${{MY_APP_NAME}}";
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(AppManifestUtils, "readTeamsManifest").mockImplementation(() => {
      throw new Error();
    });
    const res = await manifestUtils.getManifestV3("", context);
    chai.assert.isTrue(res.isErr() && res.error instanceof JSONSyntaxError);
  });

  it("getManifestV3 teams app id resolved", async () => {
    manifest.id = uuid.v4();
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(AppManifestUtils, "readTeamsManifest").mockResolvedValue(manifest);
    const res = await manifestUtils.getManifestV3("", context);
    chai.assert.isTrue(res.isOk());
  });

  it("getOperationIds", async () => {
    const manifest = new TeamsAppManifest();
    manifest.composeExtensions = [
      {
        botId: uuid.v4(),
        commands: [
          {
            id: "GET /repairs",
            title: "List repairs",
          },
        ],
      },
    ];
    const ids = manifestUtils.getOperationIds(manifest);
    chai.assert.equal(ids.length, 1);
  });
});

describe("_readAppManifest", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("JSONSyntaxError", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue("invalid json" as any);
    const res = await manifestUtils._readAppManifest("invalid json");
    chai.assert.isTrue(res.isErr() && res.error instanceof JSONSyntaxError);
  });
});
