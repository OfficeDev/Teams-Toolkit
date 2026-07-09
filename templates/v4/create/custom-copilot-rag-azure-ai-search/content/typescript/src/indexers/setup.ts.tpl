import { AzureKeyCredential, SearchClient, SearchIndexClient } from "@azure/search-documents";
import { createIndexIfNotExists, delay, upsertDocuments, getEmbeddingVector } from "./utils";
import { MyDocument } from "../app/azureAISearchDataSource";
import path from "path";
import * as fs from "fs";

const searchApiKey = process.argv[2];
if (!searchApiKey) {
  throw new Error("Missing input Azure AI Search Key");
}
{{#useOpenAI}}
const openAIKey = process.argv[3];
if (!openAIKey) {
  throw new Error("Missing input OpenAI Key");
}
process.env.SECRET_OPENAI_API_KEY = openAIKey;
{{/useOpenAI}}
{{#useAzureOpenAI}}
const azureOpenAIKey = process.argv[3];
if (!azureOpenAIKey) {
  throw new Error("Missing input Azure OpenAI Key");
}
process.env.SECRET_AZURE_OPENAI_API_KEY = azureOpenAIKey;
{{/useAzureOpenAI}}

/**
 *  Main function that creates the index and upserts the documents.
 */
export async function main() {
    const index = "my-documents";

    {{#useOpenAI}}
    if (!process.env.AZURE_SEARCH_ENDPOINT) {
    {{/useOpenAI}}
    {{#useAzureOpenAI}}
    if (
        !process.env.AZURE_SEARCH_ENDPOINT ||
        !process.env.AZURE_OPENAI_ENDPOINT ||
        !process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME
    ) {
    {{/useAzureOpenAI}}
        {{#useOpenAI}}
        throw new Error(
            "Missing environment variables - please check that AZURE_SEARCH_ENDPOINT are set."
        );
        {{/useOpenAI}}
        {{#useAzureOpenAI}}
        throw new Error(
            "Missing environment variables - please check that AZURE_SEARCH_ENDPOINT, AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME are set."
        );
        {{/useAzureOpenAI}}
    }

    const searchApiEndpoint = process.env.AZURE_SEARCH_ENDPOINT!;
    const credentials = new AzureKeyCredential(searchApiKey);

    const searchIndexClient = new SearchIndexClient(searchApiEndpoint, credentials);
    createIndexIfNotExists(searchIndexClient, index);
    // Wait 5 seconds for the index to be created
    await delay(5000);

    const searchClient = new SearchClient<MyDocument>(searchApiEndpoint, index, credentials);

    const filePath = path.join(__dirname, "./data");
    const files = fs.readdirSync(filePath);
    const data: MyDocument[] = [];
    for (let i=1;i<=files.length;i++) {
        const content = fs.readFileSync(path.join(filePath, files[i-1]), "utf-8");
        data.push({
            docId: i+"",
            docTitle: files[i-1],
            description: content,
            descriptionVector: await getEmbeddingVector(content),
        });
    }
    await upsertDocuments(searchClient, data);
}

main();

