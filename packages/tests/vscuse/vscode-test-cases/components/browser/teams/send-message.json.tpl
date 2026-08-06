{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "hostSurface": "teams",
    "id": "sendTeamsMessage",
    "parameters": ["instanceSuffix", "message"]
  },
  "steps": [
    {
      "step_id": "step_sendTeamsMessage_assertInput_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Teams \"Type a message\" input is visible.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:chat-ready",
        "action:send-message",
        "step_retry_timeout: 120"
      ]
    },
    {
      "step_id": "step_sendTeamsMessage_focusInput_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 200,
        "y": 712
      },
      "description": "Click the Teams \"Type a message\" input.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_sendTeamsMessage_assertInput_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:200:712:16:5:258c421e0d2c2d1c",
        "dhash:200:712:96:5:0020887362000200",
        "dhash:200:712:0:10:24b4b08e8e8c81a1"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:chat-ready",
        "action:send-message"
      ]
    },
    {
      "step_id": "step_sendTeamsMessage_type_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "{{text:message}}"
      },
      "description": "Type \"{{text:message}}\" into the Teams message input.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_sendTeamsMessage_focusInput_{{text:instanceSuffix}}"
      ],
      "preconditions": ["dhash:512:384:0:20:24b4b08e8e8c80a9"],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:chat-ready",
        "action:send-message"
      ]
    },
    {
      "step_id": "step_sendTeamsMessage_send_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to send the Teams message.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_sendTeamsMessage_type_{{text:instanceSuffix}}"],
      "preconditions": ["dhash:512:384:0:20:24b4b08e8e8c80b9"],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:chat-ready",
        "action:send-message"
      ]
    }
  ]
}
