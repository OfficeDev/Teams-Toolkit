# Open Plugin Import / Export (`atk import openplugin`, `atk export openplugin`)

Two-way converter between an [Open Plugin Spec v1.0](https://open-plugins.com/)
plugin directory and a Microsoft 365 Agents Toolkit project (devPreview
manifest with `agentSkills` and `agentConnectors`).

Accepts plugins using any of the three manifest locations:

- `.plugin/plugin.json` (vendor-neutral, recommended)
- `.claude-plugin/plugin.json` (Claude Code)
- `.cursor-plugin/plugin.json` (Cursor)

## Usage

### Import

```bash
# Minimal — skills + MCP servers, with required developer URLs.
atk import openplugin \
  --path ./my-plugin \
  --privacy-url https://contoso.com/privacy \
  --terms-url https://contoso.com/terms

# Round-trip case: the source plugin.json already contains an
# x-microsoft-365-agents-toolkit extension block (written by a previous
# `atk export openplugin`), so --privacy-url / --terms-url are inferred.
atk import openplugin --path ./my-plugin
```

### Export

```bash
# Export an ATK project back to an Open Plugin directory.
atk export openplugin --path ./my-project --output ./my-plugin

# Emit a Claude- or Cursor-flavoured manifest location instead.
atk export openplugin --path ./my-project --manifest-kind claude-plugin
```

## CLI options — import

| Flag                  | Required    | Description                                                                                                                                                                                                              |
| --------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--path / -p`         | yes         | Path to the Open Plugin directory.                                                                                                                                                                                       |
| `--output / -o`       | no          | Destination project folder. Defaults to `./<plugin-name>`.                                                                                                                                                               |
| `--privacy-url`       | conditional | `developer.privacyUrl`. Required unless plugin.json carries an `x-microsoft-365-agents-toolkit` block.                                                                                                                   |
| `--terms-url`         | conditional | `developer.termsOfUseUrl`. Required unless plugin.json carries an `x-microsoft-365-agents-toolkit` block.                                                                                                                |
| `--website-url`       | no          | `developer.websiteUrl`. Falls back to plugin.json `homepage` then `author.url`.                                                                                                                                          |
| `--app-id`            | no          | Override the deterministic UUIDv5 manifest id.                                                                                                                                                                           |
| `--default-auth-type` | no          | `Auto` (default), `None`, `OAuthPluginVault`, or `ApiKeyPluginVault`. Auto probes remote HTTPS MCP endpoints and OAuth metadata, warns on inferred or fallback choices, and fails when the endpoint cannot be confirmed. |
| `--package-name`      | no          | Full reverse-DNS packageName (omitted from manifest when absent).                                                                                                                                                        |

## CLI options — export

| Flag              | Required | Description                                                               |
| ----------------- | -------- | ------------------------------------------------------------------------- |
| `--path / -p`     | yes      | ATK project folder (must contain `appPackage/manifest.json`).             |
| `--output / -o`   | no       | Destination Open Plugin folder. Defaults to `./<plugin-name>-openplugin`. |
| `--manifest-kind` | no       | `open-plugin` (default), `claude-plugin`, or `cursor-plugin`.             |

## What gets mapped

| Open Plugin component                                         | Manifest field                                 | Notes                                                                                                                                                                  |
| ------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/<name>/SKILL.md`                                      | `agentSkills[].folder`                         | Copied verbatim; sorted alphabetically.                                                                                                                                |
| `.mcp.json` HTTP servers                                      | `agentConnectors[].toolSource.remoteMcpServer` | Preserved auth metadata or an explicit default wins. Auto uses an MCP `initialize` probe plus OAuth metadata discovery; localhost and non-HTTPS entries remain `None`. |
| `.mcp.json` stdio servers                                     | _(skipped)_                                    | Warning emitted; requires manual `localMcpServer` setup.                                                                                                               |
| `commands/*.md`                                               | _(copied alongside, inert)_                    | Not yet in MOS3 manifest; kept for forward compatibility.                                                                                                              |
| `hooks/`, `agents/`, `rules/`, `lspServers/`, `outputStyles/` | _(dropped)_                                    | Warning emitted per field. Not representable in MOS3 today.                                                                                                            |

## Lossless round-trip via the `x-microsoft-365-agents-toolkit` extension

`atk export openplugin` embeds an `x-microsoft-365-agents-toolkit` block under
the root of plugin.json. It captures every field the Open Plugin Spec cannot
represent natively (manifest id, accentColor, manifestVersion, packageName,
developer.privacyUrl, developer.termsOfUseUrl, `name.short`/`full`,
`description.short`/`full`, per-connector displayName/description/authorization
overrides). On the next `atk import openplugin` the block is read back so the
reconstructed manifest matches the original byte-for-byte where possible.

## Auto authentication discovery

`--default-auth-type Auto` performs network requests for each remote HTTPS MCP URL whose auth is
not preserved in the ATK extension block. A confirmed endpoint with resolvable OAuth metadata maps
to `OAuthPluginVault`. A confirmed unauthenticated `initialize` response with no resolved OAuth
metadata maps to `None`. A confirmed auth challenge whose metadata cannot be resolved falls back to
`OAuthPluginVault`. Every outcome produces a warning; the fallback warning tells the developer to
verify the authentication type and register the placeholder reference before use.

Auto visits MCP URLs supplied by the source plugin, then follows OAuth metadata URLs and redirects
returned during discovery. It does not enforce an egress allowlist. For an untrusted plugin, verify
the URLs first or use an explicit `--default-auth-type` to skip discovery requests.

If the endpoint cannot be confirmed, the import stops with `UnresolvedMcpAuth`. Re-run with an
explicit `--default-auth-type` after verifying the server's requirements. `ApiKeyPluginVault` is
never inferred automatically.

## Module structure

```
openPlugin/
  types.ts            # TypeScript interfaces (Import/Export inputs, AtkExtensionBlock)
  parser.ts           # Reads plugin dir: manifest probe, .mcp.json, skills/, commands/, extension block
  authorParser.ts     # Parses author field (object or "Name <email> (url)" string)
  textUtils.ts        # Word-boundary truncation, kebab-to-title-case
  deterministicId.ts  # UUIDv5 (SHA-1) for stable manifest id generation
  mapper.ts           # Pure transform: parsed plugin → devPreview manifest + copy operations
  iconStrategy.ts     # Resolves color.png / outline.png from plugin icons or logo field
  placeholderPng.ts   # Generates solid-color RGB PNGs using Node zlib (no native deps)
  importer.ts         # Orchestrator for `atk import openplugin`
  exporter.ts         # Orchestrator for `atk export openplugin`
```

## Feature flags

| Flag                               | Default | Purpose                                                                                                                                            |
| ---------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEAMSFX_OPENPLUGIN_IMPORT_EXPORT` | `true`  | Gates registration of `atk import openplugin` and `atk export openplugin`.                                                                         |
| `TEAMSFX_AGENT_SKILLS`             | `false` | Gates `createAppPackage` folder walk for the DA-level `agent_skills` property. Top-level Teams manifest `agentSkills` is packaged unconditionally. |
