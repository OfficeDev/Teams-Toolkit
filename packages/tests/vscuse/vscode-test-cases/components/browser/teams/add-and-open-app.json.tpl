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
        "x": 288,
        "y": 214
      },
      "description": "Click the primary action button on the app details popup within the Microsoft Teams interface.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_addAndOpenApp_assertAdd_{{text:instanceSuffix}}"],
      "preconditions": [
        "dhash:288:214:16:5:05100a0511030b12",
        "dhash:288:214:96:5:2616011c1c01005b",
        "dhash:288:214:0:10:00b4b0d8f8fcf0d8"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:app-details"
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
        "x": 533,
        "y": 508
      },
      "description": "Click Open in the dialog that the app details popup opened.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_addAndOpenApp_assertAdded_{{text:instanceSuffix}}"],
      "preconditions": [
        "dhash:533:508:16:5:00987494ca4acacc",
        "dhash:533:508:96:5:000058a48598e36b",
        "dhash:533:508:0:10:1669696969696979"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:added",
        "precondition_wait_timeout: 120"
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
