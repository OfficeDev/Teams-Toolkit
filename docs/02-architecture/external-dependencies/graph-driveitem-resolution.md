# Microsoft Graph DriveItem resolution

External-dependency fact page. Captures the **non-negotiable** contract the
Microsoft 365 Agents Toolkit binds to when it resolves a user-pasted
SharePoint or OneDrive URL into the stable identifiers a Declarative Agent
manifest must reference. Every fact below is anchored in the Microsoft
Graph API surface or in current source — change the Graph contract, and
you must update this page.

Microsoft Graph is owned outside this codebase. This page records only the
Graph endpoints, encodings, and identifiers the toolkit consumes; how the
toolkit composes that contract into scaffold or provision flows is an
internal concern and belongs in an ADR under
[`../adr/`](../adr/README.md).

## 1. Facts the toolkit is bound to

### 1.1 Graph endpoints consumed

| Endpoint | Purpose |
|---|---|
| `GET /sites/{hostname}:{server-relative-path}?$select=id,name,sharepointIds` | Resolve a SharePoint site URL to a Graph `siteId` plus SharePoint `webId` / `siteId` |
| `GET /shares/{encoded-share-url}/driveItem?$select=id,name,sharepointIds,webUrl,file,folder` | Resolve a sharing URL to a `driveItem`, including SharePoint `listId` / `listItemUniqueId` |
| `GET /sites/{siteId}/items/{itemId}` | Site-item metadata for a known site + item |
| `GET /sites/{siteId}` | Site metadata for a known site |

### 1.2 Share URL encoding

For `/shares/{token}/driveItem`, the share URL must be encoded as:

1. Base64-encode the UTF-8 bytes of the URL.
2. Strip trailing `=`.
3. Replace `/` with `_` and `+` with `-`.
4. Prepend `u!`.

This encoding is fixed by Graph; there is no alternative encoding accepted
on the same endpoint.

### 1.3 Authentication

| Aspect | Value |
|---|---|
| Auth model | Microsoft Graph delegated token (signed-in user) |
| Scopes used | `GraphScopes` provided by the toolkit's M365 token provider — currently sufficient to resolve sites and shares the user can already access in the web UI |
| Cross-tenant behavior | A signed-in user can resolve URLs only within their own tenant's reach; cross-tenant URLs require the resolver to run under a user signed into the target tenant |

### 1.4 Identifiers used downstream

The resolver emits the following stable identifiers into the Declarative
Agent manifest knowledge source records:

| Identifier | Source field on Graph response | Survives |
|---|---|---|
| `siteId` | `sharepointIds.siteId` | Site renames |
| `webId` | `sharepointIds.webId` | Site renames |
| `listId` | `sharepointIds.listId` | Document-library renames |
| `listItemUniqueId` | `sharepointIds.listItemUniqueId` | Item moves within the same list |

Raw URLs are *not* stable identifiers — DA manifests cannot reference
SharePoint/OneDrive content by URL.

### 1.5 Sovereign-cloud routing

Graph base URL is environment-dependent and must be resolved through the
toolkit's sovereign-cloud routing layer, per
[`identity-and-login.md`](identity-and-login.md). Hard-coding
`graph.microsoft.com` would break sovereign clouds.

## 2. Constraints derived from these facts

Rules a refactor must honor; each is a direct consequence of §1.

1. **Graph is the only path.** The identifiers in §1.4 cannot be derived
   from the URL alone; the Graph calls in §1.1 are the canonical resolver
   and there is no in-process substitute.
2. **Share URL encoding is fixed.** Any helper that constructs a
   `/shares/{token}` URL must use the exact encoding in §1.2 — there is
   no alternative path on Graph that accepts the URL unencoded.
3. **Login must be established before resolution.** Resolution requires a
   signed-in user per §1.3; any call site must guarantee login state
   before invoking the resolver, or fail with a "sign in first"
   directive rather than surfacing the underlying 401.
4. **Sovereign-cloud-aware base URL.** All Graph calls must go through
   the sovereign-cloud routing layer per §1.5; no call site may construct
   a literal `https://graph.microsoft.com` URL.
5. **Identifiers, not URLs, in the manifest.** Generated DA manifest
   knowledge sources must carry the identifiers in §1.4, not raw URLs;
   any code path that writes a raw URL into the manifest is a defect.

## 3. Open questions (candidates for ADRs)

These are *not* facts — they are gaps the refactor needs to close.

- **Resolution timing.** Today the resolver runs during scaffolding,
  which forces login + outbound network on the create flow. Should
  resolution be deferred to provision — with the manifest carrying a
  placeholder URL or encoded share token in the meantime — so scaffold
  stays offline / login-free per
  [`../scaffolding.md`](../scaffolding.md) §3? Tracked in
  [ADR-0007](../adr/ADR-0007-driveitem-resolution-timing.md).

---

> **Where these facts live in code today:** see
> [`graph-driveitem-resolution.code-map.md`](graph-driveitem-resolution.code-map.md).
> The code map is a navigation aid and is expected to churn with
> refactors; it is not part of the contract.

> **How to update this page:** changes to the facts in §1 require updating
> [`graph-driveitem-resolution.code-map.md`](graph-driveitem-resolution.code-map.md)
> in the same PR. Adding a new constraint to §2 requires an accepted ADR
> under [`../adr/`](../adr/README.md); link it from the constraint line.
