import { err, FxError, LogProvider, ok, Result } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import {
  DriverInstance,
  ExecutionResult,
  ProjectModel,
} from "../../../src/component/configManager/interface";
import { DriverContext } from "../../../src/component/driver/interface/commonArgs";
import { setTools } from "../../../src/common/globalVars";
import { MockTools } from "../../core/utils";
import { ExecutionResult as DriverResult } from "../../../src/component/driver/interface/stepDriver";
import {
  ProjectTypeProps,
  TelemetryProperty,
  WebApplicationIdValue,
} from "../../../src/common/telemetry";
import {
  getWebApplicationIdStatus,
  metadataRscPermissionUtil,
} from "../../../src/component/utils/metadataRscPermission";
import { manifestUtils } from "../../../src/component/driver/teamsApp/utils/ManifestUtils";
import { vi } from "vitest";

function mockedResolveDriverInstances(log: LogProvider): Result<DriverInstance[], FxError> {
  return ok([
    {
      uses: "arm/deploy",
      with: undefined,
      instance: {
        execute: async (args: unknown, context: DriverContext): Promise<DriverResult> => {
          return { result: ok(new Map<string, string>()), summaries: [] };
        },
      },
    },
  ]);
}

describe("metadata rsc permission util", () => {
  const manifestContent = `
  {
    "$schema": "https://developer.microsoft.com/en-us/json-schemas/teams/v1.17/MicrosoftTeams.schema.json",
    "manifestVersion": "1.17",
    "version": "1.0.0",
    "id": "TEAMS_APP_ID",
    "developer": {
        "name": "Teams App, Inc.",
        "websiteUrl": "https://www.example.com",
        "privacyUrl": "https://www.example.com/privacy",
        "termsOfUseUrl": "https://www.example.com/termofuse"
    },
    "icons": {
        "color": "color.png",
        "outline": "outline.png"
    },
    "name": {
        "short": "sso-botAPP_NAME_SUFFIX",
        "full": "full name for sso-bot"
    },
    "description": {
        "short": "short description for sso-bot",
        "full": "full description for sso-bot"
    },
    "accentColor": "#FFFFFF",
    "bots": [
        {
            "botId": "BOT_ID",
            "scopes": [
                "personal",
                "team",
                "groupChat"
            ],
            "supportsFiles": false,
            "isNotificationOnly": false,
            "commandLists": [
                {
                    "scopes": [
                        "personal",
                        "team",
                        "groupChat"
                    ],
                    "commands": [
                        {
                            "title": "show",
                            "description": "Show user profile using Single Sign On feature"
                        }
                    ]
                }
            ]
        }
    ],
    "composeExtensions": [],
    "configurableTabs": [],
    "staticTabs": [],
    "permissions": [
        "identity",
        "messageTeamMembers"
    ],
    "validDomains": [
        "BOT_DOMAIN"
    ],
    "webApplicationInfo": {
        "id": "AAD_APP_CLIENT_ID",
        "resource": "api://botid-BOT_ID",
        "applicationPermissions": [
          "ChatSettings.Read.Chat"
        ]
    },
    "authorization": {
      "permissions": {
          "resourceSpecific": [
              {
                  "name": "TeamSettings.Read.Group",
                  "type": "Application"
              },
              {
                "name": "ChannelMeetingStage.Write.Group",
                "type": "Delegated"
              }
          ]
      }
  }
}
  `;
  const version = "1.16";
  const readAppManifestRes = {
    version: version,
    authorization: {
      permissions: {
        resourceSpecific: [
          {
            name: "TeamSettings.Read.Group",
            type: "Application",
          },
          {
            name: "ChannelMeetingStage.Write.Group",
            type: "Delegated",
          },
        ],
      },
    },
    webApplicationInfo: {
      applicationPermissions: ["ChatSettings.Read.Chat"],
    },
  };
  const sandbox = vi;
  const mockProjectModel: ProjectModel = {
    version: "1.0.0",
    provision: {
      name: "provision",
      driverDefs: [
        {
          uses: "teamsApp/validateManifest",
          with: {
            manifestPath: "./appPackage/manifest.json",
          },
        },
      ],
      resolvePlaceholders: () => {
        return ["AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP_NAME"];
      },
      execute: async (ctx: DriverContext): Promise<ExecutionResult> => {
        return { result: ok(new Map()), summaries: [] };
      },
      resolveDriverInstances: mockedResolveDriverInstances,
    },
    environmentFolderPath: "./envs",
  };
  let tools: MockTools;
  const ymlPath = "m365agents.yml";

  beforeEach(() => {
    tools = new MockTools();
    setTools(tools);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parseManifest happy path", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(readAppManifestRes as any));
    let props: any = {};
    await metadataRscPermissionUtil.parseManifest(ymlPath, mockProjectModel, props);
    assert(props[ProjectTypeProps.TeamsManifestVersion] === "1.16");
    assert(props[TelemetryProperty.RscDelegated] === "ChannelMeetingStage.Write.Group");
    assert(
      props[TelemetryProperty.RscApplication] === "TeamSettings.Read.Group,ChatSettings.Read.Chat"
    );

    // no manifest path in teamsApp/validateManifest action
    const model = Object.assign({}, mockProjectModel);
    model.provision!.driverDefs[0].with = undefined;
    props = {};
    await metadataRscPermissionUtil.parseManifest(ymlPath, model, props);
    assert(props[ProjectTypeProps.TeamsManifestVersion] === "1.16");
  });

  it("parseManifest no manifest", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    const props: any = {};
    await metadataRscPermissionUtil.parseManifest(ymlPath, mockProjectModel, props);
    assert(props[ProjectTypeProps.TeamsManifestVersion] === undefined);
  });

  it("get Web ApplicationIdStatus", async () => {
    const resNone = getWebApplicationIdStatus("");
    assert(resNone === WebApplicationIdValue.None);
    const resDefault = getWebApplicationIdStatus("${{AAD_APP_CLIENT_ID}}");
    assert(resDefault === WebApplicationIdValue.Default);
    const resCustomized = getWebApplicationIdStatus("00000000-0000-0000-0000-000000000000");
    assert(resCustomized === WebApplicationIdValue.Customized);
  });
});
