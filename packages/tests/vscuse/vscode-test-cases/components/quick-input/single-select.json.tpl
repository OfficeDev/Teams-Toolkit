{
  "component": {
    "version": 1,
    "id": "singleSelect",
    "answerType": "singleSelect",
    "parameters": ["instanceSuffix", "questionTitle", "optionLabel"]
  },
  "steps": [
    {
      "step_id": "step_singleSelect_assertQuestion_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the active prompt titled {{text:questionTitle}} is visible.",
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
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_singleSelect_assertOptionsLoaded_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the prompt titled {{text:questionTitle}} lists at least one option below its input box.",
      "content_refs": [],
      "timeout": 120,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_singleSelect_assertQuestion_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:singleSelect",
        "step_retry_timeout: 120"
      ]
    },
    {
      "step_id": "step_singleSelect_filter_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": {{json:optionLabel}}
      },
      "description": "Type the resolved option label {{text:optionLabel}} into the active single-select prompt.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_singleSelect_assertOptionsLoaded_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:singleSelect"]
    },
    {
      "step_id": "step_singleSelect_assertOption_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the option {{text:optionLabel}} is visible and selectable in the filtered single-select prompt.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_singleSelect_filter_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:singleSelect",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_singleSelect_confirm_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to confirm the filtered single-select option.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_singleSelect_assertOption_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:singleSelect"]
    }
  ]
}