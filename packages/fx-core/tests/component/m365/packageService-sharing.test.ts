// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios from "axios";
import fs from "fs-extra";
import { setTools } from "../../../src/common/globalVars";
import { M365AppEntity, M365EntityType } from "../../../src/component/m365/interface";
import { PackageService } from "../../../src/component/m365/packageService";
import { MockLogProvider } from "../../core/utils";
import { MockAxios } from "./mockAxios";
import { chai, vi } from "vitest";

describe("Package Service", () => {
  const sandbox = vi;
  const logger = new MockLogProvider();
  const mockAxios: MockAxios = new MockAxios(sandbox);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    mockAxios.reset();
    vi.spyOn(fs, "readFile").mockImplementation((file) => {
      return Promise.resolve(Buffer.from("test"));
    });
    vi.spyOn(axios, "create").mockReturnValue(mockAxios.instance);

    setTools({} as any);
    process.env["TEAMSFX_BUILDER_API"] = "1";

    mockAxios.axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
  });

  it("shareWithTenant success", async () => {
    mockAxios.axiosPostResponses["/builder/v1/users/titles/test-title-id/allowed?idType=TitleId"] =
      {
        status: 200,
        data: {},
      };

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.shareWithTenant("test-token", "test-title-id");

    chai.assert.isTrue(result.isOk());
    chai.assert.deepEqual(
      mockAxios.data["/builder/v1/users/titles/test-title-id/allowed?idType=TitleId"],
      {
        EntityCollection: {
          ForAllUsers: true,
          Entities: [],
        },
      }
    );
  });

  it("shareWithTenant error", async () => {
    const error = new Error("test-post-error") as any;
    error.response = {
      data: { error: { code: "test", message: "test message" } },
      headers: { traceresponse: "test-trace" },
    };
    mockAxios.axiosPostResponses["/builder/v1/users/titles/test-title-id/allowed?idType=TitleId"] =
      error;

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.shareWithTenant("test-token", "test-title-id");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.include(result.error.message, "test-post-error");
      chai.assert.include(result.error.message, "test-trace");
    }
  });

  it("getSharedUsers success", async () => {
    const mockEntities = [
      { entityId: "user1@test.com", entityType: M365EntityType.User },
      { entityId: "group1", entityType: M365EntityType.Group },
    ];
    mockAxios.axiosGetResponses["/builder/v1/users/titles/test-title-id/allowed?idType=TitleId"] = {
      status: 200,
      data: {
        entityCollection: {
          entities: mockEntities,
        },
      },
    };

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.getSharedUsers("test-token", "test-title-id");

    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value, mockEntities);
    }
  });

  it("getSharedUsers success with empty entities", async () => {
    mockAxios.axiosGetResponses["/builder/v1/users/titles/test-title-id/allowed?idType=TitleId"] = {
      status: 200,
      data: {
        entityCollection: {
          entities: undefined,
        },
      },
    };

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.getSharedUsers("test-token", "test-title-id");

    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value, []);
    }
  });

  it("getSharedUsers error", async () => {
    const error = new Error("test-get-error");
    (error as any).response = {
      data: { error: { code: "test", message: "test message" } },
      headers: { traceresponse: "test-trace" },
    };
    mockAxios.axiosGetResponses["/builder/v1/users/titles/test-title-id/allowed?idType=TitleId"] =
      error;

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.getSharedUsers("test-token", "test-title-id");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.include(result.error.message, "test-get-error");
      chai.assert.include(result.error.message, "test-trace");
    }
  });

  it("shareWithUsers success with titleId", async () => {
    const entities: M365AppEntity[] = [
      { entityId: "user1@test.com", entityType: M365EntityType.User },
      { entityId: "group1", entityType: M365EntityType.Group },
    ];
    mockAxios.axiosPostResponses["/builder/v1/users/titles/test-title-id/allowed?idType=TitleId"] =
      {
        status: 200,
        data: {},
      };

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.shareWithUsers("test-token", entities, "test-title-id");

    chai.assert.isTrue(result.isOk());
    chai.assert.deepEqual(
      mockAxios.data["/builder/v1/users/titles/test-title-id/allowed?idType=TitleId"],
      {
        EntityCollection: {
          ForAllUsers: false,
          Entities: entities,
        },
      }
    );
  });

  it("shareWithUsers success with appId", async () => {
    const entities: M365AppEntity[] = [
      { entityId: "user1@test.com", entityType: M365EntityType.User },
    ];
    mockAxios.axiosPostResponses["/builder/v1/users/titles/test-app-id/allowed?idType=AppId"] = {
      status: 200,
      data: {},
    };

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.shareWithUsers(
      "test-token",
      entities,
      "test-title-id",
      "test-app-id"
    );

    chai.assert.isTrue(result.isOk());
    chai.assert.deepEqual(
      mockAxios.data["/builder/v1/users/titles/test-app-id/allowed?idType=AppId"],
      {
        EntityCollection: {
          ForAllUsers: false,
          Entities: entities,
        },
      }
    );
  });

  it("shareWithUsers error", async () => {
    const entities: M365AppEntity[] = [
      { entityId: "user1@test.com", entityType: M365EntityType.User },
    ];
    const error = new Error("test-share-error");
    (error as any).response = {
      data: { error: { code: "test", message: "test message" } },
      headers: { traceresponse: "test-trace" },
    };
    mockAxios.axiosPostResponses["/builder/v1/users/titles/test-title-id/allowed?idType=TitleId"] =
      error;

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.shareWithUsers("test-token", entities, "test-title-id");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.include(result.error.message, "test-share-error");
      chai.assert.include(result.error.message, "test-trace");
    }
  });

  it("unshare success with titleId", async () => {
    mockAxios.axiosDeleteResponses[
      "/builder/v1/users/titles/test-title-id/allowed?idType=TitleId"
    ] = {
      status: 200,
      data: {},
    };

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.unshare("test-token", "test-title-id");

    chai.assert.isTrue(result.isOk());
  });

  it("unshare error", async () => {
    const error = new Error("test-unshare-error");
    (error as any).response = {
      data: { error: { code: "test", message: "test message" } },
      headers: { traceresponse: "test-trace" },
    };
    mockAxios.axiosDeleteResponses[
      "/builder/v1/users/titles/test-title-id/allowed?idType=TitleId"
    ] = error;

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.unshare("test-token", "test-title-id");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.include(result.error.message, "test-unshare-error");
      chai.assert.include(result.error.message, "test-trace");
    }
  });
});
