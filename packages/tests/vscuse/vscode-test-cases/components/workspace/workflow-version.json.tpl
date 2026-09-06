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
        "sample": "=== Generated Script ===\nLanguage: bash\n\n```bash\nset -euo pipefail\nPROJECT_DIR=\"/home/vscode/AgentsToolkitProjects/${{var:app_name}}\" WORKFLOW_VERSION=\"{{text:workflowVersion}}\" python3 - <<'PY'\nimport os\nfrom pathlib import Path\n\nworkflow_file = Path(os.environ[\"PROJECT_DIR\"]).resolve() / \"m365agents.yml\"\ntarget = \"version: \" + os.environ[\"WORKFLOW_VERSION\"]\nsource_schema = \"# yaml-language-server: $schema=https://aka.ms/m365-agents-toolkits/v1.12/yaml.schema.json\"\ntarget_schema = source_schema.replace(\"v1.12\", os.environ[\"WORKFLOW_VERSION\"])\ntext = workflow_file.read_text(encoding=\"utf-8\")\nlines = text.splitlines()\nmatches = [index for index, line in enumerate(lines) if line.startswith(\"version:\")]\nif len(matches) != 1:\n    raise AssertionError(\"The workflow must contain exactly one top-level version\")\nif lines.count(source_schema) != 1:\n    raise AssertionError(\"The workflow must contain exactly one v1.12 schema directive\")\nlines[matches[0]] = target\nlines[lines.index(source_schema)] = target_schema\ntext = \"\\n\".join(lines) + \"\\n\"\nsource_action = \"  - uses: copilotAgent/publish\"\ntarget_action = \"  - uses: teamsApp/shareToOthers\"\nif text.count(source_action) != 2:\n    raise AssertionError(\"The workflow must contain exactly two copilotAgent/publish actions\")\ntext = text.replace(source_action, target_action)\nfor scope in (\"      scope: ${{AGENT_SCOPE}}\\n\", \"      scope: tenant\\n\"):\n    if text.count(scope) != 1:\n        raise AssertionError(\"The workflow must contain the expected publish scope\")\n    text = text.replace(scope, \"\")\npublished_app_id = \"      appId: M365_PUBLISHED_APP_ID\\n\"\nif text.count(published_app_id) != 1:\n    raise AssertionError(\"The workflow must contain the expected published app output\")\ntext = text.replace(published_app_id, published_app_id + \"      shareLink: SHARE_LINK\\n\")\nworkflow_file.write_text(text, encoding=\"utf-8\")\nwritten = workflow_file.read_text(encoding=\"utf-8\")\nwritten_lines = written.splitlines()\nif [line for line in written_lines if line.startswith(\"version:\")] != [target]:\n    raise AssertionError(\"The workflow version was not written exactly once\")\nif [line for line in written_lines if line.startswith(\"# yaml-language-server:\")] != [target_schema]:\n    raise AssertionError(\"The workflow schema directive was not written exactly once\")\nif source_action in written or written.count(target_action) != 2:\n    raise AssertionError(\"The workflow actions were not converted exactly twice\")\nif any(line.strip().startswith(\"scope:\") for line in written_lines):\n    raise AssertionError(\"The unsupported publish scopes were not removed\")\nif written.count(\"      shareLink: SHARE_LINK\") != 2:\n    raise AssertionError(\"The legacy share outputs were not written exactly twice\")\nPY\n```"
      },
      "description": "@code execute the supplied generated bash script exactly as authored and read its exact PROJECT_DIR under /home/vscode/AgentsToolkitProjects/ from that script; replace the top-level version in m365agents.yml with {{text:workflowVersion}}, convert its publish actions to the schema-valid legacy share shape, and verify the written workflow, do not reinterpret or regenerate the script, and do not use /workspace.",
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
