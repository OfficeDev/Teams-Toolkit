import asyncio
import os

from azure.identity import ManagedIdentityCredential
from microsoft_teams.ai import ChatPrompt, ListMemory
from microsoft_teams.ai.ai_model import AIModel
from microsoft_teams.apps import App, ActivityContext
from microsoft_teams.openai import OpenAICompletionsAIModel
from microsoft_teams.api import MessageActivity, MessageActivityInput, MessageSubmitActionInvokeActivity

from config import Config

config = Config()

# Load instructions from file
def load_instructions() -> str:
    """Load instructions from instructions.txt file"""
    try:
        with open(os.path.join(os.path.dirname(__file__), "instructions.txt"), "r", encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        return "You are a helpful assistant."

INSTRUCTIONS = load_instructions()

def create_token_factory():
    def get_token(scopes, tenant_id=None):
        credential = ManagedIdentityCredential(client_id=config.APP_ID)
        if isinstance(scopes, str):
            scopes_list = [scopes]
        else:
            scopes_list = scopes
        token = credential.get_token(*scopes_list)
        return token.token
    return get_token

app = App(
    token=create_token_factory() if config.APP_TYPE == "UserAssignedMsi" else None,
    skip_auth=not config.APP_ID,
)

{{#useAzureOpenAI}}
model = OpenAICompletionsAIModel(
    key=config.AZURE_OPENAI_API_KEY,
    model=config.AZURE_OPENAI_DEPLOYMENT_NAME,
    azure_endpoint=config.AZURE_OPENAI_ENDPOINT,
    api_version="2024-10-21"
)
{{/useAzureOpenAI}}  
 
{{#useOpenAI}}
model = OpenAICompletionsAIModel(
    key=config.OPENAI_API_KEY,
    model=config.OPENAI_MODEL_NAME
)
{{/useOpenAI}}

conversation_store: dict[str, ListMemory] = {}

def get_or_create_conversation_memory(conversation_id: str) -> ListMemory:
    """Get or create conversation memory for a specific conversation"""
    if conversation_id not in conversation_store:
        conversation_store[conversation_id] = ListMemory()
    return conversation_store[conversation_id]

async def handle_stateful_conversation(model: AIModel, ctx: ActivityContext[MessageActivity]) -> None:
    """Example of stateful conversation handler that maintains conversation history"""
    # Retrieve existing conversation memory or initialize new one
    memory = get_or_create_conversation_memory(ctx.activity.conversation.id)

    # Get existing messages for logging
    existing_messages = await memory.get_all()
    print(f"Existing messages before sending to prompt: {len(existing_messages)} messages")

    # Create ChatPrompt with conversation-specific memory
    chat_prompt = ChatPrompt(model)

    try:
        chat_result = await chat_prompt.send(
            input=ctx.activity.text,
            memory=memory,
            instructions=INSTRUCTIONS,
            on_chunk=lambda chunk: ctx.stream.emit(chunk)
        )
    except Exception as e:
        print(f"Error sending chat prompt: {e}")
        await ctx.send(MessageActivityInput(text="An error occurred while processing your request."))
        return

    if ctx.activity.conversation.is_group:
        # If the conversation is a group chat, we need to send the final response
        # back to the group chat
        await ctx.send(MessageActivityInput(text=chat_result.response.content).add_ai_generated().add_feedback())
    else:
        ctx.stream.emit(MessageActivityInput().add_ai_generated().add_feedback())

@app.on_message
async def handle_message(ctx: ActivityContext[MessageActivity]):
    """Handle messages using stateful conversation"""
    await handle_stateful_conversation(model, ctx)

@app.on_message_submit_feedback
async def handle_message_feedback(ctx: ActivityContext[MessageSubmitActionInvokeActivity]):
    """Handle feedback submission events"""
    activity = ctx.activity

    print(f"your feedback is {activity.value.action_value}")

if __name__ == "__main__":
    asyncio.run(app.start())
