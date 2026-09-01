{
  "component": {
    "version": 1,
    "uiSurface": "notifications",
    "id": "assertCollapsedPrefixAndContains",
    "parameters": [
      "instanceSuffix",
      "collapsedNotificationPrefix",
      "notificationText",
      "retryTimeout"
    ]
  },
  "steps": [
    {
      "step_id": "step_assertNotifications_assert_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the visible Visual Studio Code Notification Center contains both of these notifications: (1) a collapsed yellow warning notification whose visible text begins with the literal prefix {{text:collapsedNotificationPrefix}} and is truncated with an ellipsis; (2) an information notification containing the complete literal text {{text:notificationText}} Notifications with different text, including in-progress notifications, do not satisfy this assertion.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:notifications",
        "action:assert-collapsed-prefix-and-contains",
        "step_retry_timeout: {{text:retryTimeout}}"
      ]
    }
  ]
}
