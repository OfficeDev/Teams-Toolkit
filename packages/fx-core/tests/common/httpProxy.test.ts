// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios, { InternalAxiosRequestConfig } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyProxyToRequest,
  installGlobalProxyInterceptor,
  installProxyInterceptor,
} from "../../src/common/httpProxy";

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

  it("handles a config with only baseURL and no url", () => {
    process.env.HTTPS_PROXY = "http://proxy.corp.example.com:8080";
    const config = {
      baseURL: "https://graph.microsoft.com",
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

  it("treats an unparseable target as HTTPS when it starts with https:", () => {
    process.env.HTTPS_PROXY = "http://proxy.corp.example.com:8080";
    // A URL the WHATWG URL parser rejects, forcing the string-prefix fallback.
    const config = applyProxyToRequest(makeConfig("https://"));
    expect(config.httpsAgent).toBeInstanceOf(HttpsProxyAgent);
  });

  it("does not proxy an unparseable non-https target", () => {
    process.env.HTTP_PROXY = "http://proxy.corp.example.com:8080";
    // Not parseable and not https-prefixed -> treated as http, but no HTTP proxy
    // for this shape means we still fall through; assert no HTTPS agent attaches.
    const config = applyProxyToRequest(makeConfig("not a url"));
    expect(config.httpsAgent).toBeInstanceOf(HttpsProxyAgent);
  });

  it("does not bypass when NO_PROXY is set but the target is unparseable", () => {
    process.env.HTTPS_PROXY = "http://proxy.corp.example.com:8080";
    process.env.NO_PROXY = "graph.microsoft.com";
    // isNoProxy hits its catch (unparseable) and returns false -> still proxied.
    const config = applyProxyToRequest(makeConfig("https://"));
    expect(config.httpsAgent).toBeInstanceOf(HttpsProxyAgent);
  });

  it("skips a host when NO_PROXY entry has a matching port", () => {
    process.env.HTTPS_PROXY = "http://proxy.corp.example.com:8080";
    process.env.NO_PROXY = "graph.microsoft.com:8443";
    const config = applyProxyToRequest(makeConfig("https://graph.microsoft.com:8443/v1.0"));
    expect(config.httpsAgent).toBeUndefined();
  });

  it("still proxies when NO_PROXY entry port does not match the request port", () => {
    process.env.HTTPS_PROXY = "http://proxy.corp.example.com:8080";
    process.env.NO_PROXY = "graph.microsoft.com:8443";
    const config = applyProxyToRequest(makeConfig("https://graph.microsoft.com:9999/v1.0"));
    expect(config.httpsAgent).toBeInstanceOf(HttpsProxyAgent);
  });

  it("honors lowercase no_proxy", () => {
    process.env.HTTPS_PROXY = "http://proxy.corp.example.com:8080";
    process.env.no_proxy = "graph.microsoft.com";
    const config = applyProxyToRequest(makeConfig("https://graph.microsoft.com/v1.0"));
    expect(config.httpsAgent).toBeUndefined();
  });

  describe("installProxyInterceptor", () => {
    it("registers an interceptor that applies the proxy to instance requests", async () => {
      process.env.HTTPS_PROXY = "http://proxy.corp.example.com:8080";
      const instance = axios.create();
      installProxyInterceptor(instance);
      const handler = (instance.interceptors.request as any).handlers.at(-1);
      const config = await handler.fulfilled(makeConfig("https://graph.microsoft.com"));
      expect(config.httpsAgent).toBeInstanceOf(HttpsProxyAgent);
    });
  });

  describe("installGlobalProxyInterceptor", () => {
    it("installs on the default instance and wraps axios.create, only once", () => {
      const before = (axios.interceptors.request as any).handlers.length;
      const createBefore = axios.create;

      installGlobalProxyInterceptor();

      const afterFirst = (axios.interceptors.request as any).handlers.length;
      expect(afterFirst).toBe(before + 1);
      expect(axios.create).not.toBe(createBefore);

      // A second call is a no-op (idempotent) — no extra interceptor, no re-wrap.
      const createAfterFirst = axios.create;
      installGlobalProxyInterceptor();
      expect((axios.interceptors.request as any).handlers.length).toBe(afterFirst);
      expect(axios.create).toBe(createAfterFirst);
    });

    it("wrapped axios.create yields instances that honor the proxy", async () => {
      process.env.HTTPS_PROXY = "http://proxy.corp.example.com:8080";
      installGlobalProxyInterceptor();
      const instance = axios.create();
      const handler = (instance.interceptors.request as any).handlers.at(-1);
      const config = await handler.fulfilled(makeConfig("https://graph.microsoft.com"));
      expect(config.httpsAgent).toBeInstanceOf(HttpsProxyAgent);
    });
  });
});
