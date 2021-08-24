// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import faker from "faker";
import {
  PluginContext,
  TelemetryReporter,
  LogProvider,
  AppStudioTokenProvider,
  GraphTokenProvider,
  UserInteraction,
  LogLevel,
  PermissionRequestProvider,
  Result,
  FxError,
  ok,
} from "@microsoft/teamsfx-api";
import sinon from "sinon";
import {
  ConfigKeys,
  ConfigKeysOfOtherPlugin,
  Plugins,
} from "../../../../src/plugins/resource/aad/constants";
import jwt_decode from "jwt-decode";
import { Utils } from "../../../../src/plugins/resource/aad/utils/common";
import { MockUserInteraction } from "../../../core/utils";
import { DEFAULT_PERMISSION_REQUEST } from "../../../../src/plugins/solution/fx-solution/constants";

const permissions = '[{"resource": "Microsoft Graph","delegated": ["User.Read"],"application":[]}]';
const permissionsWrong =
  '[{"resource": "Microsoft Graph","delegated": ["User.ReadData"],"application":[]}]';

const mockPermissionRequestProvider: PermissionRequestProvider = {
  async checkPermissionRequest(): Promise<Result<undefined, FxError>> {
    return ok(undefined);
  },
  async getPermissionRequest(): Promise<Result<string, FxError>> {
    return ok(JSON.stringify(DEFAULT_PERMISSION_REQUEST));
  },
};

const mockLogProvider: LogProvider = {
  async log(logLevel: LogLevel, message: string): Promise<boolean> {
    console.log("Log log");
    console.log(message);
    return true;
  },
  async info(message: string | Array<any>): Promise<boolean> {
    console.log("Log info");
    console.log(message);
    return true;
  },
  async debug(message: string): Promise<boolean> {
    console.log("Log debug");
    console.log(message);
    return true;
  },
  async error(message: string): Promise<boolean> {
    console.log("Log error");
    console.error(message);
    return true;
  },
  async trace(message: string): Promise<boolean> {
    console.log("Log trace");
    console.log(message);
    return true;
  },
  async warning(message: string): Promise<boolean> {
    console.log("Log warning");
    console.log(message);
    return true;
  },
  async fatal(message: string): Promise<boolean> {
    console.log("Log fatal");
    console.log(message);
    return true;
  },
};

const mockUI: UserInteraction = new MockUserInteraction();

const mockTelemetryReporter: TelemetryReporter = {
  async sendTelemetryEvent(
    eventName: string,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number }
  ) {
    console.log("Telemetry event");
    console.log(eventName);
    console.log(properties);
  },

  async sendTelemetryErrorEvent(
    eventName: string,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number }
  ) {
    console.log("Telemetry Error");
    console.log(eventName);
    console.log(properties);
  },

  async sendTelemetryException(
    error: Error,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number }
  ) {
    console.log("Telemetry Exception");
    console.log(error.message);
    console.log(properties);
  },
};

const userList = {
  tenantId: faker.datatype.uuid(),
  aadId: faker.datatype.uuid(),
  displayName: "displayName",
  userPrincipalName: "userPrincipalName",
  isOwner: true,
};

export class TestHelper {
  // TODO: update type
  static async pluginContext(
    // eslint-disable-next-line @typescript-eslint/ban-types
    config?: object,
    frontend = true,
    bot = true,
    isLocalDebug = false
  ) {
    let domain: string | undefined = undefined;
    let endpoint: string | undefined = undefined;
    if (frontend) {
      domain = faker.internet.domainName();
      endpoint = "https://" + domain;
    }

    let botId: string | undefined = undefined;
    let botEndpoint: string | undefined = undefined;
    if (bot) {
      botId = faker.datatype.uuid();
      botEndpoint = "https://botendpoint" + botId + ".test";
    }

    const configOfOtherPlugins = isLocalDebug
      ? mockConfigOfOtherPluginsLocalDebug(domain, endpoint, botEndpoint, botId)
      : mockConfigOfOtherPluginsProvision(domain, endpoint, botEndpoint, botId);

    const pluginContext = {
      logProvider: mockLogProvider,
      ui: mockUI,
      telemetryReporter: mockTelemetryReporter,
      config: config,
      configOfOtherPlugins: configOfOtherPlugins,
      projectSettings: {
        appName: "aad-plugin-unit-test",
      },
      permissionRequestProvider: mockPermissionRequestProvider,
    } as unknown as PluginContext;

    return pluginContext;
  }
}

