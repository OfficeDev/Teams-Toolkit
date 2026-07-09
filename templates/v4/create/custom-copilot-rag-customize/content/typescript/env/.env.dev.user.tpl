# This file includes environment variables that will not be committed to git by default. You can set these environment variables in your CI/CD system for your project.

# Secrets. Keys prefixed with `SECRET_` will be masked in Microsoft 365 Agents Toolkit logs.
{{#useOpenAI}}
SECRET_OPENAI_API_KEY={{{openAIKey}}}
{{/useOpenAI}}
{{#useAzureOpenAI}}
SECRET_AZURE_OPENAI_API_KEY={{{azureOpenAIKey}}}
AZURE_OPENAI_ENDPOINT='{{{azureOpenAIEndpoint}}}'
AZURE_OPENAI_DEPLOYMENT_NAME='{{{azureOpenAIDeploymentName}}}'
{{/useAzureOpenAI}}