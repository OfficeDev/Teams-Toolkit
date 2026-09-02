{
  "component": {
    "version": 1,
    "id": "prepareEmbeddedKnowledgeDocument",
    "parameters": ["instanceSuffix", "preparationScriptBase64"]
  },
  "steps": [
    {
      "step_id": "step_prepareEmbeddedKnowledgeDocument_openTerminal_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "keyboard_shortcut",
      "parameters": { "keys": "ctrl+shift+~" },
      "description": "Open a new integrated terminal in Visual Studio Code with Ctrl+Shift+~.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:prepare-embedded-knowledge"]
    },
    {
      "step_id": "step_prepareEmbeddedKnowledgeDocument_assertTerminal_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion a new VS Code integrated terminal is visible and focused with a Bash shell prompt ready for input.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_prepareEmbeddedKnowledgeDocument_openTerminal_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:prepare-embedded-knowledge",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_prepareEmbeddedKnowledgeDocument_typeCommand_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "PROJECT_DIR=\"/home/vscode/AgentsToolkitProjects/${{var:app_name}}\" python3 -c 'import base64;exec(base64.b64decode(\"{{text:preparationScriptBase64}}\"))' && printf '\\nVSCUSE_EMBEDDED_KNOWLEDGE_%s\\n' PREPARED"
      },
      "description": "Type the compiler-owned embedded knowledge fixture preparation command into the active integrated terminal.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_prepareEmbeddedKnowledgeDocument_assertTerminal_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:prepare-embedded-knowledge"]
    },
    {
      "step_id": "step_prepareEmbeddedKnowledgeDocument_runCommand_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": { "key": "enter" },
      "description": "Press Enter to prepare the immutable embedded knowledge document.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_prepareEmbeddedKnowledgeDocument_typeCommand_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:prepare-embedded-knowledge"]
    },
    {
      "step_id": "step_prepareEmbeddedKnowledgeDocument_assertPrepared_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the VS Code integrated terminal visibly displays the complete text VSCUSE_EMBEDDED_KNOWLEDGE_PREPARED.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_prepareEmbeddedKnowledgeDocument_runCommand_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:prepare-embedded-knowledge",
        "step_retry_timeout: 120"
      ]
    },
    {
      "step_id": "step_prepareEmbeddedKnowledgeDocument_closeTerminal_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "keyboard_shortcut",
      "parameters": { "keys": "ctrl+`" },
      "description": "Close the verified integrated terminal with Ctrl+`.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_prepareEmbeddedKnowledgeDocument_assertPrepared_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:prepare-embedded-knowledge"]
    },
    {
      "step_id": "step_prepareEmbeddedKnowledgeDocument_assertClosed_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the integrated terminal panel is no longer visible and the Visual Studio Code workbench is ready.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_prepareEmbeddedKnowledgeDocument_closeTerminal_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:prepare-embedded-knowledge",
        "step_retry_timeout: 30"
      ]
    }
  ]
}
