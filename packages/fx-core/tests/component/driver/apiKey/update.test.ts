// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SpecParser } from "@microsoft/m365-spec-parser";
import { ConfirmConfig, err, ok, UserError } from "@microsoft/teamsfx-api";
import { RestoreFn } from "mocked-env";
import { expect, vi } from "vitest";
import { featureFlagManager } from "../../../../src";
import { teamsGraphClient } from "../../../../src/client/teamsGraphClient";
import { setTools } from "../../../../src/common/globalVars";
import { UpdateApiKeyArgs } from "../../../../src/component/driver/apiKey/interface/updateApiKeyArgs";
import { UpdateApiKeyDriver } from "../../../../src/component/driver/apiKey/update";
import {
  ApiSecretRegistrationAppType,
  ApiSecretRegistrationTargetAudience,
} from "../../../../src/component/driver/teamsApp/interfaces/ApiSecretRegistration";
import { MockedAzureAccountProvider, MockedM365Provider } from "../../../core/utils";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";

describe("UpdateApiKeyDriver", () => {
  const mockedDriverContext: any = {
    m365TokenProvider: new MockedM365Provider(),
    ui: new MockedUserInteraction(),
  };
  const updateApiKeyDriver = new UpdateApiKeyDriver();

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

  it("happy path: update all fields", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(teamsGraphClient, "updateApiKeyRegistration").mockResolvedValue({
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test2"],
      applicableToApps: ApiSecretRegistrationAppType.SpecificApp,
      targetAudience: ApiSecretRegistrationTargetAudience.HomeTenant,
      specificAppId: "mockedAppId",
    });
    vi.spyOn(teamsGraphClient, "getApiKeyRegistrationById").mockResolvedValue({
      id: "mockedRegistrationId",
      description: "mockedDescription",
      clientSecrets: [],
      targetUrlsShouldStartWith: ["https://test"],
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
        {
          api: "api2",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test2",
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

    vi.spyOn(mockedDriverContext.ui, "confirm").mockImplementation(async (config) => {
      expect((config as ConfirmConfig).title.includes("description")).to.be.true;
      expect((config as ConfirmConfig).title.includes("applicableToApps")).to.be.true;
      expect((config as ConfirmConfig).title.includes("specificAppId")).to.be.true;
      expect((config as ConfirmConfig).title.includes("targetAudience")).to.be.true;
      return ok({ type: "success", value: true });
    });

    const args: UpdateApiKeyArgs = {
      name: "test2",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      targetAudience: "HomeTenant",
      applicableToApps: "SpecificApp",
      registrationId: "mockedRegistrationId",
    };

    const result = await updateApiKeyDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.size).to.equal(0);
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: update all fields with baseURL", async () => {
    vi.spyOn(teamsGraphClient, "updateApiKeyRegistration").mockResolvedValue({
      description: "mockedDescription",
      targetUrlsShouldStartWith: ["https://test2"],
      applicableToApps: ApiSecretRegistrationAppType.SpecificApp,
      targetAudience: ApiSecretRegistrationTargetAudience.HomeTenant,
      specificAppId: "mockedAppId",
    });
    vi.spyOn(teamsGraphClient, "getApiKeyRegistrationById").mockResolvedValue({
      id: "mockedRegistrationId",
      description: "mockedDescription",
      clientSecrets: [],
      targetUrlsShouldStartWith: ["https://test"],
      applicableToApps: ApiSecretRegistrationAppType.AnyApp,
      targetAudience: ApiSecretRegistrationTargetAudience.AnyTenant,
    });

    vi.spyOn(mockedDriverContext.ui, "confirm").mockImplementation(async (config) => {
      expect((config as ConfirmConfig).title.includes("description")).to.be.true;
      expect((config as ConfirmConfig).title.includes("applicableToApps")).to.be.true;
      expect((config as ConfirmConfig).title.includes("specificAppId")).to.be.true;
      expect((config as ConfirmConfig).title.includes("targetAudience")).to.be.true;
      return ok({ type: "success", value: true });
    });

    const args: UpdateApiKeyArgs = {
      name: "test2",
      appId: "mockedAppId",
      targetAudience: "HomeTenant",
      applicableToApps: "SpecificApp",
      registrationId: "mockedRegistrationId",
      baseUrl: "https://test",
    };

    const result = await updateApiKeyDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.size).to.equal(0);
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: does not update when no changes", async () => {
    vi.spyOn(teamsGraphClient, "getApiKeyRegistrationById").mockResolvedValue({
      id: "test",
      description: "test",
      clientSecrets: [],
      targetUrlsShouldStartWith: ["https://test"],
      applicableToApps: ApiSecretRegistrationAppType.AnyApp,
      targetAudience: ApiSecretRegistrationTargetAudience.AnyTenant,
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
    const args: UpdateApiKeyArgs = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      targetAudience: "AnyTenant",
      applicableToApps: "AnyApp",
      registrationId: "mockedRegistrationId",
    };
    const result = await updateApiKeyDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.size).to.equal(0);
      expect(result.summaries.length).to.equal(1);
    }
  });

  it("happy path: should not show confirm when only devtunnel url is different", async () => {
    vi.spyOn(teamsGraphClient, "updateApiKeyRegistration").mockResolvedValue({
      description: "test",
      targetUrlsShouldStartWith: ["https://test2.asse.devtunnels.ms"],
      applicableToApps: ApiSecretRegistrationAppType.AnyApp,
      targetAudience: ApiSecretRegistrationTargetAudience.AnyTenant,
    });
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(teamsGraphClient, "getApiKeyRegistrationById").mockResolvedValue({
      id: "test",
      description: "test",
      clientSecrets: [],
      targetUrlsShouldStartWith: ["https://test.asse.devtunnels.ms"],
      applicableToApps: ApiSecretRegistrationAppType.AnyApp,
      targetAudience: ApiSecretRegistrationTargetAudience.AnyTenant,
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

    const confirmStub = vi
      .spyOn(mockedDriverContext.ui, "confirm")
      .mockResolvedValue(ok({ type: "success", value: true }));

    const args: UpdateApiKeyArgs = {
      name: "test",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      targetAudience: "AnyTenant",
      applicableToApps: "AnyApp",
      registrationId: "mockedRegistrationId",
    };

    const result = await updateApiKeyDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.size).to.equal(0);
      expect(result.summaries.length).to.equal(1);
    }
    expect(confirmStub.mock.calls.length === 0).to.be.true;
  });

  it("should throw error when user canel", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    vi.spyOn(teamsGraphClient, "getApiKeyRegistrationById").mockResolvedValue({
      id: "mockedRegistrationId",
      description: "mockedDescription",
      clientSecrets: [],
      targetUrlsShouldStartWith: ["https://test"],
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
        {
          api: "api2",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test2",
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

    vi.spyOn(mockedDriverContext.ui, "confirm").mockReturnValue(
      err(new UserError("source", "userCancelled", "Cancel by user"))
    );

    const args: UpdateApiKeyArgs = {
      name: "test2",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      targetAudience: "HomeTenant",
      applicableToApps: "SpecificApp",
      registrationId: "mockedRegistrationId",
    };

    const result = await updateApiKeyDriver.execute(args, mockedDriverContext);
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
      registrationId: "mockedRegistrationId",
    };
    const result = await updateApiKeyDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
    }
  });

  it("should throw error if name is too long", async () => {
    const args: any = {
      name: "a".repeat(129),
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      registrationId: "mockedRegistrationId",
    };
    const result = await updateApiKeyDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("ApiKeyNameTooLong");
    }
  });

  it("should throw error if missing registrationId", async () => {
    const args: any = {
      name: "name",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
    };
    const result = await updateApiKeyDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
    }
  });

  it("should throw error if missing both baseUrl and apiSpecPath", async () => {
    const args: any = {
      name: "name",
      appId: "mockedAppId",
      regirstrationid: "mockedRegistrationId",
    };
    const result = await updateApiKeyDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message).to.include("baseUrl");
      expect(result.result.error.message).to.include("apiSpecPath");
    }
  });

  it("should throw error if apiSpecPath is not string", async () => {
    const args: any = {
      name: "name",
      appId: "mockedAppId",
      regirstrationid: "mockedRegistrationId",
      apiSpecPath: ["invalidPathType"],
    };
    const result = await updateApiKeyDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message).to.include("apiSpecPath");
    }
  });

  it("should throw error if baseURL is not valid https url", async () => {
    const args: any = {
      name: "name",
      appId: "mockedAppId",
      regirstrationid: "mockedRegistrationId",
      baseUrl: "http://test",
    };
    const result = await updateApiKeyDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message).to.include("baseUrl");
    }
  });

  it("should throw error if invalid applicableToApps", async () => {
    const args: any = {
      name: "name",
      appId: "mockedAppId",
      regirstrationid: "mockedRegistrationId",
      apiSpecPath: "mockedPath",
      applicableToApps: "test",
    };
    const result = await updateApiKeyDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
    }
  });

  it("should throw error if invalid targetAudience", async () => {
    const args: any = {
      name: "name",
      appId: "mockedAppId",
      regirstrationid: "mockedRegistrationId",
      apiSpecPath: "mockedPath",
      targetAudience: "test",
    };
    const result = await updateApiKeyDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
    }
  });

  it("should throw error when unhandled error", async () => {
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
          operationId: "get",
          auth: {
            name: "test2",
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
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);

    const args: UpdateApiKeyArgs = {
      name: "test2",
      appId: "mockedAppId",
      apiSpecPath: "mockedPath",
      targetAudience: "HomeTenant",
      applicableToApps: "SpecificApp",
      registrationId: "mockedRegistrationId",
    };

    const result = await updateApiKeyDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.source).to.equal("apiKeyUpdate");
    }
  });
});
