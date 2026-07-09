// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SpecParser } from "@microsoft/m365-spec-parser";
import { ConfirmConfig, err, ok, UserError } from "@microsoft/teamsfx-api";
import { RestoreFn } from "mocked-env";
import { chai, vi } from "vitest";
import { featureFlagManager, FeatureFlags } from "../../../../src";
import { teamsGraphClient } from "../../../../src/client/teamsGraphClient";
import { setTools } from "../../../../src/common/globalVars";
import { UpdateOauthArgs } from "../../../../src/component/driver/oauth/interface/updateOauthArgs";
import { UpdateOauthDriver } from "../../../../src/component/driver/oauth/update";
import * as oauthUtility from "../../../../src/component/driver/oauth/utility/utility";
import {
  OauthRegistrationAppType,
  OauthRegistrationTargetAudience,
  TokenExchangeMethodType,
} from "../../../../src/component/driver/teamsApp/interfaces/OauthRegistration";
import { MockedAzureAccountProvider, MockedM365Provider } from "../../../core/utils";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";

const expect = chai.expect;

describe("UpdateOauthDriver", () => {
  const mockedDriverContext: any = {
    m365TokenProvider: new MockedM365Provider(),
    ui: new MockedUserInteraction(),
  };
  const updateOauthDriver = new UpdateOauthDriver();

  let envRestore: RestoreFn | undefined;

  beforeEach(() => {
    setTools({
      ui: new MockedUserInteraction(),
      logProvider: new MockedLogProvider(),
      tokenProvider: {
        azureAccountProvider: new MockedAzureAccountProvider(),
        m365TokenProvider: new MockedM365Provider(),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    if (envRestore) {
      envRestore();
      envRestore = undefined;
    }
  });

  it("happy path: update all fields", async () => {
    vi.spyOn(teamsGraphClient, "updateOauthRegistration").mockResolvedValue({
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test2"],
      applicableToApps: OauthRegistrationAppType.SpecificApp,
      targetAudience: OauthRegistrationTargetAudience.HomeTenant,
      m365AppId: "mockedAppId",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      authorizationEndpoint: "mockedAuthorizationEndpoint",
      tokenExchangeEndpoint: "mockedTokenExchangeEndpoint",
      scopes: ["mockedScope"],
      tokenExchangeMethodType: TokenExchangeMethodType.PostRequestBody,
      isPKCEEnabled: true,
    });
    vi.spyOn(teamsGraphClient, "getOauthRegistrationById").mockResolvedValue({
      oAuthConfigId: "mockedRegistrationId",
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test"],
      applicableToApps: OauthRegistrationAppType.AnyApp,
      targetAudience: OauthRegistrationTargetAudience.AnyTenant,
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      authorizationEndpoint: "mockedAuthorizationEndpoint",
      tokenExchangeEndpoint: "mockedTokenExchangeEndpoint",
      scopes: ["mockedScope"],
      tokenExchangeMethodType: TokenExchangeMethodType.BasicAuthorizationHeader,
      isPKCEEnabled: false,
    });
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "api",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "https://test",
                  tokenUrl: "https://test",
                  scopes: {
                    mockedScopes: "mockedScopes",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
        {
          api: "api2",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test2",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "https://test",
                  tokenUrl: "https://test",
                  refreshUrl: "https://test",
                  scopes: {
                    mockedScopes: "mockedScopes",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });
    vi.spyOn(mockedDriverContext.ui, "confirm").mockImplementation(async (config) => {
      expect((config as ConfirmConfig).title.includes("description")).to.be.true;
      expect((config as ConfirmConfig).title.includes("applicableToApps")).to.be.true;
      expect((config as ConfirmConfig).title.includes("m365AppId")).to.be.true;
      expect((config as ConfirmConfig).title.includes("targetAudience")).to.be.true;
      expect((config as ConfirmConfig).title.includes("isPKCEEnabled")).to.be.true;
      expect((config as ConfirmConfig).title.includes("authorizationEndpoint")).to.be.true;
      expect((config as ConfirmConfig).title.includes("tokenExchangeEndpoint")).to.be.true;
      expect((config as ConfirmConfig).title.includes("tokenRefreshEndpoint")).to.be.true;
      expect((config as ConfirmConfig).title.includes("scopes")).to.be.true;
      expect((config as ConfirmConfig).title.includes("tokenExchangeMethodType")).to.be.true;
      return ok({ type: "success", value: true });
    });
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );

    const args: UpdateOauthArgs = {
      name: "test2",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      targetAudience: "HomeTenant",
      applicableToApps: "SpecificApp",
      configurationId: "mockedRegistrationId",
      tokenExchangeMethodType: "PostRequestBody",
      isPKCEEnabled: true,
    };

    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.size).to.equal(0);
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: update all fields without apiSpecPath", async () => {
    vi.spyOn(teamsGraphClient, "updateOauthRegistration").mockResolvedValue({
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test2"],
      applicableToApps: OauthRegistrationAppType.SpecificApp,
      targetAudience: OauthRegistrationTargetAudience.HomeTenant,
      m365AppId: "mockedAppId",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      authorizationEndpoint: "mockedAuthorizationEndpoint",
      tokenExchangeEndpoint: "mockedTokenExchangeEndpoint",
      scopes: ["mockedScope"],
      tokenExchangeMethodType: TokenExchangeMethodType.PostRequestBody,
      isPKCEEnabled: true,
    });
    vi.spyOn(teamsGraphClient, "getOauthRegistrationById").mockResolvedValue({
      oAuthConfigId: "mockedRegistrationId",
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test"],
      applicableToApps: OauthRegistrationAppType.AnyApp,
      targetAudience: OauthRegistrationTargetAudience.AnyTenant,
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      authorizationEndpoint: "mockedAuthorizationEndpoint",
      tokenExchangeEndpoint: "mockedTokenExchangeEndpoint",
      scopes: ["mockedScope"],
      tokenExchangeMethodType: TokenExchangeMethodType.BasicAuthorizationHeader,
      isPKCEEnabled: false,
    });
    vi.spyOn(mockedDriverContext.ui, "confirm").mockImplementation(async (config) => {
      expect((config as ConfirmConfig).title.includes("description")).to.be.true;
      expect((config as ConfirmConfig).title.includes("applicableToApps")).to.be.true;
      expect((config as ConfirmConfig).title.includes("m365AppId")).to.be.true;
      expect((config as ConfirmConfig).title.includes("targetAudience")).to.be.true;
      expect((config as ConfirmConfig).title.includes("isPKCEEnabled")).to.be.true;
      expect((config as ConfirmConfig).title.includes("authorizationEndpoint")).to.be.true;
      expect((config as ConfirmConfig).title.includes("tokenExchangeEndpoint")).to.be.true;
      expect((config as ConfirmConfig).title.includes("tokenRefreshEndpoint")).to.be.true;
      expect((config as ConfirmConfig).title.includes("scopes")).to.be.true;
      expect((config as ConfirmConfig).title.includes("tokenExchangeMethodType")).to.be.true;
      return ok({ type: "success", value: true });
    });

    const args: UpdateOauthArgs = {
      name: "test",
      appId: "mockedAppId",
      targetAudience: "HomeTenant",
      applicableToApps: "SpecificApp",
      configurationId: "mockedRegistrationId",
      tokenExchangeMethodType: "PostRequestBody",
      isPKCEEnabled: true,

      baseUrl: "https://test2",
      authorizationUrl: "https://test",
      tokenUrl: "https://test",
      refreshUrl: "https://test",
      scope: "mockedScopes",
    };

    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.size).to.equal(0);
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: update all fields with apiSpecPath and baseUrl", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(teamsGraphClient, "updateOauthRegistration").mockResolvedValue({
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test2"],
      applicableToApps: OauthRegistrationAppType.SpecificApp,
      targetAudience: OauthRegistrationTargetAudience.HomeTenant,
      m365AppId: "mockedAppId2",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      authorizationEndpoint: "mockedAuthorizationEndpoint",
      tokenExchangeEndpoint: "mockedTokenExchangeEndpoint",
      scopes: ["mockedScope"],
      tokenExchangeMethodType: TokenExchangeMethodType.PostRequestBody,
      isPKCEEnabled: true,
    });
    vi.spyOn(teamsGraphClient, "getOauthRegistrationById").mockResolvedValue({
      oAuthConfigId: "mockedRegistrationId",
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test"],
      applicableToApps: OauthRegistrationAppType.AnyApp,
      targetAudience: OauthRegistrationTargetAudience.AnyTenant,
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      authorizationEndpoint: "mockedAuthorizationEndpoint",
      tokenExchangeEndpoint: "mockedTokenExchangeEndpoint",
      scopes: ["mockedScope"],
      tokenExchangeMethodType: TokenExchangeMethodType.BasicAuthorizationHeader,
      isPKCEEnabled: false,
    });
    vi.spyOn(mockedDriverContext.ui, "confirm").mockImplementation(async (config) => {
      expect((config as ConfirmConfig).title.includes("description")).to.be.true;
      expect((config as ConfirmConfig).title.includes("applicableToApps")).to.be.true;
      expect((config as ConfirmConfig).title.includes("m365AppId")).to.be.true;
      expect((config as ConfirmConfig).title.includes("targetAudience")).to.be.true;
      expect((config as ConfirmConfig).title.includes("isPKCEEnabled")).to.be.true;
      expect((config as ConfirmConfig).title.includes("authorizationEndpoint")).to.be.true;
      expect((config as ConfirmConfig).title.includes("tokenExchangeEndpoint")).to.be.true;
      expect((config as ConfirmConfig).title.includes("tokenRefreshEndpoint")).to.be.true;
      expect((config as ConfirmConfig).title.includes("scopes")).to.be.true;
      expect((config as ConfirmConfig).title.includes("tokenExchangeMethodType")).to.be.true;
      return ok({ type: "success", value: true });
    });

    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "api",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "https://test",
                  tokenUrl: "https://test",
                  refreshUrl: "https://test",
                  scopes: {
                    mockedScopes: "mockedScopes",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
        {
          api: "api2",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test2",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "https://test",
                  tokenUrl: "https://test",
                  refreshUrl: "https://test",
                  scopes: {
                    mockedScopes: "mockedScopes",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });

    const args: UpdateOauthArgs = {
      name: "test",
      appId: "mockedAppId2",
      targetAudience: "HomeTenant",
      apiSpecPath: "mockedPath",
      applicableToApps: "SpecificApp",
      configurationId: "mockedRegistrationId",
      tokenExchangeMethodType: "PostRequestBody",
      isPKCEEnabled: true,

      baseUrl: "https://test2",
    };

    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.size).to.equal(0);
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: skip confirm for only clientId changes", async () => {
    vi.spyOn(teamsGraphClient, "updateOauthRegistration").mockResolvedValue({
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test"],
      applicableToApps: OauthRegistrationAppType.AnyApp,
      targetAudience: OauthRegistrationTargetAudience.AnyTenant,
      m365AppId: "mockedAppId",
      clientId: "mockedClientId2",
      clientSecret: "mockedClientSecret",
      authorizationEndpoint: "mockedAuthorizationEndpoint",
      tokenExchangeEndpoint: "mockedTokenExchangeEndpoint",
      scopes: ["mockedScope"],
      tokenExchangeMethodType: TokenExchangeMethodType.BasicAuthorizationHeader,
      isPKCEEnabled: false,
    });
    vi.spyOn(teamsGraphClient, "getOauthRegistrationById").mockResolvedValue({
      oAuthConfigId: "mockedRegistrationId",
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test"],
      applicableToApps: OauthRegistrationAppType.AnyApp,
      targetAudience: OauthRegistrationTargetAudience.AnyTenant,
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      authorizationEndpoint: "mockedAuthorizationEndpoint",
      tokenExchangeEndpoint: "mockedTokenExchangeEndpoint",
      scopes: ["mockedScope"],
      tokenExchangeMethodType: TokenExchangeMethodType.BasicAuthorizationHeader,
      isPKCEEnabled: false,
    });
    vi.spyOn(mockedDriverContext.ui, "confirm").mockImplementation(async (config) => {
      throw new Error("Should not call confirm");
    });

    const args: UpdateOauthArgs = {
      name: "mockedDescription",
      configurationId: "mockedRegistrationId",
      clientId: "mockedClientId2",
    };

    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.size).to.equal(0);
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: update fields without apiSpecPath and baseUrl", async () => {
    vi.spyOn(teamsGraphClient, "updateOauthRegistration").mockResolvedValue({
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test2"],
      applicableToApps: OauthRegistrationAppType.SpecificApp,
      targetAudience: OauthRegistrationTargetAudience.HomeTenant,
      m365AppId: "mockedAppId",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      authorizationEndpoint: "mockedAuthorizationEndpoint",
      tokenExchangeEndpoint: "mockedTokenExchangeEndpoint",
      scopes: ["mockedScope"],
      tokenExchangeMethodType: TokenExchangeMethodType.PostRequestBody,
      isPKCEEnabled: true,
    });
    vi.spyOn(teamsGraphClient, "getOauthRegistrationById").mockResolvedValue({
      oAuthConfigId: "mockedRegistrationId",
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test"],
      applicableToApps: OauthRegistrationAppType.AnyApp,
      targetAudience: OauthRegistrationTargetAudience.AnyTenant,
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      authorizationEndpoint: "mockedAuthorizationEndpoint",
      tokenExchangeEndpoint: "mockedTokenExchangeEndpoint",
      scopes: ["mockedScope"],
      tokenExchangeMethodType: TokenExchangeMethodType.BasicAuthorizationHeader,
      isPKCEEnabled: false,
    });
    vi.spyOn(mockedDriverContext.ui, "confirm").mockImplementation(async (config) => {
      expect((config as ConfirmConfig).title.includes("description")).to.be.true;
      expect((config as ConfirmConfig).title.includes("applicableToApps")).to.be.true;
      expect((config as ConfirmConfig).title.includes("m365AppId")).to.be.true;
      expect((config as ConfirmConfig).title.includes("targetAudience")).to.be.true;
      expect((config as ConfirmConfig).title.includes("isPKCEEnabled")).to.be.true;
      expect((config as ConfirmConfig).title.includes("authorizationEndpoint")).to.be.true;
      expect((config as ConfirmConfig).title.includes("tokenExchangeEndpoint")).to.be.true;
      expect((config as ConfirmConfig).title.includes("tokenRefreshEndpoint")).to.be.true;
      expect((config as ConfirmConfig).title.includes("scopes")).to.be.true;
      expect((config as ConfirmConfig).title.includes("tokenExchangeMethodType")).to.be.true;
      return ok({ type: "success", value: true });
    });

    const args: UpdateOauthArgs = {
      name: "test",
      appId: "mockedAppId",
      targetAudience: "HomeTenant",
      applicableToApps: "SpecificApp",
      configurationId: "mockedRegistrationId",
      tokenExchangeMethodType: "PostRequestBody",
      isPKCEEnabled: true,

      authorizationUrl: "https://test",
      tokenUrl: "https://test",
      refreshUrl: "https://test",
      scope: "mockedScopes",
    };

    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.size).to.equal(0);
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: update all fields for Entra SSO", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(teamsGraphClient, "updateOauthRegistration").mockResolvedValue({
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test2"],
      applicableToApps: OauthRegistrationAppType.SpecificApp,
      targetAudience: OauthRegistrationTargetAudience.HomeTenant,
      m365AppId: "mockedAppId",
      clientId: "mockedClientId2",
      identityProvider: "MicrosoftEntra",
      isPKCEEnabled: false,
    } as any);
    vi.spyOn(teamsGraphClient, "getOauthRegistrationById").mockResolvedValue({
      oAuthConfigId: "mockedRegistrationId",
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test"],
      applicableToApps: OauthRegistrationAppType.AnyApp,
      targetAudience: OauthRegistrationTargetAudience.AnyTenant,
      clientId: "mockedClientId",
      identityProvider: "MicrosoftEntra",
      isPKCEEnabled: false,
    } as any);
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "api",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "https://test",
                  tokenUrl: "https://test",
                  scopes: {
                    mockedScopes: "mockedScopes",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
        {
          api: "api2",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test2",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "https://test",
                  tokenUrl: "https://test",
                  refreshUrl: "https://test",
                  scopes: {
                    mockedScopes: "mockedScopes",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });
    vi.spyOn(mockedDriverContext.ui, "confirm").mockImplementation(async (config) => {
      expect((config as ConfirmConfig).title.includes("description")).to.be.true;
      expect((config as ConfirmConfig).title.includes("applicableToApps")).to.be.true;
      expect((config as ConfirmConfig).title.includes("m365AppId")).to.be.true;
      expect((config as ConfirmConfig).title.includes("targetAudience")).to.be.true;

      expect((config as ConfirmConfig).title.includes("clientId")).to.be.true;
      return ok({ type: "success", value: true });
    });

    const args: UpdateOauthArgs = {
      name: "test2",
      appId: "mockedAppId",
      clientId: "mockedClientId2",
      apiSpecPath: "mockedPath",
      targetAudience: "HomeTenant",
      applicableToApps: "SpecificApp",
      configurationId: "mockedRegistrationId",
    };

    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.size).to.equal(0);
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("should throw error if try to disable PKCE", async () => {
    vi.spyOn(teamsGraphClient, "getOauthRegistrationById").mockResolvedValue({
      oAuthConfigId: "mockedRegistrationId",
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test"],
      applicableToApps: OauthRegistrationAppType.AnyApp,
      targetAudience: OauthRegistrationTargetAudience.AnyTenant,
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      authorizationEndpoint: "mockedAuthorizationEndpoint",
      tokenExchangeEndpoint: "mockedTokenExchangeEndpoint",
      scopes: ["mockedScope"],
      isPKCEEnabled: true,
    });
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "api",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "https://test",
                  tokenUrl: "https://test",
                  scopes: {
                    mockedScopes: "mockedScopes",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
        {
          api: "api2",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test2",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "https://test",
                  tokenUrl: "https://test",
                  scopes: {
                    mockedScopes: "mockedScopes",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });

    const args: UpdateOauthArgs = {
      name: "test2",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      targetAudience: "HomeTenant",
      applicableToApps: "SpecificApp",
      configurationId: "mockedRegistrationId",
      isPKCEEnabled: false,
    };

    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("OauthDisablePKCEError");
    }
  });

  it("happy path: does not update when no changes", async () => {
    vi.spyOn(teamsGraphClient, "getOauthRegistrationById").mockResolvedValue({
      oAuthConfigId: "mockedRegistrationId",
      description: "test",
      targetUrlsShouldStartWith: ["https://test"],
      applicableToApps: OauthRegistrationAppType.AnyApp,
      targetAudience: OauthRegistrationTargetAudience.AnyTenant,
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      authorizationEndpoint: "mockedAuthorizationEndpoint",
      tokenExchangeEndpoint: "mockedTokenExchangeEndpoint",
      scopes: ["mockedScopes"],
    });
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "api",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "mockedAuthorizationEndpoint",
                  tokenUrl: "mockedTokenExchangeEndpoint",
                  scopes: {
                    mockedScopes: "mockedScopes",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
        {
          api: "api2",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test2",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "https://test",
                  tokenUrl: "https://test",
                  scopes: {
                    mockedScopes: "mockedScope",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });

    const args: UpdateOauthArgs = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      targetAudience: "AnyTenant",
      applicableToApps: "AnyApp",
      configurationId: "mockedRegistrationId",
    };

    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.size).to.equal(0);
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: should not show confirm when only devtunnel url is different", async () => {
    vi.spyOn(teamsGraphClient, "updateOauthRegistration").mockResolvedValue({
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test2.asse.devtunnels.ms"],
      applicableToApps: OauthRegistrationAppType.SpecificApp,
      targetAudience: OauthRegistrationTargetAudience.HomeTenant,
      m365AppId: "mockedAppId",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      authorizationEndpoint: "mockedAuthorizationEndpoint",
      tokenExchangeEndpoint: "mockedTokenExchangeEndpoint",
      scopes: ["mockedScope"],
    });
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(teamsGraphClient, "getOauthRegistrationById").mockResolvedValue({
      oAuthConfigId: "mockedRegistrationId",
      description: "test",
      targetUrlsShouldStartWith: ["https://test.asse.devtunnels.ms"],
      applicableToApps: OauthRegistrationAppType.AnyApp,
      targetAudience: OauthRegistrationTargetAudience.AnyTenant,
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      authorizationEndpoint: "mockedAuthorizationEndpoint",
      tokenExchangeEndpoint: "mockedTokenExchangeEndpoint",
      scopes: ["mockedScopes"],
    });
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "api",
          server: "https://test2.asse.devtunnels.ms",
          operationId: "get",
          auth: {
            name: "test",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "mockedAuthorizationEndpoint",
                  tokenUrl: "mockedTokenExchangeEndpoint",
                  scopes: {
                    mockedScopes: "mockedScopes",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
        {
          api: "api2",
          server: "https://test2.asse.devtunnels.ms",
          operationId: "get",
          auth: {
            name: "test2",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "https://test",
                  tokenUrl: "https://test",
                  scopes: {
                    mockedScopes: "mockedScopes",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });

    const confirmStub = vi
      .spyOn(mockedDriverContext.ui, "confirm")
      .mockResolvedValue(ok({ type: "success", value: true }));

    const args: UpdateOauthArgs = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      targetAudience: "AnyTenant",
      applicableToApps: "AnyApp",
      configurationId: "mockedRegistrationId",
    };

    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.size).to.equal(0);
      expect(result.summaries.length).to.equal(1);
    }
    expect(confirmStub.mock.calls.length === 0).to.be.true;
  });

  it("should throw error when user canel", async () => {
    vi.spyOn(teamsGraphClient, "getOauthRegistrationById").mockResolvedValue({
      oAuthConfigId: "mockedRegistrationId",
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test"],
      applicableToApps: OauthRegistrationAppType.AnyApp,
      targetAudience: OauthRegistrationTargetAudience.AnyTenant,
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      authorizationEndpoint: "mockedAuthorizationEndpoint",
      tokenExchangeEndpoint: "mockedTokenExchangeEndpoint",
      scopes: ["mockedScope"],
    });
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "api",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "https://test",
                  tokenUrl: "https://test",
                  scopes: {
                    mockedScopes: "mockedScopes",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
        {
          api: "api2",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test2",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "https://test",
                  tokenUrl: "https://test",
                  scopes: {
                    mockedScopes: "mockedScopes",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });

    vi.spyOn(mockedDriverContext.ui, "confirm").mockReturnValue(
      err(new UserError("source", "userCancelled", "Cancel by user"))
    );
    const args: UpdateOauthArgs = {
      name: "test2",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      targetAudience: "HomeTenant",
      applicableToApps: "SpecificApp",
      configurationId: "mockedRegistrationId",
    };

    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("userCancelled");
    }
  });

  it("should throw error if missing name", async () => {
    const args: any = {
      name: "",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      configurationId: "mockedRegistrationId",
    };
    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
    }
  });

  it("should throw error if isPKCEEnabled is not boolean", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
      isPKCEEnabled: "invalid",
      identityProvider: "Custom",
      configurationId: "mockedRegistrationId",
    };
    vi.spyOn(oauthUtility, "getAuthInfo").mockResolvedValue({} as any);
    vi.spyOn(teamsGraphClient, "getOauthRegistrationById").mockResolvedValue(
      ok({
        identityProvider: "Custom",
      }) as any
    );

    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message).to.include("isPKCEEnabled");
    }
  });

  it("should throw error if appId is missing when applicableToApps is SpecificApp", async () => {
    const args: any = {
      name: "test",
      applicableToApps: "SpecificApp",
      configurationId: "mockedRegistrationId",
    };
    vi.spyOn(oauthUtility, "getAuthInfo").mockResolvedValue({} as any);
    vi.spyOn(teamsGraphClient, "getOauthRegistrationById").mockResolvedValue(ok({}) as any);

    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message).to.include("appId");
    }
  });

  it("should throw error if secret is not string", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
      isPKCEEnabled: false,
      identityProvider: "Custom",
      clientSecret: 123,
      configurationId: "mockedRegistrationId",
    };
    vi.spyOn(oauthUtility, "getAuthInfo").mockResolvedValue({} as any);
    vi.spyOn(teamsGraphClient, "getOauthRegistrationById").mockResolvedValue(
      ok({
        identityProvider: "Custom",
      }) as any
    );
    vi.spyOn(MockedM365Provider.prototype, "getAccessToken").mockResolvedValue(ok({}) as any);

    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message).to.include("clientSecret");
    }
  });

  it("should throw error if name is too long", async () => {
    const args: any = {
      name: "a".repeat(129),
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      configurationId: "mockedRegistrationId",
    };
    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("OauthNameTooLong");
    }
  });

  it("should throw error if missing appId", async () => {
    const args: any = {
      name: "",
      apiSpecPath: "mockedPath",
      configurationId: "mockedRegistrationId",
    };
    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
    }
  });

  it("should throw error if missing apiSpecPath", async () => {
    const args: any = {
      name: "",
      appId: "mockedAppId",
      configurationId: "mockedRegistrationId",
    };
    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
    }
  });

  it("should throw error if missing registrationId", async () => {
    const args: any = {
      name: "",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
    };
    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
    }
  });

  it("should throw error if invalid applicableToApps and tokenExchangeMethodType", async () => {
    const args: any = {
      name: "name",
      appId: "mockedAppId",
      configurationId: "mockedRegistrationId",
      apiSpecPath: "mockedPath",
      applicableToApps: "test",
      tokenExchangeMethodType: "Unknown",
    };
    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message).to.include("applicableToApps");
      expect(result.result.error.message).to.include("tokenExchangeMethodType");
    }
  });

  it("should throw error if invalid apiSpecPath, appId, baseUrl, authorizationUrl, tokenUrl, scope", async () => {
    const args: any = {
      name: "name",
      configurationId: "mockedRegistrationId",
      applicableToApps: "test",
      tokenExchangeMethodType: "Unknown",

      apiSpecPath: [],
      appId: [],
      baseUrl: [],
      authorizationUrl: [],
      tokenUrl: [],
      scope: [],
    };
    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message).to.include("apiSpecPath");
      expect(result.result.error.message).to.include("appId");
      expect(result.result.error.message).to.include("baseUrl");
      expect(result.result.error.message).to.include("authorizationUrl");
      expect(result.result.error.message).to.include("tokenUrl");
      expect(result.result.error.message).to.include("scope");
    }
  });

  it("should throw error if invalid targetAudience", async () => {
    const args: any = {
      name: "name",
      appId: "mockedAppId",
      configurationId: "mockedRegistrationId",
      apiSpecPath: "mockedPath",
      targetAudience: "test",
    };
    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
    }
  });

  it("should throw error when unhandled error", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(MockedM365Provider.prototype, "getAccessToken").mockImplementation(() => {
      throw new Error("unhandled error");
    });
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "api",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "https://test",
                  tokenUrl: "https://test",
                  scopes: {
                    mockedScopes: "mockedScopes",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
        {
          api: "api2",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test2",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "https://test",
                  tokenUrl: "https://test",
                  scopes: {
                    mockedScopes: "mockedScopes",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });
    const args: UpdateOauthArgs = {
      name: "test2",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      targetAudience: "HomeTenant",
      applicableToApps: "SpecificApp",
      configurationId: "mockedRegistrationId",
    };

    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.source).to.equal("oauthUpdate");
    }
  });

  it("should not update if tokenRefreshEndpoint and scopes are undefined", async () => {
    vi.spyOn(teamsGraphClient, "updateOauthRegistration").mockResolvedValue({
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test2"],
      applicableToApps: OauthRegistrationAppType.SpecificApp,
      targetAudience: OauthRegistrationTargetAudience.HomeTenant,
      m365AppId: "mockedAppId",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      authorizationEndpoint: "mockedAuthorizationEndpoint",
      tokenExchangeEndpoint: "mockedTokenExchangeEndpoint",
      scopes: ["mockedScope"],
      isPKCEEnabled: true,
    });
    vi.spyOn(teamsGraphClient, "getOauthRegistrationById").mockResolvedValue({
      oAuthConfigId: "mockedRegistrationId",
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test"],
      applicableToApps: OauthRegistrationAppType.AnyApp,
      targetAudience: OauthRegistrationTargetAudience.AnyTenant,
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      authorizationEndpoint: "mockedAuthorizationEndpoint",
      tokenExchangeEndpoint: "mockedTokenExchangeEndpoint",
      tokenRefreshEndpoint: "mockedTokenRefreshEndpoint",
      scopes: ["mockedScope"],
      isPKCEEnabled: false,
    });

    vi.spyOn(mockedDriverContext.ui, "confirm").mockImplementation(async (config) => {
      expect((config as ConfirmConfig).title.includes("description")).to.be.true;
      expect((config as ConfirmConfig).title.includes("applicableToApps")).to.be.true;
      expect((config as ConfirmConfig).title.includes("m365AppId")).to.be.true;
      expect((config as ConfirmConfig).title.includes("targetAudience")).to.be.true;
      expect((config as ConfirmConfig).title.includes("isPKCEEnabled")).to.be.true;
      expect((config as ConfirmConfig).title.includes("authorizationEndpoint")).to.be.false;
      expect((config as ConfirmConfig).title.includes("tokenExchangeEndpoint")).to.be.false;
      expect((config as ConfirmConfig).title.includes("tokenRefreshEndpoint")).to.be.false;
      expect((config as ConfirmConfig).title.includes("scopes")).to.be.false;
      return ok({ type: "success", value: true });
    });

    const args: UpdateOauthArgs = {
      name: "test2",
      appId: "mockedAppId",
      targetAudience: "HomeTenant",
      applicableToApps: "SpecificApp",
      configurationId: "mockedRegistrationId",
      isPKCEEnabled: true,
    };

    const result = await updateOauthDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.size).to.equal(0);
      expect(result.summaries.length).to.equal(1);
    }
  });
});
