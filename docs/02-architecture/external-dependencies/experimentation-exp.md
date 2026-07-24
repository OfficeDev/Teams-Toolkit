# Experimentation (Azure ExP / TAS)

External-dependency fact page. Captures the **non-negotiable** experimentation
substrate the Microsoft 365 Agents Toolkit binds to when it reads feature
assignments from Azure ExP (the Treatment Assignment Service, "TAS"). Every fact
below is anchored in current source — change the code, and you must update this
page and its [code map](experimentation-exp.code-map.md).

This page does **not** decide engine-internal shape; that belongs in an ADR
under [`../adr/`](../adr/README.md). It only records what the ExP service outside
the engine forces us to honor. ExP is used as a remotely controllable **feature
flag**: an experiment publishes a typed value per client, and the surface gates
behavior on that value.

## 1. Facts the toolkit is bound to

### 1.1 TAS service & client libraries

| Field | Value | Notes |
|---|---|---|
| Endpoint | `https://default.exp-tas.com/vscode/ab` | The `vscode/ab` cluster. Both surfaces target the **same** endpoint. |
| VS Code library | `vscode-tas-client` (wraps `tas-client`) | Provides `getExperimentationServiceAsync(name, version, TargetPopulation, telemetry, memento)`. |
| CLI / Node library | `tas-client` | Raw `ExperimentationService`; the CLI supplies its own filter provider, telemetry bridge, and key-value storage. |
| Target population | `Public` | Passed as `TargetPopulation.Public` (VS Code) / `X-VSCode-TargetPopulation: public` (CLI). |

### 1.2 Assignment unit & audience filters

The experiment's **assignment unit is `clientid`** — TAS buckets by the
`X-MSEdge-ClientId` audience filter. Each surface computes this id
independently, so the **same machine is bucketed independently in VS Code vs.
the CLI**. The concrete filter values each surface sends (client id source,
extension name, build, language, market) are implementation choices, not ExP
bindings — they live in the [code map](experimentation-exp.code-map.md).

### 1.3 Config namespace & flag contract

| Aspect | Value | Notes |
|---|---|---|
| Config namespace (config id) | `vscode` | The flag's **namespace in ExP Studio must equal `vscode`**. Requested in code as the config id argument. |
| Flag key | e.g. `newtoolbar-1-0` | The **flag key in ExP Studio must exactly match** the string the code requests. Naming convention observed: `<name>-<major>-<minor>` (here name `newtoolbar`, version `1.0`). |
| Value types | `boolean` \| `number` \| `string` | `getTreatmentVariableAsync<T>` is generic over these three only. |
| Unassigned / finished result | `undefined` | An unassigned client, an undeployed flag, or a **finished stage** all resolve to `undefined`. |

### 1.4 Telemetry contract

The TAS query is reported under a fixed event/property pair hardcoded by
`vscode-tas-client` and mirrored by the CLI:

| Field | Value |
|---|---|
| Telemetry event name | `query-expfeature` |
| Assignment-context property | `abexp.assignmentcontext` |

Where each surface persists its assignment cache (VS Code `Memento` key, CLI
disk path) is an implementation choice recorded in the
[code map](experimentation-exp.code-map.md), not a binding.

### 1.5 Assignment lifecycle & timing semantics

1. **Two cache layers exist — the client-library cache and the toolkit's
   activation snapshot.** The client library keeps a local assignment cache:
   `vscode-tas-client` refetches it on a background interval (~30 min), while the
   CLI disables background polling (`refetchInterval: 0`) and fetches once per
   process. Separately, the toolkit reads a treatment **once at activation /
   process start** into a module-level field, so feature code that reads that
   field sees a value fixed until the next activation — regardless of any
   later library refetch.
2. **`checkCache: true` reads the client-library cache; `checkCache: false`
   forces a live network read.** A cached read reflects whatever the library
   last fetched, so under VS Code's background refetch it *can* move mid-session.
   What is truly frozen for the session is the **activation snapshot** in item 1,
   not `checkCache: true` itself. `checkCache: false` always bypasses the cache.
3. **Portal changes take minutes to propagate.** After starting or advancing a
   stage, allow time before a fresh activation can pick up the new assignment.
   Clearing the cache (VS Code `globalState` / the CLI `assignments.json`) drops
   any stale cached assignment.
