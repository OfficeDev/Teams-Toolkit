// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { InternalAxiosRequestConfig } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyProxyToRequest } from "../../src/common/httpProxy";

function makeConfig(url: string): InternalAxiosRequestConfig {
  return { url, headers: {} } as unknown as InternalAxiosRequestConfig;
}

describe("httpProxy", () => {
  const proxyEnvKeys = [
    "HTTPS_PROXY",
    "https_proxy",
    "HTTP_PROXY",
    "http_proxy",
    "NO_PROXY",
    "no_proxy",
  ];
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of proxyEnvKeys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of proxyEnvKeys) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it("does nothing when no proxy env var is set", () => {
    const config = applyProxyToRequest(makeConfig("https://graph.microsoft.com"));
    expect(config.httpsAgent).toBeUndefined();
    expect(config.proxy).toBeUndefined();
  });

  it("attaches an HttpsProxyAgent for HTTPS requests when HTTPS_PROXY is set", () => {
    process.env.HTTPS_PROXY = "http://proxy.corp.example.com:8080";
    const config = applyProxyToRequest(
      makeConfig(
        "https://login.microsoftonline.com/botframework.com/v2.0/.well-known/openid-configuration"
      )
    );
    expect(config.httpsAgent).toBeInstanceOf(HttpsProxyAgent);
    expect(config.httpAgent).toBeInstanceOf(HttpsProxyAgent);
    expect(config.proxy).toBe(false);
  });

  it("falls back to HTTP_PROXY for HTTPS when HTTPS_PROXY is unset", () => {
    process.env.HTTP_PROXY = "http://proxy.corp.example.com:8080";
    const config = applyProxyToRequest(makeConfig("https://graph.microsoft.com"));
    expect(config.httpsAgent).toBeInstanceOf(HttpsProxyAgent);
  });

  it("honors lowercase https_proxy", () => {
    process.env.https_proxy = "http://proxy.corp.example.com:8080";
    const config = applyProxyToRequest(makeConfig("https://graph.microsoft.com"));
    expect(config.httpsAgent).toBeInstanceOf(HttpsProxyAgent);
  });

  it("skips a host listed in NO_PROXY", () => {
    process.env.HTTPS_PROXY = "http://proxy.corp.example.com:8080";
    process.env.NO_PROXY = "localhost,graph.microsoft.com";
    const config = applyProxyToRequest(makeConfig("https://graph.microsoft.com/v1.0/me"));
    expect(config.httpsAgent).toBeUndefined();
  });

  it("skips subdomains matched by a NO_PROXY suffix", () => {
    process.env.HTTPS_PROXY = "http://proxy.corp.example.com:8080";
    process.env.NO_PROXY = ".microsoft.com";
    const config = applyProxyToRequest(makeConfig("https://dev.teams.microsoft.com/api"));
    expect(config.httpsAgent).toBeUndefined();
  });

  it("bypasses everything when NO_PROXY is *", () => {
    process.env.HTTPS_PROXY = "http://proxy.corp.example.com:8080";
    process.env.NO_PROXY = "*";
    const config = applyProxyToRequest(makeConfig("https://graph.microsoft.com"));
    expect(config.httpsAgent).toBeUndefined();
  });

  it("still proxies a host not covered by NO_PROXY", () => {
    process.env.HTTPS_PROXY = "http://proxy.corp.example.com:8080";
    process.env.NO_PROXY = "localhost";
    const config = applyProxyToRequest(makeConfig("https://graph.microsoft.com"));
    expect(config.httpsAgent).toBeInstanceOf(HttpsProxyAgent);
  });

  it("uses baseURL when url is relative", () => {
    process.env.HTTPS_PROXY = "http://proxy.corp.example.com:8080";
    const config = {
      baseURL: "https://graph.microsoft.com",
      url: "/v1.0/me",
      headers: {},
    } as unknown as InternalAxiosRequestConfig;
    const result = applyProxyToRequest(config);
    expect(result.httpsAgent).toBeInstanceOf(HttpsProxyAgent);
  });

  it("does not override a request that already set an agent", () => {
    process.env.HTTPS_PROXY = "http://proxy.corp.example.com:8080";
    const existingAgent = {} as unknown as InternalAxiosRequestConfig["httpsAgent"];
    const config = {
      url: "https://graph.microsoft.com",
      httpsAgent: existingAgent,
      headers: {},
    } as unknown as InternalAxiosRequestConfig;
    const result = applyProxyToRequest(config);
    expect(result.httpsAgent).toBe(existingAgent);
    expect(result.proxy).toBeUndefined();
  });
});
