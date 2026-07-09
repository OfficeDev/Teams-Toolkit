const config = {
  MicrosoftAppId: process.env.CLIENT_ID,
  MicrosoftAppType: process.env.BOT_TYPE,
  MicrosoftAppTenantId: process.env.TENANT_ID,
  MicrosoftAppPassword: process.env.CLIENT_SECRET,
  {{#useOpenAI}}
  openAIKey: process.env.OPENAI_API_KEY,
  openAIModelName: "gpt-3.5-turbo",
  openAIEmbeddingModelName: "text-embedding-ada-002",
  {{/useOpenAI}}
  {{#useAzureOpenAI}}
  azureOpenAIKey: process.env.AZURE_OPENAI_API_KEY,
  azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
  azureOpenAIDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
  azureOpenAIEmbeddingDeploymentName: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME,
  {{/useAzureOpenAI}}
  azureSearchKey: process.env.AZURE_SEARCH_KEY,
  azureSearchEndpoint: process.env.AZURE_SEARCH_ENDPOINT,
};

export default config;
