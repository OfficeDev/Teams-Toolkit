// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios, { AxiosInstance, CreateAxiosDefaults, InternalAxiosRequestConfig } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

// Node's global fetch and axios both fail to honor system proxy settings for
// HTTPS out of the box: axios's built-in `proxy` option mishandles HTTPS
// tunneling (it can send the request as a plain HTTP GET, leaking the URL and
// failing the handshake). We route HTTPS through an explicit HttpsProxyAgent
// instead and disable axios's own proxy logic. See GitHub issue #15644.

function getProxyForUrl(targetUrl: string): string | undefined {
  const httpsProxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const httpProxy = process.env.HTTP_PROXY ?? process.env.http_proxy;

  let isHttps: boolean;
  try {
    isHttps = new URL(targetUrl).protocol === "https:";
  } catch {
    isHttps = targetUrl.startsWith("https:");
  }

  const proxy = isHttps ? (httpsProxy ?? httpProxy) : httpProxy;
  if (!proxy) {
    return undefined;
  }
  if (isNoProxy(targetUrl)) {
    return undefined;
  }
  return proxy;
}

// Matches the standard NO_PROXY convention: comma/space-separated host list,
// optional leading "." or "*." wildcard, optional ":port". "*" bypasses all.
function isNoProxy(targetUrl: string): boolean {
  const noProxy = process.env.NO_PROXY ?? process.env.no_proxy;
  if (!noProxy) {
    return false;
  }
  if (noProxy.trim() === "*") {
    return true;
  }

  let host: string;
  let port: string;
  try {
    const parsed = new URL(targetUrl);
    host = parsed.hostname;
    port = parsed.port;
  } catch {
    return false;
  }

  return noProxy
    .split(/[\s,]+/)
    .filter((entry) => entry.length > 0)
    .some((entry) => {
      let pattern = entry;
      const colonIndex = pattern.lastIndexOf(":");
      if (colonIndex > -1) {
        const patternPort = pattern.slice(colonIndex + 1);
        if (port && patternPort && port !== patternPort) {
          return false;
        }
        pattern = pattern.slice(0, colonIndex);
      }
      pattern = pattern.replace(/^\*?\./, "").toLowerCase();
      const lowerHost = host.toLowerCase();
      return lowerHost === pattern || lowerHost.endsWith(`.${pattern}`);
    });
}

/**
 * Attaches an HttpsProxyAgent (built from HTTPS_PROXY/HTTP_PROXY/NO_PROXY) to a
 * single axios request when a proxy applies, and turns off axios's own proxy
 * handling so the agent is used instead.
 */
export function applyProxyToRequest(
  config: InternalAxiosRequestConfig
): InternalAxiosRequestConfig {
  const targetUrl = `${config.baseURL ?? ""}${config.url ?? ""}`;
  const proxy = getProxyForUrl(targetUrl);
  if (proxy && !config.httpsAgent && !config.httpAgent) {
    const agent = new HttpsProxyAgent(proxy);
    config.httpsAgent = agent;
    config.httpAgent = agent;
    config.proxy = false;
  }
  return config;
}

/**
 * Installs the proxy interceptor on an axios instance (or the global default
 * instance) so every request it sends honors the system proxy env vars.
 */
export function installProxyInterceptor(instance: AxiosInstance): void {
  instance.interceptors.request.use((config) => applyProxyToRequest(config));
}

let globalInterceptorInstalled = false;

/**
 * Installs the proxy interceptor on axios's global default instance, and wraps
 * `axios.create` so every instance created afterwards also honors the system
 * proxy env vars. Instances created via `axios.create()` do not inherit the
 * default instance's interceptors, so wrapping `create` is how we cover the
 * many clients in this package that spin up their own instance. Idempotent.
 */
export function installGlobalProxyInterceptor(): void {
  if (globalInterceptorInstalled) {
    return;
  }
  installProxyInterceptor(axios);

  const originalCreate = axios.create.bind(axios);
  axios.create = (config?: CreateAxiosDefaults): AxiosInstance => {
    const instance = originalCreate(config);
    installProxyInterceptor(instance);
    return instance;
  };

  globalInterceptorInstalled = true;
}
