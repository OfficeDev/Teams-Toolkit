@maxLength(20)
@minLength(4)
@description('Used to generate names for all resources in this file')
param resourceBaseName string

param webAppSku string

param serverfarmsName string = resourceBaseName
param webAppName string = resourceBaseName
param location string = resourceGroup().location

resource serverfarm 'Microsoft.Web/serverfarms@2021-02-01' = {
  kind: 'app'
  location: location
  name: serverfarmsName
  sku: {
    name: webAppSku
  }
}

resource webApp 'Microsoft.Web/sites@2021-02-01' = {
  kind: 'app'
  location: location
  name: webAppName
  properties: {
    serverFarmId: serverfarm.id
    httpsOnly: true
    siteConfig: {
      alwaysOn: true
      appSettings: [
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1' // Run Azure App Service from a package file
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~22' // Set NodeJS version to 22.x for your site
        }
        {
          name: 'RUNNING_ON_AZURE'
          value: '1'
        }
      ]
      ftpsState: 'FtpsOnly'
    }
  }
}

// The output will be persisted in .env.{envName}. Visit https://aka.ms/teamsfx-actions/arm-deploy for more details.
output AZURE_APP_SERVICE_RESOURCE_ID string = webApp.id // used in deploy stage
output TAB_DOMAIN string = webApp.properties.defaultHostName
output TAB_ENDPOINT string = 'https://${webApp.properties.defaultHostName}'