function mockConfigOfOtherPluginsProvision(
  domain: string | undefined,
  endpoint: string | undefined,
  botEndpoint: string | undefined,
  botId: string | undefined
) {
  return new Map([
    [
      Plugins.solution,
      new Map([
        [ConfigKeysOfOtherPlugin.remoteTeamsAppId, faker.datatype.uuid()],
        [ConfigKeysOfOtherPlugin.solutionUserInfo, JSON.stringify(userList)],
      ]),
    ],
    [
      Plugins.frontendHosting,
      new Map([
        [ConfigKeysOfOtherPlugin.frontendHostingDomain, domain],
        [ConfigKeysOfOtherPlugin.frontendHostingEndpoint, endpoint],
      ]),
    ],
    [
      Plugins.teamsBot,
      new Map([
        [ConfigKeysOfOtherPlugin.teamsBotEndpoint, botEndpoint],
        [ConfigKeysOfOtherPlugin.teamsBotId, botId],
      ]),
    ],
  ]);
}

function mockConfigOfOtherPluginsLocalDebug(
  domain: string | undefined,
  endpoint: string | undefined,
  botEndpoint: string | undefined,
  botId: string | undefined
) {
  return new Map([
    [
      Plugins.solution,
      new Map([[ConfigKeysOfOtherPlugin.remoteTeamsAppId, faker.datatype.uuid()]]),
    ],
    [
      Plugins.localDebug,
      new Map([
        [ConfigKeysOfOtherPlugin.localDebugTabDomain, domain],
        [ConfigKeysOfOtherPlugin.localDebugTabEndpoint, endpoint],
        [ConfigKeysOfOtherPlugin.localDebugBotEndpoint, botEndpoint],
      ]),
    ],
    [Plugins.teamsBot, new Map([[ConfigKeysOfOtherPlugin.teamsBotIdLocal, botId]])],
  ]);
}

export function mockProvisionResult(context: PluginContext, isLocalDebug = false) {
  context.config.set(
    Utils.addLocalDebugPrefix(isLocalDebug, ConfigKeys.clientId),
    faker.datatype.uuid()
  );
  context.config.set(
    Utils.addLocalDebugPrefix(isLocalDebug, ConfigKeys.objectId),
    faker.datatype.uuid()
  );
  context.config.set(
    Utils.addLocalDebugPrefix(isLocalDebug, ConfigKeys.clientSecret),
    faker.datatype.uuid()
  );
}

export function mockTokenProvider(): AppStudioTokenProvider {
  const provider = <AppStudioTokenProvider>{};
  const mockTokenObject = {
    tid: faker.datatype.uuid(),
  };

  provider.getAccessToken = sinon.stub().returns("token");
  provider.getJsonObject = sinon.stub().returns(mockTokenObject);
  return provider;
}

export function mockTokenProviderGraph(): GraphTokenProvider {
  const provider = <GraphTokenProvider>{};
  const mockTokenObject = {
    tid: faker.datatype.uuid(),
  };

  provider.getAccessToken = sinon.stub().returns("token");
  provider.getJsonObject = sinon.stub().returns(mockTokenObject);
  return provider;
}

export function mockTokenProviderAzure(token: string): AppStudioTokenProvider {
  const provider = <AppStudioTokenProvider>{};
  const tokenObject = jwt_decode(token);

  provider.getAccessToken = sinon.stub().returns(token);
  provider.getJsonObject = sinon.stub().returns(tokenObject);
  return provider;
}

export function mockTokenProviderAzureGraph(token: string): GraphTokenProvider {
  const provider = <GraphTokenProvider>{};
  const tokenObject = jwt_decode(token);

  provider.getAccessToken = sinon.stub().returns(token);
  provider.getJsonObject = sinon.stub().returns(tokenObject);
  return provider;
}
