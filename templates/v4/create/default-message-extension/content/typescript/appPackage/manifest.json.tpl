{
    "$schema": "https://developer.microsoft.com/en-us/json-schemas/teams/v1.28/MicrosoftTeams.schema.json",
    "manifestVersion": "1.28",
    "version": "1.0.0",
    "id": "${{TEAMS_APP_ID}}",
    "developer": {
        "name": "My App, Inc.",
        "websiteUrl": "https://www.example.com",
        "privacyUrl": "https://www.example.com/privacy",
        "termsOfUseUrl": "https://www.example.com/termofuse"
    },
    "icons": {
        "color": "color.png",
        "outline": "outline.png"
    },
    "name": {
        "short": "{{appName}}${{APP_NAME_SUFFIX}}",
        "full": "full name for {{appName}}"
    },
    "description": {
        "short": "short description of {{appName}}",
        "full": "full description of {{appName}}"
    },
    "accentColor": "#FFFFFF",
    "supportsChannelFeatures": "tier1",
    "bots": [
        {
            "botId": "${{BOT_ID}}",
            "scopes": [
                "personal",
                "team",
                "groupChat"
            ],
            "isNotificationOnly": false,
            "supportsCalling": false,
            "supportsVideo": false,
            "supportsFiles": false
        }
    ],
    "composeExtensions": [
        {
            "botId": "${{BOT_ID}}",
            "commands": [
                {
                    "id": "createCard",
                    "type": "action",
                    "context": [
                        "compose",
                        "commandBox"
                    ],
                    "description": "Command to run action to create a card from the compose box.",
                    "title": "Create Card",
                    "parameters": [
                        {
                            "name": "title",
                            "title": "Card title",
                            "description": "Title for the card",
                            "inputType": "text"
                        },
                        {
                            "name": "subTitle",
                            "title": "Subtitle",
                            "description": "Subtitle for the card",
                            "inputType": "text"
                        },
                        {
                            "name": "text",
                            "title": "Text",
                            "description": "Text for the card",
                            "inputType": "textarea"
                        }
                    ]
                },
                {
                    "id": "fetchConversationMembers",
                    "description": "Fetch the conversation members",
                    "title": "Fetch Conversation Members",
                    "type": "action",
                    "fetchTask": true,
                    "context": [
                        "compose"
                    ]
                },
                {
                    "id": "searchQuery",
                    "context": [
                        "compose",
                        "commandBox"
                    ],
                    "description": "Test command to run query",
                    "title": "Search query",
                    "type": "query",
                    "parameters": [
                        {
                            "name": "searchQuery",
                            "title": "Search Query",
                            "description": "Your search query",
                            "inputType": "text"
                        }
                    ]
                }
            ],
            "messageHandlers": [
                {
                    "type": "link",
                    "value": {
                        "domains": [
                            "*.botframework.com"
                        ],
                        "supportsAnonymizedPayloads": true
                    }
                }
            ]
        }
    ],
    "permissions": [
        "identity",
        "messageTeamMembers"
    ],
    "validDomains": [
        "${{BOT_DOMAIN}}",
        "*.botframework.com",
        "*.com"
    ]
}