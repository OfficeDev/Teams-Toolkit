{
  "component": {
    "version": 1,
    "uiSurface": "dialog",
    "id": "clickPrimaryAction",
    "parameters": ["instanceSuffix", "dialogTitle", "actionLabel"]
  },
  "steps": [
    {
      "step_id": "step_clickPrimaryAction_assertDialog_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the dialog {{text:dialogTitle}} is visible with the primary action {{text:actionLabel}}.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:dialog",
        "action:click-primary",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_clickPrimaryAction_click_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to activate the primary action {{text:actionLabel}} in the confirmed dialog.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_clickPrimaryAction_assertDialog_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:dialog", "action:click-primary"]
    }
  ]
}
