{
  "component": {
    "version": 1,
    "id": "ensureCopilotLaunchProfile",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_ensureCopilotLaunchProfile_ensure_{{text:instanceSuffix}}",
      "agent": "code",
      "tool": "",
      "parameters": {
        "sample": "=== Generated Script ===\nLanguage: bash\n\n```bash\nset -euo pipefail\nPROJECT_DIR=\"/home/vscode/AgentsToolkitProjects/${{var:app_name}}\" python3 - <<'PY'\nimport json\nimport os\nfrom pathlib import Path\n\nproject = Path(os.environ[\"PROJECT_DIR\"]).resolve()\npath = project / \".vscode\" / \"launch.json\"\ndocument = json.loads(path.read_text(encoding=\"utf-8\"))\nconfigurations = document.get(\"configurations\")\nif not isinstance(configurations, list):\n    raise AssertionError(\".vscode/launch.json must contain a configurations array\")\nname = \"Launch Remote in Copilot (Chrome)\"\nprofile = {\n    \"name\": name,\n    \"type\": \"chrome\",\n    \"request\": \"launch\",\n    \"url\": \"https://m365.cloud.microsoft/chat/entity1-d870f6cd-4aa5-4d42-9626-ab690c041429/${agent-hint}?auth=2&${account-hint}&developerMode=Basic\",\n    \"cascadeTerminateToConfigurations\": [\"Attach to Local Service\"],\n    \"presentation\": {\"group\": \"3-M365\", \"order\": 4},\n    \"internalConsoleOptions\": \"neverOpen\",\n    \"runtimeArgs\": [\"--remote-debugging-port=9223\", \"--no-first-run\"],\n}\nconfigurations[:] = [item for item in configurations if item.get(\"name\") != name]\nconfigurations.append(profile)\npath.write_text(json.dumps(document, indent=4) + \"\\n\", encoding=\"utf-8\")\nwritten = json.loads(path.read_text(encoding=\"utf-8\"))[\"configurations\"]\nif [item for item in written if item.get(\"name\") == name] != [profile]:\n    raise AssertionError(\"The canonical Copilot launch profile was not written exactly once\")\nPY\n```"
      },
      "description": "@code execute the supplied generated bash script exactly as authored and read its exact PROJECT_DIR under /home/vscode/AgentsToolkitProjects/ from that script; write and verify exactly one canonical Launch Remote in Copilot (Chrome) profile in .vscode/launch.json, do not reinterpret or regenerate the script, and do not use /workspace.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:ensure-copilot-launch-profile",
        "step_retry_timeout: 120"
      ]
    }
  ]
}
