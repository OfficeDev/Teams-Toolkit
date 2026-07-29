{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "hostSurface": "copilot",
    "id": "allowCopilotAction",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_allowCopilotAction_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Copilot action-consent Allow button is visible.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:copilot",
        "entry_state:action-consent",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_allowCopilotAction_click_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 340,
        "y": 354
      },
      "description": "Click the \"Allow\" button in the Microsoft 365 Copilot chat interface to grant the agent access.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_allowCopilotAction_assert_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:copilot",
        "entry_state:action-consent",
        "action:allow",
        "ocr:true"
      ]
    },
    {
      "step_id": "step_allowCopilotAction_assertDismissed_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Copilot action-consent prompt is no longer visible.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_allowCopilotAction_click_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:copilot",
        "exit_state:assistant-response-pending",
        "step_retry_timeout: 30"
      ]
    }
  ]
}
