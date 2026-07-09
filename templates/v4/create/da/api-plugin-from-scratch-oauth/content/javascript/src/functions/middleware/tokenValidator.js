const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const { TokenCacheWrapper } = require("./tokenCacheWrapper.js");

const claimsType = Object.freeze({
  scopes: "scopes",
  roles: "roles",
});

class TokenValidator {
  constructor(options) {
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
      this.client.getSigningKey = this.cacheWrapper.getCacheWrapper();
    }
  }

  async validateToken(token, options) {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) {
      throw new Error("jwt malformed");
    }

    // necessary to support multitenant apps
    this.updateIssuer(decoded, options);

    const key = await this.getSigningKey(decoded.header.kid);
    const verifiedToken = jwt.verify(token, key, options);

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

  static validateIdtyp(jwt, options) {
    if (options.idtyp && options.idtyp !== jwt.idtyp) {
      throw new Error(`jwt idtyp is invalid. Expected: ${options.idtyp}`);
    }
  }

  static validateVer(jwt, options) {
    if (options.ver && options.ver !== jwt.ver) {
      throw new Error(`jwt ver is invalid. Expected: ${options.ver}`);
    }
  }

  static validateScopesAndRoles(jwt, options) {
    if (options.scp || options.roles) {
      const validateClaims = (claimsFromTheToken, requiredClaims, claimsType) => {
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

  static validateAllowedTenants(jwt, options) {
    if (options.allowedTenants && options.allowedTenants.length > 0) {
      if (!jwt.tid || !options.allowedTenants.includes(jwt.tid)) {
        throw new Error(
          `jwt tid is not allowed. Allowed tenants: ${options.allowedTenants.join(", ")}`
        );
      }
    }
  }

  clearCache() {
    this.cacheWrapper?.cache.reset();
  }

  deleteKey(kid) {
    this.cacheWrapper?.cache.del(kid);
  }

  async getSigningKey(kid) {
    const key = await this.client.getSigningKey(kid);
    return key.getPublicKey();
  }

  updateIssuer(jwt, options) {
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
      options.issuer = options.issuer.map((issuer) => {
        if (issuer.toLowerCase().indexOf("{tenantid}") > -1) {
          return issuer.replace(/{tenantid}/i, jwt.payload.tid);
        }
        return issuer;
      });
      return;
    }
  }
}

module.exports = { TokenValidator };
