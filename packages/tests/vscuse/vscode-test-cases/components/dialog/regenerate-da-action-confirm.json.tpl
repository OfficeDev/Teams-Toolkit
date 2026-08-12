{
  "component": {
    "version": 1,
    "id": "regenerateDaActionConfirm",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_regenerateDaActionConfirm_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Microsoft 365 Agents Toolkit regeneration confirmation dialog is visible with the Regenerate action.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:dialog",
        "action:regenerate-da-action",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_regenerateDaActionConfirm_click_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 494,
        "y": 118
      },
      "description": "Click the recorded Regenerate action.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_regenerateDaActionConfirm_assert_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:494:118:16:5:88953db1cd224900",
        "dhash:494:118:96:5:0028c0a323c40200",
        "dhash:494:118:0:10:72322e6363636421"
      ],
      "postconditions": [],
      "tags": ["component:dialog", "action:regenerate-da-action"]
    }
  ]
}
