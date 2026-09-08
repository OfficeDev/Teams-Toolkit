{
  "component": {
    "version": 1,
    "id": "generateTypeSpecEnvironment",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_generateTypeSpecEnvironment_openTerminal_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "keyboard_shortcut",
      "parameters": { "keys": "ctrl+shift+~" },
      "description": "Open a new integrated terminal to prepare the TypeSpec dev environment before packaging.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:generate-typespec-environment"]
    },
    {
      "step_id": "step_generateTypeSpecEnvironment_assertTerminal_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion a new VS Code integrated terminal is visible and focused with a Bash shell prompt ready for input.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_generateTypeSpecEnvironment_openTerminal_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:generate-typespec-environment",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_generateTypeSpecEnvironment_typeCommand_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "cd \"/home/vscode/AgentsToolkitProjects/${{var:app_name}}\" && npm run generate:env -- dev && printf '\\nVSCUSE_TYPESPEC_ENV_%s\\n' GENERATED"
      },
      "description": "Type the environment-generation command required by the original TypeSpec GitHub issues packaging testcase (ADO 33517192).",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_generateTypeSpecEnvironment_assertTerminal_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:generate-typespec-environment"]
    },
    {
      "step_id": "step_generateTypeSpecEnvironment_runCommand_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": { "key": "enter" },
      "description": "Press Enter to generate src/agent/env.tsp from env/.env.dev before standalone packaging.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_generateTypeSpecEnvironment_typeCommand_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:generate-typespec-environment"]
    },
    {
      "step_id": "step_generateTypeSpecEnvironment_assertGenerated_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the VS Code integrated terminal visibly displays the complete text VSCUSE_TYPESPEC_ENV_GENERATED.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_generateTypeSpecEnvironment_runCommand_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:generate-typespec-environment",
        "step_retry_timeout: 120"
      ]
    },
    {
      "step_id": "step_generateTypeSpecEnvironment_closeTerminal_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "keyboard_shortcut",
      "parameters": { "keys": "ctrl+`" },
      "description": "Hide the integrated terminal after successful TypeSpec environment generation.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_generateTypeSpecEnvironment_assertGenerated_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:generate-typespec-environment"]
    },
    {
      "step_id": "step_generateTypeSpecEnvironment_assertClosed_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the integrated terminal panel is no longer visible and the Visual Studio Code workbench is ready.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_generateTypeSpecEnvironment_closeTerminal_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:generate-typespec-environment",
        "step_retry_timeout: 30"
      ]
    }
  ]
}
