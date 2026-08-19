{
  "component": {
    "version": 1,
    "id": "assertDeploySettled",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_assertDeploySettled_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the LIFECYCLE section no longer shows Deploying to the cloud... and the Deploy action is available.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:lifecycle",
        "action:assert-deploy-settled",
        "step_retry_timeout: 300",
        "delay: 30"
      ]
    }
  ]
}
