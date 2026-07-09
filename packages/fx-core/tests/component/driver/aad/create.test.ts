// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { err, ok, UserError } from "@microsoft/teamsfx-api";
import mockedEnv, { RestoreFn } from "mocked-env";
import { expect, vi } from "vitest";
import { AadAppClient } from "../../../../src/client/aadAppClient";
import { TeamsDevPortalClient } from "../../../../src/client/teamsDevPortalClient";
import { getLocalizedString } from "../../../../src/common/localizeUtils";
import { CreateAadAppDriver } from "../../../../src/component/driver/aad/create";
import { AadAppNameTooLongError } from "../../../../src/component/driver/aad/error/aadAppNameTooLongError";
import { MissingEnvUserError } from "../../../../src/component/driver/aad/error/missingEnvError";
import { AADApplication } from "../../../../src/component/driver/aad/interface/AADApplication";
import { constants } from "../../../../src/component/driver/aad/utility/constants";
import { OutputEnvironmentVariableUndefinedError } from "../../../../src/component/driver/error/outputEnvironmentVariableUndefinedError";
import {
  HttpClientError,
  HttpServerError,
  InvalidActionInputError,
  UserCancelError,
} from "../../../../src/error/common";
import { MockedM365Provider } from "../../../core/utils";
import {
  MockedLogProvider,
  MockedTelemetryReporter,
  MockedUserInteraction,
} from "../../../plugins/solution/util";

const outputKeys = {
  clientId: "AAD_APP_CLIENT_ID",
  objectId: "AAD_APP_OBJECT_ID",
  tenantId: "AAD_APP_TENANT_ID",
  authorityHost: "AAD_APP_OAUTH_AUTHORITY_HOST",
  authority: "AAD_APP_OAUTH_AUTHORITY",
  clientSecret: "SECRET_AAD_APP_CLIENT_SECRET",
};

const outputEnvVarNames = new Map<string, string>(Object.entries(outputKeys));

