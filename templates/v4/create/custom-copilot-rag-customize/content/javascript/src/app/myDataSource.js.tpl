const path = require("path");
const fs = require("fs");

class MyDataSource {
    /**
     * Creates a new instance of the StandaloneDataSource.
     * @param {string} name The name identifier for this data source
     */
    constructor(name) {
        /**
         * Name of the data source.
         */
        this.name = name;

        /**
         * Local data loaded from files.
         * @private
         */
        this._data = [];
    }

    /**
     * Initializes the data source by loading files from the data directory.
     */
    init() {
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

    search(query) {
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
     * @param {string} query The original search query
     * @returns {{content: string, sources: string[]}} Rendered context with metadata
     */
    renderContext(query) {
        const searchResults = this.search(query);
        
        if (searchResults.length === 0) {
            return {
                content: "",
                sources: []
            };
        }

        let contextContent = "";
        const sources = [];

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
     * @returns {Array<{content: string, citation: string}>} Array of all loaded documents
     */
    getAllDocuments() {
        return [...this._data];
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
}

module.exports = { MyDataSource };