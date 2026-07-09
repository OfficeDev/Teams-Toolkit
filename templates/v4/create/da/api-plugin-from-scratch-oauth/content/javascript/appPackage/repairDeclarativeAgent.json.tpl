{
    "$schema": "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.7/schema.json",
    "version": "v1.7",
    {{#SensitivityLabelEnabled}}
    "sensitivity_label": {
        "id": ""
    },
    {{/SensitivityLabelEnabled}}
    "name": "{{appName}}${{APP_NAME_SUFFIX}}",
    "description": "This declarative agent helps you with finding car repair records.",
    "instructions": "$[file('instruction.txt')]",
    "conversation_starters": [
        {
            "text": "Show repair records assigned to Karin Blair"
        }
    ],
    "actions": [
        {
            "id": "repairPlugin",
            "file": "ai-plugin.json"
        }
    ]
}
