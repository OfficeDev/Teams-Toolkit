{
  "component": {
    "version": 1,
    "id": "setLocalEnvironmentVariable",
    "parameters": ["instanceSuffix", "variableName", "variableValue"]
  },
  "steps": [
    {
      "step_id": "step_setLocalEnvironmentVariable_{{text:instanceSuffix}}",
      "agent": "code",
      "tool": "",
      "parameters": {
        "sample": "=== Generated Script ===\nLanguage: bash\n\n```bash\nset -euo pipefail\nPROJECT_DIR=\"/home/vscode/AgentsToolkitProjects/${{var:app_name}}\" VARIABLE_NAME=\"{{text:variableName}}\" VARIABLE_VALUE=\"{{text:variableValue}}\" python3 - <<'PY'\nimport os\nfrom pathlib import Path\n\nlifecycle = Path(os.environ[\"PROJECT_DIR\"]).resolve() / \"m365agents.local.yml\"\nname = os.environ[\"VARIABLE_NAME\"]\nvalue = os.environ[\"VARIABLE_VALUE\"]\nif not value:\n    raise AssertionError(\"The variable value resolved to nothing\")\nlines = lifecycle.read_text(encoding=\"utf-8\").splitlines()\ntargets = (\"target: ./.localConfigs\", \"target: ./.env\")\ntarget = next((index for index, line in enumerate(lines) if line.strip() in targets), None)\nif target is None:\n    raise AssertionError(\"The local lifecycle writes no runtime environment file\")\nheader = next((index for index in range(target + 1, len(lines)) if lines[index].strip() == \"envs:\"), None)\nif header is None:\n    raise AssertionError(\"The runtime environment file declares no envs mapping\")\nindent = \" \" * (len(lines[header]) - len(lines[header].lstrip()) + 2)\nend = header + 1\nwhile end < len(lines) and lines[end].startswith(indent) and lines[end].strip():\n    end += 1\nkept = [line for line in lines[header + 1 : end] if not line.strip().startswith(name + \":\")]\nlines[header + 1 : end] = kept + [indent + name + \": \" + value]\nlifecycle.write_text(\"\\n\".join(lines) + \"\\n\", encoding=\"utf-8\")\nwritten = [line for line in lifecycle.read_text(encoding=\"utf-8\").splitlines() if line.strip().startswith(name + \":\")]\nif written != [indent + name + \": \" + value]:\n    raise AssertionError(\"The variable was not written exactly once with its value\")\nPY\n```"
      },
      "description": "@code execute the supplied generated bash script exactly as authored and read its exact PROJECT_DIR under /home/vscode/AgentsToolkitProjects/ from that script; set {{text:variableName}} in the envs mapping the local lifecycle writes into the project's runtime environment file to exactly the value the script assigns, do not reinterpret or regenerate the script, do not use /workspace, and do not log that value.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:local-environment",
        "step_retry_timeout: 120"
      ]
    }
  ]
}
