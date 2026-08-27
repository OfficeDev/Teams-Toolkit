{
  "component": {
    "version": 1,
    "uiSurface": "authentication",
    "account": "m365",
    "id": "signInM365FromPicker",
    "parameters": ["instanceSuffix", "accountName", "accountPassword"]
  },
  "steps": [
    {
      "step_id": "step_signInM365FromPicker_assertOption_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the ACCOUNTS section of the side bar lists an entry whose label begins with Sign in to Microsoft.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:m365",
        "entry_state:toolkit-side-bar-visible",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_signInM365FromPicker_selectOption_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 213,
        "y": 102
      },
      "description": "Click the entry whose label begins with \"Sign in to Microsoft\" in the ACCOUNTS section of the side bar.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_signInM365FromPicker_assertOption_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:213:102:16:5:9c63d67674d4c718",
        "dhash:213:102:96:5:8c512758d92c2cce",
        "dhash:213:102:0:10:92c86223a3622421"
      ],
      "postconditions": [],
      "tags": ["component:authentication", "account:m365"]
    },
    {
      "step_id": "step_signInM365FromPicker_confirmSignIn_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 762,
        "y": 97
      },
      "description": "Click the \"Sign in\" button within the Microsoft 365 developer sandbox modal.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_signInM365FromPicker_selectOption_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:762:97:16:5:24b1a72ba9aba343",
        "dhash:762:97:96:5:0008304b0f344900",
        "dhash:762:97:0:10:9c68332223232421"
      ],
      "postconditions": [],
      "tags": ["component:authentication", "account:m365"]
    },
    {
      "step_id": "step_signInM365FromPicker_useAnotherAccount_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 447,
        "y": 487
      },
      "description": "Click the \"Use another account\" option on the Microsoft \"Pick an account\" login screen in Google Chrome.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_signInM365FromPicker_confirmSignIn_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:447:487:16:5:ac534b4aaaaa6a15",
        "dhash:447:487:96:5:0100228d15a20000",
        "dhash:447:487:0:10:1312e8d89ed6e6e4"
      ],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:m365",
        "precondition_wait_timeout: 60"
      ]
    },
    {
      "step_id": "step_signInM365FromPicker_typeAccount_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": {{json:accountName}}
      },
      "description": "Enter the resolved Microsoft 365 account name into the email or username input field the account picker opened.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_signInM365FromPicker_useAnotherAccount_{{text:instanceSuffix}}"
      ],
      "preconditions": ["dhash:512:384:0:20:1392f8d8c6e6dae4"],
      "postconditions": [],
      "tags": ["component:authentication", "account:m365", "delay: 3"]
    },
    {
      "step_id": "step_signInM365FromPicker_next_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 655,
        "y": 505
      },
      "description": "Click the blue \"Next\" button on the Microsoft sign-in page, confirming the entered email address for login.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_signInM365FromPicker_typeAccount_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:655:505:16:5:0000000080400020",
        "dhash:655:505:96:5:0000408bcb4b0000",
        "dhash:655:505:0:10:1392f8d8c7e6dae4"
      ],
      "postconditions": [],
      "tags": ["component:authentication", "account:m365", "delay:3"]
    },
    {
      "step_id": "step_signInM365FromPicker_typePassword_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": {{json:accountPassword}}
      },
      "description": "Type the resolved Microsoft 365 account password into the Password field on the Microsoft login page.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_signInM365FromPicker_next_{{text:instanceSuffix}}"],
      "preconditions": ["dhash:512:384:0:20:1392e8d8d9f6e6e4"],
      "postconditions": [],
      "tags": ["component:authentication", "account:m365", "delay: 3"]
    },
    {
      "step_id": "step_signInM365FromPicker_submit_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to submit the Microsoft 365 login form from the password entry screen.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_signInM365FromPicker_typePassword_{{text:instanceSuffix}}"
      ],
      "preconditions": ["dhash:512:384:0:20:1392e8d8d9f6e6e4"],
      "postconditions": [],
      "tags": ["component:authentication", "account:m365", "delay: 3"]
    },
    {
      "step_id": "step_signInM365FromPicker_assertComplete_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the M365 Account - Sign In page says You are signed in now and can close this page.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_signInM365FromPicker_submit_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:m365",
        "step_retry_timeout: 180"
      ]
    },
    {
      "step_id": "step_signInM365FromPicker_closeBrowser_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 1008,
        "y": 19
      },
      "description": "Click the \"Close\" button (red cross icon) in the browser tab bar to close the \"M365 Account - Sign In\" page.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_signInM365FromPicker_assertComplete_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:1008:19:16:5:a322c95a325ac922",
        "dhash:1008:19:96:5:926363639200c6c4",
        "dhash:1008:19:0:10:1312094769614541"
      ],
      "postconditions": [],
      "tags": ["component:authentication", "account:m365", "delay: 3"]
    },
    {
      "step_id": "step_signInM365FromPicker_assertReady_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the \"ACCOUNTS\" section lists an entry whose label is {{text:accountName}} or that name cut short by the side bar with a trailing ellipsis.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_signInM365FromPicker_closeBrowser_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:m365",
        "readiness:account-visible",
        "step_retry_timeout: 180"
      ]
    }
  ]
}
