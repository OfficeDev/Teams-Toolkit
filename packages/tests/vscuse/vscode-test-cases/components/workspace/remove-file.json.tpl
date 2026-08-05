{
  "component": {
    "version": 1,
    "id": "removeWorkspaceFile",
    "parameters": ["instanceSuffix", "relativePath"]
  },
  "steps": [
    {
      "step_id": "step_removeWorkspaceFile_remove_{{text:instanceSuffix}}",
      "agent": "code",
      "tool": "",
      "parameters": {
        "sample": "=== Generated Script ===\nLanguage: bash\n\n```bash\nset -euo pipefail\nPROJECT_DIR=\"/home/vscode/AgentsToolkitProjects/${{var:app_name}}\" RELATIVE_PATH=\"{{text:relativePath}}\" python3 - <<'PY'\nimport os\nfrom pathlib import Path\n\nproject = Path(os.environ[\"PROJECT_DIR\"]).resolve()\ntarget = (project / os.environ[\"RELATIVE_PATH\"]).resolve()\ntry:\n    target.relative_to(project)\nexcept ValueError as error:\n    raise AssertionError(\"The removal path escaped the project directory\") from error\nif not target.is_file():\n    raise AssertionError(\"The file to remove does not exist\")\ntarget.unlink()\nif target.exists():\n    raise AssertionError(\"The file was not removed\")\nPY\n```"
      },
      "description": "@code remove {{text:relativePath}} from the generated project so a later operation can be observed recreating it.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:remove-file",
        "step_retry_timeout: 120"
      ]
    }
  ]
}
