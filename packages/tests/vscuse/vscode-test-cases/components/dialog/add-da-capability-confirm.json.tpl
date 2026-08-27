{
  "component": {
    "version": 1,
    "id": "addDaCapabilityConfirm",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_addDaCapabilityConfirm_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Microsoft 365 Agents Toolkit capability confirmation dialog is visible with the Add action.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:dialog",
        "action:add-capability",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_addDaCapabilityConfirm_click_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 495,
        "y": 116
      },
      "description": "Click the recorded Add action.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_addDaCapabilityConfirm_assert_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:495:116:16:5:c6d6b626b7de208c",
        "dhash:495:116:96:5:0008609818640800",
        "dhash:495:116:0:10:52322e6363636c2d"
      ],
      "postconditions": [],
      "tags": ["component:dialog", "action:add-capability"]
    }
  ]
}
