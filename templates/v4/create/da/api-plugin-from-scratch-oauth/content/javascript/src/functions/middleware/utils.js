const CloudType = {
  Public: 0,
  Ppe: 1,
  USGovernment: 2,
  China: 3,
};

/**
 * Retrieves the JWKS URI for the specified tenant.
 * @param {string} [tenant='common'] - The tenant to retrieve the JWKS URI for.
 * @param {number} [cloud=CloudType.Public] - The cloud to retrieve the JWKS URI for.
 * @returns {Promise<string>} - A promise that resolves with the JWKS URI.
 */
async function getEntraJwksUri(tenant = "common", cloud = CloudType.Public) {
  let cloudUrl = "";
  switch (cloud) {
    case CloudType.Public:
      cloudUrl = "login.microsoftonline.com";
      break;
    case CloudType.Ppe:
      cloudUrl = "login.windows-ppe.net";
      break;
    case CloudType.USGovernment:
      cloudUrl = "login.microsoftonline.us";
      break;
    case CloudType.China:
      cloudUrl = "login.chinacloudapi.cn";
      break;
  }
  const res = await fetch(`https://${cloudUrl}/${tenant}/.well-known/openid-configuration`);
  const data = await res.json();
  return data.jwks_uri;
}

module.exports = { getEntraJwksUri, CloudType };
