{
  "component": {
    "version": 1,
    "id": "assertDeployedRuntimeReady",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_assertDeployedRuntimeReady_{{text:instanceSuffix}}",
      "agent": "code",
      "tool": "",
      "parameters": {
        "sample": "=== Generated Script ===\nLanguage: bash\n\n```bash\nset -euo pipefail\nPROJECT_DIR=\"/home/vscode/AgentsToolkitProjects/${{var:app_name}}\" python3 - <<'PY'\nimport os\nfrom pathlib import Path\nfrom urllib.error import HTTPError, URLError\nfrom urllib.parse import urlsplit, urlunsplit\nfrom urllib.request import HTTPRedirectHandler, Request, build_opener\n\nproject = Path(os.environ[\"PROJECT_DIR\"]).resolve()\nenvironment = project / \"env\" / \".env.dev\"\nvalues = []\nfor raw_line in environment.read_text(encoding=\"utf-8\").splitlines():\n    line = raw_line.strip()\n    if not line or line.startswith(\"#\"):\n        continue\n    name, separator, value = line.partition(\"=\")\n    if separator and name.strip() == \"BOT_ENDPOINT\":\n        values.append(value.strip())\nif len(values) != 1 or not values[0]:\n    raise AssertionError(\"The deployed bot endpoint is unavailable\")\nendpoint = values[0]\nif len(endpoint) >= 2 and endpoint[0] == endpoint[-1] and endpoint[0] in {\"'\", '\"'}:\n    endpoint = endpoint[1:-1]\ntry:\n    parsed = urlsplit(endpoint)\n    if (\n        parsed.scheme != \"https\"\n        or not parsed.hostname\n        or not parsed.hostname.endswith(\".azurewebsites.net\")\n        or parsed.username is not None\n        or parsed.password is not None\n        or parsed.port is not None\n        or parsed.path not in {\"\", \"/\"}\n        or parsed.query\n        or parsed.fragment\n    ):\n        raise ValueError\nexcept ValueError:\n    raise AssertionError(\"The deployed bot endpoint is invalid\") from None\nurl = urlunsplit((\"https\", parsed.netloc, \"/api/messages\", \"\", \"\"))\nrequest = Request(\n    url,\n    data=b\"\",\n    headers={\"Content-Type\": \"application/json\"},\n    method=\"POST\",\n)\n\nclass NoRedirect(HTTPRedirectHandler):\n    def redirect_request(self, req, fp, code, msg, headers, newurl):\n        return None\n\ntry:\n    with build_opener(NoRedirect).open(request, timeout=15) as response:\n        status = response.status\nexcept HTTPError as error:\n    status = error.code\nexcept (OSError, URLError, ValueError):\n    raise AssertionError(\"The deployed bot runtime is not ready\") from None\nif status not in {400, 401, 403, 415}:\n    raise AssertionError(\"The deployed bot runtime is not ready\")\nPY\n```"
      },
      "description": "@code execute the supplied generated bash script exactly as authored and read its exact PROJECT_DIR under /home/vscode/AgentsToolkitProjects/ from that script; verify that the deployed bot runtime owns its message route, do not use /workspace, and do not log the endpoint or environment file contents.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:workspace",
        "readiness:deployed-runtime",
        "step_retry_timeout:600"
      ]
    }
  ]
}
