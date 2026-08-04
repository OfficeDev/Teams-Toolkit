{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "hostSurface": "teams",
    "id": "reloadApp",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_reloadApp_assertOverflow_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Microsoft Teams header for an app whose name starts with ${{var:app_name}} shows its more-options button.",
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
        "entry_state:teams-app-tab",
        "step_retry_timeout: 120"
      ]
    },
    {
      "step_id": "step_reloadApp_openOverflow_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 995,
        "y": 198
      },
      "description": "Click the more-options (\"...\") button in the Microsoft Teams header for the app.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_reloadApp_assertOverflow_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:teams-app-tab",
        "ocr:true"
      ]
    },
    {
      "step_id": "step_reloadApp_assertMenu_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Microsoft Teams more-options menu is open with its \"Reload app\" command.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_reloadApp_openOverflow_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:more-options-menu",
        "step_retry_timeout: 60"
      ]
    },
    {
      "step_id": "step_reloadApp_reload_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 933,
        "y": 231
      },
      "description": "Click \"Reload app\" in the Microsoft Teams more-options menu.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_reloadApp_assertMenu_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:more-options-menu",
        "ocr:true"
      ]
    },
    {
      "step_id": "step_reloadApp_assertPermission_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the browser permission prompt raised by teams.cloud.microsoft is visible with its Allow button.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_reloadApp_reload_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:permission-prompt",
        "step_retry_timeout: 120"
      ]
    },
    {
      "step_id": "step_reloadApp_allow_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 399,
        "y": 235
      },
      "description": "Click the \"Allow\" button on the browser permission prompt raised by teams.cloud.microsoft.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_reloadApp_assertPermission_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:permission-prompt",
        "ocr:true"
      ]
    },
    {
      "step_id": "step_reloadApp_assertRendered_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Microsoft Teams tab for an app whose name starts with ${{var:app_name}} shows its rendered page content instead of an empty frame.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_reloadApp_allow_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "exit_state:tab-content-rendered",
        "step_retry_timeout: 180"
      ]
    }
  ]
}
