{
  "component": {
    "version": 1,
    "id": "rejectedAppNameOverlength",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_rejectedOverlengthAppName_assertPrompt_{{text:instanceSuffix}}",
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
      "step_id": "step_rejectedOverlengthAppName_type_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      "description": "Type the recorded thirty-three-character app name into the Application Name prompt.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_rejectedOverlengthAppName_assertPrompt_{{text:instanceSuffix}}"
      ],
      "preconditions": ["dhash:512:384:0:20:e0b09494b271706d"],
      "postconditions": [],
      "tags": ["component:quick-input", "operation:rejected-scaffold-text"]
    },
    {
      "step_id": "step_rejectedOverlengthAppName_assertError_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Application Name prompt shows \"App name is longer than the 30 characters.\"",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_rejectedOverlengthAppName_type_{{text:instanceSuffix}}"
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
      "step_id": "step_rejectedOverlengthAppName_back_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 225,
        "y": 21
      },
      "description": "Click Back in the Application Name prompt after the overlength rejection.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_rejectedOverlengthAppName_assertError_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:225:21:16:5:9332656ca5928ae5",
        "dhash:225:21:96:5:b47272b0301919b4",
        "dhash:225:21:0:10:e0b89494b2717075"
      ],
      "postconditions": [],
      "tags": ["component:quick-input", "operation:rejected-scaffold-text"]
    },
    {
      "step_id": "step_rejectedOverlengthAppName_assertFolder_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Workspace Folder prompt is visible and Default folder is selectable.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_rejectedOverlengthAppName_back_{{text:instanceSuffix}}"
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
      "step_id": "step_rejectedOverlengthAppName_folder_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 322,
        "y": 72
      },
      "description": "Click the recorded Default folder option to return to the accepted Application Name prompt.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_rejectedOverlengthAppName_assertFolder_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:322:72:16:5:00014033cb8ab6a6",
        "dhash:322:72:96:5:44a2b249ca120860",
        "dhash:322:72:0:10:f0b09494b2717075"
      ],
      "postconditions": [],
      "tags": ["component:quick-input", "operation:rejected-scaffold-text"]
    }
  ]
}
