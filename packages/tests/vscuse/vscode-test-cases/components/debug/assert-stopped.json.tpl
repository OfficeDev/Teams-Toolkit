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
      "description": "@assertion Visual Studio Code is visible and the Teams Chrome window is no longer in front. The floating debug control strip, a grouped row of Pause/Continue, Step Over, Step Into, Step Out, Restart and Stop controls near the top of the editor, is absent. Judge only that grouped debug control strip; terminal output is historical and terminal task controls, editor layout icons and other isolated square icons are not debug controls.",
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
