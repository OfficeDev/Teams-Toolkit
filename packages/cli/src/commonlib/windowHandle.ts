// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { execFileSync } from "child_process";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { logger } from "./logger";

/**
 * Walks up the process tree and returns the `MainWindowHandle` of the first ancestor that has one.
 *
 * Why a walk rather than GetConsoleWindow(): under any ConPTY host GetConsoleWindow() returns a
 * hidden `PseudoConsoleWindow`, which is useless as a dialog owner. The window the user actually
 * sees belongs to the terminal host process, so we have to climb the ancestor chain to find it.
 *
 * Measured behavior per host (walk trail -> resolved owner):
 * - VS Code integrated terminal: `node <- pwsh <- Code` -> the VS Code window.
 * - Windows Terminal tab, or `wt.exe <cmd>`: `node <- cmd <- WindowsTerminal` -> the WT window.
 *   WT spawned the shell, so it is a genuine ancestor.
 * - Classic conhost (`conhost.exe cmd`): `node <- cmd` -> the console window itself, because
 *   under conhost the console window is attributed to the client process.
 * - Standalone `cmd.exe` handed off to WT by the default-terminal setting: `node <- cmd <-
 *   explorer <- svchost <- ...`. WT is COM-activated on a separate process branch and is NOT an
 *   ancestor, so no terminal window is reachable and the walk yields nothing. That is intended:
 *   MSAL then uses a NULL owner, and the dialog still comes to the front via the foreground grant
 *   the CLI process holds.
 *
 * The walk stops at `explorer` rather than continuing, because explorer's `MainWindowHandle` is an
 * arbitrary shell window (observed: a `ThumbnailDeviceHelperWnd`) that would be a bogus owner.
 *
 * The script takes no input, so nothing is interpolated into the command line.
 */
const resolveWindowScript = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  // Snapshot the whole process table once; per-process CIM queries are ~3x slower.
  "$parent = @{}",
  "Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId | ForEach-Object { $parent[[int]$_.ProcessId] = [int]$_.ParentProcessId }",
  "$windows = @{}",
  "$names = @{}",
  "Get-Process | ForEach-Object { $names[[int]$_.Id] = $_.ProcessName; if ($_.MainWindowHandle -ne 0) { $windows[[int]$_.Id] = [int64]$_.MainWindowHandle } }",
  // Start from the parent of this PowerShell process, i.e. the CLI process itself.
  "$id = $parent[$PID]",
  "$trail = @()",
  "$found = 0",
  "for ($i = 0; $i -lt 12 -and $id; $i++) {",
  "  $name = $names[$id]",
  "  $trail += ('{0}({1})' -f $name, $id)",
  // Explorer's MainWindowHandle is an arbitrary shell window that varies over a session.
  "  if ($name -eq 'explorer') { break }",
  "  if ($windows.ContainsKey($id)) { $found = $windows[$id]; break }",
  "  $id = $parent[$id]",
  "}",
  // Single line: "<handle>;<walk trail>"
  "[Console]::Out.Write(\"$found;\" + ($trail -join ' <- '))",
].join("\n");

let cachedHandle: Buffer | undefined;
let resolved = false;

function mode(): string {
  return (process.env.ATK_WAM_PARENT_WINDOW ?? "").trim().toLowerCase();
}

function pointerSize(): number {
  return process.arch === "ia32" || process.arch === "arm" ? 4 : 8;
}

/**
 * Logs to the CLI and, when ATK_WAM_PARENT_WINDOW=debug, also appends to a temp file.
 * The file trace exists because a parent process (for example wiqd) may capture the CLI's
 * stdout, which would otherwise swallow the diagnostic.
 */
function trace(message: string): void {
  logger.debug(message);
  if (mode() !== "debug") {
    return;
  }
  try {
    fs.appendFileSync(
      path.join(os.tmpdir(), "atk-wam-parent.log"),
      `${new Date().toISOString()} pid=${process.pid} ${message}${os.EOL}`
    );
  } catch {
    // Diagnostics are best-effort.
  }
}

function toHandleBuffer(handle: number): Buffer {
  const size = pointerSize();
  const buffer = Buffer.alloc(size);
  if (size === 4) {
    buffer.writeUInt32LE(handle);
  } else {
    buffer.writeBigUInt64LE(BigInt(handle));
  }
  return buffer;
}

/**
 * Resolves a parent window handle for the WAM broker dialog, in the raw pointer-bytes format
 * `@azure/msal-node-runtime` expects (the same shape Electron's `getNativeWindowHandle()` returns).
 *
 * What the owner buys: without it the dialog is an independent top-level window — it still opens
 * in front (the broker inherits the CLI's foreground grant), but it falls behind the terminal on
 * the next click, does not minimize/restore with it, and is not centered on it. With it, the
 * dialog stays above the terminal window and tracks it.
 *
 * Set ATK_WAM_PARENT_WINDOW=off to disable, or =debug to also append the walk to a temp file.
 *
 * Returns undefined when disabled, on non-Windows platforms, when no suitable ancestor window
 * exists, or when resolution fails for any reason. In that case MSAL falls back to a NULL owner,
 * which is the behavior before this helper existed.
 */
export function getParentWindowHandle(): Buffer | undefined {
  if (resolved) {
    return cachedHandle;
  }
  resolved = true;

  if (process.platform !== "win32") {
    return undefined;
  }
  if (mode() === "off") {
    return undefined;
  }

  try {
    const encoded = Buffer.from(resolveWindowScript, "utf16le").toString("base64");
    const output = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      {
        encoding: "utf8",
        timeout: 15000,
        windowsHide: true,
        // PowerShell writes CLIXML progress records to stderr; keep them out of the CLI output.
        stdio: ["ignore", "pipe", "ignore"],
      }
    );
    const [handleText, walk] = output.trim().split(";");
    const handle = Number.parseInt(handleText, 10);
    if (!Number.isSafeInteger(handle) || handle <= 0) {
      trace(`[Login] no visible ancestor window found, using default owner (walk: ${walk ?? ""})`);
      return undefined;
    }
    trace(`[Login] using parent window handle 0x${handle.toString(16)} (walk: ${walk ?? ""})`);
    cachedHandle = toHandleBuffer(handle);
    return cachedHandle;
  } catch (e: any) {
    trace(`[Login] failed to resolve parent window handle: ${e.message}`);
    return undefined;
  }
}
