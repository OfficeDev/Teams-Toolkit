// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { err, UserError } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import mockedEnv from "mocked-env";
import { v4 as uuid } from "uuid";
import { teamsDevPortalClient } from "../../../../src/client/teamsDevPortalClient";
import { SovereignCloudEnvironment } from "../../../../src/common/accountUtils";
import { FeatureFlagName } from "../../../../src/common/featureFlags";
import { CreateTeamsAppDriver } from "../../../../src/component/driver/teamsApp/create";
import { CreateTeamsAppArgs } from "../../../../src/component/driver/teamsApp/interfaces/CreateTeamsAppArgs";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";
import { AppDefinition } from "./../../../../src/component/driver/teamsApp/interfaces/appdefinitions/appDefinition";
import { MockedM365Provider } from "../../../core/utils";
import { chai, expect, vi } from "vitest";

describe("teamsApp/create", async () => {
  const teamsAppDriver = new CreateTeamsAppDriver();
  let restoreEnv: (() => void) | undefined;
  const mockedDriverContext: any = {
    m365TokenProvider: new MockedM365Provider(),
    logProvider: new MockedLogProvider(),
    ui: new MockedUserInteraction(),
    projectPath: "./",
  };

  const appId = uuid();
  const appDef: AppDefinition = {
    appId,
    appName: "fake",
    teamsAppId: appId,
    userList: [],
    tenantId: uuid(),
  };

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv?.();
    restoreEnv = undefined;
  });

  it("skip create in GCCH", async () => {
    restoreEnv = mockedEnv({
      [FeatureFlagName.SovereignCloudEnvironment]: SovereignCloudEnvironment.GCCH,
    });
    const createAppSpy = vi.spyOn(teamsDevPortalClient, "createApp");
    const readFileStub = vi.spyOn(fs, "readFile");

    const args: CreateTeamsAppArgs = {
      name: appDef.appName!,
    };

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isOk());
    expect(createAppSpy).not.toHaveBeenCalled();
    expect(readFileStub).not.toHaveBeenCalled();
  });

  it("skip create in DoD", async () => {
    restoreEnv = mockedEnv({
      [FeatureFlagName.SovereignCloudEnvironment]: SovereignCloudEnvironment.DOD,
    });
    const createAppSpy = vi.spyOn(teamsDevPortalClient, "createApp");
    const readFileStub = vi.spyOn(fs, "readFile");

    const args: CreateTeamsAppArgs = {
      name: appDef.appName!,
    };

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isOk());
    expect(createAppSpy).not.toHaveBeenCalled();
    expect(readFileStub).not.toHaveBeenCalled();
  });

  it("invalid param error", async () => {
    const args: CreateTeamsAppArgs = {
      name: "",
    };
    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.equal("InvalidActionInputError", result.error.name);
    }
  });

  it("happy path", async () => {
    const args: CreateTeamsAppArgs = {
      name: appDef.appName!,
    };

    vi.spyOn(teamsDevPortalClient, "getApp").mockImplementation(() => {
      throw new Error("404");
    });
    const createAppSpy = vi.spyOn(teamsDevPortalClient, "createApp").mockResolvedValue(appDef);
    const readFileSpy = vi.spyOn(fs, "readFile");

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert.isTrue(result.isOk());
    expect(createAppSpy).toHaveBeenCalledWith("fakeToken", appDef.appName);
    expect(readFileSpy).not.toHaveBeenCalled();
    if (result.isOk()) {
      chai.assert.equal(result.value.get("TEAMS_APP_ID"), appId);
    }
  });

  it("app exists", async () => {
    const args: CreateTeamsAppArgs = {
      name: appDef.appName!,
    };

    restoreEnv = mockedEnv({ TEAMS_APP_ID: appId });
    vi.spyOn(teamsDevPortalClient, "getApp").mockResolvedValue(appDef);
    const createAppSpy = vi.spyOn(teamsDevPortalClient, "createApp");

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert.isTrue(result.isOk());
    expect(createAppSpy).not.toHaveBeenCalled();
  });

  it("does not create a replacement when existing app lookup fails", async () => {
    const args: CreateTeamsAppArgs = {
      name: appDef.appName!,
    };

    restoreEnv = mockedEnv({ TEAMS_APP_ID: appId });
    vi.spyOn(teamsDevPortalClient, "getApp").mockRejectedValue(new Error("lookup failed"));
    const createAppSpy = vi.spyOn(teamsDevPortalClient, "createApp");

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;

    chai.assert.isTrue(result.isErr());
    expect(createAppSpy).not.toHaveBeenCalled();
  });

  it("reuses the created app when provision is retried", async () => {
    const args: CreateTeamsAppArgs = { name: appDef.appName! };
    const createAppSpy = vi.spyOn(teamsDevPortalClient, "createApp").mockResolvedValue(appDef);
    const getAppSpy = vi.spyOn(teamsDevPortalClient, "getApp").mockResolvedValue(appDef);

    const firstResult = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert.isTrue(firstResult.isOk());

    restoreEnv = mockedEnv({ TEAMS_APP_ID: appId });
    const retryResult = (await teamsAppDriver.execute(args, mockedDriverContext)).result;

    chai.assert.isTrue(retryResult.isOk());
    expect(createAppSpy).toHaveBeenCalledOnce();
    expect(getAppSpy).toHaveBeenCalledWith("fakeToken", appId);
  });

  it("API failure", async () => {
    const args: CreateTeamsAppArgs = {
      name: appDef.appName!,
    };
    vi.spyOn(teamsDevPortalClient, "getApp").mockImplementation(() => {
      throw new Error("404");
    });
    vi.spyOn(teamsDevPortalClient, "createApp").mockImplementation(() => {
      throw new Error("409");
    });

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert.isTrue(result.isErr());
  });

  it("Token error", async () => {
    const args: CreateTeamsAppArgs = {
      name: appDef.appName!,
    };
    vi.spyOn(MockedM365Provider.prototype, "getAccessToken").mockResolvedValue(
      err(new UserError({}))
    );
    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert.isTrue(result.isErr());
  });

  it("respects user-configured teamsAppTenantId env var name", async () => {
    const args: CreateTeamsAppArgs = {
      name: appDef.appName!,
    };

    vi.spyOn(teamsDevPortalClient, "getApp").mockImplementation(() => {
      throw new Error("404");
    });
    vi.spyOn(teamsDevPortalClient, "createApp").mockResolvedValue(appDef);

    const outputEnvVarNames = new Map<string, string>([
      ["teamsAppId", "MY_TEAMS_APP_ID"],
      ["teamsAppTenantId", "MY_TEAMS_APP_TENANT_ID"],
    ]);

    const result = (await teamsAppDriver.execute(args, mockedDriverContext, outputEnvVarNames))
      .result;
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.equal(result.value.get("MY_TEAMS_APP_ID"), appDef.appId);
      chai.assert.equal(result.value.get("MY_TEAMS_APP_TENANT_ID"), appDef.tenantId);
      // The internal default name must not leak through when the author
      // configured a custom env var name.
      chai.assert.isFalse(result.value.has("TEAMS_APP_TENANT_ID"));
    }
  });

  it("falls back to TEAMS_APP_TENANT_ID when teamsAppTenantId is not configured", async () => {
    const args: CreateTeamsAppArgs = {
      name: appDef.appName!,
    };

    vi.spyOn(teamsDevPortalClient, "getApp").mockImplementation(() => {
      throw new Error("404");
    });
    vi.spyOn(teamsDevPortalClient, "createApp").mockResolvedValue(appDef);

    const outputEnvVarNames = new Map<string, string>([["teamsAppId", "TEAMS_APP_ID"]]);

    const result = (await teamsAppDriver.execute(args, mockedDriverContext, outputEnvVarNames))
      .result;
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.equal(result.value.get("TEAMS_APP_ID"), appDef.appId);
      chai.assert.equal(result.value.get("TEAMS_APP_TENANT_ID"), appDef.tenantId);
    }
  });
});
