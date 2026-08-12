{
  "component": {
    "version": 1,
    "id": "rejectedAppNameInvalidCharacters",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_rejectedInvalidAppName_assertPrompt_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Application Name prompt is visible and ready for text input.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "operation:rejected-scaffold-text"]
    },
    {
      "step_id": "step_rejectedInvalidAppName_type_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "g#ed!-k?/h"
      },
      "description": "Type the recorded invalid-character app name into the Application Name prompt.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_rejectedInvalidAppName_assertPrompt_{{text:instanceSuffix}}"
      ],
      "preconditions": ["dhash:512:384:0:20:c0b89494b2717075"],
      "postconditions": [],
      "tags": ["component:quick-input", "operation:rejected-scaffold-text"]
    },
    {
      "step_id": "step_rejectedInvalidAppName_assertError_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Application Name prompt shows \"App name needs to begin with letters, include minimum two letters or digits, and exclude certain special characters.\"",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_rejectedInvalidAppName_type_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "operation:rejected-scaffold-text",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_rejectedInvalidAppName_back_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 228,
        "y": 15
      },
      "description": "Click Back in the Application Name prompt after the invalid-character rejection.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_rejectedInvalidAppName_assertError_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:228:15:16:5:aac01865ca94b8d7",
        "dhash:228:15:96:5:3070703335b41230",
        "dhash:228:15:0:10:e0b89494b2717075"
      ],
      "postconditions": [],
      "tags": ["component:quick-input", "operation:rejected-scaffold-text"]
    },
    {
      "step_id": "step_rejectedInvalidAppName_assertFolder_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Workspace Folder prompt is visible and Default folder is selectable.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_rejectedInvalidAppName_back_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "operation:rejected-scaffold-text",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_rejectedInvalidAppName_folder_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 368,
        "y": 75
      },
      "description": "Click the recorded Default folder option to return to Application Name.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_rejectedInvalidAppName_assertFolder_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:368:75:16:5:60156a655559999b",
        "dhash:368:75:96:5:94222286a2460e00",
        "dhash:368:75:0:10:f0b09494b2717075"
      ],
      "postconditions": [],
      "tags": ["component:quick-input", "operation:rejected-scaffold-text"]
    }
  ]
}
