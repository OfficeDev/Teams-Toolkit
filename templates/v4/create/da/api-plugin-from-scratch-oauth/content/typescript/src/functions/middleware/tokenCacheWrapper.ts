import createDebug from "debug";
import { JwksClient, SigningKey } from "jwks-rsa";
import memoizer from "lru-memoizer";
import { IMemoized } from "lru-memoizer/lib/async";
import { callbackify, promisify } from "util";

const logger = createDebug("jwt-validate");

// Based on https://github.com/auth0/node-jwks-rsa/blob/4fe372be935c2aa0882e0f1e58d33eead4be966d/src/wrappers/cache.js
// exposes cache to make it possible to clear cache and keys
export class TokenCacheWrapper {
  public readonly cache: IMemoized<string, JwksClient, string, any, any, any, any>;

  constructor(client: JwksClient, { cacheMaxEntries = 5, cacheMaxAge = 600000 }) {
    logger(`Configured caching of signing keys. Max: ${cacheMaxEntries} / Age: ${cacheMaxAge}`);
    this.cache = memoizer({
      hash: (kid: string) => kid,
      load: callbackify(client.getSigningKey.bind(client)) as any,
      maxAge: cacheMaxAge,
      max: cacheMaxEntries,
    } as any);
  }

  getCacheWrapper(): (kid?: string | null | undefined) => Promise<SigningKey> {
    return promisify(this.cache as any);
  }
}
