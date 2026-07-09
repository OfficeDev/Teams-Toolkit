// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SpecParser } from "@microsoft/m365-spec-parser";
import { err, SystemError } from "@microsoft/teamsfx-api";
import mockedEnv, { RestoreFn } from "mocked-env";
import { expect, vi } from "vitest";
import { teamsGraphClient } from "../../../../src/client/teamsGraphClient";
import { featureFlagManager } from "../../../../src/common/featureFlags";
import { setTools } from "../../../../src/common/globalVars";
import { CreateApiKeyDriver } from "../../../../src/component/driver/apiKey/create";
import {
  ApiSecretRegistrationAppType,
  ApiSecretRegistrationTargetAudience,
} from "../../../../src/component/driver/teamsApp/interfaces/ApiSecretRegistration";
import { MockedAzureAccountProvider, MockedM365Provider } from "../../../core/utils";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";

const outputKeys = {
  registrationId: "REGISTRATION_ID",
};

const outputEnvVarNames = new Map<string, string>(Object.entries(outputKeys));

describe("CreateApiKeyDriver", () => {
  const mockedDriverContext: any = {
    m365TokenProvider: new MockedM365Provider(),
    ui: new MockedUserInteraction(),
  };
  const createApiKeyDriver = new CreateApiKeyDriver();

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

  it("happy path: create registraionid, read domain from api spec, clientSecret from input", async () => {
    vi.spyOn(teamsGraphClient, "createApiKeyRegistration").mockResolvedValue({
      id: "mockedRegistrationId",
      clientSecrets: [],
      targetUrlsShouldStartWith: [],
      applicableToApps: ApiSecretRegistrationAppType.SpecificApp,
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
              type: "apiKey",
              in: "header",
              name: "test",
            },
          },
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });

    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      primaryClientSecret: "mockedClientSecret",
      apiSpecPath: "mockedPath",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.get(outputKeys.registrationId)).to.equal("mockedRegistrationId");
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: create registraionid, read domain from baseURL, clientSecret from input", async () => {
    vi.spyOn(teamsGraphClient, "createApiKeyRegistration").mockResolvedValue({
      id: "mockedRegistrationId",
      clientSecrets: [],
      targetUrlsShouldStartWith: [],
      applicableToApps: ApiSecretRegistrationAppType.SpecificApp,
    });

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      primaryClientSecret: "mockedClientSecret",
      apiSpecPath: "mockedPath",
      baseUrl: "https://test",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.get(outputKeys.registrationId)).to.equal("mockedRegistrationId");
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("should throw error if baseURL is not a valid https URL", async () => {
    vi.spyOn(teamsGraphClient, "createApiKeyRegistration").mockResolvedValue({
      id: "mockedRegistrationId",
      clientSecrets: [],
      targetUrlsShouldStartWith: [],
      applicableToApps: ApiSecretRegistrationAppType.SpecificApp,
    });

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      primaryClientSecret: "mockedClientSecret",
      apiSpecPath: "mockedPath",
      baseUrl: "http://test",
    };
    const result1 = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result1.result.isErr()).to.be.true;
    if (result1.result.isErr()) {
      expect(result1.result.error.name).to.equal("InvalidActionInputError");
      expect(result1.result.error.message).contains("baseUrl");
    }

    args.baseUrl = "invalidURL";
    const result2 = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result2.result.isErr()).to.be.true;
    if (result2.result.isErr()) {
      expect(result2.result.error.name).to.equal("InvalidActionInputError");
      expect(result2.result.error.message).contains("baseUrl");
    }
  });

  it("should throw error if baseURL and apiSpecPath are both missing", async () => {
    vi.spyOn(teamsGraphClient, "createApiKeyRegistration").mockResolvedValue({
      id: "mockedRegistrationId",
      clientSecrets: [],
      targetUrlsShouldStartWith: [],
      applicableToApps: ApiSecretRegistrationAppType.SpecificApp,
    });

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      primaryClientSecret: "mockedClientSecret",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message).contains("baseUrl");
      expect(result.result.error.message).contains("apiSpecPath");
    }
  });

  it("happy path: create registraionid, read domain from api spec, clientSecret and secondaryClientSecret from input", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(teamsGraphClient, "createApiKeyRegistration").mockResolvedValue({
      id: "mockedRegistrationId",
      clientSecrets: [],
      targetUrlsShouldStartWith: [],
      applicableToApps: ApiSecretRegistrationAppType.SpecificApp,
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
              type: "http",
              scheme: "bearer",
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
      primaryClientSecret: "mockedClientSecret",
      secondaryClientSecret: "mockedSecondaryClientSecret",
      apiSpecPath: "mockedPath",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.get(outputKeys.registrationId)).to.equal("mockedRegistrationId");
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: create registraionid and read domain from env and secret from env", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(teamsGraphClient, "createApiKeyRegistration").mockResolvedValue({
      id: "mockedRegistrationId",
      clientSecrets: [],
      targetUrlsShouldStartWith: [],
      applicableToApps: ApiSecretRegistrationAppType.SpecificApp,
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
              type: "http",
              scheme: "bearer",
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
      ["api-key"]: "existingvalue",
    });
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.get(outputKeys.registrationId)).to.equal("mockedRegistrationId");
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: registration id exists in env", async () => {
    vi.spyOn(teamsGraphClient, "getApiKeyRegistrationById").mockResolvedValue({
      id: "mockedRegistrationId",
      clientSecrets: [],
      targetUrlsShouldStartWith: [],
      applicableToApps: ApiSecretRegistrationAppType.SpecificApp,
    });

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      primaryClientSecret: "mockedClientSecret",
      apiSpecPath: "mockedPath",
    };
    envRestore = mockedEnv({
      [outputKeys.registrationId]: "existing value",
    });
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.size).to.equal(0);
      expect(result.summaries.length).to.equal(0);
    }
  });

  it("happy path: create registrationid, read applicableToApps and targetAudience from input", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(teamsGraphClient, "createApiKeyRegistration").mockImplementation(
      async (token, apiKey) => {
        expect(apiKey.targetAudience).equals(ApiSecretRegistrationTargetAudience.HomeTenant);
        expect(apiKey.specificAppId).equals("mockedAppId");
        expect(apiKey.applicableToApps).equals(ApiSecretRegistrationAppType.SpecificApp);
        return {
          id: "mockedRegistrationId",
          clientSecrets: [],
          targetUrlsShouldStartWith: [],
          applicableToApps: ApiSecretRegistrationAppType.AnyApp,
          targetAudience: ApiSecretRegistrationTargetAudience.AnyTenant,
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
              type: "http",
              scheme: "bearer",
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
      primaryClientSecret: "mockedClientSecret",
      apiSpecPath: "mockedPath",
      applicableToApps: "SpecificApp",
      targetAudience: "HomeTenant",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.get(outputKeys.registrationId)).to.equal("mockedRegistrationId");
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: create registraionid, read domain from api spec, clientSecret from input with invalid api", async () => {
    vi.spyOn(teamsGraphClient, "createApiKeyRegistration").mockResolvedValue({
      id: "mockedRegistrationId",
      clientSecrets: [],
      targetUrlsShouldStartWith: [],
      applicableToApps: ApiSecretRegistrationAppType.SpecificApp,
    });
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "api",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test",
            authScheme: {
              type: "http",
              scheme: "bearer",
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
      primaryClientSecret: "mockedClientSecret",
      apiSpecPath: "mockedPath",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.get(outputKeys.registrationId)).to.equal("mockedRegistrationId");
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("should throw error when empty outputEnvVarNames", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      primaryClientSecret: "mockedClientSecret",
      apiSpecPath: "mockedPath",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, undefined);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("OutputEnvironmentVariableUndefined");
    }
  });

  it("should throw error when failed to get app studio token", async () => {
    vi.spyOn(MockedM365Provider.prototype, "getAccessToken").mockResolvedValue(
      err(new SystemError("source", "name", "message"))
    );
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      primaryClientSecret: "mockedClientSecret",
      apiSpecPath: "mockedPath",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("name");
    }
  });

  it("should show warning if registration id exists and failed to get API key", async () => {
    vi.spyOn(teamsGraphClient, "getApiKeyRegistrationById").mockImplementation(() => {
      throw new SystemError("source", "name", "message");
    });

    const args: any = {
      name: "test",
      appId: "mockedAppId",
      primaryClientSecret: "mockedClientSecret",
      apiSpecPath: "mockedPath",
    };
    envRestore = mockedEnv({
      [outputKeys.registrationId]: "existing value",
    });
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
  });

  it("should throw error if missing name", async () => {
    const args: any = {
      name: "",
      appId: "mockedAppId",
      primaryClientSecret: "mockedClientSecret",
      apiSpecPath: "mockedPath",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
    }
  });

  it("should throw error if name is too long", async () => {
    const args: any = {
      name: "a".repeat(513),
      appId: "mockedAppId",
      primaryClientSecret: "mockedClientSecret",
      apiSpecPath: "mockedPath",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("ApiKeyNameTooLong");
    }
  });

  it("should throw error if missing appId", async () => {
    const args: any = {
      name: "test",
      appId: "",
      primaryClientSecret: "mockedClientSecret",
      apiSpecPath: "mockedPath",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
    }
  });

  it("should throw error if invalid clientSecret", async () => {
    const args: any = {
      name: "test",
      appId: "",
      primaryClientSecret: "secret",
      apiSpecPath: "mockedPath",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("ApiKeyClientSecretInvalid");
    }
  });

  it("should throw error if clientSecret equals space when from scratch", async () => {
    const args: any = {
      name: "test",
      appId: "",
      primaryClientSecret: " ",
      apiSpecPath: "mockedPath",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("apiKeyFromScratchClientSecretInvalid");
    }
  });

  it("should throw error if invalid secondaryClientSecret", async () => {
    const args: any = {
      name: "test",
      appId: "",
      primaryClientSecret: "mockedClientSecret",
      secondaryClientSecret: "secret",
      apiSpecPath: "mockedPath",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("ApiKeyClientSecretInvalid");
    }
  });

  it("should throw error if missing apiSpecPath", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      primaryClientSecret: "mockedClientSecret",
      apiSpecPath: "",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
    }
  });

  it("should throw error if domain > 1", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      primaryClientSecret: "mockedSecret",
      apiSpecPath: "mockedPath",
    };
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "api",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test",
            authScheme: {
              type: "http",
              scheme: "bearer",
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
              type: "http",
              scheme: "bearer",
            },
          },
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 2,
      validAPICount: 2,
    });

    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("ApiKeyDomainInvalid");
    }
  });

  it("should throw error if list api is empty and domain = 0", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      primaryClientSecret: "mockedSecret",
      apiSpecPath: "mockedPath",
    };
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [],
      validAPICount: 0,
      allAPICount: 1,
    });
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("ApiKeyAuthMissingInSpec");
    }
  });

  it("should throw error if list api contains no auth and domain = 0", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      primaryClientSecret: "mockedSecret",
      apiSpecPath: "mockedPath",
    };
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
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
      validAPICount: 1,
      allAPICount: 1,
    });
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("ApiKeyAuthMissingInSpec");
    }
  });

  it("should throw error if list api contains unsupported auth and domain = 0", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      primaryClientSecret: "mockedSecret",
      apiSpecPath: "mockedPath",
    };
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "api1",
          server: "https://test",
          operationId: "get1",
          auth: {
            name: "test1",
            authScheme: {
              type: "http",
              scheme: "bearer",
            },
          },
          isValid: true,
          reason: [],
        },
        {
          api: "api2",
          server: "https://test",
          operationId: "get2",
          auth: {
            name: "test",
            authScheme: {
              type: "http",
              scheme: "basic",
            },
          },
          isValid: true,
          reason: [],
        },
        {
          api: "api3",
          server: "https://test",
          operationId: "get3",
          auth: {
            name: "test1",
            authScheme: {
              type: "apiKey",
              in: "header",
              name: "test1",
            },
          },
          isValid: true,
          reason: [],
        },
      ],
      validAPICount: 3,
      allAPICount: 3,
    });
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("ApiKeyAuthMissingInSpec");
    }
  });

  it("should throw error if list api contains auth but server info is null", async () => {
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      primaryClientSecret: "mockedSecret",
      apiSpecPath: "mockedPath",
    };
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "api1",
          server: "https://test",
          operationId: "get1",
          auth: {
            name: "test1",
            authScheme: {
              type: "http",
              scheme: "bearer",
            },
          },
          isValid: true,
          reason: [],
        },
        {
          api: "api2",
          server: "",
          operationId: "get2",
          auth: {
            name: "test",
            authScheme: {
              type: "http",
              scheme: "bearer",
            },
          },
          isValid: true,
          reason: [],
        },
        {
          api: "api3",
          server: "https://test",
          operationId: "get3",
          auth: {
            name: "test1",
            authScheme: {
              type: "apiKey",
              in: "header",
              name: "test1",
            },
          },
          isValid: true,
          reason: [],
        },
      ],
      validAPICount: 3,
      allAPICount: 3,
    });
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("ApiKeyFailedToGetDomain");
    }
  });

  it("should throw error if failed to create API key", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(teamsGraphClient, "createApiKeyRegistration").mockImplementation(() => {
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
              type: "http",
              scheme: "bearer",
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
      primaryClientSecret: "mockedClientSecret, mockedClientSecret2",
      apiSpecPath: "mockedPath",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("name");
    }
  });

  it("should throw unhandled error if error is not SystemError or UserError", async () => {
    vi.spyOn(MockedM365Provider.prototype, "getAccessToken").mockImplementation(() => {
      throw new Error("unhandled error");
    });
    const args: any = {
      name: "test",
      appId: "mockedAppId",
      primaryClientSecret: "mockedClientSecret, mockedClientSecret2",
      apiSpecPath: "mockedPath",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.source).to.equal("apiKeyRegister");
    }
  });

  it("should throw error if invalid applicableToApps and targetAudience", async () => {
    vi.spyOn(teamsGraphClient, "createApiKeyRegistration").mockResolvedValue({
      id: "mockedRegistrationId",
      clientSecrets: [],
      targetUrlsShouldStartWith: [],
      applicableToApps: ApiSecretRegistrationAppType.AnyApp,
      targetAudience: ApiSecretRegistrationTargetAudience.AnyTenant,
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
              type: "http",
              scheme: "bearer",
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
      primaryClientSecret: "mockedClientSecret",
      apiSpecPath: "mockedPath",
      applicableToApps: "specificapp",
      targetAudience: "hometenant",
    };
    const result = await createApiKeyDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message.includes("applicableToApps")).to.be.true;
      expect(result.result.error.message.includes("targetAudience")).to.be.true;
    }
  });

  it("should throw error if user cancel", async () => {
    expect(createApiKeyDriver.execute).to.be.a("function");
  });
});
