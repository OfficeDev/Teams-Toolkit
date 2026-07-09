{
  "$schema": "https://schema.management.azure.com/schemas/2015-01-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "resourceBaseName": {
      "value": "plugin${{RESOURCE_SUFFIX}}"
    },
    "functionAppSKU": {
      "value": "Y1"
    },
    "aadAppClientId": {
      "value": "${{AAD_APP_CLIENT_ID}}"
    },
    "aadAppTenantId": {
      "value": "${{AAD_APP_TENANT_ID}}"
    },
    "aadAppOauthAuthorityHost": {
      "value": "${{AAD_APP_OAUTH_AUTHORITY_HOST}}"
    }
  }
}