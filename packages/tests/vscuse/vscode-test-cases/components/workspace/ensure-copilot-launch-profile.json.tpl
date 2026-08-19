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
        "sample": "=== Generated Script ===\nLanguage: bash\n\n```bash\nset -euo pipefail\nPROJECT_DIR=\"/home/vscode/AgentsToolkitProjects/${{var:app_name}}\" python3 - <<'PY'\nimport json\nimport os\nfrom pathlib import Path\n\nproject = Path(os.environ[\"PROJECT_DIR\"]).resolve()\npath = project / \".vscode\" / \"launch.json\"\ndocument = json.loads(path.read_text(encoding=\"utf-8\"))\nconfigurations = document.get(\"configurations\")\nif not isinstance(configurations, list):\n    raise AssertionError(\".vscode/launch.json must contain a configurations array\")\nname = \"Launch Remote in Copilot (Chrome)\"\nprofile = {\n    \"name\": name,\n    \"type\": \"chrome\",\n    \"request\": \"launch\",\n    \"url\": \"https://m365.cloud.microsoft/chat/entity1-d870f6cd-4aa5-4d42-9626-ab690c041429/${agent-hint}?auth=2&${account-hint}&developerMode=Basic\",\n    \"cascadeTerminateToConfigurations\": [\"Attach to Local Service\"],\n    \"presentation\": {\"group\": \"3-M365\", \"order\": 4},\n    \"internalConsoleOptions\": \"neverOpen\",\n    \"runtimeArgs\": [\"--remote-debugging-port=9223\", \"--no-first-run\"],\n}\nconfigurations[:] = [item for item in configurations if item.get(\"name\") != name]\nconfigurations.append(profile)\npath.write_text(json.dumps(document, indent=4) + \"\\n\", encoding=\"utf-8\")\nwritten = json.loads(path.read_text(encoding=\"utf-8\"))[\"configurations\"]\nif [item for item in written if item.get(\"name\") == name] != [profile]:\n    raise AssertionError(\"The canonical Copilot launch profile was not written exactly once\")\nPY\ncode --reuse-window \"$PROJECT_DIR\"\n```"
      },
      "description": "@code execute the supplied generated bash script exactly as authored and read its exact PROJECT_DIR under /home/vscode/AgentsToolkitProjects/ from that script; write and verify exactly one canonical Launch Remote in Copilot (Chrome) profile in .vscode/launch.json, then reuse the current Visual Studio Code window for that exact project, do not reinterpret or regenerate the script, and do not use /workspace.",
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
    },
    {
      "step_id": "step_ensureCopilotLaunchProfile_openReload_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "f1"
      },
      "description": "Press F1 to open the Command Palette after normalizing the Copilot launch profile.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_ensureCopilotLaunchProfile_ensure_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:ensure-copilot-launch-profile"]
    },
    {
      "step_id": "step_ensureCopilotLaunchProfile_assertReloadPalette_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Visual Studio Code Command Palette is visible and ready to accept a command search.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_ensureCopilotLaunchProfile_openReload_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:ensure-copilot-launch-profile",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_ensureCopilotLaunchProfile_filterReload_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "Developer: Reload Window"
      },
      "description": "Type Developer: Reload Window into the active Command Palette.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_ensureCopilotLaunchProfile_assertReloadPalette_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:ensure-copilot-launch-profile"]
    },
    {
      "step_id": "step_ensureCopilotLaunchProfile_assertReloadCommand_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the Command Palette input reads >Developer: Reload Window and the highlighted command is Developer: Reload Window.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_ensureCopilotLaunchProfile_filterReload_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:ensure-copilot-launch-profile",
        "step_retry_timeout: 30"
      ]
    },
    {
      "step_id": "step_ensureCopilotLaunchProfile_reload_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "key_press",
      "parameters": {
        "key": "enter"
      },
      "description": "Press Enter to reload the Visual Studio Code window and refresh launch configurations.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_ensureCopilotLaunchProfile_assertReloadCommand_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": ["component:workspace", "operation:ensure-copilot-launch-profile"]
    },
    {
      "step_id": "step_ensureCopilotLaunchProfile_assertReloaded_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion the project window is ready after reload, the open workspace is ${{var:app_name}}, and the Preview README.md editor is visible.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": ["step_ensureCopilotLaunchProfile_reload_{{text:instanceSuffix}}"],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "operation:ensure-copilot-launch-profile",
        "step_retry_timeout: 180"
      ]
    }
  ]
}
