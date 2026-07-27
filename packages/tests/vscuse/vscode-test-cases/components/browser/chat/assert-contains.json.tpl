{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "id": "assertChatContains",
    "parameters": ["instanceSuffix", "expectedText"]
  },
  "steps": [
    {
      "step_id": "step_assertChatContains_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the current assistant response contains \"{{text:expectedText}}\".",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "action:assert-chat-response",
        "expectation:contains",
        "step_retry_timeout: 120"
      ]
    }
  ]
}
