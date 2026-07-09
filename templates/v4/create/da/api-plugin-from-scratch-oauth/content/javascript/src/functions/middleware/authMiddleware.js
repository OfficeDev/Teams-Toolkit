const config = require("./config");
const { TokenValidator } = require("./tokenValidator");
const { getEntraJwksUri } = require("./utils");

/**
 * Middleware function to handle authorization using JWT.
 *
 * @param req - The HTTP request.
 * @returns A promise that resolves to a boolean value.
 */
async function authMiddleware(req) {
  // Get the token from the request headers
  const token = req.headers.get("authorization")?.split(" ")[1];
  if (!token) {
    return false;
  }

  try {
    // Get the JWKS URL for the Microsoft Entra common tenant
    const entraJwksUri = await getEntraJwksUri();

    // Create a new token validator with the JWKS URL
    const validator = new TokenValidator({
      jwksUri: entraJwksUri,
    });

    const options = {
      allowedTenants: [config.aadAppTenantId],
      audience: config.aadAppClientId,
      issuer: `https://login.microsoftonline.com/${config.aadAppTenantId}/v2.0`,
      scp: ["repairs_read"],
    };
    // Validate the token
    await validator.validateToken(token, options);

    return true;
  } catch (err) {
    // Handle JWT verification errors
    console.error("Token is invalid:", err);
    return false;
  }
}

module.exports = { authMiddleware };
