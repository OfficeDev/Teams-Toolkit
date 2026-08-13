{
  "component": {
    "version": 1,
    "id": "developerPortalSignIn",
    "parameters": ["instanceSuffix", "accountPassword"]
  },
  "steps": [
    {
      "step_id": "step_developerPortalSignIn_assertPassword_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Microsoft sign-in password page is visible for the account retained by the preceding Microsoft 365 login.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "provider:m365",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_developerPortalSignIn_password_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "{{text:accountPassword}}"
      },
      "description": "Type the resolved Microsoft 365 password into the Developer Portal sign-in page.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_developerPortalSignIn_assertPassword_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:authentication", "provider:m365"]
    },
    {
      "step_id": "step_developerPortalSignIn_submit_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 640,
        "y": 567
      },
      "description": "Click the recorded Sign in button.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_developerPortalSignIn_password_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:640:567:16:5:8ea2a2a667509040",
        "dhash:640:567:96:5:000016e868140000",
        "dhash:640:567:0:10:1b18e0d8d9f6e6e4"
      ],
      "postconditions": [],
      "tags": ["component:authentication", "provider:m365"]
    },
    {
      "step_id": "step_developerPortalSignIn_assertStaySignedIn_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Microsoft Stay signed in prompt is visible with a Yes button.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_developerPortalSignIn_submit_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "provider:m365",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_developerPortalSignIn_staySignedIn_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 640,
        "y": 555
      },
      "description": "Click the recorded Yes button on the Stay signed in prompt.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_developerPortalSignIn_assertStaySignedIn_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:640:555:16:5:6799510995d82c93",
        "dhash:640:555:96:5:0000086060080000",
        "dhash:640:555:0:10:1818e0d8d9e6e6e4"
      ],
      "postconditions": [],
      "tags": ["component:authentication", "provider:m365"]
    }
  ]
}
