{
  "version": "0.2.0",
  "configurations": [
{{#SandBoxedTeam}}
    {
      "name": "Start App to channel (Edge)",
      "type": "msedge",
      "request": "launch",
      "url": "${{sandbox:CHANNEL_WEB_URL}}&webjoin=true",
      "presentation": {
          "group": "all",
          "hidden": true
      },
      "internalConsoleOptions": "neverOpen",
      "perScriptSourcemaps": "yes"
    },
{{/SandBoxedTeam}}
    {
      "name": "Launch Remote (Edge)",
      "type": "msedge",
      "request": "launch",
      "url": "https://teams.microsoft.com/l/app/${{TEAMS_APP_ID}}?installAppPackage=true&webjoin=true&${account-hint}",
      "presentation": {
        "group": "1-Teams",
        "order": 4
      },
      "internalConsoleOptions": "neverOpen"
    },
    {
      "name": "Launch Remote (Chrome)",
      "type": "chrome",
      "request": "launch",
      "url": "https://teams.microsoft.com/l/app/${{TEAMS_APP_ID}}?installAppPackage=true&webjoin=true&${account-hint}",
      "presentation": {
        "group": "1-Teams",
        "order": 5
      },
      "internalConsoleOptions": "neverOpen"
    },
    {
      "name": "Launch Remote (Desktop)",
      "type": "node",
      "request": "launch",
      "preLaunchTask": "Start App in Desktop Client (Remote)",
      "presentation": {
        "group": "1-Teams",
        "order": 6
      },
      "internalConsoleOptions": "neverOpen"
    },
    {
      "name": "Start App (Edge)",
      "type": "msedge",
      "request": "launch",
      "url": "https://teams.microsoft.com/l/app/${{local:TEAMS_APP_ID}}?installAppPackage=true&webjoin=true&${account-hint}",
      "presentation": {
        "group": "all",
        "hidden": true
      },
      "internalConsoleOptions": "neverOpen"
    },
    {
      "name": "Start App (Chrome)",
      "type": "chrome",
      "request": "launch",
      "url": "https://teams.microsoft.com/l/app/${{local:TEAMS_APP_ID}}?installAppPackage=true&webjoin=true&${account-hint}",
      "presentation": {
        "group": "all",
        "hidden": true
      },
      "internalConsoleOptions": "neverOpen"
    },
    {
      "name": "Start Python",
      "type": "debugpy",
      "request": "launch",
      "program": "${workspaceFolder}/src/app.py",
      "cwd": "${workspaceFolder}/src",
      "console": "integratedTerminal"
    },
    {
      "name": "Start Python (Playground)",
      "type": "debugpy",
      "request": "launch",
      "program": "${workspaceFolder}/src/app.py",
      "cwd": "${workspaceFolder}/src",
      "console": "integratedTerminal",
      "serverReadyAction": {
        "pattern": "(started|listening|Running|Serving) (at|on) (https?://\\S+)",
        "action": "startDebugging",
        "name": "Start Microsoft 365 Agents Playground"
      }
    },
    {
        "name": "Start Microsoft 365 Agents Playground",
        "type": "node",
        "request": "launch",
        "program": "${workspaceFolder}/devTools/playground/node_modules/@microsoft/m365agentsplayground/cli.js",
        "args": [
            "start"
        ],
        "env": {
          "PATH": "${workspaceFolder}/devTools/nodejs{{pathDelimiter}}${env:PATH}"
        },
        "cwd": "${workspaceFolder}",
        "console": "integratedTerminal",
        "internalConsoleOptions": "neverOpen"
    }
  ],
  "compounds": [
{{#SandBoxedTeam}}
    {
      "name": "Debug in sandbox in Teams (Edge)",
      "configurations": ["Start App to channel (Edge)", "Start Python"],
      "cascadeTerminateToConfigurations": ["Start Python"],
      "preLaunchTask": "Start App (Sandbox)",
      "presentation": {
          "group": "0-TestTool",
          "order": 2
      },
      "stopAll": true
    },
{{/SandBoxedTeam}}
    {
      "name": "Debug in Teams (Edge)",
      "configurations": ["Start App (Edge)", "Start Python"],
      "cascadeTerminateToConfigurations": ["Start Python"],
      "preLaunchTask": "Start App Locally",
      "presentation": {
        "group": "1-Teams",
        "order": 1
      },
      "stopAll": true
    },
    {
      "name": "Debug in Teams (Chrome)",
      "configurations": ["Start App (Chrome)", "Start Python"],
      "cascadeTerminateToConfigurations": ["Start Python"],
      "preLaunchTask": "Start App Locally",
      "presentation": {
        "group": "1-Teams",
        "order": 2
      },
      "stopAll": true
    },
    {
      "name": "Debug in Teams (Desktop)",
      "configurations": ["Start Python"],
      "preLaunchTask": "Start App in Desktop Client",
      "presentation": {
        "group": "1-Teams",
        "order": 3
      },
      "stopAll": true
    },
    {
        "name": "Debug in Microsoft 365 Agents Playground",
        "configurations": ["Start Python (Playground)"],
        "preLaunchTask": "Deploy (Microsoft 365 Agents Playground)",
        "presentation": {
            "group": "0-TestTool",
            "order": 1
        },
        "stopAll": true
    }
  ]
}
