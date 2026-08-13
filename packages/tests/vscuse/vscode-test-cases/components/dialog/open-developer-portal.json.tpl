{
  "component": {
    "version": 1,
    "id": "openDeveloperPortal",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_openDeveloperPortal_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the external website confirmation dialog is visible with the Open action.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:dialog",
        "action:open-developer-portal",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_openDeveloperPortal_click_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 731,
        "y": 105
      },
      "description": "Click the recorded Open action.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_openDeveloperPortal_assert_{{text:instanceSuffix}}"],
      "preconditions": [
        "dhash:731:105:16:5:0008004a1966ab8a",
        "dhash:731:105:96:5:000000909c1d8104",
        "dhash:731:105:0:10:9c68636232696128"
      ],
      "postconditions": [],
      "tags": ["component:dialog", "action:open-developer-portal"]
    }
  ]
}
