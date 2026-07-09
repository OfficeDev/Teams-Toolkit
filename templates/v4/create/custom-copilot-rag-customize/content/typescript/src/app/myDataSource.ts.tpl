import * as path from "path";
import * as fs from "fs";

/**
 * Interface for search results containing both content and metadata
 */
export interface SearchResult {
    content: string;
    citation: string;
}

/**
 * Interface for rendered context data
 */
export interface RenderedContext {
    content: string;
    sources: string[];
}

export class MyDataSource {
    /**
     * Name of the data source.
     */
    public readonly name: string;

    /**
     * Local data loaded from files.
     */
    private _data: { content: string; citation: string; }[] = [];

    /**
     * Creates a new instance of the StandaloneDataSource.
     * @param name The name identifier for this data source
     */
    public constructor(name: string) {
        this.name = name;
    }

    /**
     * Initializes the data source by loading files from the data directory.
     */
    public init(): void {
        const filePath = path.join(__dirname, "../data");
        
        if (!fs.existsSync(filePath)) {
            console.warn(`Data directory not found: ${filePath}`);
            return;
        }

        const files = fs.readdirSync(filePath);
        
        this._data = files.map(file => {
            try {
                const content = fs.readFileSync(path.join(filePath, file), "utf-8");
                return {
                    content: content.trim(),
                    citation: file
                };
            } catch (error) {
                console.error(`Error reading file ${file}:`, error);
                return {
                    content: "",
                    citation: file
                };
            }
        }).filter(item => item.content.length > 0);

        console.log(`Loaded ${this._data.length} documents from ${filePath}`);
    }

    /**
     * Searches for relevant content based on a query string.
     * @param query The search query
     * @returns Array of search results
     */
    public search(query: string): SearchResult[] {
        if (!query) {
            return [];
        }

        // First, try exact matches
        for (let data of this._data) {
            if (data.content.toLowerCase().includes(query.toLowerCase())) {
                return [{
                    content: data.content,
                    citation: data.citation
                }];
            }
        }

        // Keyword-based matching
        if (query.toLowerCase().includes("perksplus")) {
            if (this._data[0]) {
                return [{
                    content: this._data[0].content,
                    citation: this._data[0].citation
                }];
            }
        } else if (query.toLowerCase().includes("company") || query.toLowerCase().includes("history")) {
            if (this._data[1]) {
                return [{
                    content: this._data[1].content,
                    citation: this._data[1].citation
                }];
            }
        } else if (query.toLowerCase().includes("northwind") || query.toLowerCase().includes("health") || query.toLowerCase().includes("plan")) {
            if (this._data[2]) {
                return [{
                    content: this._data[2].content,
                    citation: this._data[2].citation
                }];
            }
        }

        return [];
    }
    /**
     * Renders search results into a formatted context string for use in prompts.
     * @param query The original search query
     * @returns Rendered context with metadata
     */
    public renderContext(query: string): RenderedContext {
        const searchResults = this.search(query);
        
        if (searchResults.length === 0) {
            return {
                content: "",
                sources: []
            };
        }

        let contextContent = "";
        const sources: string[] = [];

        for (const result of searchResults) {
            const formattedDoc = this.formatDocument(result.content, result.citation);
            contextContent += formattedDoc + "\n\n";
            sources.push(result.citation);
        }

        return {
            content: contextContent.trim(),
            sources
        };
    }

    /**
     * Get all available documents for browsing or debugging.
     * @returns Array of all loaded documents
     */
    public getAllDocuments(): { content: string; citation: string; }[] {
        return [...this._data];
    }

    /**
     * Formats a document with its citation for inclusion in context.
     * @param content The document content
     * @param citation The source citation
     * @returns Formatted document string
     */
    private formatDocument(content: string, citation: string): string {
        return `<context source="${citation}">\n${content}\n</context>`;
    }
}