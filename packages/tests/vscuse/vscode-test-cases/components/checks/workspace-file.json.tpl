{
  "component": {
    "version": 1,
    "id": "checkWorkspaceFiles",
    "parameters": ["instanceSuffix", "assertionsBase64"]
  },
  "steps": [
    {
      "step_id": "step_checkWorkspaceFiles_verify_{{text:instanceSuffix}}",
      "agent": "code",
      "tool": "",
      "parameters": {
        "sample": "=== Generated Script ===\nLanguage: bash\n\n```bash\nset -euo pipefail\nPROJECT_DIR=\"/home/vscode/AgentsToolkitProjects/${{var:app_name}}\" ASSERTIONS_B64=\"{{text:assertionsBase64}}\" python3 - <<'PY'\nimport base64\nimport json\nimport os\nfrom pathlib import Path\n\nproject = Path(os.environ[\"PROJECT_DIR\"]).resolve()\nassertions = json.loads(base64.b64decode(os.environ[\"ASSERTIONS_B64\"]).decode(\"utf-8\"))\nfor assertion in assertions:\n    target = (project / assertion[\"path\"]).resolve()\n    try:\n        target.relative_to(project)\n    except ValueError as error:\n        raise AssertionError(\"File assertion escaped the project directory\") from error\n    exists = target.is_file()\n    if exists != assertion[\"exists\"]:\n        raise AssertionError(f\"Unexpected file existence for {assertion['path']}\")\n    if not exists:\n        continue\n    content = target.read_text(encoding=\"utf-8\")\n    for expected in assertion.get(\"contains\", []):\n        expected = expected.replace(\"__VSCUSE_APP_NAME__\", project.name)\n        if expected not in content:\n            raise AssertionError(f\"Expected content is absent from {assertion['path']}\")\n    for unexpected in assertion.get(\"notContains\", []):\n        unexpected = unexpected.replace(\"__VSCUSE_APP_NAME__\", project.name)\n        if unexpected in content:\n            raise AssertionError(f\"Unexpected content is present in {assertion['path']}\")\nPY\n```"
      },
      "description": "@code execute the supplied generated bash script exactly as authored and read its exact PROJECT_DIR under /home/vscode/AgentsToolkitProjects/ from that script; verify its project-relative file assertions, project files are not VS Code .code-workspace files, do not use /workspace, and do not log file contents.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:checks", "assertion:file", "step_retry_timeout:120"]
    }
  ]
}
