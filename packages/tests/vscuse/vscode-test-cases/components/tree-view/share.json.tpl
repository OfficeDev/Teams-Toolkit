{
  "component": {
    "version": 1,
    "uiSurface": "treeView",
    "id": "share",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_share_assertVisible_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the LIFECYCLE section of the Microsoft 365 Agents Toolkit side bar is visible and its Share command is selectable.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:tree-view",
        "action:share",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_share_click_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 122,
        "y": 573
      },
      "description": "Click Share in the LIFECYCLE section of the Microsoft 365 Agents Toolkit side bar.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_share_assertVisible_{{text:instanceSuffix}}"],
      "preconditions": [
        "dhash:122:573:16:5:40a0a04048505040",
        "dhash:122:573:96:5:b2a48488c4cacb10",
        "dhash:122:573:0:10:24a4302030303232"
      ],
      "postconditions": [],
      "tags": ["component:tree-view", "action:share"]
    }
  ]
}
