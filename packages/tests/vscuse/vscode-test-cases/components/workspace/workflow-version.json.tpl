{
  "component": {
    "version": 1,
    "id": "setWorkflowVersion",
    "parameters": ["instanceSuffix", "workflowVersion"]
  },
  "steps": [
    {
      "step_id": "step_setWorkflowVersion_{{text:instanceSuffix}}",
      "agent": "code",
      "tool": "",
      "parameters": {
        "sample": "=== Generated Script ===\nLanguage: bash\n\n```bash\nset -euo pipefail\nPROJECT_DIR=\"/home/vscode/AgentsToolkitProjects/${{var:app_name}}\" WORKFLOW_VERSION=\"{{text:workflowVersion}}\" python3 - <<'PY'\nimport os\nfrom pathlib import Path\n\nworkflow_file = Path(os.environ[\"PROJECT_DIR\"]).resolve() / \"m365agents.yml\"\ntarget = \"version: \" + os.environ[\"WORKFLOW_VERSION\"]\nlines = workflow_file.read_text(encoding=\"utf-8\").splitlines()\nmatches = [index for index, line in enumerate(lines) if line.startswith(\"version:\")]\nif len(matches) != 1:\n    raise AssertionError(\"The workflow must contain exactly one top-level version\")\nlines[matches[0]] = target\nworkflow_file.write_text(\"\\n\".join(lines) + \"\\n\", encoding=\"utf-8\")\nwritten = workflow_file.read_text(encoding=\"utf-8\").splitlines()\nif [line for line in written if line.startswith(\"version:\")] != [target]:\n    raise AssertionError(\"The workflow version was not written exactly once\")\nPY\n```"
      },
      "description": "@code execute the supplied generated bash script exactly as authored and read its exact PROJECT_DIR under /home/vscode/AgentsToolkitProjects/ from that script; replace the top-level version in m365agents.yml with {{text:workflowVersion}} and verify the written workflow, do not reinterpret or regenerate the script, and do not use /workspace.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:workflow-version",
        "step_retry_timeout: 120"
      ]
    }
  ]
}
