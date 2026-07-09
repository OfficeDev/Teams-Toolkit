// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { M365TokenProvider, ok, Platform } from "@microsoft/teamsfx-api";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import faker from "faker";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { chai, vi } from "vitest";

import * as Tools from "../../../../../src/common/tools";
import { SPFxDeployDriver } from "../../../../../src/component/driver/deploy/spfx/deployDriver";
import { CreateAppCatalogFailedError } from "../../../../../src/component/driver/deploy/spfx/error/createAppCatalogFailedError";
import { GetGraphTokenFailedError } from "../../../../../src/component/driver/deploy/spfx/error/getGraphTokenFailedError";
import { GetSPOTokenFailedError } from "../../../../../src/component/driver/deploy/spfx/error/getSPOTokenFailedError";
import { GetTenantFailedError } from "../../../../../src/component/driver/deploy/spfx/error/getTenantFailedError";
import { InsufficientPermissionError } from "../../../../../src/component/driver/deploy/spfx/error/insufficientPermissionError";
import { NoSPPackageError } from "../../../../../src/component/driver/deploy/spfx/error/noSPPackageError";
import { NoValidAppCatelog } from "../../../../../src/component/driver/deploy/spfx/error/noValidAppCatelogError";
import { UploadAppPackageFailedError } from "../../../../../src/component/driver/deploy/spfx/error/uploadAppPackageFailedError";
import { DeploySPFxArgs } from "../../../../../src/component/driver/deploy/spfx/interface/deployArgs";
import { Constants } from "../../../../../src/component/driver/deploy/spfx/utility/constants";
import { SPOClient } from "../../../../../src/component/driver/deploy/spfx/utility/spoClient";
import { FileNotFoundError } from "../../../../../src/error/common";
import { MockedM365Provider } from "../../../../core/utils";
import { MockedLogProvider, MockedUserInteraction } from "../../../../plugins/solution/util";

const expect = chai.expect;

async function assertRejected(promise: Promise<any>, errorType: any): Promise<void> {
  let error: any;
  try {
    await promise;
  } catch (e) {
    error = e;
  }
  chai.assert.isDefined(error, "Expected promise to be rejected");
  chai.assert.instanceOf(error, errorType);
}

