{
  "component": {
    "version": 1,
    "phase": "initialization",
    "id": "assertProjectWindowReady",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_assertProjectWindowReady_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Preview README.md editor tab is open in Visual Studio Code.",
      "content_refs": [],
      "timeout": 60,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:initialization",
        "initialization:assertProjectWindowReady",
        "step_retry_timeout: 60"
      ]
    }
  ]
}
