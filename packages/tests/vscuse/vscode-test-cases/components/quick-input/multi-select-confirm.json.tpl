{
  "component": {
    "version": 1,
    "id": "multiSelectConfirm",
    "answerType": "multiSelect",
    "parameters": ["instanceSuffix", "questionTitle", "selectedCount"]
  },
  "steps": [
    {
      "step_id": "step_multiSelectConfirm_assertQuestion_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the active multi-select prompt titled {{text:questionTitle}} displays exactly {{text:selectedCount}} Selected in its selection counter.",
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
      "step_id": "step_multiSelectConfirm_confirm_{{text:instanceSuffix}}",
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
      "depends_on": [
        "step_multiSelectConfirm_assertQuestion_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:multiSelect"]
    }
  ]
}
