// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { UserError } from "@microsoft/teamsfx-api";
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import fs from "fs-extra";
import { chai, expect, vi } from "vitest";
import { setTools } from "../../../src/common/globalVars";
import * as commonUtils from "../../../src/common/utils";
import { AppUser } from "../../../src/component/driver/teamsApp/interfaces/appdefinitions/appUser";
import { advancedDASettingUrl } from "../../../src/component/m365/constants";
import { NotExtendedToM365Error } from "../../../src/component/m365/errors";
import { AppScope, PackageService } from "../../../src/component/m365/packageService";
import { UnhandledError } from "../../../src/error/common";
import { MockLogProvider } from "../../core/utils";

describe("Package Service", () => {
  const sandbox = vi;
  const logger = new MockLogProvider();
  let axiosDeleteResponses: Record<string, unknown> = {};
  let axiosGetResponses: Record<string, unknown> = {};
  let axiosPostResponses: Record<string, unknown> = {};
  let axiosPutResponses: Record<string, unknown> = {};
  const testAxiosInstance = {
    defaults: {
      headers: {
        common: {},
      },
    },
    interceptors: {
      request: {
        use: vi.fn(),
      },
      response: {
        use: vi.fn(),
      },
    },
    delete: function <T = any, R = AxiosResponse<T>>(
      url: string,
      config?: AxiosRequestConfig
    ): Promise<R> {
      const response = axiosDeleteResponses[url] as any;
      return response.message !== undefined ? Promise.reject(response) : Promise.resolve(response);
    },
    get: function <T = any, R = AxiosResponse<T>>(url: string): Promise<R> {
      const response = axiosGetResponses[url] as any;
      return response.message !== undefined ? Promise.reject(response) : Promise.resolve(response);
    },
    post: function <T = any, R = AxiosResponse<T>>(
      url: string,
      data?: any,
      config?: AxiosRequestConfig
    ): Promise<R> {
      const response = axiosPostResponses[url] as any;
      return response.message !== undefined ? Promise.reject(response) : Promise.resolve(response);
    },
    put: function <T = any, R = AxiosResponse<T>>(
      url: string,
      data?: any,
      config?: AxiosRequestConfig
    ): Promise<R> {
      const response = axiosPutResponses[url] as any;
      return response.message !== undefined ? Promise.reject(response) : Promise.resolve(response);
    },
  } as any as AxiosInstance;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    axiosDeleteResponses = {};
    axiosGetResponses = {};
    axiosPostResponses = {};
    axiosPutResponses = {};
    vi.spyOn(fs, "readFile").mockImplementation((file) => {
      return Promise.resolve(Buffer.from("test"));
    });
    vi.spyOn(fs, "statSync").mockReturnValue({ size: 1024 } as any);
    vi.spyOn(axios, "create").mockReturnValue(testAxiosInstance);
    vi.spyOn(commonUtils, "waitSeconds").mockResolvedValue();

    setTools({} as any);
    process.env["TEAMSFX_BUILDER_API"] = "1";
  });

  it("GetSharedInstance happy path", () => {
    let instance = PackageService.GetSharedInstance();
    chai.assert.isDefined(instance);
    instance = PackageService.GetSharedInstance();
    chai.assert.isDefined(instance);
  });

  it("sideLoadXmlManifest happy path with 200 return code", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosPostResponses["/dev/v1/users/packages/addins"] = {
      status: 200,
      data: {
        titleId: "test-title-id",
        appId: "test-app-id",
      },
    };

    const infoStub = vi.spyOn(logger, "info").mockReturnValue();
    const verboseStub = vi.spyOn(logger, "verbose").mockReturnValue();
    let packageService = new PackageService("https://test-endpoint", logger);
    let actualError: Error | undefined;
    try {
      const result = await packageService.sideLoadXmlManifest("test-token", "test-path");
      chai.assert.equal(result[0], "test-title-id");
      chai.assert.equal(result[1], "test-app-id");
      expect(infoStub).toHaveBeenCalledWith("TitleId: test-title-id");
      expect(infoStub).toHaveBeenCalledWith("AppId: test-app-id");
      expect(verboseStub).toHaveBeenCalledWith("Sideloading done.");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);

    // Test with logger undefined
    packageService = new PackageService("https://test-endpoint", undefined);
    actualError = undefined;
    try {
      const result = await packageService.sideLoadXmlManifest("test-token", "test-path");
      chai.assert.equal(result[0], "test-title-id");
      chai.assert.equal(result[1], "test-app-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);
  });

  it("sideLoadXmlManifest happy path with 202 return code", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosPostResponses["/dev/v1/users/packages/addins"] = {
      status: 202,
      data: {
        statusId: "test-status-id",
      },
    };

    axiosGetResponses["/dev/v1/users/packages/status/test-status-id"] = {
      status: 200,
      data: {
        titleId: "test-title-id",
        appId: "test-app-id",
      },
    };

    const infoStub = vi.spyOn(logger, "info").mockReturnValue();
    const verboseStub = vi.spyOn(logger, "verbose").mockReturnValue();
    const debugStub = vi.spyOn(logger, "debug").mockReturnValue();
    let packageService = new PackageService("https://test-endpoint", logger);
    let actualError: Error | undefined;
    try {
      const result = await packageService.sideLoadXmlManifest("test-token", "test-path");
      chai.assert.equal(result[0], "test-title-id");
      chai.assert.equal(result[1], "test-app-id");
      expect(debugStub).toHaveBeenCalledWith("Acquiring package with statusId: test-status-id ...");
      expect(debugStub).toHaveBeenCalledWith("Package status: 200 ...");
      expect(infoStub).toHaveBeenCalledWith("TitleId: test-title-id");
      expect(infoStub).toHaveBeenCalledWith("AppId: test-app-id");
      expect(verboseStub).toHaveBeenCalledWith("Sideloading done.");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);

    // Test with logger undefined
    packageService = new PackageService("https://test-endpoint", undefined);
    actualError = undefined;
    try {
      const result = await packageService.sideLoadXmlManifest("test-token", "test-path");
      chai.assert.equal(result[0], "test-title-id");
      chai.assert.equal(result[1], "test-app-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);
  });

  it("sideLoadXmlManifest happy path with xml api 200 return code, status api with 202 on first try and 200 on second try", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosPostResponses["/dev/v1/users/packages/addins"] = {
      status: 202,
      data: {
        statusId: "test-status-id",
      },
    };

    let statusCallCount = 0;
    vi.spyOn(testAxiosInstance, "get").mockImplementation((url: string): any => {
      if (url === "/dev/v1/users/packages/status/test-status-id") {
        statusCallCount++;
        if (statusCallCount === 1) {
          return Promise.resolve({ status: 202 });
        }
        return Promise.resolve({
          status: 200,
          data: {
            titleId: "test-title-id",
            appId: "test-app-id",
          },
        });
      }
      if (url === "/config/v1/environment") {
        return Promise.resolve({
          data: {
            titlesServiceUrl: "https://test-url",
          },
        });
      }
      return Promise.resolve({});
    });

    const infoStub = vi.spyOn(logger, "info").mockReturnValue();
    const verboseStub = vi.spyOn(logger, "verbose").mockReturnValue();
    const debugStub = vi.spyOn(logger, "debug").mockReturnValue();
    const packageService = new PackageService("https://test-endpoint", logger);
    let actualError: Error | undefined;
    try {
      const result = await packageService.sideLoadXmlManifest("test-token", "test-path");
      chai.assert.equal(result[0], "test-title-id");
      chai.assert.equal(result[1], "test-app-id");
      expect(debugStub).toHaveBeenCalledWith("Acquiring package with statusId: test-status-id ...");
      expect(debugStub).toHaveBeenCalledWith("Package status: 200 ...");
      expect(infoStub).toHaveBeenCalledWith("TitleId: test-title-id");
      expect(infoStub).toHaveBeenCalledWith("AppId: test-app-id");
      expect(verboseStub).toHaveBeenCalledWith("Sideloading done.");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);
  });

  it("sideLoadXmlManifest xml api with non 200/202 return code", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosPostResponses["/dev/v1/users/packages/addins"] = {
      status: 203,
      data: {
        statusId: "test-status-id",
      },
    };

    const infoStub = vi.spyOn(logger, "info").mockReturnValue();
    const verboseStub = vi.spyOn(logger, "verbose").mockReturnValue();
    const debugStub = vi.spyOn(logger, "debug").mockReturnValue();
    const errorStub = vi.spyOn(logger, "error").mockReturnValue();
    const packageService = new PackageService("https://test-endpoint", logger);
    let actualError: Error | undefined;
    try {
      const result = await packageService.sideLoadXmlManifest("test-token", "test-path");
      chai.assert.equal(result[0], "test-title-id");
      chai.assert.equal(result[1], "test-app-id");
    } catch (error: any) {
      actualError = error;
    }

    expect(debugStub).not.toHaveBeenCalledWith("Package status: 200 ...");
    expect(infoStub).not.toHaveBeenCalledWith("TitleId: test-title-id");
    expect(infoStub).not.toHaveBeenCalledWith("AppId: test-app-id");
    expect(verboseStub).not.toHaveBeenCalledWith("Sideloading done.");
    // expect(errorStub).toHaveBeenCalledWith("Sideloading failed.");

    chai.assert.isDefined(actualError);
  });

  it("sideLoadXmlManifest xml upload api throws error with response", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    const error: any = new Error("test-post");
    error.response = {
      data: {},
    };
    axiosPostResponses["/dev/v1/users/packages/addins"] = error;

    const errorStub = vi.spyOn(logger, "error").mockReturnValue();
    const packageService = new PackageService("https://test-endpoint", logger);
    let actualError: Error | undefined;
    try {
      await packageService.sideLoadXmlManifest("test-token", "test-path");
    } catch (error: any) {
      actualError = error;
    }
    // expect(errorStub).toHaveBeenCalledWith(`${JSON.stringify(error.response.data)}`);
    // expect(errorStub).toHaveBeenCalledWith(`Sideloading failed.`);
    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError?.message.includes("test-post"));
  });

  it("sideLoadXmlManifest xml upload api throws error without response", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    const error: Error = new Error("test-post");
    axiosPostResponses["/dev/v1/users/packages/addins"] = error;

    const errorStub = vi.spyOn(logger, "error").mockReturnValue();
    const packageService = new PackageService("https://test-endpoint", logger);
    let actualError: Error | undefined;
    try {
      await packageService.sideLoadXmlManifest("test-token", "test-path");
    } catch (error: any) {
      actualError = error;
    }
    // expect(errorStub).toHaveBeenCalledWith(`test-post`);
    chai.assert.isDefined(actualError);
    // chai.assert.isTrue(actualError?.message.includes("test-post"));
  });

  it("sideLoading happy path", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosPostResponses["/dev/v1/users/packages"] = {
      data: {
        operationId: "test-operation-id",
        titlePreview: {
          titleId: "test-title-id-preview",
        },
      },
    };
    axiosPostResponses["/builder/v1/users/packages"] = {
      data: {
        statusId: "test-status-id-builder-api",
        titlePreview: {
          titleId: "test-title-id-preview-builder-api",
        },
      },
    };
    axiosPostResponses["/dev/v1/users/packages/acquisitions"] = {
      data: {
        statusId: "test-status-id",
      },
    };
    axiosGetResponses["/dev/v1/users/packages/status/test-status-id"] = {
      status: 200,
      data: {
        titleId: "test-title-id",
        appId: "test-app-id",
      },
    };
    axiosGetResponses["/builder/v1/users/packages/status/test-status-id-builder-api"] = {
      status: 200,
      data: {
        titleId: "test-title-id-builder-api",
        appId: "test-app-id-builder-api",
      },
    };
    axiosGetResponses["/marketplace/v1/users/titles/test-title-id-builder-api/sharingInfo"] = {
      data: {
        unifiedStoreLink: "https://test-share-link",
      },
    };

    let packageService = new PackageService("https://test-endpoint");
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue(
      {} as any
    );
    let actualError: Error | undefined;
    try {
      const result = await packageService.sideLoading("test-token", "test-path");
      chai.assert.equal(result[0], "test-title-id");
      chai.assert.equal(result[1], "test-app-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);
    packageService = new PackageService("https://test-endpoint", logger);
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue({
      $schema:
        "https://developer.microsoft.com/json-schemas/teams/v1.19/MicrosoftTeams.schema.json",
      manifestVersion: "1.19",
      version: "1.0.0",
      id: "${{TEAMS_APP_ID}}",
      developer: {
        name: "Teams App, Inc.",
        websiteUrl: "https://www.example.com",
        privacyUrl: "https://www.example.com/privacy",
        termsOfUseUrl: "https://www.example.com/termofuse",
      },
      icons: {
        color: "color.png",
        outline: "outline.png",
      },
      name: {
        short: "test-manifest",
        full: "test-manifest full name",
      },
      description: {
        short: "Short description for test-manifest",
        full: "Full description for test-manifest",
      },
      accentColor: "#FFFFFF",
      composeExtensions: [],
      permissions: ["identity", "messageTeamMembers"],
    } as any);
    try {
      const result = await packageService.sideLoading("test-token", "test-path");
      chai.assert.equal(result[0], "test-title-id");
      chai.assert.equal(result[1], "test-app-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);

    packageService = new PackageService("https://test-endpoint", logger);
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue({
      copilotAgents: {
        declarativeAgents: [
          {
            id: "declarativeAgent",
            file: "declarativeAgent.json",
          },
        ],
      },
    } as any);
    try {
      const result = await packageService.sideLoading("test-token", "test-path", AppScope.Shared);
      chai.assert.equal(result[0], "test-title-id-builder-api");
      chai.assert.equal(result[1], "test-app-id-builder-api");
      chai.assert.equal(result[2], "https://test-share-link");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);

    // without logger
    packageService = new PackageService("https://test-endpoint");
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue({
      copilotAgents: {
        declarativeAgents: [
          {
            id: "declarativeAgent",
            file: "declarativeAgent.json",
          },
        ],
      },
    } as any);
    try {
      const result = await packageService.sideLoading("test-token", "test-path");
      chai.assert.equal(result[0], "test-title-id-builder-api");
      chai.assert.equal(result[1], "test-app-id-builder-api");
      chai.assert.equal(result[2], "");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);

    packageService = new PackageService("https://test-endpoint");
    try {
      const result = await packageService.sideLoading(
        "test-token",
        "./tests/component/m365/success.zip"
      );
      chai.assert.equal(result[0], "test-title-id");
      chai.assert.equal(result[1], "test-app-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);
  });

  it("sideload status api with 202 on first try and 200 on second try", async () => {
    axiosPostResponses["/dev/v1/users/packages"] = {
      data: {
        operationId: "test-operation-id",
        titlePreview: {
          titleId: "test-title-id-preview",
        },
      },
    };
    axiosPostResponses["/dev/v1/users/packages/acquisitions"] = {
      data: {
        statusId: "test-status-id",
      },
    };

    let statusCallCount = 0;
    vi.spyOn(testAxiosInstance, "get").mockImplementation((url: string): any => {
      if (url === "/dev/v1/users/packages/status/test-status-id") {
        statusCallCount++;
        if (statusCallCount === 1) {
          return Promise.resolve({ status: 202 });
        }
        return Promise.resolve({
          status: 200,
          data: {
            titleId: "test-title-id",
            appId: "test-app-id",
          },
        });
      }
      if (url === "/config/v1/environment") {
        return Promise.resolve({
          data: {
            titlesServiceUrl: "https://test-url",
          },
        });
      }
      return Promise.resolve({});
    });

    const packageService = new PackageService("https://test-endpoint", logger);
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue(
      {} as any
    );
    let actualError: Error | undefined;
    try {
      const result = await packageService.sideLoading("test-token", "test-path");
      chai.assert.equal(result[0], "test-title-id");
      chai.assert.equal(result[1], "test-app-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);
  });

  it("sideLoadingV2 returns immediately when shouldBlock response is 200", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosPostResponses["/builder/v1/users/packages"] = {
      status: 200,
      data: {
        titlePreview: {
          titleId: "test-title-id-blocked",
          appId: "test-app-id-blocked",
        },
      },
    };

    const packageService = new PackageService("https://test-endpoint", logger);
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue({
      copilotAgents: {
        declarativeAgents: [
          {
            id: "declarativeAgent",
            file: "declarativeAgent.json",
          },
        ],
      },
    } as any);
    const infoStub = vi.spyOn(logger, "info").mockReturnValue();
    const verboseStub = vi.spyOn(logger, "verbose").mockReturnValue();
    const result = await packageService.sideLoading("test-token", "test-path");
    chai.assert.equal(result[0], "test-title-id-blocked");
    chai.assert.equal(result[1], "test-app-id-blocked");
    expect(infoStub).toHaveBeenCalledWith("TitleId: test-title-id-blocked");
    expect(infoStub).toHaveBeenCalledWith("AppId: test-app-id-blocked");
    expect(verboseStub).toHaveBeenCalledWith("Sideloading done.");
  });

  it("sideLoadingV2 returns immediately when shouldBlock response is 201", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosPostResponses["/builder/v1/users/packages"] = {
      status: 201,
      data: {
        titlePreview: {
          titleId: "test-title-id-created",
          appId: "test-app-id-created",
        },
      },
    };

    const packageService = new PackageService("https://test-endpoint", logger);
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue({
      copilotAgents: {
        declarativeAgents: [
          {
            id: "declarativeAgent",
            file: "declarativeAgent.json",
          },
        ],
      },
    } as any);
    const result = await packageService.sideLoading("test-token", "test-path");
    chai.assert.equal(result[0], "test-title-id-created");
    chai.assert.equal(result[1], "test-app-id-created");
  });

  it("sideload builder status api with 202 on first try and 200 on second try", async () => {
    axiosPostResponses["/builder/v1/users/packages"] = {
      data: {
        statusId: "test-status-id-builder-api",
        titlePreview: {
          titleId: "test-title-id-preview-builder-api",
        },
      },
    };
    axiosPostResponses["/dev/v1/users/packages/acquisitions"] = {
      data: {
        statusId: "test-status-id",
      },
    };

    let statusCallCount = 0;
    vi.spyOn(testAxiosInstance, "get").mockImplementation((url: string): any => {
      if (url === "/builder/v1/users/packages/status/test-status-id-builder-api") {
        statusCallCount++;
        if (statusCallCount === 1) {
          return Promise.resolve({ status: 202 });
        }
        return Promise.resolve({
          status: 200,
          data: {
            titleId: "test-title-id-builder-api",
            appId: "test-app-id-builder-api",
          },
        });
      }
      if (url === "/config/v1/environment") {
        return Promise.resolve({
          data: {
            titlesServiceUrl: "https://test-url",
          },
        });
      }
      return Promise.resolve({});
    });

    const packageService = new PackageService("https://test-endpoint", logger);
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue({
      copilotAgents: {
        declarativeAgents: [
          {
            id: "declarativeAgent",
            file: "declarativeAgent.json",
          },
        ],
      },
    } as any);
    let actualError: Error | undefined;
    try {
      const result = await packageService.sideLoading("test-token", "test-path");
      chai.assert.equal(result[0], "test-title-id-builder-api");
      chai.assert.equal(result[1], "test-app-id-builder-api");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);
  });

  it("sideloading throws error in get status", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };

    axiosPostResponses["/builder/v1/users/packages"] = {
      data: {
        statusId: "test-status-id-builder-api",
        titlePreview: {
          titleId: "test-title-id-preview-builder-api",
        },
      },
    };
    let actualError: Error | undefined;
    const packageService = new PackageService("https://test-endpoint", logger);
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue({
      copilotAgents: {
        declarativeAgents: [
          {
            id: "declarativeAgent",
            file: "declarativeAgent.json",
          },
        ],
      },
    } as any);
    try {
      const result = await packageService.sideLoading("test-token", "test-path", AppScope.Shared);
    } catch (error: any) {
      actualError = error;
    }
    chai.assert.isDefined(actualError);

    const expectedError = new Error("test-status") as any;
    expectedError.response = {
      data: {
        foo: "bar",
      },
      headers: {
        traceresponse: "tracing-id",
      },
    };
    expectedError.code = "ERR_NO_SUFFICIENT_PERMISSION";
    axiosGetResponses["/builder/v1/users/packages/status/test-status-id-builder-api"] =
      expectedError;
    actualError = undefined;
    try {
      const result = await packageService.sideLoading("test-token", "test-path", AppScope.Shared);
    } catch (error: any) {
      actualError = error;
    }
    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError?.message.includes("test-status"));
  });
  it("sideLoading throws expected error", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosPostResponses["/dev/v1/users/packages"] = new Error("test-post");
    axiosPostResponses["/builder/v1/users/packages"] = new Error("test-post-builder-api");

    let packageService = new PackageService("https://test-endpoint");
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue(
      {} as any
    );
    let actualError: Error | undefined;
    try {
      await packageService.sideLoading("test-token", "test-path");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError?.message.includes("test-post"));

    packageService = new PackageService("https://test-endpoint", logger);
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue(
      {} as any
    );
    actualError = undefined;
    try {
      await packageService.sideLoading("test-token", "test-path");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError?.message.includes("test-post"));

    packageService = new PackageService("https://test-endpoint", logger);
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue({
      copilotAgents: {
        declarativeAgents: [
          {
            id: "declarativeAgent",
            file: "declarativeAgent.json",
          },
        ],
      },
    } as any);
    actualError = undefined;
    try {
      await packageService.sideLoading("test-token", "test-path");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError?.message.includes("test-post-builder-api"));

    packageService = new PackageService("https://test-endpoint", logger);
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue(
      undefined as any
    );
    actualError = undefined;
    try {
      await packageService.sideLoading("test-token", "test-path");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(
      actualError?.message.includes("Invalid app package zip. manifest.json is missing")
    );
  });

  it("sideLoading throws expected reponse error", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    const expectedError = new Error("test-post") as any;
    expectedError.response = {
      data: {
        foo: "bar",
      },
      headers: {
        traceresponse: "tracing-id",
      },
    };
    axiosPostResponses["/dev/v1/users/packages"] = expectedError;

    let packageService = new PackageService("https://test-endpoint");
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue(
      {} as any
    );
    let actualError: any;
    try {
      await packageService.sideLoading("test-token", "test-path");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError.message.includes("test-post"));

    packageService = new PackageService("https://test-endpoint", logger);
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue(
      {} as any
    );
    actualError = undefined;
    try {
      await packageService.sideLoading("test-token", "test-path");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError.message.includes("test-post"));
  });

  it("sideLoading badrequest as user error", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    const expectedError = new Error("test-post") as any;
    expectedError.response = {
      data: {
        foo: "bar",
      },
      headers: {
        traceresponse: "tracing-id",
      },
      status: 400,
    };
    axiosPostResponses["/dev/v1/users/packages"] = expectedError;

    const packageService = new PackageService("https://test-endpoint");
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue(
      {} as any
    );
    let actualError: any;
    try {
      await packageService.sideLoading("test-token", "test-path");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError.message.includes("test-post"));
    chai.assert.isTrue(actualError instanceof UserError);
  });

  it("sideLoading returns 403 error for advanced DA with shared scope", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    const expectedError = new Error("test-post") as any;
    expectedError.response = {
      data: {
        Error: {
          Message: "User does not have access to upload advanced Copilot apps.",
        },
      },
      headers: {
        traceresponse: "tracing-id",
      },
      status: 403,
    };
    axiosPostResponses["/dev/v1/users/packages"] = expectedError;

    const packageService = new PackageService("https://test-endpoint");
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue(
      {} as any
    );
    let actualError: any;
    try {
      await packageService.sideLoading("test-token", "test-path");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError.message.includes(advancedDASettingUrl));
    chai.assert.isTrue(actualError instanceof UserError);
  });

  it("retrieveTitleId happy path", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosPostResponses["/catalog/v1/users/titles/launchInfo"] = {
      data: {
        acquisition: {
          titleId: "test-title-id",
        },
      },
    };

    const packageService = new PackageService("https://test-endpoint");
    const titleId = await packageService.retrieveTitleId("test-token", "test-manifest-id");

    chai.assert.equal(titleId, "test-title-id");
  });

  it("retrieveTitleId throws expected error", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosPostResponses["/catalog/v1/users/titles/launchInfo"] = new Error("test-post");

    const packageService = new PackageService("https://test-endpoint");
    let actualError: Error | undefined;
    try {
      await packageService.retrieveTitleId("test-token", "test-manifest-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError?.message.includes("test-post"));
  });

  it("retrieveTitleId throws expected response error", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    const expectedError = new Error("test-post") as any;
    expectedError.response = {
      data: {},
    };
    axiosPostResponses["/catalog/v1/users/titles/launchInfo"] = expectedError;

    const packageService = new PackageService("https://test-endpoint");
    let actualError: any;
    try {
      await packageService.retrieveTitleId("test-token", "test-manifest-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError.message.includes("test-post"));
  });

  it("retrieveAppId happy path", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosPostResponses["/catalog/v1/users/titles/launchInfo"] = {
      data: {
        acquisition: {
          appId: "test-app-id",
        },
      },
    };

    {
      const packageService = new PackageService("https://test-endpoint");
      const appId = await packageService.retrieveAppId("test-token", "test-manifest-id");

      chai.assert.equal(appId, "test-app-id");
    }

    {
      const packageService = new PackageService("https://test-endpoint", new MockLogProvider());
      const appId = await packageService.retrieveAppId("test-token", "test-manifest-id");

      chai.assert.equal(appId, "test-app-id");
    }
  });

  it("retrieveAppId throws expected error", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosPostResponses["/catalog/v1/users/titles/launchInfo"] = new Error("test-post");

    {
      const packageService = new PackageService("https://test-endpoint");
      let actualError: Error | undefined;
      try {
        await packageService.retrieveAppId("test-token", "test-manifest-id");
      } catch (error: any) {
        actualError = error;
      }

      chai.assert.isDefined(actualError);
      chai.assert.isTrue(actualError?.message.includes("test-post"));
    }

    {
      const packageService = new PackageService("https://test-endpoint", new MockLogProvider());
      let actualError: Error | undefined;
      try {
        await packageService.retrieveAppId("test-token", "test-manifest-id");
      } catch (error: any) {
        actualError = error;
      }

      chai.assert.isDefined(actualError);
      chai.assert.isTrue(actualError?.message.includes("test-post"));
    }
  });

  it("retrieveAppId throws expected response error", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    const expectedError = new Error("test-post") as any;
    expectedError.response = {
      data: {},
    };
    axiosPostResponses["/catalog/v1/users/titles/launchInfo"] = expectedError;

    {
      const packageService = new PackageService("https://test-endpoint");
      let actualError: any;
      try {
        await packageService.retrieveAppId("test-token", "test-manifest-id");
      } catch (error: any) {
        actualError = error;
      }

      chai.assert.isDefined(actualError);
      chai.assert.isTrue(actualError.message.includes("test-post"));
    }

    {
      const packageService = new PackageService("https://test-endpoint", new MockLogProvider());
      let actualError: any;
      try {
        await packageService.retrieveAppId("test-token", "test-manifest-id");
      } catch (error: any) {
        actualError = error;
      }

      chai.assert.isDefined(actualError);
      chai.assert.isTrue(actualError instanceof UnhandledError);
    }
  });

  it("unacquire happy path", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosDeleteResponses["/catalog/v1/users/acquisitions/test-title-id"] = {};
    axiosDeleteResponses["/builder/v1/users/titles/test-title-id"] = {};

    let packageService = new PackageService("https://test-endpoint");
    let actualError: Error | undefined;
    try {
      await packageService.unacquire("test-token", "test-title-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);

    packageService = new PackageService("https://test-endpoint", logger);
    actualError = undefined;
    try {
      await packageService.unacquire("test-token", "test-title-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);
  });

  it("unacquire happy path for personal scope DA", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosDeleteResponses["/catalog/v1/users/acquisitions/test-title-id"] = {};
    axiosDeleteResponses["/builder/v1/users/titles/test-title-id"] = {
      response: {
        status: 404,
      },
      message: "test-delete-error",
    };

    let packageService = new PackageService("https://test-endpoint");
    let actualError: Error | undefined;
    try {
      await packageService.unacquire("test-token", "test-title-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);

    packageService = new PackageService("https://test-endpoint", logger);
    actualError = undefined;
    try {
      await packageService.unacquire("test-token", "test-title-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);
  });

  it("unacquire throws error for shared scope DA", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosDeleteResponses["/catalog/v1/users/acquisitions/test-title-id"] = {};
    axiosDeleteResponses["/builder/v1/users/titles/test-title-id"] = {
      response: {
        status: 401,
      },
      message: "test-delete-error",
    };

    const packageService = new PackageService("https://test-endpoint");
    let actualError: Error | undefined;
    try {
      await packageService.unacquire("test-token", "test-title-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
  });

  it("unacquire throws expected error", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosDeleteResponses["/catalog/v1/users/acquisitions/test-title-id"] = new Error("test-delete");

    let packageService = new PackageService("https://test-endpoint");
    let actualError: Error | undefined;
    try {
      await packageService.unacquire("test-token", "test-title-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError?.message.includes("test-delete"));

    packageService = new PackageService("https://test-endpoint", logger);
    actualError = undefined;
    try {
      await packageService.unacquire("test-token", "test-title-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError?.message.includes("test-delete"));
  });

  it("unacquire throws expected response error", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    const expectedError = new Error("test-post") as any;
    expectedError.response = {
      data: {},
    };
    axiosDeleteResponses["/catalog/v1/users/acquisitions/test-title-id"] = expectedError;

    const packageService = new PackageService("https://test-endpoint");
    let actualError: any;
    try {
      await packageService.unacquire("test-token", "test-title-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError instanceof UnhandledError);
  });

  it("getLaunchInfoByTitleId happy path", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosGetResponses["/catalog/v1/users/titles/test-title-id/launchInfo"] = {
      data: {
        foo: "bar",
      },
    };

    const packageService = new PackageService("https://test-endpoint");
    const launchInfo = await packageService.getLaunchInfoByTitleId("test-token", "test-title-id");

    chai.assert.deepEqual(launchInfo, { foo: "bar" });
  });
  it("getLaunchInfoByManifestId throws expected error", async () => {
    const packageService = new PackageService("https://test-endpoint");
    vi.spyOn(testAxiosInstance, "post").mockRejectedValue({ response: { status: 404 } });
    vi.spyOn(packageService, "getTitleServiceUrl").mockResolvedValue("https://test-url");
    try {
      await packageService.getLaunchInfoByManifestId("test-token", "test-manifest-id");
      chai.assert.fail("should not reach here");
    } catch (e) {
      chai.assert.isTrue(e instanceof NotExtendedToM365Error);
    }
  });
  it("getLaunchInfoByTitleId throws expected error", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosGetResponses["/catalog/v1/users/titles/test-title-id/launchInfo"] = new Error("test-get");

    const packageService = new PackageService("https://test-endpoint");
    let actualError: Error | undefined;
    try {
      await packageService.getLaunchInfoByTitleId("test-token", "test-title-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError?.message.includes("test-get"));
  });

  it("getLaunchInfoByTitleId throws expected response error", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    const expectedError = new Error("test-post") as any;
    expectedError.response = {
      data: {},
    };
    axiosGetResponses["/catalog/v1/users/titles/test-title-id/launchInfo"] = expectedError;

    const packageService = new PackageService("https://test-endpoint");
    let actualError: any;
    try {
      await packageService.getLaunchInfoByTitleId("test-token", "test-title-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError instanceof UnhandledError);
  });

  it("getTitleServiceUrl throws expected error", async () => {
    axiosGetResponses["/config/v1/environment"] = new Error("test-service-url-error");

    const packageService = new PackageService("https://test-endpoint");
    let actualError: Error | undefined;
    try {
      await packageService.getLaunchInfoByTitleId("test-token", "test-title-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError?.message.includes("test-service-url-error"));
  });

  it("getTitleServiceUrl throws invalid url error", async () => {
    let packageService = new PackageService("{{test-endpoint}}");
    let actualError: Error | undefined;
    try {
      await packageService.getLaunchInfoByTitleId("test-token", "test-title-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError?.message.includes("Invalid URL"));

    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "{{test-url}}",
      },
    };

    packageService = new PackageService("https://test-endpoint");
    actualError = undefined;
    try {
      await packageService.getLaunchInfoByTitleId("test-token", "test-title-id");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
  });

  it("getActiveExperiences happy path", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosGetResponses["/catalog/v1/users/uitypes"] = {
      data: {
        activeExperiences: ["foo", "bar"],
      },
    };

    let packageService = new PackageService("https://test-endpoint");
    let actualError: Error | undefined;
    let result: string[] | undefined;
    try {
      result = await packageService.getActiveExperiences("test-token");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);
    chai.assert.deepEqual(result, ["foo", "bar"]);

    packageService = new PackageService("https://test-endpoint", logger);
    actualError = undefined;
    try {
      result = await packageService.getActiveExperiences("test-token");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);
    chai.assert.deepEqual(result, ["foo", "bar"]);
  });

  it("getActiveExperiences stale", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosGetResponses["/catalog/v1/users/uitypes"] = {
      data: {
        activeExperiences: ["foo", "bar"],
        nextInterval: 1,
      },
    };

    let packageService = new PackageService("https://test-endpoint");
    let actualError: Error | undefined;
    let result: string[] | undefined;
    try {
      result = await packageService.getActiveExperiences("test-token", true);
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);
    chai.assert.deepEqual(result, ["foo", "bar"]);

    const debugStub = vi.spyOn(logger, "debug").mockReturnValue();

    packageService = new PackageService("https://test-endpoint", logger);
    try {
      result = await packageService.getActiveExperiences("test-token", true);
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);
    chai.assert.deepEqual(result, ["foo", "bar"]);
    chai.assert.equal(5, debugStub.mock.calls.length);
  });

  it("getActiveExperiences throws expected error", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosGetResponses["/catalog/v1/users/uitypes"] = new Error("test-get");

    const packageService = new PackageService("https://test-endpoint");
    let actualError: Error | undefined;
    try {
      await packageService.getActiveExperiences("test-token");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError?.message.includes("test-get"));
  });

  it("getActiveExperiences throws expected response error", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    const expectedError = new Error("test-get") as any;
    expectedError.response = {
      data: {},
    };
    axiosGetResponses["/catalog/v1/users/uitypes"] = expectedError;

    let packageService = new PackageService("https://test-endpoint");
    let actualError: Error | undefined;
    try {
      await packageService.getActiveExperiences("test-token");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError instanceof UnhandledError);

    packageService = new PackageService("https://test-endpoint", logger);
    actualError = undefined;
    try {
      await packageService.getActiveExperiences("test-token");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError instanceof UnhandledError);
  });

  it("getCopilotStatus happy path", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosGetResponses["/catalog/v1/users/uitypes"] = {
      data: {
        activeExperiences: ["foo", "bar"],
      },
    };

    const packageService = new PackageService("https://test-endpoint");
    let actualError: Error | undefined;
    let result: boolean | undefined;
    try {
      result = await packageService.getCopilotStatus("test-token");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);
    chai.assert.isFalse(result);
  });

  it("getCopilotStatus bad response", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosGetResponses["/catalog/v1/users/uitypes"] = {
      foo: "bar",
    };

    const packageService = new PackageService("https://test-endpoint");
    let actualError: Error | undefined;
    let result: boolean | undefined;
    try {
      result = await packageService.getCopilotStatus("test-token");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);
    chai.assert.isUndefined(result);
  });

  it("getCopilotStatus returns undefined on error", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosGetResponses["/catalog/v1/users/uitypes"] = new Error("test-get");

    let packageService = new PackageService("https://test-endpoint");
    let actualError: Error | undefined;
    let result: boolean | undefined;
    try {
      result = await packageService.getCopilotStatus("test-token");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);
    chai.assert.isUndefined(result);

    packageService = new PackageService("https://test-endpoint", logger);
    actualError = undefined;
    try {
      result = await packageService.getCopilotStatus("test-token");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);
    chai.assert.isUndefined(result);
  });

  it("getCopilotStatus returns undefined on error with trace", async () => {
    const packageService = new PackageService("https://test-endpoint");
    (packageService as any).getActiveExperiences = async (_: string) => {
      const error = new Error();
      (error as any).response = {
        headers: {
          traceresponse: "test-trace",
        },
      };
      throw error;
    };
    let actualError: Error | undefined;
    let result: boolean | undefined;
    try {
      result = await packageService.getCopilotStatus("test-token");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isUndefined(actualError);
    chai.assert.isUndefined(result);
  });

  it("get share link happy path", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosGetResponses["/marketplace/v1/users/titles/test-title-id/sharingInfo"] = {
      data: {
        unifiedStoreLink: "https://test-share-link",
      },
    };
    const packageService = new PackageService("https://test-endpoint");
    const shareLink = await packageService.getShareLink("test-token", "test-title-id");
    chai.assert.equal(shareLink, "https://test-share-link");
  });

  it("get share link - failure", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    const packageService = new PackageService("https://test-endpoint");
    let actualError: boolean | undefined;
    try {
      const shareLink = await packageService.getShareLink("test-token", "test-title-id");
    } catch (error: any) {
      actualError = error;
    }
    chai.assert.isDefined(actualError);
  });

  it("previewApp happy path", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosGetResponses["/marketplace/v1/users/titles/test-title-id/preview?idType=TitleId"] = {
      data: {
        owners: [
          {
            entityId: "test-entity-id",
            entityType: "User",
          },
        ],
      },
    };

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.previewApp("test-token", "test-title-id");

    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value.owners[0].entityId, "test-entity-id");
      chai.assert.deepEqual(result.value.owners[0].entityType, "User");
    }
  });

  it("previewApp error response", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    const error = new Error("test-error") as any;
    error.response = {
      data: { error: { code: "test", message: "test message" } },
      headers: { traceresponse: "test-trace" },
    };
    axiosGetResponses["/marketplace/v1/users/titles/test-title-id/preview?idType=TitleId"] = error;

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.previewApp("test-token", "test-title-id");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.include(result.error.message, "test-error");
      chai.assert.include(result.error.message, "test-trace");
    }
  });

  it("grantPermission to new user", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosGetResponses["/marketplace/v1/users/titles/test-title-id/preview?idType=TitleId"] = {
      data: {
        owners: [
          {
            entityId: "existing-user",
            entityType: "User",
          },
        ],
      },
    };
    axiosPutResponses["/builder/v1/users/titles/test-title-id/owners?idType=TitleId"] = {
      status: 200,
    };

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.addOwner("test-token", "test-title-id", {
      aadId: "new-user",
      displayName: "New User",
      userPrincipalName: "newuser@test.com",
    } as AppUser);

    chai.assert.isTrue(result.isOk());
  });

  it("grantPermission error response", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosGetResponses["/marketplace/v1/users/titles/test-title-id/preview?idType=TitleId"] = {
      data: {
        owners: [
          {
            entityId: "existing-user",
            entityType: "User",
          },
        ],
      },
    };
    const error = new Error("test-put-error") as any;
    error.response = {
      data: { error: { code: "test", message: "test message" } },
      headers: { traceresponse: "test-trace" },
    };
    axiosPutResponses["/builder/v1/users/titles/test-title-id/owners?idType=TitleId"] = error;

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.addOwner("test-token", "test-title-id", {
      aadId: "new-user",
      displayName: "New User",
      userPrincipalName: "newuser@test.com",
    } as AppUser);

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.include(result.error.message, "test-put-error");
      chai.assert.include(result.error.message, "test-trace");
    }
  });

  it("grantPermission to existing user", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosGetResponses["/marketplace/v1/users/titles/test-title-id/preview?idType=TitleId"] = {
      data: {
        owners: [
          {
            entityId: "existing-user",
            entityType: "User",
          },
        ],
      },
    };
    // Don't need to mock put response since it won't be called for existing user

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.addOwner("test-token", "test-title-id", {
      aadId: "existing-user",
      displayName: "Existing User",
      userPrincipalName: "existinguser@test.com",
    } as AppUser);

    chai.assert.isTrue(result.isOk());
  });

  it("grantPermission error in previewApp", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    const error = new Error("preview-error") as any;
    error.response = {
      data: { error: { code: "test", message: "test message" } },
      headers: { traceresponse: "test-trace" },
    };
    axiosGetResponses["/marketplace/v1/users/titles/test-title-id/preview?idType=TitleId"] = error;

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.addOwner("test-token", "test-title-id", {
      aadId: "new-user",
      displayName: "New User",
      userPrincipalName: "newuser@test.com",
    } as AppUser);

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.include(result.error.message, "preview-error");
    }
  });

  it("removePermission of existing user", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosGetResponses["/marketplace/v1/users/titles/test-title-id/preview?idType=TitleId"] = {
      data: {
        owners: [
          {
            entityId: "existing-user",
            entityType: "User",
          },
          {
            entityId: "other-user",
            entityType: "User",
          },
        ],
      },
    };

    axiosPutResponses["/builder/v1/users/titles/test-title-id/owners?idType=TitleId"] = {
      status: 200,
    };

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.removePermission("test-token", "test-title-id", {
      aadId: "existing-user",
      displayName: "Existing User",
      userPrincipalName: "existinguser@test.com",
    } as AppUser);

    chai.assert.isTrue(result.isOk());
  });

  it("removePermission of non-existing user", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosGetResponses["/marketplace/v1/users/titles/test-title-id/preview?idType=TitleId"] = {
      data: {
        owners: [
          {
            entityId: "other-user",
            entityType: "User",
          },
        ],
      },
    };

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.removePermission("test-token", "test-title-id", {
      aadId: "non-existing-user",
      displayName: "Non-existing User",
      userPrincipalName: "nonexistinguser@test.com",
    } as AppUser);

    chai.assert.isTrue(result.isOk());
  });

  it("removePermission error in previewApp", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    const error = new Error("preview-error") as any;
    error.response = {
      data: { error: { code: "test", message: "test message" } },
      headers: { traceresponse: "test-trace" },
    };
    axiosGetResponses["/marketplace/v1/users/titles/test-title-id/preview?idType=TitleId"] = error;

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.removePermission("test-token", "test-title-id", {
      aadId: "existing-user",
      displayName: "Existing User",
      userPrincipalName: "existinguser@test.com",
    } as AppUser);

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.include(result.error.message, "preview-error");
    }
  });

  it("removePermission with empty owners list", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosGetResponses["/marketplace/v1/users/titles/test-title-id/preview?idType=TitleId"] = {
      data: {
        owners: [],
      },
    };

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.removePermission("test-token", "test-title-id", {
      aadId: "existing-user",
      displayName: "Existing User",
      userPrincipalName: "existinguser@test.com",
    } as AppUser);

    chai.assert.isTrue(result.isOk());
  });

  it("withNetworkRetry retries on TLS/network error and succeeds", async () => {
    let callCount = 0;
    vi.spyOn(testAxiosInstance, "get").mockImplementation((url: string) => {
      callCount++;
      if (url === "/config/v1/environment") {
        if (callCount <= 2) {
          const err: any = new Error("TLS handshake failed");
          err.code = "ERR_TLS_CERT_ALTNAME_INVALID";
          return Promise.reject(err);
        }
        return Promise.resolve({
          data: { titlesServiceUrl: "https://test-url" },
        });
      }
      return Promise.reject(new Error("unexpected url"));
    });

    const warningStub = vi.spyOn(logger, "warning").mockReturnValue();
    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.getTitleServiceUrl("test-token");
    chai.assert.equal(result, "https://test-url");
    chai.assert.equal(callCount, 3);
    chai.assert.isTrue(warningStub.mock.calls.length === 2);
    chai.assert.isTrue(warningStub.mock.calls[0][0].includes("ERR_TLS_CERT_ALTNAME_INVALID"));
    chai.assert.isTrue(warningStub.mock.calls[0][0].includes("retrying (1/3)"));
    chai.assert.isTrue(warningStub.mock.calls[1][0].includes("retrying (2/3)"));
  });

  it("withNetworkRetry throws after max retries on network error", async () => {
    vi.spyOn(testAxiosInstance, "get").mockImplementation(() => {
      const err: any = new Error("ECONNRESET");
      err.code = "ECONNRESET";
      return Promise.reject(err);
    });

    const warningStub = vi.spyOn(logger, "warning").mockReturnValue();
    const packageService = new PackageService("https://test-endpoint", logger);
    let actualError: Error | undefined;
    try {
      await packageService.getTitleServiceUrl("test-token");
    } catch (error: any) {
      actualError = error;
    }
    chai.assert.isDefined(actualError);
    chai.assert.isTrue(actualError?.message.includes("ECONNRESET"));
    // Should have warned twice (retries 1 and 2), then thrown on 3rd
    chai.assert.isTrue(warningStub.mock.calls.length === 2);
  });

  it("withNetworkRetry does not retry on HTTP errors (has response)", async () => {
    let callCount = 0;
    vi.spyOn(testAxiosInstance, "get").mockImplementation(() => {
      callCount++;
      const err: any = new Error("Forbidden");
      err.response = { status: 403, data: {} };
      return Promise.reject(err);
    });

    const warningStub = vi.spyOn(logger, "warning").mockReturnValue();
    const packageService = new PackageService("https://test-endpoint", logger);
    let actualError: any;
    try {
      await packageService.getTitleServiceUrl("test-token");
    } catch (error: any) {
      actualError = error;
    }
    chai.assert.isDefined(actualError);
    chai.assert.equal(callCount, 1, "Should not retry on HTTP errors");
    chai.assert.isTrue(warningStub.mock.calls.length === 0);
  });

  it("withNetworkRetry works for sideLoadingV2 upload", async () => {
    let postCallCount = 0;
    vi.spyOn(testAxiosInstance, "get").mockImplementation(() => {
      return Promise.resolve({
        data: { titlesServiceUrl: "https://test-url" },
      });
    });
    vi.spyOn(testAxiosInstance, "post").mockImplementation((url: string) => {
      if (url === "/builder/v1/users/packages") {
        postCallCount++;
        if (postCallCount <= 1) {
          const err: any = new Error("socket hang up");
          err.code = "ECONNRESET";
          return Promise.reject(err);
        }
        return Promise.resolve({
          status: 200,
          data: {
            titlePreview: {
              titleId: "retry-title-id",
              appId: "retry-app-id",
            },
          },
        });
      }
      return Promise.reject(new Error("unexpected url"));
    });

    const warningStub = vi.spyOn(logger, "warning").mockReturnValue();
    const packageService = new PackageService("https://test-endpoint", logger);
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue({
      copilotAgents: {
        declarativeAgents: [{ id: "declarativeAgent", file: "declarativeAgent.json" }],
      },
    } as any);
    const result = await packageService.sideLoading("test-token", "test-path");
    chai.assert.equal(result[0], "retry-title-id");
    chai.assert.equal(result[1], "retry-app-id");
    chai.assert.equal(postCallCount, 2);
    chai.assert.isTrue(
      warningStub.mock.calls.some(
        (c) =>
          typeof c[0] === "string" && c[0].includes("ECONNRESET") && c[0].includes("retrying (1/3)")
      )
    );
  });

  it("withNetworkRetry works for sideLoadingV1 upload", async () => {
    let postCallCount = 0;
    vi.spyOn(testAxiosInstance, "get").mockImplementation((url: string) => {
      if (url === "/config/v1/environment") {
        return Promise.resolve({
          data: { titlesServiceUrl: "https://test-url" },
        });
      }
      if (url === "/dev/v1/users/packages/status/test-status-id") {
        return Promise.resolve({
          status: 200,
          data: {
            titleId: "retry-v1-title-id",
            appId: "retry-v1-app-id",
          },
        });
      }
      return Promise.reject(new Error("unexpected get url"));
    });
    vi.spyOn(testAxiosInstance, "post").mockImplementation((url: string) => {
      if (url === "/dev/v1/users/packages") {
        postCallCount++;
        if (postCallCount <= 1) {
          const err: any = new Error("TLS connection reset");
          err.code = "ECONNRESET";
          return Promise.reject(err);
        }
        return Promise.resolve({
          data: { operationId: "test-operation-id" },
        });
      }
      if (url === "/dev/v1/users/packages/acquisitions") {
        return Promise.resolve({
          data: { statusId: "test-status-id" },
        });
      }
      return Promise.reject(new Error("unexpected url"));
    });

    const warningStub = vi.spyOn(logger, "warning").mockReturnValue();
    const packageService = new PackageService("https://test-endpoint", logger);
    vi.spyOn(packageService, "getManifestFromZip" as keyof PackageService).mockReturnValue(
      {} as any
    );
    const result = await packageService.sideLoading("test-token", "test-path");
    chai.assert.equal(result[0], "retry-v1-title-id");
    chai.assert.equal(result[1], "retry-v1-app-id");
    chai.assert.equal(postCallCount, 2);
    chai.assert.isTrue(
      warningStub.mock.calls.some(
        (c) =>
          typeof c[0] === "string" && c[0].includes("ECONNRESET") && c[0].includes("retrying (1/3)")
      )
    );
  });

  it("withNetworkRetry works without logger", async () => {
    let callCount = 0;
    vi.spyOn(testAxiosInstance, "get").mockImplementation((url: string) => {
      callCount++;
      if (url === "/config/v1/environment") {
        if (callCount <= 1) {
          return Promise.reject(new Error("TLS error"));
        }
        return Promise.resolve({
          data: { titlesServiceUrl: "https://test-url" },
        });
      }
      return Promise.reject(new Error("unexpected url"));
    });

    const packageService = new PackageService("https://test-endpoint");
    const result = await packageService.getTitleServiceUrl("test-token");
    chai.assert.equal(result, "https://test-url");
    chai.assert.equal(callCount, 2);
  });

  it("sideLoading should throw when package exceeds 10 MB", async () => {
    vi.spyOn(fs, "statSync").mockReturnValue({ size: 15 * 1024 * 1024 } as any);

    const packageService = new PackageService("https://test-endpoint", logger);
    let actualError: Error | undefined;
    try {
      await packageService.sideLoading("test-token", "test-path");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.instanceOf(actualError, UserError);
    chai.assert.equal((actualError as UserError).name, "AppPackageSizeExceeded");
  });

  it("sideLoadXmlManifest should throw when package exceeds 10 MB", async () => {
    vi.spyOn(fs, "statSync").mockReturnValue({ size: 15 * 1024 * 1024 } as any);

    const packageService = new PackageService("https://test-endpoint", logger);
    let actualError: Error | undefined;
    try {
      await packageService.sideLoadXmlManifest("test-token", "test-path");
    } catch (error: any) {
      actualError = error;
    }

    chai.assert.isDefined(actualError);
    chai.assert.instanceOf(actualError, UserError);
    chai.assert.equal((actualError as UserError).name, "AppPackageSizeExceeded");
  });

  it("publishAgent happy path with Personal scope", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosPostResponses["/builder/v1/users/packages"] = {
      status: 201,
      data: {
        titlePreview: {
          titleId: "test-title-id",
          appId: "test-app-id",
        },
      },
    };

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.publishAgent("test-token", "test-path", AppScope.Personal);
    chai.assert.equal(result[0], "test-title-id");
    chai.assert.equal(result[1], "test-app-id");
    chai.assert.equal(result[2], "");
  });

  it("publishAgent with Shared scope should get shareLink", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosPostResponses["/builder/v1/users/packages"] = {
      status: 201,
      data: {
        titlePreview: {
          titleId: "test-title-id",
          appId: "test-app-id",
        },
      },
    };
    axiosGetResponses["/marketplace/v1/users/titles/test-title-id/sharingInfo"] = {
      status: 200,
      data: {
        unifiedStoreLink: "https://test-share-link.com",
      },
    };

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.publishAgent("test-token", "test-path", AppScope.Shared);
    chai.assert.equal(result[0], "test-title-id");
    chai.assert.equal(result[1], "test-app-id");
    chai.assert.equal(result[2], "https://test-share-link.com");
  });

  it("publishAgent with Tenant scope should not get shareLink", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosPostResponses["/builder/v1/users/packages"] = {
      status: 201,
      data: {
        titlePreview: {
          titleId: "test-title-id",
          appId: "test-app-id",
        },
      },
    };

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.publishAgent("test-token", "test-path", AppScope.Tenant);
    chai.assert.equal(result[0], "test-title-id");
    chai.assert.equal(result[1], "test-app-id");
    chai.assert.equal(result[2], "");
  });

  it("publishAgent defaults to Personal scope", async () => {
    axiosGetResponses["/config/v1/environment"] = {
      data: {
        titlesServiceUrl: "https://test-url",
      },
    };
    axiosPostResponses["/builder/v1/users/packages"] = {
      status: 201,
      data: {
        titlePreview: {
          titleId: "test-title-id",
          appId: "test-app-id",
        },
      },
    };

    const packageService = new PackageService("https://test-endpoint", logger);
    const result = await packageService.publishAgent("test-token", "test-path");
    chai.assert.equal(result[0], "test-title-id");
    chai.assert.equal(result[1], "test-app-id");
    chai.assert.equal(result[2], "");
  });
});
