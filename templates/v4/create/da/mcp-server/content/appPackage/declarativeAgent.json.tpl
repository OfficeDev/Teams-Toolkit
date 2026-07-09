{
    "$schema": "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.7/schema.json",
    "version": "v1.7",
    {{#SensitivityLabelEnabled}}
    "sensitivity_label": {
        "id": ""
    },
    {{/SensitivityLabelEnabled}}
    "name": "{{appName}}${{APP_NAME_SUFFIX}}",
    "description": "Declarative agent created with Microsoft 365 Agents Toolkit can assist user in calling MCP Servers",
    "instructions": "$[file('instruction.txt')]",
    "conversation_starters": [
        {
			"title": "Sample conversation starters",
			"text": "Hi! What can you do for me?"
		}
    ],
    "actions": [
        {
            "id": "action_1",
            "file": "ai-plugin.json"
        }
    ]
}
