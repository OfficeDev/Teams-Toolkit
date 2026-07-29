{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "hostSurface": "playground",
    "id": "sendPlaygroundMessage",
    "parameters": ["instanceSuffix", "message"]
  },
  "steps": [
    {
      "step_id": "step_sendPlaygroundMessage_assertInput_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Agents Playground \"Type a message...\" input is visible.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "entry_state:chat-ready",
        "action:send-message",
        "step_retry_timeout: 120"
      ]
    },
    {
      "step_id": "step_sendPlaygroundMessage_focusInput_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 176,
        "y": 710
      },
      "description": "Click the Agents Playground \"Type a message...\" input.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_sendPlaygroundMessage_assertInput_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:176:710:16:5:00000000006858d8",
        "dhash:176:710:96:5:00000000303a8000",
        "dhash:176:710:0:10:5c4a03c080828240"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "entry_state:chat-ready",
        "action:send-message"
      ]
    },
    {
      "step_id": "step_sendPlaygroundMessage_type_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "{{text:message}}"
      },
      "description": "Type \"{{text:message}}\" into the Agents Playground message input.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_sendPlaygroundMessage_focusInput_{{text:instanceSuffix}}"
      ],
      "preconditions": ["dhash:512:384:0:20:5c4a03c080828260"],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "entry_state:chat-ready",
        "action:send-message"
      ]
    },
    {
      "step_id": "step_sendPlaygroundMessage_send_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to send the Agents Playground message.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_sendPlaygroundMessage_type_{{text:instanceSuffix}}"],
      "preconditions": ["dhash:512:384:0:20:5c4a03c080828260"],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "entry_state:chat-ready",
        "action:send-message"
      ]
    }
  ]
}
