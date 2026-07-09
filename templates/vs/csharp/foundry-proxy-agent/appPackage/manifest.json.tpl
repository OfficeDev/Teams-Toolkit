{
 "$schema": "https://developer.microsoft.com/json-schemas/teams/v1.29/MicrosoftTeams.schema.json",
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
    "full": "Microsoft Foundry Proxy Agent"
  },
  "description": {
    "short": "Foundry-powered agent for Microsoft Teams and M365 Copilot",
    "full": "Custom engine agent that integrates Azure AI Foundry services with Microsoft Teams and M365 Copilot for enhanced productivity"
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
            }
          ]
        }
      ]
    }
  ],
  "webApplicationInfo": {
    "id": "${{SSO_APP_ID}}",
    "resource": "${{SSO_APP_ID_URI}}"
  },
  "composeExtensions": [
  ],
  "configurableTabs": [],
  "staticTabs": [],
  "permissions": [
    "identity",
    "messageTeamMembers"
  ],
  "validDomains": [
    "${{BOT_DOMAIN}}",
    "token.botframework.com"
  ]
}
