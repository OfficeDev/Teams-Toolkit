{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "hostSurface": "teams",
    "id": "trustLocalTabCertificate",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_trustLocalTabCertificate_assertTabBar_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion Microsoft Teams is the displayed page in Google Chrome and the Chrome tab bar shows its new-tab button to the right of the open tabs.",
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
      "step_id": "step_trustLocalTabCertificate_newTab_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 295,
        "y": 21
      },
      "description": "Click the new-tab (+) button in the Google Chrome tab bar.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_trustLocalTabCertificate_assertTabBar_{{text:instanceSuffix}}"
      ],
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
      "step_id": "step_trustLocalTabCertificate_assertAddressBar_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion a new empty Google Chrome tab is displayed with its address bar ready for typing.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_trustLocalTabCertificate_newTab_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:new-tab",
        "step_retry_timeout: 60"
      ]
    },
    {
      "step_id": "step_trustLocalTabCertificate_typeUrl_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "https://localhost:3978/tabs/home"
      },
      "description": "Type the local tab page address https://localhost:3978/tabs/home into the Google Chrome address bar.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_trustLocalTabCertificate_assertAddressBar_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:new-tab"
      ]
    },
    {
      "step_id": "step_trustLocalTabCertificate_navigate_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to navigate to the typed local tab page address.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_trustLocalTabCertificate_typeUrl_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:new-tab"
      ]
    },
    {
      "step_id": "step_trustLocalTabCertificate_assertWarning_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Google Chrome certificate warning page for localhost is displayed with the button that expands its details.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_trustLocalTabCertificate_navigate_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:certificate-warning",
        "step_retry_timeout: 120"
      ]
    },
    {
      "step_id": "step_trustLocalTabCertificate_expandWarning_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 279,
        "y": 512
      },
      "description": "Click the \"Advanced\" button on the Google Chrome certificate warning page for localhost.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_trustLocalTabCertificate_assertWarning_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:certificate-warning",
        "ocr:true"
      ]
    },
    {
      "step_id": "step_trustLocalTabCertificate_assertProceed_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the expanded Google Chrome certificate warning shows the link that continues to localhost anyway.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_trustLocalTabCertificate_expandWarning_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:certificate-warning-expanded",
        "step_retry_timeout: 60"
      ]
    },
    {
      "step_id": "step_trustLocalTabCertificate_proceed_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 327,
        "y": 665
      },
      "description": "Click the \"Proceed to localhost (unsafe)\" link on the expanded Google Chrome certificate warning page.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_trustLocalTabCertificate_assertProceed_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:certificate-warning-expanded",
        "ocr:true"
      ]
    },
    {
      "step_id": "step_trustLocalTabCertificate_assertTrusted_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the page served from https://localhost:3978 is displayed instead of the certificate warning, and the Microsoft Teams tab is still open in the Google Chrome tab bar.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_trustLocalTabCertificate_proceed_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:localhost-trusted",
        "step_retry_timeout: 120"
      ]
    },
    {
      "step_id": "step_trustLocalTabCertificate_switchBack_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 175,
        "y": 19
      },
      "description": "Click the Microsoft Teams tab in the Google Chrome tab bar to return to it.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_trustLocalTabCertificate_assertTrusted_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:teams",
        "entry_state:localhost-trusted",
        "ocr:true"
      ]
    },
    {
      "step_id": "step_trustLocalTabCertificate_assertReturned_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion Microsoft Teams is again the displayed page in Google Chrome.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_trustLocalTabCertificate_switchBack_{{text:instanceSuffix}}"
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
