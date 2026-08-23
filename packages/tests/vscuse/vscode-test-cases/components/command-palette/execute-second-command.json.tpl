{
  "component": {
    "version": 1,
    "uiSurface": "commandPalette",
    "id": "executeSecondCommand",
    "parameters": ["instanceSuffix", "commandTitle"]
  },
  "steps": [
    {
      "step_id": "step_executeSecondCommand_open_{{text:instanceSuffix}}",
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
      "tags": ["component:command-palette", "action:execute-command"]
    },
    {
      "step_id": "step_executeSecondCommand_assertPalette_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Visual Studio Code Command Palette is visible with a > character in its input box and is ready to accept a command search.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_executeSecondCommand_open_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:command-palette",
        "action:execute-command",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_executeSecondCommand_filter_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": {{json:commandTitle}}
      },
      "description": "Type the resolved command title into the active Command Palette.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_executeSecondCommand_assertPalette_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:command-palette", "action:execute-command"]
    },
    {
      "step_id": "step_executeSecondCommand_next_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "down"
      },
      "description": "Press Down to highlight the second filtered Command Palette result.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_executeSecondCommand_filter_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:command-palette", "action:execute-command"]
    },
    {
      "step_id": "step_executeSecondCommand_assertCommand_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Command Palette input box reads >{{text:commandTitle}} and the command titled {{text:commandTitle}} is highlighted.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_executeSecondCommand_next_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:command-palette",
        "action:execute-command",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_executeSecondCommand_execute_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to execute the selected Command Palette command.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_executeSecondCommand_assertCommand_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:command-palette", "action:execute-command"]
    }
  ]
}