describe("aadAppCreate", async () => {
  const expectedObjectId = "00000000-0000-0000-0000-000000000000";
  const expectedClientId = "00000000-0000-0000-0000-111111111111";
  const expectedDisplayName = "Microsoft Entra app name";
  const expectedSecretText = "fake secret";
  const createAadAppDriver = new CreateAadAppDriver();
  const mockedDriverContext: any = {
    m365TokenProvider: new MockedM365Provider(),
    ui: new MockedUserInteraction(),
    projectPath: "test",
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
    let args: any = {
      name: "test",
    };
    let result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    expect(result.result._unsafeUnwrapErr()).is.instanceOf(InvalidActionInputError);

    args = {
      generateClientSecret: true,
    };
    result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    expect(result.result._unsafeUnwrapErr()).is.instanceOf(InvalidActionInputError);

    args = {};
    result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    expect(result.result._unsafeUnwrapErr()).is.instanceOf(InvalidActionInputError);
  });

  it("should throw error if argument property is invalid", async () => {
    let args: any = {
      name: "test",
      generateClientSecret: "no",
    };
    let result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    expect(result.result._unsafeUnwrapErr()).is.instanceOf(InvalidActionInputError);

    args = {
      name: "",
      generateClientSecret: true,
    };
    result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    expect(result.result._unsafeUnwrapErr()).is.instanceOf(InvalidActionInputError);

    args = {
      name: "",
      generateClientSecret: "no",
    };
    result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    expect(result.result._unsafeUnwrapErr()).is.instanceOf(InvalidActionInputError);
  });

  it("should throw error if Microsoft Entra app name exceeds 120 characters", async () => {
    const invalidAppName = "a".repeat(121);
    const args: any = {
      name: invalidAppName,
      generateClientSecret: false,
    };
    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    expect(result.result._unsafeUnwrapErr()).is.instanceOf(AadAppNameTooLongError);
  });

  it("should throw error if outputEnvVarNames is undefined", async () => {
    const args: any = {
      name: "test",
      generateClientSecret: true,
    };

    const result = await createAadAppDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    expect(result.result._unsafeUnwrapErr()).is.instanceOf(OutputEnvironmentVariableUndefinedError);
  });

  it("should use service management reference value from environment variable when parameter not set", async () => {
    // This functionality is for internal use only.
    const expectedServiceManagementReference = "00000000-0000-0000-0000-000000000000";

    envRestore = mockedEnv({
      TTK_DEFAULT_SERVICE_MANAGEMENT_REFERENCE: expectedServiceManagementReference,
    });

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

    const args: any = {
      name: "test",
      generateClientSecret: false,
    };

    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isOk()).to.be.true;
  });

  it("should create new Microsoft Entra app and client secret with empty .env", async () => {
    vi.spyOn(AadAppClient.prototype, "createAadApp").mockResolvedValue({
      id: expectedObjectId,
      displayName: expectedDisplayName,
      appId: expectedClientId,
    } as AADApplication);

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockResolvedValue(expectedSecretText);

    const args: any = {
      name: "test",
      generateClientSecret: true,
    };

    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isOk()).to.be.true;
    expect(result.result._unsafeUnwrap().get(outputKeys.clientId)).to.equal(expectedClientId);
    expect(result.result._unsafeUnwrap().get(outputKeys.objectId)).to.equal(expectedObjectId);
    expect(result.result._unsafeUnwrap().get(outputKeys.tenantId)).to.equal("tenantId");
    expect(result.result._unsafeUnwrap().get(outputKeys.authority)).to.equal(
      "https://login.microsoftonline.com/tenantId"
    );
    expect(result.result._unsafeUnwrap().get(outputKeys.authorityHost)).to.equal(
      "https://login.microsoftonline.com"
    );
    expect(result.result._unsafeUnwrap().get(outputKeys.clientSecret)).to.equal(expectedSecretText);
    expect(result.result._unsafeUnwrap().size).to.equal(6);
    expect(result.summaries.length).to.equal(2);
    expect(result.summaries).includes(
      `Created Microsoft Entra application with object id ${expectedObjectId}`
    );
    expect(result.summaries).includes(
      `Generated client secret for Microsoft Entra application with object id ${expectedObjectId}`
    );
  });

  it("shouldd set default values for client secret expire time, description, and service management reference", async () => {
    vi.spyOn(AadAppClient.prototype, "createAadApp").mockImplementation(
      async (displayName, signInAudience, serviceManagementReference) => {
        expect(serviceManagementReference).to.be.undefined;
        return {
          id: expectedObjectId,
          displayName: expectedDisplayName,
          appId: expectedClientId,
        } as AADApplication;
      }
    );

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockImplementation(
      async (objectId, clientSecretExpireDays, clientSecretDescription) => {
        expect(clientSecretExpireDays).to.equal(180);
        expect(clientSecretDescription).to.equal("default");
        return expectedSecretText;
      }
    );

    const args: any = {
      name: "test",
      generateClientSecret: true,
    };

    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
  });

  it("should use user defined client secret expire time, description, and service management reference", async () => {
    const expectedServiceManagementReference = "00000000-0000-0000-0000-000000000000";
    const expectedExpireTime = 90;
    const expectedDescription = "custom";
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

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockImplementation(
      async (objectId, clientSecretExpireDays, clientSecretDescription) => {
        expect(clientSecretExpireDays).to.equal(expectedExpireTime);
        expect(clientSecretDescription).to.equal(expectedDescription);
        return expectedSecretText;
      }
    );

    const args: any = {
      name: "test",
      generateClientSecret: true,
      clientSecretExpireDays: expectedExpireTime,
      clientSecretDescription: expectedDescription,
      serviceManagementReference: expectedServiceManagementReference,
    };

    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
  });

  it("should output to specific environment variable based on writeToEnvironmentFile declaration", async () => {
    vi.spyOn(AadAppClient.prototype, "createAadApp").mockResolvedValue({
      id: expectedObjectId,
      displayName: expectedDisplayName,
      appId: expectedClientId,
    } as AADApplication);

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockResolvedValue(expectedSecretText);

    const args: any = {
      name: "test",
      generateClientSecret: true,
    };
    const outputEnvVarNames = new Map<string, string>(
      Object.entries({
        clientId: "MY_CLIENT_ID",
        objectId: "MY_OBJECT_ID",
        tenantId: "MY_TENANT_ID",
        authorityHost: "MY_AUTHORITY_HOST",
        authority: "MY_AUTHORITY",
        clientSecret: "MY_CLIENT_SECRET",
      })
    );

    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isOk()).to.be.true;
    expect(result.result._unsafeUnwrap().get("MY_CLIENT_ID")).to.equal(expectedClientId);
    expect(result.result._unsafeUnwrap().get("MY_OBJECT_ID")).to.equal(expectedObjectId);
    expect(result.result._unsafeUnwrap().get("MY_TENANT_ID")).to.equal("tenantId");
    expect(result.result._unsafeUnwrap().get("MY_AUTHORITY")).to.equal(
      "https://login.microsoftonline.com/tenantId"
    );
    expect(result.result._unsafeUnwrap().get("MY_AUTHORITY_HOST")).to.equal(
      "https://login.microsoftonline.com"
    );
    expect(result.result._unsafeUnwrap().get("MY_CLIENT_SECRET")).to.equal(expectedSecretText);
    expect(result.result._unsafeUnwrap().size).to.equal(6);
    expect(result.summaries.length).to.equal(2);
    expect(result.summaries).includes(
      `Created Microsoft Entra application with object id ${expectedObjectId}`
    );
    expect(result.summaries).includes(
      `Generated client secret for Microsoft Entra application with object id ${expectedObjectId}`
    );
  });

  it("should use existing Microsoft Entra app and generate new secret when AAD_APP_CLIENT_ID exists and only output generated client secret", async () => {
    vi.spyOn(AadAppClient.prototype, "createAadApp").mockRejectedValue(
      "createAadApp should not be called"
    );
    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockResolvedValue(expectedSecretText);

    envRestore = mockedEnv({
      [outputKeys.clientId]: "existing value",
      [outputKeys.objectId]: "existing value",
    });

    const args = {
      name: "test",
      generateClientSecret: true,
    };

    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    expect(result.result._unsafeUnwrap().get(outputKeys.clientSecret)).to.equal(expectedSecretText);
    expect(result.result._unsafeUnwrap().size).to.equal(1); // 1 new env and 2 existing env
    expect(result.summaries.length).to.equal(1);
    expect(result.summaries).includes(
      `Generated client secret for Microsoft Entra application with object id existing value`
    );
  });

  it("should do nothing when AAD_APP_CLIENT_ID and SECRET_AAD_APP_CLIENT_SECRET exists", async () => {
    vi.spyOn(AadAppClient.prototype, "createAadApp").mockRejectedValue(
      "createAadApp should not be called"
    );
    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockRejectedValue(
      "generateClientSecret should not be called"
    );

    envRestore = mockedEnv({
      [outputKeys.clientId]: "existing value",
      [outputKeys.objectId]: "existing value",
      [outputKeys.clientSecret]: "existing value",
    });

    const args = {
      name: "test",
      generateClientSecret: true,
    };

    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    expect(result.result._unsafeUnwrap().size).to.equal(0);
    expect(result.summaries.length).to.equal(0); // no summary when action does nothing
  });

  it("should not generate client secret when generateClientSecret is false and output nothing", async () => {
    vi.spyOn(AadAppClient.prototype, "createAadApp").mockResolvedValue({
      id: expectedObjectId,
      displayName: expectedDisplayName,
      appId: expectedClientId,
    } as AADApplication);

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockRejectedValue(
      "generateClientSecret should not be called"
    );

    const args: any = {
      name: "test",
      generateClientSecret: false,
    };

    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
    expect(result.result._unsafeUnwrap().get(outputKeys.clientId)).to.equal(expectedClientId);
    expect(result.result._unsafeUnwrap().get(outputKeys.objectId)).to.equal(expectedObjectId);
    expect(result.result._unsafeUnwrap().get(outputKeys.tenantId)).to.equal("tenantId");
    expect(result.result._unsafeUnwrap().get(outputKeys.authority)).to.equal(
      "https://login.microsoftonline.com/tenantId"
    );
    expect(result.result._unsafeUnwrap().get(outputKeys.authorityHost)).to.equal(
      "https://login.microsoftonline.com"
    );
    expect(result.result._unsafeUnwrap().get(outputKeys.clientSecret)).to.be.undefined;
    expect(result.result._unsafeUnwrap().size).to.equal(5);
    expect(result.summaries.length).to.equal(1);
    expect(result.summaries).includes(
      `Created Microsoft Entra application with object id ${expectedObjectId}`
    );
  });

  it("should throw error when generate client secret if AAD_APP_OBJECT_ID is missing", async () => {
    envRestore = mockedEnv({
      [outputKeys.clientId]: "existing value",
    });

    const args: any = {
      name: "test",
      generateClientSecret: true,
    };

    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    expect(result.result._unsafeUnwrapErr())
      .is.instanceOf(MissingEnvUserError)
      .and.has.property(
        "message",
        "Cannot generate client secret. Environment variable AAD_APP_OBJECT_ID is not set."
      );
  });

  it("should throw user error when AadAppClient failed with 4xx error", async () => {
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
      name: "test",
      generateClientSecret: false,
    };

    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    expect(result.result._unsafeUnwrapErr())
      .is.instanceOf(HttpClientError)
      .and.has.property("message")
      .and.equals(
        'A http client error occurred while performing the aadApp/create task. The error response is: {"error":{"code":"Request_BadRequest","message":"Invalid value specified for property \'displayName\' of resource \'Application\'."}}'
      );
  });

  it("should throw system error when AadAppClient failed with non 4xx error", async () => {
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
      name: "test",
      generateClientSecret: false,
    };

    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    expect(result.result._unsafeUnwrapErr())
      .is.instanceOf(HttpServerError)
      .and.has.property("message")
      .and.equals(
        'A http server error occurred while performing the aadApp/create task. Try again later. The error response is: {"error":{"code":"InternalServerError","message":"Internal server error"}}'
      );
  });

  it("should call TDP API to create AAD app with service principal when parameter generateServicePrincipal is true", async () => {
    const args: any = {
      name: "test",
      generateClientSecret: false,
      generateServicePrincipal: true,
    };
    const driverContext: any = {
      m365TokenProvider: new MockedM365Provider(),
      telemetryReporter: new MockedTelemetryReporter(),
    };
    vi.spyOn(TeamsDevPortalClient.prototype, "createAADApp").mockResolvedValue({
      id: expectedObjectId,
      displayName: expectedDisplayName,
      appId: expectedClientId,
    } as AADApplication);

    const result = await createAadAppDriver.execute(args, driverContext, outputEnvVarNames);

    expect(result.result.isOk()).to.be.true;
  });

  it("should return error when failed to get token for TDP API to create AAD app with service principal when parameter generateServicePrincipal is true", async () => {
    const args: any = {
      name: "test",
      generateClientSecret: false,
      generateServicePrincipal: true,
    };
    const driverContext: any = {
      m365TokenProvider: new MockedM365Provider(),
      telemetryReporter: new MockedTelemetryReporter(),
    };
    vi.spyOn(MockedM365Provider.prototype, "getAccessToken").mockResolvedValue(
      err(new UserCancelError())
    );
    vi.spyOn(TeamsDevPortalClient.prototype, "createAADApp").mockResolvedValue({
      id: expectedObjectId,
      displayName: expectedDisplayName,
      appId: expectedClientId,
    } as AADApplication);

    const result = await createAadAppDriver.execute(args, driverContext, outputEnvVarNames);

    expect(result.result.isErr()).to.be.true;
  });

  it("should send telemetries when success", async () => {
    const mockedTelemetryReporter = new MockedTelemetryReporter();
    let startTelemetry: any, endTelemetry: any;

    vi.spyOn(AadAppClient.prototype, "createAadApp").mockResolvedValue({
      id: expectedObjectId,
      displayName: expectedDisplayName,
      appId: expectedClientId,
    } as AADApplication);

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockResolvedValue(expectedSecretText);

    vi.spyOn(mockedTelemetryReporter, "sendTelemetryEvent")
      .mockImplementationOnce((eventName, properties, measurements) => {
        startTelemetry = {
          eventName,
          properties,
          measurements,
        };
      })
      .mockImplementationOnce((eventName, properties, measurements) => {
        endTelemetry = {
          eventName,
          properties,
          measurements,
        };
      });

    const args: any = {
      name: "test",
      generateClientSecret: true,
    };
    const driverContext: any = {
      m365TokenProvider: new MockedM365Provider(),
      telemetryReporter: mockedTelemetryReporter,
    };

    const result = await createAadAppDriver.execute(args, driverContext, outputEnvVarNames);

    expect(result.result.isOk()).to.be.true;
    expect(startTelemetry.eventName).to.equal("aadApp/create-start");
    expect(startTelemetry.properties.component).to.equal("aadAppcreate");
    expect(endTelemetry.eventName).to.equal("aadApp/create");
    expect(endTelemetry.properties.component).to.equal("aadAppcreate");
    expect(endTelemetry.properties.success).to.equal("yes");
    expect(endTelemetry.properties["new-aad-app"]).to.equal("true");
  });

  it("should set new-aad-app telemetry to false when reuse existing AAD app", async () => {
    const mockedTelemetryReporter = new MockedTelemetryReporter();
    let startTelemetry: any, endTelemetry: any;

    vi.spyOn(mockedTelemetryReporter, "sendTelemetryEvent")
      .mockImplementationOnce((eventName, properties, measurements) => {
        startTelemetry = {
          eventName,
          properties,
          measurements,
        };
      })
      .mockImplementationOnce((eventName, properties, measurements) => {
        endTelemetry = {
          eventName,
          properties,
          measurements,
        };
      });

    envRestore = mockedEnv({
      [outputKeys.clientId]: "existing value",
      [outputKeys.objectId]: "existing value",
      [outputKeys.clientSecret]: "existing value",
    });

    const args: any = {
      name: "test",
      generateClientSecret: true,
    };
    const driverContext: any = {
      m365TokenProvider: new MockedM365Provider(),
      telemetryReporter: mockedTelemetryReporter,
    };

    const result = await createAadAppDriver.execute(args, driverContext, outputEnvVarNames);

    expect(result.result.isOk()).to.be.true;
    expect(startTelemetry.eventName).to.equal("aadApp/create-start");
    expect(startTelemetry.properties.component).to.equal("aadAppcreate");
    expect(endTelemetry.eventName).to.equal("aadApp/create");
    expect(endTelemetry.properties.component).to.equal("aadAppcreate");
    expect(endTelemetry.properties.success).to.equal("yes");
    expect(endTelemetry.properties["new-aad-app"]).to.equal("false");
  });

  it("should send telemetries when fail", async () => {
    const mockedTelemetryReporter = new MockedTelemetryReporter();
    let startTelemetry: any, endTelemetry: any;

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

    vi.spyOn(mockedTelemetryReporter, "sendTelemetryEvent").mockImplementationOnce(
      (eventName, properties, measurements) => {
        startTelemetry = {
          eventName,
          properties,
          measurements,
        };
      }
    );

    vi.spyOn(mockedTelemetryReporter, "sendTelemetryErrorEvent").mockImplementationOnce(
      (eventName, properties, measurements) => {
        endTelemetry = {
          eventName,
          properties,
          measurements,
        };
      }
    );

    const args: any = {
      name: "test",
      generateClientSecret: true,
    };
    const driverContext: any = {
      m365TokenProvider: new MockedM365Provider(),
      telemetryReporter: mockedTelemetryReporter,
    };

    const result = await createAadAppDriver.execute(args, driverContext, outputEnvVarNames);

    expect(result.result.isOk()).to.be.false;
    expect(startTelemetry.eventName).to.equal("aadApp/create-start");
    expect(startTelemetry.properties.component).to.equal("aadAppcreate");
    expect(endTelemetry.eventName).to.equal("aadApp/create");
    expect(endTelemetry.properties.component).to.equal("aadAppcreate");
    expect(endTelemetry.properties.success).to.equal("no");
    expect(endTelemetry.properties["error-code"]).to.equal("aadAppCreate.HttpClientError");
    expect(endTelemetry.properties["error-type"]).to.equal("user");
    // expect(endTelemetry.properties["error-message"]).to.equal(
    //   'A http client error occurred while performing the aadApp/create task. The error response is: {"error":{"code":"Request_BadRequest","message":"Invalid value specified for property \'displayName\' of resource \'Application\'."}}'
    // );
  });

  it("should send telemetries with error stack", async () => {
    const mockedTelemetryReporter = new MockedTelemetryReporter();
    let startTelemetry: any, endTelemetry: any;

    vi.spyOn(AadAppClient.prototype, "createAadApp").mockImplementation(() => {
      const error = new Error("fake error");
      error.stack = "fake stack";
      throw error;
    });

    vi.spyOn(mockedTelemetryReporter, "sendTelemetryEvent").mockImplementationOnce(
      (eventName, properties, measurements) => {
        startTelemetry = {
          eventName,
          properties,
          measurements,
        };
      }
    );

    vi.spyOn(mockedTelemetryReporter, "sendTelemetryErrorEvent").mockImplementationOnce(
      (eventName, properties, measurements) => {
        endTelemetry = {
          eventName,
          properties,
          measurements,
        };
      }
    );

    const args: any = {
      name: "test",
      generateClientSecret: true,
    };
    const driverContext: any = {
      m365TokenProvider: new MockedM365Provider(),
      telemetryReporter: mockedTelemetryReporter,
    };

    const result = await createAadAppDriver.execute(args, driverContext, outputEnvVarNames);

    expect(result.result.isOk()).to.be.false;
    expect(startTelemetry.eventName).to.equal("aadApp/create-start");
    expect(startTelemetry.properties.component).to.equal("aadAppcreate");
    expect(endTelemetry.eventName).to.equal("aadApp/create");
    expect(endTelemetry.properties.component).to.equal("aadAppcreate");
    expect(endTelemetry.properties.success).to.equal("no");
    expect(endTelemetry.properties["error-code"]).to.equal("aadAppCreate.UnhandledError");
    expect(endTelemetry.properties["error-type"]).to.equal("system");
  });

  it("should use input signInAudience when provided", async () => {
    vi.spyOn(AadAppClient.prototype, "createAadApp").mockImplementation(
      async (displayName, signInAudience) => {
        expect(signInAudience).to.equal("AzureADMultipleOrgs");
        return {
          id: expectedObjectId,
          displayName: expectedDisplayName,
          appId: expectedClientId,
        } as AADApplication;
      }
    );

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockResolvedValue(expectedSecretText);

    const args: any = {
      name: "test",
      generateClientSecret: true,
      signInAudience: "AzureADMultipleOrgs",
    };

    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isOk()).to.be.true;
    expect(result.result._unsafeUnwrap().get(outputKeys.clientId)).to.equal(expectedClientId);
    expect(result.result._unsafeUnwrap().get(outputKeys.objectId)).to.equal(expectedObjectId);
    expect(result.result._unsafeUnwrap().get(outputKeys.tenantId)).to.equal("tenantId");
    expect(result.result._unsafeUnwrap().get(outputKeys.authority)).to.equal(
      "https://login.microsoftonline.com/tenantId"
    );
    expect(result.result._unsafeUnwrap().get(outputKeys.authorityHost)).to.equal(
      "https://login.microsoftonline.com"
    );
    expect(result.result._unsafeUnwrap().get(outputKeys.clientSecret)).to.equal(expectedSecretText);
    expect(result.result._unsafeUnwrap().size).to.equal(6);
    expect(result.summaries.length).to.equal(2);
    expect(result.summaries).includes(
      `Created Microsoft Entra application with object id ${expectedObjectId}`
    );
    expect(result.summaries).includes(
      `Generated client secret for Microsoft Entra application with object id ${expectedObjectId}`
    );
  });

  it("should throw user error when invaliad signInAudience", async () => {
    const args: any = {
      name: "test",
      generateClientSecret: true,
      signInAudience: "WrongAudience",
    };

    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isErr()).to.be.true;
    expect(result.result._unsafeUnwrapErr())
      .is.instanceOf(UserError)
      .and.has.property("message")
      .and.contains("action cannot be completed as the following parameter(s):");
  });

  it("should output delete aad information when using microsoft tenant", async () => {
    vi.spyOn(mockedDriverContext.m365TokenProvider, "getJsonObject").mockResolvedValue(
      ok({ unique_name: "test@microsoft.com" })
    );
    vi.spyOn(AadAppClient.prototype, "createAadApp").mockResolvedValue({
      id: expectedObjectId,
      displayName: expectedDisplayName,
      appId: expectedClientId,
    } as AADApplication);

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockResolvedValue(expectedSecretText);

    const args: any = {
      name: "test",
      generateClientSecret: true,
      serviceManagementReference: "00000000-0000-0000-0000-000000000000",
    };
    const outputEnvVarNames = new Map<string, string>(
      Object.entries({
        clientId: "MY_CLIENT_ID",
        objectId: "MY_OBJECT_ID",
        tenantId: "MY_TENANT_ID",
        authorityHost: "MY_AUTHORITY_HOST",
        authority: "MY_AUTHORITY",
        clientSecret: "MY_CLIENT_SECRET",
      })
    );

    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isOk()).to.be.true;
    expect(result.result._unsafeUnwrap().get("MY_CLIENT_ID")).to.equal(expectedClientId);
    expect(result.result._unsafeUnwrap().get("MY_OBJECT_ID")).to.equal(expectedObjectId);
    expect(result.result._unsafeUnwrap().get("MY_AUTHORITY_HOST")).to.equal(
      "https://login.microsoftonline.com"
    );
    expect(result.result._unsafeUnwrap().get("MY_CLIENT_SECRET")).to.equal(expectedSecretText);
    expect(result.result._unsafeUnwrap().size).to.equal(6);
    expect(result.summaries.length).to.equal(2);
    expect(result.summaries[0]).includes(
      `Microsoft 365 Agents Toolkit will delete the Microsoft Entra application after debugging`
    );
  });

  it("should not output delete aad information when using non microsoft tenant", async () => {
    vi.spyOn(mockedDriverContext.m365TokenProvider, "getJsonObject").mockResolvedValue(
      ok({ unique_name: "test@test.com" })
    );
    vi.spyOn(AadAppClient.prototype, "createAadApp").mockResolvedValue({
      id: expectedObjectId,
      displayName: expectedDisplayName,
      appId: expectedClientId,
    } as AADApplication);

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockResolvedValue(expectedSecretText);

    const args: any = {
      name: "test",
      generateClientSecret: true,
    };
    const outputEnvVarNames = new Map<string, string>(
      Object.entries({
        clientId: "MY_CLIENT_ID",
        objectId: "MY_OBJECT_ID",
        tenantId: "MY_TENANT_ID",
        authorityHost: "MY_AUTHORITY_HOST",
        authority: "MY_AUTHORITY",
        clientSecret: "MY_CLIENT_SECRET",
      })
    );

    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isOk()).to.be.true;
    expect(result.result._unsafeUnwrap().get("MY_CLIENT_ID")).to.equal(expectedClientId);
    expect(result.result._unsafeUnwrap().get("MY_OBJECT_ID")).to.equal(expectedObjectId);
    expect(result.result._unsafeUnwrap().get("MY_AUTHORITY_HOST")).to.equal(
      "https://login.microsoftonline.com"
    );
    expect(result.result._unsafeUnwrap().get("MY_CLIENT_SECRET")).to.equal(expectedSecretText);
    expect(result.result._unsafeUnwrap().size).to.equal(6);
    expect(result.summaries.length).to.equal(2);
    expect(result.summaries).includes(
      `Created Microsoft Entra application with object id ${expectedObjectId}`
    );
    expect(result.summaries).includes(
      `Generated client secret for Microsoft Entra application with object id ${expectedObjectId}`
    );
    expect(result.summaries).not.includes(
      "Microsoft 365 Agents Toolkit will delete the Microsoft Entra application after debugging"
    );
  });

  it("should not output delete aad information when return non login information", async () => {
    vi.spyOn(mockedDriverContext.m365TokenProvider, "getJsonObject").mockResolvedValue(
      err(new Error("Test error"))
    );
    vi.spyOn(AadAppClient.prototype, "createAadApp").mockResolvedValue({
      id: expectedObjectId,
      displayName: expectedDisplayName,
      appId: expectedClientId,
    } as AADApplication);

    vi.spyOn(AadAppClient.prototype, "generateClientSecret").mockResolvedValue(expectedSecretText);

    const args: any = {
      name: "test",
      generateClientSecret: true,
    };
    const outputEnvVarNames = new Map<string, string>(
      Object.entries({
        clientId: "MY_CLIENT_ID",
        objectId: "MY_OBJECT_ID",
        tenantId: "MY_TENANT_ID",
        authorityHost: "MY_AUTHORITY_HOST",
        authority: "MY_AUTHORITY",
        clientSecret: "MY_CLIENT_SECRET",
      })
    );

    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isOk()).to.be.false;
  });

  it("should continue when AadAppClient failed with insufficient permission but provide input", async () => {
    vi.spyOn(AadAppClient.prototype, "createAadApp").mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 403,
        data: {
          error: {
            code: "Request_BadRequest",
            message: constants.insufficientPermissionErrorMessage,
          },
        },
      },
    });
    vi.spyOn(createAadAppDriver, "askForAADAppIdAndSecret").mockResolvedValue(
      ok(new Map<string, string>())
    );

    const args: any = {
      name: "test",
      generateClientSecret: false,
    };

    envRestore = mockedEnv({
      ["TEAMSFX_ENV"]: "local",
    });

    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isOk()).to.be.true;
  });

  it("should failed when AadAppClient failed with insufficient permission and not provide input", async () => {
    vi.spyOn(AadAppClient.prototype, "createAadApp").mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 403,
        data: {
          error: {
            code: "Request_BadRequest",
            message: constants.insufficientPermissionErrorMessage,
          },
        },
      },
    });
    vi.spyOn(createAadAppDriver, "askForAADAppIdAndSecret").mockResolvedValue(
      err(new UserCancelError("test"))
    );

    const args: any = {
      name: "test",
      generateClientSecret: false,
    };

    envRestore = mockedEnv({
      ["TEAMSFX_ENV"]: "local",
    });

    const result = await createAadAppDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error).is.instanceOf(UserCancelError);
    }
  });
});

