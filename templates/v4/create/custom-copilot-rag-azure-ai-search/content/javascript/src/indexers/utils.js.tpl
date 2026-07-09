/**
 * Defines the utility methods.
 */
const { KnownAnalyzerNames } = require("@azure/search-documents");
{{#useOpenAI}}
const { OpenAI } = require("openai");
const config = require("../config");
{{/useOpenAI}}
{{#useAzureOpenAI}}
const { AzureOpenAI } = require("openai");
{{/useAzureOpenAI}}

/**
 * A wrapper for setTimeout that resolves a promise after timeInMs milliseconds.
 */
function delay(timeInMs) {
    return new Promise((resolve) => setTimeout(resolve, timeInMs));
}

/**
 * Deletes the index with the given name
 */
function deleteIndex(client, name) {
    return client.deleteIndex(name);
}

/**
 * Adds or updates the given documents in the index
 */
async function upsertDocuments(client, documents) {
    return await client.mergeOrUploadDocuments(documents);
}

/**
 * Creates the index with the given name
 */
async function createIndexIfNotExists(client, name) {
    const MyDocumentIndex = {
        name,
        fields: [
            {
                type: "Edm.String",
                name: "docId",
                key: true,
                filterable: true,
                sortable: true
            },
            {
                type: "Edm.String",
                name: "docTitle",
                searchable: true,
                filterable: true,
                sortable: true
            },
            {
                type: "Edm.String",
                name: "description",
                searchable: true,
                analyzerName: KnownAnalyzerNames.EnLucene
            },
            {
                type: "Collection(Edm.Single)",
                name: "descriptionVector",
                searchable: true,
                vectorSearchDimensions: 1536,
                vectorSearchProfileName: "my-vector-config"
            },
        ],
        corsOptions: {
            // for browser tests
            allowedOrigins: ["*"]
        },
        vectorSearch: {
            algorithms: [{ name: "vector-search-algorithm", kind: "hnsw" }],
            profiles: [
                {
                    name: "my-vector-config",
                    algorithmConfigurationName: "vector-search-algorithm"
                }
            ]
        }
    };

    await client.createOrUpdateIndex(MyDocumentIndex);
}

/**
 * Generate the embedding vector
 */
async function getEmbeddingVector(text) {
    {{#useOpenAI}}
    const client = new OpenAI({
        apiKey: process.env.SECRET_OPENAI_API_KEY,
    });
    const result = await client.embeddings.create({
        input: text,
        model: config.openAIEmbeddingModelName
    });
    {{/useOpenAI}}
    {{#useAzureOpenAI}}
    const client = new AzureOpenAI({
        apiKey: process.env.SECRET_AZURE_OPENAI_API_KEY,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiVersion: "2024-02-01",
    });
    const result = await client.embeddings.create({
        input: text,
        model: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME,
    });
    {{/useAzureOpenAI}}


    if (!result.data || result.data.length === 0) {
        throw new Error(`Failed to generate embeddings for description: ${text}`);
    }

    return result.data[0].embedding;
}

module.exports = {
    delay,
    deleteIndex,
    upsertDocuments,
    createIndexIfNotExists,
    getEmbeddingVector
};