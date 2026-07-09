{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Launch Agent in Copilot (Edge)",
            "type": "msedge",
            "request": "launch",
            "url": "https://m365.cloud.microsoft/chat/entity1-d870f6cd-4aa5-4d42-9626-ab690c041429/${local:agent-hint}?auth=2&developerMode=Basic",
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
            "name": "Launch Agent in Copilot (Chrome)",
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
            "name": "Preview in Copilot (Edge)",
            "type": "msedge",
            "request": "launch",
            "url": "https://m365.cloud.microsoft/chat/entity1-d870f6cd-4aa5-4d42-9626-ab690c041429/${agent-hint}?auth=2&developerMode=Basic",
            "presentation": {
                "group": "remote",
                "order": 1
            },
            "internalConsoleOptions": "neverOpen",
            "runtimeArgs": [
                "--remote-debugging-port=9224",
                "--no-first-run"
            ]
        },
        {
            "name": "Preview in Copilot (Chrome)",
            "type": "chrome",
            "request": "launch",
            "url": "https://m365.cloud.microsoft/chat/entity1-d870f6cd-4aa5-4d42-9626-ab690c041429/${agent-hint}?auth=2&developerMode=Basic",
            "presentation": {
                "group": "remote",
                "order": 2
            },
            "internalConsoleOptions": "neverOpen",
            "runtimeArgs": [
                "--remote-debugging-port=9225",
                "--no-first-run"
            ]
        }
    ],
    "compounds": [
        {
            "name": "Preview Local in Copilot (Edge)",
            "configurations": [
                "Launch Agent in Copilot (Edge)",
            ],
            "preLaunchTask": "Start Agent Locally",
            "presentation": {
                "group": "all",
                "order": 1
            },
            "stopAll": true
        },
        {
            "name": "Preview Local in Copilot (Chrome)",
            "configurations": [
                "Launch Agent in Copilot (Chrome)",
            ],
            "preLaunchTask": "Start Agent Locally",
            "presentation": {
                "group": "all",
                "order": 1
            },
            "stopAll": true
        }
    ]
}
