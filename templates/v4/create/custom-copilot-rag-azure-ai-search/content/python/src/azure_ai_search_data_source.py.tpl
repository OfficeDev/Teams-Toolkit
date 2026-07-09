from dataclasses import dataclass
from typing import Optional, List
from azure.search.documents.models import VectorizedQuery
{{#useAzureOpenAI}}
from openai import AsyncAzureOpenAI
{{/useAzureOpenAI}}
{{#useOpenAI}}
from openai import AsyncOpenAI
{{/useOpenAI}}

from config import Config

async def get_embedding_vector(text: str):
    {{#useAzureOpenAI}}
    client = AsyncAzureOpenAI(
        api_key=Config.AZURE_OPENAI_API_KEY,
        azure_endpoint=Config.AZURE_OPENAI_ENDPOINT,
        api_version="2024-10-21"
    )
    result = await client.embeddings.create(
        model=Config.AZURE_OPENAI_EMBEDDING_DEPLOYMENT, 
        input=text
    )
    {{/useAzureOpenAI}}
    {{#useOpenAI}}
    client = AsyncOpenAI(api_key=Config.OPENAI_API_KEY)
    result = await client.embeddings.create(
        model=Config.OPENAI_EMBEDDING_DEPLOYMENT, 
        input=text
    )
    {{/useOpenAI}}
    
    if not result.data:
        raise Exception(f"Failed to generate embeddings for description: {text}")
    return result.data[0].embedding

@dataclass
class Doc:
    docId: Optional[str] = None
    docTitle: Optional[str] = None
    description: Optional[str] = None
    descriptionVector: Optional[List[float]] = None

@dataclass
class AzureAISearchDataSourceOptions:
    name: str
    indexName: str
    azureAISearchApiKey: str
    azureAISearchEndpoint: str

from azure.core.credentials import AzureKeyCredential
from azure.search.documents import SearchClient
import json

@dataclass
class Result:
    def __init__(self, output):
        self.output = output

class AzureAISearchDataSource():
    def __init__(self, options: AzureAISearchDataSourceOptions):
        self.name = options.name
        self.options = options
        self.searchClient = SearchClient(
            options.azureAISearchEndpoint,
            options.indexName,
            AzureKeyCredential(options.azureAISearchApiKey)
        )
        
    def name(self):
        return self.name

    async def render_data(self, query):
        embedding = await get_embedding_vector(query)
        vector_query = VectorizedQuery(vector=embedding, k_nearest_neighbors=2, fields="descriptionVector")

        if not query:
            return Result('')

        selectedFields = [
            'docTitle',
            'description',
            'descriptionVector',
        ]

        searchResults = self.searchClient.search(
            search_text=query,
            select=selectedFields,
            vector_queries=[vector_query],
        )

        if not searchResults:
            return Result('')


        # Convert search results to formatted text
        docs = []
        for result in searchResults:
            docs.append(f"Title: {result.get('docTitle', 'N/A')}\nDescription: {result.get('description', 'N/A')}")
        
        return Result('\n\n'.join(docs))