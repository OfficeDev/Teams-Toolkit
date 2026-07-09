{
  "$schema": "https://schema.management.azure.com/schemas/2015-01-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "resourceBaseName": {
      "value": "bot${{RESOURCE_SUFFIX}}"
    },
    {{#useAzureOpenAI}}
    "azureOpenaiKey": {
      "value": "${{SECRET_AZURE_OPENAI_API_KEY}}"
    },
    "azureOpenaiModelDeploymentName" : {
      "value": "${{AZURE_OPENAI_DEPLOYMENT_NAME}}"
    },
    "azureOpenaiEndpoint" : {
      "value": "${{AZURE_OPENAI_ENDPOINT}}"
    },
    "azureOpenaiEmbeddingDeployment" : {
      "value": "${{AZURE_OPENAI_EMBEDDING_DEPLOYMENT}}"
    },
    {{/useAzureOpenAI}}
    {{#useOpenAI}}
    "openaiKey": {
      "value": "${{SECRET_OPENAI_API_KEY}}"
    },
    {{/useOpenAI}}
    "azureSearchKey": {
      "value": "${{SECRET_AZURE_SEARCH_KEY}}"
    },
    "azureSearchEndpoint": {
      "value": "${{AZURE_SEARCH_ENDPOINT}}"
    },
    "webAppSKU": {
      "value": "B3"
    },
    "botDisplayName": {
      "value": "{{appName}}"
    },
    "linuxFxVersion": {
      "value": "PYTHON|3.12"
    }
  }
}