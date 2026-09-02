{
  "component": {
    "version": 1,
    "uiSurface": "dialog",
    "id": "assertM365AccountRequired",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_assertM365AccountRequired_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion a Microsoft 365 Agents Toolkit modal is visible whose message begins with the literal text Microsoft 365 Agents Toolkit needs a Microsoft 365 account.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:dialog",
        "action:assert-m365-account-required",
        "step_retry_timeout: 30"
      ]
    }
  ]
}
