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
    "bots": [
        {
            "botId": "${{BOT_ID}}",
            "scopes": [
                "personal",
                "team",
                "groupChat"
            ],
            "supportsFiles": false,
            "isNotificationOnly": false
        }
    ],
    "validDomains": [
        "${{BOT_DOMAIN}}",
        "*.botframework.com"
    ],
    "webApplicationInfo": {
        "id": "${{BOT_ID}}",
        "resource": "api://botid-${{BOT_ID}}"
    },
    "authorization": {
        "permissions": {
            "resourceSpecific": [
                {
                "name": "ChatMessage.Read.Chat", 
                "type": "Application"
                }
            ]
        }
    }
}