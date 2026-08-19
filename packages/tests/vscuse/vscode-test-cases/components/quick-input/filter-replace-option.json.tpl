{
  "component": {
    "version": 1,
    "id": "filterReplaceOption",
    "answerType": "singleSelect",
    "parameters": ["instanceSuffix", "optionLabel"]
  },
  "steps": [
    {
      "step_id": "step_filterReplaceOption_selectAll_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "keyboard_shortcut",
      "parameters": {
        "keys": "ctrl+a"
      },
      "description": "Select all existing text in the active option picker.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:singleSelect"]
    },
    {
      "step_id": "step_filterReplaceOption_filter_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": {{json:optionLabel}}
      },
      "description": "Replace the active option picker's filter with the resolved option label.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_filterReplaceOption_selectAll_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:singleSelect"]
    },
    {
      "step_id": "step_filterReplaceOption_assertOption_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the option {{text:optionLabel}} is visible and selectable in the filtered option picker.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_filterReplaceOption_filter_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:singleSelect",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_filterReplaceOption_confirm_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to confirm the filtered option.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_filterReplaceOption_assertOption_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:singleSelect"]
    }
  ]
}
