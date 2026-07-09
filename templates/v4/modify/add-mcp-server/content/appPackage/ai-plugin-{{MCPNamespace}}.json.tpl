{
  "$schema": "https://developer.microsoft.com/json-schemas/copilot/plugin/v2.4/schema.json",
  "schema_version": "v2.4",
  "name_for_human": "{{appName}}",
  "description_for_human": "{{appName}}${{APP_NAME_SUFFIX}}",
  "contact_email": "publisher-email@example.com",
  "namespace": "{{MCPNamespace}}",
  "functions": [],
  "runtimes": [
    {
      "type": "RemoteMCPServer",
      "spec": {
        "url": "{{MCPForDAServerUrl}}",
        "enable_dynamic_discovery": true
      },
      "run_for_functions": ["*"],
      "auth": {
{{#IsNoAuth}}
        "type": "None"
{{/IsNoAuth}}
{{^IsNoAuth}}
        "type": "OAuthPluginVault",
        "reference_id": "{{MCPAuthRefId}}"
{{/IsNoAuth}}
      }
    }
  ]
}
