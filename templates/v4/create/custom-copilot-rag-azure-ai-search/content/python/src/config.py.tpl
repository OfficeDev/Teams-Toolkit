"""
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the MIT License.
"""

import os

from dotenv import load_dotenv

load_dotenv()

class Config:
    """Bot Configuration"""

    PORT = 3978
    APP_ID = os.environ.get("CLIENT_ID", "")
    APP_PASSWORD = os.environ.get("CLIENT_SECRET", "")
    APP_TYPE = os.environ.get("BOT_TYPE", "")
    APP_TENANTID = os.environ.get("TENANT_ID", "")
    {{#useAzureOpenAI}}
    AZURE_OPENAI_API_KEY = os.environ["AZURE_OPENAI_API_KEY"] # Azure OpenAI API key
    AZURE_OPENAI_DEPLOYMENT_NAME = os.environ["AZURE_OPENAI_DEPLOYMENT_NAME"] # Azure OpenAI model deployment name
    AZURE_OPENAI_ENDPOINT = os.environ["AZURE_OPENAI_ENDPOINT"] # Azure OpenAI endpoint
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT = os.environ["AZURE_OPENAI_EMBEDDING_DEPLOYMENT"] # Azure OpenAI embedding deployment
    {{/useAzureOpenAI}}
    {{#useOpenAI}}
    OPENAI_API_KEY = os.environ["OPENAI_API_KEY"] # OpenAI API key
    OPENAI_MODEL_NAME='gpt-3.5-turbo' # OpenAI model name. You can use any other model name from OpenAI.
    OPENAI_EMBEDDING_DEPLOYMENT='text-embedding-ada-002' # OpenAI embedding model. You can use any other embedding model from OpenAI.
    {{/useOpenAI}}
    AZURE_SEARCH_KEY = os.environ["AZURE_SEARCH_KEY"] # Azure Search key
    AZURE_SEARCH_ENDPOINT = os.environ["AZURE_SEARCH_ENDPOINT"] # Azure Search endpoint
    
