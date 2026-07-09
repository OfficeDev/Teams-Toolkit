import json
import os
import sys
import traceback
from dotenv import load_dotenv

from microsoft_agents.hosting.core import (
    AgentApplication,
    TurnState,
    TurnContext,
    MemoryStorage,
)
from microsoft_agents.activity import (
    load_configuration_from_env,
    ActivityTypes,
)
from microsoft_agents.hosting.aiohttp import CloudAdapter
from microsoft_agents.authentication.msal import MsalConnectionManager
{{#useOpenAI}}
from openai import OpenAI
{{/useOpenAI}}
{{#useAzureOpenAI}}
from openai import AzureOpenAI
{{/useAzureOpenAI}}

from config import Config

load_dotenv()

# Load configuration
config = Config(os.environ)
agents_sdk_config = load_configuration_from_env(os.environ)

{{#useOpenAI}}
client = OpenAI(
    api_key=config.openai_api_key,
)
{{/useOpenAI}}
{{#useAzureOpenAI}}
client = AzureOpenAI(
    api_version="2024-12-01-preview",
    api_key=config.azure_openai_api_key,
    azure_endpoint=config.azure_openai_endpoint,
    azure_deployment=config.azure_openai_deployment_name,
)
{{/useAzureOpenAI}}

system_prompt = "You are an AI agent that can chat with users."


def is_supports_files_enabled():
    candidates = [
        os.path.join(os.getcwd(), "appPackage", "manifest.json"),
        os.path.join(os.path.dirname(__file__), "..", "appPackage", "manifest.json"),
        os.path.join(os.path.dirname(__file__), "..", "..", "appPackage", "manifest.json"),
    ]
    for manifest_path in candidates:
        if os.path.exists(manifest_path):
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    manifest = json.load(f)
                bots = manifest.get("bots", [])
                if isinstance(bots, list):
                    return any(bot.get("supportsFiles") is True for bot in bots)
            except (json.JSONDecodeError, OSError):
                continue
    return False


# Define storage and application
storage = MemoryStorage()
connection_manager = MsalConnectionManager(**agents_sdk_config)
adapter = CloudAdapter(connection_manager=connection_manager)

agent_app = AgentApplication[TurnState](
    storage=storage,
    adapter=adapter,
    **agents_sdk_config
)

_supports_files_warning = (
    '⚠️ Notice: The "supportsFiles" option is currently enabled in the app manifest, '
    "but file attachment handling is not a supported feature for Custom Engine Agents at this time. "
    "Please refer to the known issues documentation for more details: "
    "https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/known-issues#custom-engine-agents"
    if is_supports_files_enabled()
    else ""
)
_supports_files_warned = False


@agent_app.conversation_update("membersAdded")
async def on_members_added(context: TurnContext, _state: TurnState):
    global _supports_files_warned
    await context.send_activity("Hi there! I'm an agent to chat with you.")
    if _supports_files_warning and not _supports_files_warned:
        _supports_files_warned = True
        await context.send_activity(_supports_files_warning)


# Listen for ANY message to be received. MUST BE AFTER ANY OTHER MESSAGE HANDLERS
@agent_app.activity(ActivityTypes.message)
async def on_message(context: TurnContext, _state: TurnState):
    global _supports_files_warned
    if _supports_files_warning and not _supports_files_warned:
        _supports_files_warned = True
        await context.send_activity(_supports_files_warning)
    # Echo back users request
    result = client.chat.completions.create(
        messages=[
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": context.activity.text,
            },
        ],
        {{#useOpenAI}}
        model=config.openai_model_name
        {{/useOpenAI}}
        {{#useAzureOpenAI}}
        model="",
        {{/useAzureOpenAI}}
    )
    
    answer = ""
    for choice in result.choices:
        answer += choice.message.content or ""
    
    await context.send_activity(answer)

@agent_app.error
async def on_error(context: TurnContext, error: Exception):
    # This check writes out errors to console log .vs. app insights.
    # NOTE: In production environment, you should consider logging this to Azure
    #       application insights.
    print(f"\n [on_turn_error] unhandled error: {error}", file=sys.stderr)
    traceback.print_exc()

    # Send a message to the user
    await context.send_activity("The agent encountered an error or bug.")
