import * as armResources from "@azure/arm-resources";
import { ResourceManagementClient } from "@azure/arm-resources";
import { SubscriptionClient } from "@azure/arm-subscriptions";
import { ok, Platform } from "@microsoft/teamsfx-api";
import { assert, vi } from "vitest";
import { setTools, TOOLS } from "../../src/common/globalVars";
import {
  resourceGroupHelper,
  resourceGroupHelperDeps,
} from "../../src/component/utils/ResourceGroupHelper";
import {
  CheckResourceGroupExistenceError,
  CreateResourceGroupError,
  GetResourceGroupError,
  ListResourceGroupLocationsError,
  ListResourceGroupsError,
} from "../../src/error/azure";
import { MockTools, MyTokenCredential } from "../core/utils";

describe("resouce group helper test", () => {
  const sandbox = vi;
  const tools = new MockTools();
  setTools(tools);
  beforeEach(() => {
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "setSubscription").mockResolvedValue();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("askResourceGroupInfoV3", async () => {
    vi.spyOn(resourceGroupHelper, "listResourceGroups").mockResolvedValue(ok([["rg1", "loc1"]]));
    vi.spyOn(resourceGroupHelper, "getLocations").mockResolvedValue(ok(["loc1"]));
    vi.spyOn(TOOLS.ui, "selectOption").mockResolvedValue(
      ok({ type: "success", result: { id: "rg1", label: "loc1" } })
    );
    const mockResourceManagementClient = new ResourceManagementClient(
      new MyTokenCredential(),
      "id"
    );
    const res = await resourceGroupHelper.askResourceGroupInfoV3(
      { platform: Platform.VSCode, projectPath: "" },
      tools.tokenProvider.azureAccountProvider,
      mockResourceManagementClient,
      "rg1"
    );
    if (res.isErr()) {
      console.error(res.error);
    }
    assert.isTrue(res.isOk());
  });

  it("resourceGroupHelperDeps should create subscription client", () => {
    const client = resourceGroupHelperDeps.createSubscriptionClient(new MyTokenCredential());
    assert.instanceOf(client, SubscriptionClient);
  });

  it("createResourceGroup return undefined", async () => {
    const mockResourceManagementClient = new ResourceManagementClient(
      new MyTokenCredential(),
      "id"
    );
    vi.spyOn(armResources, "ResourceManagementClient").mockImplementation(function () {
      return mockResourceManagementClient as any;
    } as any);
    vi.spyOn(
      tools.tokenProvider.azureAccountProvider,
      "getIdentityCredentialAsync"
    ).mockResolvedValue(new MyTokenCredential());
    vi.spyOn(resourceGroupHelper, "checkResourceGroupExistence").mockResolvedValue(ok(false));
    vi.spyOn(mockResourceManagementClient.resourceGroups, "createOrUpdate").mockResolvedValue({
      name: undefined,
      location: "east us",
    });
    const res = await resourceGroupHelper.createNewResourceGroup(
      "mockRG",
      tools.tokenProvider.azureAccountProvider,
      "mockSubId",
      "east us"
    );
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof CreateResourceGroupError);
    }
  });

  it("createResourceGroup throw error", async () => {
    const mockResourceManagementClient = new ResourceManagementClient(
      new MyTokenCredential(),
      "id"
    );
    vi.spyOn(armResources, "ResourceManagementClient").mockImplementation(function () {
      return mockResourceManagementClient as any;
    } as any);
    vi.spyOn(
      tools.tokenProvider.azureAccountProvider,
      "getIdentityCredentialAsync"
    ).mockResolvedValue(new MyTokenCredential());
    vi.spyOn(resourceGroupHelper, "checkResourceGroupExistence").mockResolvedValue(ok(false));
    vi.spyOn(mockResourceManagementClient.resourceGroups, "createOrUpdate").mockRejectedValue(
      new Error("test")
    );
    const res = await resourceGroupHelper.createNewResourceGroup(
      "mockRG",
      tools.tokenProvider.azureAccountProvider,
      "mockSubId",
      "east us"
    );
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof CreateResourceGroupError);
    }
  });

  it("createResourceGroup success", async () => {
    const mockResourceManagementClient = new ResourceManagementClient(
      new MyTokenCredential(),
      "id"
    );
    vi.spyOn(armResources, "ResourceManagementClient").mockImplementation(function () {
      return mockResourceManagementClient as any;
    } as any);
    vi.spyOn(
      tools.tokenProvider.azureAccountProvider,
      "getIdentityCredentialAsync"
    ).mockResolvedValue(new MyTokenCredential());
    vi.spyOn(resourceGroupHelper, "checkResourceGroupExistence").mockResolvedValue(ok(false));
    vi.spyOn(mockResourceManagementClient.resourceGroups, "createOrUpdate").mockResolvedValue({
      name: "mockRg",
      location: "east us",
    });
    const res = await resourceGroupHelper.createNewResourceGroup(
      "mockRG",
      tools.tokenProvider.azureAccountProvider,
      "mockSubId",
      "east us"
    );
    assert.isTrue(res.isOk());
  });

  it("checkResourceGroupExistence success", async () => {
    const mockResourceManagementClient = new ResourceManagementClient(
      new MyTokenCredential(),
      "id"
    );
    vi.spyOn(mockResourceManagementClient.resourceGroups, "checkExistence").mockResolvedValue({
      body: true,
    });
    const res = await resourceGroupHelper.checkResourceGroupExistence(
      "mockRG",
      mockResourceManagementClient
    );
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.isTrue(res.value);
    }
  });

  it("checkResourceGroupExistence throw Error", async () => {
    const mockResourceManagementClient = new ResourceManagementClient(
      new MyTokenCredential(),
      "id"
    );
    vi.spyOn(mockResourceManagementClient.resourceGroups, "checkExistence").mockRejectedValue(
      new Error("test")
    );
    const res = await resourceGroupHelper.checkResourceGroupExistence(
      "mockRG",
      mockResourceManagementClient
    );
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof CheckResourceGroupExistenceError);
    }
  });

  it("getResourceGroupInfo success", async () => {
    const mockResourceManagementClient = new ResourceManagementClient(
      new MyTokenCredential(),
      "id"
    );
    vi.spyOn(mockResourceManagementClient.resourceGroups, "get").mockResolvedValue({
      name: "mockRG",
      location: "XXX",
    });
    const res = await resourceGroupHelper.getResourceGroupInfo(
      "mockRG",
      mockResourceManagementClient
    );
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.isTrue(res.value?.name === "mockRG");
    }
  });

  it("getResourceGroupInfo success return undefined", async () => {
    const mockResourceManagementClient = new ResourceManagementClient(
      new MyTokenCredential(),
      "id"
    );
    vi.spyOn(mockResourceManagementClient.resourceGroups, "get").mockResolvedValue({
      location: "XXX",
    });
    const res = await resourceGroupHelper.getResourceGroupInfo(
      "mockRG",
      mockResourceManagementClient
    );
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.isUndefined(res.value);
    }
  });

  it("getResourceGroupInfo throw Error", async () => {
    const mockResourceManagementClient = new ResourceManagementClient(
      new MyTokenCredential(),
      "id"
    );
    vi.spyOn(mockResourceManagementClient.resourceGroups, "get").mockRejectedValue(new Error(""));
    const res = await resourceGroupHelper.getResourceGroupInfo(
      "mockRG",
      mockResourceManagementClient
    );
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof GetResourceGroupError);
    }
  });

  it("listResourceGroups success", async () => {
    const client = new ResourceManagementClient(new MyTokenCredential(), "id");
    const iterator = {
      next: vi
        .fn()
        .mockResolvedValueOnce({
          value: { name: "rg1", location: "east us" },
          done: false,
        })
        .mockResolvedValueOnce({
          value: { name: "rg2", location: "east us" },
          done: true,
        }),
      byPage: vi.fn().mockResolvedValue([[{ name: "rg", location: "east us" }]]),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    vi.spyOn(client.resourceGroups, "list").mockReturnValue(iterator);
    const res = await resourceGroupHelper.listResourceGroups(client);
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.isTrue(res.value.length === 2);
    }
  });

  it("listResourceGroups throw Error", async () => {
    const client = new ResourceManagementClient(new MyTokenCredential(), "id");
    const iterator = {
      next: vi.fn().mockRejectedValue(new Error("test")),
      byPage: vi.fn().mockResolvedValue([[{ name: "rg", location: "east us" }]]),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    vi.spyOn(client.resourceGroups, "list").mockReturnValue(iterator);
    const res = await resourceGroupHelper.listResourceGroups(client);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof ListResourceGroupsError);
    }
  });

  it("getLocations success", async () => {
    const rmClient = new ResourceManagementClient(new MyTokenCredential(), "id");
    const iterator = {
      next: vi
        .fn()
        .mockResolvedValueOnce({
          value: { displayName: "east us" },
          done: false,
        })
        .mockResolvedValueOnce({
          value: { displayName: "central us" },
          done: true,
        }),
      byPage: vi.fn().mockResolvedValue([[{ displayName: "east us" }]]),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    vi.spyOn(resourceGroupHelperDeps, "createSubscriptionClient").mockReturnValue({
      subscriptions: { listLocations: () => iterator },
    } as any);
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        subscriptionName: "mockSubName",
        tenantId: "mockTID",
      }
    );
    vi.spyOn(rmClient.providers, "get").mockResolvedValue({
      resourceTypes: [{ resourceType: "resourceGroups", locations: ["east us"] }],
    });
    vi.spyOn(
      tools.tokenProvider.azureAccountProvider,
      "getIdentityCredentialAsync"
    ).mockResolvedValue(new MyTokenCredential());
    const res = await resourceGroupHelper.getLocations(
      tools.tokenProvider.azureAccountProvider,
      rmClient
    );
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.isTrue(res.value.length === 1);
    }
  });

  it("getLocations return zero results", async () => {
    const rmClient = new ResourceManagementClient(new MyTokenCredential(), "id");
    const iterator = {
      next: vi
        .fn()
        .mockResolvedValueOnce({
          value: { displayName: "east us" },
          done: false,
        })
        .mockResolvedValueOnce({
          value: { displayName: "central us" },
          done: true,
        }),
      byPage: vi.fn().mockResolvedValue([[{ displayName: "east us" }]]),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    vi.spyOn(resourceGroupHelperDeps, "createSubscriptionClient").mockReturnValue({
      subscriptions: { listLocations: () => iterator },
    } as any);
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        subscriptionName: "mockSubName",
        tenantId: "mockTID",
      }
    );
    vi.spyOn(rmClient.providers, "get").mockResolvedValue({
      resourceTypes: [],
    });
    vi.spyOn(
      tools.tokenProvider.azureAccountProvider,
      "getIdentityCredentialAsync"
    ).mockResolvedValue(new MyTokenCredential());
    const res = await resourceGroupHelper.getLocations(
      tools.tokenProvider.azureAccountProvider,
      rmClient
    );
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof ListResourceGroupLocationsError);
    }
  });

  it("getLocations throw Error", async () => {
    const rmClient = new ResourceManagementClient(new MyTokenCredential(), "id");
    const iterator = {
      next: vi.fn().mockRejectedValue({ message: "test error" }),
      byPage: vi.fn().mockResolvedValue([[{ displayName: "east us" }]]),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    vi.spyOn(resourceGroupHelperDeps, "createSubscriptionClient").mockReturnValue({
      subscriptions: { listLocations: () => iterator },
    } as any);
    vi.spyOn(tools.tokenProvider.azureAccountProvider, "getSelectedSubscription").mockResolvedValue(
      {
        subscriptionId: "mockSubId",
        subscriptionName: "mockSubName",
        tenantId: "mockTID",
      }
    );
    vi.spyOn(
      tools.tokenProvider.azureAccountProvider,
      "getIdentityCredentialAsync"
    ).mockResolvedValue(new MyTokenCredential());
    const res = await resourceGroupHelper.getLocations(
      tools.tokenProvider.azureAccountProvider,
      rmClient
    );
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof ListResourceGroupLocationsError);
    }
  });
});
