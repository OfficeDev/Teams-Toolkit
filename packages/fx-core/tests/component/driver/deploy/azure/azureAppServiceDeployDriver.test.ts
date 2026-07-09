// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author xzf0587 <zhaofengxu@microsoft.com>
 */
import * as appService from "@azure/arm-appservice";
import * as Models from "@azure/arm-appservice/src/models";
import { IProgressHandler } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as uuid from "uuid";
import { assert, chai, vi } from "vitest";
import * as tools from "../../../../../src/common/utils";
import { DeployConstant } from "../../../../../src/component/constant/deployConstant";
import { AzureAppServiceDeployDriver } from "../../../../../src/component/driver/deploy/azure/azureAppServiceDeployDriver";
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

describe("Azure App Service Deploy Driver test", () => {
  const sandbox = vi;
  const sysTmp = os.tmpdir();
  const folder = uuid.v4();
  const testFolder = path.join(sysTmp, folder);

  before(async () => {
    await fs.mkdirs(testFolder);
    await fs.writeFile(path.join(sysTmp, "ignore"), "ignore", {
      encoding: "utf8",
      flag: "a",
    });
    await fs.writeFile(path.join(testFolder, "test.txt"), "test");
    vi.spyOn(fs, "mkdirs").mockResolvedValue();
    vi.spyOn(fs, "removeSync");
    vi.spyOn(fs, "readdirSync").mockReturnValue([new fs.Dirent(), new fs.Dirent()]);
    vi.spyOn(fs, "readFileSync").mockResolvedValue("test");
  });

  after(async () => {
    if (fs.existsSync(testFolder)) {
      if (fs.existsSync(path.join(testFolder, ".deployment"))) {
        if (fs.existsSync(path.join(testFolder, ".deployment", "deployment.zip"))) {
          fs.unlinkSync(path.join(testFolder, ".deployment", "deployment.zip"));
        }
        fs.rmSync(path.join(testFolder, ".deployment"), { recursive: true });
      }
      fs.rmSync(testFolder, { recursive: true });
    }
  });

  beforeEach(async () => {
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
    const deploy = new AzureAppServiceDeployDriver();
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Web/sites/some-server-farm",
      outputZipFile: ".deployment/deployment.zip",
    } as DeployArgs;
    const progressHandler: IProgressHandler = {
      start: async (): Promise<void> => {},
      next: async (): Promise<void> => {},
      end: async (): Promise<void> => {},
    };
    const ui = new MockUserInteraction();
    const progressNextCaller = vi.spyOn(progressHandler, "next").mockResolvedValue();

    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
      ui: ui,
      telemetryReporter: new MockTelemetryReporter(),
      progressBar: progressHandler,
    } as any;
    const credential = new MyTokenCredential();
    vi.spyOn(credential, "getToken").mockResolvedValue(undefined);
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      credential
    );
    // ignore file
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation((file) => {
      if (file.toString().indexOf("ignore") >= 0) {
        return Promise.resolve(Buffer.from("node_modules"));
      }
      return Promise.resolve(Buffer.from("any other content"));
    });
    const client = new appService.WebSiteManagementClient(credential, "z");
    vi.spyOn(appService, "WebSiteManagementClient").mockImplementation(function () {
      return client;
    } as any);
    vi.spyOn(client.webApps, "beginListPublishingCredentialsAndWait").mockResolvedValue({
      publishingUserName: "test-username",
      publishingPassword: "test-password",
    } as Models.WebAppsListPublishingCredentialsResponse);
    // mock klaw
    // vi.spyOn(fileOpt, "forEachFileAndDir").mockResolvedValue(undefined);
    // vi.spyOn(fileOpt, "forEachFileAndDir").mockResolvedValue(undefined);
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "post").mockResolvedValue({
      status: 200,
      headers: {
        location: "/api/123",
      },
    });
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockResolvedValue({
      status: 200,
      data: {
        status: 4,
        message: "success",
        received_time: 123,
        start_time: 111,
        end_time: 123,
        last_success_end_time: 100,
        complete: true,
        active: 1,
        is_readonly: true,
        site_name: "new_name",
      },
    });
    vi.spyOn(client.webApps, "restart").mockResolvedValue();
    const rex = await deploy.execute(args, context);
    chai.expect(rex.result.unwrapOr(new Map([["a", "a"]])).size).to.equal(0);
    // progress bar have 6 steps
    chai.expect(progressNextCaller.mock.calls.length).to.equal(1);
  });

  it("deploy happy path with response data is empty", async () => {
    const deploy = new AzureAppServiceDeployDriver();
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Web/sites/some-server-farm",
      outputZipFile: ".deployment/deployment.zip",
    } as DeployArgs;
    const progressHandler: IProgressHandler = {
      start: async (detail?: string): Promise<void> => {},
      next: async (detail?: string): Promise<void> => {},
      end: async (): Promise<void> => {},
    };
    const ui = new MockUserInteraction();
    const progressNextCaller = vi.spyOn(progressHandler, "next").mockResolvedValue();

    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
      ui: ui,
      telemetryReporter: new MockTelemetryReporter(),
      progressBar: progressHandler,
    } as any;
    const credential = new MyTokenCredential();
    vi.spyOn(credential, "getToken").mockResolvedValue(undefined);
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      credential
    );
    // ignore file
    const client = new appService.WebSiteManagementClient(credential, "z");
    vi.spyOn(appService, "WebSiteManagementClient").mockImplementation(function () {
      return client;
    } as any);
    vi.spyOn(client.webApps, "beginListPublishingCredentialsAndWait").mockResolvedValue({
      publishingUserName: "test-username",
      publishingPassword: "test-password",
    } as Models.WebAppsListPublishingCredentialsResponse);
    // mock klaw
    // vi.spyOn(fileOpt, "forEachFileAndDir").mockResolvedValue(undefined);
    vi.spyOn(fileOpt, "forEachFileAndDir").mockResolvedValue(undefined);
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "post").mockResolvedValue({
      status: 200,
      headers: {
        location: "/api/123",
      },
    });
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockResolvedValue({
      status: 200,
      data: {},
    });
    vi.spyOn(client.webApps, "restart").mockResolvedValue();
    const rex = await deploy.execute(args, context);
    chai.expect(rex.result.unwrapOr(new Map([["a", "a"]])).size).to.equal(0);
    // progress bar have 6 steps
    chai.expect(progressNextCaller.mock.calls.length).to.equal(1);
  });

  it("resource id error", async () => {
    const deploy = new AzureAppServiceDeployDriver();
    const args = {
      workingDirectory: "/",
      artifactFolder: "/",
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Web/sites",
    } as DeployArgs;
    const context = {
      logProvider: new TestLogProvider(),
      ui: new MockUserInteraction(),
    } as any;
    // await deploy.run(args, context);
    const res = await deploy.execute(args, context);
    assert.equal(res.result.isErr(), true);
  });

  it("missing resource id", async () => {
    const deploy = new AzureAppServiceDeployDriver();
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      ignoreFile: "./ignore",
    } as DeployArgs;
    const context = {
      logProvider: new TestLogProvider(),
    } as any;
    // await deploy.run(args, context);
    const res = await deploy.execute(args, context);
    assert.equal(res.result.isErr(), true);
  });

  it("deploy with ignore file not exists", async () => {
    const deploy = new AzureAppServiceDeployDriver();
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      ignoreFile: "",
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

    const client = new appService.WebSiteManagementClient(new MyTokenCredential(), "z");
    vi.spyOn(appService, "WebSiteManagementClient").mockImplementation(function () {
      return client;
    } as any);
    vi.spyOn(client.webApps, "beginListPublishingCredentialsAndWait").mockResolvedValue({
      publishingUserName: "test-username",
      publishingPassword: "test-password",
    } as Models.WebAppsListPublishingCredentialsResponse);
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "post").mockResolvedValue({
      status: 200,
      headers: {
        location: "/api/123",
      },
    });
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockResolvedValue({
      status: 200,
    });
    vi.spyOn(client.webApps, "restart").mockResolvedValue();
    // read deploy zip file error
    vi.spyOn(fs, "readFile").mockImplementation(((p: any) => {
      if (
        p ===
        `./${DeployConstant.DEPLOYMENT_TMP_FOLDER}/${DeployConstant.DEPLOYMENT_ZIP_CACHE_FILE}`
      ) {
        throw new Error("test");
      }
      return undefined;
    }) as any);
    // mock klaw
    vi.spyOn(fileOpt, "forEachFileAndDir").mockResolvedValue(undefined);
    const res = await deploy.execute(args, context);
    chai.expect(res.result.unwrapOr(new Map([["a", "b"]])).size).to.equal(0);
  });

  it("zip deploy to azure error", async () => {
    const deploy = new AzureAppServiceDeployDriver();
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
    const client = new appService.WebSiteManagementClient(new MyTokenCredential(), "z");
    vi.spyOn(client.webApps, "beginListPublishingCredentialsAndWait").mockResolvedValue({
      publishingUserName: "test-username",
      publishingPassword: "test-password",
    } as Models.WebAppsListPublishingCredentialsResponse);
    vi.spyOn(appService, "WebSiteManagementClient").mockImplementation(function () {
      return client;
    } as any);
    vi.spyOn(fs, "readFileSync").mockResolvedValue("test");
    // read deploy zip file error
    vi.spyOn(fs, "readFile").mockImplementation((file) => {
      if (file === "ignore") {
        return Promise.resolve(Buffer.from("node_modules"));
      }
      throw new Error("not found");
    });
    // mock klaw
    vi.spyOn(fileOpt, "forEachFileAndDir").mockResolvedValue(undefined);
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "post").mockImplementation(() => {
      throw new Error("test");
    });
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockResolvedValue({
      status: 200,
    });
    const res = await deploy.execute(args, context);
    assert.equal(res.result.isErr(), true);
  });

  it("should thrown when deploy remote 500 error", async () => {
    const deploy = new AzureAppServiceDeployDriver();
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
    const client = new appService.WebSiteManagementClient(new MyTokenCredential(), "z");
    vi.spyOn(client.webApps, "beginListPublishingCredentialsAndWait").mockResolvedValue({
      publishingUserName: "test-username",
      publishingPassword: "test-password",
    } as Models.WebAppsListPublishingCredentialsResponse);
    vi.spyOn(appService, "WebSiteManagementClient").mockImplementation(function () {
      return client;
    } as any);
    vi.spyOn(fs, "readFileSync").mockResolvedValue("test");
    // read deploy zip file error
    vi.spyOn(fs, "readFile").mockImplementation((file) => {
      if (file === "ignore") {
        return Promise.resolve(Buffer.from("node_modules"));
      }
      throw new Error("not found");
    });
    // mock klaw
    vi.spyOn(fileOpt, "forEachFileAndDir").mockResolvedValue(undefined);
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "post").mockImplementation(() => {
      throw {
        response: {
          status: 503,
        },
        isAxiosError: true,
      };
    });
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockResolvedValue({
      status: 200,
    });
    const res = await deploy.execute(args, context);
    assert.equal(res.result.isErr(), true);
  });

  it("should thrown when deploy remote 400 error", async () => {
    const deploy = new AzureAppServiceDeployDriver();
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
    const client = new appService.WebSiteManagementClient(new MyTokenCredential(), "z");
    vi.spyOn(client.webApps, "beginListPublishingCredentialsAndWait").mockResolvedValue({
      publishingUserName: "test-username",
      publishingPassword: "test-password",
    } as Models.WebAppsListPublishingCredentialsResponse);
    vi.spyOn(appService, "WebSiteManagementClient").mockImplementation(function () {
      return client;
    } as any);
    vi.spyOn(fs, "readFileSync").mockResolvedValue("test");
    // read deploy zip file error
    vi.spyOn(fs, "readFile").mockImplementation((file) => {
      if (file === "ignore") {
        return Promise.resolve(Buffer.from("node_modules"));
      }
      throw new Error("not found");
    });
    // mock klaw
    vi.spyOn(fileOpt, "forEachFileAndDir").mockResolvedValue(undefined);
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "post").mockImplementation(() => {
      throw {
        response: {
          status: 404,
        },
        isAxiosError: true,
      };
    });
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockResolvedValue({
      status: 200,
    });
    const res = await deploy.execute(args, context);
    assert.equal(res.result.isErr(), true);
  });

  it("working dir not exists", async () => {
    const deploy = new AzureAppServiceDeployDriver();
    const args = {
      workingDirectory: "/aaaa",
      artifactFolder: `./${folder}`,
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Web/sites/some-server-farm",
    } as DeployArgs;
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
    } as any;
    const res = await deploy.execute(args, context);
    assert.equal(res.result.isErr(), true);
  });

  it("test dry run", async () => {
    const deploy = new AzureAppServiceDeployDriver();
    const fh = await fs.open(path.join(sysTmp, folder, "test.txt"), "a");
    await fs.close(fh);
    await fs.writeFile(path.join(sysTmp, folder, "ignore"), "ignore", {
      encoding: "utf8",
      flag: "a",
    });
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Web/sites/some-server-farm",
      dryRun: true,
    } as DeployArgs;

    const progressHandler: IProgressHandler = {
      start: async (detail?: string): Promise<void> => {},
      next: async (detail?: string): Promise<void> => {},
      end: async (): Promise<void> => {},
    };
    const ui = new MockUserInteraction();
    const progressNextCaller = vi.spyOn(progressHandler, "next").mockResolvedValue();

    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
      ui: ui,
      progressBar: progressHandler,
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
      return Promise.resolve(Buffer.from("any other content"));
    });
    const client = new appService.WebSiteManagementClient(new MyTokenCredential(), "z");
    vi.spyOn(appService, "WebSiteManagementClient").mockImplementation(function () {
      return client;
    } as any);
    vi.spyOn(client.webApps, "beginListPublishingCredentialsAndWait").mockResolvedValue({
      publishingUserName: "test-username",
      publishingPassword: "test-password",
    } as Models.WebAppsListPublishingCredentialsResponse);
    vi.spyOn(fs, "readFileSync").mockResolvedValue("test");
    // mock klaw
    // vi.spyOn(fileOpt, "forEachFileAndDir").mockResolvedValue(undefined);
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
    vi.spyOn(client.webApps, "restart").mockResolvedValue();
    const res = await deploy.execute(args, context);
    assert.equal(res.result.isOk(), true);
    const tmpFile = path.join(sysTmp, "./.deployment/deployment.zip");
    assert.equal(
      res.summaries[0],
      `Deployment preparations are completed. You can find the package in \`${tmpFile}\``
    );
    // dry run will have only one progress step
    assert.equal(progressNextCaller.mock.calls.length, 1);
  });

  it("list credential error", async () => {
    const deploy = new AzureAppServiceDeployDriver();
    const fh = await fs.open(path.join(sysTmp, folder, "test.txt"), "a");
    await fs.close(fh);
    await fs.writeFile(path.join(sysTmp, folder, "ignore"), "ignore", {
      encoding: "utf8",
      flag: "a",
    });
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
      ui: new MockUserInteraction(),
    } as any;
    const credential = new MyTokenCredential();
    credential.getToken = async () => {
      return null;
    };
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      credential
    );
    // ignore file
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation((file) => {
      if (file === "ignore") {
        return Promise.resolve(Buffer.from("node_modules"));
      }
      throw new Error("not found");
    });
    const client = new appService.WebSiteManagementClient(credential, "z");
    vi.spyOn(appService, "WebSiteManagementClient").mockImplementation(function () {
      return client;
    } as any);
    vi.spyOn(client.webApps, "beginListPublishingCredentialsAndWait").mockImplementation(() => {
      throw new Error("error");
    });
    vi.spyOn(fs, "readFileSync").mockResolvedValue("test");
    // mock klaw
    // vi.spyOn(fileOpt, "forEachFileAndDir").mockResolvedValue(undefined);
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
    vi.spyOn(client.webApps, "restart").mockResolvedValue();
    const res = await deploy.execute(args, context);
    assert.equal(res.result.isOk(), false);
  });
});
