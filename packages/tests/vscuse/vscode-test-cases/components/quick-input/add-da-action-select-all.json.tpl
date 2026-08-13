{
  "component": {
    "version": 1,
    "id": "addDaActionSelectAll",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_addDaActionSelectAll_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Select Operation(s) Copilot Can Interact with multi-select prompt is visible, and the square checkbox immediately to the left of the input box is the control for toggling all operation checkboxes.",
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
      "step_id": "step_addDaActionSelectAll_select_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 229,
        "y": 53
      },
      "description": "Click the recorded Toggle all checkboxes control.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_addDaActionSelectAll_assert_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:229:53:16:5:84840404040c4946",
        "dhash:229:53:96:5:74746c7ebd5654ed",
        "dhash:229:53:0:10:444c226363626421"
      ],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:multiSelect"]
    },
    {
      "step_id": "step_addDaActionSelectAll_confirm_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 782,
        "y": 56
      },
      "description": "Click the recorded OK button to confirm all operations.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_addDaActionSelectAll_select_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:782:56:16:5:ccd4d7c0d2c8e864",
        "dhash:782:56:96:5:142498991872301c",
        "dhash:782:56:0:10:444c2263666c6c2d"
      ],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:multiSelect"]
    }
  ]
}
