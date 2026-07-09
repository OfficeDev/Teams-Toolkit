{
  "$schema": "https://schema.management.azure.com/schemas/2015-01-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "resourceBaseName": {
      "value": "bot${{RESOURCE_SUFFIX}}"
    },
    "webAppSKU": {
      "value": "B1"
    },
    "botDisplayName": {
      "value": "{{appName}}"
    },
    "AOAI_ENDPOINT": {
      "value": "${{AZURE_OPENAI_ENDPOINT}}"
    },
    "AOAI_API_KEY": {
      "value": "${{SECRET_AZURE_OPENAI_API_KEY}}"
    },
    "AOAI_MODEL": {
      "value": "${{AZURE_OPENAI_DEPLOYMENT_NAME}}"
    },
    "sqlAdminPassword": {
      "value": "${{SQL_ADMIN_PASSWORD}}"
    }
  }
}