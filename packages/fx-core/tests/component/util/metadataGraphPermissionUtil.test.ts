import { FxError, LogProvider, ok, Result } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { setTools } from "../../../src/common/globalVars";
import { TelemetryProperty } from "../../../src/common/telemetry";
import {
  DriverInstance,
  ExecutionResult,
  ProjectModel,
} from "../../../src/component/configManager/interface";
import { graphAppId } from "../../../src/component/driver/aad/permissions";
import { DriverContext } from "../../../src/component/driver/interface/commonArgs";
import {
  metadataGraphPermissionDeps,
  metadataGraphPermissionUtil,
} from "../../../src/component/utils/metadataGraphPermssion";
import { MockTools } from "../../core/utils";
import { vi } from "vitest";

function mockedResolveDriverInstances(log: LogProvider): Result<DriverInstance[], FxError> {
  return ok([
    {
      uses: "arm/deploy",
      with: undefined,
      instance: {
        execute: async (args: unknown, context: DriverContext): Promise<ExecutionResult> => {
          return { result: ok(new Map()), summaries: [] };
        },
      },
    },
  ]);
}

describe("metadata graph permission util", () => {
  const manifestContent = `
  {
    "name": "hello-world-tab-with-backend-aad",
    "accessTokenAcceptedVersion": 2,
    "signInAudience": "AzureADMyOrg",
    "requiredResourceAccess": [
        {
            "resourceAppId": "Microsoft Graph",
            "resourceAccess": [
                {
                    "id": "User.Read",
                    "type": "Scope"
                },
                {
                  "id": "User.Read.All",
                  "type": "Role"
              }
            ]
        }
    ]
}
  `;
  const sandbox = vi;
  const mockProjectModel: ProjectModel = {
    version: "1.0.0",
    provision: {
      name: "registerApp",
      driverDefs: [
        {
          uses: "aadApp/update",
          with: {
            manifestPath: "aad.manifest.json",
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

  it("parseAadManifest happy path", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from(manifestContent));
    let props: any = {};
    await metadataGraphPermissionUtil.parseAadManifest(ymlPath, mockProjectModel, props);
    assert(props[TelemetryProperty.GraphPermission] === "true");
    assert(props[TelemetryProperty.GraphPermissionHasRole] === "true");
    assert(props[TelemetryProperty.GraphPermissionHasAdminScope] === "false");
    assert(props[TelemetryProperty.GraphPermissionScopes] === "User.Read");
    assert(props[TelemetryProperty.GraphPermissionRoles] === "User.Read.All");
    assert(props[TelemetryProperty.AadManifest] === "true");

    // no aad manifest path in aad/update action
    const model = Object.assign({}, mockProjectModel);
    model.provision!.driverDefs[0].with = undefined;
    props = {};
    await metadataGraphPermissionUtil.parseAadManifest(ymlPath, model, props);
    assert(props[TelemetryProperty.GraphPermission] === "true");
    assert(props[TelemetryProperty.GraphPermissionHasRole] === "true");
    assert(props[TelemetryProperty.GraphPermissionHasAdminScope] === "false");
    assert(props[TelemetryProperty.GraphPermissionScopes] === "User.Read");
    assert(props[TelemetryProperty.GraphPermissionRoles] === "User.Read.All");
    assert(props[TelemetryProperty.AadManifest] === "true");
  });

  it("parseAadManifest no manifest", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    const props: any = {};
    await metadataGraphPermissionUtil.parseAadManifest(ymlPath, mockProjectModel, props);
    assert(props[TelemetryProperty.GraphPermissionHasRole] === undefined);
    assert(props[TelemetryProperty.GraphPermissionHasAdminScope] === undefined);
    assert(props[TelemetryProperty.GraphPermissionScopes] === undefined);
    assert(props[TelemetryProperty.GraphPermission] === undefined);
    assert(props[TelemetryProperty.AadManifest] === "false");
  });

  it("getPermissionSummary no graph permission map", async () => {
    vi.spyOn(metadataGraphPermissionDeps, "getDetailedGraphPermissionMap").mockReturnValue(null);
    const manifest = JSON.parse(manifestContent);
    const res = metadataGraphPermissionUtil.summary(manifest);
    assert(res === undefined);
  });

  it("getPermissionSummary no graph permission", async () => {
    const manifest = JSON.parse(manifestContent);
    manifest.requiredResourceAccess = [];
    const res: any = metadataGraphPermissionUtil.summary(manifest);
    assert(res["hasGraphPermission"] === false);
  });

  it("getPermissionSummary graph permission is uuid", async () => {
    const manifest = JSON.parse(manifestContent);
    manifest.requiredResourceAccess[0].resourceAppId = graphAppId;
    const res = metadataGraphPermissionUtil.summary(manifest);
    assert(res !== undefined);
  });

  it("getPermissionSummary graph permission for role and admin scope", async () => {
    const manifest = JSON.parse(manifestContent);
    manifest.requiredResourceAccess[0].resourceAccess.push(
      {
        id: "User.Read",
        type: "Role",
      },
      {
        id: "a154be20-db9c-4678-8ab7-66f6cc099a59", //"User.Read.All"
        type: "Scope",
      }
    );
    const res: any = metadataGraphPermissionUtil.summary(manifest);
    assert(res["hasRole"] === true);
    assert(res["hasAdminScope"] === true);
    assert(res["hasGraphPermission"] === true);
  });
});
