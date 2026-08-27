{
  "component": {
    "version": 1,
    "id": "addDaActionConfirm",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_addDaActionConfirm_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Microsoft 365 Agents Toolkit action confirmation dialog is visible with the Add action.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:dialog",
        "action:add-da-action",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_addDaActionConfirm_click_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 481,
        "y": 112
      },
      "description": "Click the recorded Add action.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_addDaActionConfirm_assert_{{text:instanceSuffix}}"],
      "preconditions": [
        "dhash:481:112:16:5:12c034305256cac9",
        "dhash:481:112:96:5:0000304604300200",
        "dhash:481:112:0:10:72322e6363636421"
      ],
      "postconditions": [],
      "tags": ["component:dialog", "action:add-da-action"]
    }
  ]
}
