// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import AzureLoginCI from "../../../src/commonlib/azureLoginCI";
import { expect } from "../utils";
import fs, { WriteFileOptions } from "fs-extra";
import { signedOut } from "@microsoft/teamsfx-api";
import { AzureSPConfig, AzureSpCrypto } from "../../../src/commonlib/cacheAccess";
import { vi } from "vitest";
describe("Azure Service Principal login Tests", function () {
  const sandbox = vi;

  beforeEach(async () => {
    vi.spyOn(fs, "ensureDir").mockImplementation(async (path: fs.PathLike) => {
      return true;
    });
    vi.spyOn(fs, "writeFile").mockImplementation(
      async (folder: any, content: string, options?: WriteFileOptions | string) => {
        return;
      }
    );
    vi.spyOn(fs, "remove").mockImplementation(async (path: fs.PathLike) => {
      return;
    });
    vi.spyOn(fs, "pathExists").mockImplementation(async (path: fs.PathLike) => {
      return true;
    });
    vi.spyOn(fs, "existsSync").mockImplementation((path: fs.PathLike) => {
      return true;
    });
    vi.spyOn(fs, "readFileSync").mockImplementation((path: any, options: any) => {
      return '{"clientId":"clientId","secret":"secret","tenantId":"3c8f28dd-b990-4925-96a6-3ea9495654b8"}';
    });
    vi.spyOn(fs, "readFile").mockImplementation(
      async (file: string | Buffer | number, options?: any) => {
        return Buffer.from(
          '{"i":"1f26ae86a392931c124a60bdd87bcfad","c":"855944b46b9250d67494aa072bafe4bafe8dee9712ae4dd21bc31d9fa75ba4048ac4845fd68905fc1dca28fd5df06bed6af2c7ecb57121b0ba560fd1a71ed241eafef0aa503c0a51722aa11b1e8482dfded052bb9e66630fb785b3","t":"b1b705aa70948661e365e9f3e95c6cae"}',
          "utf-8"
        );
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("init", async () => {
    vi.spyOn(AzureSpCrypto, "loadAzureSP").mockResolvedValue(undefined);
    vi.spyOn(AzureSpCrypto, "saveAzureSP").mockResolvedValue();
    vi.spyOn(AzureSpCrypto, "clearAzureSP").mockResolvedValue();
    await AzureLoginCI.init("clientId", "secret", "tenantId");

    await AzureLoginCI.init("clientId", "~/3.pem", "tenantId");

    await AzureLoginCI.init("clientId", "D:/test/3.pem", "tenantId");
  });

  it("getIdentityCredentialAsync", async () => {
    vi.spyOn(AzureSpCrypto, "loadAzureSP").mockResolvedValue(undefined);
    vi.spyOn(AzureSpCrypto, "saveAzureSP").mockResolvedValue();
    vi.spyOn(AzureSpCrypto, "clearAzureSP").mockResolvedValue();
    await AzureLoginCI.init("clientId", "secret", "tenantId");
    await AzureLoginCI.getIdentityCredentialAsync();
  });

  it("signout", async () => {
    vi.spyOn(AzureSpCrypto, "loadAzureSP").mockResolvedValue({} as AzureSPConfig);
    vi.spyOn(AzureSpCrypto, "saveAzureSP").mockResolvedValue();
    vi.spyOn(AzureSpCrypto, "clearAzureSP").mockResolvedValue();
    const result = await AzureLoginCI.signout();
    expect(result).equals(true);

    const r1 = await AzureLoginCI.getStatus();
    expect(r1.status).equals(signedOut);
  });
});
