{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "hostSurface": "teams",
    "id": "addAndOpenApp",
    "parameters": ["instanceSuffix", "readySubject"]
  },
  "steps": [
    {
      "step_id": "step_addAndOpenApp_assertAdd_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the app details popup is visible with its primary action button below the app name.",
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
        "entry_state:app-details",
        "step_retry_timeout: 180"
      ]
    },
    {
      "step_id": "step_addAndOpenApp_add_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 265,
        "y": 214
      },
      "description": "Click the visible blue \"Add\" or \"Open\" button in the Microsoft Teams app details dialog.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_addAndOpenApp_assertAdd_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:app-details",
        "ocr:true"
      ]
    },
    {
      "step_id": "step_addAndOpenApp_assertAdded_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the dialog that the app details popup opened is visible with its Open button.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_addAndOpenApp_add_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:added",
        "step_retry_timeout: 180"
      ]
    },
    {
      "step_id": "step_addAndOpenApp_open_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 529,
        "y": 506
      },
      "description": "Click the blue \"Open\" button in the \"Added successfully!\" or \"Let's go\" dialog for the app in Microsoft Teams.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_addAndOpenApp_assertAdded_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:added",
        "ocr:true"
      ]
    },
    {
      "step_id": "step_addAndOpenApp_assertReady_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion {{text:readySubject}}.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_addAndOpenApp_open_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "readiness:chat-ready",
        "step_retry_timeout: 180"
      ]
    }
  ]
}
