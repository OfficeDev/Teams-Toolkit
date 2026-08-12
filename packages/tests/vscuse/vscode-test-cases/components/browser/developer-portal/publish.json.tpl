{
  "component": {
    "version": 1,
    "id": "publishDeveloperPortal",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_publishDeveloperPortal_assertReady_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Developer Portal Publish to your org page is visible with the Publish your app button.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "surface:developer-portal",
        "step_retry_timeout: 60"
      ]
    },
    {
      "step_id": "step_publishDeveloperPortal_publish_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 767,
        "y": 672
      },
      "description": "Click the recorded Publish your app button.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_publishDeveloperPortal_assertReady_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:767:672:16:5:4929699449000000",
        "dhash:767:672:96:5:a048a4e448800000",
        "dhash:767:672:0:10:1b1c9087acab93b3"
      ],
      "postconditions": [],
      "tags": ["component:browser", "surface:developer-portal"]
    },
    {
      "step_id": "step_publishDeveloperPortal_assertSubmitted_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Developer Portal submission shows Status Submitted.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_publishDeveloperPortal_publish_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "surface:developer-portal",
        "step_retry_timeout: 120"
      ]
    },
    {
      "step_id": "step_publishDeveloperPortal_close_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 1007,
        "y": 20
      },
      "description": "Click the recorded Close button on the submitted Developer Portal window.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_publishDeveloperPortal_assertSubmitted_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:1007:20:16:5:13ec4c39394cec13",
        "dhash:1007:20:96:5:926363639200c6c4",
        "dhash:1007:20:0:10:1b1c9087aeac98b0"
      ],
      "postconditions": [],
      "tags": ["component:browser", "surface:developer-portal"]
    },
    {
      "step_id": "step_publishDeveloperPortal_assertLeave_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Leave site confirmation is visible with a Leave button.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_publishDeveloperPortal_close_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "surface:developer-portal",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_publishDeveloperPortal_leave_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 672,
        "y": 191
      },
      "description": "Click the recorded Leave button.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_publishDeveloperPortal_assertLeave_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:672:191:16:5:8de6723b4b79229d",
        "dhash:672:191:96:5:4012276969170041",
        "dhash:672:191:0:10:79616087292d1131"
      ],
      "postconditions": [],
      "tags": ["component:browser", "surface:developer-portal"]
    }
  ]
}
