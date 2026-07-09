@maxLength(20)
@minLength(4)
param resourceBaseName string
param functionAppSKU string
param aadAppClientId string
param aadAppTenantId string
param aadAppOauthAuthorityHost string
param location string = resourceGroup().location
param serverfarmsName string = resourceBaseName
param functionAppName string = resourceBaseName

// Compute resources for Azure Functions
resource serverfarms 'Microsoft.Web/serverfarms@2021-02-01' = {
  name: serverfarmsName
  location: location
  sku: {
    name: functionAppSKU // You can follow https://aka.ms/teamsfx-bicep-add-param-tutorial to add functionServerfarmsSku property to provisionParameters to override the default value "Y1".
  }
  properties: {}
}

// Azure Functions that hosts your function code
resource functionApp 'Microsoft.Web/sites@2021-02-01' = {
  name: functionAppName
  kind: 'functionapp'
  location: location
  properties: {
    serverFarmId: serverfarms.id
    httpsOnly: true
    siteConfig: {
      appSettings: [
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4' // Use Azure Functions runtime v4
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node' // Set runtime to NodeJS
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1' // Run Azure Functions from a package file
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~22' // Set NodeJS version to 22.x
        }
        {
          name: 'aadAppClientId'
          value: aadAppClientId
        }
        {
          name: 'aadAppTenantId'
          value: aadAppTenantId
        }
      ]
      ftpsState: 'FtpsOnly'
    }
  }
}
var apiEndpoint = 'https://${functionApp.properties.defaultHostName}'
var oauthAuthority = uri(aadAppOauthAuthorityHost, aadAppTenantId)
var aadApplicationIdUri = 'api://${aadAppClientId}'
{{#MicrosoftEntra}}
var aadApplicationIdUriWithDomain = 'api://${functionApp.properties.defaultHostName}/${aadAppClientId}'
{{/MicrosoftEntra}}

// Configure Azure Functions to use Azure AD for authentication.
{{#MicrosoftEntra}}
var clientIdForTGS = 'ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b'
{{/MicrosoftEntra}}
resource authSettings 'Microsoft.Web/sites/config@2021-02-01' = {
  parent: functionApp
  name: 'authsettingsV2'
  properties: {
    globalValidation: {
      requireAuthentication: true
      unauthenticatedClientAction: 'Return401'
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          openIdIssuer: oauthAuthority
          clientId: aadAppClientId
        }
        validation: {
          defaultAuthorizationPolicy: {
            allowedApplications: [
              aadAppClientId
{{#MicrosoftEntra}}
              clientIdForTGS
{{/MicrosoftEntra}}
            ]
          }
          allowedAudiences: [
            aadAppClientId
            aadApplicationIdUri
{{#MicrosoftEntra}}
            aadApplicationIdUriWithDomain
{{/MicrosoftEntra}}
          ]
        }
      }
    }
  }
}


// The output will be persisted in .env.{envName}. Visit https://aka.ms/teamsfx-actions/arm-deploy for more details.
output API_FUNCTION_ENDPOINT string = apiEndpoint
output API_FUNCTION_RESOURCE_ID string = functionApp.id
output OPENAPI_SERVER_URL string = apiEndpoint
output OPENAPI_SERVER_DOMAIN string = functionApp.properties.defaultHostName
