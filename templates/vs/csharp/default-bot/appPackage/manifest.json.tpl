{
    "$schema": "https://developer.microsoft.com/en-us/json-schemas/teams/v1.29/MicrosoftTeams.schema.json",
    "manifestVersion": "1.29",
    "version": "1.0.0",
    "id": "${{TEAMS_APP_ID}}",
    "developer": {
        "name": "Teams App, Inc.",
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
        "short": "Short description of {{appName}}",
        "full": "Full description of {{appName}}"
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
        "isNotificationOnly": false,
        "supportsTargetedMessages": false,
        "commandLists": [
            {
              "scopes": ["personal", "team", "groupChat"],
              "triggers": ["mention"],
              "commands": [
                  {
                      "title": "Hi",
                      "description": "Say hi to the bot."
                  }
              ]
            }
        ]
        }
    ],
    "composeExtensions": [
    ],
    "configurableTabs": [],
    "staticTabs": [],
    "permissions": [
        "identity",
        "messageTeamMembers"
    ],
    "validDomains": []
}