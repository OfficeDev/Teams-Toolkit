{
  "component": {
    "version": 1,
    "phase": "initialization",
    "id": "closeGetStartedEditor",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_closeGetStartedEditor_close_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "keyboard_shortcut",
      "parameters": {
        "keys": "ctrl+w"
      },
      "description": "Press Ctrl+W to close the toolkit Get Started editor.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:initialization",
        "initialization:closeGetStartedEditor"
      ]
    },
    {
      "step_id": "step_closeGetStartedEditor_assertClosed_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion no editor tab is open in the Visual Studio Code editor area.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_closeGetStartedEditor_close_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:initialization",
        "initialization:closeGetStartedEditor",
        "step_retry_timeout: 30"
      ]
    }
  ]
}
