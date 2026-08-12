{
  "component": {
    "version": 1,
    "id": "closeLocalTeamsAppWindow",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_closeLocalTeamsAppWindow_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the local Teams app browser window is open after the app reached chat readiness.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:browser", "surface:teams", "step_retry_timeout: 30"]
    },
    {
      "step_id": "step_closeLocalTeamsAppWindow_click_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 1002,
        "y": 16
      },
      "description": "Click the recorded Close button on the local Teams browser window.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_closeLocalTeamsAppWindow_assert_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:1002:16:16:5:2a14629919474709",
        "dhash:1002:16:96:5:d2233323c228c6e6",
        "dhash:1002:16:0:10:38bcb08e8eb681a1"
      ],
      "postconditions": [],
      "tags": ["component:browser", "surface:teams"]
    }
  ]
}
