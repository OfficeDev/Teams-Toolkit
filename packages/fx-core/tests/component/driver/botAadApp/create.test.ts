// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { err, ok, UserError } from "@microsoft/teamsfx-api";
import mockedEnv, { RestoreFn } from "mocked-env";
import { chai, vi } from "vitest";
import {
  HttpClientError,
  HttpServerError,
  InvalidActionInputError,
  UnhandledError,
} from "../../../../src";
import { AadAppClient } from "../../../../src/client/aadAppClient";
import { AadAppNameTooLongError } from "../../../../src/component/driver/aad/error/aadAppNameTooLongError";
import { ClientSecretNotAllowedError } from "../../../../src/component/driver/aad/error/clientSecretNotAllowedError";
import { SignInAudienceNotAllowedError } from "../../../../src/component/driver/aad/error/signInAudienceNotAllowedError";
import { AADApplication } from "../../../../src/component/driver/aad/interface/AADApplication";
import { CreateBotAadAppDriver } from "../../../../src/component/driver/botAadApp/create";
import { OutputEnvironmentVariableUndefinedError } from "../../../../src/component/driver/error/outputEnvironmentVariableUndefinedError";
import { MockedM365Provider } from "../../../core/utils";
import { MockedLogProvider, MockedTelemetryReporter } from "../../../plugins/solution/util";

const expect = chai.expect;

const outputKeys = {
  botId: "BOT_ID",
  botPassword: "SECRET_BOT_PASSWORD",
};

const outputEnvVarNames = new Map<string, string>(Object.entries(outputKeys));

