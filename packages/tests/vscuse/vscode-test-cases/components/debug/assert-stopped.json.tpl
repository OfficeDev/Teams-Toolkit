{
  "component": {
    "version": 1,
    "id": "assertDebugStopped",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_assertDebugStopped_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion Visual Studio Code is visible after the Teams Chrome window closed, and debugging has stopped: there is no active debug toolbar with Pause, Restart or Stop controls.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:debug", "step_retry_timeout:60"]
    }
  ]
}
