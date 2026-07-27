{
  "component": {
    "version": 1,
    "uiSurface": "quickInput",
    "id": "confirm",
    "answerType": "confirm",
    "parameters": ["instanceSuffix", "questionTitle", "optionLabel"]
  },
  "steps": [
    {
      "step_id": "step_confirm_assertQuestion_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the confirmation question {{text:questionTitle}} is visible and the option {{text:optionLabel}} is focused.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:confirm",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_confirm_confirm_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to confirm the focused option.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_confirm_assertQuestion_{{text:instanceSuffix}}"],
      "preconditions": ["dhash:512:384:0:20:a4843a23233b2e2d"],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:confirm"]
    }
  ]
}
