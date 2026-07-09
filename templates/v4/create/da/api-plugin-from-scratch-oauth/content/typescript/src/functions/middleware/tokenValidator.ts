import jwt, { Jwt, JwtPayload, VerifyOptions } from "jsonwebtoken";
import jwksClient from "jwks-rsa";

import { TokenCacheWrapper } from "./tokenCacheWrapper.js";

const claimsType = Object.freeze({
  scopes: "scopes",
  roles: "roles",
});

export interface TokenValidatorOptions {
  cache?: boolean;
  cacheMaxAge?: number;
  jwksUri: string;
}

export interface ValidateTokenOptions extends VerifyOptions {
  allowedTenants?: string[];
  idtyp?: string;
  roles?: string[];
  scp?: string[];
  ver?: string;
}

export interface EntraJwtPayload extends JwtPayload {
  idtyp?: string;
  roles?: string[];
  scp?: string[];
  ver?: string;
}

export class TokenValidator {
  private client: jwksClient.JwksClient;
  private cacheWrapper: TokenCacheWrapper;

  /**
   * Constructs a new instance of TokenValidator.
   * @param {Object} options Configuration options for the TokenValidator.
   * @param {boolean} [options.cache=true] Whether to cache the JWKS keys.
   * @param {number} [options.cacheMaxAge=86400000] The maximum age of the cache in milliseconds (default is 24 hours).
   * @param {string} options.jwksUri The URI to fetch the JWKS keys from.
   * @throws {Error} If the options parameter is not provided.
   */
  constructor(options: TokenValidatorOptions) {
    if (!options) {
      throw new Error("options is required");
    }

    const cache = options.cache ?? true;

    this.client = jwksClient({
      cache,
      cacheMaxAge: options.cacheMaxAge ?? 24 * 60 * 60 * 1000, // 24 hours in milliseconds
      jwksUri: options.jwksUri,
    });
    if (cache) {
      this.cacheWrapper = new TokenCacheWrapper(this.client, options);
      this.client.getSigningKey = this.cacheWrapper.getCacheWrapper() as any;
    }
  }

  /**
   * Validates a JWT token.
   * @param {string} token The JWT token to validate.
   * @param {import('jsonwebtoken').VerifyOptions & { complete?: false } & { idtyp?: string, ver?: string, scp?: string[], roles?: string[] }} [options] Validation options.
   * @property {string[]} [options.allowedTenants] The allowed tenants for the JWT token. Compared against the 'tid' claim.
   * @property {string} [options.idtyp] The expected value of the 'idtyp' claim in the JWT token.
   * @property {string[]} [options.roles] Roles expected in the 'roles' claim in the JWT token.
   * @property {string[]} [options.scp] Scopes expected in the 'scp' claim in the JWT token.
   * @property {string} [options.ver] The expected value of the 'ver' claim in the JWT token.
   * @returns {Promise<import('jsonwebtoken').JwtPayload | string>} The decoded and verified JWT token.
   * @throws {Error} If the token is invalid or the validation fails.
   */
  public async validateToken(token: string, options?: ValidateTokenOptions) {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) {
      throw new Error("jwt malformed");
    }

    // necessary to support multitenant apps
    this.updateIssuer(decoded, options);

    const key = await this.getSigningKey(decoded.header.kid);
    const verifiedToken = jwt.verify(token, key, options) as EntraJwtPayload;

    if (!options) {
      return verifiedToken;
    }

    const validators = [
      TokenValidator.validateIdtyp,
      TokenValidator.validateVer,
      TokenValidator.validateScopesAndRoles,
      TokenValidator.validateAllowedTenants,
    ];
    validators.forEach((validator) => validator(verifiedToken, options));

    return verifiedToken;
  }

  private static validateIdtyp(jwt: EntraJwtPayload, options: ValidateTokenOptions) {
    if (options.idtyp && options.idtyp !== jwt.idtyp) {
      throw new Error(`jwt idtyp is invalid. Expected: ${options.idtyp}`);
    }
  }

  private static validateVer(jwt: EntraJwtPayload, options: ValidateTokenOptions) {
    if (options.ver && options.ver !== jwt.ver) {
      throw new Error(`jwt ver is invalid. Expected: ${options.ver}`);
    }
  }

  private static validateScopesAndRoles(jwt: EntraJwtPayload, options: ValidateTokenOptions) {
    if (options.scp || options.roles) {
      const validateClaims = (
        claimsFromTheToken: string[],
        requiredClaims: string[],
        claimsType: string
      ) => {
        const hasAnyRequiredClaim = requiredClaims.some((claim) =>
          claimsFromTheToken.includes(claim)
        );
        if (!hasAnyRequiredClaim) {
          throw new Error(`jwt does not contain any of the required ${claimsType}`);
        }
      };

      if (options.scp && options.roles) {
        if (jwt.scp) {
          validateClaims(jwt.scp, options.scp, claimsType.scopes);
        } else if (jwt.roles) {
          validateClaims(jwt.roles, options.roles, claimsType.roles);
        }
      } else if (options.scp) {
        validateClaims(jwt.scp ?? [], options.scp, claimsType.scopes);
      } else if (options.roles) {
        validateClaims(jwt.roles ?? [], options.roles, claimsType.roles);
      }
    }
  }

  private static validateAllowedTenants(jwt: EntraJwtPayload, options: ValidateTokenOptions) {
    if (options.allowedTenants && options.allowedTenants.length > 0) {
      if (!jwt.tid || !options.allowedTenants.includes(jwt.tid)) {
        throw new Error(
          `jwt tid is not allowed. Allowed tenants: ${options.allowedTenants.join(", ")}`
        );
      }
    }
  }

  /**
   * Clears the cache used by the TokenValidator.
   */
  public clearCache() {
    this.cacheWrapper?.cache.reset();
  }

  /**
   * Deletes a key from the cache.
   * @param {string} kid The key ID to delete from the cache.
   */
  public deleteKey(kid: string) {
    this.cacheWrapper?.cache.del(kid);
  }

  private async getSigningKey(kid?: string) {
    const key = await this.client.getSigningKey(kid);
    return key.getPublicKey();
  }

  private updateIssuer(jwt: Jwt, options?: ValidateTokenOptions) {
    if (!options?.issuer || typeof jwt.payload !== "object" || !jwt.payload.tid) {
      return;
    }

    if (typeof options.issuer === "string") {
      if (options.issuer.toLowerCase().indexOf("{tenantid}") > -1) {
        options.issuer = options.issuer.replace(/{tenantid}/i, jwt.payload.tid);
      }
      return;
    }

    if (Array.isArray(options.issuer)) {
      const mappedIssuers = options.issuer.map((issuer) => {
        if (issuer.toLowerCase().indexOf("{tenantid}") > -1) {
          return issuer.replace(/{tenantid}/i, (jwt.payload as JwtPayload).tid);
        }
        return issuer;
      });

      if (mappedIssuers.length > 0) {
        options.issuer = mappedIssuers as [string, ...string[]];
      }
      return;
    }
  }
}
