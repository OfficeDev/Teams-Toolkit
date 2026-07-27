{
  "component": {
    "version": 1,
    "id": "multiSelect",
    "answerType": "multiSelect",
    "parameters": ["instanceSuffix", "questionTitle", "optionLabel"]
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
      "step_id": "step_multiSelect_filter_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": {{json:optionLabel}}
      },
      "description": "Type the resolved option label {{text:optionLabel}} into the active multi-select prompt.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_multiSelect_assertQuestion_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:multiSelect"]
    },
    {
      "step_id": "step_multiSelect_assertOption_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the option {{text:optionLabel}} is visible and selectable in the filtered multi-select prompt.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_multiSelect_filter_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:multiSelect",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_multiSelect_focusOption_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "down"
      },
      "description": "Press Down to focus the filtered {{text:optionLabel}} option.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_multiSelect_assertOption_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:multiSelect"]
    },
    {
      "step_id": "step_multiSelect_assertFocused_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the filtered {{text:optionLabel}} option is focused in the active multi-select prompt.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_multiSelect_focusOption_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:multiSelect",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_multiSelect_toggle_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "space"
      },
      "description": "Press Space to toggle the focused {{text:optionLabel}} option.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_multiSelect_assertFocused_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:multiSelect"]
    },
    {
      "step_id": "step_multiSelect_assertSelected_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the {{text:optionLabel}} option has a checked checkbox in the active multi-select prompt.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_multiSelect_toggle_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:multiSelect",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_multiSelect_selectFilter_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "keyboard_shortcut",
      "parameters": {
        "keys": "ctrl+a"
      },
      "description": "Select the current multi-select filter text.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_multiSelect_assertSelected_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:multiSelect"]
    },
    {
      "step_id": "step_multiSelect_clearFilter_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "backspace"
      },
      "description": "Clear the current multi-select filter text.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_multiSelect_selectFilter_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:multiSelect"]
    }
  ]
}