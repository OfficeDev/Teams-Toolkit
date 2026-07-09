{
    "$schema": "https://developer.microsoft.com/en-us/json-schemas/teams/v1.28/MicrosoftTeams.schema.json",
    "manifestVersion": "1.28",
    "version": "1.0.0",
    "id": "${{TEAMS_APP_ID}}",
    "developer": {
        "name": "My App, Inc.",
        "websiteUrl": "https://www.example.com",
        "privacyUrl": "https://www.example.com/privacy",
        "termsOfUseUrl": "https://www.example.com/termsofuse"
    },
    "icons": {
        "color": "color.png",
        "outline": "outline.png"
    },
    "name": {
        "short": "{{appName}}${{APP_NAME_SUFFIX}}",
        "full": "Full name for {{appName}}"
    },
    "description": {
        "short": "Short description of {{appName}}",
        "full": "Full description of {{appName}}"
    },
    "accentColor": "#FFFFFF",
    "supportsChannelFeatures": "tier1",
    "bots": [],
    "composeExtensions": [],
    "staticTabs": [
        {
            "entityId": "index0",
            "name": "Home",
            "contentUrl": "${{TAB_ENDPOINT}}/tabs/home",
            "websiteUrl": "${{TAB_ENDPOINT}}/tabs/home",
            "scopes": [
                "personal",
                "groupChat",
                "team"
            ]
        }
    ],
    "permissions": [
        "identity",
        "messageTeamMembers"
    ],
    "validDomains": [
        "${{TAB_DOMAIN}}"
    ]
}