describe("SPFx Deploy Driver", async () => {
  const tempDir = path.join(os.tmpdir(), "fx-core-spfx-deploy-tests");
  const originalRefresh = Constants.APP_CATALOG_REFRESH_TIME;
  const originalActive = Constants.APP_CATALOG_ACTIVE_TIME;

  const args: DeploySPFxArgs = {
    createAppCatalogIfNotExist: true,
    packageSolutionPath: "./SPFx/config/package-solution.json",
  };
  const deployDriver = new SPFxDeployDriver();
  const mockedDriverContext: any = {
    logProvider: new MockedLogProvider(),
    ui: new MockedUserInteraction(),
    m365TokenProvider: new MockedM365Provider(),
    platform: Platform.VSCode,
    projectPath: "C://TeamsApp",
  };

  const createPackageFile = async (): Promise<string> => {
    await fs.ensureDir(tempDir);
    const packagePath = path.join(tempDir, `${faker.datatype.uuid()}.sppkg`);
    await fs.writeFile(packagePath, Buffer.from("content"));
    return packagePath;
  };

  afterEach(async () => {
    vi.restoreAllMocks();
    Constants.APP_CATALOG_REFRESH_TIME = originalRefresh;
    Constants.APP_CATALOG_ACTIVE_TIME = originalActive;
    await fs.remove(tempDir);
  });

  it("should successfully deploy if app catelog exists - VSCode", async () => {
    const packagePath = await createPackageFile();

    vi.spyOn(SPFxDeployDriver.prototype, "getTenant").mockResolvedValue("fakeTenant");
    vi.spyOn(SPFxDeployDriver.prototype, "getPackagePath").mockResolvedValue(packagePath);
    vi.spyOn(SPFxDeployDriver.prototype, "getAppID").mockResolvedValue("fakeAppID");

    vi.spyOn(Tools, "getSPFxToken").mockResolvedValue("fakeSPFxToken");
    vi.spyOn(SPOClient, "getAppCatalogSite").mockResolvedValue("fakeAppCatelogSite");
    vi.spyOn(SPOClient, "uploadAppPackage").mockResolvedValue(undefined as any);
    vi.spyOn(SPOClient, "deployAppPackage").mockResolvedValue(undefined as any);

    const result = await deployDriver.run(args, mockedDriverContext);
    expect(result.isOk()).to.be.true;
  });

  it("should successfully deploy if app catelog exists - VSCode - execute", async () => {
    const packagePath = await createPackageFile();

    vi.spyOn(SPFxDeployDriver.prototype, "getTenant").mockResolvedValue("fakeTenant");
    vi.spyOn(SPFxDeployDriver.prototype, "getPackagePath").mockResolvedValue(packagePath);
    vi.spyOn(SPFxDeployDriver.prototype, "getAppID").mockResolvedValue("fakeAppID");

    vi.spyOn(Tools, "getSPFxToken").mockResolvedValue("fakeSPFxToken");
    vi.spyOn(SPOClient, "getAppCatalogSite").mockResolvedValue("fakeAppCatelogSite");
    vi.spyOn(SPOClient, "uploadAppPackage").mockResolvedValue(undefined as any);
    vi.spyOn(SPOClient, "deployAppPackage").mockResolvedValue(undefined as any);

    const result = await deployDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
    expect(result.summaries.length).to.eq(3);
  });

  it("should successfully deploy if app catelog exists - CLI", async () => {
    const packagePath = await createPackageFile();

    vi.spyOn(SPFxDeployDriver.prototype, "getTenant").mockResolvedValue("fakeTenant");
    vi.spyOn(SPFxDeployDriver.prototype, "getPackagePath").mockResolvedValue(packagePath);
    vi.spyOn(SPFxDeployDriver.prototype, "getAppID").mockResolvedValue("fakeAppID");

    vi.spyOn(Tools, "getSPFxToken").mockResolvedValue("fakeSPFxToken");
    vi.spyOn(SPOClient, "getAppCatalogSite").mockResolvedValue("fakeAppCatelogSite");
    vi.spyOn(SPOClient, "uploadAppPackage").mockResolvedValue(undefined as any);
    vi.spyOn(SPOClient, "deployAppPackage").mockResolvedValue(undefined as any);

    const result = await deployDriver.run(args, {
      logProvider: new MockedLogProvider(),
      m365TokenProvider: new MockedM365Provider(),
      platform: Platform.CLI,
      projectPath: "C://TeamsApp",
    } as any);
    expect(result.isOk()).to.be.true;
  });

  it("should successfully deploy if app catelog not exist", async () => {
    const packagePath = await createPackageFile();

    Constants.APP_CATALOG_REFRESH_TIME = 0;
    Constants.APP_CATALOG_ACTIVE_TIME = 0;

    vi.spyOn(SPFxDeployDriver.prototype, "getTenant").mockResolvedValue("fakeTenant");
    vi.spyOn(SPFxDeployDriver.prototype, "getPackagePath").mockResolvedValue(packagePath);
    vi.spyOn(SPFxDeployDriver.prototype, "getAppID").mockResolvedValue("fakeAppID");

    vi.spyOn(Tools, "getSPFxToken").mockResolvedValue("fakeSPFxToken");
    vi.spyOn(SPOClient, "getAppCatalogSite")
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce("fakeAppCatelogSite");
    vi.spyOn(SPOClient, "createAppCatalog").mockResolvedValue(undefined as any);
    vi.spyOn(SPOClient, "uploadAppPackage").mockResolvedValue(undefined as any);
    vi.spyOn(SPOClient, "deployAppPackage").mockResolvedValue(undefined as any);

    const result = await deployDriver.run(args, mockedDriverContext);
    expect(result.isOk()).to.be.true;
  });

  it("fail to get SPFx token - GetSPOTokenFailed", async () => {
    vi.spyOn(SPFxDeployDriver.prototype, "getTenant").mockResolvedValue("fakeTenant");
    vi.spyOn(Tools, "getSPFxToken").mockResolvedValue(undefined);

    const result = await deployDriver.run(args, mockedDriverContext);
    expect(result.isErr()).to.be.true;
    expect((result as any).error).instanceOf(GetSPOTokenFailedError);
  });

  it("fail to create app catelog - CreateAppCatalogFailed", async () => {
    vi.spyOn(SPFxDeployDriver.prototype, "getTenant").mockResolvedValue("fakeTenant");

    vi.spyOn(Tools, "getSPFxToken").mockResolvedValue("fakeSPFxToken");
    vi.spyOn(SPOClient, "getAppCatalogSite").mockResolvedValue(undefined);

    const result = await deployDriver.run(args, mockedDriverContext);
    expect(result.isErr()).to.be.true;
    expect((result as any).error).instanceOf(CreateAppCatalogFailedError);
  });

  it("fail to create app catelog - NoValidAppCatelog", async () => {
    vi.spyOn(SPFxDeployDriver.prototype, "getTenant").mockResolvedValue("fakeTenant");

    vi.spyOn(Tools, "getSPFxToken").mockResolvedValue("fakeSPFxToken");
    vi.spyOn(SPOClient, "getAppCatalogSite").mockResolvedValue(undefined);

    const result = await deployDriver.run(
      {
        createAppCatalogIfNotExist: false,
        packageSolutionPath: "./SPFx/config/package-solution.json",
      },
      mockedDriverContext
    );
    expect(result.isErr()).to.be.true;
    expect((result as any).error).instanceOf(NoValidAppCatelog);
  });

  it("fail to get app catelog - CreateAppCatalogFailedError", async () => {
    vi.spyOn(SPFxDeployDriver.prototype, "getTenant").mockResolvedValue("fakeTenant");
    Constants.APP_CATALOG_REFRESH_TIME = 0;

    vi.spyOn(Tools, "getSPFxToken").mockResolvedValue("fakeSPFxToken");
    vi.spyOn(SPOClient, "getAppCatalogSite").mockResolvedValue(undefined);
    vi.spyOn(SPOClient, "createAppCatalog").mockResolvedValue(undefined as any);

    const result = await deployDriver.run(args, mockedDriverContext);
    expect(result.isErr()).to.be.true;
    expect((result as any).error).instanceOf(CreateAppCatalogFailedError);
  });

  it("fail to get package path - NoSPPackageError", async () => {
    vi.spyOn(SPFxDeployDriver.prototype, "getTenant").mockResolvedValue("fakeTenant");
    vi.spyOn(SPFxDeployDriver.prototype, "getPackagePath").mockResolvedValue(
      path.join(tempDir, "missing.sppkg")
    );
    vi.spyOn(SPFxDeployDriver.prototype, "getAppID").mockResolvedValue("fakeAppID");

    vi.spyOn(Tools, "getSPFxToken").mockResolvedValue("fakeSPFxToken");
    vi.spyOn(SPOClient, "getAppCatalogSite").mockResolvedValue("fakeAppCatelogSite");

    const result = await deployDriver.run(args, mockedDriverContext);
    expect(result.isErr()).to.be.true;
    expect((result as any).error).instanceOf(NoSPPackageError);
  });

  it("fail to upload app package - 403", async () => {
    const packagePath = await createPackageFile();

    vi.spyOn(SPFxDeployDriver.prototype, "getTenant").mockResolvedValue("fakeTenant");
    vi.spyOn(SPFxDeployDriver.prototype, "getPackagePath").mockResolvedValue(packagePath);
    vi.spyOn(SPFxDeployDriver.prototype, "getAppID").mockResolvedValue("fakeAppID");

    vi.spyOn(Tools, "getSPFxToken").mockResolvedValue("fakeSPFxToken");
    vi.spyOn(SPOClient, "getAppCatalogSite").mockResolvedValue("fakeAppCatelogSite");
    vi.spyOn(SPOClient, "uploadAppPackage").mockImplementation(() => {
      throw {
        response: {
          status: 403,
        },
      } as any;
    });

    const result = await deployDriver.run(args, mockedDriverContext);
    expect(result.isErr()).to.be.true;
    expect((result as any).error).instanceOf(InsufficientPermissionError);
  });

  it("fail to upload app package - UploadAppPackageFailedError", async () => {
    const packagePath = await createPackageFile();

    vi.spyOn(SPFxDeployDriver.prototype, "getTenant").mockResolvedValue("fakeTenant");
    vi.spyOn(SPFxDeployDriver.prototype, "getPackagePath").mockResolvedValue(packagePath);
    vi.spyOn(SPFxDeployDriver.prototype, "getAppID").mockResolvedValue("fakeAppID");

    vi.spyOn(Tools, "getSPFxToken").mockResolvedValue("fakeSPFxToken");
    vi.spyOn(SPOClient, "getAppCatalogSite").mockResolvedValue("fakeAppCatelogSite");
    vi.spyOn(SPOClient, "uploadAppPackage").mockImplementation(() => {
      throw new Error("fakeError");
    });

    const result = await deployDriver.run(args, mockedDriverContext);
    expect(result.isErr()).to.be.true;
    expect((result as any).error).instanceOf(UploadAppPackageFailedError);
  });

  it("get tenant from M365TokenProvider", async () => {
    vi.spyOn(axios, "create").mockReturnValue({
      defaults: { headers: { common: {} } },
      get: function <T = any, R = AxiosResponse<T>>(
        _url: string,
        _config?: AxiosRequestConfig | undefined
      ): Promise<R> {
        return Promise.resolve({ data: { webUrl: "fakeWebUrl" } } as any);
      },
    } as any);
    expect(await deployDriver.getTenant(mockM365TokenProvider())).to.equal("fakeWebUrl");
  });

  it("fail to tenant from M365TokenProvider - GetGraphTokenFailedError", async () => {
    const mockedM365TokenProvider = mockM365TokenProvider();
    (mockedM365TokenProvider as any).getAccessToken = vi.fn().mockReturnValue(ok(undefined));
    await assertRejected(deployDriver.getTenant(mockedM365TokenProvider), GetGraphTokenFailedError);
  });

  it("fail to get tenant from M365TokenProvider - GetTenantFailedError", async () => {
    vi.spyOn(axios, "create").mockReturnValue({
      defaults: { headers: { common: {} } },
      get: function <T = any, R = AxiosResponse<T>>(
        _url: string,
        _config?: AxiosRequestConfig | undefined
      ): Promise<R> {
        return Promise.resolve(undefined as any);
      },
    } as any);
    await assertRejected(deployDriver.getTenant(mockM365TokenProvider()), GetTenantFailedError);
  });

  it("fail to get tenant from M365TokenProvider - GetTenantFailedError", async () => {
    vi.spyOn(axios, "create").mockReturnValue({
      defaults: { headers: { common: {} } },
      get: function <T = any, R = AxiosResponse<T>>(
        _url: string,
        _config?: AxiosRequestConfig | undefined
      ): Promise<R> {
        throw new Error();
      },
    } as any);
    await assertRejected(deployDriver.getTenant(mockM365TokenProvider()), GetTenantFailedError);
  });

  it("get package path from solutionConfigPath", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readJson").mockResolvedValue({
      paths: { zippedPackage: "solution/a.zip" },
    } as any);
    expect(await deployDriver.getPackagePath("C://test/config/package-solution.json")).to.equal(
      path.resolve("C://test/sharepoint/solution/a.zip")
    );
  });

  it("fail to get package path from solutionConfigPath - PathNotExistsError", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    await assertRejected(
      deployDriver.getPackagePath("C://test/config/package-solution.json"),
      FileNotFoundError
    );
  });

  it("get app id from solutionConfigPath", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readJson").mockResolvedValue({ solution: { id: "fakeID" } } as any);
    expect(await deployDriver.getAppID("C://test/config/package-solution.json")).to.equal("fakeID");
  });

  it("fail to get app id from solutionConfigPath - PathNotExistsError", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    await assertRejected(
      deployDriver.getAppID("C://test/config/package-solution.json"),
      FileNotFoundError
    );
  });
});

export function mockM365TokenProvider(): M365TokenProvider {
  const provider = <M365TokenProvider>{};
  const mockTokenObject = {
    tid: faker.datatype.uuid(),
  };

  provider.getAccessToken = vi.fn().mockReturnValue(ok("token"));
  provider.getJsonObject = vi.fn().mockReturnValue(ok(mockTokenObject));
  return provider;
}
