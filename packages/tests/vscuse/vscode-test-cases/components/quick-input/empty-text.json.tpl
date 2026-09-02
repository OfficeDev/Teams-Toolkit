{
  "component": {
    "version": 1,
    "id": "emptyTextInput",
    "answerType": "text",
    "parameters": ["instanceSuffix", "questionTitle"]
  },
  "steps": [
    {
      "step_id": "step_emptyTextInput_assertQuestion_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the active prompt titled {{text:questionTitle}} is visible and its text input is empty.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:text",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_emptyTextInput_confirm_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to submit the empty text input.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_emptyTextInput_assertQuestion_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:text"]
    }
  ]
}
