import { err, FxError, LogProvider, ok, Result, SystemError } from "@microsoft/teamsfx-api";
import { createHash, Hash } from "crypto";
import { assert, expect, vi } from "vitest";
import { setTools } from "../../../src/common/globalVars";
import { TelemetryEvent, TelemetryProperty } from "../../../src/common/telemetry";
import {
  DriverInstance,
  ExecutionResult,
  ProjectModel,
} from "../../../src/component/configManager/interface";
import { yamlParser } from "../../../src/component/configManager/parser";
import { DriverContext } from "../../../src/component/driver/interface/commonArgs";
import { ExecutionResult as DriverResult } from "../../../src/component/driver/interface/stepDriver";
import { metadataGraphPermissionUtil } from "../../../src/component/utils/metadataGraphPermssion";
import { metadataUtil } from "../../../src/component/utils/metadataUtil";
import { pathUtils } from "../../../src/component/utils/pathUtils";
import { MockTools } from "../../core/utils";

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

describe("metadata util", () => {
  const sandbox = vi;
  const mockedError = new SystemError("mockedSource", "mockedError", "mockedMessage");
  const mockProjectModel: ProjectModel = {
    version: "1.0.0",
    additionalMetadata: {
      sampleTag: "testRepo:testSample",
    },
    registerApp: {
      name: "registerApp",
      driverDefs: [
        {
          uses: "arm/deploy",
          with: undefined,
        },
        {
          uses: "teamsApp/create",
          with: undefined,
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

  beforeEach(() => {
    tools = new MockTools();
    setTools(tools);
    vi.spyOn(metadataGraphPermissionUtil, "parseAadManifest").mockResolvedValue();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return YamlParsingError", async () => {
    vi.spyOn(yamlParser, "parse").mockResolvedValue(err(mockedError));
    const result = await metadataUtil.parse("m365agents.yml");
    assert(result.isErr() && result.error.name === "mockedError");
  });

  it("local config file", async () => {
    vi.spyOn(yamlParser, "parse").mockResolvedValue(ok(mockProjectModel));
    const spy = vi.spyOn(tools.telemetryReporter, "sendTelemetryEvent");
    const result = await metadataUtil.parse("m365agents.local.yml");
    expect(spy).toHaveBeenCalledExactlyOnceWith(TelemetryEvent.MetaData, {
      [TelemetryProperty.YmlSchemaVersion]: "1.0.0",
      "configureApp.actions": "",
      "deploy.actions": "",
      "share.actions": "",
      "provision.actions": "",
      "publish.actions": "",
      "registerApp.actions": "armdeploy,teamsAppcreate",
      [TelemetryProperty.YmlName]: "m365agentslocalyml",
      [TelemetryProperty.SampleAppName]: "testRepo:testSample",
    });
    assert(result.isOk());
  });

  it("dev config file", async () => {
    vi.spyOn(yamlParser, "parse").mockResolvedValue(ok(mockProjectModel));
    const spy = vi.spyOn(tools.telemetryReporter, "sendTelemetryEvent");
    const result = await metadataUtil.parse("m365agents.yml");
    expect(spy).toHaveBeenCalledExactlyOnceWith(TelemetryEvent.MetaData, {
      [TelemetryProperty.YmlSchemaVersion]: "1.0.0",
      "configureApp.actions": "",
      "deploy.actions": "",
      "share.actions": "",
      "provision.actions": "",
      "publish.actions": "",
      "registerApp.actions": "armdeploy,teamsAppcreate",
      [TelemetryProperty.YmlName]: "m365agentsyml",
      [TelemetryProperty.SampleAppName]: "testRepo:testSample",
    });
    assert(result.isOk());
  });

  it("should normalize @/\\. in sampleTag", async () => {
    vi.spyOn(yamlParser, "parse").mockResolvedValue(
      ok({
        ...mockProjectModel,
        additionalMetadata: { sampleTag: "Hello@world/this\\is.a.sample" },
      })
    );
    const spy = vi.spyOn(tools.telemetryReporter, "sendTelemetryEvent");
    const result = await metadataUtil.parse("m365agents.yml");
    expect(spy).toHaveBeenCalledExactlyOnceWith(TelemetryEvent.MetaData, {
      [TelemetryProperty.YmlSchemaVersion]: "1.0.0",
      "configureApp.actions": "",
      "deploy.actions": "",
      "share.actions": "",
      "provision.actions": "",
      "publish.actions": "",
      "registerApp.actions": "armdeploy,teamsAppcreate",
      [TelemetryProperty.YmlName]: "m365agentsyml",
      [TelemetryProperty.SampleAppName]: "Hello_world_this_is_a_sample",
    });
    assert(result.isOk());
  });

  it("should send empty sample-app-name if additionalMetadata is undefined", async () => {
    vi.spyOn(yamlParser, "parse").mockResolvedValue(
      ok({
        ...mockProjectModel,
        additionalMetadata: undefined,
      })
    );
    const spy = vi.spyOn(tools.telemetryReporter, "sendTelemetryEvent");
    const result = await metadataUtil.parse("m365agents.yml");
    expect(spy).toHaveBeenCalledExactlyOnceWith(TelemetryEvent.MetaData, {
      [TelemetryProperty.YmlSchemaVersion]: "1.0.0",
      "configureApp.actions": "",
      "deploy.actions": "",
      "share.actions": "",
      "provision.actions": "",
      "publish.actions": "",
      "registerApp.actions": "armdeploy,teamsAppcreate",
      [TelemetryProperty.YmlName]: "m365agentsyml",
      [TelemetryProperty.SampleAppName]: "",
    });
    assert(result.isOk());
  });

  it("no sample tag", async () => {
    vi.spyOn(yamlParser, "parse").mockResolvedValue(
      ok({ ...mockProjectModel, additionalMetadata: {} })
    );
    const spy = vi.spyOn(tools.telemetryReporter, "sendTelemetryEvent");
    const result = await metadataUtil.parse("m365agents.yml");
    expect(spy).toHaveBeenCalledExactlyOnceWith(TelemetryEvent.MetaData, {
      [TelemetryProperty.YmlSchemaVersion]: "1.0.0",
      "configureApp.actions": "",
      "deploy.actions": "",
      "share.actions": "",
      "provision.actions": "",
      "publish.actions": "",
      "registerApp.actions": "armdeploy,teamsAppcreate",
      [TelemetryProperty.YmlName]: "m365agentsyml",
      [TelemetryProperty.SampleAppName]: "",
    });
    assert(result.isOk());
  });

  it("parseManifest with empty manifest", () => {
    const spy = vi.spyOn(tools.telemetryReporter, "sendTelemetryEvent");
    metadataUtil.parseManifest({} as any);

    expect(spy).toHaveBeenCalledExactlyOnceWith(TelemetryEvent.MetaData, {
      "manifest.id": "",
      "manifest.version": "",
      "manifest.manifestVersion": "",
      "manifest.bots": "",
      "manifest.composeExtensions": "",
      "manifest.staticTabs.contentUrl": "",
      "manifest.configurableTabs.configurationUrl": "",
      "manifest.webApplicationInfo.id": "",
      "manifest.extensions": "false",
    });
  });

  it("parseManifest with full manifest", () => {
    const manifest: any = {
      id: "test-id",
      version: "1.0",
      manifestVersion: "1.0",
      bots: [{ botId: "bot1" }, { botId: "bot2" }],
      composeExtensions: [{ botId: "bot1" }, { botId: "bot2" }],
      staticTabs: [
        { contentUrl: "https://example.com/tab1" },
        { contentUrl: "https://example.com/tab2" },
      ],
      configurableTabs: [{ configurationUrl: "https://example.com/config1" }],
      webApplicationInfo: { id: "web-app-id" },
      extensions: [{}],
    };
    const spy = vi.spyOn(tools.telemetryReporter, "sendTelemetryEvent");
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const hashSpy = {
      update: vi.spyOn(Hash.prototype, "update"),
      digest: vi.spyOn(Hash.prototype, "digest"),
    };

    manifest.extensions = [{}];
    metadataUtil.parseManifest(manifest as any);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    assert.isTrue(hashSpy.update.mock.calls.length > 0);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(hashSpy.digest).toHaveBeenCalledWith("hex");
    expect(spy).toHaveBeenCalledExactlyOnceWith(TelemetryEvent.MetaData, {
      "manifest.id": "test-id",
      "manifest.version": "1.0",
      "manifest.manifestVersion": "1.0",
      "manifest.bots": "bot1,bot2",
      "manifest.composeExtensions": "bot1,bot2",
      "manifest.staticTabs.contentUrl": `${[
        createHash("sha256").update(manifest.staticTabs[0].contentUrl).digest("hex"),
        createHash("sha256").update(manifest.staticTabs[1].contentUrl).digest("hex"),
      ].toString()}`,
      "manifest.configurableTabs.configurationUrl": `${createHash("sha256")
        .update(manifest.configurableTabs[0].configurationUrl)
        .digest("hex")}`,
      "manifest.webApplicationInfo.id": "web-app-id",
      "manifest.extensions": "true",
    });

    // If extensions is empty, it should report false in telemetry event
    manifest.extensions = [];
    metadataUtil.parseManifest(manifest as any);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    assert.isTrue(hashSpy.update.mock.calls.length > 0);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(hashSpy.digest).toHaveBeenCalledWith("hex");
    expect(spy).toHaveBeenCalledWith(TelemetryEvent.MetaData, {
      "manifest.id": "test-id",
      "manifest.version": "1.0",
      "manifest.manifestVersion": "1.0",
      "manifest.bots": "bot1,bot2",
      "manifest.composeExtensions": "bot1,bot2",
      "manifest.staticTabs.contentUrl": `${[
        createHash("sha256").update(manifest.staticTabs[0].contentUrl).digest("hex"),
        createHash("sha256").update(manifest.staticTabs[1].contentUrl).digest("hex"),
      ].toString()}`,
      "manifest.configurableTabs.configurationUrl": `${createHash("sha256")
        .update(manifest.configurableTabs[0].configurationUrl)
        .digest("hex")}`,
      "manifest.webApplicationInfo.id": "web-app-id",
      "manifest.extensions": "false",
    });

    // If extensions is undefined, it should report false in telemetry event
    manifest.extensions = undefined;
    metadataUtil.parseManifest(manifest as any);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    assert.isTrue(hashSpy.update.mock.calls.length > 0);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(hashSpy.digest).toHaveBeenCalledWith("hex");
    expect(spy).toHaveBeenCalledWith(TelemetryEvent.MetaData, {
      "manifest.id": "test-id",
      "manifest.version": "1.0",
      "manifest.manifestVersion": "1.0",
      "manifest.bots": "bot1,bot2",
      "manifest.composeExtensions": "bot1,bot2",
      "manifest.staticTabs.contentUrl": `${[
        createHash("sha256").update(manifest.staticTabs[0].contentUrl).digest("hex"),
        createHash("sha256").update(manifest.staticTabs[1].contentUrl).digest("hex"),
      ].toString()}`,
      "manifest.configurableTabs.configurationUrl": `${createHash("sha256")
        .update(manifest.configurableTabs[0].configurationUrl)
        .digest("hex")}`,
      "manifest.webApplicationInfo.id": "web-app-id",
      "manifest.extensions": "false",
    });
  });

  it("parseManifest with undefined urls", () => {
    const manifest: any = {
      id: "test-id",
      version: "1.0",
      manifestVersion: "1.0",
      bots: [{ botId: "bot1" }, { botId: "bot2" }],
      composeExtensions: [{ botId: "bot1" }, { botId: "bot2" }],
      staticTabs: [{ contentUrl: undefined }, { contentUrl: undefined }],
      configurableTabs: [{ configurationUrl: undefined }],
      webApplicationInfo: { id: "web-app-id" },
    };
    const spy = vi.spyOn(tools.telemetryReporter, "sendTelemetryEvent");
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const hashSpy = {
      update: vi.spyOn(Hash.prototype, "update"),
      digest: vi.spyOn(Hash.prototype, "digest"),
    };

    metadataUtil.parseManifest(manifest as any);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    assert.isTrue(hashSpy.update.mock.calls.length === 0);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    assert.isTrue(hashSpy.digest.mock.calls.length === 0);
    expect(spy).toHaveBeenCalledExactlyOnceWith(TelemetryEvent.MetaData, {
      "manifest.id": "test-id",
      "manifest.version": "1.0",
      "manifest.manifestVersion": "1.0",
      "manifest.bots": "bot1,bot2",
      "manifest.composeExtensions": "bot1,bot2",
      "manifest.staticTabs.contentUrl": "undefined,undefined",
      "manifest.configurableTabs.configurationUrl": "undefined",
      "manifest.webApplicationInfo.id": "web-app-id",
      "manifest.extensions": "false",
    });
  });
});
