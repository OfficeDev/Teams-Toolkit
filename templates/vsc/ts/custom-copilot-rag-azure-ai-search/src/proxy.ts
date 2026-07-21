// Routes outbound HTTPS traffic through a corporate proxy when HTTPS_PROXY /
// HTTP_PROXY / NO_PROXY are set. Node's global fetch (undici) ignores these
// variables by default, so we install a proxy-aware dispatcher explicitly.
// Imported first in index so it applies before any SDK opens a connection.
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";

if (
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.https_proxy ||
  process.env.http_proxy
) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}
