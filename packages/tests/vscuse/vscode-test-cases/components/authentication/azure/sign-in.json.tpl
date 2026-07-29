{
  "component": {
    "version": 1,
    "uiSurface": "authentication",
    "account": "azure",
    "id": "signInAzure",
    "parameters": ["instanceSuffix", "accountName", "accountPassword"]
  },
  "steps": [
    {
      "step_id": "step_signInAzure_assertOption_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the ACCOUNTS section of the side bar lists an entry labeled Sign in to Azure.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:azure",
        "entry_state:toolkit-side-bar-visible",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_signInAzure_selectOption_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 165,
        "y": 127
      },
      "description": "Click the \"Sign in to Azure\" entry in the ACCOUNTS section of the side bar.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_signInAzure_assertOption_{{text:instanceSuffix}}"],
      "preconditions": [
        "dhash:165:127:16:5:5819353567ef55aa",
        "dhash:165:127:96:5:2cd1259b9b941a6a",
        "dhash:165:127:0:10:a2942223a3222421"
      ],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:azure"
      ]
    },
    {
      "step_id": "step_signInAzure_confirmSignIn_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 534,
        "y": 98
      },
      "description": "Click the \"Sign in\" button on the Microsoft authentication popup in Visual Studio Code to proceed with Azure authorization for the Microsoft 365 Agents Toolkit.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_signInAzure_selectOption_{{text:instanceSuffix}}"],
      "preconditions": [
        "dhash:534:98:16:5:554a54555555468f",
        "dhash:534:98:96:5:0002740b0a700800",
        "dhash:534:98:0:10:12322e2323232421"
      ],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:azure"
      ]
    },
    {
      "step_id": "step_signInAzure_allow_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 457,
        "y": 96
      },
      "description": "Click the \"Allow\" button in the Microsoft 365 sign-in prompt to authorize the extension \"Microsoft 365 Agents Toolkit\" within Visual Studio Code.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_signInAzure_confirmSignIn_{{text:instanceSuffix}}"],
      "preconditions": [
        "dhash:457:96:16:5:524d5552564cb3ca",
        "dhash:457:96:96:5:0004609c0c600400",
        "dhash:457:96:0:10:d2322e2323232421"
      ],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:azure"
      ]
    },
    {
      "step_id": "step_signInAzure_focusAccount_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 432,
        "y": 327
      },
      "description": "Click on the \"Email, phone, or Skype\" input field in the Microsoft sign-in dialog on the login.microsoftonline.com webpage to activate text entry.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_signInAzure_allow_{{text:instanceSuffix}}"],
      "preconditions": [
        "dhash:432:327:16:5:114c134b4a13b2cc",
        "dhash:432:327:96:5:686000a2a95500cb",
        "dhash:432:327:0:10:1361717965617935"
      ],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:azure",
        "precondition_wait_timeout: 60"
      ]
    },
    {
      "step_id": "step_signInAzure_typeAccount_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": {{json:accountName}}
      },
      "description": "Enter the resolved Azure account name into the email or username input field on the Microsoft Sign in page.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_signInAzure_focusAccount_{{text:instanceSuffix}}"],
      "preconditions": ["dhash:512:384:0:20:1b28d0d9e7e4dae4"],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:azure",
        "precondition_wait_timeout: 60"
      ]
    },
    {
      "step_id": "step_signInAzure_next_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 631,
        "y": 462
      },
      "description": "Click the \"Next\" button on the Microsoft sign-in page to continue Azure authentication.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_signInAzure_typeAccount_{{text:instanceSuffix}}"],
      "preconditions": [
        "dhash:631:462:16:5:0000000091000000",
        "dhash:631:462:96:5:000000004e31314e",
        "dhash:631:462:0:10:1392f0dac6e6d8e4"
      ],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:azure",
        "ocr:true"
      ]
    },
    {
      "step_id": "step_signInAzure_typePassword_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": {{json:accountPassword}}
      },
      "description": "Type the resolved Azure account password into the Password field on the Microsoft login page.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_signInAzure_next_{{text:instanceSuffix}}"],
      "preconditions": ["dhash:512:384:0:20:1908f0d9d1e6e6e4"],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:azure",
        "precondition_wait_timeout: 60",
        "delay:5"
      ]
    },
    {
      "step_id": "step_signInAzure_submit_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter in the password field on the Microsoft login page to submit the Azure credentials.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_signInAzure_typePassword_{{text:instanceSuffix}}"],
      "preconditions": ["dhash:512:384:0:20:1908f0d9d1e6e6e4"],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:azure",
        "delay: 3"
      ]
    },
    {
      "step_id": "step_signInAzure_closeBrowser_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 991,
        "y": 18
      },
      "description": "Click the red close (X) button in the top-right corner of the Google Chrome window to close the Visual Studio Code sign-in confirmation page.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_signInAzure_submit_{{text:instanceSuffix}}"],
      "preconditions": [
        "dhash:991:18:16:5:b020624245454242",
        "dhash:991:18:96:5:629393936a903232",
        "dhash:991:18:0:10:0021410169414141"
      ],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:azure",
        "delay: 3"
      ]
    },
    {
      "step_id": "step_signInAzure_assertReady_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion there's {{text:accountName}} in the \"ACCOUNTS\" section",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_signInAzure_closeBrowser_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "account:azure",
        "readiness:account-visible",
        "step_retry_timeout: 180"
      ]
    }
  ]
}