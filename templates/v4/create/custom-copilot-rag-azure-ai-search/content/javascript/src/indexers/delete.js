const { AzureKeyCredential, SearchIndexClient } = require("@azure/search-documents");
const { deleteIndex } = require("./utils");

const index = "my-documents";
const searchApiKey = process.argv[2];
if (!searchApiKey) {
  throw new Error("Missing input Azure AI Search Key");
}
const searchApiEndpoint = process.env.AZURE_SEARCH_ENDPOINT;
const credentials = new AzureKeyCredential(searchApiKey);

const searchIndexClient = new SearchIndexClient(searchApiEndpoint, credentials);
deleteIndex(searchIndexClient, index);
