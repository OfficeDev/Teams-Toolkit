{
  "component": {
    "version": 1,
    "id": "setRemoteEnvironmentVariable",
    "parameters": ["instanceSuffix", "variableName", "variableValue"]
  },
  "steps": [
    {
      "step_id": "step_setRemoteEnvironmentVariable_{{text:instanceSuffix}}",
      "agent": "code",
      "tool": "",
      "parameters": {
        "sample": "=== Generated Script ===\nLanguage: bash\n\n```bash\nset -euo pipefail\nPROJECT_DIR=\"/home/vscode/AgentsToolkitProjects/${{var:app_name}}\" VARIABLE_NAME=\"{{text:variableName}}\" VARIABLE_VALUE=\"{{text:variableValue}}\" python3 - <<'PY'\nimport os\nfrom pathlib import Path\n\nbicep = Path(os.environ[\"PROJECT_DIR\"]).resolve() / \"infra\" / \"azure.bicep\"\nname = os.environ[\"VARIABLE_NAME\"]\nvalue = os.environ[\"VARIABLE_VALUE\"]\nif not value:\n    raise AssertionError(\"The variable value resolved to nothing\")\nlines = bicep.read_text(encoding=\"utf-8\").splitlines()\nheaders = [index for index, line in enumerate(lines) if line.strip() == \"appSettings: [\"]\nif len(headers) != 1:\n    raise AssertionError(\"The App Service must declare exactly one appSettings array\")\nname_line = \"name: '\" + name + \"'\"\nif any(line.strip() == name_line for line in lines):\n    raise AssertionError(\"The remote environment variable already exists\")\nheader = headers[0]\nindent = \" \" * (len(lines[header]) - len(lines[header].lstrip()) + 2)\nentry = [\n    indent + \"{\",\n    indent + \"  \" + name_line,\n    indent + \"  value: '\" + value + \"'\",\n    indent + \"}\",\n]\nlines[header + 1:header + 1] = entry\nbicep.write_text(\"\\n\".join(lines) + \"\\n\", encoding=\"utf-8\")\nwritten = bicep.read_text(encoding=\"utf-8\").splitlines()\nif sum(line.strip() == name_line for line in written) != 1:\n    raise AssertionError(\"The remote environment variable was not written exactly once\")\nPY\n```"
      },
      "description": "@code add {{text:variableName}} to the generated App Service appSettings with exactly the value the reference script assigns, without logging that value.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:remote-environment",
        "step_retry_timeout: 120"
      ]
    }
  ]
}
