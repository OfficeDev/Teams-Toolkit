import os, argparse
from azure.core.credentials import AzureKeyCredential
from azure.core.exceptions import ServiceRequestError
from azure.search.documents.indexes import SearchIndexClient

from dotenv import load_dotenv

load_dotenv(f'{os.getcwd()}/env/.env.local.user', override=True)

def load_keys_from_args():
    parser = argparse.ArgumentParser(description='Load keys from command input parameters.')
    parser.add_argument('--ai-search-key', type=str, required=True, help='AI Search key for authentication')
    args = parser.parse_args()
    return args

def delete_index(client: SearchIndexClient, name: str):
    client.delete_index(name)
    print(f"Index {name} deleted")

index = 'contoso-electronics'
args = load_keys_from_args()
search_api_key = args.ai_search_key
search_api_endpoint = os.getenv('AZURE_SEARCH_ENDPOINT')
credentials = AzureKeyCredential(search_api_key)
try:
    search_index_client = SearchIndexClient(search_api_endpoint, credentials)
    delete_index(search_index_client, index)
except ServiceRequestError as e:
    print(f"Delete index failed due to ServiceRequestError: {e.message}.\nPlease check your keys, models and endpoints in {os.getcwd()}/env/.env.local.user.")