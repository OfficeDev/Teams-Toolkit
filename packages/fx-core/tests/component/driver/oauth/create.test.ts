// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SpecParser } from "@microsoft/m365-spec-parser";
import { SystemError, err } from "@microsoft/teamsfx-api";
import mockedEnv, { RestoreFn } from "mocked-env";
import { teamsGraphClient } from "../../../../src/client/teamsGraphClient";
import { setTools } from "../../../../src/common/globalVars";
import { CreateOauthDriver } from "../../../../src/component/driver/oauth/create";
import {
  OauthRegistrationAppType,
  OauthRegistrationTargetAudience,
  TokenExchangeMethodType,
} from "../../../../src/component/driver/teamsApp/interfaces/OauthRegistration";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";
import { MockedAzureAccountProvider, MockedM365Provider } from "../../../core/utils";
import { featureFlagManager, FeatureFlags } from "../../../../src";
import { chai, vi } from "vitest";

const expect = chai.expect;

const outputKeys = {
  configurationId: "REGISTRATION_ID",
};
const outputEnvVarNames = new Map<string, string>(Object.entries(outputKeys));

describe("CreateOauthDriver", () => {
  const mockedDriverContext: any = {
    m365TokenProvider: new MockedM365Provider(),
    ui: new MockedUserInteraction(),
  };
  const createOauthDriver = new CreateOauthDriver();

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
    if (envRestore) {
      envRestore();
      envRestore = undefined;
    }
  });

  it("happy path: read clientSecret, refreshurl from input ", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(teamsGraphClient, "createOauthRegistration").mockImplementation(
      async (token, oauthRegistration) => {
        expect(oauthRegistration.clientId).to.equals("mockedClientId");
        expect(oauthRegistration.clientSecret).to.equals("mockedClientSecret");
        expect(oauthRegistration.description).to.equals("test");
        expect(oauthRegistration.authorizationEndpoint).to.equals("mockedAuthorizationUrl");
        expect(oauthRegistration.scopes[0]).to.equals("mockedScope");
        expect(oauthRegistration.targetUrlsShouldStartWith[0]).to.equals("https://test");
        expect(oauthRegistration.tokenExchangeEndpoint).to.equals("mockedTokenUrl");
        expect(oauthRegistration.tokenRefreshEndpoint).to.equal("mockedRefreshUrl");
        expect(oauthRegistration.applicableToApps).to.equals(OauthRegistrationAppType.AnyApp);
        expect(oauthRegistration.isPKCEEnabled).to.be.false;
        expect(oauthRegistration.targetAudience).to.equals(
          OauthRegistrationTargetAudience.AnyTenant
        );
        expect(oauthRegistration.m365AppId).to.equal("");
        expect(oauthRegistration.identityProvider).to.equal("Custom");
        return {
          configurationRegistrationId: {
            oAuthConfigId: "mockedRegistrationId",
          },
          resourceIdentifierUri: "mockedResourceIdentifierUri",
        };
      }
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
                  authorizationUrl: "mockedAuthorizationUrl",
                  tokenUrl: "mockedTokenUrl",
                  scopes: {
                    mockedScope: "description for mocked scope",
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

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
      isPKCEEnabled: false,
      identityProvider: "Custom",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.get(outputKeys.configurationId)).to.equal("mockedRegistrationId");
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: use parameters for auth info without apiSpecPath", async () => {
    vi.spyOn(teamsGraphClient, "createOauthRegistration").mockImplementation(
      async (token, oauthRegistration) => {
        expect(oauthRegistration.clientId).to.equals("mockedClientId");
        expect(oauthRegistration.clientSecret).to.equals("mockedClientSecret");
        expect(oauthRegistration.description).to.equals("test");
        expect(oauthRegistration.authorizationEndpoint).to.equals("https://authUrl");
        expect(oauthRegistration.scopes[0]).to.equals("scope1");
        expect(oauthRegistration.targetUrlsShouldStartWith[0]).to.equals("https://test");
        expect(oauthRegistration.tokenExchangeEndpoint).to.equals("https://tokenUrl");
        expect(oauthRegistration.tokenRefreshEndpoint).to.equal("https://refreshUrl");
        expect(oauthRegistration.applicableToApps).to.equals(OauthRegistrationAppType.AnyApp);
        expect(oauthRegistration.isPKCEEnabled).to.be.false;
        expect(oauthRegistration.targetAudience).to.equals(
          OauthRegistrationTargetAudience.AnyTenant
        );
        expect(oauthRegistration.m365AppId).to.equal("");
        expect(oauthRegistration.identityProvider).to.equal("Custom");
        return {
          configurationRegistrationId: {
            oAuthConfigId: "mockedRegistrationId",
          },
          resourceIdentifierUri: "mockedResourceIdentifierUri",
        };
      }
    );

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "https://refreshUrl",
      isPKCEEnabled: false,
      identityProvider: "Custom",

      baseUrl: "https://test",
      authorizationUrl: "https://authUrl",
      tokenUrl: "https://tokenUrl",
      scope: "scope1,scope2",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.get(outputKeys.configurationId)).to.equal("mockedRegistrationId");
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: use parameters for auth info without apiSpecPath, and identityProvider is MicrosoftEntra", async () => {
    vi.spyOn(teamsGraphClient, "createOauthRegistration").mockImplementation(
      async (token, oauthRegistration) => {
        expect(oauthRegistration.clientId).to.equals("mockedClientId");
        expect(oauthRegistration.description).to.equals("test");
        expect(oauthRegistration.targetUrlsShouldStartWith[0]).to.equals("https://test");
        expect(oauthRegistration.applicableToApps).to.equals(OauthRegistrationAppType.AnyApp);
        expect(oauthRegistration.targetAudience).to.equals(
          OauthRegistrationTargetAudience.AnyTenant
        );
        expect(oauthRegistration.m365AppId).to.equal("");
        expect(oauthRegistration.identityProvider).to.equal("MicrosoftEntra");
        return {
          configurationRegistrationId: {
            oAuthConfigId: "mockedRegistrationId",
          },
          resourceIdentifierUri: "mockedResourceIdentifierUri",
        };
      }
    );

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      flow: "authorizationCode",
      refreshUrl: "https://refreshUrl",
      identityProvider: "MicrosoftEntra",

      baseUrl: "https://test",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.get(outputKeys.configurationId)).to.equal("mockedRegistrationId");
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: secret is not needed when PKCE enabled", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(teamsGraphClient, "createOauthRegistration").mockImplementation(
      async (token, oauthRegistration) => {
        expect(oauthRegistration.clientId).to.equals("mockedClientId");
        expect(oauthRegistration.description).to.equals("test");
        expect(oauthRegistration.authorizationEndpoint).to.equals("mockedAuthorizationUrl");
        expect(oauthRegistration.scopes[0]).to.equals("mockedScope");
        expect(oauthRegistration.targetUrlsShouldStartWith[0]).to.equals("https://test");
        expect(oauthRegistration.tokenExchangeEndpoint).to.equals("mockedTokenUrl");
        expect(oauthRegistration.tokenRefreshEndpoint).to.equal("refreshUrlInSpec");
        expect(oauthRegistration.applicableToApps).to.equals(OauthRegistrationAppType.AnyApp);
        expect(oauthRegistration.isPKCEEnabled).to.be.true;
        expect(oauthRegistration.targetAudience).to.equals(
          OauthRegistrationTargetAudience.AnyTenant
        );
        expect(oauthRegistration.m365AppId).to.equal("");
        return {
          configurationRegistrationId: {
            oAuthConfigId: "mockedRegistrationId",
          },
          resourceIdentifierUri: "mockedResourceIdentifierUri",
        };
      }
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
                  authorizationUrl: "mockedAuthorizationUrl",
                  tokenUrl: "mockedTokenUrl",
                  refreshUrl: "refreshUrlInSpec",
                  scopes: {
                    mockedScope: "description for mocked scope",
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

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      flow: "authorizationCode",
      isPKCEEnabled: true,
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.get(outputKeys.configurationId)).to.equal("mockedRegistrationId");
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: secret is not needed when identityProvider is MicrosoftEntra", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(teamsGraphClient, "createOauthRegistration").mockImplementation(
      async (token, oauthRegistration) => {
        expect(oauthRegistration.clientId).to.equals("mockedClientId");
        expect(oauthRegistration.description).to.equals("test");
        expect(oauthRegistration.targetUrlsShouldStartWith[0]).to.equals("https://test");
        expect(oauthRegistration.applicableToApps).to.equals(OauthRegistrationAppType.AnyApp);
        expect(oauthRegistration.targetAudience).to.equals(
          OauthRegistrationTargetAudience.AnyTenant
        );
        expect(oauthRegistration.m365AppId).to.equal("");
        expect(oauthRegistration.identityProvider).to.equal("MicrosoftEntra");
        return {
          configurationRegistrationId: {
            oAuthConfigId: "mockedRegistrationId",
          },
          resourceIdentifierUri: "mockedResourceIdentifierUri",
        };
      }
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
                  authorizationUrl:
                    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
                  tokenUrl: "mockedTokenUrl",
                  refreshUrl: "refreshUrlInSpec",
                  scopes: {
                    mockedScope: "description for mocked scope",
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
    const showMessageStub = vi
      .spyOn(MockedUserInteraction.prototype, "showMessage")
      .mockResolvedValue();

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      flow: "authorizationCode",
      identityProvider: "MicrosoftEntra",
    };
    const outputEnvVarNamesTmp = new Map<string, string>(Object.entries(outputKeys));
    outputEnvVarNamesTmp.set("applicationIdUri", "APPLICATION_ID_URI");
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNamesTmp);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.get(outputKeys.configurationId)).to.equal("mockedRegistrationId");
      expect(result.result.value.get("APPLICATION_ID_URI")).to.equal("mockedResourceIdentifierUri");
      expect(result.summaries.length).to.equal(1);
      expect(showMessageStub.mock.calls.length === 1).to.be.true;
    }
  });

  it("happy path: secret is needed when identityProvider is Custom", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(teamsGraphClient, "createOauthRegistration").mockImplementation(
      async (token, oauthRegistration) => {
        expect(oauthRegistration.clientId).to.equals("mockedClientId");
        expect(oauthRegistration.description).to.equals("test");
        expect(oauthRegistration.targetUrlsShouldStartWith[0]).to.equals("https://test");
        expect(oauthRegistration.applicableToApps).to.equals(OauthRegistrationAppType.AnyApp);
        expect(oauthRegistration.targetAudience).to.equals(
          OauthRegistrationTargetAudience.AnyTenant
        );
        expect(oauthRegistration.m365AppId).to.equal("");
        expect(oauthRegistration.identityProvider).to.equal("Custom");
        return {
          configurationRegistrationId: {
            oAuthConfigId: "mockedRegistrationId",
          },
          resourceIdentifierUri: "mockedResourceIdentifierUri",
        };
      }
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
                  authorizationUrl:
                    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
                  tokenUrl: "mockedTokenUrl",
                  refreshUrl: "refreshUrlInSpec",
                  scopes: {
                    mockedScope: "description for mocked scope",
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

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      identityProvider: "Custom",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.get(outputKeys.configurationId)).to.equal("mockedRegistrationId");
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: read clientSecret, refreshurl from input with invalid api", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(teamsGraphClient, "createOauthRegistration").mockImplementation(
      async (token, oauthRegistration) => {
        expect(oauthRegistration.clientId).to.equals("mockedClientId");
        expect(oauthRegistration.clientSecret).to.equals("mockedClientSecret");
        expect(oauthRegistration.description).to.equals("test");
        expect(oauthRegistration.authorizationEndpoint).to.equals("mockedAuthorizationUrl");
        expect(oauthRegistration.scopes[0]).to.equals("mockedScope");
        expect(oauthRegistration.targetUrlsShouldStartWith[0]).to.equals("https://test");
        expect(oauthRegistration.tokenExchangeEndpoint).to.equals("mockedTokenUrl");
        expect(oauthRegistration.tokenRefreshEndpoint).to.equal("mockedRefreshUrl");
        expect(oauthRegistration.applicableToApps).to.equals(OauthRegistrationAppType.AnyApp);
        expect(oauthRegistration.isPKCEEnabled).to.be.false;
        expect(oauthRegistration.targetAudience).to.equals(
          OauthRegistrationTargetAudience.AnyTenant
        );
        expect(oauthRegistration.m365AppId).to.equal("");
        expect(oauthRegistration.identityProvider).to.equal("Custom");
        return {
          configurationRegistrationId: {
            oAuthConfigId: "mockedRegistrationId",
          },
          resourceIdentifierUri: "mockedResourceIdentifierUri",
        };
      }
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
                  authorizationUrl: "mockedAuthorizationUrl",
                  tokenUrl: "mockedTokenUrl",
                  scopes: {
                    mockedScope: "description for mocked scope",
                  },
                },
              },
            },
          },
          isValid: false,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
      isPKCEEnabled: false,
      identityProvider: "Custom",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.get(outputKeys.configurationId)).to.equal("mockedRegistrationId");
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("should throw error is identityProvider is Custom but the authorization url is not Microsoft Entra endpoint", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(teamsGraphClient, "createOauthRegistration").mockImplementation(
      async (token, oauthRegistration) => {
        expect(oauthRegistration.clientId).to.equals("mockedClientId");
        expect(oauthRegistration.description).to.equals("test");
        expect(oauthRegistration.targetUrlsShouldStartWith[0]).to.equals("https://test");
        expect(oauthRegistration.applicableToApps).to.equals(OauthRegistrationAppType.AnyApp);
        expect(oauthRegistration.targetAudience).to.equals(
          OauthRegistrationTargetAudience.AnyTenant
        );
        expect(oauthRegistration.m365AppId).to.equal("");
        expect(oauthRegistration.identityProvider).to.equal("MicrosoftEntra");
        return {
          configurationRegistrationId: {
            oAuthConfigId: "mockedRegistrationId",
          },
          resourceIdentifierUri: "mockedResourceIdentifierUri",
        };
      }
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
                  authorizationUrl: "https://not.microsoft.entra.url/authorize",
                  tokenUrl: "mockedTokenUrl",
                  refreshUrl: "refreshUrlInSpec",
                  scopes: {
                    mockedScope: "description for mocked scope",
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

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      flow: "authorizationCode",
      identityProvider: "MicrosoftEntra",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("OauthIdentityProviderInvalid");
    }
  });

  it("happy path: read refreshurl from input, client and clientSecret from env", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(teamsGraphClient, "createOauthRegistration").mockImplementation(
      async (token, oauthRegistration) => {
        expect(oauthRegistration.clientId).to.equals("mockedClientId");
        expect(oauthRegistration.clientSecret).to.equals("mockedClientSecret");
        expect(oauthRegistration.description).to.equals("test");
        expect(oauthRegistration.authorizationEndpoint).to.equals("mockedAuthorizationUrl");
        expect(oauthRegistration.scopes[0]).to.equals("mockedScope");
        expect(oauthRegistration.targetUrlsShouldStartWith[0]).to.equals("https://test");
        expect(oauthRegistration.tokenExchangeEndpoint).to.equals("mockedTokenUrl");
        expect(oauthRegistration.tokenRefreshEndpoint).to.equal("mockedRefreshUrl");
        expect(oauthRegistration.applicableToApps).to.equals(OauthRegistrationAppType.AnyApp);
        expect(oauthRegistration.targetAudience).to.equals(
          OauthRegistrationTargetAudience.AnyTenant
        );
        expect(oauthRegistration.m365AppId).to.equal("");
        return {
          configurationRegistrationId: {
            oAuthConfigId: "mockedRegistrationId",
          },
          resourceIdentifierUri: "mockedResourceIdentifierUri",
        };
      }
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
                  authorizationUrl: "mockedAuthorizationUrl",
                  tokenUrl: "mockedTokenUrl",
                  scopes: {
                    mockedScope: "description for mocked scope",
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

    envRestore = mockedEnv({
      ["oauth-client-secret"]: "mockedClientSecret",
      ["oauth-client-id"]: "mockedClientId",
      ["oauth-scope"]: "mockedScope",
    });

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.get(outputKeys.configurationId)).to.equal("mockedRegistrationId");
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: read clientSecret from input and refreshurl from spec", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(teamsGraphClient, "createOauthRegistration").mockImplementation(
      async (token, oauthRegistration) => {
        expect(oauthRegistration.clientId).to.equals("mockedClientId");
        expect(oauthRegistration.clientSecret).to.equals("mockedClientSecret");
        expect(oauthRegistration.description).to.equals("test");
        expect(oauthRegistration.authorizationEndpoint).to.equals("mockedAuthorizationUrl");
        expect(oauthRegistration.scopes[0]).to.equals("mockedScope");
        expect(oauthRegistration.targetUrlsShouldStartWith[0]).to.equals("https://test");
        expect(oauthRegistration.tokenExchangeEndpoint).to.equals("mockedTokenUrl");
        expect(oauthRegistration.tokenRefreshEndpoint).to.equal("mockedRefreshUrl");
        expect(oauthRegistration.applicableToApps).to.equals(OauthRegistrationAppType.AnyApp);
        expect(oauthRegistration.targetAudience).to.equals(
          OauthRegistrationTargetAudience.AnyTenant
        );
        expect(oauthRegistration.m365AppId).to.equal("");
        return {
          configurationRegistrationId: {
            oAuthConfigId: "mockedRegistrationId",
          },
          resourceIdentifierUri: "mockedResourceIdentifierUri",
        };
      }
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
                  authorizationUrl: "mockedAuthorizationUrl",
                  tokenUrl: "mockedTokenUrl",
                  refreshUrl: "mockedRefreshUrl",
                  scopes: {
                    mockedScope: "description for mocked scope",
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

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.get(outputKeys.configurationId)).to.equal("mockedRegistrationId");
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: read applicableToApps, tokenExchangeMethodType, targetAudience from input", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(teamsGraphClient, "createOauthRegistration").mockImplementation(
      async (token, oauthRegistration) => {
        expect(oauthRegistration.clientId).to.equals("mockedClientId");
        expect(oauthRegistration.clientSecret).to.equals("mockedClientSecret");
        expect(oauthRegistration.description).to.equals("test");
        expect(oauthRegistration.authorizationEndpoint).to.equals("mockedAuthorizationUrl");
        expect(oauthRegistration.scopes[0]).to.equals("mockedScope");
        expect(oauthRegistration.targetUrlsShouldStartWith[0]).to.equals("https://test");
        expect(oauthRegistration.tokenExchangeEndpoint).to.equals("mockedTokenUrl");
        expect(oauthRegistration.tokenRefreshEndpoint).to.equal("mockedRefreshUrl");
        expect(oauthRegistration.applicableToApps).to.equals(OauthRegistrationAppType.SpecificApp);
        expect(oauthRegistration.m365AppId).to.equals("mockedAppId");
        expect(oauthRegistration.tokenExchangeMethodType).to.equals("PostRequestBody");
        expect(oauthRegistration.targetAudience).to.equals(
          OauthRegistrationTargetAudience.HomeTenant
        );
        return {
          configurationRegistrationId: {
            oAuthConfigId: "mockedRegistrationId",
          },
          resourceIdentifierUri: "mockedResourceIdentifierUri",
        };
      }
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
                  authorizationUrl: "mockedAuthorizationUrl",
                  tokenUrl: "mockedTokenUrl",
                  scopes: {
                    mockedScope: "description for mocked scope",
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

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
      applicableToApps: "SpecificApp",
      targetAudience: "HomeTenant",
      tokenExchangeMethodType: "PostRequestBody",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.get(outputKeys.configurationId)).to.equal("mockedRegistrationId");
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: registration id exists in env", async () => {
    vi.spyOn(teamsGraphClient, "getOauthRegistrationById").mockResolvedValue({
      oAuthConfigId: "mockedId",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      authorizationEndpoint: "mockedAuthorizationEndpoint",
      tokenExchangeEndpoint: "mockedTokenEndpoint",
      scopes: ["mockedScopes"],
      applicableToApps: OauthRegistrationAppType.AnyApp,
      tokenExchangeMethodType: TokenExchangeMethodType.BasicAuthorizationHeader,
      targetUrlsShouldStartWith: ["mockedDomain"],
    });
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
      tokenExchangeMethodType: "BasicAuthorizationHeader",
    };
    envRestore = mockedEnv({
      [outputKeys.configurationId]: "existing value",
    });
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.size).to.equal(0);
      expect(result.summaries.length).to.equal(0);
    }
  });

  it("should throw error when empty outputEnvVarNames", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, undefined);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("OutputEnvironmentVariableUndefined");
    }
  });

  it("should throw error if isPKCEEnabled is not boolean", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
      isPKCEEnabled: "invalid",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message).to.include("isPKCEEnabled");
    }
  });

  it("should throw error if identityProvider is not string", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      flow: "authorizationCode",
      identityProvider: 123,
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message).to.include("identityProvider");
    }
  });

  it("should throw error if invalid identityProvider", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      flow: "authorizationCode",
      identityProvider: "abc",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message).to.include("identityProvider");
    }
  });

  it("should throw error when failed to get app studio token", async () => {
    vi.spyOn(MockedM365Provider.prototype, "getAccessToken").mockResolvedValue(
      err(new SystemError("source", "name", "message"))
    );
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("name");
    }
  });

  it("should show warning if registration id exists and failed to get Oauth registration", async () => {
    vi.spyOn(teamsGraphClient, "getOauthRegistrationById").mockImplementation(() => {
      throw new SystemError("source", "name", "message");
    });

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
    };
    envRestore = mockedEnv({
      [outputKeys.configurationId]: "existing value",
    });
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
  });

  it("should throw error if missing name", async () => {
    const args: any = {
      name: "",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
    }
  });

  it("should throw error if name is too long", async () => {
    const args: any = {
      name: "a".repeat(513),
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("OauthNameTooLong");
    }
  });

  it("should throw error if missing appId", async () => {
    const args: any = {
      name: "test",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
    }
  });

  it("should throw error if missing clientId", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
    }
  });

  it("should throw error if missing flow", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      refreshUrl: "mockedRefreshUrl",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
    }
  });

  it("should throw error if missing apiSpecPath", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
    }
  });

  it("should throw error if invalid clientSecret", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "a",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
    }
  });

  it("should throw error if domain > 1", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
    };

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
                  authorizationUrl: "mockedAuthorizationUrl",
                  tokenUrl: "mockedTokenUrl",
                  scopes: {
                    mockedScope: "description for mocked scope",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
        {
          api: "api",
          server: "https://test2",
          operationId: "get",
          auth: {
            name: "test",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "mockedAuthorizationUrl",
                  tokenUrl: "mockedTokenUrl",
                  scopes: {
                    mockedScope: "description for mocked scope",
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

    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("OauthDomainInvalid");
    }
  });

  it("should throw error if list api is empty and domain = 0", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [],
      validAPICount: 0,
      allAPICount: 1,
    });
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
      applicableToApps: "SpecificApp",
      targetAudience: "HomeTenant",
    };

    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("OauthAuthMissingInSpec");
    }
  });

  it("should throw error if list api contains no auth and domain = 0", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "api",
          server: "https://test",
          operationId: "get",
          isValid: true,
          reason: [],
        },
      ],
      validAPICount: 0,
      allAPICount: 1,
    });
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
      applicableToApps: "SpecificApp",
      targetAudience: "HomeTenant",
    };

    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("OauthAuthMissingInSpec");
    }
  });

  it("should throw error if list api contains auth but server info is null ", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "api",
          server: "",
          operationId: "get",
          auth: {
            name: "test",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "mockedAuthorizationUrl",
                  tokenUrl: "mockedTokenUrl",
                  scopes: {
                    mockedScope: "description for mocked scope",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
        {
          api: "api",
          server: "https://test",
          operationId: "get2",
          auth: {
            name: "test2",
            authScheme: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  authorizationUrl: "mockedAuthorizationUrl2",
                  tokenUrl: "mockedTokenUrl2",
                  scopes: {
                    mockedScope2: "description for mocked scope",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
      ],
      validAPICount: 0,
      allAPICount: 1,
    });
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
      applicableToApps: "SpecificApp",
      targetAudience: "HomeTenant",
    };

    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("OauthFailedToGetDomain");
    }
  });

  it("should throw error if multiple auth schema", async () => {
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
                  authorizationUrl: "mockedAuthorizationUrl",
                  tokenUrl: "mockedTokenUrl",
                  scopes: {
                    mockedScope: "description for mocked scope",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
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
                  authorizationUrl: "mockedAuthorizationUrl2",
                  tokenUrl: "mockedTokenUrl2",
                  scopes: {
                    mockedScope2: "description for mocked scope",
                  },
                },
              },
            },
          },
          isValid: true,
          reason: [],
        },
      ],
      validAPICount: 0,
      allAPICount: 1,
    });
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
      applicableToApps: "SpecificApp",
      targetAudience: "HomeTenant",
    };

    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("OauthAuthInfoInvalid");
    }
  });

  it("should throw error if failed to create Oauth registration", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(teamsGraphClient, "createOauthRegistration").mockImplementation(() => {
      throw new SystemError("source", "name", "message");
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
                  authorizationUrl: "mockedAuthorizationUrl",
                  tokenUrl: "mockedTokenUrl",
                  scopes: {
                    mockedScope: "description for mocked scope",
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

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("name");
    }
  });

  it("should throw unhandled error if error is not SystemError or UserError", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(teamsGraphClient, "createOauthRegistration").mockImplementation(() => {
      throw new Error("error");
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
                  authorizationUrl: "mockedAuthorizationUrl",
                  tokenUrl: "mockedTokenUrl",
                  scopes: {
                    mockedScope: "description for mocked scope",
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

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.source).to.equal("oauthRegister");
    }
  });

  it("should throw error if invalid applicableToApps, targetAudience and tokenExchangeMethodType", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
      applicableToApps: "specificapp",
      targetAudience: "hometenant",
      tokenExchangeMethodType: "Unknown",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message.includes("applicableToApps")).to.be.true;
      expect(result.result.error.message.includes("targetAudience")).to.be.true;
      expect(result.result.error.message.includes("tokenExchangeMethodType")).to.be.true;
    }
  });

  it("should throw error if when no apiSpecPath, and baseUrl, authorizationUrl, tokenUrl and scope is not string", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
      applicableToApps: "SpecificApp",
      targetAudience: "HomeTenant",
      tokenExchangeMethodType: "PostRequestBody",

      baseUrl: [],
      authorizationUrl: [],
      tokenUrl: [],
      scope: [],
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message.includes("baseUrl")).to.be.true;
      expect(result.result.error.message.includes("authorizationUrl")).to.be.true;
      expect(result.result.error.message.includes("tokenUrl")).to.be.true;
      expect(result.result.error.message.includes("scope")).to.be.true;
    }
  });

  it("should throw error if when no apiSpecPath, and baseUrl, authorizationUrl, tokenUrl and scope is not valid https url", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
      applicableToApps: "SpecificApp",
      targetAudience: "HomeTenant",
      tokenExchangeMethodType: "PostRequestBody",

      baseUrl: "invalid",
      authorizationUrl: "invalid",
      tokenUrl: "http://invalid",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message.includes("baseUrl")).to.be.true;
      expect(result.result.error.message.includes("authorizationUrl")).to.be.true;
      expect(result.result.error.message.includes("tokenUrl")).to.be.true;
    }
  });

  it("should throw error if when no apiSpecPath, and missing baseUrl, authorizationUrl, tokenUrl and scope", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
      applicableToApps: "SpecificApp",
      targetAudience: "HomeTenant",
      tokenExchangeMethodType: "PostRequestBody",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message.includes("baseUrl")).to.be.true;
      expect(result.result.error.message.includes("authorizationUrl")).to.be.true;
      expect(result.result.error.message.includes("tokenUrl")).to.be.true;
      expect(result.result.error.message.includes("apiSpecPath")).to.be.true;
    }
  });

  it("should throw error if when no apiSpecPath, identityProvider is MicrosoftEntra, and missing baseUrl", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "authorizationCode",
      refreshUrl: "mockedRefreshUrl",
      applicableToApps: "SpecificApp",
      targetAudience: "HomeTenant",
      identityProvider: "MicrosoftEntra",
      tokenExchangeMethodType: "PostRequestBody",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message.includes("baseUrl")).to.be.true;
      expect(result.result.error.message.includes("apiSpecPath")).to.be.true;
    }
  });

  it("should throw error if invalid flow", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      clientId: "mockedClientId",
      clientSecret: "mockedClientSecret",
      flow: "test",
    };
    const result = await createOauthDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message.includes("flow")).to.be.true;
    }
  });
});
