{
  "component": {
    "version": 1,
    "id": "setUserEnvironmentVariable",
    "parameters": [
      "instanceSuffix",
      "mutationScriptBase64",
      "targetKey",
      "variableName",
      "variableValue"
    ]
  },
  "steps": [
    {
      "step_id": "step_setUserEnvironmentVariable_openTerminal_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "keyboard_shortcut",
      "parameters": {
        "keys": "ctrl+shift+~"
      },
      "description": "Open a new integrated terminal in Visual Studio Code with Ctrl+Shift+~.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:user-environment"]
    },
    {
      "step_id": "step_setUserEnvironmentVariable_assertTerminal_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion a new VS Code integrated terminal is visible and focused with a Bash shell prompt ready for input.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_setUserEnvironmentVariable_openTerminal_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:user-environment",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_setUserEnvironmentVariable_typeCommand_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "read -rs VARIABLE_VALUE && PROJECT_DIR=\"/home/vscode/AgentsToolkitProjects/${{var:app_name}}\" TARGET_KEY=\"{{text:targetKey}}\" VARIABLE_NAME=\"{{text:variableName}}\" VARIABLE_VALUE=\"$VARIABLE_VALUE\" python3 -c 'import base64;exec(base64.b64decode(\"{{text:mutationScriptBase64}}\"))' && printf '\\nVSCUSE_USER_ENVIRONMENT_%s\\n' UPDATED"
      },
      "description": "Type the compiler-owned {{text:variableName}} mutation command for the {{text:targetKey}} user environment into the active integrated terminal.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_setUserEnvironmentVariable_assertTerminal_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:user-environment"]
    },
    {
      "step_id": "step_setUserEnvironmentVariable_runCommand_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to run the {{text:variableName}} mutation command and begin hidden value input.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_setUserEnvironmentVariable_typeCommand_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:user-environment"]
    },
    {
      "step_id": "step_setUserEnvironmentVariable_typeValue_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "{{text:variableValue}}"
      },
      "description": "Type the resolved {{text:variableName}} value into the Bash read command, which does not echo the value.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_setUserEnvironmentVariable_runCommand_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:user-environment"]
    },
    {
      "step_id": "step_setUserEnvironmentVariable_submitValue_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to submit the hidden {{text:variableName}} value and finish the verified mutation.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_setUserEnvironmentVariable_typeValue_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:user-environment"]
    },
    {
      "step_id": "step_setUserEnvironmentVariable_assertUpdated_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the VS Code integrated terminal visibly shows the exact text VSCUSE_USER_ENVIRONMENT_UPDATED on a standalone line, followed by a Bash shell prompt.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_setUserEnvironmentVariable_submitValue_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:user-environment",
        "step_retry_timeout: 120"
      ]
    },
    {
      "step_id": "step_setUserEnvironmentVariable_closeTerminal_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "keyboard_shortcut",
      "parameters": {
        "keys": "ctrl+`"
      },
      "description": "Close the verified integrated terminal with Ctrl+`.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_setUserEnvironmentVariable_assertUpdated_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:user-environment"]
    },
    {
      "step_id": "step_setUserEnvironmentVariable_assertClosed_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the integrated terminal panel is no longer visible and the Visual Studio Code workbench is ready.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_setUserEnvironmentVariable_closeTerminal_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:user-environment",
        "step_retry_timeout: 30"
      ]
    }
  ]
}
