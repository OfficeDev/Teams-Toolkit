{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "id": "assertElement",
    "parameters": ["instanceSuffix", "role", "accessibleName"]
  },
  "steps": [
    {
      "step_id": "step_assertElement_assertVisible_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion a visible browser element has role {{text:role}} and accessible name {{text:accessibleName}}.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "action:assert-element",
        "step_retry_timeout: 60"
      ]
    }
  ]
}
