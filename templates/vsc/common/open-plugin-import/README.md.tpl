# {{appName}}

This project was scaffolded by `atk import agentplugin` (also available as `atk import openplugin`) from an [Agent Plugins](https://agent-plugins.org/) directory.

## What was imported

- `appPackage/manifest.json` is a Microsoft 365 Unified App Manifest (devPreview).
- `appPackage/skills/` contains each `SKILL.md` copied verbatim from the source plugin and referenced by the manifest `agentSkills[]` array.
- `appPackage/commands/` (if present) holds the slash-command Markdown files from the source plugin. They are copied for forward compatibility but are not yet referenced by MOS3.
- `agentConnectors[]` in the manifest reflects remote MCP servers (`streamable-http` / `sse`) from `mcp.json`. Stdio (local) MCP servers were skipped — convert them by hand into `localMcpServer` entries if needed.

## Next steps

1. Review developer metadata in `appPackage/manifest.json` (id, packageName, name, description, urls).
2. For every `agentConnectors[*].toolSource.remoteMcpServer.authorization` entry with `type === "OAuthPluginVault"`, register a matching credential reference in the Microsoft 365 Developer Portal using the `referenceId` value baked into the manifest.
3. Build the upload package: `atk teamsapp package`.
4. Validate: `atk teamsapp validate --file-path ./appPackage/build/appPackage.dev.zip`.
