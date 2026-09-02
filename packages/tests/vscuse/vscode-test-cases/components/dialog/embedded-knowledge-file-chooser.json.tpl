{
  "component": {
    "version": 1,
    "id": "embeddedKnowledgeFileChooser",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_embeddedKnowledgeFileChooser_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the native embedded knowledge file chooser is visible and ready for a document path.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:dialog",
        "action:select-embedded-knowledge",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_embeddedKnowledgeFileChooser_openLocation_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "keyboard_shortcut",
      "parameters": { "keys": "ctrl+l" },
      "description": "Open the native file chooser Location field with Ctrl+L.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_embeddedKnowledgeFileChooser_assert_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:dialog", "action:select-embedded-knowledge"]
    },
    {
      "step_id": "step_embeddedKnowledgeFileChooser_typeLocation_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "/home/vscode/AgentsToolkitProjects/${{var:app_name}}/Document.docx"
      },
      "description": "Type the exact embedded knowledge document path into the native file chooser Location field.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_embeddedKnowledgeFileChooser_openLocation_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:dialog", "action:select-embedded-knowledge"]
    },
    {
      "step_id": "step_embeddedKnowledgeFileChooser_assertLocation_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the native embedded knowledge file chooser Location field visibly contains exactly /home/vscode/AgentsToolkitProjects/${{var:app_name}}/Document.docx and is ready to submit that path.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_embeddedKnowledgeFileChooser_typeLocation_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:dialog",
        "action:select-embedded-knowledge",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_embeddedKnowledgeFileChooser_submitLocation_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "keyboard_shortcut",
      "parameters": { "keys": "alt+o" },
      "description": "Use the native file chooser Open mnemonic to submit the verified embedded knowledge document path.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_embeddedKnowledgeFileChooser_assertLocation_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:dialog", "action:select-embedded-knowledge"]
    }
  ]
}
