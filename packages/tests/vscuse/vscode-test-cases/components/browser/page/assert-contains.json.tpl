{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "id": "assertPageContains",
    "parameters": ["instanceSuffix", "expectedText"]
  },
  "steps": [
    {
      "step_id": "step_assertPageContains_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the page the current target opened contains \"{{text:expectedText}}\".",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "action:assert-page-content",
        "expectation:contains",
        "step_retry_timeout: 120"
      ]
    }
  ]
}
