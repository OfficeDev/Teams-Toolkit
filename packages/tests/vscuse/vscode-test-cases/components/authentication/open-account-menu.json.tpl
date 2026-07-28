{
  "component": {
    "version": 1,
    "uiSurface": "authentication",
    "id": "openAccountMenu",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_openAccountMenu_open_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "f1"
      },
      "description": "Press the F1 key to open the Command Palette in Visual Studio Code.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:authentication", "action:open-account-menu"]
    },
    {
      "step_id": "step_openAccountMenu_assertPalette_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Visual Studio Code Command Palette is visible, active, and ready to accept a command search.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_openAccountMenu_open_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "action:open-account-menu",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_openAccountMenu_filter_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "Microsoft 365 Agents: Accounts"
      },
      "description": "Type 'Microsoft 365 Agents: Accounts' into the Visual Studio Code command palette input field at the top center of the interface.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_openAccountMenu_assertPalette_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:authentication", "action:open-account-menu"]
    },
    {
      "step_id": "step_openAccountMenu_assertCommand_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the first result in the Command Palette is \"Microsoft 365 Agents Toolkit: Focus on Accounts View\" and the second result is \"Microsoft 365 Agents: Accounts\".",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_openAccountMenu_filter_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "action:open-account-menu",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_openAccountMenu_selectSecond_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "down"
      },
      "description": "Press Down to select the second Command Palette result, Microsoft 365 Agents: Accounts.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_openAccountMenu_assertCommand_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:authentication", "action:open-account-menu"]
    },
    {
      "step_id": "step_openAccountMenu_execute_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to open the Microsoft 365 Agents account menu.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_openAccountMenu_selectSecond_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:authentication",
        "action:open-account-menu"
      ]
    }
  ]
}