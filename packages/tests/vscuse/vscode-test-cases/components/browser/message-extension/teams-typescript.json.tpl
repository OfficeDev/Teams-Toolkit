{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "hostSurface": "teams",
    "id": "validateMessageExtensionTeamsTypeScript",
    "parameters": ["instanceSuffix", "appNameSuffix"]
  },
  "steps": [
    {
      "step_id": "step_validateMessageExtensionTeamsTypeScript_01_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 877,
        "y": 724
      },
      "description": "Click the \"Actions and apps\" button (+ icon) in the message input area toolbar of the Microsoft Teams web chat interface.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "0",
      "depends_on": [],
      "preconditions": [
        "dhash:877:724:16:5:0404200404010000",
        "dhash:877:724:96:5:5644202424910000",
        "dhash:877:724:0:10:20b4b08080ac2da1"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "recording_language:typescript",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionTeamsTypeScript_02_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 780,
        "y": 386
      },
      "description": "Click the search box labeled \"Search for apps\" within the Apps panel of the Microsoft Teams web interface.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "0",
      "depends_on": [
        "step_validateMessageExtensionTeamsTypeScript_01_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:780:386:16:5:ec315b4a5a32cc92",
        "dhash:780:386:96:5:000014cbcb1400b7",
        "dhash:780:386:0:10:20b4b08083a32da1"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "recording_language:typescript",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionTeamsTypeScript_03_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "${{var:app_name}}"
      },
      "description": "Type text ${{var:app_name}} into the search bar within the Microsoft Teams web interface to find and select the app ${{var:app_name}} from search results.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "0",
      "depends_on": [
        "step_validateMessageExtensionTeamsTypeScript_02_{{text:instanceSuffix}}"
      ],
      "preconditions": ["dhash:512:384:0:20:20b4b08083a32da1"],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "recording_language:typescript",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionTeamsTypeScript_04_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion there's ${{var:app_name}}{{text:appNameSuffix}} in search result list.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionTeamsTypeScript_03_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "recording_language:typescript",
        "entry_state:chat-ready",
        "check:message-extension",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionTeamsTypeScript_05_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 972,
        "y": 511
      },
      "description": "Click the \"${{var:app_name}}{{text:appNameSuffix}}\" search result in the app search dropdown within the Microsoft Teams app.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "0",
      "depends_on": [
        "step_validateMessageExtensionTeamsTypeScript_04_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:972:511:16:5:0000000000000000",
        "dhash:972:511:96:5:0101050d05050101",
        "dhash:972:511:0:10:30b8b08381a92ca1"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "recording_language:typescript",
        "entry_state:chat-ready",
        "check:message-extension",
        "precondition_wait_timeout: 60"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionTeamsTypeScript_06_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "test"
      },
      "description": "Type 'test' into the command input box of the extension within the Microsoft Teams web application.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "0",
      "depends_on": [
        "step_validateMessageExtensionTeamsTypeScript_05_{{text:instanceSuffix}}"
      ],
      "preconditions": ["dhash:512:384:0:20:30b8b08383ac2ca1"],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "recording_language:typescript",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionTeamsTypeScript_07_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion there's \"Item 1\" exist.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionTeamsTypeScript_06_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "recording_language:typescript",
        "entry_state:chat-ready",
        "check:message-extension",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionTeamsTypeScript_08_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 862,
        "y": 511
      },
      "description": "Click the \"Item 1\" result in the message extension search panel within the Microsoft Teams web app, directly on the line displaying \"This is the first item and this is your search query: test\".",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "0",
      "depends_on": [
        "step_validateMessageExtensionTeamsTypeScript_07_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:862:511:16:5:aa6aaa9b6a800000",
        "dhash:862:511:96:5:0001c49b008c9d58",
        "dhash:862:511:0:10:30b8b08383b22aa1"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "recording_language:typescript",
        "entry_state:chat-ready",
        "check:message-extension",
        "precondition_wait_timeout:60"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionTeamsTypeScript_09_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 926,
        "y": 717
      },
      "description": "Click the \"Send\" button (paper plane icon) in the message input area of a Microsoft Teams chat window to submit a message.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "0",
      "depends_on": [
        "step_validateMessageExtensionTeamsTypeScript_08_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:926:717:16:5:ccf37c0f030f7cf2",
        "dhash:926:717:96:5:59d932cb8a368600",
        "dhash:926:717:0:10:30b8b480acacb4a9"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "recording_language:typescript",
        "entry_state:chat-ready",
        "check:message-extension",
        "delay: 3"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionTeamsTypeScript_10_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion there's \"This is the first item and this is your search query: test\" exist.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "0",
      "depends_on": [
        "step_validateMessageExtensionTeamsTypeScript_09_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "recording_language:typescript",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    }
  ]
}
