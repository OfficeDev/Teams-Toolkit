{
  "component": {
    "version": 1,
    "id": "verifyPythonRequirements",
    "parameters": ["instanceSuffix", "requirementsPath"]
  },
  "steps": [
    {
      "step_id": "step_verifyPythonRequirements_{{text:instanceSuffix}}",
      "agent": "code",
      "tool": "",
      "parameters": {
        "sample": "=== Generated Script ===\nLanguage: bash\n\n```bash\nset -euo pipefail\nexport PROJECT_DIR=\"/home/vscode/AgentsToolkitProjects/${{var:app_name}}\"\nREQUIREMENTS_PATH=\"{{text:requirementsPath}}\" \"$PROJECT_DIR/.venv/bin/python\" - <<'PY'\nimport os\nimport sys\nfrom importlib.metadata import version\nfrom pathlib import Path\nfrom pip._vendor.packaging.requirements import Requirement\n\nproject = Path(os.environ[\"PROJECT_DIR\"]).resolve()\nif Path(sys.prefix).resolve() != project / \".venv\":\n    raise AssertionError(\"The project virtual environment is not active\")\nrequirements = (project / os.environ[\"REQUIREMENTS_PATH\"]).read_text(encoding=\"utf-8\")\nchecked = 0\nfor line in requirements.splitlines():\n    line = line.strip()\n    if not line or line.startswith(\"#\"):\n        continue\n    requirement = Requirement(line)\n    if requirement.marker and not requirement.marker.evaluate():\n        continue\n    installed = version(requirement.name)\n    if not requirement.specifier.contains(installed, prereleases=True):\n        raise AssertionError(f\"Installed version does not satisfy {requirement.name}\")\n    checked += 1\nif checked == 0:\n    raise AssertionError(\"No active Python requirements were verified\")\nprint(f\"Verified {checked} installed Python requirements\")\nPY\n\"$PROJECT_DIR/.venv/bin/python\" -m pip check\n```"
      },
      "description": "@code execute the supplied generated bash script exactly as authored; verify the project's Python virtual environment satisfies its declared requirements and has no broken dependencies, without installing packages or logging file contents.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:checks",
        "assertion:python-requirements",
        "step_retry_timeout:300"
      ]
    }
  ]
}
