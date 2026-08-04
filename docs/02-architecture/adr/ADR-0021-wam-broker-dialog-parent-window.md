# ADR-0021 — Parent window for the WAM broker sign-in dialog

- **Status:** Proposed
- **Date:** 2026-08-04
- **Source:** Investigation of [gim-home/wiqd#1884](https://github.com/gim-home/wiqd/issues/1884)
  — "`wiqd auth login` hangs in the VS Code integrated terminal delegating to ATK interactive sign-in"
- **Related:** [ADR-0003](ADR-0003-broker-gating.md) (broker gating policy),
  [identity-and-login §1.3](../external-dependencies/identity-and-login.md#13-native-broker-wam)

## Context

When the CLI signs in on Windows with the native broker (WAM), it calls
`acquireTokenInteractive` and MSAL hands off to the broker, which renders a
native sign-in window out-of-process. Two problems follow from that hand-off.

**The CLI prints nothing.** `loginWithBroker` only emits a message from inside
the `openBrowser` callback, which MSAL never invokes when the broker handles
the flow. The terminal stays silent for the whole interactive sign-in.

**The dialog is not reliably reachable.** `InteractiveRequest.windowHandle` was
not set, so `NativeBrokerPlugin` substituted `Buffer.from([0])` — a NULL owner —
and the broker window was created unowned.

Whether an unowned window surfaces depends on Windows' foreground-activation
rules. A process may bring a window to the foreground only if it is the
foreground process, was *started by* the foreground process, or received the
last input event. Measured process trees:

| Host | Process chain | Foreground rights | Unowned dialog |
|---|---|---|---|
| classic console | `node <- cmd` | granted — parent owns the foreground window | comes to front, behaves modally |
| VS Code terminal | `node <- pwsh <- Code <- Code` | denied — parent owns no window | created behind, no activation |
| via wiqd | `node(atk) <- node(wiqd) <- shell` | denied — parent is windowless | created behind, no activation |

The reported bug is the combination: nothing printed, and a dialog the user
cannot see. The CLI appears hung.

## Options considered

- **A — Print a hint message only.** Emit a line before `acquireTokenInteractive`
  when the broker is available. Fixes the "no output" half everywhere, leaves
  the dialog unreachable.
- **B — Pass a parent window handle.** Resolve a real window and set
  `windowHandle`, so the dialog is owned: pinned above its owner in z-order,
  and the owner disabled while it is up.
- **C — Create our own owner window.** A 1×1 offscreen top-level window inside
  the CLI process. Works in every host, but requires a native addon with a
  dedicated Win32 message-pump thread — a window with no pump gets ghosted and
  the broker blocks on it.
- **D — Disable the broker in console contexts.** Falls back to the existing
  loopback auth-code flow, which already prints a URL and opens a browser.
  Loses WAM's SSO and device-trust properties and may break Conditional Access
  policies that require a broker.

## Decision

Adopt **B**. The CLI resolves a parent window handle and passes it as
`InteractiveRequest.windowHandle`.

`node.exe` owns no window of its own, so the handle must come from an ancestor.
[`packages/cli/src/commonlib/windowHandle.ts`](../../../packages/cli/src/commonlib/windowHandle.ts)
spawns a short PowerShell script that snapshots the process table once, walks up
from the CLI process, and returns the first ancestor with a visible
`MainWindowHandle`. The handle is converted to raw little-endian pointer bytes —
the shape `@azure/msal-node-runtime` expects — and memoized for the process
lifetime.

The walk, rather than `GetConsoleWindow()`, because the two host families differ:

- **ConPTY hosts** (VS Code, Windows Terminal): the shell is attached to a hidden
  `PseudoConsoleWindow`, which `MainWindowHandle` skips because it is not
  visible. The walk continues to the terminal host — `Code.exe`,
  `WindowsTerminal.exe` — which owns the window the user actually sees.
- **Classic conhost**: the shell itself reports the console window, so the walk
  stops there.

Being a ConPTY host is not sufficient — the terminal must also be an *ancestor*.
"Windows Terminal" covers two different process topologies:

- **WT launches the shell** (a profile tab, or `wt.exe <cmd>`): the shell is a
  child of `WindowsTerminal.exe`, so the walk reaches it.
- **Console handoff** (a standalone `cmd.exe` whose session `conhost.exe`
  delegates to the configured `DelegationTerminal`): `WindowsTerminal.exe` is
  COM-activated by the DCOM launcher, or is a pre-existing instance that is
  reused. Either way it sits on a separate process branch, connected to the
  client only by ConPTY pipes, which carry no parent/child relationship. The
  walk cannot cross into it and climbs into `explorer` instead.

A second family of hosts breaks the walk outright. Git Bash (MSYS) emulates
`fork`/`exec` by spawning a fresh Win32 process and letting the original exit, so
the Win32 parent chain above `sh` points at a PID that no longer exists. The
observed trail is `node <- node <- sh <- (dead pid)` — the snapshot has no entry
for the dead PID, the loop ends, and nothing is found. `GetConsoleWindow()` does
not bridge either gap: it returns 0 under Git Bash and a hidden
`PseudoConsoleWindow` elsewhere.

When the walk yields nothing, the resolver falls back to
`GetForegroundWindow()`. At sign-in time that is the terminal the user just typed
into, and it was measured to return the same handle the walk produces in the
hosts where both work. It is a fallback rather than the primary source because
the user can switch windows during the ~700 ms resolution, and an unrelated
application is a worse owner than a real ancestor. The P/Invoke it needs costs
~500 ms to compile, so it is only paid on the path that already failed.

Two guards constrain the result:

- The walk **stops at `explorer.exe`** and returns no handle. Explorer's
  `MainWindowHandle` is whichever visible top-level window it happens to
  enumerate first and varies across a session; a non-deterministic owner is
  worse than none. An `explorer`-owned foreground window is rejected for the
  same reason.
- Any failure — non-Windows, no suitable ancestor, PowerShell error, timeout —
  returns `undefined`, which restores the pre-existing NULL-owner behavior.

On by default. `ATK_WAM_PARENT_WINDOW=off` disables it; `=debug` additionally
appends the resolved handle and walk trail to `%TEMP%/atk-wam-parent.log`. The
file trace exists because callers such as wiqd capture the CLI's stdout, which
would otherwise swallow the diagnostic.

## Evidence

All measured on Windows 11 x64, `@azure/msal-node@5.4.0`,
`@azure/msal-node-extensions@1.5.25`.

| Host | Resolved walk | Handle | Outcome |
|---|---|---|---|
| VS Code, pwsh | `node <- pwsh <- Code <- Code` | `0x2f1130` `Chrome_WidgetWin_1` | dialog in front, blocks |
| VS Code, cmd | `node <- cmd <- Code <- Code` | `0x2f1130` | dialog in front, blocks |
| Windows Terminal tab, pwsh | `node <- pwsh <- WindowsTerminal` | `0xd30a02` `CASCADIA_HOSTING_WINDOW_CLASS` | dialog in front, blocks |
| `wt.exe cmd` | `node <- cmd <- WindowsTerminal` | `0x1240546` | dialog in front, blocks |
| standalone cmd (Windows Terminal defterm) | `node <- cmd <- explorer <- svchost <- services <- wininit` | none from the walk | no `WindowsTerminal` ancestor; falls back to foreground |
| VS Code, Git Bash, via wiqd | `node <- node <- sh <- (dead pid)` | none from the walk | MSYS severs the Win32 parent chain; falls back to foreground |
| forced `conhost.exe`, cmd | `node <- cmd` | `0x1612e0` `ConsoleWindowClass` | not a GUI window; see follow-ups |
| fallback branch, forced | `(999999) <- [foreground:Code(33156)]` | `0x2f1130` | same window the walk resolves when it works |

Supporting facts:

- The console window is attributed to the shell process (`cmd.exe`), not to
  `conhost.exe` — every `conhost` instance reports `MainWindowHandle = 0`.
- The same `cmd.exe` reports a real `MainWindowHandle` under forced conhost and
  `0` under defterm handoff. That difference distinguishes the last two rows
  above and confirms the handoff actually occurred.
- Explorer's `MainWindowHandle` was observed as a `ThumbnailDeviceHelperWnd`
  (`0x8e0c5e`) — a shell helper window, which is why the walk now stops there
  rather than accepting it. A `cmd.exe` started from a transient `explorer.exe`
  launcher hits a windowless `explorer` and would otherwise climb into system
  processes; one started from the Start menu or Run dialog has the shell
  `explorer` as its parent and would otherwise return the helper window.
- Resolution cost is ~700 ms on first call, 0 ms thereafter (memoized), rising to
  ~980 ms when the fallback branch compiles its P/Invoke. A per-process
  `Get-CimInstance` loop cost ~1700 ms; the single bulk query replaced it.
- The script takes no input and is passed as base64 UTF-16LE via
  `-EncodedCommand`, so there is no interpolation or injection surface.
- PowerShell emits CLIXML progress records on stderr; stderr is discarded to
  keep them out of CLI output.

## Consequences

**Positive.** The dialog is owned by the terminal window in ConPTY hosts, so it
is pinned above it and blocks it — the behavior users already get in a classic
console. This covers the VS Code and wiqd cases in the originating issue. No
native dependency is added, and every failure path degrades to today's
behavior.

**Negative.** Sign-in blocks for ~700 ms on the first call while PowerShell
runs, with no output during that window. The resolution is heuristic — it
depends on `MainWindowHandle` semantics and on process-tree shape, neither of
which is contractual. It is Windows-only and adds a process spawn to the login
path.

**Neutral.** Owned windows are excluded from the taskbar by design, so parenting
changes z-order and modality but cannot give the user a taskbar button or
Alt-Tab entry to recover a lost dialog.

**Negative, from the fallback.** If the user switches windows while resolution
runs, the dialog is parented to whatever is in the foreground at that moment,
which disables that unrelated application until sign-in completes. The window is
still reachable and the situation resolves itself, but it is a worse outcome than
the walk succeeding. This risk did not exist before the fallback.

## Follow-ups

Not covered by this ADR; each needs its own decision or work item.

1. **Hint message (option A) is still worth shipping.** Parenting does not fix
   the "prints nothing" half of the issue, and it only helps on Windows with the
   broker available. A localized line before `acquireTokenInteractive`, gated on
   `isBrokerAvailable`, would cover every host and both the M365 and Azure paths.
2. **Tests.** No unit tests exist for `windowHandle.ts`. Per the
   `vibe-coding` skill this behavior change needs an Acceptance Criteria table
   with tests derived 1:1. At minimum: non-Windows returns `undefined`, `off`
   returns `undefined`, malformed script output returns `undefined`, a
   PowerShell failure returns `undefined`, the buffer encoding is correct for
   the pointer size, and the result is memoized.
3. **Classic conhost is unguarded.** The walk stops at the shell's own
   `ConsoleWindowClass` window there. That is not a normal GUI window and has no
   application message pump. A forced-conhost session was the one configuration
   observed to hang, though the cause was never isolated — the Explorer landing
   is an equally plausible explanation and is now guarded. Guarding it properly
   requires comparing against `GetConsoleWindow()`, which costs an `Add-Type`
   compile (~0.5–1 s) on the synchronous login path.
4. **The original hang has no confirmed root cause.** It was reproduced by A/B
   (`off` cleared it) but never with a trace attached. If it recurs, the trace
   file names the owner window.
5. **Cost could move off the critical path.** The resolution could run
   concurrently with MSAL setup rather than blocking, or be replaced by a
   cheaper detection (`TERM_PROGRAM`, `WT_SESSION`) at the cost of robustness.
6. **VS Code surface is unaffected.** The extension already runs in a process
   with a real window; if it ever adopts the broker (see ADR-0003), it should
   pass its own handle rather than reuse this walk.
7. **Update dependent docs.** [ADR-0003](ADR-0003-broker-gating.md) should note
   that CLI broker sign-in now parents its dialog, and
   [identity-and-login §1.3](../external-dependencies/identity-and-login.md#13-native-broker-wam)
   should gain `windowHandle` alongside the existing broker quirks.

## Unrelated defect found during this work

`CLILogProvider.setLogLevel()` in
[`packages/cli/src/commonlib/log.ts`](../../../packages/cli/src/commonlib/log.ts)
is dead code — the log level it sets is never consulted, so every
`CliCodeLogInstance.debug()` and `.verbose()` call across the CLI silently
discards its message. Only `necessaryLog()` bypasses the check. Pre-existing and
out of scope here; it deserves its own issue.
