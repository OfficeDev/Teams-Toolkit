import { HttpRequest } from "@azure/functions";
import { TokenValidator } from "./tokenValidator";
import config from "./config";
import { getEntraJwksUri, CloudType } from "./utils";

/**
 * Middleware function to handle authorization using JWT.
 *
 * @param {HttpRequest} req - The HTTP request.
 * @returns {Promise<boolean>} - A promise that resolves to a boolean value.
 */
export async function authMiddleware(req?: HttpRequest): Promise<boolean> {
  // Get the token from the request headers
  const token = req.headers.get("authorization")?.split(" ")[1];
  if (!token) {
    return false;
  }

  try {
    // Get the JWKS URL for the Microsoft Entra common tenant
    const entraJwksUri = await getEntraJwksUri(config.aadAppTenantId, CloudType.Public);

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
