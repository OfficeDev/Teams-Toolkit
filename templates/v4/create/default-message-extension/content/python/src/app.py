import asyncio

from azure.identity import ManagedIdentityCredential
from microsoft_teams.api import (
    MessageExtensionSubmitActionInvokeActivity,
    MessageExtensionFetchTaskInvokeActivity,
    MessageExtensionQueryInvokeActivity,
    MessageExtensionQueryLinkInvokeActivity,
    MessagingExtensionResult,
    MessagingExtensionResultType,
    AttachmentLayout,
    MessagingExtensionActionInvokeResponse,
    InvokeResponse,
    MessagingExtensionInvokeResponse,
    AdaptiveCardAttachment,
    ThumbnailCardAttachment,
    card_attachment,
    MessagingExtensionAttachment,
    CardTaskModuleTaskInfo,
    TaskModuleContinueResponse
)
from microsoft_teams.apps import ActivityContext, App

from config import Config
from card_generators import (
    create_card,
    create_conversation_members_card,
    create_dummy_cards,
    create_link_unfurl_card
)

# Initialize configuration
config = Config()


def create_token_factory():
    """Create a token factory for managed identity authentication."""
    def get_token(scopes, tenant_id=None):
        credential = ManagedIdentityCredential(client_id=config.APP_ID)
        
        if isinstance(scopes, str):
            scopes_list = [scopes]
        else:
            scopes_list = scopes
            
        token = credential.get_token(*scopes_list)
        return token.token
    
    return get_token


# Initialize the Teams app
app = App(
    token=create_token_factory() if config.APP_TYPE == "UserAssignedMsi" else None,
    skip_auth=not config.APP_ID,
)


@app.on_message_ext_submit
async def handle_message_ext_submit(ctx: ActivityContext[MessageExtensionSubmitActionInvokeActivity]):
    """Handle message extension submit actions."""
    command_id = ctx.activity.value.command_id

    if command_id == "createCard":
        card = create_card(ctx.activity.value.data or {})
    else:
        raise Exception(f"Unknown commandId: {command_id}")

    main_attachment = card_attachment(AdaptiveCardAttachment(content=card))
    attachment = MessagingExtensionAttachment(
        content_type=main_attachment.content_type,
        content=main_attachment.content
    )

    result = MessagingExtensionResult(
        type=MessagingExtensionResultType.RESULT,
        attachment_layout=AttachmentLayout.LIST,
        attachments=[attachment]
    )

    return MessagingExtensionActionInvokeResponse(compose_extension=result)


@app.on_message_ext_open
async def handle_message_ext_open(ctx: ActivityContext[MessageExtensionFetchTaskInvokeActivity]):
    """Handle message extension open actions."""
    conversation_id = ctx.activity.conversation.id
    members = await ctx.api.conversations.members(conversation_id).get_all()
    card = create_conversation_members_card(members)

    card_info = CardTaskModuleTaskInfo(
        title="Conversation members",
        height="small",
        width="small",
        card=card_attachment(AdaptiveCardAttachment(content=card)),
    )

    task = TaskModuleContinueResponse(value=card_info)

    return MessagingExtensionActionInvokeResponse(task=task)


@app.on_message_ext_query
async def handle_message_ext_query(ctx: ActivityContext[MessageExtensionQueryInvokeActivity]):
    """Handle message extension query actions."""
    command_id = ctx.activity.value.command_id
    search_query = ""
    
    if ctx.activity.value.parameters and len(ctx.activity.value.parameters) > 0:
        search_query = ctx.activity.value.parameters[0].value or ""

    if command_id == "searchQuery":
        cards = await create_dummy_cards(search_query)
        attachments: list[MessagingExtensionAttachment] = []
        
        for card_data in cards:
            main_attachment = card_attachment(AdaptiveCardAttachment(content=card_data["card"]))
            preview_attachment = card_attachment(ThumbnailCardAttachment(content=card_data["thumbnail"]))

            attachment = MessagingExtensionAttachment(
                content_type=main_attachment.content_type,
                content=main_attachment.content,
                preview=preview_attachment
            )
            attachments.append(attachment)

        result = MessagingExtensionResult(
            type=MessagingExtensionResultType.RESULT,
            attachment_layout=AttachmentLayout.LIST,
            attachments=attachments
        )

        return MessagingExtensionInvokeResponse(compose_extension=result)

    return InvokeResponse[MessagingExtensionInvokeResponse](status=400)


@app.on_message_ext_query_link
async def handle_message_ext_query_link(ctx: ActivityContext[MessageExtensionQueryLinkInvokeActivity]):
    """Handle message extension query link actions for link unfurling."""
    url = ctx.activity.value.url

    if not url:
        return InvokeResponse[MessagingExtensionInvokeResponse](status=400)

    card_data = create_link_unfurl_card(url)
    main_attachment = card_attachment(AdaptiveCardAttachment(content=card_data["card"]))
    preview_attachment = card_attachment(ThumbnailCardAttachment(content=card_data["thumbnail"]))

    attachment = MessagingExtensionAttachment(
        content_type=main_attachment.content_type,
        content=main_attachment.content,
        preview=preview_attachment
    )

    result = MessagingExtensionResult(
        type=MessagingExtensionResultType.RESULT,
        attachment_layout=AttachmentLayout.LIST,
        attachments=[attachment]
    )

    return MessagingExtensionInvokeResponse(compose_extension=result)


if __name__ == "__main__":
    asyncio.run(app.start())
