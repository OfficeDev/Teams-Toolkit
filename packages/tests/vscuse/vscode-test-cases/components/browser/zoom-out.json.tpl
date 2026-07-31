{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "id": "zoomOut",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_zoomOut_zoomOut_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "keyboard_shortcut",
      "parameters": { "keys": "ctrl+-" },
      "description": "Zoom the browser out once with Ctrl+- so the Microsoft 365 Copilot navigation rail stops covering the conversation column.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:browser", "action:zoom-out"]
    }
  ]
}
