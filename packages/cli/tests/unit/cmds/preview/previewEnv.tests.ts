// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  err,
  FxError,
  IProgressHandler,
  ok,
  Result,
  signedIn,
  signedOut,
  UserError,
} from "@microsoft/teamsfx-api";
import { envUtil, FxCore, HubTypes, VersionCheckRes, VersionState } from "@microsoft/teamsfx-core";
import * as settingHelper from "@microsoft/teamsfx-core/build/common/projectSettingsHelper";
import * as tools from "@microsoft/teamsfx-core/build/common/tools";
import * as packageJson from "@microsoft/teamsfx-core/build/component/local/packageJsonHelper";
import fs from "fs-extra";
import { RestoreFn } from "mocked-env";
import * as path from "path";
import * as commonUtils from "../../../../src/cmds/preview/commonUtils";
import * as constants from "../../../../src/cmds/preview/constants";
import * as launch from "../../../../src/cmds/preview/launch";
import PreviewEnv from "../../../../src/cmds/preview/previewEnv";
import { ServiceLogWriter } from "../../../../src/cmds/preview/serviceLogWriter";
import { Task } from "../../../../src/cmds/preview/task";
import cliLogger from "../../../../src/commonlib/log";
import M365TokenInstance from "../../../../src/commonlib/M365TokenProviderWrapper";
import cliTelemetry from "../../../../src/telemetry/cliTelemetry";
import CLIUIInstance from "../../../../src/userInteraction";
import { expect } from "../../utils";
import { vi } from "vitest";
describe("Preview --env", () => {
  const sandbox = vi;
  let mockedEnvRestore: RestoreFn = () => {};
  let options: string[] = [];
  let defaultOptions: { [k: string]: any } = {};
  let logs: string[] = [];
  let telemetries: any[] = [];

  beforeEach(() => {
    mockedEnvRestore = () => {};
    options = [];
    defaultOptions = { folder: "./", env: "local" };
    logs = [];
    telemetries = [];
    vi.spyOn(process, "exit");
    vi.spyOn(cliLogger, "necessaryLog").mockImplementation((lv, msg, white) => {
      logs.push(msg);
    });
    vi.spyOn(cliLogger, "outputInfo").mockImplementation((message: string) => {
      logs.push(message);
    });
    vi.spyOn(cliLogger, "outputError").mockImplementation((message: string) => {
      logs.push(message);
    });
    vi.spyOn(cliLogger, "outputSuccess").mockImplementation((message: string) => {
      logs.push(message);
    });
    vi.spyOn(cliTelemetry, "sendTelemetryEvent").mockImplementation((eventName, properties) => {
      telemetries.push([eventName, properties]);
    });
    vi.spyOn(cliTelemetry, "sendTelemetryErrorEvent").mockImplementation(
      (eventName, error, properties) => {
        telemetries.push([eventName, error, properties]);
      }
    );
    vi.spyOn(FxCore.prototype, "projectVersionCheck").mockResolvedValue(
      ok<VersionCheckRes, FxError>({
        isSupport: VersionState.compatible,
        versionSource: "",
        currentVersion: "1.0.0",
        trackingId: "",
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockedEnvRestore();
  });

  it("Preview Command Running - Default", async () => {
    vi.spyOn(PreviewEnv.prototype as any, "isValidProjectV3").mockReturnValue(true);
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"checkM365Account").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"previewWithManifest").mockResolvedValue(ok("test-url"));
    vi.spyOn(PreviewEnv.prototype, <any>"detectRunCommand").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"runCommandAsTask").mockResolvedValue(ok(null));
    vi.spyOn(PreviewEnv.prototype, <any>"launchBrowser").mockResolvedValue(ok(null));
    const cmd = new PreviewEnv();
    await cmd.runCommand(defaultOptions);
    expect(logs.length >= 1).to.be.true;
    expect(logs[0]).satisfy((l: string) => l.includes("run-command"));
  });

  it("Preview Command Running - outlook", async () => {
    vi.spyOn(PreviewEnv.prototype as any, "isValidProjectV3").mockReturnValue(true);
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"checkM365Account").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"previewWithManifest").mockResolvedValue(ok("test-url"));
    vi.spyOn(PreviewEnv.prototype, <any>"detectRunCommand").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"runCommandAsTask").mockResolvedValue(ok(null));
    vi.spyOn(PreviewEnv.prototype, <any>"launchBrowser").mockResolvedValue(ok(null));
    const cmd = new PreviewEnv();
    await cmd.runCommand({
      ...defaultOptions,
      ["m365-host"]: "outlook",
      ["browser-arg"]: ["--guest"],
      ["open-only"]: true,
    });
    expect(logs.length >= 0).to.be.true;
  });

  it("Preview Command Running - office", async () => {
    vi.spyOn(PreviewEnv.prototype as any, "isValidProjectV3").mockReturnValue(true);
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"checkM365Account").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"previewWithManifest").mockResolvedValue(ok("test-url"));
    vi.spyOn(PreviewEnv.prototype, <any>"detectRunCommand").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"runCommandAsTask").mockResolvedValue(ok(null));
    vi.spyOn(PreviewEnv.prototype, <any>"launchBrowser").mockResolvedValue(ok(null));

    const cmd = new PreviewEnv();
    await cmd.runCommand({
      ...defaultOptions,
      env: "dev",
      ["m365-host"]: "office",
      ["browser-arg"]: ["--guest"],
    });

    expect(logs.length >= 0).to.be.true;
  });

  it("Preview Command Running - workspace not supported error", async () => {
    vi.spyOn(PreviewEnv.prototype as any, "isValidProjectV3").mockReturnValue(false);

    const cmd = new PreviewEnv();
    const result = await cmd.runCommand(defaultOptions);

    expect(result.isErr()).to.be.true;
    expect((result as any).error.name).equals("WorkspaceNotSupported");
  });

  it("Preview Command Running - load envs error", async () => {
    vi.spyOn(PreviewEnv.prototype as any, "isValidProjectV3").mockReturnValue(true);
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(err({ foo: "bar" } as any));

    const cmd = new PreviewEnv();
    const result = await cmd.runCommand(defaultOptions);

    expect(result.isErr()).to.be.true;
    expect((result as any).error).to.deep.equal({ foo: "bar" });
  });

  it("Preview Command Running - check account error", async () => {
    vi.spyOn(PreviewEnv.prototype as any, "isValidProjectV3").mockReturnValue(true);
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"checkM365Account").mockResolvedValue(
      err({ foo: "bar" } as any)
    );

    const cmd = new PreviewEnv();
    const result = await cmd.runCommand(defaultOptions);

    expect(result.isErr()).to.be.true;
    expect((result as any).error).to.deep.equal({ foo: "bar" });
  });

  it("Preview Command Running - previewWithManifest error", async () => {
    vi.spyOn(PreviewEnv.prototype as any, "isValidProjectV3").mockReturnValue(true);
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"checkM365Account").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"previewWithManifest").mockResolvedValue(
      err({ foo: "bar" } as any)
    );

    const cmd = new PreviewEnv();
    const result = await cmd.runCommand(defaultOptions);

    expect(result.isErr()).to.be.true;
    expect((result as any).error).to.deep.equal({ foo: "bar" });
  });

  it("Preview Command Running - detect run command error", async () => {
    vi.spyOn(PreviewEnv.prototype as any, "isValidProjectV3").mockReturnValue(true);
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"checkM365Account").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"previewWithManifest").mockResolvedValue(ok("test-url"));
    vi.spyOn(PreviewEnv.prototype, <any>"detectRunCommand").mockResolvedValue(
      err({ foo: "bar" } as any)
    );

    const cmd = new PreviewEnv();
    const result = await cmd.runCommand(defaultOptions);

    expect(result.isErr()).to.be.true;
    expect((result as any).error).to.deep.equal({ foo: "bar" });
  });

  it("Preview Command Running - run task error", async () => {
    vi.spyOn(PreviewEnv.prototype as any, "isValidProjectV3").mockReturnValue(true);
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"checkM365Account").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"previewWithManifest").mockResolvedValue(ok("test-url"));
    vi.spyOn(PreviewEnv.prototype, <any>"detectRunCommand").mockResolvedValue(
      ok({ runCommand: "npm start" })
    );
    vi.spyOn(PreviewEnv.prototype, <any>"runCommandAsTask").mockResolvedValue(
      err({ foo: "bar" } as any)
    );

    const cmd = new PreviewEnv();
    const result = await cmd.runCommand(defaultOptions);
    expect(result.isErr()).to.be.true;
    expect((result as any).error).to.deep.equal({ foo: "bar" });
  });

  it("Preview Command Running - launch browser error", async () => {
    vi.spyOn(PreviewEnv.prototype as any, "isValidProjectV3").mockReturnValue(true);
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"checkM365Account").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"previewWithManifest").mockResolvedValue(ok("test-url"));
    vi.spyOn(PreviewEnv.prototype, <any>"detectRunCommand").mockResolvedValue(ok({}));
    vi.spyOn(PreviewEnv.prototype, <any>"runCommandAsTask").mockResolvedValue(ok(null));
    vi.spyOn(PreviewEnv.prototype, <any>"launchBrowser").mockResolvedValue(
      err({ foo: "bar" } as any)
    );
    const cmd = new PreviewEnv();
    const result = await cmd.runCommand(defaultOptions);
    expect(result.isErr()).to.be.true;
    expect((result as any).error).to.deep.equal({ foo: "bar" });
  });
});

