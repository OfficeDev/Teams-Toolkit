import json
import os
import sys
import traceback
from typing import Dict, Any
from dotenv import load_dotenv

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent
{{#useOpenAI}}
from langchain_openai import ChatOpenAI
{{/useOpenAI}}
{{#useAzureOpenAI}}
from langchain_openai import AzureChatOpenAI
{{/useAzureOpenAI}}

from microsoft_agents.hosting.core import (
    AgentApplication,
    TurnState,
    TurnContext,
    MemoryStorage,
    MessageFactory,
)
from microsoft_agents.activity import (
    load_configuration_from_env,
    ActivityTypes,
)
from microsoft_agents.hosting.aiohttp import CloudAdapter
from microsoft_agents.authentication.msal import MsalConnectionManager

from config import Config
from tools.date_time_tool import get_date
from tools.get_weather_tool import get_weather

load_dotenv()

# Load configuration
config = Config(os.environ)
agents_sdk_config = load_configuration_from_env(os.environ)

# Define storage and application
storage = MemoryStorage()
connection_manager = MsalConnectionManager(**agents_sdk_config)
adapter = CloudAdapter(connection_manager=connection_manager)

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


weather_agent = AgentApplication[TurnState](
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


@weather_agent.conversation_update("membersAdded")
async def on_members_added(context: TurnContext, _state: TurnState):
    global _supports_files_warned
    await context.send_activity(
        "Hello and Welcome! I'm here to help with all your weather forecast needs!"
    )
    if _supports_files_warning and not _supports_files_warned:
        _supports_files_warned = True
        await context.send_activity(_supports_files_warning)

class WeatherForecastAgentResponse:
    def __init__(self, content_type: str, content: Any):
        self.content_type = content_type
        self.content = content

{{#useOpenAI}}
agent_model = ChatOpenAI(
    api_key=config.openai_api_key,
    model=config.openai_model_name,
    temperature=0,
)
{{/useOpenAI}}
{{#useAzureOpenAI}}
agent_model = AzureChatOpenAI(
    azure_openai_api_version="2024-12-01-preview",
    azure_openai_api_key=config.azure_openai_api_key,
    azure_openai_endpoint=config.azure_openai_endpoint,
    azure_openai_deployment=config.azure_openai_deployment_name,
    temperature=0,
)
{{/useAzureOpenAI}}

agent_tools = [get_weather, get_date]
agent_checkpointer = MemorySaver()
agent = create_react_agent(
    llm=agent_model,
    tools=agent_tools,
    checkpointer=agent_checkpointer,
)

sys_message = SystemMessage(
    content="""
You are a friendly assistant that helps people find a weather forecast for a given time and place.
You may ask follow up questions until you have enough information to answer the customers question,
but once you have a forecast forecast, make sure to format it nicely using an adaptive card.

Respond in JSON format with the following JSON schema, and do not use markdown in the response:

{
    "contentType": "'Text' or 'AdaptiveCard' only",
    "content": "{The content of the response, may be plain text, or JSON based adaptive card}"
}"""
)

@weather_agent.activity(ActivityTypes.Message)
async def on_message(context: TurnContext, state: TurnState):
    global _supports_files_warned
    if _supports_files_warning and not _supports_files_warned:
        _supports_files_warned = True
        await context.send_activity(_supports_files_warning)
    llm_response = await agent.ainvoke(
        {
            "messages": [sys_message, HumanMessage(content=context.activity.text)],
        },
        {
            "configurable": {"thread_id": context.activity.conversation.id},
        }
    )

    # Parse the LLM response
    try:
        import json
        llm_response_content = json.loads(
            llm_response["messages"][-1].content
        )
        
        if llm_response_content["contentType"] == "Text":
            await context.send_activity(llm_response_content["content"])
        elif llm_response_content["contentType"] == "AdaptiveCard":
            response = MessageFactory.attachment({
                "contentType": "application/vnd.microsoft.card.adaptive",
                "content": llm_response_content["content"],
            })
            await context.send_activity(response)
    except (json.JSONDecodeError, KeyError) as e:
        # If parsing fails, send the raw response
        await context.send_activity(llm_response["messages"][-1].content)

@weather_agent.error
async def on_error(context: TurnContext, error: Exception):
    # This check writes out errors to console log .vs. app insights.
    # NOTE: In production environment, you should consider logging this to Azure
    #       application insights.
    print(f"\n [on_turn_error] unhandled error: {error}", file=sys.stderr)
    traceback.print_exc()

    # Send a message to the user
    await context.send_activity("The agent encountered an error or bug.")
