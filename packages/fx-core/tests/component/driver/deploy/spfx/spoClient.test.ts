// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { chai, vi } from "vitest";
import { SPOClient } from "../../../../../src/component/driver/deploy/spfx/utility/spoClient";

const expect = chai.expect;

describe("SPFx SPO Client", async () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("get app catalog site", async () => {
    vi.spyOn(axios, "create").mockReturnValue({
      defaults: { headers: { common: {} } },
      interceptors: {
        request: {
          use: vi.fn(),
        },
      },
      get: function <T = any, R = AxiosResponse<T>>(
        url: string,
        config?: AxiosRequestConfig | undefined
      ): Promise<R> {
        return { data: { CorporateCatalogUrl: "fakeUrl" } } as any;
      },
    } as any);
    expect(await SPOClient.getAppCatalogSite("")).to.equal("fakeUrl");
  });

  it("get app catalog site - undefined", async () => {
    vi.spyOn(axios, "create").mockReturnValue({
      defaults: { headers: { common: {} } },
      interceptors: {
        request: {
          use: vi.fn(),
        },
      },
      get: function <T = any, R = AxiosResponse<T>>(
        url: string,
        config?: AxiosRequestConfig | undefined
      ): Promise<R> {
        return { data: {} } as any;
      },
    } as any);
    expect(await SPOClient.getAppCatalogSite("")).to.equal(undefined);
  });

  it("upload app package", async () => {
    vi.spyOn(axios, "create").mockReturnValue({
      defaults: { headers: { common: {} } },
      interceptors: {
        request: {
          use: vi.fn(),
        },
      },
      post: function <T = any, R = AxiosResponse<T>>(
        url: string,
        config?: AxiosRequestConfig | undefined
      ): Promise<R> {
        return { data: { CorporateCatalogUrl: "fakeUrl" } } as any;
      },
    } as any);
    await SPOClient.uploadAppPackage("", "", Buffer.from(""));
  });

  it("deploy app package", async () => {
    vi.spyOn(axios, "create").mockReturnValue({
      defaults: { headers: { common: {} } },
      interceptors: {
        request: {
          use: vi.fn(),
        },
      },
      post: function <T = any, R = AxiosResponse<T>>(
        url: string,
        config?: AxiosRequestConfig | undefined
      ): Promise<R> {
        return { data: { CorporateCatalogUrl: "fakeUrl" } } as any;
      },
    } as any);
    await SPOClient.deployAppPackage("", "");
  });

  it("create app catelog", async () => {
    vi.spyOn(axios, "create").mockReturnValue({
      defaults: { headers: { common: {} } },
      interceptors: {
        request: {
          use: vi.fn(),
        },
      },
      post: function <T = any, R = AxiosResponse<T>>(
        url: string,
        config?: AxiosRequestConfig | undefined
      ): Promise<R> {
        return { data: { CorporateCatalogUrl: "fakeUrl" } } as any;
      },
    } as any);
    await SPOClient.createAppCatalog("");
  });
});
