{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "hostSurface": "copilot",
    "id": "sendCopilotMessage",
    "parameters": ["instanceSuffix", "message"]
  },
  "steps": [
    {
      "step_id": "step_sendCopilotMessage_assertInput_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Microsoft 365 Copilot message input is visible and its placeholder text starts with Message ${{var:app_name}}.",
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
        "entry_state:chat-ready",
        "action:send-message",
        "step_retry_timeout: 120"
      ]
    },
    {
      "step_id": "step_sendCopilotMessage_focusInput_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 416,
        "y": 369
      },
      "description": "Click the \"Message ${{var:app_name}}\" input box in the Microsoft 365 Copilot web application.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_sendCopilotMessage_assertInput_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:copilot",
        "entry_state:chat-ready",
        "action:send-message",
        "ocr:true"
      ]
    },
    {
      "step_id": "step_sendCopilotMessage_type_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "{{text:message}}"
      },
      "description": "Type \"{{text:message}}\" into the Copilot message input.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_sendCopilotMessage_focusInput_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:copilot",
        "entry_state:chat-ready",
        "action:send-message"
      ]
    },
    {
      "step_id": "step_sendCopilotMessage_send_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to send the Copilot message.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_sendCopilotMessage_type_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:copilot",
        "entry_state:chat-ready",
        "action:send-message"
      ]
    }
  ]
}
