{
  "component": {
    "version": 1,
    "id": "setOpenAIModel",
    "parameters": ["currentModel", "instanceSuffix", "relativePath"]
  },
  "steps": [
    {
      "step_id": "step_setOpenAIModel_{{text:instanceSuffix}}",
      "agent": "code",
      "tool": "",
      "parameters": {
        "sample": "=== Generated Script ===\nLanguage: bash\n\n```bash\nset -euo pipefail\nPROJECT_DIR=\"/home/vscode/AgentsToolkitProjects/${{var:app_name}}\" RELATIVE_PATH=\"{{text:relativePath}}\" CURRENT_MODEL=\"{{text:currentModel}}\" python3 - <<'PY'\nimport os\nfrom pathlib import Path\n\nproject_dir = Path(os.environ[\"PROJECT_DIR\"]).resolve()\nsource_file = (project_dir / os.environ[\"RELATIVE_PATH\"]).resolve()\nif project_dir not in source_file.parents:\n    raise AssertionError(\"The model file must remain inside the project\")\ncurrent = os.environ[\"CURRENT_MODEL\"]\ntarget = \"gpt-4o-mini\"\ntext = source_file.read_text(encoding=\"utf-8\")\nif text.count(current) != 1:\n    raise AssertionError(\"The current OpenAI model must occur exactly once\")\nupdated = text.replace(current, target)\nsource_file.write_text(updated, encoding=\"utf-8\")\nwritten = source_file.read_text(encoding=\"utf-8\")\nif current in written or written.count(target) != 1:\n    raise AssertionError(\"The OpenAI model was not replaced exactly once\")\nPY\n```"
      },
      "description": "@code execute the supplied generated bash script exactly as authored and read its exact PROJECT_DIR under /home/vscode/AgentsToolkitProjects/ from that script; replace the unsupported {{text:currentModel}} model in {{text:relativePath}} with gpt-4o-mini and verify the generated file, do not reinterpret or regenerate the script, and do not use /workspace.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:openai-model",
        "step_retry_timeout: 120"
      ]
    }
  ]
}
