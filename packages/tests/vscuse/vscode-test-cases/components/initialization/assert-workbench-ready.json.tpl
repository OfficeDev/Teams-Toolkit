{
  "component": {
    "version": 1,
    "phase": "initialization",
    "id": "assertWorkbenchReady",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_assertWorkbenchReady_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Visual Studio Code workbench has finished reloading and is ready for commands.",
      "content_refs": [],
      "timeout": 120,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:initialization",
        "initialization:assertWorkbenchReady",
        "step_retry_timeout: 120"
      ]
    }
  ]
}
