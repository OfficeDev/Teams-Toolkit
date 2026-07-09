# Office Developer Runtime (ODR)

External-dependency fact page. Captures the **non-negotiable** contract the
Microsoft 365 Agents Toolkit binds to when it queries the Office Developer
Runtime (ODR) for locally installed MCP servers. Every fact below is
anchored in current source — change the ODR binary, and you must update
this page.

ODR is a separate Windows-side product owned outside this codebase. This
page records only what the toolkit consumes; how the toolkit composes that
contract into scaffold flows is an internal concern and belongs in an ADR
under [`../adr/`](../adr/README.md).

## 1. Facts the toolkit is bound to

### 1.1 Binary and platform

| Aspect | Value |
|---|---|
| Executable name | `odr` (resolved via PATH; `.exe` extension accepted but not required by the invoker) |
| Supported platform | Windows (`process.platform === "win32"`) only |
| Distribution channel | Out-of-band install; ODR is not bundled with the toolkit and is not declared as a runtime dependency. Absence is a normal state, not an error |

### 1.2 Invocation contract

The toolkit invokes a single command to enumerate locally installed MCP
servers:

| Aspect | Value |
|---|---|
| Command | `odr list` |
| Transport | Spawn a child process; read stdout as a UTF-8 string |
| Success signal | Exit code 0 and a non-empty stdout that parses as JSON |
| Failure signals | Non-zero exit, empty stdout, or non-JSON stdout — all treated equivalently as "no servers available" |

No flags, environment variables, working directory, or stdin input are
defined as part of the contract.

### 1.3 `odr list` response shape

Top-level shape consumed:

```jsonc
{
  "servers": [ /* see §1.4 */ ]
}
```

`servers` may be absent or not an array; in either case the toolkit treats
it as an empty list.

### 1.4 Per-server shape (only fields the toolkit reads)

```jsonc
{
  "name": "...",
  "description": "...",
  "version": "...",
  "packages": [ { "identifier": "..." } ],
  "_meta": {
    "io.modelcontextprotocol.registry/publisher-provided": {
      "com.microsoft.windows": {
        "manifest": {
          "display_name": "...",
          "server": {
            "mcp_config": {
              "command": "...",
              "args": ["..."]
            }
          },
          "_meta": {
            "com.microsoft.windows": {
              "package_family_name": "...",
              "static_responses": {
                "tools/list": {
                  "tools": [ /* see §1.5 */ ]
                }
              }
            }
          }
        }
      }
    }
  }
}
```

Two `_meta` namespace strings are part of this contract and are owned
outside the codebase:

- `io.modelcontextprotocol.registry/publisher-provided` — defined by the
  Model Context Protocol registry.
- `com.microsoft.windows` — defined by ODR / Windows.

A server entry that lacks `package_family_name` or `server.mcp_config` is
skipped by the toolkit (it does not surface as an installable option).

### 1.5 Per-tool shape (`static_responses["tools/list"].tools[]`)

```jsonc
{
  "name": "...",
  "description": "...",
  "inputSchema": { /* JSON Schema */ },
  "outputSchema": { /* JSON Schema, optional */ }
}
```

`inputSchema` and `outputSchema` follow the MCP-defined JSON Schema shape;
their internal structure is governed by the MCP spec, not by ODR.

### 1.6 Server identity for re-lookup

Once a server has been picked from `odr list` output, the tuple
`(server.mcp_config.command, server.mcp_config.args)` is the identity used
to locate that server's tools on a later call. The toolkit treats this
tuple as opaque external data — it does not synthesize, normalize, or
rewrite either field.

### 1.7 Toolkit-side recognition of ODR-launched servers

When the toolkit reads a project's own MCP server configuration, an entry
is recognized as ODR-launched when **all** of the following hold:

| Field | Required value |
|---|---|
| `type` | `"stdio"` |
| `command` | `"odr"` (case-insensitive) **or** ends with `"odr.exe"` (case-insensitive) |

The check is purely lexical against the config; ODR itself is not invoked
to validate the recognition.

## 2. Constraints derived from these facts

Rules a refactor must honor; each is a direct consequence of §1.

1. **ODR absence is non-fatal.** Code paths that call into ODR must
   degrade silently to "no servers" when the platform is not Windows
   (§1.1), when the binary is not on PATH, or when the invocation fails
   for any reason (§1.2).
2. **No Windows-only ODR import from cross-platform paths.** Anything that
   transitively touches `odr` invocation must be gated by the Windows
   check before it spawns; cross-platform code paths must not depend on
   the binary being present.
3. **Reserved `_meta` namespaces are fixed strings.** The literal keys
   `io.modelcontextprotocol.registry/publisher-provided` and
   `com.microsoft.windows` (§1.4) are owned externally; the toolkit must
   not rename, normalize, or substring-match them.
4. **Server selection skips incomplete entries.** A server missing
   `package_family_name` or `server.mcp_config` must not be surfaced as an
   installable option (§1.4); silently dropping it is the defined
   behavior.
5. **Server identity is the `(command, args)` tuple, used opaquely.**
   Subsequent tool lookups for a previously selected ODR server must match
   on the unmodified tuple from §1.6; canonicalization (case-folding,
   path-resolution, JSON re-ordering of args) is forbidden because ODR
   does not guarantee a normal form.
6. **ODR-launched recognition is lexical and case-insensitive on
   `command`.** The check in §1.7 must not be extended to inspect args,
   environment, or the running process; either marker on `command` is
   sufficient and necessary.
7. **No assumed `odr` version.** The toolkit must not gate behavior on an
   ODR version string; the contract above is the only versioned surface
   it relies on.

## 3. Open questions (candidates for ADRs)

These are *not* facts — they are gaps the refactor needs to close. None has
been promoted to an ADR yet.

- **Minimum ODR contract version.** Today there is no declared minimum
  `odr` version; the toolkit reads the fields it knows and ignores the
  rest. Should the contract gain an explicit version handshake so older
  `odr` releases can be detected and surfaced to the user?
- **Discoverability on non-Windows.** Today non-Windows surfaces silently
  show zero ODR servers. Should the toolkit instead surface "ODR is
  Windows-only" as a first-class capability message in those flows, or
  keep it invisible?

---

> **Where these facts live in code today:** see
> [`odr.code-map.md`](odr.code-map.md). The code map is a navigation aid
> and is expected to churn with refactors; it is not part of the contract.

> **How to update this page:** changes to the facts in §1 require updating
> [`odr.code-map.md`](odr.code-map.md) in the same PR. Adding a new
> constraint to §2 requires an accepted ADR under
> [`../adr/`](../adr/README.md); link it from the constraint line.
