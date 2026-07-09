// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError, err } from "@microsoft/teamsfx-api";
import mockedEnv, { RestoreFn } from "mocked-env";
import { teamsGraphClient } from "../../../../src/client/teamsGraphClient";
import { setTools } from "../../../../src/common/globalVars";
import { CreateDcrDriver } from "../../../../src/component/driver/dcr/create";
import {
  OauthRegistrationAppType,
  OauthRegistrationTargetAudience,
} from "../../../../src/component/driver/teamsApp/interfaces/OauthRegistration";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";
import { MockedAzureAccountProvider, MockedM365Provider } from "../../../core/utils";
import { chai, expect, vi } from "vitest";

const expect = chai.expect;

const outputKeys = {
  configurationId: "DCR_REGISTRATION_ID",
};
const outputEnvVarNames = new Map<string, string>(Object.entries(outputKeys));

const fakeOauthConfigId = "fake-dcr-oauth-config-id-001";

const fakeCreateDcrResponse = {
  configurationRegistrationId: {
    oAuthConfigId: fakeOauthConfigId,
  },
  resourceIdentifierUri: "https://fake-resource-identifier-uri",
};

describe("CreateDcrDriver", () => {
  const mockedDriverContext: any = {
    m365TokenProvider: new MockedM365Provider(),
    logProvider: new MockedLogProvider(),
    ui: new MockedUserInteraction(),
  };
  const createDcrDriver = new CreateDcrDriver();

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

  // Test #1 — Happy path
  it("happy path: should call createDcrRegistration with expected body and return oAuthConfigId", async () => {
    const stub = vi
      .spyOn(teamsGraphClient, "createDcrRegistration")
      .mockImplementation(async (token, dcrRegistration) => {
        // Assert the body fields match the input
        expect(dcrRegistration.clientName).to.equal("cloudflare-radar-dcr");
        expect(dcrRegistration.wellKnownAuthorizationServer).to.equal(
          "https://radar.mcp.cloudflare.com/.well-known/oauth-authorization-server"
        );
        expect(dcrRegistration.applicableToApps).to.equal(OauthRegistrationAppType.AnyApp);
        expect(dcrRegistration.targetAudience).to.equal(OauthRegistrationTargetAudience.HomeTenant);
        // When applicableToApps is AnyApp, m365AppId must be empty string
        expect(dcrRegistration.m365AppId).to.equal("");
        expect(dcrRegistration.targetUrlsShouldStartWith).to.deep.equal([
          "https://radar.mcp.cloudflare.com",
        ]);
        return fakeCreateDcrResponse;
      });

    const args: any = {
      name: "cloudflare-radar-dcr",
      appId: "mocked-teams-app-id",
      wellKnownAuthorizationServer:
        "https://radar.mcp.cloudflare.com/.well-known/oauth-authorization-server",
      targetUrlsShouldStartWith: ["https://radar.mcp.cloudflare.com"],
    };

    const result = await createDcrDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.get(outputKeys.configurationId)).to.equal(fakeOauthConfigId);
    }
    expect(stub.mock.calls.length === 1).to.be.true;
  });

  // Test #2 — Idempotency: env var already set => no POST, empty outputs
  it("idempotency: should skip POST when configurationId already exists in env", async () => {
    const stub = vi
      .spyOn(teamsGraphClient, "createDcrRegistration")
      .mockResolvedValue(fakeCreateDcrResponse);

    envRestore = mockedEnv({
      [outputKeys.configurationId]: "existing-id",
    });

    const args: any = {
      name: "cloudflare-radar-dcr",
      appId: "mocked-teams-app-id",
      wellKnownAuthorizationServer:
        "https://radar.mcp.cloudflare.com/.well-known/oauth-authorization-server",
      targetUrlsShouldStartWith: ["https://radar.mcp.cloudflare.com"],
    };

    const result = await createDcrDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      // No new outputs written — idempotency preserves the existing env var
      expect(result.result.value.size).to.equal(0);
    }
    // The stub must NOT have been called
    expect(stub.mock.calls.length > 0).to.be.false;
  });

  // Test #3 — Missing `name`
  it("should return InvalidActionInputError when name is missing", async () => {
    const args: any = {
      appId: "mocked-teams-app-id",
      wellKnownAuthorizationServer:
        "https://radar.mcp.cloudflare.com/.well-known/oauth-authorization-server",
      targetUrlsShouldStartWith: ["https://radar.mcp.cloudflare.com"],
    };

    const result = await createDcrDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message).to.include("name");
    }
  });

  // Test #3b — Missing `appId` when applicableToApps is SpecificApp
  it("should return InvalidActionInputError when appId is missing and applicableToApps is SpecificApp", async () => {
    const args: any = {
      name: "cloudflare-radar-dcr",
      wellKnownAuthorizationServer:
        "https://radar.mcp.cloudflare.com/.well-known/oauth-authorization-server",
      targetUrlsShouldStartWith: ["https://radar.mcp.cloudflare.com"],
      applicableToApps: "SpecificApp",
    };

    const result = await createDcrDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message).to.include("appId");
    }
  });

  // Test #3c — Missing `appId` when applicableToApps is AnyApp (default) => no error
  it("should succeed when appId is omitted and applicableToApps defaults to AnyApp", async () => {
    vi.spyOn(teamsGraphClient, "createDcrRegistration").mockResolvedValue(fakeCreateDcrResponse);

    const args: any = {
      name: "cloudflare-radar-dcr",
      wellKnownAuthorizationServer:
        "https://radar.mcp.cloudflare.com/.well-known/oauth-authorization-server",
      targetUrlsShouldStartWith: ["https://radar.mcp.cloudflare.com"],
    };

    const result = await createDcrDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isOk()).to.be.true;
  });

  // Test #4 — Missing `wellKnownAuthorizationServer`
  it("should return InvalidActionInputError when wellKnownAuthorizationServer is missing", async () => {
    const args: any = {
      name: "cloudflare-radar-dcr",
      appId: "mocked-teams-app-id",
      targetUrlsShouldStartWith: ["https://radar.mcp.cloudflare.com"],
    };

    const result = await createDcrDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message).to.include("wellKnownAuthorizationServer");
    }
  });

  // Test #5 — Name length > 128 => DcrNameTooLongError
  it("should return DcrNameTooLongError when name exceeds 128 characters", async () => {
    const args: any = {
      name: "a".repeat(129),
      appId: "mocked-teams-app-id",
      wellKnownAuthorizationServer:
        "https://radar.mcp.cloudflare.com/.well-known/oauth-authorization-server",
      targetUrlsShouldStartWith: ["https://radar.mcp.cloudflare.com"],
    };

    const result = await createDcrDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("DcrNameTooLong");
    }
  });

  // Test #6 — Malformed wellKnownAuthorizationServer => DcrWellKnownInvalidError
  it("should return DcrWellKnownInvalidError when wellKnownAuthorizationServer is not a valid URL", async () => {
    const args: any = {
      name: "cloudflare-radar-dcr",
      appId: "mocked-teams-app-id",
      wellKnownAuthorizationServer: "not-a-url",
      targetUrlsShouldStartWith: ["https://radar.mcp.cloudflare.com"],
    };

    const result = await createDcrDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("DcrWellKnownInvalid");
    }
  });

  // Test #7a — TGS throws SystemError => passes through unchanged
  it("should propagate SystemError thrown by createDcrRegistration", async () => {
    vi.spyOn(teamsGraphClient, "createDcrRegistration").mockImplementation(() => {
      throw new SystemError("TeamsGraph", "DcrCallFailed", "TGS returned 4xx");
    });

    const args: any = {
      name: "cloudflare-radar-dcr",
      appId: "mocked-teams-app-id",
      wellKnownAuthorizationServer:
        "https://radar.mcp.cloudflare.com/.well-known/oauth-authorization-server",
      targetUrlsShouldStartWith: ["https://radar.mcp.cloudflare.com"],
    };

    const result = await createDcrDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("DcrCallFailed");
    }
  });

  // Test #7b — TGS throws generic Error => wrapped via assembleError
  it("should wrap generic Error thrown by createDcrRegistration via assembleError", async () => {
    vi.spyOn(teamsGraphClient, "createDcrRegistration").mockImplementation(() => {
      throw new Error("unexpected TGS failure");
    });

    const args: any = {
      name: "cloudflare-radar-dcr",
      appId: "mocked-teams-app-id",
      wellKnownAuthorizationServer:
        "https://radar.mcp.cloudflare.com/.well-known/oauth-authorization-server",
      targetUrlsShouldStartWith: ["https://radar.mcp.cloudflare.com"],
    };

    const result = await createDcrDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      // assembleError calls camelCase() on the source, so "dcr/register" becomes "dcrRegister"
      expect(result.result.error.source).to.equal("dcrRegister");
    }
  });

  // Test #8 — Token-provider error => propagated
  it("should propagate error when m365TokenProvider.getAccessToken returns err", async () => {
    vi.spyOn(MockedM365Provider.prototype, "getAccessToken").mockResolvedValue(
      err(new SystemError("M365Provider", "TokenFetchFailed", "token error"))
    );

    const args: any = {
      name: "cloudflare-radar-dcr",
      appId: "mocked-teams-app-id",
      wellKnownAuthorizationServer:
        "https://radar.mcp.cloudflare.com/.well-known/oauth-authorization-server",
      targetUrlsShouldStartWith: ["https://radar.mcp.cloudflare.com"],
    };

    const result = await createDcrDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("TokenFetchFailed");
    }
  });

  // Test #9 — outputEnvVarNames undefined => OutputEnvironmentVariableUndefinedError
  it("should return OutputEnvironmentVariableUndefinedError when outputEnvVarNames is undefined", async () => {
    const args: any = {
      name: "cloudflare-radar-dcr",
      appId: "mocked-teams-app-id",
      wellKnownAuthorizationServer:
        "https://radar.mcp.cloudflare.com/.well-known/oauth-authorization-server",
      targetUrlsShouldStartWith: ["https://radar.mcp.cloudflare.com"],
    };

    const result = await createDcrDriver.execute(args, mockedDriverContext, undefined);

    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("OutputEnvironmentVariableUndefined");
    }
  });

  // Test #10 — applicableToApps === "SpecificApp" => m365AppId set to args.appId
  it("should set m365AppId to args.appId when applicableToApps is SpecificApp", async () => {
    const stub = vi
      .spyOn(teamsGraphClient, "createDcrRegistration")
      .mockImplementation(async (token, dcrRegistration) => {
        expect(dcrRegistration.applicableToApps).to.equal(OauthRegistrationAppType.SpecificApp);
        // Branch: applicableToApps === SpecificApp => m365AppId must equal args.appId
        expect(dcrRegistration.m365AppId).to.equal("mocked-teams-app-id");
        return fakeCreateDcrResponse;
      });

    const args: any = {
      name: "cloudflare-radar-dcr",
      appId: "mocked-teams-app-id",
      wellKnownAuthorizationServer:
        "https://radar.mcp.cloudflare.com/.well-known/oauth-authorization-server",
      targetUrlsShouldStartWith: ["https://radar.mcp.cloudflare.com"],
      applicableToApps: "SpecificApp",
    };

    const result = await createDcrDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      expect(result.result.value.get(outputKeys.configurationId)).to.equal(fakeOauthConfigId);
    }
    expect(stub.mock.calls.length === 1).to.be.true;
  });

  // Test #11 — applicableToApps with an invalid enum value
  it("should return InvalidActionInputError when applicableToApps is not a known value", async () => {
    const args: any = {
      name: "cloudflare-radar-dcr",
      appId: "mocked-teams-app-id",
      wellKnownAuthorizationServer:
        "https://radar.mcp.cloudflare.com/.well-known/oauth-authorization-server",
      applicableToApps: "NotARealValue",
    };

    const result = await createDcrDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message).to.include("applicableToApps");
    }
  });

  // Test #12 — targetAudience with an invalid enum value
  it("should return InvalidActionInputError when targetAudience is not a known value", async () => {
    const args: any = {
      name: "cloudflare-radar-dcr",
      appId: "mocked-teams-app-id",
      wellKnownAuthorizationServer:
        "https://radar.mcp.cloudflare.com/.well-known/oauth-authorization-server",
      targetAudience: "NotARealValue",
    };

    const result = await createDcrDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message).to.include("targetAudience");
    }
  });

  // Test #13 — targetUrlsShouldStartWith contains a non-URL entry
  it("should return InvalidActionInputError when targetUrlsShouldStartWith contains an invalid URL", async () => {
    const args: any = {
      name: "cloudflare-radar-dcr",
      appId: "mocked-teams-app-id",
      wellKnownAuthorizationServer:
        "https://radar.mcp.cloudflare.com/.well-known/oauth-authorization-server",
      targetUrlsShouldStartWith: ["https://radar.mcp.cloudflare.com", "not-a-url"],
    };

    const result = await createDcrDriver.execute(args, mockedDriverContext, outputEnvVarNames);

    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.equal("InvalidActionInputError");
      expect(result.result.error.message).to.include("targetUrlsShouldStartWith");
    }
  });
});
