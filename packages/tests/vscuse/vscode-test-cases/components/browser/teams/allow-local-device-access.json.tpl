{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "hostSurface": "teams",
    "id": "allowLocalDeviceAccess",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_allowLocalDeviceAccess_assertPrompt_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion Google Chrome is displaying a teams.cloud.microsoft permission prompt that asks to access other apps and services on this device and its Allow button is available.",
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
        "entry_state:local-device-access-prompt",
        "step_retry_timeout: 120"
      ]
    },
    {
      "step_id": "step_allowLocalDeviceAccess_allow_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 389,
        "y": 241
      },
      "description": "Click Allow in the teams.cloud.microsoft permission prompt that asks to access other apps and services on this device.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_allowLocalDeviceAccess_assertPrompt_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:local-device-access-prompt",
        "ocr:true"
      ]
    },
    {
      "step_id": "step_allowLocalDeviceAccess_assertDismissed_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the teams.cloud.microsoft permission prompt asking to access other apps and services on this device is no longer visible and the Microsoft Teams tab page remains displayed in Google Chrome.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_allowLocalDeviceAccess_allow_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "exit_state:teams-app-tab",
        "step_retry_timeout: 120"
      ]
    }
  ]
}