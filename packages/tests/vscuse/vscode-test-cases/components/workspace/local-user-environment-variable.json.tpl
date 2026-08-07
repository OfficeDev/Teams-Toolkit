{
  "component": {
    "version": 1,
    "id": "setLocalUserEnvironmentVariable",
    "parameters": ["instanceSuffix", "variableName", "variableValue"]
  },
  "steps": [
    {
      "step_id": "step_setLocalUserEnvironmentVariable_{{text:instanceSuffix}}",
      "agent": "code",
      "tool": "",
      "parameters": {
        "sample": "=== Generated Script ===\nLanguage: bash\n\n```bash\nset -euo pipefail\nPROJECT_DIR=\"/home/vscode/AgentsToolkitProjects/${{var:app_name}}\" VARIABLE_NAME=\"{{text:variableName}}\" VARIABLE_VALUE=\"{{text:variableValue}}\" python3 - <<'PY'\nimport os\nfrom pathlib import Path\n\nenvironment_file = Path(os.environ[\"PROJECT_DIR\"]).resolve() / \"env\" / \".env.local.user\"\nname = os.environ[\"VARIABLE_NAME\"]\nvalue = os.environ[\"VARIABLE_VALUE\"]\nif not value:\n    raise AssertionError(\"The variable value resolved to nothing\")\nlines = environment_file.read_text(encoding=\"utf-8\").splitlines()\nprefix = name + \"=\"\nmatches = [index for index, line in enumerate(lines) if line.startswith(prefix)]\nif len(matches) != 1:\n    raise AssertionError(\"The local user environment variable must already exist exactly once\")\nexpected = name + \"='\" + value + \"'\"\nlines[matches[0]] = expected\nenvironment_file.write_text(\"\\n\".join(lines) + \"\\n\", encoding=\"utf-8\")\nwritten = [line for line in environment_file.read_text(encoding=\"utf-8\").splitlines() if line.startswith(prefix)]\nif written != [expected]:\n    raise AssertionError(\"The local user environment variable was not written exactly once with its value\")\nPY\n```"
      },
      "description": "@code set {{text:variableName}} in env/.env.local.user to exactly the value the reference script assigns, without logging that value.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:local-user-environment",
        "step_retry_timeout: 120"
      ]
    }
  ]
}
