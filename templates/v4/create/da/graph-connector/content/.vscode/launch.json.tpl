{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Attach to Node Functions",
            "type": "node",
            "request": "attach",
            "port": 9229,
            "preLaunchTask": "func: host start",
            "presentation": {
                "hidden": true,
                "group": "",
                "order": 1
            },
            "restart": true,
            "postDebugTask": "Terminate All Tasks"
        },
        {{#DeclarativeCopilot}}
        {
            "name": "Preview in local (Edge)",
            "type": "msedge",
            "request": "launch",
            "url": "https://m365.cloud.microsoft/chat/entity1-d870f6cd-4aa5-4d42-9626-ab690c041429/${local:agent-hint}?auth=2&developerMode=Basic",
            "presentation": {
              "group": "all",
              "hidden": true
            },
            "internalConsoleOptions": "neverOpen",
            "runtimeArgs": ["--remote-debugging-port=9222", "--no-first-run"]
        },
        {
            "name": "Preview in local (Chrome)",
            "type": "chrome",
            "request": "launch",
            "url": "https://m365.cloud.microsoft/chat/entity1-d870f6cd-4aa5-4d42-9626-ab690c041429/${local:agent-hint}?auth=2&developerMode=Basic",
            "presentation": {
                "group": "all",
                "hidden": true
            },
            "internalConsoleOptions": "neverOpen",
            "runtimeArgs": [
                "--remote-debugging-port=9223",
                "--no-first-run"
            ]
        },
        {
            "name": "Preview DA with dev Copilot connector (Edge)",
            "type": "msedge",
            "request": "launch",
            "url": "https://m365.cloud.microsoft/chat/entity1-d870f6cd-4aa5-4d42-9626-ab690c041429/${agent-hint}?auth=2&developerMode=Basic",
            "presentation": {
              "group": "remote",
              "order": 1
            },
            "internalConsoleOptions": "neverOpen",
            "runtimeArgs": ["--remote-debugging-port=9222", "--no-first-run"]
        },
        {
            "name": "Preview DA with dev Copilot connector (Chrome)",
            "type": "chrome",
            "request": "launch",
            "url": "https://m365.cloud.microsoft/chat/entity1-d870f6cd-4aa5-4d42-9626-ab690c041429/${agent-hint}?auth=2&developerMode=Basic",
            "presentation": {
                "group": "remote",
                "order": 2
            },
            "internalConsoleOptions": "neverOpen",
            "runtimeArgs": [
                "--remote-debugging-port=9223",
                "--no-first-run"
            ]
        }
        {{/DeclarativeCopilot}}
    ],
    "compounds": [
        {
            "name": "Debug Copilot connector",
            "configurations": ["Attach to Node Functions"],
            "preLaunchTask": "TTK",
            "presentation": {
              "group": "all",
              "order": 1
            },
            "stopAll": true
        },
        {{#DeclarativeCopilot}}
        {
            "name": "Preview DA with local Copilot connector (Edge)",
            "configurations": ["Preview in local (Edge)"],
            "preLaunchTask": "Prepare DA",
            "presentation": {
                    "group": "local",
                    "order": 1
            },
            "stopAll": true
        },
        {
            "name": "Preview DA with local Copilot connector (Chrome)",
            "configurations": ["Preview in local (Chrome)"],
            "preLaunchTask": "Prepare DA",
            "presentation": {
                    "group": "local",
                    "order": 2
            },
            "stopAll": true
        }
        {{/DeclarativeCopilot}}
    ],
}
