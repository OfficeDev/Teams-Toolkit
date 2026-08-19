{
  "component": {
    "version": 1,
    "id": "refreshFilterOption",
    "answerType": "singleSelect",
    "parameters": ["instanceSuffix", "commandTitle", "optionLabel"]
  },
  "steps": [
    {
      "step_id": "step_refreshFilterOption_closePicker_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "escape"
      },
      "description": "Press Escape to close the launch-configuration picker with its stale filter.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:singleSelect"]
    },
    {
      "step_id": "step_refreshFilterOption_refresh_{{text:instanceSuffix}}",
      "agent": "code",
      "tool": "",
      "parameters": {
        "sample": "=== Generated Script ===\nLanguage: bash\n\n```bash\nset -euo pipefail\nPROJECT_DIR=\"/home/vscode/AgentsToolkitProjects/${{var:app_name}}\" python3 - <<'PY'\nimport json\nimport os\nfrom pathlib import Path\n\nproject = Path(os.environ[\"PROJECT_DIR\"]).resolve()\nlaunch = (project / \".vscode\" / \"launch.json\").resolve()\ntry:\n    launch.relative_to(project)\nexcept ValueError as error:\n    raise AssertionError(\"Launch configuration escaped the project directory\") from error\ncontent = launch.read_text(encoding=\"utf-8\")\njson.loads(content)\nlaunch.write_text(content, encoding=\"utf-8\")\nPY\n```"
      },
      "description": "@code execute the supplied generated bash script exactly as authored to validate and rewrite the current project's .vscode/launch.json without changing its content, so Visual Studio Code refreshes the active launch-configuration picker; do not log file contents.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_refreshFilterOption_closePicker_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:singleSelect",
        "step_retry_timeout: 120",
        "delay: 5"
      ]
    },
    {
      "step_id": "step_refreshFilterOption_openPalette_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "f1"
      },
      "description": "Press the F1 key to reopen the Command Palette after refreshing launch.json.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_refreshFilterOption_refresh_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:command-palette", "action:execute-command"]
    },
    {
      "step_id": "step_refreshFilterOption_assertPalette_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Visual Studio Code Command Palette is visible with a > character in its input box and is ready to accept a command search.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_refreshFilterOption_openPalette_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:command-palette",
        "action:execute-command",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_refreshFilterOption_filterCommand_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": {{json:commandTitle}}
      },
      "description": "Type the resolved debug command title into the reopened Command Palette.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_refreshFilterOption_assertPalette_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:command-palette", "action:execute-command"]
    },
    {
      "step_id": "step_refreshFilterOption_assertCommand_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Command Palette input box reads >{{text:commandTitle}} and the highlighted command listed under it is titled {{text:commandTitle}}.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_refreshFilterOption_filterCommand_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:command-palette",
        "action:execute-command",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_refreshFilterOption_executeCommand_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to reopen the launch-configuration picker.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_refreshFilterOption_assertCommand_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:command-palette", "action:execute-command"]
    },
    {
      "step_id": "step_refreshFilterOption_selectAll_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "keyboard_shortcut",
      "parameters": {
        "keys": "ctrl+a"
      },
      "description": "Select all inherited filter text in the reopened launch-configuration picker.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_refreshFilterOption_executeCommand_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:singleSelect"]
    },
    {
      "step_id": "step_refreshFilterOption_clear_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "backspace"
      },
      "description": "Press Backspace to remove the inherited filter from the launch-configuration picker.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_refreshFilterOption_selectAll_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:singleSelect"]
    },
    {
      "step_id": "step_refreshFilterOption_assertCleared_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the launch-configuration picker is visible with an empty input showing the placeholder Select Launch Configuration.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_refreshFilterOption_clear_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:singleSelect",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_refreshFilterOption_filter_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": {{json:optionLabel}}
      },
      "description": "Type the resolved option label into the refreshed launch-configuration picker.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_refreshFilterOption_assertCleared_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:singleSelect"]
    },
    {
      "step_id": "step_refreshFilterOption_assertOption_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the option {{text:optionLabel}} is visible and selectable in the refreshed launch-configuration picker.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_refreshFilterOption_filter_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:quick-input",
        "answer_type:singleSelect",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_refreshFilterOption_confirm_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to confirm the filtered launch configuration.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_refreshFilterOption_assertOption_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:quick-input", "answer_type:singleSelect"]
    }
  ]
}
