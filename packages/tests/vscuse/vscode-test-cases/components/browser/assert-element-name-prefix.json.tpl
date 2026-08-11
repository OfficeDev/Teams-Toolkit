{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "id": "assertElementNamePrefix",
    "parameters": ["instanceSuffix", "role", "accessibleNamePrefix"]
  },
  "steps": [
    {
      "step_id": "step_assertElementNamePrefix_assertVisible_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion a visible browser element has role {{text:role}} and an accessible name that starts with {{text:accessibleNamePrefix}}.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "action:assert-element-name-prefix",
        "step_retry_timeout: 60"
      ]
    }
  ]
}
