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
        "personal"
      ],
      "supportsFiles": false,
      "isNotificationOnly": false,
      "supportsTargetedMessages": false,
      "commandLists": [
        {
          "scopes": [
            "copilot",
            "personal"
          ],
          "triggers": ["mention"],
          "commands": [
            {
              "title": "How can you help me?",
              "description": "How can you help me?"
            },
            {
              "title": "Travel policy",
              "description": "what's the general travel policy for the company?"
            },
            {
              "title": "Find flights",
              "description": "Find me flights from Montréal to Washington on next month, which complies with company policy."
            },
            {
              "title": "Travel plan",
              "description": "Create a travel plan from Copenhagen to Los Angeles for next month, with flights and hotels which complies with company policy."
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
  "validDomains": [
    "token.botframework.com",
    "login.microsoftonline.com"
  ]
}