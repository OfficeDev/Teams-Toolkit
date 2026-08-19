{
  "component": {
    "version": 1,
    "id": "filterSecondOption",
    "answerType": "singleSelect",
    "parameters": [
      "initialOptionLabel",
      "instanceSuffix",
      "optionLabel"
    ]
  },
  "steps": [
    {
      "step_id": "step_filterSecondOption_selectExistingQuery_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "keyboard_shortcut",
      "parameters": {
        "keys": "ctrl+a"
      },
      "description": "Select the option picker's existing query so the resolved option label replaces it.",
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
      "step_id": "step_filterSecondOption_filter_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": {{json:optionLabel}}
      },
      "description": "Type the resolved option label into the active option picker.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_filterSecondOption_selectExistingQuery_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:singleSelect"]
    },
    {
      "step_id": "step_filterSecondOption_assertResults_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the filtered option picker shows {{text:initialOptionLabel}} as the highlighted first result and {{text:optionLabel}} as the second selectable result.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_filterSecondOption_filter_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:singleSelect",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_filterSecondOption_next_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "down"
      },
      "description": "Press Down to highlight the second filtered option.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_filterSecondOption_assertResults_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:singleSelect"]
    },
    {
      "step_id": "step_filterSecondOption_assertOption_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the option {{text:optionLabel}} is highlighted in the filtered option picker.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_filterSecondOption_next_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:singleSelect",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_filterSecondOption_confirm_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to confirm the highlighted filtered option.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_filterSecondOption_assertOption_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:singleSelect"]
    }
  ]
}
