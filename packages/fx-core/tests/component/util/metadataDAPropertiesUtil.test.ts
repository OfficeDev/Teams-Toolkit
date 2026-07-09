import { FxError, LogProvider, ok, Result } from "@microsoft/teamsfx-api";
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
import { ProjectTypeProps } from "../../../src/common/telemetry";
import { metadataDAPropertiesUtil } from "../../../src/component/utils/metadataDAProperties";
import { manifestUtils } from "../../../src/component/driver/teamsApp/utils/ManifestUtils";
import { assert, vi } from "vitest";

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
  
  `;
  const sandbox = vi;

  const readAppManifestRes = {
    $schema: "https://developer.microsoft.com/json-schemas/teams/v1.19/MicrosoftTeams.schema.json",
    manifestVersion: "1.19",
    version: "1.0.0",
    copilotAgents: {
      declarativeAgents: [
        {
          id: "declarativeAgent",
          file: "declarativeAgent.json",
        },
      ],
    },
  };

  const mockProjectModel: ProjectModel = {
    version: "1.0.0",
    provision: {
      name: "provision",
      driverDefs: [
        {
          uses: "teamsApp/zipAppPackage",
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

    vi.spyOn(fs, "readJSON").mockImplementation(async (path: string) => {
      if (path.endsWith("declarativeAgent.json")) {
        return {
          capabilities: [
            {
              name: "capability1",
            },
            {
              name: "capability2",
            },
          ],
          actions: [
            {
              file: "action1.json",
            },
            {
              file: "action2.json",
            },
          ],
        };
      } else if (path.endsWith("action1.json")) {
        return {
          runtimes: [
            {
              type: "OpenApi",
              auth: {
                type: "None",
              },
              spec: {
                url: "apiSpecificationFile/openapi.yaml",
              },
              run_for_functions: ["deletePet"],
            },
          ],
        };
      } else if (path.endsWith("action2.json")) {
        return {
          runtimes: [
            {
              type: "OpenApi",
              auth: {
                type: "ApiKeyPluginVault",
              },
              spec: {
                url: "apiSpecificationFile/openapi.yaml",
              },
              run_for_functions: ["deletePet"],
            },
          ],
        };
      }
    });

    const props: any = {};
    await metadataDAPropertiesUtil.parseManifest(ymlPath, mockProjectModel, props);

    assert(props[ProjectTypeProps.DeclarativeAgentCapabilitiesCount] === "2");
    assert(props[ProjectTypeProps.DeclarativeAgentActionsCount] === "2");
    assert(props[ProjectTypeProps.DeclarativeAgentCapabilities] === "capability1,capability2");
    assert(props[ProjectTypeProps.DeclarativeAgentPluginAuthTypes] === "None;ApiKeyPluginVault");
  });

  it("parseManifest no manifest", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    const props: any = {};
    await metadataDAPropertiesUtil.parseManifest(
      ymlPath,
      {
        version: "1.0.0",
        provision: {
          name: "provision",
          driverDefs: [
            {
              uses: "teamsApp/zipAppPackage",
              with: {},
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
      },
      props
    );
    assert(props[ProjectTypeProps.TeamsManifestVersion] === undefined);
  });

  it("parseManifest read manfiest error", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    const props: any = {};
    await metadataDAPropertiesUtil.parseManifest(ymlPath, mockProjectModel, props);
    assert(props[ProjectTypeProps.TeamsManifestVersion] === undefined);
  });

  it("parseManifest no capabilities and actions", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(readAppManifestRes as any));

    vi.spyOn(fs, "readJSON").mockImplementation(async (path: string) => {
      if (path.endsWith("declarativeAgent.json")) {
        return {};
      }
    });

    const props: any = {};
    await metadataDAPropertiesUtil.parseManifest(ymlPath, mockProjectModel, props);

    assert(props[ProjectTypeProps.DeclarativeAgentCapabilitiesCount] === "0");
    assert(props[ProjectTypeProps.DeclarativeAgentActionsCount] === "0");
    assert(props[ProjectTypeProps.DeclarativeAgentCapabilities] === "");
    assert(props[ProjectTypeProps.DeclarativeAgentPluginAuthTypes] === "");
  });

  it("parseManifest no copilotAgents", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        $schema:
          "https://developer.microsoft.com/json-schemas/teams/v1.19/MicrosoftTeams.schema.json",
        manifestVersion: "1.19",
      } as any)
    );

    const props: any = {};
    await metadataDAPropertiesUtil.parseManifest(ymlPath, mockProjectModel, props);

    assert.deepEqual(props, {});
  });

  it("parseManifest no declarativeAgents", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        $schema:
          "https://developer.microsoft.com/json-schemas/teams/v1.19/MicrosoftTeams.schema.json",
        manifestVersion: "1.19",
        copilotAgents: {},
      } as any)
    );

    const props: any = {};
    await metadataDAPropertiesUtil.parseManifest(ymlPath, mockProjectModel, props);

    assert.deepEqual(props, {});
  });
});
