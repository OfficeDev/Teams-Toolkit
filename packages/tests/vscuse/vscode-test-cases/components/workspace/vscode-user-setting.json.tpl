{
  "component": {
    "version": 1,
    "id": "setVsCodeUserSetting",
    "parameters": ["instanceSuffix", "settingKey", "settingValue"]
  },
  "steps": [
    {
      "step_id": "step_setVsCodeUserSetting_{{text:instanceSuffix}}",
      "agent": "code",
      "tool": "",
      "parameters": {
        "sample": "=== Generated Script ===\nLanguage: bash\n\n```bash\nset -euo pipefail\nSETTINGS_PATH=\"/home/vscode/.config/Code/User/settings.json\" SETTING_KEY=\"{{text:settingKey}}\" SETTING_VALUE=\"{{text:settingValue}}\" python3 - <<'PY'\nimport json\nimport os\nfrom pathlib import Path\n\nsettings_path = Path(os.environ[\"SETTINGS_PATH\"])\nsetting_key = os.environ[\"SETTING_KEY\"]\nraw_setting_value = os.environ[\"SETTING_VALUE\"]\nif raw_setting_value not in (\"true\", \"false\"):\n    raise AssertionError(\"The VS Code user setting value must be true or false\")\nsetting_value = raw_setting_value == \"true\"\nsettings_path.parent.mkdir(parents=True, exist_ok=True)\nif settings_path.exists():\n    settings = json.loads(settings_path.read_text(encoding=\"utf-8\"))\nelse:\n    settings = {}\nif not isinstance(settings, dict):\n    raise AssertionError(\"VS Code user settings must contain a JSON object\")\nsettings[setting_key] = setting_value\nsettings_path.write_text(json.dumps(settings, indent=2) + \"\\n\", encoding=\"utf-8\")\npersisted = json.loads(settings_path.read_text(encoding=\"utf-8\"))\nif persisted.get(setting_key) is not setting_value:\n    raise AssertionError(\"The VS Code user setting was not persisted\")\nPY\n```"
      },
      "description": "@code set the {{text:settingKey}} VS Code user setting to {{text:settingValue}} and verify the persisted boolean value.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:vscode-setting",
        "step_retry_timeout: 120"
      ]
    }
  ]
}
