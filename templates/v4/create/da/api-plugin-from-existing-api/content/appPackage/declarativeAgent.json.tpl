{
    "$schema": "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.7/schema.json",
    "version": "v1.7",
    {{#SensitivityLabelEnabled}}
    "sensitivity_label": {
        "id": ""
    },
    {{/SensitivityLabelEnabled}}
    "name": "{{appName}}",
    "description": "Declarative agent created with Microsoft 365 Agents Toolkit can assist user in calling APIs and retrieving responses",
    "instructions": "$[file('instruction.txt')]"
}
