import { Uri } from "vscode";
import * as envTreeUtils from "../../src/utils/envTreeUtils";
import { vi, afterEach, expect } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";

// ✅ Mock internal modules
vi.mock("../../src/utils/fileSystemUtils");
vi.mock("../../src/utils/appDefinitionUtils");
vi.mock("../../src/globalVariables");

import * as fileSystemUtils from "../../src/utils/fileSystemUtils";
import * as appDefinitionUtils from "../../src/utils/appDefinitionUtils";
import * as globalVariables from "../../src/globalVariables";
import { fsAdapter, envParseAdapter } from "../../src/common/npmPackageDeps";

describe("EnvTreeUtils", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getSubscriptionInfoFromEnv", () => {
    const subscriptionInfo = {
      subscriptionName: "subscriptionName",
      subscriptionId: "subscriptionId",
      tenantId: "tenantId",
    };
    const provisionResult: Record<string, any> = {
      solution: subscriptionInfo,
    };

    it("returns subscription info successfully", async () => {
      // ✅ Mock internal module
      vi.mocked(fileSystemUtils.getProvisionResultJson).mockResolvedValue(provisionResult);
      const result = await envTreeUtils.getSubscriptionInfoFromEnv("test");
      expect(result).deep.equals(subscriptionInfo);
    });

    it("returns undefined if get provision result throws error", async () => {
      vi.mocked(fileSystemUtils.getProvisionResultJson).mockRejectedValue(new Error());
      const result = await envTreeUtils.getSubscriptionInfoFromEnv("test");
      expect(result).is.undefined;
    });

    it("returns undefined if get provision result is undefined", async () => {
      vi.mocked(fileSystemUtils.getProvisionResultJson).mockResolvedValue(undefined);
      const result = await envTreeUtils.getSubscriptionInfoFromEnv("test");
      expect(result).is.undefined;
    });

    it("returns undefined if get provision result does not contain subscriptionId", async () => {
      vi.mocked(fileSystemUtils.getProvisionResultJson).mockResolvedValue({
        solution: {},
      } as any);
      const result = await envTreeUtils.getSubscriptionInfoFromEnv("test");
      expect(result).is.undefined;
    });
  });

  describe("getM365TenantFromEnv", () => {
    beforeEach(() => {
      mockValue(globalVariables, "workspaceUri", Uri.file("/test"));
    });

    it("returns m365 tenantId successfully", async () => {
      // ✅ Mock npm packages via adapters
      vi.spyOn(fsAdapter, "pathExists").mockResolvedValue(true);
      vi.spyOn(fsAdapter, "readFileSync").mockReturnValue("TEAMS_APP_TENANT_ID=fakeTenantId\n");
      vi.spyOn(envParseAdapter, "deserializeDotenv").mockReturnValue({
        obj: { TEAMS_APP_TENANT_ID: "fakeTenantId" },
      } as any);

      const result = await envTreeUtils.getM365TenantFromEnv("test");
      expect(result).equal("fakeTenantId");
    });

    it("returns undefined if env file doesn't exist", async () => {
      vi.spyOn(fsAdapter, "pathExists").mockResolvedValue(false);
      const result = await envTreeUtils.getM365TenantFromEnv("test");
      expect(result).equal(undefined);
    });

    it("returns undefined if tenant id doesn't exist in env file", async () => {
      vi.spyOn(fsAdapter, "pathExists").mockResolvedValue(true);
      vi.spyOn(fsAdapter, "readFileSync").mockReturnValue("");
      vi.spyOn(envParseAdapter, "deserializeDotenv").mockReturnValue({
        obj: {},
      } as any);

      const result = await envTreeUtils.getM365TenantFromEnv("test");
      expect(result).equal(undefined);
    });
  });

  describe("getResourceGroupNameFromEnv", () => {
    const resourceGroupName = {
      resourceGroupName: "fakeResourceGroupName",
    };
    const provisionResult: Record<string, any> = {
      solution: resourceGroupName,
    };

    it("returns resource group name successfully", async () => {
      vi.mocked(fileSystemUtils.getProvisionResultJson).mockResolvedValue(provisionResult);
      const result = await envTreeUtils.getResourceGroupNameFromEnv("test");
      expect(result).equal("fakeResourceGroupName");
    });

    it("returns undefined if get provision result throws error", async () => {
      vi.mocked(fileSystemUtils.getProvisionResultJson).mockRejectedValue(new Error());
      const result = await envTreeUtils.getResourceGroupNameFromEnv("test");
      expect(result).is.undefined;
    });

    it("returns undefined if get provision result returns undefined", async () => {
      vi.mocked(fileSystemUtils.getProvisionResultJson).mockResolvedValue(undefined);
      const result = await envTreeUtils.getResourceGroupNameFromEnv("test");
      expect(result).is.undefined;
    });

    it("returns undefined if get provision result does not contain solution", async () => {
      vi.mocked(fileSystemUtils.getProvisionResultJson).mockResolvedValue({});
      const result = await envTreeUtils.getResourceGroupNameFromEnv("test");
      expect(result).is.undefined;
    });
  });

  describe("getProvisionSucceedFromEnv", () => {
    beforeEach(() => {
      mockValue(globalVariables, "workspaceUri", Uri.file("test"));
    });

    it("returns false if teamsAppId is empty", async () => {
      // ✅ Mock internal module
      vi.mocked(appDefinitionUtils.getV3TeamsAppId).mockResolvedValue("");
      const result = await envTreeUtils.getProvisionSucceedFromEnv("test");
      expect(result).equals(false);
    });

    it("returns true if teamsAppId is not empty", async () => {
      vi.mocked(appDefinitionUtils.getV3TeamsAppId).mockResolvedValue("xxx");
      const result = await envTreeUtils.getProvisionSucceedFromEnv("test");
      expect(result).equals(true);
    });

    it("returns false if teamsAppId has error", async () => {
      vi.mocked(appDefinitionUtils.getV3TeamsAppId).mockRejectedValue(new Error());
      const result = await envTreeUtils.getProvisionSucceedFromEnv("test");
      expect(result).equals(false);
    });
  });
});
