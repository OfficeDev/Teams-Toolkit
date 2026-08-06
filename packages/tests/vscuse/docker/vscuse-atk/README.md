# VscUse ATK Profile

This directory contains the **ATK (Microsoft 365 Agent Toolkit)** profile for VscUse.

## What's Included

This profile extends the base image with ATK-specific tools:

- **.NET SDK 8.0** - Required for .NET-based agents
- **Azure Functions Core Tools v4.4.0** - Local functions development
- **Microsoft 365 Agents Toolkit CLI** - M365 agent scaffolding
- **Dev Tunnel CLI** - Secure tunneling for local development
- **Microsoft Edge** - Browser for M365 testing
- **M365 Template Directory** - Pre-configured devTools structure
- **ATK Extension** - Microsoft 365 Agent Toolkit VS Code extension

## Building the Image

### Using docker build directly

```bash
docker build -t ghcr.io/<your-github-username>/vscuse-atk:latest .
```

### Overriding the Node.js version

The image uses the Node.js provided by the base image by default. To bake a different
Node.js version, pass the `NODE_VERSION` build arg. It accepts either a major line
(e.g. `22`, resolved to the latest matching release) or a full version (e.g. `22.11.0`):

```bash
docker build --build-arg NODE_VERSION=22 -t ghcr.io/<your-github-username>/vscuse-atk:latest .
```

The same override is exposed as the `node_version` input on the
`Build VscUse ATK Docker Image` workflow.

## Extending from Base Image

This profile extends the base image:

```dockerfile
ARG BASE_IMAGE=ghcr.io/<your-github-username>/vscuse-base:latest
FROM ${BASE_IMAGE}

# ATK-specific tools are added here...
```

## Configuration

### Using with vscuse CLI

Update `config.yaml`:

```yaml
docker:
  image_name: "ghcr.io/<your-github-username>/vscuse-atk:latest"
```

The image entrypoint mirrors a declared `TEAMSFX_CEA_ENABLED=true|false` test precondition into
`M365AgentsToolkit.enableLaunchAgentForTeamsInCopilot` before VS Code starts. Generate a
plan-scoped run config with `vscode-test-cases/engine/prepare-vscuse-config.cjs`; do not add the
setting to the shared image settings.

## Differences from Base Image

| Feature         | Base Image | ATK Profile      |
| --------------- | ---------- | ---------------- |
| Ubuntu 22.04    | ✅         | ✅               |
| Python 3.12     | ✅         | ✅               |
| Node.js 20 LTS  | ✅         | ✅               |
| VS Code         | ✅         | ✅               |
| Chrome/Chromium | ✅         | ✅               |
| Microsoft Edge  | ❌         | ✅               |
| .NET SDK 8.0    | ❌         | ✅               |
| Azure Functions | ❌         | ✅ v4.4.0        |
| M365 CLI        | ❌         | ✅ Alpha         |
| Dev Tunnel      | ❌         | ✅ Latest        |
| ATK Extension   | ❌         | ✅ Pre-installed |

## Directory Structure

```
vscuse-atk/
├── Dockerfile                    # Profile build definition
├── build-extensions/             # ATK-specific extensions
├── sync-vscode-feature-flags.cjs # Test-only setting synchronization
└── vscuse-atk-entrypoint.sh      # Pre-VS Code startup hook
```