describe("botAadAppCreate", async () => {
  const expectedObjectId = "00000000-0000-0000-0000-000000000000";
  const expectedClientId = "00000000-0000-0000-0000-111111111111";
  const expectedDisplayName = "AAD app name";
  const expectedSecretText = "fake secret";
  const createBotAadAppDriver = new CreateBotAadAppDriver();
  const mockedDriverContext: any = {
    m365TokenProvider: new MockedM365Provider(),
    telemetryReporter: new MockedTelemetryReporter(),
    logProvider: new MockedLogProvider(),
  };

  let envRestore: RestoreFn | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
    if (envRestore) {
      envRestore();
      envRestore = undefined;
    }
  });

  it("should throw error if argument property is missing", async () => {
    const args: any = {};
    try {
      await createBotAadAppDriver.handler(args, mockedDriverContext, outputEnvVarNames);
      expect.fail("should have thrown");
    } catch (e: any) {
      expect(e instanceof InvalidActionInputError).to.be.true;
    }
  });

  it("should throw error if argument property is invalid", async () => {
    const args: any = {
      name: "",
    };
    try {
      await createBotAadAppDriver.handler(args, mockedDriverContext, outputEnvVarNames);
      expect.fail("should have thrown");
    } catch (e: any) {
      expect(e instanceof InvalidActionInputError).to.be.true;
    }
  });

  it("should throw error if Microsoft Entra app name exceeds 120 characters", async () => {
    const invalidAppName = "a".repeat(121);
    const args: any = {
      name: invalidAppName,
    };
    const result = await createBotAadAppDriver.execute(
      args,
      mockedDriverContext,
      outputEnvVarNames
    );
    expect(result.result.isErr()).to.be.true;
    expect(result.result._unsafeUnwrapErr()).is.instanceOf(AadAppNameTooLongError);
  });

  it("should throw error if outputEnvVarNames is undefined", async () => {
    const args: any = {
      name: "test",
    };

    try {
      await createBotAadAppDriver.handler(args, mockedDriverContext);
      expect.fail("should have thrown");
    } catch (e: any) {
      expect(e instanceof OutputEnvironmentVariableUndefinedError).to.be.true;
    }
  });

  it("happy path with handler", async () => {
    const args: any = {
      name: expectedDisplayName,
    };

    vi.spyOn(AadAppClient.prototype, "createAadApp").mockResolvedValue({
      id: expectedObjectId,
      displayName: expectedDisplayName,
      appId: expectedClientId,
    } as AADApplication);

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockResolvedValue(expectedSecretText);

    const result = await createBotAadAppDriver.handler(
      args,
      mockedDriverContext,
      outputEnvVarNames
    );

    console.log(JSON.stringify(result));

    expect(result.output.get(outputKeys.botId)).to.be.equal(expectedClientId);
    expect(result.output.get(outputKeys.botPassword)).to.be.equal(expectedSecretText);
  });

  it("happy path with execute", async () => {
    const args: any = {
      name: expectedDisplayName,
    };

    vi.spyOn(AadAppClient.prototype, "createAadApp").mockResolvedValue({
      id: expectedObjectId,
      displayName: expectedDisplayName,
      appId: expectedClientId,
    } as AADApplication);

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockResolvedValue(expectedSecretText);

    const result = await createBotAadAppDriver.execute(
      args,
      mockedDriverContext,
      outputEnvVarNames
    );
    expect(result.result.isOk()).to.be.true;
    expect(result.result.isOk() && result.result.value.get(outputKeys.botId)).to.be.equal(
      expectedClientId
    );
    expect(result.result.isOk() && result.result.value.get(outputKeys.botPassword)).to.be.equal(
      expectedSecretText
    );
  });

  it("should throw user error when GraphClient failed with 4xx error", async () => {
    vi.spyOn(AadAppClient.prototype, "createAadApp").mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error: {
            code: "Request_BadRequest",
            message:
              "Invalid value specified for property 'displayName' of resource 'Application'.",
          },
        },
      },
    });

    const args: any = {
      name: expectedDisplayName,
    };

    try {
      await createBotAadAppDriver.handler(args, mockedDriverContext, outputEnvVarNames);
      expect.fail("should have thrown");
    } catch (error: any) {
      expect(error instanceof HttpClientError).to.be.true;
      expect(error.message).contains(
        'A http client error occurred while performing the botAadApp/create task. The error response is: {"error":{"code":"Request_BadRequest","message":"Invalid value specified for property \'displayName\' of resource \'Application\'."}}'
      );
    }
  });

  it("should throw system error when GraphClient failed with non 4xx error", async () => {
    vi.spyOn(AadAppClient.prototype, "createAadApp").mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 500,
        data: {
          error: {
            code: "InternalServerError",
            message: "Internal server error",
          },
        },
      },
    });

    const args: any = {
      name: expectedDisplayName,
    };

    try {
      await createBotAadAppDriver.handler(args, mockedDriverContext, outputEnvVarNames);
      expect.fail("should have thrown");
    } catch (error: any) {
      expect(error instanceof HttpServerError).to.be.true;
      expect(error.message).equals(
        'A http server error occurred while performing the botAadApp/create task. Try again later. The error response is: {"error":{"code":"InternalServerError","message":"Internal server error"}}'
      );
    }
  });

  it("should throw error when GraphClient throws errors", async () => {
    vi.spyOn(AadAppClient.prototype, "createAadApp").mockImplementation(() => {
      throw new Error();
    });
    const args: any = {
      name: expectedDisplayName,
    };
    try {
      await createBotAadAppDriver.handler(args, mockedDriverContext, outputEnvVarNames);
      expect.fail("should have thrown");
    } catch (error: any) {
      expect(error instanceof UnhandledError).to.be.true;
    }
  });

  it("should throw UnexpectedEmptyBotPasswordError when bot password is empty", async () => {
    envRestore = mockedEnv({
      [outputKeys.botId]: expectedClientId,
      [outputKeys.botPassword]: "",
    });

    const args: any = {
      name: expectedDisplayName,
    };

    try {
      await createBotAadAppDriver.handler(args, mockedDriverContext, outputEnvVarNames);
      expect.fail("should have thrown");
    } catch (error: any) {
      expect(error.message).to.contain(
        "Bot password is empty. Add it in env file or clear bot id to have bot id/password pair regenerated. action: botAadApp/create."
      );
      expect(error instanceof UserError).to.be.true;
    }
  });

  it("should use service management reference value from environment variable when set", async () => {
    // This functionality is for internal use only.
    const expectedServiceManagementReference = "00000000-0000-0000-0000-000000000000";

    envRestore = mockedEnv({
      TTK_DEFAULT_SERVICE_MANAGEMENT_REFERENCE: expectedServiceManagementReference,
    });

    const args: any = {
      name: expectedDisplayName,
    };

    vi.spyOn(AadAppClient.prototype, "createAadApp").mockImplementation(
      async (displayName, signInAudience, serviceManagementReference) => {
        expect(serviceManagementReference).to.equal(expectedServiceManagementReference);
        return {
          id: expectedObjectId,
          displayName: expectedDisplayName,
          appId: expectedClientId,
        } as AADApplication;
      }
    );

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockResolvedValue(expectedSecretText);

    const result = await createBotAadAppDriver.execute(
      args,
      mockedDriverContext,
      outputEnvVarNames
    );
    expect(result.result.isOk()).to.be.true;
  });

  it("should be good when reusing existing bot in env", async () => {
    envRestore = mockedEnv({
      [outputKeys.botId]: expectedClientId,
      [outputKeys.botPassword]: expectedSecretText,
    });

    const args: any = {
      name: expectedDisplayName,
    };

    const result = await createBotAadAppDriver.execute(
      args,
      mockedDriverContext,
      outputEnvVarNames
    );
    expect(result.result.isOk()).to.be.true;
    expect(result.result.isOk() && result.result.value.get(outputKeys.botId)).to.be.equal(
      expectedClientId
    );
    expect(result.result.isOk() && result.result.value.get(outputKeys.botPassword)).to.be.equal(
      expectedSecretText
    );
  });

  it("should success when no log provider in context", async () => {
    const args: any = {
      name: expectedDisplayName,
    };
    const progressBar = {
      next: vi.fn(),
    };
    const mockedDriverContextWithNoLogProvider: any = {
      m365TokenProvider: new MockedM365Provider(),
      telemetryReporter: new MockedTelemetryReporter(),
    };

    vi.spyOn(AadAppClient.prototype, "createAadApp").mockResolvedValue({
      id: expectedObjectId,
      displayName: expectedDisplayName,
      appId: expectedClientId,
    } as AADApplication);

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockResolvedValue(expectedSecretText);

    mockedDriverContextWithNoLogProvider.progressBar = progressBar;

    const result = await createBotAadAppDriver.execute(
      args,
      mockedDriverContextWithNoLogProvider,
      outputEnvVarNames
    );
    expect(result.result.isOk()).to.be.true;
  });

  it("handler", async () => {
    const args: any = {
      name: expectedDisplayName,
    };
    const progressBar = {
      next: vi.fn(),
    };
    const mockedDriverContextWithNoLogProvider: any = {
      m365TokenProvider: new MockedM365Provider(),
      telemetryReporter: new MockedTelemetryReporter(),
    };

    vi.spyOn(createBotAadAppDriver, "validateArgs").mockImplementation(() => {
      throw { name: "AadCreateAppError" };
    });

    mockedDriverContextWithNoLogProvider.progressBar = progressBar;

    try {
      await createBotAadAppDriver.handler(
        args,
        mockedDriverContextWithNoLogProvider,
        outputEnvVarNames
      );
      expect.fail();
    } catch (e) {
      expect(e instanceof UnhandledError).to.be.true;
    }
  });

  it("should output delete aad information when using microsoft tenant", async () => {
    // Set default service management reference to avoid MissingServiceManagementReferenceError
    envRestore = mockedEnv({
      TTK_DEFAULT_SERVICE_MANAGEMENT_REFERENCE: "00000000-0000-0000-0000-000000000000",
    });

    vi.spyOn(mockedDriverContext.m365TokenProvider, "getJsonObject").mockResolvedValue(
      ok({ unique_name: "test@microsoft.com" })
    );
    const args: any = {
      name: expectedDisplayName,
    };

    vi.spyOn(AadAppClient.prototype, "createAadApp").mockResolvedValue({
      id: expectedObjectId,
      displayName: expectedDisplayName,
      appId: expectedClientId,
    } as AADApplication);

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockResolvedValue(expectedSecretText);

    const result = await createBotAadAppDriver.handler(
      args,
      mockedDriverContext,
      outputEnvVarNames
    );

    expect(result.output.get(outputKeys.botId)).to.be.equal(expectedClientId);
    expect(result.output.get(outputKeys.botPassword)).to.be.equal(expectedSecretText);
    expect(result.summaries[0]).includes(
      "Microsoft 365 Agents Toolkit will delete the Microsoft Entra application after debugging"
    );
  });

  it("should not output delete aad information when using non microsoft tenant", async () => {
    vi.spyOn(mockedDriverContext.m365TokenProvider, "getJsonObject").mockResolvedValue(
      ok({ unique_name: "test@test.com" })
    );
    const args: any = {
      name: expectedDisplayName,
    };

    vi.spyOn(AadAppClient.prototype, "createAadApp").mockResolvedValue({
      id: expectedObjectId,
      displayName: expectedDisplayName,
      appId: expectedClientId,
    } as AADApplication);

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockResolvedValue(expectedSecretText);

    const result = await createBotAadAppDriver.handler(
      args,
      mockedDriverContext,
      outputEnvVarNames
    );

    expect(result.output.get(outputKeys.botId)).to.be.equal(expectedClientId);
    expect(result.output.get(outputKeys.botPassword)).to.be.equal(expectedSecretText);
    expect(result.summaries[0]).not.includes(
      "Microsoft 365 Agents Toolkit will delete the Microsoft Entra application after debugging"
    );
  });

  it("should not output delete aad information when using non login information", async () => {
    vi.spyOn(mockedDriverContext.m365TokenProvider, "getJsonObject").mockResolvedValue(
      err(new Error("Test error"))
    );
    const args: any = {
      name: expectedDisplayName,
    };

    vi.spyOn(AadAppClient.prototype, "createAadApp").mockResolvedValue({
      id: expectedObjectId,
      displayName: expectedDisplayName,
      appId: expectedClientId,
    } as AADApplication);

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockResolvedValue(expectedSecretText);

    const result = await createBotAadAppDriver.handler(
      args,
      mockedDriverContext,
      outputEnvVarNames
    );

    expect(result.output.get(outputKeys.botId)).to.be.equal(expectedClientId);
    expect(result.output.get(outputKeys.botPassword)).to.be.equal(expectedSecretText);
    expect(result.summaries[0]).not.includes(
      "Microsoft 365 Agents Toolkit will delete the Microsoft Entra application after debugging"
    );
  });

  it("should throw ClientSecretNotAllowedError with proper help link for Microsoft user", async () => {
    vi.spyOn(mockedDriverContext.m365TokenProvider, "getJsonObject").mockResolvedValue(
      ok({ unique_name: "test@microsoft.com" })
    );

    vi.spyOn(AadAppClient.prototype, "createAadApp").mockResolvedValue({
      id: expectedObjectId,
      displayName: expectedDisplayName,
      appId: expectedClientId,
    } as AADApplication);

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockImplementation(
      async (objectId, days, description, isMicrosoftUser) => {
        throw new ClientSecretNotAllowedError("botAadApp/create", isMicrosoftUser);
      }
    );

    const args: any = {
      name: expectedDisplayName,
    };

    try {
      await createBotAadAppDriver.handler(args, mockedDriverContext, outputEnvVarNames);
      expect.fail("should have thrown");
    } catch (error: any) {
      expect(error.message).to.contain(
        "Your tenant doesn't allow creating a client secret for Microsoft Entra app. Create and configure the app manually."
      );
      expect(error instanceof ClientSecretNotAllowedError).to.be.true;
      expect(error.source).equals("botAadApp/create");
      expect(error.name).equals("ClientSecretNotAllowed");
      expect(error.helpLink).equals("https://aka.ms/teams-toolkit-sni-guide");
    }
  });

  it("should throw ClientSecretNotAllowedError with default help link for non-Microsoft user", async () => {
    vi.spyOn(mockedDriverContext.m365TokenProvider, "getJsonObject").mockResolvedValue(
      ok({ unique_name: "test@test.com" })
    );

    vi.spyOn(AadAppClient.prototype, "createAadApp").mockResolvedValue({
      id: expectedObjectId,
      displayName: expectedDisplayName,
      appId: expectedClientId,
    } as AADApplication);

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockImplementation(
      async (objectId, days, description, isMicrosoftUser) => {
        throw new ClientSecretNotAllowedError("botAadApp/create", isMicrosoftUser);
      }
    );

    const args: any = {
      name: expectedDisplayName,
    };

    try {
      await createBotAadAppDriver.handler(args, mockedDriverContext, outputEnvVarNames);
      expect.fail("should have thrown");
    } catch (error: any) {
      expect(error.message).to.contain(
        "Your tenant doesn't allow creating a client secret for Microsoft Entra app. Create and configure the app manually."
      );
      expect(error instanceof ClientSecretNotAllowedError).to.be.true;
      expect(error.source).equals("botAadApp/create");
      expect(error.name).equals("ClientSecretNotAllowed");
      expect(error.helpLink).equals("https://aka.ms/teamsfx-actions/aadapp-create");
    }
  });

  it("should throw SignInAudienceNotAllowedError with proper help link for Microsoft user", async () => {
    vi.spyOn(mockedDriverContext.m365TokenProvider, "getJsonObject").mockResolvedValue(
      ok({ unique_name: "test@microsoft.com" })
    );

    vi.spyOn(AadAppClient.prototype, "createAadApp").mockImplementation(
      async (displayName, signInAudience, serviceManagementReference, isMicrosoftUser) => {
        throw new SignInAudienceNotAllowedError(
          "botAadApp/create",
          "The tenant admin has disabled creation of apps with multi-tenant sign-in audience",
          isMicrosoftUser
        );
      }
    );

    const args: any = {
      name: expectedDisplayName,
    };

    try {
      await createBotAadAppDriver.handler(args, mockedDriverContext, outputEnvVarNames);
      expect.fail("should have thrown");
    } catch (error: any) {
      expect(error.message).to.contain(
        "The tenant admin has disabled creation of apps with multi-tenant sign-in audience"
      );
      expect(error instanceof SignInAudienceNotAllowedError).to.be.true;
      expect(error.source).equals("botAadApp/create");
      expect(error.name).equals("SignInAudienceNotAllowed");
      expect(error.helpLink).equals("https://aka.ms/teams-toolkit-sni-guide");
    }
  });

  it("should throw SignInAudienceNotAllowedError with default help link for non-Microsoft user", async () => {
    vi.spyOn(mockedDriverContext.m365TokenProvider, "getJsonObject").mockResolvedValue(
      ok({ unique_name: "test@test.com" })
    );

    vi.spyOn(AadAppClient.prototype, "createAadApp").mockImplementation(
      async (displayName, signInAudience, serviceManagementReference, isMicrosoftUser) => {
        throw new SignInAudienceNotAllowedError(
          "botAadApp/create",
          "The tenant admin has disabled creation of apps with multi-tenant sign-in audience",
          isMicrosoftUser
        );
      }
    );

    const args: any = {
      name: expectedDisplayName,
    };

    try {
      await createBotAadAppDriver.handler(args, mockedDriverContext, outputEnvVarNames);
      expect.fail("should have thrown");
    } catch (error: any) {
      expect(error.message).to.contain(
        "The tenant admin has disabled creation of apps with multi-tenant sign-in audience"
      );
      expect(error instanceof SignInAudienceNotAllowedError).to.be.true;
      expect(error.source).equals("botAadApp/create");
      expect(error.name).equals("SignInAudienceNotAllowed");
      expect(error.helpLink).equals("https://aka.ms/teamsfx-actions/aadapp-create");
    }
  });
});
