// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author xzf0587 <zhaofengxu@microsoft.com>
 */
import * as tools from "../../../../../src/common/utils";
import { AzureStorageDeployDriver } from "../../../../../src/component/driver/deploy/azure/azureStorageDeployDriver";
import { DeployArgs } from "../../../../../src/component/driver/interface/buildAndDeployArgs";
import { TestLogProvider } from "../../../util/logProviderMock";
import {
  ListAccountSasResponse,
  StorageAccounts,
  StorageManagementClient,
} from "@azure/arm-storage";
import {
  BlobDeleteResponse,
  BlockBlobClient,
  BlockBlobParallelUploadOptions,
  ContainerClient,
} from "@azure/storage-blob";
import * as armStorage from "@azure/arm-storage";
import {
  MockedAzureAccountProvider,
  MockUserInteraction,
  MyTokenCredential,
} from "../../../../core/utils";
import * as os from "os";
import * as uuid from "uuid";
import * as path from "path";
import * as fs from "fs-extra";
import { IProgressHandler } from "@microsoft/teamsfx-api";
import { assert, chai, vi } from "vitest";

function getMockStorageAccount1() {
  return {
    listAccountSAS: async function (): Promise<ListAccountSasResponse> {
      return {
        accountSasToken: "abc",
      };
    },
  };
}

