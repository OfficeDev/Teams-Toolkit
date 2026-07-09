@maxLength(20)
@minLength(4)
param resourceBaseName string
param storageAccountType string = 'Standard_LRS'
param functionAppSKU string
@secure()
param clientId string
@secure()
param clientSecret string
param tenantId string
param connectorId string
param connectorName string
param connectorDescription string
param connectorRepos string
@secure()
param connectorReposAccessToken string = ''
param teamsfxEnv string
param location string = resourceGroup().location
param appServiceName string = resourceBaseName
param functionAppName string = resourceBaseName
var storageAccountName = resourceBaseName
var appInsightsName = resourceBaseName
var keyVaultName = resourceBaseName
var logAnalyticsWorkspace = resourceBaseName

var keyVaultSecretsUserRole = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')

// Compute resources for Azure Functions
resource appServicePlan 'Microsoft.Web/serverfarms@2021-02-01' = {
  name: appServiceName
  location: location
  sku: {
    name: functionAppSKU
  }
}
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsWorkspace
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    features: {
      searchVersion: 1
      legacy: 0
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2022-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: storageAccountType
  }
  kind: 'Storage'
  properties: {
    supportsHttpsTrafficOnly: true
    defaultToOAuthAuthentication: true
  }
}

// Azure Functions that hosts your function code
resource functionApp 'Microsoft.Web/sites@2021-02-01' = {
  name: functionAppName
  kind: 'functionapp'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  dependsOn: [
    logAnalytics
  ]
  properties: {
    serverFarmId: appServicePlan.id
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
          value: '0' // Run Azure Functions from a package file
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~22' // Set NodeJS version to 22.x
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: appInsights.properties.InstrumentationKey
        }
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'AZURE_CLIENT_ID'
          value: clientId
        }
        {
          name: 'AZURE_TENANT_ID'
          value: tenantId
        }
        {
          name: 'AZURE_CLIENT_SECRET'
          value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=${keyVault::storageNameSecret.name})'
        }
        {
          name: 'CONNECTOR_ID'
          value: connectorId
        }
        {
          name: 'CONNECTOR_NAME'
          value: connectorName
        }
        {
          name: 'CONNECTOR_DESCRIPTION'
          value: connectorDescription
        }
        {
          name: 'CONNECTOR_REPOS'
          value: connectorRepos
        }
        {
          name: 'CONNECTOR_ACCESS_TOKEN'
          value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=${keyVault::connectorReposAccessTokenSecret.name})'
        }
        {
          name: 'TEAMSFX_ENV'
          value: teamsfxEnv
        }
        {
          name: 'AZURE_TOKEN_CREDENTIALS'
          value: 'prod'
        }
      ]
      ftpsState: 'FtpsOnly'
      cors: {
        allowedOrigins: [
          'https://portal.azure.com'
        ]
      }
    }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'string'
  tags: {
    displayName: 'AppInsight'
    ProjectName: functionAppName
  }
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

resource appServiceSiteExtension 'Microsoft.Web/sites/siteextensions@2020-06-01' = {
  parent: functionApp
  name: 'Microsoft.ApplicationInsights.AzureWebSites'
  dependsOn: [
    appInsights
  ]
}

resource appServiceAppSettings 'Microsoft.Web/sites/config@2020-06-01' = {
  parent: functionApp
  name: 'logs'
  properties: {
    applicationLogs: {
      fileSystem: {
        level: 'Warning'
      }
    }
    httpLogs: {
      fileSystem: {
        retentionInMb: 40
        enabled: true
      }
    }
    failedRequestsTracing: {
      enabled: true
    }
    detailedErrorMessages: {
      enabled: true
    }
  }
  dependsOn: [
    appServiceSiteExtension
  ]
}

resource keyVault 'Microsoft.KeyVault/vaults@2021-06-01-preview' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enabledForDeployment: false
    enabledForDiskEncryption: true
    enabledForTemplateDeployment: false
  }

  resource storageNameSecret 'secrets' = {
    name: 'AzureClientSecret'
    properties: {
      contentType: 'text/plain'
      value: clientSecret
    }
  }

  resource connectorReposAccessTokenSecret 'secrets' = {
    name: 'ConnectorReposAccessToken'
    properties: {
      contentType: 'text/plain'
      value: connectorReposAccessToken
    }
  }

}

resource keyVaultFunctionAppPermissions 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = {
  name: guid(keyVault.id, functionApp.name, keyVaultSecretsUserRole)
  scope: keyVault
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: keyVaultSecretsUserRole
  }
}

output AZURE_FUNCTION_RESOURCE_ID string = functionApp.id
