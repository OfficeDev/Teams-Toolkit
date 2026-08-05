{
  "component": {
    "version": 1,
    "id": "configureTypeSpecGitHubIssuesAction",
    "parameters": ["instanceSuffix", "mutationScriptBase64"]
  },
  "steps": [
    {
      "step_id": "step_configureTypeSpecGitHubIssuesAction_openTerminal_{{text:instanceSuffix}}",
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
      "tags": ["component:workspace", "operation:configure-typespec-action"]
    },
    {
      "step_id": "step_configureTypeSpecGitHubIssuesAction_assertTerminal_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion a new VS Code integrated terminal is visible and focused with a Bash shell prompt ready for input.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_configureTypeSpecGitHubIssuesAction_openTerminal_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:configure-typespec-action",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_configureTypeSpecGitHubIssuesAction_typeCommand_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "PROJECT_DIR=\"/home/vscode/AgentsToolkitProjects/${{var:app_name}}\" python3 -c 'import base64;exec(base64.b64decode(\"{{text:mutationScriptBase64}}\"))' && printf '\\nVSCUSE_TYPESPEC_ACTION_%s\\n' CONFIGURED"
      },
      "description": "Type the compiler-owned TypeSpec GitHub issues mutation command into the active integrated terminal.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_configureTypeSpecGitHubIssuesAction_assertTerminal_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:configure-typespec-action"]
    },
    {
      "step_id": "step_configureTypeSpecGitHubIssuesAction_runCommand_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to execute the verified TypeSpec GitHub issues mutation command.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_configureTypeSpecGitHubIssuesAction_typeCommand_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:configure-typespec-action"]
    },
    {
      "step_id": "step_configureTypeSpecGitHubIssuesAction_assertConfigured_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the VS Code integrated terminal displays VSCUSE_TYPESPEC_ACTION_CONFIGURED on its own output line after the shell prompt, proving the TypeSpec GitHub issues declarations were enabled and verified.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_configureTypeSpecGitHubIssuesAction_runCommand_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:configure-typespec-action",
        "step_retry_timeout: 120"
      ]
    },
    {
      "step_id": "step_configureTypeSpecGitHubIssuesAction_closeTerminal_{{text:instanceSuffix}}",
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
        "step_configureTypeSpecGitHubIssuesAction_assertConfigured_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:configure-typespec-action"]
    },
    {
      "step_id": "step_configureTypeSpecGitHubIssuesAction_assertClosed_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the integrated terminal panel is no longer visible and the Visual Studio Code workbench is ready.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_configureTypeSpecGitHubIssuesAction_closeTerminal_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:configure-typespec-action",
        "step_retry_timeout: 30"
      ]
    }
  ]
}
