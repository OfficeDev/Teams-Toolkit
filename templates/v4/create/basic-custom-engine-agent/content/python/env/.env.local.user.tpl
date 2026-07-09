# This file includes environment variables that will not be committed to git by default. You can set these environment variables in your CI/CD system for your project.

# If you're adding a secret value, add SECRET_ prefix to the name so Microsoft 365 Agents Toolkit can handle them properly
# Secrets. Keys prefixed with `SECRET_` will be masked in Microsoft 365 Agents Toolkit logs.
SECRET_BOT_PASSWORD=
CONNECTIONS__SERVICE_CONNECTION__SETTINGS__CLIENTSECRET=
{{#useOpenAI}}
SECRET_OPENAI_API_KEY={{{openAIKey}}}
{{/useOpenAI}}
{{#useAzureOpenAI}}
SECRET_AZURE_OPENAI_API_KEY={{{azureOpenAIKey}}}
AZURE_OPENAI_ENDPOINT='{{{azureOpenAIEndpoint}}}'
AZURE_OPENAI_DEPLOYMENT_NAME='{{{azureOpenAIDeploymentName}}}'
{{/useAzureOpenAI}}