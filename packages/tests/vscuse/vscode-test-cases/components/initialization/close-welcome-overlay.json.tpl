{
  "component": {
    "version": 1,
    "phase": "initialization",
    "id": "closeWelcomeOverlay",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_closeWelcomeOverlay_assertVisible_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the startup \"Welcome to VS Code\" sign-in overlay is visible and its Close button is available.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:initialization",
        "initialization:closeWelcomeOverlay",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_closeWelcomeOverlay_close_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 952,
        "y": 128
      },
      "description": "Click the Close button on the startup Welcome sign-in overlay.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_closeWelcomeOverlay_assertVisible_{{text:instanceSuffix}}"],
      "preconditions": [
        "dhash:952:128:16:5:255266345964665b",
        "dhash:952:128:96:5:16100c10100c1404",
        "dhash:952:128:0:10:2592eae0f08e8621"
      ],
      "postconditions": [],
      "tags": [
        "component:initialization",
        "initialization:closeWelcomeOverlay",
        "force_run:true"
      ]
    },
    {
      "step_id": "step_closeWelcomeOverlay_assertReady_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the startup sign-in overlay is no longer visible and the VS Code workbench is ready.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_closeWelcomeOverlay_close_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:initialization",
        "initialization:closeWelcomeOverlay",
        "step_retry_timeout: 30"
      ]
    }
  ]
}
