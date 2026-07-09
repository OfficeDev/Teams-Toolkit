// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author xzf0587 <zhaofengxu@microsoft.com>
 */
import * as appService from "@azure/arm-appservice";
import * as Models from "@azure/arm-appservice/src/models";
import { AxiosError } from "axios";
import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as uuid from "uuid";
import { assert, chai, vi } from "vitest";
import * as tools from "../../../../../src/common/utils";
import { AzureFunctionDeployDriver } from "../../../../../src/component/driver/deploy/azure/azureFunctionDeployDriver";
import { AzureDeployImpl } from "../../../../../src/component/driver/deploy/azure/impl/azureDeployImpl";
import { DeployArgs } from "../../../../../src/component/driver/interface/buildAndDeployArgs";
import * as fileOpt from "../../../../../src/component/utils/fileOperation";
import {
  MockedAzureAccountProvider,
  MockTelemetryReporter,
  MockUserInteraction,
  MyTokenCredential,
} from "../../../../core/utils";
import { TestLogProvider } from "../../../util/logProviderMock";

describe("Azure Function Deploy Driver test", () => {
  const sandbox = vi;
  const sysTmp = os.tmpdir();
  const folder = uuid.v4();
  const testFolder = path.join(sysTmp, folder);

  before(async () => {
    await fs.mkdirs(testFolder);
    await fs.writeFile(path.join(testFolder, "test.txt"), "test");
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "remove").mockResolvedValue();
  });

  after(async () => {
    fs.rmSync(testFolder, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.spyOn(fileOpt.fileOperationDeps, "createReadStream").mockReturnValue({
      pipe: vi.fn().mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          pipe: vi.fn().mockReturnValue("responseMock"),
        }),
      }),
      on: vi.fn(() => true),
      destroy: vi.fn(() => true),
    } as any);
    vi.spyOn(tools, "waitSeconds").mockResolvedValue();
    const fetchStub = vi.spyOn(global, "fetch");
    fetchStub.mockImplementation((input: any) => {
      const url: string = typeof input === "string" ? input : input.url;
      const info = url.split(/[\/|?]/);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            properties: {
              enabledHostNames: [
                `${info[info.length - 2]}.azurewebsites.net`,
                `${info[info.length - 2]}.scm.azurewebsites.net`,
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deploy happy path", async () => {
    const deploy = new AzureFunctionDeployDriver();
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Web/sites/some-server-farm",
      zipFilePath: path.join(testFolder, "test.zip"),
    } as DeployArgs;
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
      telemetryReporter: new MockTelemetryReporter(),
    } as any;
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );
    // ignore file
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation((file) => {
      if (file === "ignore") {
        return Promise.resolve(Buffer.from("node_modules"));
      }
      return Promise.resolve(Buffer.from("other file"));
    });
    const client = new appService.WebSiteManagementClient(new MyTokenCredential(), "z");
    vi.spyOn(client.webApps, "restart").mockResolvedValue();
    vi.spyOn(appService, "WebSiteManagementClient").mockImplementation(function () {
      return client;
    } as any);
    vi.spyOn(client.webApps, "beginListPublishingCredentialsAndWait").mockResolvedValue({
      publishingUserName: "test-username",
      publishingPassword: "test-password",
    } as Models.WebAppsListPublishingCredentialsResponse);
    vi.spyOn(fs, "readFileSync").mockResolvedValue("test");
    // mock klaw
    vi.spyOn(fileOpt, "forEachFileAndDir").mockResolvedValue(undefined);
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "post").mockResolvedValue({
      status: 200,
      headers: {
        location: "/api/123",
      },
    });
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockResolvedValue({
      status: 200,
    });
    const rex = await deploy.execute(args, context);
    chai.expect(rex.result.unwrapOr(new Map([["a", "b"]])).size).to.equal(0);
  });

  it("deploy restart error!", async () => {
    const deploy = new AzureFunctionDeployDriver();
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Web/sites/some-server-farm",
    } as DeployArgs;
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
      telemetryReporter: new MockTelemetryReporter(),
    } as any;
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );
    // ignore file
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation((file) => {
      if (file === "ignore") {
        return Promise.resolve(Buffer.from("node_modules"));
      }
      return Promise.resolve(Buffer.from("other file"));
    });
    const client = new appService.WebSiteManagementClient(new MyTokenCredential(), "z");
    vi.spyOn(client.webApps, "restart").mockRejectedValue();
    vi.spyOn(appService, "WebSiteManagementClient").mockImplementation(function () {
      return client;
    } as any);
    vi.spyOn(client.webApps, "beginListPublishingCredentialsAndWait").mockResolvedValue({
      publishingUserName: "test-username",
      publishingPassword: "test-password",
    } as Models.WebAppsListPublishingCredentialsResponse);
    vi.spyOn(fs, "readFileSync").mockResolvedValue("test");
    // mock klaw
    vi.spyOn(fileOpt, "forEachFileAndDir").mockResolvedValue(undefined);
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "post").mockResolvedValue({
      status: 200,
      headers: {
        location: "/api/123",
      },
    });
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockResolvedValue({
      status: 200,
    });
    const res = await deploy.execute(args, context);
    chai.expect(res.result.isErr()).to.equal(false);
  });

  it("deploy restart throws", async () => {
    const deploy = new AzureFunctionDeployDriver();
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Web/sites/some-server-farm",
    } as DeployArgs;
    const logger = new TestLogProvider();
    const caller = vi.spyOn(logger, "warning").mockResolvedValue();
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: logger,
      telemetryReporter: new MockTelemetryReporter(),
    } as any;
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );
    // ignore file
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation((file) => {
      if (file === "ignore") {
        return Promise.resolve(Buffer.from("node_modules"));
      }
      return Promise.resolve(Buffer.from("other file"));
    });
    const client = new appService.WebSiteManagementClient(new MyTokenCredential(), "z");
    vi.spyOn(client.webApps, "restart").mockImplementation(() => {
      throw new Error("test");
    });
    vi.spyOn(appService, "WebSiteManagementClient").mockImplementation(function () {
      return client;
    } as any);
    vi.spyOn(client.webApps, "beginListPublishingCredentialsAndWait").mockResolvedValue({
      publishingUserName: "test-username",
      publishingPassword: "test-password",
    } as Models.WebAppsListPublishingCredentialsResponse);
    vi.spyOn(fs, "readFileSync").mockResolvedValue("test");
    // mock klaw
    vi.spyOn(fileOpt, "forEachFileAndDir").mockResolvedValue(undefined);
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "post").mockResolvedValue({
      status: 200,
      headers: {
        location: "/api/123",
      },
    });
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockResolvedValue({
      status: 200,
    });
    const res = await deploy.execute(args, context);
    chai.expect(res.result.isErr()).to.equal(false);
    // log warning will print
    chai.expect(caller).toHaveBeenCalledOnce();
  });

  it("Zip deploy throws when upload", async () => {
    const deploy = new AzureFunctionDeployDriver();
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Web/sites/some-server-farm",
    } as DeployArgs;
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
    } as any;
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );
    // ignore file
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation((file) => {
      if (file === "ignore") {
        return Promise.resolve(Buffer.from("node_modules"));
      }
      throw new Error("not found");
    });
    const client = new appService.WebSiteManagementClient(new MyTokenCredential(), "z");
    vi.spyOn(client.webApps, "restart").mockImplementation(() => {
      throw new Error("test");
    });
    vi.spyOn(appService, "WebSiteManagementClient").mockImplementation(function () {
      return client;
    } as any);
    vi.spyOn(client.webApps, "beginListPublishingCredentialsAndWait").mockResolvedValue({
      publishingUserName: "test-username",
      publishingPassword: "test-password",
    } as Models.WebAppsListPublishingCredentialsResponse);
    vi.spyOn(fs, "readFileSync").mockResolvedValue("test");
    // mock klaw
    vi.spyOn(fileOpt, "forEachFileAndDir").mockResolvedValue(undefined);
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "post").mockResolvedValue({
      status: 403,
      headers: {
        location: "/api/123",
      },
    });
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockResolvedValue({
      status: 200,
    });
    const res = await deploy.execute(args, context);
    chai.expect(res.result.isErr()).to.equal(true);
  });

  it("Check deploy status error", async () => {
    const deploy = new AzureFunctionDeployDriver();
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Web/sites/some-server-farm",
    } as DeployArgs;
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
    } as any;
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );
    // ignore file
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation((file) => {
      if (file === "ignore") {
        return Promise.resolve(Buffer.from("node_modules"));
      }
      throw new Error("not found");
    });
    const client = new appService.WebSiteManagementClient(new MyTokenCredential(), "z");
    vi.spyOn(client.webApps, "restart").mockImplementation(() => {
      throw new Error("test");
    });
    vi.spyOn(appService, "WebSiteManagementClient").mockImplementation(function () {
      return client;
    } as any);
    vi.spyOn(client.webApps, "beginListPublishingCredentialsAndWait").mockResolvedValue({
      publishingUserName: "test-username",
      publishingPassword: "test-password",
    } as Models.WebAppsListPublishingCredentialsResponse);
    vi.spyOn(fs, "readFileSync").mockResolvedValue("test");
    // mock klaw
    vi.spyOn(fileOpt, "forEachFileAndDir").mockResolvedValue(undefined);
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "post").mockResolvedValue({
      status: 200,
      headers: {
        location: "/api/123",
      },
    });
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockResolvedValue({
      status: 403,
    });
    const res = await deploy.execute(args, context);
    chai.expect(res.result.isErr()).to.equal(true);
  });

  it("Check deploy status ok but cannot start", async () => {
    const deploy = new AzureFunctionDeployDriver();
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Web/sites/some-server-farm",
    } as DeployArgs;
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
      telemetryReporter: new MockTelemetryReporter(),
    } as any;
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );
    // ignore file
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation((file) => {
      if (file === "ignore") {
        return Promise.resolve(Buffer.from("node_modules"));
      }
      return Promise.resolve(Buffer.from("other file"));
    });
    const client = new appService.WebSiteManagementClient(new MyTokenCredential(), "z");
    vi.spyOn(client.webApps, "restart").mockImplementation(() => {
      throw new Error("test");
    });
    vi.spyOn(appService, "WebSiteManagementClient").mockImplementation(function () {
      return client;
    } as any);
    vi.spyOn(client.webApps, "beginListPublishingCredentialsAndWait").mockResolvedValue({
      publishingUserName: "test-username",
      publishingPassword: "test-password",
    } as Models.WebAppsListPublishingCredentialsResponse);
    vi.spyOn(fs, "readFileSync").mockResolvedValue("test");
    // mock klaw
    vi.spyOn(fileOpt, "forEachFileAndDir").mockResolvedValue(undefined);
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "post").mockResolvedValue({
      status: 200,
      headers: {
        location: "/api/123",
      },
    });
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockResolvedValue({
      status: 200,
      data: { status: 3 },
    });
    const res = await deploy.execute(args, context);
    chai.expect(res.result.isOk()).to.equal(true);
  });

  it("Check deploy throws", async () => {
    const deploy = new AzureFunctionDeployDriver();
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Web/sites/some-server-farm",
    } as DeployArgs;
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
    } as any;
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );
    // ignore file
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation((file) => {
      if (file === "ignore") {
        return Promise.resolve(Buffer.from("node_modules"));
      }
      throw new Error("not found");
    });
    const client = new appService.WebSiteManagementClient(new MyTokenCredential(), "z");
    vi.spyOn(client.webApps, "restart").mockImplementation(() => {
      throw new Error("test");
    });
    vi.spyOn(appService, "WebSiteManagementClient").mockImplementation(function () {
      return client;
    } as any);
    vi.spyOn(client.webApps, "beginListPublishingCredentialsAndWait").mockResolvedValue({
      publishingUserName: "test-username",
      publishingPassword: "test-password",
    } as Models.WebAppsListPublishingCredentialsResponse);
    vi.spyOn(fs, "readFileSync").mockResolvedValue("test");
    // mock klaw
    vi.spyOn(fileOpt, "forEachFileAndDir").mockResolvedValue(undefined);
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "post").mockResolvedValue({
      status: 200,
      headers: {
        location: "/api/123",
      },
    });
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockImplementation(() => {
      throw { isAxiosError: true } as AxiosError;
    });

    const res = await deploy.execute(args, context);
    chai.expect(res.result.isErr()).to.equal(true);
  });

  it("deploy dry run", async () => {
    const deploy = new AzureFunctionDeployDriver();
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Web/sites/some-server-farm",
      dryRun: true,
    } as DeployArgs;
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
    } as any;
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );
    // ignore file
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation((file) => {
      if (file === "ignore") {
        return Promise.resolve(Buffer.from("node_modules"));
      }
      return Promise.resolve(Buffer.from("other file"));
    });
    const client = new appService.WebSiteManagementClient(new MyTokenCredential(), "z");
    vi.spyOn(client.webApps, "restart").mockResolvedValue();
    vi.spyOn(appService, "WebSiteManagementClient").mockImplementation(function () {
      return client;
    } as any);
    vi.spyOn(client.webApps, "beginListPublishingCredentialsAndWait").mockResolvedValue({
      publishingUserName: "test-username",
      publishingPassword: "test-password",
    } as Models.WebAppsListPublishingCredentialsResponse);
    vi.spyOn(fs, "readFileSync").mockResolvedValue("test");
    // mock klaw
    vi.spyOn(fileOpt, "forEachFileAndDir").mockResolvedValue(undefined);
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "post").mockResolvedValue({
      status: 200,
      headers: {
        location: "/api/123",
      },
    });
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockResolvedValue({
      status: 200,
    });
    const res = await deploy.execute(args, context);

    assert.equal(res.result.isOk(), true);
    const tmpFile = path.join(sysTmp, "./.deployment/deployment.zip");
    assert.equal(
      res.summaries[0],
      `Deployment preparations are completed. You can find the package in \`${tmpFile}\``
    );
  });
});
