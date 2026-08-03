{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "hostSurface": "playground",
    "id": "assertPlaygroundChatReplied",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_assertChatReplied_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Agents Playground shows a non-empty assistant response above visible thumbs-up and thumbs-down feedback controls, and the \"Type a message...\" composer is ready for the next user turn with no response-generation indicator visible.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "entry_state:reply-complete",
        "action:assert-chat-response",
        "expectation:replied",
        "step_retry_timeout: 120"
      ]
    }
  ]
}
