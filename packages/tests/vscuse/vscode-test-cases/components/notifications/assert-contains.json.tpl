{
  "component": {
    "version": 1,
    "uiSurface": "notifications",
    "id": "assertContains",
    "parameters": ["instanceSuffix", "notificationText"]
  },
  "steps": [
    {
      "step_id": "step_assertNotificationContains_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion a visible Visual Studio Code notification contains {{text:notificationText}}.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:notifications",
        "action:assert-contains",
        "step_retry_timeout: 300"
      ]
    }
  ]
}
