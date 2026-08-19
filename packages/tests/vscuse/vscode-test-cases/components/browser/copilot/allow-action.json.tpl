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
        "x": 333,
        "y": 327
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
      "step_id": "step_allowCopilotAction_assertRepeated_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Copilot action-consent Allow button is visible again after the first click.",
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
        "entry_state:action-consent",
        "step_retry_timeout: 120"
      ]
    },
    {
      "step_id": "step_allowCopilotAction_retry_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 333,
        "y": 327
      },
      "description": "Click the \"Allow\" button again in the Microsoft 365 Copilot chat interface to accept a repeated action-consent prompt.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_allowCopilotAction_assertRepeated_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:copilot",
        "entry_state:action-consent",
        "action:allow-retry",
        "ocr:true"
      ]
    },
    {
      "step_id": "step_allowCopilotAction_assertDismissed_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Copilot action-consent Allow button is no longer visible.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_allowCopilotAction_retry_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:copilot",
        "exit_state:action-consent-dismissed",
        "step_retry_timeout: 30"
      ]
    }
  ]
}
