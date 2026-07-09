// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * @author Siglud <siglud@gmail.com>
 */
import * as appService from "@azure/arm-appservice";
import { chai, vi } from "vitest";
import { AzureStaticWebAppGetDeploymentTokenDriver } from "../../../../../src/component/driver/deploy/azure/azureStaticWebAppGetDeploymentTokenDriver";
import * as azureResourceOperation from "../../../../../src/component/utils/azureResourceOperation";

describe("AzureStaticWebAppGetDeploymentTokenDriver", () => {
  let driver: AzureStaticWebAppGetDeploymentTokenDriver;
  let clientStub: appService.WebSiteManagementClient;
  let createClientSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    driver = new AzureStaticWebAppGetDeploymentTokenDriver();
    clientStub = {
      staticSites: {
        listStaticSiteSecrets: vi.fn(),
      },
    } as any;
    createClientSpy = vi
      .spyOn(AzureStaticWebAppGetDeploymentTokenDriver, "createWebSiteManagementClient")
      .mockReturnValue(clientStub as any);
    vi.spyOn(azureResourceOperation, "getAzureAccountCredential").mockResolvedValue({} as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should get deployment token", async () => {
    const secrets = { properties: { apiKey: "testKey" } };
    vi.mocked(clientStub.staticSites.listStaticSiteSecrets as any).mockResolvedValue(secrets);

    const result = await driver.execute(
      {
        resourceId:
          "/subscriptions/aaa-bbb-ccc/resourceGroups/fff-rg/providers/Microsoft.Web/staticSites/aaabbbbccc",
      },
      { azureAccountProvider: {} } as any,
      new Map([["deploymentToken", "SECRET_TAB_SWA_DEPLOYMENT_TOKEN"]])
    );

    chai.expect(result.result.isOk()).to.be.true;
    chai
      .expect(result.result.unwrapOr(new Map()).get("SECRET_TAB_SWA_DEPLOYMENT_TOKEN"))
      .to.equal("testKey");
  });

  it("createWebSiteManagementClient should create management client", async () => {
    createClientSpy.mockRestore();
    const client = AzureStaticWebAppGetDeploymentTokenDriver.createWebSiteManagementClient(
      {} as any,
      "sub-id"
    );
    chai.expect(client).to.be.instanceOf(appService.WebSiteManagementClient);
  });

  it("should get deployment token use default settings", async () => {
    const secrets = { properties: { apiKey: "testKey" } };
    vi.mocked(clientStub.staticSites.listStaticSiteSecrets as any).mockResolvedValue(secrets);

    const result = await driver.execute(
      {
        resourceId:
          "/subscriptions/aaa-bbb-ccc/resourceGroups/fff-rg/providers/Microsoft.Web/staticSites/aaabbbbcccdd",
      },
      { azureAccountProvider: {} } as any,
      new Map([["deploymentToken", ""]])
    );

    chai.expect(result.result.isOk()).to.be.true;
    chai
      .expect(result.result.unwrapOr(new Map()).get("SECRET_TAB_SWA_DEPLOYMENT_TOKEN"))
      .to.equal(undefined);
  });

  it("should handle error when getting deployment token", async () => {
    vi.mocked(clientStub.staticSites.listStaticSiteSecrets as any).mockImplementation(() => {
      throw new Error("test error");
    });

    const result = await driver.execute(
      { resourceId: "testResourceId" },
      { azureAccountProvider: {} } as any,
      new Map([["deploymentToken", "SECRET_TAB_SWA_DEPLOYMENT_TOKEN"]])
    );

    chai.expect(result.result.isErr()).to.be.true;
  });

  it("should handle error when no output env var name", async () => {
    const result = await driver.execute({ resourceId: "testResourceId" }, {
      azureAccountProvider: {},
    } as any);

    chai.expect(result.result.isErr()).to.be.true;
  });

  it("should handle error when no deployment token output env var name", async () => {
    const result = await driver.execute(
      { resourceId: "testResourceId" },
      { azureAccountProvider: {} } as any,
      new Map([["test", "test"]])
    );

    chai.expect(result.result.isErr()).to.be.true;
  });
});
