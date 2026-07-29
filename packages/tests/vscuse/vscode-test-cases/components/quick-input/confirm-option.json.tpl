{
  "component": {
    "version": 1,
    "id": "confirmOption",
    "answerType": "singleSelect",
    "parameters": [
      "instanceSuffix",
      "questionTitle",
      "optionLabel",
      "preconditions"
    ]
  },
  "steps": [
    {
      "step_id": "step_confirmOption_assertPrompt_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the active prompt titled {{text:questionTitle}} is visible and the option {{text:optionLabel}} is focused.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:singleSelect",
        "interaction:key-press",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_confirmOption_confirm_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to confirm the {{text:optionLabel}} option.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_confirmOption_assertPrompt_{{text:instanceSuffix}}"],
      "preconditions": {{json:preconditions}},
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:singleSelect",
        "interaction:key-press"
      ]
    }
  ]
}