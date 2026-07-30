{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "id": "assertReady",
    "parameters": ["instanceSuffix", "readySubject"]
  },
  "steps": [
    {
      "step_id": "step_assertReady_assertReady_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion {{text:readySubject}}.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "action:assert-ready",
        "step_retry_timeout: 180"
      ]
    }
  ]
}