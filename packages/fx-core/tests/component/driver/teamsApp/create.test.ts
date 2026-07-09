// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { err, ok, TeamsAppManifest, UserError } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import mockedEnv from "mocked-env";
import { v4 as uuid } from "uuid";
import { teamsDevPortalClient } from "../../../../src/client/teamsDevPortalClient";
import { SovereignCloudEnvironment } from "../../../../src/common/accountUtils";
import { FeatureFlagName } from "../../../../src/common/featureFlags";
import { ExecutionResult } from "../../../../src/component/driver/interface/stepDriver";
import { CreateTeamsAppDriver } from "../../../../src/component/driver/teamsApp/create";
import { CreateAppPackageDriver } from "../../../../src/component/driver/teamsApp/createAppPackage";
import { CreateTeamsAppArgs } from "../../../../src/component/driver/teamsApp/interfaces/CreateTeamsAppArgs";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";
import { Constants } from "./../../../../src/component/driver/teamsApp/constants";
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

  const appDef: AppDefinition = {
    appName: "fake",
    teamsAppId: uuid(),
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
    const importAppSpy = vi.spyOn(teamsDevPortalClient, "importApp");
    const readFileStub = vi.spyOn(fs, "readFile");

    const args: CreateTeamsAppArgs = {
      name: appDef.appName!,
    };

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isOk());
    expect(importAppSpy).not.toHaveBeenCalled();
    expect(readFileStub).not.toHaveBeenCalled();
  });

  it("skip create in DoD", async () => {
    restoreEnv = mockedEnv({
      [FeatureFlagName.SovereignCloudEnvironment]: SovereignCloudEnvironment.DOD,
    });
    const importAppSpy = vi.spyOn(teamsDevPortalClient, "importApp");
    const readFileStub = vi.spyOn(fs, "readFile");

    const args: CreateTeamsAppArgs = {
      name: appDef.appName!,
    };

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isOk());
    expect(importAppSpy).not.toHaveBeenCalled();
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

    const zipFileName =
      "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip";

    const stubResult: ExecutionResult = {
      summaries: [],
      result: ok(new Map([["TEAMS_APP_PACKAGE_PATH", zipFileName]])),
    };
    vi.spyOn(CreateAppPackageDriver.prototype, "execute").mockResolvedValue(stubResult);
    vi.spyOn(teamsDevPortalClient, "getApp").mockImplementation(() => {
      throw new Error("404");
    });
    vi.spyOn(teamsDevPortalClient, "importApp").mockResolvedValue(appDef);
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      const zip = new AdmZip();
      zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(new TeamsAppManifest())));
      zip.addFile("color.png", Buffer.from(""));
      zip.addFile("outlie.png", Buffer.from(""));

      const archivedFile = zip.toBuffer();
      return archivedFile;
    });

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    console.log(JSON.stringify(result));
    chai.assert.isTrue(result.isOk());

    const executeResult = await teamsAppDriver.execute(args, mockedDriverContext);
    chai.assert.isTrue(executeResult.result.isOk());
    chai.assert.isTrue(executeResult.summaries.length > 0);
  });

  it("app exists", async () => {
    const args: CreateTeamsAppArgs = {
      name: appDef.appName!,
    };

    restoreEnv = mockedEnv({ TEAMS_APP_ID: uuid() });
    vi.spyOn(teamsDevPortalClient, "getApp").mockResolvedValue(appDef);

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    console.log(JSON.stringify(result));
    chai.assert.isTrue(result.isOk());
  });

  it("API failure", async () => {
    const args: CreateTeamsAppArgs = {
      name: appDef.appName!,
    };
    vi.spyOn(teamsDevPortalClient, "getApp").mockImplementation(() => {
      throw new Error("404");
    });
    vi.spyOn(teamsDevPortalClient, "importApp").mockImplementation(() => {
      throw new Error("409");
    });
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);

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
    vi.spyOn(teamsDevPortalClient, "importApp").mockResolvedValue(appDef);
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      const zip = new AdmZip();
      zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(new TeamsAppManifest())));
      zip.addFile("color.png", Buffer.from(""));
      zip.addFile("outline.png", Buffer.from(""));
      return zip.toBuffer();
    });

    const outputEnvVarNames = new Map<string, string>([
      ["teamsAppId", "MY_TEAMS_APP_ID"],
      ["teamsAppTenantId", "MY_TEAMS_APP_TENANT_ID"],
    ]);

    const result = (await teamsAppDriver.execute(args, mockedDriverContext, outputEnvVarNames))
      .result;
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.equal(result.value.get("MY_TEAMS_APP_ID"), appDef.teamsAppId);
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
    vi.spyOn(teamsDevPortalClient, "importApp").mockResolvedValue(appDef);
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      const zip = new AdmZip();
      zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(new TeamsAppManifest())));
      zip.addFile("color.png", Buffer.from(""));
      zip.addFile("outline.png", Buffer.from(""));
      return zip.toBuffer();
    });

    const outputEnvVarNames = new Map<string, string>([["teamsAppId", "TEAMS_APP_ID"]]);

    const result = (await teamsAppDriver.execute(args, mockedDriverContext, outputEnvVarNames))
      .result;
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.equal(result.value.get("TEAMS_APP_ID"), appDef.teamsAppId);
      chai.assert.equal(result.value.get("TEAMS_APP_TENANT_ID"), appDef.tenantId);
    }
  });
});
