{
  "component": {
    "version": 1,
    "uiSurface": "workbench",
    "id": "startDebugInTeams",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_targetWorkbench_open_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 15,
        "y": 201
      },
      "description": "Click Run and Debug in the Visual Studio Code activity bar.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [
        "dhash:15:201:16:5:2c2d2929496c72b7",
        "dhash:15:201:96:5:44443c47c7cb37e4",
        "dhash:15:201:0:10:b2882223a3222421"
      ],
      "postconditions": [],
      "tags": ["component:workspace", "action:start-debug-in-teams"]
    },
    {
      "step_id": "step_targetWorkbench_openProfiles_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 221,
        "y": 51
      },
      "description": "Open the launch profile dropdown in the Run and Debug panel.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_targetWorkbench_open_{{text:instanceSuffix}}"],
      "preconditions": [
        "dhash:221:51:16:5:00102552996d9609",
        "dhash:221:51:96:5:6161e51292ee0e00",
        "dhash:221:51:0:10:a260626363226421"
      ],
      "postconditions": [],
      "tags": ["component:workspace", "action:start-debug-in-teams"]
    },
    {
      "step_id": "step_targetWorkbench_selectProfile_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 215,
        "y": 141
      },
      "description": "Select Debug in Teams (Chrome) from the launch profile dropdown.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_targetWorkbench_openProfiles_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:215:141:16:5:106f9e4a4a4ac7b0",
        "dhash:215:141:96:5:932a480a480a4cb2",
        "dhash:215:141:0:10:82c8d283e3226421"
      ],
      "postconditions": [],
      "tags": ["component:workspace", "action:start-debug-in-teams"]
    },
    {
      "step_id": "step_targetWorkbench_start_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 132,
        "y": 57
      },
      "description": "Click Start Debugging in the Run and Debug panel.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_targetWorkbench_selectProfile_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:132:57:16:5:3633333630526528",
        "dhash:132:57:96:5:b2307432bf464639",
        "dhash:132:57:0:10:9268626363226421"
      ],
      "postconditions": [],
      "tags": ["component:workspace", "action:start-debug-in-teams"]
    }
  ]
}
