from typing import Dict, List, Any, Sequence, Union
from microsoft_teams.api import Account, TeamsChannelAccount
from microsoft_teams.cards import AdaptiveCard

IMAGE_URL = "https://github.com/OfficeDev/microsoft-365-agents-toolkit/raw/release/6.4/templates/vsc/python/message-extension-v2/appPackage/color.png"

def create_card(data: Dict[str, str]) -> AdaptiveCard:
    """Create an adaptive card from form data."""
    return AdaptiveCard.model_validate({
        "type": "AdaptiveCard",
        "version": "1.4",
        "body": [
            {
                "type": "TextBlock",
                "text": data.get("title", ""),
                "size": "Large",
                "weight": "Bolder",
                "color": "Accent",
                "style": "heading",
            },
            {
                "type": "TextBlock",
                "text": data.get("subTitle", ""),
                "size": "Small",
                "weight": "Lighter",
                "color": "Good",
            },
            {
                "type": "TextBlock",
                "text": data.get("text", ""),
                "wrap": True,
                "spacing": "Medium"
            },
        ],
    })


def create_conversation_members_card(members: Sequence[Union[Account, TeamsChannelAccount]]) -> AdaptiveCard:
    """Create a card showing conversation members."""
    members_list = ", ".join(member.name for member in members if member.name)

    return AdaptiveCard.model_validate({
        "type": "AdaptiveCard",
        "version": "1.4",
        "body": [
            {
                "type": "TextBlock",
                "text": "Conversation members",
                "size": "Medium",
                "weight": "Bolder",
                "color": "Accent",
                "style": "heading",
            },
            {
                "type": "TextBlock",
                "text": members_list,
                "wrap": True,
                "spacing": "Small"
            },
        ],
    })


async def create_dummy_cards(search_query: str) -> List[Dict[str, Any]]:
    """Create dummy cards for search results."""
    dummy_items = [
        {
            "title": "Item 1",
            "description": f"This is the first item and this is your search query: {search_query}",
        },
        {
            "title": "Item 2",
            "description": "This is the second item"
        },
        {
            "title": "Item 3",
            "description": "This is the third item"
        },
        {
            "title": "Item 4",
            "description": "This is the fourth item"
        },
        {
            "title": "Item 5",
            "description": "This is the fifth item"
        },
    ]

    cards: List[Dict[str, Any]] = []
    for item in dummy_items:
        card_data: Dict[str, Any] = {
            "card": AdaptiveCard.model_validate({
                "type": "AdaptiveCard",
                "version": "1.4",
                "body": [
                    {
                        "type": "TextBlock",
                        "text": item["title"],
                        "size": "Large",
                        "weight": "Bolder",
                        "color": "Accent",
                        "style": "heading",
                    },
                    {
                        "type": "TextBlock",
                        "text": item["description"],
                        "wrap": True,
                        "spacing": "Medium"
                    },
                ],
            }),
            "thumbnail": {
                "title": item["title"],
                "text": item["description"],
                "images": [{"url": IMAGE_URL}],
            },
        }
        cards.append(card_data)

    return cards


def create_link_unfurl_card(url: str) -> Dict[str, Any]:
    """Create a card for link unfurling."""
    thumbnail = {
        "title": "Unfurled Link",
        "text": url,
        "images": [{"url": IMAGE_URL}],
    }

    card = AdaptiveCard.model_validate({
        "type": "AdaptiveCard",
        "version": "1.4",
        "body": [
            {
                "type": "TextBlock",
                "text": "Unfurled Link",
                "size": "Large",
                "weight": "Bolder",
                "color": "Accent",
                "style": "heading",
            },
            {
                "type": "TextBlock",
                "text": url,
                "size": "Small",
                "weight": "Lighter",
                "color": "Good"
            },
        ],
    })

    return {"card": card, "thumbnail": thumbnail}