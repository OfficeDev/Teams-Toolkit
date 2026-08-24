# Agent Plugin Import / Export (`atk import agentplugin`, `atk export agentplugin`)

Two-way converter between an [Agent Plugins v1.0.0](https://agent-plugins.org/)
plugin directory and a Microsoft 365 Agents Toolkit project (devPreview
manifest with `agentSkills` and `agentConnectors`).

> **Naming.** This specification was previously published as the "Open Plugin
> Spec" at `open-plugins.com`, which now permanently redirects to
> `agent-plugins.org`. The CLI accepts `agentplugin` (preferred) and
> `openplugin` (original name, retained so existing scripts keep working).
> Internal module and symbol names still use the historical `openPlugin`
> spelling.

## Layout

Agent Plugins 1.0.0 fixes component locations — a manifest can neither relocate
components nor declare them inline:

```
<plugin-root>/
  plugin.json        # required; $schema + name are mandatory
  mcp.json           # optional; MCP servers, explicit `type` on every entry
  skills/<name>/SKILL.md
  <reverse.domain>/  # client extension directories
```

### Accepted on import (back-compat)

Root-level Agent Plugins 1.0.0 files are validated strictly; pre-1.0.0
directories remain tolerant and import with a deprecation warning:

| Pre-1.0.0                                                                         | Agent Plugins 1.0.0                          |
| --------------------------------------------------------------------------------- | -------------------------------------------- |
| `.plugin/plugin.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json` | `plugin.json` in the plugin root             |
| `.mcp.json`                                                                       | `mcp.json`                                   |
| top-level `x-microsoft-365-agents-toolkit`                                        | `extensions["com.microsoft.agents-toolkit"]` |
| `"type": "http"`                                                                  | `"type": "streamable-http"`                  |
| manifest component-path overrides (`skills`, `commands`, …)                       | not permitted; fixed locations only          |

`atk export` only ever emits the 1.0.0 column.

## Usage

### Import

```bash
# Minimal — skills + MCP servers, with required developer URLs.
atk import agentplugin \
  --path ./my-plugin \
  --privacy-url https://contoso.com/privacy \
  --terms-url https://contoso.com/terms

# Round-trip case: plugin.json already contains a
# com.microsoft.agents-toolkit extension block (written by a previous
# `atk export agentplugin`), so --privacy-url / --terms-url are inferred.
atk import agentplugin --path ./my-plugin
```

### Export

```bash
# Export an ATK project to an Agent Plugins 1.0.0 directory.
atk export agentplugin --path ./my-project --output ./my-plugin
```

## CLI options — import

| Flag                  | Required    | Description                                                                                                                                                                                                              |
| --------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--path / -p`         | yes         | Path to the plugin directory.                                                                                                                                                                                            |
| `--output / -o`       | no          | Destination project folder. Defaults to `./<plugin-name>`.                                                                                                                                                               |
| `--privacy-url`       | conditional | `developer.privacyUrl`. Required unless plugin.json carries a `com.microsoft.agents-toolkit` extension block.                                                                                                            |
| `--terms-url`         | conditional | `developer.termsOfUseUrl`. Required unless plugin.json carries a `com.microsoft.agents-toolkit` extension block.                                                                                                         |
| `--website-url`       | no          | `developer.websiteUrl`. Falls back to plugin.json `homepage` then `author.url`.                                                                                                                                          |
| `--app-id`            | no          | Override the deterministic UUIDv5 manifest id.                                                                                                                                                                           |
| `--default-auth-type` | no          | `Auto` (default), `None`, `OAuthPluginVault`, or `ApiKeyPluginVault`. Auto probes remote HTTPS MCP endpoints and OAuth metadata, warns on inferred or fallback choices, and fails when the endpoint cannot be confirmed. |
| `--package-name`      | no          | Full reverse-DNS packageName (omitted from manifest when absent).                                                                                                                                                        |

## CLI options — export

| Flag              | Required | Description                                                                                                   |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `--path / -p`     | yes      | ATK project folder (must contain `appPackage/manifest.json`).                                                 |
| `--output / -o`   | no       | Destination plugin folder. Defaults to `./<plugin-name>-agentplugin`.                                         |
| `--manifest-kind` | no       | **Deprecated and ignored.** 1.0.0 mandates `plugin.json` in the plugin root. Passing a value emits a warning. |

## What gets mapped

| Agent Plugins component                                       | Manifest field                                 | Notes                                                                                                                                                                  |
| ------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/<name>/SKILL.md`                                      | `agentSkills[].folder`                         | Validated against Agent Skills required frontmatter, copied without symbolic links, and sorted alphabetically.                                                         |
| `mcp.json` `streamable-http` / `sse` servers                  | `agentConnectors[].toolSource.remoteMcpServer` | Preserved auth metadata or an explicit default wins. Auto uses an MCP `initialize` probe plus OAuth metadata discovery; localhost and non-HTTPS entries remain `None`. |
| `mcp.json` `stdio` servers                                    | _(skipped)_                                    | Warning emitted; requires manual `localMcpServer` setup.                                                                                                               |
| `commands/*.md`                                               | _(copied alongside, inert)_                    | Not an Agent Plugins component; kept so pre-1.0.0 directories round-trip.                                                                                              |
| `hooks/`, `agents/`, `rules/`, `lspServers/`, `outputStyles/` | _(dropped)_                                    | Warning emitted per field. Not representable in MOS3 today.                                                                                                            |

## Spec conformance notes

- **`$schema`** — export writes the mandated
  `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`; a root
  `plugin.json` is rejected when it is absent or unexpected. An invalid
  root-level `mcp.json` disables MCP for that plugin, while invalid individual
  server entries are skipped with warnings.
- **`name`** — validated against the published pattern
  (`^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$`, 1–64 chars). Export
  normalizes a project's display name into a conformant slug.
- **Closed schema** — 1.0.0 sets `additionalProperties: false`, so client data
  must be namespaced under `extensions`. Import reports unknown/relocation
  fields rather than rejecting the plugin, per the spec's conformance rules.
- **Agent Skills** — `SKILL.md` must contain valid YAML frontmatter with a
  `name` matching its folder and a non-empty `description`. Invalid skills are
  skipped with warnings.
- **Path containment** — component paths are resolved canonically. Paths and
  junctions that resolve outside the plugin root are rejected, and symbolic
  links are not copied into generated output.
- **`PLUGIN_ROOT` / `PLUGIN_DATA`** — the spec requires clients launching stdio
  servers to expand these in `args`, `env`, and `cwd`. Not implemented: stdio
  servers are skipped on import (MOS3 has no `localMcpServer` equivalent yet),
  so no subprocess is ever launched from this converter.

## Lossless round-trip via the toolkit extension

`atk export agentplugin` embeds a block under
`extensions["com.microsoft.agents-toolkit"]` in plugin.json. It captures every
field the Agent Plugins spec cannot represent natively (manifest id,
accentColor, manifestVersion, packageName, developer.privacyUrl,
developer.termsOfUseUrl, `name.short`/`full`, `description.short`/`full`,
per-connector displayName/description/authorization overrides). On the next
`atk import agentplugin` the block is read back so the reconstructed manifest
matches the original byte-for-byte where possible.

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
  spec.ts             # Agent Plugins 1.0.0 constants, name/type validation, path containment
  types.ts            # TypeScript interfaces (Import/Export inputs, AtkExtensionBlock)
  parser.ts           # Reads plugin dir: manifest probe, mcp.json, skills/, commands/, extension block
  validation.ts       # Strict Agent Plugins 1.0.0 manifest and MCP validation
  skillValidation.ts  # Agent Skills frontmatter validation
  fileSystem.ts       # Canonical containment checks and link-safe directory copies
  authorParser.ts     # Parses author field (object or "Name <email> (url)" string)
  textUtils.ts        # Word-boundary truncation, kebab-to-title-case
  deterministicId.ts  # UUIDv5 (SHA-1) for stable manifest id generation
  mapper.ts           # Pure transform: parsed plugin → devPreview manifest + copy operations
  iconStrategy.ts     # Resolves color.png / outline.png from plugin icons or logo field
  placeholderPng.ts   # Generates solid-color RGB PNGs using Node zlib (no native deps)
  importer.ts         # Orchestrator for `atk import agentplugin`
  exporter.ts         # Orchestrator for `atk export agentplugin`
```

## Feature flags

| Flag                               | Default | Purpose                                                                                                                                            |
| ---------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEAMSFX_OPENPLUGIN_IMPORT_EXPORT` | `true`  | Gates registration of the import/export commands (both spellings).                                                                                 |
| `TEAMSFX_AGENT_SKILLS`             | `false` | Gates `createAppPackage` folder walk for the DA-level `agent_skills` property. Top-level Teams manifest `agentSkills` is packaged unconditionally. |
