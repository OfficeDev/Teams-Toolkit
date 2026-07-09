import { AzureKeyCredential, SearchClient } from "@azure/search-documents";
{{#useOpenAI}}
import { OpenAI } from "openai";
{{/useOpenAI}}
{{#useAzureOpenAI}}
import { AzureOpenAI } from "openai";
{{/useAzureOpenAI}}

/**
 * Defines the Document Interface.
 */
export interface MyDocument {
    docId?: string;
    docTitle?: string | null;
    description?: string | null;
    descriptionVector?: number[] | null;
}

/**
 * Options for creating a `AzureAISearchDataSource`.
 */
export interface AzureAISearchDataSourceOptions {
    /**
     * Name of the data source. This is the name that will be used to reference the data source in the prompt template.
     */
    name: string;

    /**
     * Name of the Azure AI Search index.
     */
    indexName: string;

    {{#useOpenAI}}
    /**
     * OpenAI API key.
     */
    apiKey: string;
    /**
     * OpenAI model to use for generating embeddings.
     */
    openAIEmbeddingModelName: string;
    {{/useOpenAI}}
    {{#useAzureOpenAI}}
    /**
     * Azure OpenAI API key.
     */
    azureOpenAIApiKey: string;

    /**
     * Azure OpenAI endpoint. This is used to generate embeddings for the user's input.
     */
    azureOpenAIEndpoint: string;

    /**
     * Azure OpenAI Embedding deployment. This is used to generate embeddings for the user's input.
     */
    azureOpenAIEmbeddingDeploymentName: string;
    {{/useAzureOpenAI}}

    /**
     * Azure AI Search API key.
     */
    azureAISearchApiKey: string;

    /**
     * Azure AI Search endpoint.
     */
    azureAISearchEndpoint: string;
}

/**
 * A data source that searches through Azure AI search.
 */
export class AzureAISearchDataSource {
    /**
     * Name of the data source.
     */
    public readonly name: string;

    /**
     * Options for creating the data source.
     */
    private readonly options: AzureAISearchDataSourceOptions;

    /**
     * Azure AI Search client.
     */
    private readonly searchClient: SearchClient<MyDocument>;

    /**
     * Creates a new `AzureAISearchDataSource` instance.
     * @param {AzureAISearchDataSourceOptions} options Options for creating the data source.
     */
    public constructor(options: AzureAISearchDataSourceOptions) {
        this.name = options.name;
        this.options = options;
        this.searchClient = new SearchClient<MyDocument>(
            options.azureAISearchEndpoint,
            options.indexName,
            new AzureKeyCredential(options.azureAISearchApiKey),
            {}
        );
    }

    /**
     * Renders search results into a formatted context string for use in prompts.
     * @param query The original search query
     * @returns Rendered context
     */
    public async renderContext(query: string): Promise<string> {
        if(!query) {
            return "";
        }
        
        const selectedFields = [
            "docId",
            "docTitle",
            "description",
        ];

        // hybrid search
        const queryVector: number[] = await this.getEmbeddingVector(query);
        const searchResults = await this.searchClient.search(query, {
            searchFields: ["docTitle", "description"],
            select: selectedFields as any,
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
            const formattedResult = this.formatDocument(result.document.description,result.document.docTitle);
            doc += formattedResult;
        }


        return doc
    }

    /**
     * Formats a document with its citation for inclusion in context.
     * @param content The document content
     * @param citation The source citation
     * @returns Formatted document string
     * @private
     */
    private formatDocument(content: string, citation: string): string {
        return `<context source="${citation}">\n${content}\n</context>`;
    }
    /**
     * Generate embeddings for the user's input.
     * @param {string} text - The user's input.
     * @returns {Promise<number[]>} The embedding vector for the user's input.
     */
    private async getEmbeddingVector(text: string): Promise<number[]> {
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