{
  "component": {
    "version": 1,
    "id": "clickOption",
    "answerType": "singleSelect",
    "parameters": [
      "instanceSuffix",
      "questionTitle",
      "optionLabel",
      "x",
      "y",
      "preconditions"
    ]
  },
  "steps": [
    {
      "step_id": "step_clickOption_assertPrompt_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the active prompt titled {{text:questionTitle}} is visible and the option {{text:optionLabel}} is selectable.",
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
        "interaction:click",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_clickOption_click_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": {{json:x}},
        "y": {{json:y}}
      },
      "description": "Click the {{text:optionLabel}} option in the active prompt.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_clickOption_assertPrompt_{{text:instanceSuffix}}"],
      "preconditions": {{json:preconditions}},
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:singleSelect",
        "interaction:click"
      ]
    }
  ]
}