describe("PreviewEnv Steps", () => {
  const sandbox = vi;
  let mockedEnvRestore: RestoreFn = () => {};
  let logs: string[] = [];
  let telemetries: any[] = [];

  // wrapper class to expose protected functions
  class PreviewEnvTest extends PreviewEnv {
    public checkM365Account(appTenantId?: string): Promise<
      Result<
        {
          tenantId?: string;
          loginHint?: string;
        },
        FxError
      >
    > {
      return super.checkM365Account(appTenantId);
    }

    public async detectRunCommand(projectPath: string): Promise<
      Result<
        {
          runCommand: string;
        },
        FxError
      >
    > {
      return await super.detectRunCommand(projectPath);
    }

    public previewWithManifest(
      projectPath: string,
      env: string,
      hub: HubTypes,
      manifestFilePath: string
    ): Promise<Result<string, FxError>> {
      return super.previewWithManifest(projectPath, env, hub, manifestFilePath);
    }

    public runCommandAsTask(
      projectPath: string,
      runCommand: string,
      runningPatternRegex: RegExp,
      execPath: string
    ): Promise<Result<null, FxError>> {
      return super.runCommandAsTask(projectPath, runCommand, runningPatternRegex, execPath);
    }

    public launchBrowser(
      env: string,
      hub: HubTypes,
      url: string,
      browser: constants.Browser,
      browserArgs: string[]
    ): Promise<Result<null, FxError>> {
      return super.launchBrowser(env, hub, url, browser, browserArgs);
    }

    public launchDesktopClient(
      env: string,
      url: string,
      browser: constants.Browser,
      browserArgs: string[]
    ): Promise<Result<null, FxError>> {
      return super.launchDesktopClient(env, url, browser, browserArgs);
    }

    public getRunningTasks() {
      return this.runningTasks;
    }

    public isValidProjectV3Wrap(projectPath: string): boolean {
      return super.isValidProjectV3(projectPath);
    }

    public async getSideloadingStatusWrap(token: string): Promise<boolean> {
      return await super.getSideloadingStatus(token);
    }

    public async loadTeamsFxDevScriptWrap(projectPath: string): Promise<string | undefined> {
      return await super.loadTeamsFxDevScript(projectPath);
    }

    public createTaskStartCbWrap(
      progressBar: any,
      startMessage: string,
      telemetryProperties?: { [key: string]: string }
    ) {
      return super.createTaskStartCb(progressBar, startMessage, telemetryProperties);
    }

    public createTaskStopCbWrap(progressBar: any, telemetryProperties?: { [key: string]: string }) {
      return super.createTaskStopCb(progressBar, telemetryProperties);
    }

    public async openHubWebClientNewWrap(
      hub: HubTypes,
      url: string,
      browser: constants.Browser,
      browserArgs: string[]
    ): Promise<void> {
      return await super.openHubWebClientNew(hub, url, browser, browserArgs);
    }

    public async openTeamsDesktopClientWrap(
      url: string,
      username: string,
      browser: constants.Browser,
      browserArgs: string[]
    ): Promise<void> {
      return await super.openTeamsDesktopClient(url, username, browser, browserArgs);
    }
  }

  beforeEach(() => {
    mockedEnvRestore = () => {};
    logs = [];
    telemetries = [];
    vi.spyOn(cliLogger, "necessaryLog").mockImplementation((lv, msg, white) => {
      logs.push(msg);
    });
    vi.spyOn(cliTelemetry, "sendTelemetryEvent").mockImplementation((eventName, properties) => {
      telemetries.push([eventName, properties]);
    });
    vi.spyOn(cliTelemetry, "sendTelemetryErrorEvent").mockImplementation(
      (eventName, error, properties) => {
        telemetries.push([eventName, error, properties]);
      }
    );
    vi.spyOn(CLIUIInstance, "createProgressBar").mockReturnValue(new MockProgressHandler());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockedEnvRestore();
  });

  it("checkM365Account - signin", async () => {
    const token = "test-token";
    const tenantId = "test-tenant-id";
    const upn = "test-user";
    vi.spyOn(M365TokenInstance, "getStatus").mockReturnValue(
      Promise.resolve(
        ok({
          status: signedIn,
          token: token,
          accountInfo: {
            tid: tenantId,
            upn: upn,
          },
        })
      )
    );
    vi.spyOn(PreviewEnvTest.prototype as any, "getSideloadingStatus").mockResolvedValue(true);

    const previewEnv = new PreviewEnvTest();
    const accountRes = await previewEnv.checkM365Account(undefined);
    expect(accountRes.isOk()).to.be.true;
    const account = (accountRes as any).value;
    expect(account.tenantId).equals(tenantId);
    expect(account.loginHint).equals(upn);
  });

  it("checkM365Account - signout", async () => {
    const token = "test-token";
    const tenantId = "test-tenant-id";
    const upn = "test-user";
    const getStatusStub = vi.spyOn(M365TokenInstance, "getStatus");
    getStatusStub.mockResolvedValueOnce(
      ok({
        status: signedOut,
      })
    );
    getStatusStub.mockResolvedValueOnce(
      ok({
        status: signedIn,
        token: token,
        accountInfo: {
          tid: tenantId,
          upn: upn,
        },
      })
    );
    vi.spyOn(M365TokenInstance, "getAccessToken").mockResolvedValue(ok(token));
    vi.spyOn(PreviewEnvTest.prototype as any, "getSideloadingStatus").mockResolvedValue(true);

    const previewEnv = new PreviewEnvTest();
    const accountRes = await previewEnv.checkM365Account(undefined);
    expect(accountRes.isOk()).to.be.true;
    const account = (accountRes as any).value;
    expect(account.tenantId).equals(tenantId);
    expect(account.loginHint).equals(upn);
  });

  it("checkM365Account - no sideloading permission", async () => {
    const token = "test-token";
    const tenantId = "test-tenant-id";
    const upn = "test-user";
    vi.spyOn(M365TokenInstance, "getStatus").mockReturnValue(
      Promise.resolve(
        ok({
          status: signedIn,
          token: token,
          accountInfo: {
            tid: tenantId,
            upn: upn,
          },
        })
      )
    );
    vi.spyOn(PreviewEnvTest.prototype as any, "getSideloadingStatus").mockResolvedValue(false);

    const previewEnv = new PreviewEnvTest();
    const accountRes = await previewEnv.checkM365Account(undefined);
    expect(accountRes.isErr()).to.be.true;
    const error = (accountRes as any).error;
    // eslint-disable-next-line no-secrets/no-secrets
    expect(error.name).equals("PrerequisitesValidationM365AccountError");
    expect(error.message).satisfy((m: string) => m.includes("custom app upload permission"));
  });

  it("detectRunCommand - node", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readdir").mockResolvedValue([]);
    // eslint-disable-next-line no-secrets/no-secrets
    vi.spyOn(PreviewEnvTest.prototype as any, "loadTeamsFxDevScript").mockResolvedValue("test");

    const previewEnv = new PreviewEnvTest();
    const runCommandRes = await previewEnv.detectRunCommand("./");
    expect(runCommandRes.isOk()).to.be.true;
    const runCommand = (runCommandRes as any).value;
    expect(runCommand.runCommand).equals("npm run dev:teamsfx");
  });

  it("detectRunCommand - .net web", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    vi.spyOn(fs, "readdir").mockResolvedValue(["test.csproj"]);
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from(
        `
  <Project Sdk="Microsoft.NET.Sdk.Web">
    <PropertyGroup>
      <TargetFramework>net6.0</TargetFramework>
    </PropertyGroup>
    <ItemGroup>
      <ProjectCapability Include="TeamsFx" />
    </ItemGroup>
  </Project>
  `
      )
    );

    const previewEnv = new PreviewEnvTest();
    const runCommandRes = await previewEnv.detectRunCommand("./");
    expect(runCommandRes.isOk()).to.be.true;
    const runCommand = (runCommandRes as any).value;
    expect(runCommand.runCommand).equals("dotnet run");
  });

  it("detectRunCommand - .net func", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    vi.spyOn(fs, "readdir").mockResolvedValue(["test.csproj"]);
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from(
        // eslint-disable-next-line no-secrets/no-secrets
        `
  <Project Sdk="Microsoft.NET.Sdk">
    <PropertyGroup>
      <TargetFramework>net6.0</TargetFramework>
    </PropertyGroup>
    <ItemGroup>
      <ProjectCapability Include="TeamsFx" />
    </ItemGroup>
    <ItemGroup>
      <PackageReference Include="Microsoft.NET.Sdk.Functions" Version="4.1.3" />
    </ItemGroup>
  </Project>
  `
      )
    );

    const previewEnv = new PreviewEnvTest();
    const runCommandRes = await previewEnv.detectRunCommand("./");
    expect(runCommandRes.isOk()).to.be.true;
    const runCommand = (runCommandRes as any).value;
    expect(runCommand.runCommand).equals("func start");
  });

  it("previewWithManifest - previewWithManifest error", async () => {
    vi.spyOn(FxCore.prototype, "previewWithManifest").mockResolvedValue(err({ foo: "bar" } as any));

    const previewEnv = new PreviewEnvTest();
    const result = await previewEnv.previewWithManifest(
      "./",
      "local",
      HubTypes.teams,
      "test-manifest-path"
    );
    expect(result.isErr()).to.be.true;
    expect((result as any).error).to.deep.equal({ foo: "bar" });
  });

  it("previewWithManifest - ok", async () => {
    vi.spyOn(FxCore.prototype, "previewWithManifest").mockResolvedValue(ok("test-url"));

    const previewEnv = new PreviewEnvTest();
    const result = await previewEnv.previewWithManifest(
      "./",
      "local",
      HubTypes.teams,
      "test-manifest-path"
    );
    expect(result.isOk()).to.be.true;
  });

  it("runCommandAsTask - ok", async () => {
    vi.spyOn(PreviewEnvTest.prototype as any, "createTaskStartCb").mockReturnValue(
      (a0: any, a1: any) => new Promise((res, rej) => res())
    );
    vi.spyOn(PreviewEnvTest.prototype as any, "createTaskStopCb").mockReturnValue(
      (a0: any, a1: any, a2: any, a3: any) => new Promise((res, rej) => res(null))
    );
    vi.spyOn(ServiceLogWriter.prototype, "init").mockResolvedValue();
    vi.spyOn(Task.prototype, "waitFor").mockResolvedValue(ok({ foo: "bar" } as any));

    const previewEnv = new PreviewEnvTest();
    const taskRes = await previewEnv.runCommandAsTask(
      "./",
      "npm start",
      /done/i,
      "./devTools/func"
    );
    expect(taskRes.isOk()).to.be.true;
    const tasks = previewEnv.getRunningTasks();
    expect(tasks.length).equals(1);
    expect((tasks[0] as any).taskTitle).equals("Run Command");
    expect((tasks[0] as any).command).equals("npm start");
  });

  it("runCommandAsTask - customize exec path", async () => {
    vi.spyOn(PreviewEnvTest.prototype as any, "createTaskStartCb").mockReturnValue(
      (a0: any, a1: any) => new Promise((res, rej) => res())
    );
    vi.spyOn(PreviewEnvTest.prototype as any, "createTaskStopCb").mockReturnValue(
      (a0: any, a1: any, a2: any, a3: any) => new Promise((res, rej) => res(null))
    );
    vi.spyOn(ServiceLogWriter.prototype, "init").mockResolvedValue();
    vi.spyOn(Task.prototype, "waitFor").mockResolvedValue(ok({ foo: "bar" } as any));

    const previewEnv = new PreviewEnvTest();
    const taskRes = await previewEnv.runCommandAsTask(
      "./",
      "npm start",
      /done/i,
      `./devTools/func${path.delimiter}${path.resolve(`./devTools/func1`)}`
    );
    expect(taskRes.isOk()).to.be.true;
    const tasks = previewEnv.getRunningTasks();
    expect(tasks.length).equals(1);
    expect((tasks[0] as any).taskTitle).equals("Run Command");
    expect((tasks[0] as any).command).equals("npm start");
    expect((tasks[0] as any).options.env.PATH).include(
      `${path.resolve("./devTools/func")}${path.delimiter}${path.resolve("./devTools/func1")}${
        path.delimiter
      }`
    );
  });

  it("launchBrowser - teams", async () => {
    vi.spyOn(PreviewEnvTest.prototype as any, "openHubWebClientNew").mockResolvedValue();

    const previewEnv = new PreviewEnvTest();
    const openRes = await previewEnv.launchBrowser(
      "local",
      HubTypes.teams,
      "test-url",
      constants.Browser.default,
      []
    );
    expect(openRes.isOk()).to.be.true;
    expect(logs.length).equals(1);
  });

  it("launchBrowser: outlook", async () => {
    vi.spyOn(PreviewEnvTest.prototype as any, "openHubWebClientNew").mockResolvedValue();

    const previewEnv = new PreviewEnvTest();
    const openRes = await previewEnv.launchBrowser(
      "local",
      HubTypes.outlook,
      "test-url",
      constants.Browser.default,
      []
    );
    expect(openRes.isOk()).to.be.true;
    expect(logs.length).equals(1);
  });

  it("launchDesktopClient - without accountInfo", async () => {
    vi.spyOn(PreviewEnvTest.prototype as any, "openTeamsDesktopClient").mockResolvedValue();
    vi.spyOn(M365TokenInstance, "getStatus").mockReturnValue(
      Promise.resolve(
        ok({
          status: signedIn,
          token: "token",
        })
      )
    );

    const previewEnv = new PreviewEnvTest();
    const openRes = await previewEnv.launchDesktopClient(
      "local",
      "test-url",
      constants.Browser.default,
      []
    );
    expect(openRes.isOk()).to.be.true;
  });

  it("launchDesktopClient - without unique_name", async () => {
    vi.spyOn(PreviewEnvTest.prototype as any, "openTeamsDesktopClient").mockResolvedValue();
    vi.spyOn(M365TokenInstance, "getStatus").mockReturnValue(
      Promise.resolve(
        ok({
          status: signedIn,
          token: "token",
          accountInfo: {
            tid: "tid",
            upn: "upn",
          },
        })
      )
    );

    const previewEnv = new PreviewEnvTest();
    const openRes = await previewEnv.launchDesktopClient(
      "local",
      "test-url",
      constants.Browser.default,
      []
    );
    expect(openRes.isOk()).to.be.true;
  });

  it("launchDesktopClient - happy path", async () => {
    vi.spyOn(PreviewEnvTest.prototype as any, "openTeamsDesktopClient").mockResolvedValue();
    vi.spyOn(M365TokenInstance, "getStatus").mockReturnValue(
      Promise.resolve(
        ok({
          status: signedIn,
          token: "token",
          accountInfo: {
            tid: "tid",
            upn: "upn",
            unique_name: "unique_name",
          },
        })
      )
    );

    const previewEnv = new PreviewEnvTest();
    const openRes = await previewEnv.launchDesktopClient(
      "local",
      "test-url",
      constants.Browser.default,
      []
    );
    expect(openRes.isOk()).to.be.true;
  });

  it("launchDesktopClient - without user information", async () => {
    vi.spyOn(PreviewEnvTest.prototype as any, "openTeamsDesktopClient").mockResolvedValue();
    vi.spyOn(M365TokenInstance, "getStatus").mockResolvedValue(err(new UserError("", "", "", "")));

    const previewEnv = new PreviewEnvTest();
    const openRes = await previewEnv.launchDesktopClient(
      "local",
      "test-url",
      constants.Browser.default,
      []
    );
    expect(openRes.isOk()).to.be.true;
  });

  it("delegates wrapper methods to dependencies", async () => {
    vi.spyOn(settingHelper, "isValidProjectV3").mockReturnValue(true);
    vi.spyOn(tools, "getSideloadingStatus").mockResolvedValue(undefined);
    vi.spyOn(packageJson, "loadTeamsFxDevScript").mockResolvedValue("npm run dev:teamsfx");

    const startCb = vi.fn().mockResolvedValue();
    const stopCb = vi.fn().mockResolvedValue(null);
    vi.spyOn(commonUtils, "createTaskStartCb").mockReturnValue(startCb as any);
    vi.spyOn(commonUtils, "createTaskStopCb").mockReturnValue(stopCb as any);

    vi.spyOn(launch, "openHubWebClientNew").mockResolvedValue();
    vi.spyOn(launch, "openTeamsDesktopClient").mockResolvedValue();

    const previewEnv = new PreviewEnvTest();

    const isValid = previewEnv.isValidProjectV3Wrap("./");
    expect(typeof isValid).to.equal("boolean");
    expect(await previewEnv.getSideloadingStatusWrap("token")).to.equal(false);
    const script = await previewEnv.loadTeamsFxDevScriptWrap("./");
    expect(script === undefined || typeof script === "string").to.equal(true);

    const createdStartCb = previewEnv.createTaskStartCbWrap({}, "start", {});
    const createdStopCb = previewEnv.createTaskStopCbWrap({}, {});
    expect(typeof createdStartCb).to.equal("function");
    expect(typeof createdStopCb).to.equal("function");

    await previewEnv.openHubWebClientNewWrap(HubTypes.teams, "https://example.com", "default", []);
    await previewEnv.openTeamsDesktopClientWrap("https://example.com", "user", "default", []);
  });
});

class MockProgressHandler implements IProgressHandler {
  start(detail?: string): Promise<void> {
    return Promise.resolve();
  }
  next(detail?: string): Promise<void> {
    return Promise.resolve();
  }
  end(success: boolean): Promise<void> {
    return Promise.resolve();
  }
}