4. **A finished stage returns `undefined`.** To turn a flag off after a stage
   completes, start a new stage; code must not assume `false` on `undefined`.
5. **Traffic-step values are percentages `0.0`–`100`, not fractions.** `1` means
   1 % of clients.

> **Developer guidance — don't gate on a stale activation snapshot.**
> The extension's current pattern reads each flag **once** at activation into a
> module-level field (e.g. `TreatmentVariableValue.newToolbar` in
> [`extension.ts`](../../../packages/vscode-extension/src/extension.ts)), so
> feature code reading that field never sees the client library's ~30-min
> background refresh — the value is frozen until the window reloads. Prefer one
> of these instead when adding a new flag:
>
> - **Read live at the point of use** via a small handler that calls
>   `getExpService().getTreatmentVariableAsync(configId, name, true)` each time
>   the feature is evaluated. `checkCache: true` is cheap (in-memory) and picks
>   up the background refresh, so the flag can flip mid-session as the stage
>   advances.
> - **Force a fresh read** with `checkCache: false` when you need the current
>   server value regardless of cache (e.g. a diagnostics / test command).
>
> Only keep the activation-snapshot pattern when you deliberately want a flag
> **stable for the whole session** (to avoid features toggling under the user
> mid-session); if so, document that intent at the read site.
>
> **Always read the flag with an explicit default.** A read can return
> `undefined` for an unassigned client, an undeployed flag, or a **finished
> progression** (§1.5.4). When gating a feature, coalesce to a code-side default
> (typically `false` = feature off) rather than treating `undefined` as `false`
> implicitly — e.g. `(await getTreatmentVariableAsync(...)) ?? false`. This also
> makes the "stage finished" behavior deterministic instead of accidental.

### 1.6 ExP Studio object model (how an assignment is produced)

The value the code reads is the output of this external configuration chain:

1. **Feature experiment** — the container (e.g. `new-toolbar`).
2. **Feature variants** — Control and Treatment, each carrying the flag in the
   `vscode` namespace with a typed value (e.g. `newtoolbar-1-0` = `true` for
   treatment, `false` for control).
3. **Progression** — selects the treatment/control variants and controls rollout
   logic (prefer a standard progression over freeform/template).
4. **Stage** — traffic steps assigning Control %/Treatment % (per §1.5.5).
5. **Start** — ExP begins assigning clients per the current traffic step.

> Manage these objects in [ExP Studio](https://exp.microsoft.com/feature-search?workspaceId=dbd12384-5001-4e90-a863-526321eaf233&experimentationGroup=vscodeexpws~teamstoolkit)
> (Teams Toolkit workspace).

## 2. Constraints derived from these facts

1. The flag **key and namespace** requested in code must exactly match the ExP
   Studio configuration (namespace `vscode`); a mismatch resolves to `undefined`. (§1.3)
2. Treatment reads must be **typed `boolean`/`number`/`string`** and must supply
   a **code-side default** for the `undefined` (unassigned / finished-stage) case. (§1.3, §1.5.4)
3. The toolkit's **activation snapshot** of a treatment value only refreshes on
   re-activation (reload the window / start a new CLI process) and **does not
   consume the client library's ~30-min background refresh**. To pick up the
   refresh, read live at the point of use (`checkCache: true`) or force a fresh
   read (`checkCache: false`) instead of caching the snapshot. Keep the snapshot
   only when session-stable behavior is intended. (§1.5.1, §1.5.2)
4. Each surface buckets by its **own `clientid`**; a flag intended to behave
   identically across VS Code and the CLI requires **audience filters that both
   surfaces satisfy** (the CLI sends `X-VSCode-Build: atk-cli` and the extension
   name `ms-teams-vscode-extension`). (§1.2)
5. All surfaces must query the **`vscode/ab` endpoint** with the `query-expfeature`
   / `abexp.assignmentcontext` telemetry contract. (§1.1, §1.4)

## 3. Open questions

- VS Code and the CLI compute **different `clientid`s** for the same machine, so
  a single experiment cannot guarantee identical assignment across both
  surfaces. Whether the toolkit should unify the CLI/extension client id (or
  accept independent bucketing) is unresolved — *no ADR stub yet*.