describe("Azure Storage Deploy Driver test", () => {
  const sandbox = vi;
  const sysTmp = os.tmpdir();
  const folder = uuid.v4();
  const testFolder = path.join(sysTmp, folder);

  before(async () => {
    await fs.mkdirs(testFolder);
  });

  after(async () => {
    fs.rmSync(testFolder, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.spyOn(tools, "waitSeconds").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deploy to storage happy path", async () => {
    const deploy = new AzureStorageDeployDriver();
    await fs.open(path.join(testFolder, "test.txt"), "a");
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
    } as DeployArgs;
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
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );
    const mockStorageManagementClient = new StorageManagementClient(new MyTokenCredential(), "id");
    mockStorageManagementClient.storageAccounts = getMockStorageAccount1() as any;
    vi.spyOn(armStorage, "StorageManagementClient").mockImplementation(function () {
      return mockStorageManagementClient;
    } as any);
    vi.spyOn(ContainerClient.prototype, "exists").mockResolvedValue(false);
    vi.spyOn(ContainerClient.prototype, "create").mockResolvedValue();
    vi.spyOn(ContainerClient.prototype, "listBlobsFlat").mockReturnValue([
      {
        properties: {
          contentLength: 1,
        },
      },
    ] as any);
    //vi.spyOn(ContainerClient.prototype, "listBlobsFlat").mockResolvedValue();
    vi.spyOn(ContainerClient.prototype, "deleteBlob").mockResolvedValue({
      errorCode: undefined,
    } as BlobDeleteResponse);
    /*const calls = vi.fn().mockImplementation(() => clientStub);
    Object.setPrototypeOf(StorageManagementClient, calls);*/
    vi.spyOn(ContainerClient.prototype, "getBlockBlobClient").mockReturnValue({
      uploadFile: async (filePath: string, options?: BlockBlobParallelUploadOptions) => {
        return {};
      },
    } as BlockBlobClient);
    const rex = await deploy.execute(args, context);
    assert.equal(rex.result.isOk(), true);
  });

  it("deploy to storage happy path when storage exists", async () => {
    const deploy = new AzureStorageDeployDriver();
    await fs.open(path.join(testFolder, "test.txt"), "a");
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
    } as DeployArgs;
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
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );
    const mockStorageManagementClient = new StorageManagementClient(new MyTokenCredential(), "id");
    mockStorageManagementClient.storageAccounts = getMockStorageAccount1() as any;
    vi.spyOn(armStorage, "StorageManagementClient").mockImplementation(function () {
      return mockStorageManagementClient;
    } as any);
    vi.spyOn(ContainerClient.prototype, "exists").mockResolvedValue(true);
    vi.spyOn(ContainerClient.prototype, "listBlobsFlat").mockReturnValue([
      {
        properties: {
          contentLengthNo: 1,
        },
      },
    ] as any);
    //vi.spyOn(ContainerClient.prototype, "listBlobsFlat").mockResolvedValue();
    vi.spyOn(ContainerClient.prototype, "deleteBlob").mockResolvedValue({
      errorCode: undefined,
    } as BlobDeleteResponse);
    /*const calls = vi.fn().mockImplementation(() => clientStub);
    Object.setPrototypeOf(StorageManagementClient, calls);*/
    vi.spyOn(ContainerClient.prototype, "getBlockBlobClient").mockReturnValue({
      uploadFile: async (filePath: string, options?: BlockBlobParallelUploadOptions) => {
        return {};
      },
    } as BlockBlobClient);
    const rex = await deploy.execute(args, context);
    assert.equal(rex.result.isOk(), true);
  });

  it("get azure account credential error", async () => {
    const deploy = new AzureStorageDeployDriver();
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      ignoreFile: "./ignore",
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
    } as DeployArgs;
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
    } as any;
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockImplementation(() => {
      throw new Error("error");
    });

    const res = await deploy.execute(args, context);
    assert.equal(res.result.isErr(), true);
  });

  it("clear storage error", async () => {
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
    } as any;
    const deploy = new AzureStorageDeployDriver();
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );

    const mockStorageManagementClient = new StorageManagementClient(new MyTokenCredential(), "id");
    mockStorageManagementClient.storageAccounts = getMockStorageAccount1() as any;
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
    } as DeployArgs;
    vi.spyOn(armStorage, "StorageManagementClient").mockImplementation(function () {
      return mockStorageManagementClient;
    } as any);
    vi.spyOn(ContainerClient.prototype, "exists").mockResolvedValue(false);
    vi.spyOn(ContainerClient.prototype, "create").mockResolvedValue();
    vi.spyOn(ContainerClient.prototype, "listBlobsFlat").mockReturnValue([
      {
        properties: {
          contentLength: 1,
        },
      },
    ] as any);
    //vi.spyOn(ContainerClient.prototype, "listBlobsFlat").mockResolvedValue();
    vi.spyOn(ContainerClient.prototype, "deleteBlob").mockResolvedValue({
      errorCode: "403",
    } as BlobDeleteResponse);
    const res = await deploy.execute(args, context);
    assert.equal(res.result.isErr(), true);
    chai.assert.equal(res.result._unsafeUnwrapErr().name, "AzureStorageClearBlobsError");
  });

  it("clear storage with remote server error", async () => {
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
    } as any;
    const deploy = new AzureStorageDeployDriver();
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );

    const mockStorageManagementClient = new StorageManagementClient(new MyTokenCredential(), "id");
    mockStorageManagementClient.storageAccounts = getMockStorageAccount1() as any;
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
    } as DeployArgs;
    vi.spyOn(armStorage, "StorageManagementClient").mockImplementation(function () {
      return mockStorageManagementClient;
    } as any);
    vi.spyOn(ContainerClient.prototype, "exists").mockResolvedValue(false);
    vi.spyOn(ContainerClient.prototype, "create").mockResolvedValue();
    vi.spyOn(ContainerClient.prototype, "listBlobsFlat").mockReturnValue([
      {
        properties: {
          contentLength: 1,
        },
      },
    ] as any);
    //vi.spyOn(ContainerClient.prototype, "listBlobsFlat").mockResolvedValue();
    vi.spyOn(ContainerClient.prototype, "deleteBlob").mockResolvedValue({
      errorCode: "error",
      _response: { status: 500 },
    } as BlobDeleteResponse);
    const res = await deploy.execute(args, context);
    assert.equal(res.result.isErr(), true);
    chai.assert.equal(res.result._unsafeUnwrapErr().name, "AzureStorageClearBlobsError");
  });

  it("upload with error", async () => {
    const deploy = new AzureStorageDeployDriver();
    await fs.open(path.join(testFolder, "test.txt"), "a");
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
    } as DeployArgs;
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
    } as any;
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );
    const mockStorageManagementClient = new StorageManagementClient(new MyTokenCredential(), "id");
    mockStorageManagementClient.storageAccounts = getMockStorageAccount1() as any;
    vi.spyOn(armStorage, "StorageManagementClient").mockImplementation(function () {
      return mockStorageManagementClient;
    } as any);
    vi.spyOn(ContainerClient.prototype, "exists").mockResolvedValue(false);
    vi.spyOn(ContainerClient.prototype, "create").mockResolvedValue();
    vi.spyOn(ContainerClient.prototype, "listBlobsFlat").mockReturnValue([
      {
        properties: {
          contentLength: 1,
        },
      },
    ] as any);
    //vi.spyOn(ContainerClient.prototype, "listBlobsFlat").mockResolvedValue();
    vi.spyOn(ContainerClient.prototype, "deleteBlob").mockResolvedValue({
      errorCode: undefined,
    } as BlobDeleteResponse);
    /*const calls = vi.fn().mockImplementation(() => clientStub);
    Object.setPrototypeOf(StorageManagementClient, calls);*/
    vi.spyOn(ContainerClient.prototype, "getBlockBlobClient").mockReturnValue({
      uploadFile: async (filePath: string, options?: BlockBlobParallelUploadOptions) => {
        return { errorCode: "error" };
      },
    } as BlockBlobClient);
    const res = await deploy.execute(args, context);
    assert.equal(res.result.isErr(), true);
    chai.assert.equal(res.result._unsafeUnwrapErr().name, "AzureStorageUploadFilesError");
  });

  it("upload with remote server error", async () => {
    const deploy = new AzureStorageDeployDriver();
    await fs.open(path.join(testFolder, "test.txt"), "a");
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
    } as DeployArgs;
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
    } as any;
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );
    const mockStorageManagementClient = new StorageManagementClient(new MyTokenCredential(), "id");
    mockStorageManagementClient.storageAccounts = getMockStorageAccount1() as any;
    vi.spyOn(armStorage, "StorageManagementClient").mockImplementation(function () {
      return mockStorageManagementClient;
    } as any);
    vi.spyOn(ContainerClient.prototype, "exists").mockResolvedValue(false);
    vi.spyOn(ContainerClient.prototype, "create").mockResolvedValue();
    vi.spyOn(ContainerClient.prototype, "listBlobsFlat").mockReturnValue([
      {
        properties: {
          contentLength: 1,
        },
      },
    ] as any);
    //vi.spyOn(ContainerClient.prototype, "listBlobsFlat").mockResolvedValue();
    vi.spyOn(ContainerClient.prototype, "deleteBlob").mockResolvedValue({
      errorCode: undefined,
    } as BlobDeleteResponse);
    /*const calls = vi.fn().mockImplementation(() => clientStub);
    Object.setPrototypeOf(StorageManagementClient, calls);*/
    vi.spyOn(ContainerClient.prototype, "getBlockBlobClient").mockReturnValue({
      uploadFile: async (filePath: string, options?: BlockBlobParallelUploadOptions) => {
        return { errorCode: "error", _response: { status: 500 } };
      },
    } as BlockBlobClient);
    const res = await deploy.execute(args, context);
    assert.equal(res.result.isErr(), true);
    chai.assert.equal(res.result._unsafeUnwrapErr().name, "AzureStorageUploadFilesError");
  });

  it("get container with remote server error", async () => {
    const deploy = new AzureStorageDeployDriver();
    await fs.open(path.join(testFolder, "test.txt"), "a");
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
    } as DeployArgs;
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
    } as any;
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );
    const mockStorageManagementClient = new StorageManagementClient(new MyTokenCredential(), "id");
    mockStorageManagementClient.storageAccounts = getMockStorageAccount1() as any;
    vi.spyOn(armStorage, "StorageManagementClient").mockImplementation(function () {
      return mockStorageManagementClient;
    } as any);
    vi.spyOn(ContainerClient.prototype, "exists").mockImplementation(() => {
      throw { statusCode: 500 };
    });
    vi.spyOn(ContainerClient.prototype, "getBlockBlobClient").mockReturnValue({
      uploadFile: async (filePath: string, options?: BlockBlobParallelUploadOptions) => {
        return {};
      },
    } as BlockBlobClient);
    const res = await deploy.execute(args, context);
    assert.equal(res.result.isErr(), true);
    chai.assert.equal(res.result._unsafeUnwrapErr().name, "AzureStorageGetContainerError");
  });

  it("get container with normal error", async () => {
    const deploy = new AzureStorageDeployDriver();
    await fs.open(path.join(testFolder, "test.txt"), "a");
    const args = {
      workingDirectory: sysTmp,
      artifactFolder: `./${folder}`,
      resourceId:
        "/subscriptions/e24d88be-bbbb-1234-ba25-aa11aaaa1aa1/resourceGroups/hoho-rg/providers/Microsoft.Storage/storageAccounts/some-server-farm",
    } as DeployArgs;
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
    } as any;
    vi.spyOn(context.azureAccountProvider, "getIdentityCredentialAsync").mockResolvedValue(
      new MyTokenCredential()
    );
    const mockStorageManagementClient = new StorageManagementClient(new MyTokenCredential(), "id");
    mockStorageManagementClient.storageAccounts = getMockStorageAccount1() as any;
    vi.spyOn(armStorage, "StorageManagementClient").mockImplementation(function () {
      return mockStorageManagementClient;
    } as any);
    vi.spyOn(ContainerClient.prototype, "exists").mockImplementation(() => {
      throw { statusCode: 400 };
    });
    vi.spyOn(ContainerClient.prototype, "getBlockBlobClient").mockReturnValue({
      uploadFile: async (filePath: string, options?: BlockBlobParallelUploadOptions) => {
        return {};
      },
    } as BlockBlobClient);
    const res = await deploy.execute(args, context);
    assert.equal(res.result.isErr(), true);
    chai.assert.equal(res.result._unsafeUnwrapErr().name, "AzureStorageGetContainerError");
  });
});
