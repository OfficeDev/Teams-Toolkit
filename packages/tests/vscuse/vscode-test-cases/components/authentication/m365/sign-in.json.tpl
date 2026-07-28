{
  "component": {
    "version": 1,
    "uiSurface": "authentication",
    "account": "m365",
    "id": "signInM365",
    "parameters": ["instanceSuffix", "accountName", "accountPassword"]
  },
  "steps": [
    {
      "step_id": "step_signInM365_assertOption_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion Sign in to Microsoft 365 is visible and selectable in the active account menu.",
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
        "entry_state:account-menu-open",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_signInM365_selectOption_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 379,
        "y": 52
      },
      "description": "Click the \"Sign in to Microsoft 365\" option from the dropdown menu in the Microsoft 365 Agents Toolkit section of the Visual Studio Code interface.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_signInM365_assertOption_{{text:instanceSuffix}}"],
      "preconditions": [
        "dhash:379:52:16:5:c6392121998d30ce",
        "dhash:379:52:96:5:002058a020586020",
        "dhash:379:52:0:10:c824222323232421"
      ],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:m365"
      ]
    },
    {
      "step_id": "step_signInM365_confirmSignIn_{{text:instanceSuffix}}",
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
      "depends_on": ["step_signInM365_selectOption_{{text:instanceSuffix}}"],
      "preconditions": [
        "dhash:762:97:16:5:24b1a72ba9aba343",
        "dhash:762:97:96:5:0008304b0f344900",
        "dhash:762:97:0:10:9c68332223232421"
      ],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:m365"
      ]
    },
    {
      "step_id": "step_signInM365_focusAccount_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 369,
        "y": 350
      },
      "description": "Click on the \"Email or phone\" input field in the Microsoft Sign-in form on the login.microsoftonline.com webpage to focus the cursor for credential entry.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_signInM365_confirmSignIn_{{text:instanceSuffix}}"],
      "preconditions": [
        "dhash:369:350:16:5:2113d25252525221",
        "dhash:369:350:96:5:0919006d19220812",
        "dhash:369:350:0:10:1b88d0d1e5e6dae4"
      ],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:m365",
        "precondition_wait_timeout: 60"
      ]
    },
    {
      "step_id": "step_signInM365_typeAccount_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": {{json:accountName}}
      },
      "description": "Enter the resolved Microsoft 365 account name into the email or username input field on the Microsoft Sign in page.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_signInM365_focusAccount_{{text:instanceSuffix}}"],
      "preconditions": ["dhash:512:384:0:20:1b28f0d9e7e6dae4"],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:m365",
        "delay: 3"
      ]
    },
    {
      "step_id": "step_signInM365_next_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 629,
        "y": 484
      },
      "description": "Click the blue \"Next\" button on the Microsoft sign-in page, confirming the entered email address for login.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_signInM365_typeAccount_{{text:instanceSuffix}}"],
      "preconditions": [
        "dhash:629:484:16:5:23248c4b6c24d32c",
        "dhash:629:484:96:5:00004eb131860000",
        "dhash:629:484:0:10:1b28f0d9e7e6dae4"
      ],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:m365",
        "delay:3"
      ]
    },
    {
      "step_id": "step_signInM365_typePassword_{{text:instanceSuffix}}",
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
      "depends_on": ["step_signInM365_next_{{text:instanceSuffix}}"],
      "preconditions": ["dhash:512:384:0:20:1b08f0d9d1e6e6e4"],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:m365",
        "delay: 3"
      ]
    },
    {
      "step_id": "step_signInM365_submit_{{text:instanceSuffix}}",
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
      "depends_on": ["step_signInM365_typePassword_{{text:instanceSuffix}}"],
      "preconditions": ["dhash:512:384:0:20:1b08f0d9d1e6e6e4"],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:m365",
        "delay: 3"
      ]
    },
    {
      "step_id": "step_signInM365_closeBrowser_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 1004,
        "y": 19
      },
      "description": "Click the \"Close\" button (red cross icon) in the browser tab bar to close the \"M365 Account - Sign In\" page.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_signInM365_submit_{{text:instanceSuffix}}"],
      "preconditions": [
        "dhash:1004:19:16:5:aac833964c9633cc",
        "dhash:1004:19:96:5:d2232323c200e6e6",
        "dhash:1004:19:0:10:0b01410169414141"
      ],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:m365",
        "delay: 3"
      ]
    },
    {
      "step_id": "step_signInM365_assertReady_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion there's {{text:accountName}} in the \"ACCOUNTS\" section",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_signInM365_closeBrowser_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:m365",
        "readiness:account-visible",
        "step_retry_timeout: 60"
      ]
    }
  ]
}