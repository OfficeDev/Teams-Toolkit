// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author xzf0587 <zhaofengxu@microsoft.com>
 */
import { BlobServiceClient, ServiceGetPropertiesResponse } from "@azure/storage-blob";
import { IProgressHandler } from "@microsoft/teamsfx-api";
import { chai, vi } from "vitest";
import * as tools from "../../../../../src/common/utils";
import { AzureStorageStaticWebsiteConfigDriver } from "../../../../../src/component/driver/deploy/azure/azureStorageStaticWebsiteConfigDriver";
import * as azureResourceOperation from "../../../../../src/component/utils/azureResourceOperation";
import {
  MockedAzureAccountProvider,
  MockUserInteraction,
  MyTokenCredential,
} from "../../../../core/utils";
import { TestLogProvider } from "../../../util/logProviderMock";

describe("Azure Storage enable static website Driver test", () => {
  beforeEach(() => {
    vi.spyOn(tools, "waitSeconds").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Azure Storage enable static website happy path", async () => {
    const driver = new AzureStorageStaticWebsiteConfigDriver();
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
      progressBar: {
        start: async (detail?: string): Promise<void> => {},
        next: async (detail?: string): Promise<void> => {},
        end: async (): Promise<void> => {},
      } as IProgressHandler,
    } as any;
    // fake azure credentials
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );

    const blobClient = {
      getProperties: vi.fn().mockResolvedValue({
        staticWebsite: {
          enabled: false,
        },
      } as ServiceGetPropertiesResponse),
      setProperties: vi.fn().mockResolvedValue(undefined),
    } as unknown as BlobServiceClient;
    vi.spyOn(azureResourceOperation, "createBlobServiceClient").mockResolvedValue(blobClient);

    const res = await driver.run(
      {
        storageResourceId:
          "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
        indexPage: "index.html",
        errorPage: "error.html",
      },
      context
    );

    chai.assert.equal(blobClient.setProperties.mock.calls.length, 1);
    chai.assert.equal(res.isOk(), true);

    const rex = await driver.execute(
      {
        storageResourceId:
          "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
        indexPage: "index.html",
        errorPage: "error.html",
      },
      context
    );
    chai.assert.equal(rex.result.isOk(), true);
  });

  it("Azure Storage use default", async () => {
    const driver = new AzureStorageStaticWebsiteConfigDriver();
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
    } as any;
    // fake azure credentials
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );

    const blobClient = {
      getProperties: vi.fn().mockResolvedValue({
        staticWebsite: {
          enabled: false,
        },
      } as ServiceGetPropertiesResponse),
      setProperties: vi.fn().mockResolvedValue(undefined),
    } as unknown as BlobServiceClient;
    vi.spyOn(azureResourceOperation, "createBlobServiceClient").mockResolvedValue(blobClient);

    const res = await driver.run(
      {
        storageResourceId:
          "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
        errorPage: null,
      },
      context
    );

    chai.assert.equal(blobClient.setProperties.mock.calls.length, 1);
    chai.assert.equal(res.isOk(), true);
  });

  it("should skip enable static website", async () => {
    const driver = new AzureStorageStaticWebsiteConfigDriver();
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
    } as any;
    // fake azure credentials
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );

    const blobClient = {
      getProperties: vi.fn().mockResolvedValue({
        staticWebsite: {
          enabled: true,
        },
      } as ServiceGetPropertiesResponse),
      setProperties: vi.fn().mockResolvedValue(undefined),
    } as unknown as BlobServiceClient;
    vi.spyOn(azureResourceOperation, "createBlobServiceClient").mockResolvedValue(blobClient);

    await driver.run(
      {
        storageResourceId:
          "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
        indexPage: "index.html",
        errorPage: "error.html",
      },
      context
    );

    chai.assert.equal(blobClient.setProperties.mock.calls.length, 0);
  });

  it("Azure Storage set properties error", async () => {
    const driver = new AzureStorageStaticWebsiteConfigDriver();
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
    } as any;
    // fake azure credentials
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );

    const blobClient = {
      getProperties: vi.fn().mockResolvedValue({
        staticWebsite: {
          enabled: false,
        },
      } as ServiceGetPropertiesResponse),
      setProperties: vi.fn().mockRejectedValue({ statusCode: 404, message: "Not found" }),
    } as unknown as BlobServiceClient;
    vi.spyOn(azureResourceOperation, "createBlobServiceClient").mockResolvedValue(blobClient);

    const res = await driver.run(
      {
        storageResourceId:
          "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
        indexPage: "index.html",
        errorPage: "error.html",
      },
      context
    );

    chai.assert.equal(blobClient.setProperties.mock.calls.length, 1);
    chai.assert.equal(res.isErr(), true);
  });

  it("Azure Storage set properties remote server error", async () => {
    const driver = new AzureStorageStaticWebsiteConfigDriver();
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
    } as any;
    // fake azure credentials
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );

    const blobClient = {
      getProperties: vi.fn().mockResolvedValue({
        staticWebsite: {
          enabled: false,
        },
      } as ServiceGetPropertiesResponse),
      setProperties: vi.fn().mockRejectedValue({ statusCode: 500 }),
    } as unknown as BlobServiceClient;
    vi.spyOn(azureResourceOperation, "createBlobServiceClient").mockResolvedValue(blobClient);

    const res = await driver.run(
      {
        storageResourceId:
          "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
        indexPage: "index.html",
        errorPage: "error.html",
      },
      context
    );

    chai.assert.equal(blobClient.setProperties.mock.calls.length, 1);
    chai.assert.equal(res.isErr(), true);
    console.log(res);
  });

  it("Azure Storage enable static website get properties error", async () => {
    const driver = new AzureStorageStaticWebsiteConfigDriver();
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
    } as any;
    // fake azure credentials
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );

    const blobClient = {
      getProperties: vi.fn().mockRejectedValue({ statusCode: 404, message: "Not found" }),
      setProperties: vi.fn().mockResolvedValue(undefined),
    } as unknown as BlobServiceClient;
    vi.spyOn(azureResourceOperation, "createBlobServiceClient").mockResolvedValue(blobClient);

    const res = await driver.run(
      {
        storageResourceId:
          "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
        indexPage: "index.html",
        errorPage: "error.html",
      },
      context
    );
    chai.assert.equal(res.isErr(), true);
    chai.assert.equal(res._unsafeUnwrapErr().name, "AzureStorageGetContainerPropertiesError");
  });

  it("Azure Storage enable static website get properties remote error", async () => {
    const driver = new AzureStorageStaticWebsiteConfigDriver();
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
    } as any;
    // fake azure credentials
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );

    const blobClient = {
      getProperties: vi.fn().mockRejectedValue({ statusCode: 500 }),
      setProperties: vi.fn().mockResolvedValue(undefined),
    } as unknown as BlobServiceClient;
    vi.spyOn(azureResourceOperation, "createBlobServiceClient").mockResolvedValue(blobClient);

    const res = await driver.run(
      {
        storageResourceId:
          "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
        indexPage: "index.html",
        errorPage: "error.html",
      },
      context
    );
    chai.assert.equal(res.isErr(), true);
    chai.assert.equal(res._unsafeUnwrapErr().name, "AzureStorageGetContainerPropertiesError");
  });
});
