import { ListAccountSasResponse, StorageAccounts } from "@azure/arm-storage";
import { expect, vi } from "vitest";
import * as tools from "../../../src/common/utils";
import {
  generateSasToken,
  getAzureAccountCredential,
} from "../../../src/component/utils/azureResourceOperation";
import { MockedAzureAccountProvider } from "../../core/utils";

describe("Azure Resource Operation test", () => {
  const sandbox = vi;

  beforeEach(async () => {
    vi.spyOn(tools, "waitSeconds").mockResolvedValue();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("should get Azure account credential error", async () => {
    const tokenProvider = new MockedAzureAccountProvider();
    vi.spyOn(tokenProvider, "getIdentityCredentialAsync").mockResolvedValue(undefined);
    await expect(getAzureAccountCredential(tokenProvider)).rejects.toThrow();
  });

  it("should generate Sas token error", async () => {
    const storageAccounts = {
      listAccountSAS: async function (): Promise<ListAccountSasResponse> {
        return {
          accountSasToken: "abc",
        };
      },
    } as unknown as StorageAccounts;
    vi.spyOn(storageAccounts, "listAccountSAS").mockImplementation(() => {
      throw new Error("error");
    });
    await expect(generateSasToken(storageAccounts, "test", "test")).rejects.toThrow();
  });

  it("should generate Sas token with empty response", async () => {
    const storageAccounts = {
      listAccountSAS: async function (): Promise<ListAccountSasResponse> {
        return {
          accountSasToken: "",
        };
      },
    } as unknown as StorageAccounts;
    await expect(generateSasToken(storageAccounts, "test", "test")).rejects.toThrow();
  });
});
