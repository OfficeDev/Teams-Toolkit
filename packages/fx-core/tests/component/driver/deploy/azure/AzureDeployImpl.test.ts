// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * @author Siglud <siglud@gmail.com>
 */
import * as appService from "@azure/arm-appservice";
import {
  WebAppsListPublishingCredentialsResponse,
  WebSiteManagementClient,
} from "@azure/arm-appservice";
import { RestError } from "@azure/storage-blob";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { Readable } from "stream";
import { chai, expect, vi } from "vitest";
import * as tools from "../../../../../src/common/utils";
import { HttpStatusCode } from "../../../../../src/component/constant/commonConstant";
import { DeployStatus } from "../../../../../src/component/constant/deployConstant";
import { AzureDeployImpl } from "../../../../../src/component/driver/deploy/azure/impl/azureDeployImpl";
import { AzureZipDeployImpl } from "../../../../../src/component/driver/deploy/azure/impl/AzureZipDeployImpl";
import {
  AzureUploadConfig,
  DeployArgs,
} from "../../../../../src/component/driver/interface/buildAndDeployArgs";
import { AzureResourceInfo } from "../../../../../src/component/driver/interface/commonArgs";
import {
  CheckDeploymentStatusError,
  CheckDeploymentStatusTimeoutError,
  DeployZipPackageError,
  GetPublishingCredentialsError,
} from "../../../../../src/error/deploy";
import {
  MockedAzureAccountProvider,
  MockTelemetryReporter,
  MockUserInteraction,
  MyTokenCredential,
} from "../../../../core/utils";
import { TestLogProvider } from "../../../util/logProviderMock";
describe("AzureDeployImpl zip deploy acceleration", () => {
  const sandbox = vi;
  const tempFile = path.join(os.tmpdir(), "test.zip");
  const zipDeployResource: AzureResourceInfo = {
    subscriptionId: "aaa",
    resourceGroupName: "bbb",
    instanceId: "ccc",
  };
  const zipDeployConfig: AzureUploadConfig = {
    headers: {
      "Content-Type": "AAA",
      "Cache-Control": "bbb",
      Authorization: "ccc",
    },
    maxContentLength: 1,
    maxBodyLength: 2,
    timeout: 3,
  };

  before(async () => {
    fs.writeFileSync(tempFile, "test");
  });

  after(async () => {
    fs.rmSync(tempFile, { recursive: true, force: true });
  });

  beforeEach(async () => {
    vi.spyOn(tools, "waitSeconds").mockResolvedValue();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("zip deploy need acceleration", async () => {
    const args = {
      workingDirectory: "./",
      artifactFolder: `./tmp`,
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Web/sites/some-server-farm",
    } as DeployArgs;
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
      ui: new MockUserInteraction(),
    } as any;
    context.logProvider.info = async (msg: string | Array<any>) => {
      console.log(msg);
      return Promise.resolve(true);
    };
    const deploy = new AzureZipDeployImpl(args, context, "", "", [], []);
    vi.spyOn(deploy, "zipDeploy").mockResolvedValue(5_000_000);
    await deploy.run();
  });

  it("Get zip deploy endpoint", async () => {
    const ar = {
      subscriptionId: "aaa",
      resourceGroupName: "bbb",
      instanceId: "ccc",
    } as AzureResourceInfo;
    const config = {
      headers: {
        "Content-Type": "AAA",
        "Cache-Control": "bbb",
        Authorization: "ccc",
      },
      maxContentLength: 1,
      maxBodyLength: 2,
      timeout: 3,
    } as AzureUploadConfig;
    const fetchStub = vi.spyOn(global, "fetch");
    fetchStub.mockResolvedValue(
      new Response(
        JSON.stringify({
          properties: {
            enabledHostNames: [
              "ssssxx-h0gjdtbsa8bqhjhe.canadacentral-01.azurewebsites.net",
              "ssssxx-h0gjdtbsa8bqhjhe.scm.canadacentral-01.azurewebsites.net",
            ],
          },
        }),
        { status: 200 }
      )
    );
    const endpoint = await AzureZipDeployImpl.getZipDeployEndpoint(ar, config);
    chai.assert.equal(
      endpoint,
      "https://ssssxx-h0gjdtbsa8bqhjhe.scm.canadacentral-01.azurewebsites.net/api/zipdeploy?isAsync=true"
    );
    await expect(fetchStub.mock.calls.length === 1).to.be.true;
    chai
      .expect(fetchStub.mock.calls[0][0])
      .to.be.equal(
        "https://management.azure.com/subscriptions/aaa/resourceGroups/bbb/providers/Microsoft.Web/sites/ccc?api-version=2024-04-01"
      );
  });

  it("Get zip deploy endpoint with error response", async () => {
    const ar = {
      subscriptionId: "aaa",
      resourceGroupName: "bbb",
      instanceId: "ccc",
    } as AzureResourceInfo;
    const config = {
      headers: {
        "Content-Type": "AAA",
        "Cache-Control": "bbb",
        Authorization: "ccc",
      },
      maxContentLength: 1,
      maxBodyLength: 2,
      timeout: 3,
    } as AzureUploadConfig;
    const fetchStub = vi.spyOn(global, "fetch");
    fetchStub.mockResolvedValue(
      new Response(
        JSON.stringify({
          properties: {
            enabledHostNames: [
              "ssssxx-h0gjdtbsa8bqhjhe.canadacentral-01.azurewebsites.net",
              "ssssxx-h0gjdtbsa8bqhjhe.canadacentral-01.azurewebsites.net",
            ],
          },
        }),
        { status: 200 }
      )
    );
    await expect(AzureZipDeployImpl.getZipDeployEndpoint(ar, config)).rejects.toThrow(Error);
    chai.expect(fetchStub.mock.calls.length === 1).to.be.true;
    chai
      .expect(fetchStub.mock.calls[0][0])
      .to.be.equal(
        "https://management.azure.com/subscriptions/aaa/resourceGroups/bbb/providers/Microsoft.Web/sites/ccc?api-version=2024-04-01"
      );
  });

  it("Get zip deploy endpoint reports ARM status when resource lookup fails", async () => {
    const ar: AzureResourceInfo = {
      subscriptionId: "aaa",
      resourceGroupName: "bbb",
      instanceId: "ccc",
    };
    const config: AzureUploadConfig = {
      headers: {
        "Content-Type": "AAA",
        "Cache-Control": "bbb",
        Authorization: "ccc",
      },
      maxContentLength: 1,
      maxBodyLength: 2,
      timeout: 3,
    };
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "ResourceNotFound",
            message: "The Resource was not found.",
          },
        }),
        { status: 404 }
      )
    );

    await expect(AzureZipDeployImpl.getZipDeployEndpoint(ar, config)).rejects.toThrow(
      "Failed to get Azure App Service host names. Status code: 404"
    );
  });

  it("Get zip deploy endpoint reports plain text ARM error response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("temporary platform error", { status: 502 })
    );

    await expect(
      AzureZipDeployImpl.getZipDeployEndpoint(zipDeployResource, zipDeployConfig)
    ).rejects.toThrow(
      "Failed to get Azure App Service host names. Status code: 502. Response: temporary platform error"
    );
  });

  it("Get zip deploy endpoint reports empty success response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("", { status: 200 }));

    await expect(
      AzureZipDeployImpl.getZipDeployEndpoint(zipDeployResource, zipDeployConfig)
    ).rejects.toThrow(
      "Failed to get Azure App Service host names. Response does not contain properties.enabledHostNames. Response: "
    );
  });

  it("Get zip deploy endpoint reports malformed enabled host names", async () => {
    const malformedResponse = {
      properties: {
        enabledHostNames: ["ssssxx-h0gjdtbsa8bqhjhe.canadacentral-01.azurewebsites.net", 1],
      },
    };
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(malformedResponse), { status: 200 })
    );

    await expect(
      AzureZipDeployImpl.getZipDeployEndpoint(zipDeployResource, zipDeployConfig)
    ).rejects.toThrow(
      `Failed to get Azure App Service host names. Response does not contain properties.enabledHostNames. Response: ${JSON.stringify(
        malformedResponse
      )}`
    );
  });

  it("Get zip deploy endpoint truncates long ARM error response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("x".repeat(1001), { status: 500 }));

    await expect(
      AzureZipDeployImpl.getZipDeployEndpoint(zipDeployResource, zipDeployConfig)
    ).rejects.toThrow(
      `Failed to get Azure App Service host names. Status code: 500. Response: ${"x".repeat(
        1000
      )}...`
    );
  });

  it("checkDeployStatus empty response", async () => {
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockResolvedValue("");
    const config = {
      headers: {
        "Content-Type": "text",
        "Cache-Control": "no-cache",
        Authorization: "no",
      },
      maxContentLength: 200,
      maxBodyLength: 200,
      timeout: 200,
    };
    const args = {
      workingDirectory: "/",
      artifactFolder: "/",
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-11111111111/resourceGroups/hoho-rg/providers/Microsoft.Web/sites",
    } as DeployArgs;
    const context = {
      logProvider: new TestLogProvider(),
      ui: new MockUserInteraction(),
    } as any;
    const impl = new AzureZipDeployImpl(
      args,
      context,
      "Azure App Service",
      "https://aka.ms/teamsfx-actions/azure-app-service-deploy",
      ["driver.deploy.azureAppServiceDeployDetailSummary"],
      ["driver.deploy.notice.deployDryRunComplete"]
    );
    await expect(impl.checkDeployStatus("", config, new TestLogProvider())).rejects.toThrow(
      CheckDeploymentStatusTimeoutError
    );
  });

  it("checkDeployStatus 500 response", async () => {
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockResolvedValue({
      status: HttpStatusCode.INTERNAL_SERVER_ERROR,
      data: {
        status: DeployStatus.Failed,
        message: "fail to start app due to some reasons.",
      },
    });
    const config = {
      headers: {
        "Content-Type": "text",
        "Cache-Control": "no-cache",
        Authorization: "no",
      },
      maxContentLength: 200,
      maxBodyLength: 200,
      timeout: 200,
    };
    const args = {
      workingDirectory: "/",
      artifactFolder: "/",
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-11111111111/resourceGroups/hoho-rg/providers/Microsoft.Web/sites",
    } as DeployArgs;
    const context = {
      logProvider: new TestLogProvider(),
      ui: new MockUserInteraction(),
    } as any;
    const impl = new AzureZipDeployImpl(
      args,
      context,
      "Azure App Service",
      "https://aka.ms/teamsfx-actions/azure-app-service-deploy",
      ["driver.deploy.azureAppServiceDeployDetailSummary"],
      ["driver.deploy.notice.deployDryRunComplete"]
    );
    await expect(impl.checkDeployStatus("", config, new TestLogProvider())).rejects.toThrow(
      CheckDeploymentStatusError
    );
  });

  it("checkDeployStatus reject AxiosError", async () => {
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockRejectedValue({
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
    const config = {
      headers: {
        "Content-Type": "text",
        "Cache-Control": "no-cache",
        Authorization: "no",
      },
      maxContentLength: 200,
      maxBodyLength: 200,
      timeout: 200,
    };
    const args = {
      workingDirectory: "/",
      artifactFolder: "/",
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-11111111111/resourceGroups/hoho-rg/providers/Microsoft.Web/sites",
    } as DeployArgs;
    const context = {
      logProvider: new TestLogProvider(),
      ui: new MockUserInteraction(),
    } as any;
    const impl = new AzureZipDeployImpl(
      args,
      context,
      "Azure App Service",
      "https://aka.ms/teamsfx-actions/azure-app-service-deploy",
      ["driver.deploy.azureAppServiceDeployDetailSummary"],
      ["driver.deploy.notice.deployDryRunComplete"]
    );
    await expect(impl.checkDeployStatus("", config, new TestLogProvider())).rejects.toThrow(
      CheckDeploymentStatusError
    );
  });
  it("checkDeployStatus reject none AxiosError", async () => {
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockRejectedValue(new Error("other error"));
    const config = {
      headers: {
        "Content-Type": "text",
        "Cache-Control": "no-cache",
        Authorization: "no",
      },
      maxContentLength: 200,
      maxBodyLength: 200,
      timeout: 200,
    };
    const args = {
      workingDirectory: "/",
      artifactFolder: "/",
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-11111111111/resourceGroups/hoho-rg/providers/Microsoft.Web/sites",
    } as DeployArgs;
    const context = {
      logProvider: new TestLogProvider(),
      ui: new MockUserInteraction(),
    } as any;
    const impl = new AzureZipDeployImpl(
      args,
      context,
      "Azure App Service",
      "https://aka.ms/teamsfx-actions/azure-app-service-deploy",
      ["driver.deploy.azureAppServiceDeployDetailSummary"],
      ["driver.deploy.notice.deployDryRunComplete"]
    );
    await expect(impl.checkDeployStatus("", config, new TestLogProvider())).rejects.toThrow(
      CheckDeploymentStatusError
    );
  });
  it("checkDeployStatus DeployRemoteStartError", async () => {
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockResolvedValue({
      status: HttpStatusCode.OK,
      data: {
        status: DeployStatus.Failed,
        message: "fail to start app due to some reasons.",
      },
    });
    const config = {
      headers: {
        "Content-Type": "text",
        "Cache-Control": "no-cache",
        Authorization: "no",
      },
      maxContentLength: 200,
      maxBodyLength: 200,
      timeout: 200,
    };
    const args = {
      workingDirectory: "/",
      artifactFolder: "/",
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-11111111111/resourceGroups/hoho-rg/providers/Microsoft.Web/sites",
    } as DeployArgs;
    const context = {
      logProvider: new TestLogProvider(),
      ui: new MockUserInteraction(),
    } as any;
    const impl = new AzureZipDeployImpl(
      args,
      context,
      "Azure App Service",
      "https://aka.ms/teamsfx-actions/azure-app-service-deploy",
      ["driver.deploy.azureAppServiceDeployDetailSummary"],
      ["driver.deploy.notice.deployDryRunComplete"]
    );
    const res = await impl.checkDeployStatus("", config, new TestLogProvider());
    chai.assert.equal(res?.status, DeployStatus.Failed);
    chai.assert.equal(res?.message, "fail to start app due to some reasons.");
  });
  it("checkDeployStatus return status 400", async () => {
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "get").mockResolvedValue({
      status: HttpStatusCode.BAD_REQUEST,
    });
    const config = {
      headers: {
        "Content-Type": "text",
        "Cache-Control": "no-cache",
        Authorization: "no",
      },
      maxContentLength: 200,
      maxBodyLength: 200,
      timeout: 200,
    };
    const args = {
      workingDirectory: "/",
      artifactFolder: "/",
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-11111111111/resourceGroups/hoho-rg/providers/Microsoft.Web/sites",
    } as DeployArgs;
    const context = {
      logProvider: new TestLogProvider(),
      ui: new MockUserInteraction(),
    } as any;
    const impl = new AzureZipDeployImpl(
      args,
      context,
      "Azure App Service",
      "https://aka.ms/teamsfx-actions/azure-app-service-deploy",
      ["driver.deploy.azureAppServiceDeployDetailSummary"],
      ["driver.deploy.notice.deployDryRunComplete"]
    );
    await expect(impl.checkDeployStatus("", config, new TestLogProvider())).rejects.toThrow(
      CheckDeploymentStatusError
    );
  });
  it("createAzureDeployConfig GetPublishingCredentialsError", async () => {
    const args = {
      workingDirectory: "/",
      artifactFolder: "/",
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-11111111111/resourceGroups/hoho-rg/providers/Microsoft.Web/sites",
    } as DeployArgs;
    const context = {
      logProvider: new TestLogProvider(),
      ui: new MockUserInteraction(),
      telemetryReporter: new MockTelemetryReporter(),
    } as any;
    const impl = new AzureZipDeployImpl(
      args,
      context,
      "Azure App Service",
      "https://aka.ms/teamsfx-actions/azure-app-service-deploy",
      ["driver.deploy.azureAppServiceDeployDetailSummary"],
      ["driver.deploy.notice.deployDryRunComplete"]
    );
    const webApps = {
      beginListPublishingCredentialsAndWait: async function (
        resourceGroupName: string,
        name: string
      ): Promise<WebAppsListPublishingCredentialsResponse> {
        throw new RestError("test message", { statusCode: 500 });
      },
    };
    const mockWebSiteManagementClient = new WebSiteManagementClient(new MyTokenCredential(), "sub");
    mockWebSiteManagementClient.webApps = webApps as any;
    vi.spyOn(appService, "WebSiteManagementClient").mockImplementation(function () {
      return mockWebSiteManagementClient;
    } as any);
    const token = new MyTokenCredential();
    vi.spyOn(token, "getToken").mockImplementation(() => {
      throw new Error("test message");
    });
    await expect(
      impl.createAzureDeployConfig(
        {
          subscriptionId: "e24d88be-bbbb-1234-ba25-11111111111",
          resourceGroupName: "mockGroupName",
          instanceId: "mockAppName",
        },
        token
      )
    ).rejects.toThrow(GetPublishingCredentialsError);
  });

  it("zipDeployPackage DeployZipPackageError throw 500", async () => {
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "post").mockRejectedValue({
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
    const args = {
      workingDirectory: "/",
      artifactFolder: "/",
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-11111111111/resourceGroups/hoho-rg/providers/Microsoft.Web/sites",
    } as DeployArgs;
    const context = {
      logProvider: new TestLogProvider(),
      ui: new MockUserInteraction(),
    } as any;
    const impl = new AzureZipDeployImpl(
      args,
      context,
      "Azure App Service",
      "https://aka.ms/teamsfx-actions/azure-app-service-deploy",
      ["driver.deploy.azureAppServiceDeployDetailSummary"],
      ["driver.deploy.notice.deployDryRunComplete"]
    );
    const config = {
      headers: {
        "Content-Type": "text",
        "Cache-Control": "no-cache",
        Authorization: "no",
      },
      maxContentLength: 200,
      maxBodyLength: 200,
      timeout: 200,
    };
    await expect(
      impl.zipDeployPackage(
        "mockEndPoint",
        Readable.from("test") as any,
        config,
        new TestLogProvider()
      )
    ).rejects.toThrow(DeployZipPackageError);
  });
  it("zipDeployPackage DeployZipPackageError throw 404", async () => {
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "post").mockRejectedValue({
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
    const args = {
      workingDirectory: "/",
      artifactFolder: "/",
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-11111111111/resourceGroups/hoho-rg/providers/Microsoft.Web/sites",
    } as DeployArgs;
    const context = {
      logProvider: new TestLogProvider(),
      ui: new MockUserInteraction(),
    } as any;
    const impl = new AzureZipDeployImpl(
      args,
      context,
      "Azure App Service",
      "https://aka.ms/teamsfx-actions/azure-app-service-deploy",
      ["driver.deploy.azureAppServiceDeployDetailSummary"],
      ["driver.deploy.notice.deployDryRunComplete"]
    );
    const config = {
      headers: {
        "Content-Type": "text",
        "Cache-Control": "no-cache",
        Authorization: "no",
      },
      maxContentLength: 200,
      maxBodyLength: 200,
      timeout: 200,
    };
    await expect(
      impl.zipDeployPackage(
        "mockEndPoint",
        Readable.from("test") as any,
        config,
        new TestLogProvider()
      )
    ).rejects.toThrow(DeployZipPackageError);
  });
  it("zipDeployPackage DeployZipPackageError return 500", async () => {
    vi.spyOn(AzureDeployImpl.AXIOS_INSTANCE, "post").mockResolvedValue({
      headers: {
        location: "abc",
      },
      status: 500,
    });
    const args = {
      workingDirectory: "/",
      artifactFolder: "/",
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-11111111111/resourceGroups/hoho-rg/providers/Microsoft.Web/sites",
    } as DeployArgs;
    const context = {
      logProvider: new TestLogProvider(),
      ui: new MockUserInteraction(),
    } as any;
    const impl = new AzureZipDeployImpl(
      args,
      context,
      "Azure App Service",
      "https://aka.ms/teamsfx-actions/azure-app-service-deploy",
      ["driver.deploy.azureAppServiceDeployDetailSummary"],
      ["driver.deploy.notice.deployDryRunComplete"]
    );
    const config = {
      headers: {
        "Content-Type": "text",
        "Cache-Control": "no-cache",
        Authorization: "no",
      },
      maxContentLength: 200,
      maxBodyLength: 200,
      timeout: 200,
    };
    await expect(
      impl.zipDeployPackage(
        "mockEndPoint",
        Readable.from("test") as any,
        config,
        new TestLogProvider()
      )
    ).rejects.toThrow(DeployZipPackageError);
  });

  it("throws Error when no basic auth allowed and Microsoft Entra request fail", async () => {
    const args = {
      workingDirectory: "/",
      artifactFolder: "/",
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-11111111111/resourceGroups/hoho-rg/providers/Microsoft.Web/sites",
    } as DeployArgs;
    const context = {
      logProvider: new TestLogProvider(),
      ui: new MockUserInteraction(),
      telemetryReporter: new MockTelemetryReporter(),
    } as any;
    const impl = new AzureZipDeployImpl(
      args,
      context,
      "Azure App Service",
      "https://aka.ms/teamsfx-actions/azure-app-service-deploy",
      ["driver.deploy.azureAppServiceDeployDetailSummary"],
      ["driver.deploy.notice.deployDryRunComplete"]
    );
    process.env["TEAMSFX_AAD_DEPLOY_ONLY"] = "true";
    const webApps = {
      beginListPublishingCredentialsAndWait: async function (
        resourceGroupName: string,
        name: string
      ): Promise<WebAppsListPublishingCredentialsResponse> {
        throw new RestError("test message", { statusCode: 500 });
      },
    };
    const mockWebSiteManagementClient = new WebSiteManagementClient(new MyTokenCredential(), "sub");
    mockWebSiteManagementClient.webApps = webApps as any;
    vi.spyOn(appService, "WebSiteManagementClient").mockImplementation(function () {
      return mockWebSiteManagementClient;
    } as any);
    const token = new MyTokenCredential();
    vi.spyOn(token, "getToken").mockImplementation(() => {
      throw new Error("test message");
    });
    await expect(
      impl.createAzureDeployConfig(
        {
          subscriptionId: "e24d88be-bbbb-1234-ba25-11111111111",
          resourceGroupName: "mockGroupName",
          instanceId: "mockAppName",
        },
        token
      )
    ).rejects.toThrow(GetPublishingCredentialsError);
  });
});
