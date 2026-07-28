{
  "component": {
    "version": 1,
    "id": "multiSelect",
    "answerType": "multiSelect",
    "parameters": ["instanceSuffix", "questionTitle"]
  },
  "steps": [
    {
      "step_id": "step_multiSelect_assertQuestion_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the active multi-select prompt titled {{text:questionTitle}} is visible.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:multiSelect",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_multiSelect_assertOptionsLoaded_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the multi-select prompt titled {{text:questionTitle}} lists at least one option below its input box.",
      "content_refs": [],
      "timeout": 120,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_multiSelect_assertQuestion_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:multiSelect",
        "step_retry_timeout: 120"
      ]
    },
    {
      "step_id": "step_multiSelect_focusSelectAll_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "keyboard_shortcut",
      "parameters": {
        "keys": "shift+tab"
      },
      "description": "Move focus from the multi-select input box to the select-all checkbox of the prompt.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_multiSelect_assertOptionsLoaded_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:multiSelect"]
    },
    {
      "step_id": "step_multiSelect_selectAll_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "space"
      },
      "description": "Press Space to check every option of the multi-select prompt.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_multiSelect_focusSelectAll_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:multiSelect"]
    },
    {
      "step_id": "step_multiSelect_restoreFocus_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "keyboard_shortcut",
      "parameters": {
        "keys": "tab"
      },
      "description": "Move focus from the select-all checkbox back to the multi-select input box.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_multiSelect_selectAll_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:multiSelect"]
    },
    {
      "step_id": "step_multiSelect_assertSelected_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion every option listed in the multi-select prompt titled {{text:questionTitle}} has a checked checkbox.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_multiSelect_restoreFocus_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:multiSelect",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_multiSelect_confirm_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to confirm the multi-select prompt.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_multiSelect_assertSelected_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:multiSelect"]
    }
  ]
}