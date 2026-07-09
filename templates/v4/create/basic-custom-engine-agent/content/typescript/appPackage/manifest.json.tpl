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
        "short": "short description for {{appName}}",
        "full": "full description for {{appName}}"
    },
    "accentColor": "#FFFFFF",
    "supportsChannelFeatures": "tier1",
    "copilotAgents": {
        "customEngineAgents": [
            {
                "type": "bot",
                "id": "${{BOT_ID}}"
            }
        ]
    },
    "bots": [
        {
            "botId": "${{BOT_ID}}",
            "scopes": [
                "copilot",
                "personal",
                "team"
            ],
            "supportsFiles": false,
            "isNotificationOnly": false,
            "commandLists": [
                {
                    "scopes": [
                        "copilot",
                        "personal"
                    ],
                    "commands": [
                        {
                            "title": "How can you help me?",
                            "description": "How can you help me?"
                        }
                    ]
                }
            ]
        }
    ],
    "composeExtensions": [],
    "configurableTabs": [],
    "staticTabs": [],
    "permissions": [
        "identity",
        "messageTeamMembers"
    ],
    "validDomains": []
}