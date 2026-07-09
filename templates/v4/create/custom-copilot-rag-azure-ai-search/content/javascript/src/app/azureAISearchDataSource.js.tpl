const { AzureKeyCredential, SearchClient } = require("@azure/search-documents");
{{#useOpenAI}}
const { OpenAI } = require("openai");
{{/useOpenAI}}
{{#useAzureOpenAI}}
const { AzureOpenAI } = require("openai");
{{/useAzureOpenAI}}

/**
 * A data source that searches through Azure AI search.
 */
class AzureAISearchDataSource {
    /**
     * Creates a new `AzureAISearchDataSource` instance.
     * @param {Object} options Options for creating the data source.
     * @param {string} options.name Name of the data source.
     * @param {string} options.indexName Name of the Azure AI Search index.
     * @param {string} options.azureAISearchApiKey Azure AI Search API key.
     * @param {string} options.azureAISearchEndpoint Azure AI Search endpoint.
     {{#useOpenAI}}
     * @param {string} options.apiKey OpenAI API key.
     * @param {string} options.openAIEmbeddingModelName OpenAI model to use for generating embeddings.
     {{/useOpenAI}}
     {{#useAzureOpenAI}}
     * @param {string} options.azureOpenAIApiKey Azure OpenAI API key.
     * @param {string} options.azureOpenAIEndpoint Azure OpenAI endpoint.
     * @param {string} options.azureOpenAIEmbeddingDeploymentName Azure OpenAI Embedding deployment.
     {{/useAzureOpenAI}}
     */
    constructor(options) {
        this.name = options.name;
        this.options = options;
        this.searchClient = new SearchClient(
            options.azureAISearchEndpoint,
            options.indexName,
            new AzureKeyCredential(options.azureAISearchApiKey),
            {}
        );
    }

    /**
     * Renders search results into a formatted context string for use in prompts.
     * @param {string} query The original search query
     * @returns {Promise<string>} Rendered context
     */
    async renderContext(query) {
        if(!query) {
            return "";
        }
        
        const selectedFields = [
            "docId",
            "docTitle",
            "description",
        ];

        // hybrid search
        const queryVector = await this.getEmbeddingVector(query);
        const searchResults = await this.searchClient.search(query, {
            searchFields: ["docTitle", "description"],
            select: selectedFields,
            vectorSearchOptions: {
                queries: [
                    {
                        kind: "vector",
                        fields: ["descriptionVector"],
                        kNearestNeighborsCount: 2,
                        // The query vector is the embedding of the user's input
                        vector: queryVector
                    }
                ]
            },
        });

        if (!searchResults.results) {
            return "";
        }

        let doc = "";
        for await (const result of searchResults.results) {
            const formattedResult = this.formatDocument(result.document.description, result.document.docTitle);
            doc += formattedResult;
        }

        return doc;
    }

    /**
     * Formats a document with its citation for inclusion in context.
     * @param {string} content The document content
     * @param {string} citation The source citation
     * @returns {string} Formatted document string
     * @private
     */
    formatDocument(content, citation) {
        return `<context source="${citation}">\n${content}\n</context>`;
    }

    /**
     * Generate embeddings for the user's input.
     * @param {string} text - The user's input.
     * @returns {Promise<number[]>} The embedding vector for the user's input.
     */
    async getEmbeddingVector(text) {
        {{#useOpenAI}}
        const client = new OpenAI({
            apiKey: this.options.apiKey
        });
        const result = await client.embeddings.create({
            input: text,
            model: this.options.openAIEmbeddingModelName,
        });
        {{/useOpenAI}}
        {{#useAzureOpenAI}}
        const client = new AzureOpenAI({
            apiKey: this.options.azureOpenAIApiKey,
            endpoint: this.options.azureOpenAIEndpoint,
            apiVersion: "2024-02-01",
        });
        const result = await client.embeddings.create({
            input: text,
            model: this.options.azureOpenAIEmbeddingDeploymentName,
        });
        {{/useAzureOpenAI}}

        if (!result.data || result.data.length === 0) {
            throw new Error(`Failed to generate embeddings for description: ${text}`);
        }

        return result.data[0].embedding;
    }
}

module.exports = { AzureAISearchDataSource };