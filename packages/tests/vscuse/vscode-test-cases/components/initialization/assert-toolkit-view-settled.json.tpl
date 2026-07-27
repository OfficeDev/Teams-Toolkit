{
  "component": {
    "version": 1,
    "phase": "initialization",
    "id": "assertToolkitViewSettled",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_assertToolkitViewSettled_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Microsoft 365 Agents Toolkit view is open in the side bar and the toolkit Get Started editor is visible in the editor area.",
      "content_refs": [],
      "timeout": 120,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:initialization",
        "initialization:assertToolkitViewSettled",
        "step_retry_timeout: 120"
      ]
    }
  ]
}