describe("askForAADAppIdAndSecret", () => {
  const driver = new CreateAadAppDriver();
  const context = {
    ui: new MockedUserInteraction(),
    logProvider: new MockedLogProvider(),
    m365TokenProvider: new MockedM365Provider(),
  } as any;

  let aadAppState: any;
  let outputEnvVarNames: Map<string, string>;

  beforeEach(() => {
    aadAppState = {};
    outputEnvVarNames = new Map<string, string>();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return user input when user proceeds", async () => {
    vi.spyOn(context.ui!, "inputText").mockResolvedValue(ok({ result: "test-input" }));
    vi.spyOn(context.ui!, "showMessage").mockResolvedValue(ok("Proceed"));

    const result = await driver.askForAADAppIdAndSecret(context, aadAppState, outputEnvVarNames);
    expect(result.isOk()).to.be.true;
  });

  it("should return UserCancelError when user cancels", async () => {
    vi.spyOn(context.ui!, "showMessage").mockResolvedValue(ok("Cancel"));

    const result = await driver.askForAADAppIdAndSecret(context, aadAppState, outputEnvVarNames);

    expect(result.isErr()).to.be.true;
    if (result.isErr()) {
      expect(result.error).is.instanceOf(UserCancelError);
    }
  });

  it("should return UserCancelError if user cancels input for aadAppId", async () => {
    vi.spyOn(context.ui!, "showMessage").mockResolvedValue(ok("Proceed"));
    vi.spyOn(context.ui!, "inputText").mockResolvedValue(err(new UserCancelError("test")));

    const result = await driver.askForAADAppIdAndSecret(context, aadAppState, outputEnvVarNames);

    expect(result.isErr()).to.be.true;
    if (result.isErr()) {
      expect(result.error).is.instanceOf(UserCancelError);
    }
    expect(aadAppState.aadAppId).to.be.undefined;
  });

  it("should return UserCancelError if user cancels input for aadAppSecret", async () => {
    vi.spyOn(context.ui!, "showMessage").mockResolvedValue(ok("Proceed"));
    vi.spyOn(context.ui!, "inputText")
      .mockResolvedValueOnce(ok({ result: "test-input" }))
      .mockResolvedValueOnce(err(new UserCancelError("test")));

    const result = await driver.askForAADAppIdAndSecret(context, aadAppState, outputEnvVarNames);

    expect(result.isErr()).to.be.true;
    if (result.isErr()) {
      expect(result.error).is.instanceOf(UserCancelError);
    }
  });

  it("should return UserCancelError if user cancels input for aadAppObjectId", async () => {
    vi.spyOn(context.ui!, "showMessage").mockResolvedValue(ok("Proceed"));
    vi.spyOn(context.ui!, "inputText").mockImplementation(async (options: any) => {
      if (options.name === "aadAppObjectId") {
        return err(new UserCancelError("test"));
      } else {
        (options as any).validation!("test-input"); // Simulate empty input
        return ok({ result: "test-input" });
      }
    });

    const result = await driver.askForAADAppIdAndSecret(context, aadAppState, outputEnvVarNames);

    expect(result.isErr()).to.be.true;
    if (result.isErr()) {
      expect(result.error).is.instanceOf(UserCancelError);
    }
  });

  it("should validate aadAppId input and return error if input is empty", async () => {
    vi.spyOn(context.ui!, "showMessage").mockResolvedValue(ok("Proceed"));
    vi.spyOn(context.ui!, "inputText").mockImplementation(async (options: any) => {
      if (options.name === "aadAppId") {
        const validationResult = (options as any).validation!(""); // Simulate empty input
        expect(validationResult).equal(getLocalizedString("driver.aadApp.question.id.validation"));
      }
      return ok({ result: "test-input" });
    });

    const result = await driver.askForAADAppIdAndSecret(context, aadAppState, outputEnvVarNames);
    expect(result.isOk()).to.be.true;
  });

  it("should validate aadAppSecret input and return error if input is empty", async () => {
    vi.spyOn(context.ui!, "showMessage").mockResolvedValue(ok("Proceed"));
    vi.spyOn(context.ui!, "inputText").mockImplementation(async (options: any) => {
      if (options.name === "aadAppSecret") {
        const validationResult = (options as any).validation!(""); // Simulate empty input
        expect(validationResult).equal(
          getLocalizedString("driver.aadApp.question.secret.validation")
        );
      }
      return ok({ result: "test-input" });
    });

    const result = await driver.askForAADAppIdAndSecret(context, aadAppState, outputEnvVarNames);
    expect(result.isOk()).to.be.true;
  });

  it("should validate aadAppSecret input and return error if input is empty", async () => {
    vi.spyOn(context.ui!, "showMessage").mockResolvedValue(ok("Proceed"));
    vi.spyOn(context.ui!, "inputText").mockImplementation(async (options: any) => {
      if (options.name === "aadAppObjectId") {
        const validationResult = (options as any).validation!(""); // Simulate empty input
        expect(validationResult).equal(
          getLocalizedString("driver.aadApp.question.objectId.validation")
        );
      }
      return ok({ result: "test-input" });
    });

    const result = await driver.askForAADAppIdAndSecret(context, aadAppState, outputEnvVarNames);
    expect(result.isOk()).to.be.true;
  });
});
