{
  "id": "${{AAD_APP_OBJECT_ID}}",
  "appId": "${{AAD_APP_CLIENT_ID}}",
  "displayName": "{{appName}}-${{TEAMSFX_ENV}}",
  "signInAudience": "AzureADMyOrg",
  "api": {
    "requestedAccessTokenVersion": 2
  },
  "info": {},
  "publicClient": {},
  "requiredResourceAccess": [
    {
      "resourceAppId": "Microsoft Graph",
      "resourceAccess": [
        {
          "id": "ExternalConnection.ReadWrite.OwnedBy",
          "type": "Role"
        },
        {
          "id": "ExternalItem.ReadWrite.OwnedBy",
          "type": "Role"
        }
      ]
    }
  ],
  "web": {
    "implicitGrantSettings": {}
  },
  "spa": {}
}
