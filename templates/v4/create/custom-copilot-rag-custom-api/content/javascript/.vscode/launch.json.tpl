{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Launch Remote in Teams (Edge)",
            "type": "msedge",
            "request": "launch",
            "url": "https://teams.microsoft.com/l/app/${{TEAMS_APP_ID}}?installAppPackage=true&webjoin=true&${account-hint}",
            "presentation": {
                "group": "2-Teams",
                "order": 4
            },
            "internalConsoleOptions": "neverOpen"
        },
        {
            "name": "Launch Remote in Teams (Chrome)",
            "type": "chrome",
            "request": "launch",
            "url": "https://teams.microsoft.com/l/app/${{TEAMS_APP_ID}}?installAppPackage=true&webjoin=true&${account-hint}",
            "presentation": {
                "group": "2-Teams",
                "order": 5
            },
            "internalConsoleOptions": "neverOpen"
        },
        {
            "name": "Launch Agent (Edge)",
            "type": "msedge",
            "request": "launch",
            "url": "https://teams.microsoft.com/l/app/${{local:TEAMS_APP_ID}}?installAppPackage=true&webjoin=true&${account-hint}",
            "cascadeTerminateToConfigurations": [
                "Attach to Local Service"
            ],
            "presentation": {
                "group": "all",
                "hidden": true
            },
            "internalConsoleOptions": "neverOpen",
            "perScriptSourcemaps": "yes"
        },
        {
            "name": "Launch Agent (Chrome)",
            "type": "chrome",
            "request": "launch",
            "url": "https://teams.microsoft.com/l/app/${{local:TEAMS_APP_ID}}?installAppPackage=true&webjoin=true&${account-hint}",
            "cascadeTerminateToConfigurations": [
                "Attach to Local Service"
            ],
            "presentation": {
                "group": "all",
                "hidden": true
            },
            "internalConsoleOptions": "neverOpen",
            "perScriptSourcemaps": "yes"
        },
        {
            "name": "Attach to Local Service",
            "type": "node",
            "request": "attach",
            "port": 9239,
            "restart": true,
            "presentation": {
                "group": "all",
                "hidden": true
            },
            "internalConsoleOptions": "neverOpen"
        },
        {
            "name": "Launch Remote in Teams (Desktop)",
            "type": "node",
            "request": "launch",
            "preLaunchTask": "Start Agent in Desktop Client (Remote)",
            "presentation": {
                "group": "2-Teams",
                "order": 6
            },
            "internalConsoleOptions": "neverOpen"
        }
{{#CEAEnabled}}
        ,{
            "name": "Launch Remote in Copilot (Edge)",
            "type": "msedge",
            "request": "launch",
            "url": "https://m365.cloud.microsoft/chat/entity1-d870f6cd-4aa5-4d42-9626-ab690c041429/${agent-hint}?auth=2&${account-hint}&developerMode=Basic",
            "cascadeTerminateToConfigurations": ["Attach to Local Service"],
            "presentation": {
                "group": "3-M365",
                "order": 3
            },
            "internalConsoleOptions": "neverOpen",
            "runtimeArgs": [
                "--remote-debugging-port=9222",
                "--no-first-run"
            ]
            },
            {
            "name": "Launch Remote in Copilot (Chrome)",
            "type": "chrome",
            "request": "launch",
            "url": "https://m365.cloud.microsoft/chat/entity1-d870f6cd-4aa5-4d42-9626-ab690c041429/${agent-hint}?auth=2&${account-hint}&developerMode=Basic",
            "cascadeTerminateToConfigurations": ["Attach to Local Service"],
            "presentation": {
                "group": "3-M365",
                "order": 4
            },
            "internalConsoleOptions": "neverOpen",
            "runtimeArgs": [
                "--remote-debugging-port=9223",
                "--no-first-run"
            ]
        },
        {
            "name": "Launch in Copilot (Edge)",
            "type": "msedge",
            "request": "launch",
            "url": "https://m365.cloud.microsoft/chat/entity1-d870f6cd-4aa5-4d42-9626-ab690c041429/${local:agent-hint}?auth=2&${account-hint}&developerMode=Basic",
            "cascadeTerminateToConfigurations": ["Attach to Local Service"],
            "presentation": {
                "group": "all",
                "hidden": true
            },
            "internalConsoleOptions": "neverOpen",
            "runtimeArgs": [
                "--remote-debugging-port=9222",
                "--no-first-run"
            ]
        },
        {
            "name": "Launch in Copilot (Chrome)",
            "type": "chrome",
            "request": "launch",
            "url": "https://m365.cloud.microsoft/chat/entity1-d870f6cd-4aa5-4d42-9626-ab690c041429/${local:agent-hint}?auth=2&${account-hint}&developerMode=Basic",
            "cascadeTerminateToConfigurations": ["Attach to Local Service"],
            "presentation": {
                "group": "all",
                "hidden": true
            },
            "internalConsoleOptions": "neverOpen",
            "runtimeArgs": [
                "--remote-debugging-port=9223",
                "--no-first-run"
            ]
        }
{{/CEAEnabled}}
{{#SandBoxedTeam}}
        ,{
            "name": "Launch Agent to channel (Edge)",
            "type": "msedge",
            "request": "launch",
            "url": "${{sandbox:CHANNEL_WEB_URL}}&webjoin=true",
            "cascadeTerminateToConfigurations": [
                "Attach to Local Service"
            ],
            "presentation": {
                "group": "all",
                "hidden": true
            },
            "internalConsoleOptions": "neverOpen",
            "perScriptSourcemaps": "yes"
        }
{{/SandBoxedTeam}}
    ],
    "compounds": [
        {
            "name": "Debug in Teams (Edge)",
            "configurations": [
                "Launch Agent (Edge)",
                "Attach to Local Service"
            ],
            "preLaunchTask": "Start Agent Locally",
            "presentation": {
                "group": "2-Teams",
                "order": 1
            },
            "stopAll": true
        },
{{#SandBoxedTeam}}
        {
            "name": "Debug in sandbox in Teams (Edge)",
            "configurations": [
                "Launch Agent to channel (Edge)",
                "Attach to Local Service"
            ],
            "preLaunchTask": "Start Agent (Sandbox)",
            "presentation": {
                "group": "1-local",
                "order": 1
            },
            "stopAll": true
        },
{{/SandBoxedTeam}}
        {
            "name": "Debug in Teams (Chrome)",
            "configurations": [
                "Launch Agent (Chrome)",
                "Attach to Local Service"
            ],
            "preLaunchTask": "Start Agent Locally",
            "presentation": {
                "group": "2-Teams",
                "order": 2
            },
            "stopAll": true
        },
        {
            "name": "Debug in Teams (Desktop)",
            "configurations": [
                "Attach to Local Service"
            ],
            "preLaunchTask": "Start Agent in Desktop Client",
            "presentation": {
                "group": "2-Teams",
                "order": 3
            },
            "stopAll": true
        },
        {
            "name": "Debug in Microsoft 365 Agents Playground",
            "configurations": [
                "Attach to Local Service"
            ],
            "preLaunchTask": "Start Agent in Microsoft 365 Agents Playground",
            "presentation": {
                "group": "1-local",
                "order": 1
            },
            "stopAll": true
        }
{{#CEAEnabled}}
        ,{
            "name": "Debug in Copilot (Edge)",
            "configurations": [
                "Launch in Copilot (Edge)",
                "Attach to Local Service"
            ],
            "preLaunchTask": "Start Agent Locally",
            "presentation": {
                "group": "3-M365",
                "order": 1
            },
            "stopAll": true
        },
        {
            "name": "Debug in Copilot (Chrome)",
            "configurations": [
                "Launch in Copilot (Chrome)",
                "Attach to Local Service"
            ],
            "preLaunchTask": "Start Agent Locally",
            "presentation": {
                "group": "3-M365",
                "order": 2
            },
            "stopAll": true
        }
{{/CEAEnabled}}
    ]
}
