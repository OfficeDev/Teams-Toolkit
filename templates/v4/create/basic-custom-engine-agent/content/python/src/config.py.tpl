"""
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the MIT License.
"""

class Config:
    """Agent Configuration"""

    def __init__(self, env):
        self.PORT = 3978
        {{#useOpenAI}}
        self.openai_api_key = env["OPENAI_API_KEY"] # OpenAI API key
        self.openai_model_name = 'gpt-4o' # OpenAI model name. You can use any other model name from OpenAI.
        {{/useOpenAI}}
        {{#useAzureOpenAI}}
        self.azure_openai_api_key = env["AZURE_OPENAI_API_KEY"] # Azure OpenAI API key
        self.azure_openai_deployment_name = env["AZURE_OPENAI_DEPLOYMENT_NAME"] # Azure OpenAI model deployment name
        self.azure_openai_endpoint = env["AZURE_OPENAI_ENDPOINT"] # Azure OpenAI endpoint
        {{/useAzureOpenAI}}
