{
    "$schema": "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.8/schema.json",
    "version": "v1.8",
    {{#SensitivityLabelEnabled}}
    "sensitivity_label": {
        "id": ""
    },
    {{/SensitivityLabelEnabled}}
    "name": "{{appName}}${{APP_NAME_SUFFIX}}",
    "description": "Declarative agent created with Microsoft 365 Agents Toolkit",
    {{^CopilotConnector}}
    "instructions": "$[file('instruction.txt')]",
    {{/CopilotConnector}}
    {{#CopilotConnector}}
    "instructions": "$[file('instruction.txt')]",
    "capabilities": [
        {
            "name": "GraphConnectors",
            "connections": [
                {
                    "connection_id": "${{CONNECTOR_ID}}"
                }
            ]
        }
    ],
    {{/CopilotConnector}}
    "agent_skills": [
        {
            "folder": "skills/hello-atk"
        }
    ]
}