{
  "component": {
    "version": 1,
    "id": "refreshFilterOption",
    "answerType": "singleSelect",
    "parameters": ["instanceSuffix", "optionLabel"]
  },
  "steps": [
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
      "depends_on": [],
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
      "depends_on": ["step_refreshFilterOption_refresh_{{text:instanceSuffix}}"],
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
