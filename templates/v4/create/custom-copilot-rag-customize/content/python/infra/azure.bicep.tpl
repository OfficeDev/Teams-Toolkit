@maxLength(20)
@minLength(4)
@description('Used to generate names for all resources in this file')
param resourceBaseName string

{{#useAzureOpenAI}}
@secure()
@description('Required in your bot project to access Azure OpenAI service. You can get it from Azure Portal > OpenAI > Keys > Key1 > Resource Management > Endpoint')  
param azureOpenaiKey string
param azureOpenaiModelDeploymentName string
param azureOpenaiEndpoint string
{{/useAzureOpenAI}}
{{#useOpenAI}}
@secure()
@description('Required in your bot project to access OpenAI service. You can get it from OpenAI > API > API Key')
param openaiKey string
{{/useOpenAI}}

param webAppSKU string
param linuxFxVersion string

@maxLength(42)
param botDisplayName string

param serverfarmsName string = resourceBaseName
param webAppName string = resourceBaseName
param identityName string = resourceBaseName
param location string = resourceGroup().location
param pythonVersion string = linuxFxVersion

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  location: location
  name: identityName
}

// Compute resources for your Web App
resource serverfarm 'Microsoft.Web/serverfarms@2021-02-01' = {
  kind: 'app,linux'
  location: location
  name: serverfarmsName
  sku: {
    name: webAppSKU
  }
  properties:{
    reserved: true
  }
}

// Web App that hosts your agent
resource webApp 'Microsoft.Web/sites@2021-02-01' = {
  kind: 'app,linux'
  location: location
  name: webAppName
  properties: {
    serverFarmId: serverfarm.id
    siteConfig: {
      alwaysOn: true
      appCommandLine: 'python app.py'
      linuxFxVersion: pythonVersion
      appSettings: [
        {
          name: 'WEBSITES_CONTAINER_START_TIME_LIMIT'
          value: '900'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'CLIENT_ID'
          value: identity.properties.clientId
        }
        {{#useAzureOpenAI}}
        {
          name: 'AZURE_OPENAI_API_KEY'
          value: azureOpenaiKey
        }
        {
          name: 'AZURE_OPENAI_DEPLOYMENT_NAME'
          value: azureOpenaiModelDeploymentName
        }
        {
          name: 'AZURE_OPENAI_ENDPOINT'
          value: azureOpenaiEndpoint
        }
        {{/useAzureOpenAI}}
        {{#useOpenAI}}
        {
          name: 'OPENAI_API_KEY'
          value: openaiKey
        }
        {{/useOpenAI}}
        {
          name: 'TENANT_ID'
          value: identity.properties.tenantId
        }
        { 
          name: 'BOT_TYPE'
          value: 'UserAssignedMsi' 
        }
      ]
      ftpsState: 'FtpsOnly'
    }
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
}

// Register your web service as a bot with the Bot Framework
module azureBotRegistration './botRegistration/azurebot.bicep' = {
  name: 'Azure-Bot-registration'
  params: {
    resourceBaseName: resourceBaseName
    identityClientId: identity.properties.clientId
    identityResourceId: identity.id
    identityTenantId: identity.properties.tenantId
    botAppDomain: webApp.properties.defaultHostName
    botDisplayName: botDisplayName
  }
}

// The output will be persisted in .env.{envName}. Visit https://aka.ms/teamsfx-actions/arm-deploy for more details.
output BOT_AZURE_APP_SERVICE_RESOURCE_ID string = webApp.id
output BOT_DOMAIN string = webApp.properties.defaultHostName
output BOT_ID string = identity.properties.clientId
output BOT_TENANT_ID string = identity.properties.tenantId