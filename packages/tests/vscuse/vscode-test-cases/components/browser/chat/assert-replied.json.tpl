{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "id": "assertChatReplied",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_assertChatReplied_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the current assistant turn is complete and contains a non-empty response.",
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
        "expectation:replied",
        "step_retry_timeout: 120"
      ]
    }
  ]
}
