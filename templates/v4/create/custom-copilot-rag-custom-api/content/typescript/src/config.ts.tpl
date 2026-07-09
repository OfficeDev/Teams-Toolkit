const config = {
  MicrosoftAppId: process.env.CLIENT_ID,
  MicrosoftAppType: process.env.BOT_TYPE,
  MicrosoftAppTenantId: process.env.TENANT_ID,
  MicrosoftAppPassword: process.env.CLIENT_SECRET,
  {{#useOpenAI}}
  openAIKey: process.env.OPENAI_API_KEY,
  {{/useOpenAI}}
  {{#useAzureOpenAI}}
  azureOpenAIKey: process.env.AZURE_OPENAI_API_KEY,
  azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
  azureOpenAIDeployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
  {{/useAzureOpenAI}}
};

export default config;
