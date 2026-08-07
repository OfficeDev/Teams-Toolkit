{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "id": "assertChatNotContains",
    "parameters": ["instanceSuffix", "unexpectedText"]
  },
  "steps": [
    {
      "step_id": "step_assertChatNotContains_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the current assistant response does not contain \"{{text:unexpectedText}}\".",
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
        "expectation:not-contains",
        "step_retry_timeout: 120"
      ]
    }
  ]
}
