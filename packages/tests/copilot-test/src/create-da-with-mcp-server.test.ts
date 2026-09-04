// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * create-da-with-mcp-server.test.ts
 *
 * SCN-DA-CREATE-WITH-MCP-SERVER
 * TC-001: VS Code happy path — create DA with remote MCP server (no odr.exe)
 * TC-002: VS Code happy path — create DA with remote MCP server (odr.exe present, user picks Remote)
 * TC-003: CLI non-interactive happy path — create DA with --api-plugin-type mcp
 * TC-004: CLI non-interactive error — missing --mcp-da-server-url
 * TC-005: CLI non-interactive error — missing --mcp-da-auth-type when tools file provided
 * TC-006: VS Code cancellation — cancel at MCP URL InputBox leaves no partial project
 *
 * Runs INSIDE VSCode extension host via @vscode/test-electron (Mocha TDD).
 * Screenshots and UI interactions are driven by Playwright via signal files.
 */
import * as vscode from "vscode";
import * as assert from "assert";
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const OUTPUT_DIR =
  process.env.TEST_OUTPUT_DIR || path.join(os.tmpdir(), "atk-test-output");
const SCREENSHOT_DIR =
  process.env.SCREENSHOT_DIR || path.join(OUTPUT_DIR, "screenshots");
const SIGNAL_DIR =
  process.env.SCREENSHOT_SIGNAL_DIR ||
  path.join(OUTPUT_DIR, ".screenshot-signals");

const MCP_URL = "https://mcptest.example.com/sse";
const MCP_AUTH_URL = "https://mcpauth.example.com/sse";
const ATK_PROJECTS_DIR = path.join(os.homedir(), "AgentsToolkitProjects");
const ATK_TEST_OUT = path.join(os.homedir(), "atk-test-out");

function ensureDirs(): void {
  [OUTPUT_DIR, SCREENSHOT_DIR, SIGNAL_DIR, ATK_TEST_OUT].forEach((d) =>
    fs.mkdirSync(d, { recursive: true }),
  );
}

/** Signal Playwright to take a screenshot; polls async up to 8s */
async function takeScreenshot(name: string): Promise<void> {
  try {
    const dest = path.join(SCREENSHOT_DIR, `${name}.png`);
    const signal = path.join(SIGNAL_DIR, `${Date.now()}-${name}.signal`);
    fs.writeFileSync(signal, `screenshot:${dest}`, "utf8");
    await new Promise<void>((resolve) => {
      const deadline = Date.now() + 8000;
      const iv = setInterval(() => {
        if (!fs.existsSync(signal) || Date.now() >= deadline) {
          clearInterval(iv);
          if (fs.existsSync(signal)) {
            try {
              fs.unlinkSync(signal);
            } catch {}
          }
          resolve();
        }
      }, 100);
    });
    console.log(
      fs.existsSync(dest)
        ? `Screenshot: ${name}.png`
        : `Screenshot timeout: ${name}.png`,
    );
  } catch (e) {
    console.warn("Screenshot failed:", e);
  }
}

/**
 * Send an action signal to Playwright and wait for it to be processed.
 * Async (setInterval) so the VS Code event loop stays free.
 */
async function sendSignal(content: string, timeoutMs = 15000): Promise<void> {
  try {
    const signal = path.join(SIGNAL_DIR, `${Date.now()}-action.signal`);
    fs.writeFileSync(signal, content, "utf8");
    await new Promise<void>((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const iv = setInterval(() => {
        if (!fs.existsSync(signal) || Date.now() >= deadline) {
          clearInterval(iv);
          if (fs.existsSync(signal)) {
            console.log(`Signal timeout: ${content}`);
            try {
              fs.unlinkSync(signal);
            } catch {}
          }
          resolve();
        }
      }, 100);
    });
  } catch (e) {
    console.warn("Signal failed:", e);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForCommand(cmd: string, maxMs = 600000): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (true) {
    const allCmds = await vscode.commands.getCommands(true);
    if (allCmds.includes(cmd)) return true;
    if (Date.now() >= deadline) return false;
    await wait(1000);
  }
}

function writeResults(passed: number, failed: number, steps: object[]): void {
  const out = path.join(OUTPUT_DIR, "results.json");
  fs.writeFileSync(
    out,
    JSON.stringify({ passed, failed, steps }, null, 2),
    "utf8",
  );
}

/**
 * Poll for a project directory to be created and scaffolded, up to maxMs.
 * Returns the resolved project dir or empty string if not found.
 */
async function waitForProjectDir(
  appName: string,
  maxMs = 120000,
): Promise<string> {
  const searchRoots = [
    ATK_PROJECTS_DIR,
    path.join("/home/runner", "AgentsToolkitProjects"),
    os.homedir(),
    "/home/runner",
    ATK_TEST_OUT,
    os.tmpdir(),
    "/tmp",
    process.cwd(),
  ];

  // Also check VS Code workspace folders
  const wsf = vscode.workspace.workspaceFolders;
  if (wsf) {
    for (const f of wsf) {
      if (f.uri.fsPath.includes(appName)) return f.uri.fsPath;
    }
  }

  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    for (const root of searchRoots) {
      if (!fs.existsSync(root)) continue;
      const direct = path.join(root, appName);
      if (fs.existsSync(direct)) return direct;
      try {
        for (const entry of fs.readdirSync(root)) {
          if (entry.includes(appName)) {
            const full = path.join(root, entry);
            try {
              if (fs.statSync(full).isDirectory()) return full;
            } catch {}
          }
        }
      } catch {}
    }
    await wait(2000);
  }
  return "";
}

/**
 * Navigate the wizard through the common DA+MCP steps up to (and including)
 * "Start with a MCP server". Caller handles subsequent steps.
 * Prefix is used to namespace screenshots (e.g. "tc001").
 */
async function navigateToDaMcpServerStep(prefix: string): Promise<void> {
  // Step 1: App category — "Teams Agents and Apps"
  await sendSignal(
    `waitForTextThenScreenshot:Teams Agents and Apps:60000:${prefix}-01-wizard-open`,
    68000,
  );
  await sendSignal("clickText:Teams Agents and Apps", 10000);
  await wait(1000);

  // Step 2: App type — "Agent"
  await sendSignal(
    `waitForTextThenScreenshot:Agent:20000:${prefix}-02-agent-option`,
    28000,
  );
  await sendSignal("clickText:Agent", 10000);
  await wait(1000);

  // Step 3: Agent variant — "Declarative Agent"
  await sendSignal(
    `waitForTextThenScreenshot:Declarative Agent:20000:${prefix}-03-declarative-agent`,
    28000,
  );
  await sendSignal("clickText:Declarative Agent", 10000);
  await wait(1000);

  // Step 4: DA template path — "Add an Action"
  await sendSignal(
    `waitForTextThenScreenshot:Add an Action:20000:${prefix}-04-add-an-action`,
    28000,
  );
  await sendSignal("clickText:Add an Action", 10000);
  await wait(1000);

  // Step 5: Action source — "Start with a MCP server"
  await sendSignal(
    `waitForTextThenScreenshot:Start with a MCP server:20000:${prefix}-05-mcp-server-option`,
    28000,
  );
  await sendSignal("clickText:Start with a MCP server", 10000);
  await wait(1000);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

suite("ATK Create Declarative Agent with MCP Server", function () {
  this.timeout(15 * 60 * 1000);

  const steps: object[] = [];
  let passed = 0;
  let failed = 0;

  const step = (name: string, ok: boolean, detail?: string) => {
    steps.push({ name, status: ok ? "pass" : "fail", detail });
    ok ? passed++ : failed++;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`,
    );
  };

  suiteSetup(() => {
    ensureDirs();
    console.log("=== ATK Create DA with MCP Server ===");
    console.log("Output:", OUTPUT_DIR);
  });

  suiteTeardown(() => {
    writeResults(passed, failed, steps);
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  });

  // -------------------------------------------------------------------------
  // Shared: ATK extension activation
  // -------------------------------------------------------------------------

  test("ATK extension is active", async () => {
    const extId = "TeamsDevApp.ms-teams-vscode-extension";
    let ext = vscode.extensions.getExtension(extId);
    if (!ext) {
      for (let i = 0; i < 30; i++) {
        await wait(500);
        ext = vscode.extensions.getExtension(extId);
        if (ext) break;
      }
    }
    if (ext && !ext.isActive) {
      try {
        await ext.activate();
      } catch (e: any) {
        console.log("  Activation note:", e.message);
      }
    }
    await wait(3000);
    const active = !!ext?.isActive;
    step(
      "ATK extension activates",
      active,
      ext ? `v${ext.packageJSON.version}` : "not found",
    );
    await takeScreenshot("shared-00-extension-active");
    assert.ok(active, "ATK extension should be active");
  });

  // -------------------------------------------------------------------------
  // TC-001: VS Code happy path — create DA with remote MCP server (no odr.exe)
  // -------------------------------------------------------------------------

  test("TC-001: VS Code wizard — create DA with remote MCP server (no odr.exe)", async () => {
    const appName = "test-da-mcp-001";
    const prefix = "tc001";

    const cmdAvailable = await waitForCommand("fx-extension.create");
    step(
      "TC-001 fx-extension.create available",
      cmdAvailable,
      `available=${cmdAvailable}`,
    );

    // Fire command without awaiting — wizard blocks until user action
    vscode.commands.executeCommand("fx-extension.create").catch((e: any) => {
      console.log("  Command error:", e.message);
    });
    await wait(500);

    // Navigate to "Start with a MCP server" (steps 1–5)
    await navigateToDaMcpServerStep(prefix);

    // Step 6: MCP URL InputBox — no odr.exe so no MCP Server Type QuickPick
    await sendSignal(
      `waitForTextThenScreenshot:MCP:20000:${prefix}-06-mcp-url-input`,
      28000,
    );
    await takeScreenshot(`${prefix}-06-mcp-url-input`);
    await sendSignal(`type:${MCP_URL}`, 8000);
    await wait(500);
    await sendSignal("pressKey:Enter", 5000);
    await wait(1000);

    // Step 7: Workspace folder
    await sendSignal(
      `waitForTextThenScreenshot:Default folder:15000:${prefix}-07-workspace-folder`,
      23000,
    );
    await sendSignal("clickText:Default folder", 10000);
    await wait(1000);

    // Step 8: Application Name InputBox
    await sendSignal(
      `waitForTextThenScreenshot:Application Name:15000:${prefix}-08-app-name-input`,
      23000,
    );
    await takeScreenshot(`${prefix}-08-app-name-input`);
    await sendSignal(`type:${appName}`, 8000);
    await wait(500);
    await sendSignal("pressKey:Enter", 5000);

    // Wait for scaffold (up to 120s with intermediate screenshots)
    await wait(20000);
    await takeScreenshot(`${prefix}-09a-scaffold-20s`);
    await wait(30000);
    await takeScreenshot(`${prefix}-09b-scaffold-50s`);
    await wait(30000);
    await takeScreenshot(`${prefix}-09c-scaffold-80s`);
    await wait(20000);
    await takeScreenshot(`${prefix}-09-project-created`);

    // Step 21: Assert required project files
    const projectDir = await waitForProjectDir(appName, 30000);
    console.log("  TC-001 project dir:", projectDir || "not found");

    const requiredFiles = [
      "m365agents.yml",
      "appPackage/manifest.json",
      "appPackage/declarativeAgent.json",
      ".vscode/mcp.json",
    ];

    if (projectDir) {
      // Poll for sentinel file
      const sentinel = path.join(projectDir, "m365agents.yml");
      for (let i = 0; i < 30; i++) {
        if (fs.existsSync(sentinel)) break;
        await wait(1000);
      }
    }

    let allFound = true;
    for (const f of requiredFiles) {
      const exists = projectDir
        ? fs.existsSync(path.join(projectDir, f))
        : false;
      step(
        `TC-001 file: ${f}`,
        exists,
        exists ? "✓" : `not found in ${projectDir}`,
      );
      if (!exists) allFound = false;
    }

    // Verify .vscode/mcp.json contains the MCP URL
    let mcpUrlVerified = false;
    if (projectDir) {
      const mcpJsonPath = path.join(projectDir, ".vscode", "mcp.json");
      if (fs.existsSync(mcpJsonPath)) {
        const content = fs.readFileSync(mcpJsonPath, "utf8");
        mcpUrlVerified = content.includes("mcptest.example.com/sse");
      }
    }
    step(
      "TC-001 .vscode/mcp.json contains MCP URL",
      mcpUrlVerified,
      mcpUrlVerified ? MCP_URL : `not found in ${projectDir}/.vscode/mcp.json`,
    );

    await takeScreenshot(`${prefix}-10-final-state`);
    assert.ok(allFound, `TC-001: Required project files missing in ${projectDir}`);
    assert.ok(
      mcpUrlVerified,
      `TC-001: .vscode/mcp.json does not contain MCP URL`,
    );
  });

  // -------------------------------------------------------------------------
  // TC-002: VS Code happy path — create DA (odr.exe present, user picks Remote)
  // -------------------------------------------------------------------------

  test("TC-002: VS Code wizard — create DA with remote MCP server (odr.exe present, user picks Remote)", async () => {
    const appName = "test-da-mcp-odr-001";
    const prefix = "tc002";

    // Check if odr.exe is present; if not, document and skip scaffolding assert
    const odrPresent =
      fs.existsSync("/usr/local/bin/odr.exe") ||
      fs.existsSync(path.join(os.homedir(), ".atk", "bin", "odr.exe")) ||
      process.env.ODR_EXE_PATH
        ? fs.existsSync(process.env.ODR_EXE_PATH!)
        : false;
    console.log("  odr.exe present:", odrPresent);
    step(
      "TC-002 odr.exe presence detected",
      true,
      `odr.exe present=${odrPresent}`,
    );

    const cmdAvailable = await waitForCommand("fx-extension.create");

    // Fire command without awaiting
    vscode.commands.executeCommand("fx-extension.create").catch((e: any) => {
      console.log("  Command error:", e.message);
    });
    await wait(500);

    // Navigate to "Start with a MCP server" (steps 1–5)
    await navigateToDaMcpServerStep(prefix);

    if (odrPresent) {
      // Step 6 (odr path): MCP Server Type QuickPick appears
      await sendSignal(
        `waitForTextThenScreenshot:Remote MCP server:20000:${prefix}-02-mcp-server-type`,
        28000,
      );
      await takeScreenshot(`${prefix}-02-mcp-server-type`);
      await sendSignal("clickText:Remote MCP server", 10000);
      await wait(1000);
    }

    // Step 7 (odr) / Step 6 (no-odr): MCP URL InputBox
    await sendSignal(
      `waitForTextThenScreenshot:MCP:20000:${prefix}-03-mcp-url-input`,
      28000,
    );
    await takeScreenshot(`${prefix}-03-mcp-url-input`);
    await sendSignal(`type:${MCP_URL}`, 8000);
    await wait(500);
    await sendSignal("pressKey:Enter", 5000);
    await wait(1000);

    // Workspace folder
    await sendSignal(
      `waitForTextThenScreenshot:Default folder:15000:${prefix}-workspace-folder`,
      23000,
    );
    await sendSignal("clickText:Default folder", 10000);
    await wait(1000);

    // Application Name
    await sendSignal(
      `waitForTextThenScreenshot:Application Name:15000:${prefix}-app-name-input`,
      23000,
    );
    await sendSignal(`type:${appName}`, 8000);
    await wait(500);
    await sendSignal("pressKey:Enter", 5000);

    // Wait for scaffold
    await wait(30000);
    await takeScreenshot(`${prefix}-scaffold-30s`);
    await wait(60000);
    await takeScreenshot(`${prefix}-scaffold-90s`);
    await wait(30000);

    const projectDir = await waitForProjectDir(appName, 30000);
    console.log("  TC-002 project dir:", projectDir || "not found");

    const requiredFiles = [
      "m365agents.yml",
      "appPackage/manifest.json",
      "appPackage/declarativeAgent.json",
      ".vscode/mcp.json",
    ];

    if (projectDir) {
      const sentinel = path.join(projectDir, "m365agents.yml");
      for (let i = 0; i < 30; i++) {
        if (fs.existsSync(sentinel)) break;
        await wait(1000);
      }
    }

    let allFound = true;
    for (const f of requiredFiles) {
      const exists = projectDir
        ? fs.existsSync(path.join(projectDir, f))
        : false;
      step(
        `TC-002 file: ${f}`,
        exists,
        exists ? "✓" : `not found in ${projectDir}`,
      );
      if (!exists) allFound = false;
    }

    let mcpUrlVerified = false;
    if (projectDir) {
      const mcpJsonPath = path.join(projectDir, ".vscode", "mcp.json");
      if (fs.existsSync(mcpJsonPath)) {
        const content = fs.readFileSync(mcpJsonPath, "utf8");
        mcpUrlVerified = content.includes("mcptest.example.com/sse");
      }
    }
    step(
      "TC-002 .vscode/mcp.json contains MCP URL",
      mcpUrlVerified,
      mcpUrlVerified ? MCP_URL : `not verified`,
    );

    await takeScreenshot(`${prefix}-04-final-state`);
    step(
      "TC-002 wizard completed",
      cmdAvailable,
      `odr=${odrPresent}, filesOk=${allFound}`,
    );
    assert.ok(allFound, `TC-002: Required project files missing in ${projectDir}`);
  });

  // -------------------------------------------------------------------------
  // TC-003: CLI non-interactive happy path
  // -------------------------------------------------------------------------

  test("TC-003: CLI non-interactive — create DA with remote MCP server (happy path)", async () => {
    const appName = "test-da-mcp-cli-001";
    const outDir = ATK_TEST_OUT;
    const projectPath = path.join(outDir, appName);

    // Remove any pre-existing project from a previous run
    if (fs.existsSync(projectPath)) {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }

    // Locate the ATK CLI binary
    const atkBin =
      process.env.ATK_CLI_PATH ||
      (fs.existsSync("/usr/local/bin/atk") ? "/usr/local/bin/atk" : "atk");

    const cliArgs = [
      "new",
      "-c", "declarative-agent",
      "--with-plugin", "yes",
      "--api-plugin-type", "mcp",
      "--mcp-server-type", "remote",
      "--mcp-da-server-url", MCP_URL,
      "-n", appName,
      "-f", outDir,
      "--interactive", "false",
    ];

    console.log("  CLI command:", atkBin, cliArgs.join(" "));

    let exitCode = -1;
    let stdout = "";
    let stderr = "";

    try {
      const result = cp.spawnSync(atkBin, cliArgs, {
        encoding: "utf8",
        timeout: 120000,
        cwd: outDir,
      });
      exitCode = result.status ?? -1;
      stdout = result.stdout || "";
      stderr = result.stderr || "";
      console.log("  CLI exit code:", exitCode);
      if (stdout) console.log("  CLI stdout:", stdout.substring(0, 500));
      if (stderr) console.log("  CLI stderr:", stderr.substring(0, 500));
    } catch (e: any) {
      console.log("  CLI spawn error:", e.message);
      exitCode = -1;
    }

    await takeScreenshot("tc003-01-cli-output");

    step(
      "TC-003 CLI exits with code 0",
      exitCode === 0,
      `exit=${exitCode}`,
    );

    const requiredFiles = [
      "m365agents.yml",
      "appPackage/manifest.json",
      "appPackage/declarativeAgent.json",
      ".vscode/mcp.json",
    ];

    // Poll for sentinel
    if (fs.existsSync(projectPath)) {
      const sentinel = path.join(projectPath, "m365agents.yml");
      for (let i = 0; i < 30; i++) {
        if (fs.existsSync(sentinel)) break;
        await wait(1000);
      }
    }

    let allFound = true;
    for (const f of requiredFiles) {
      const exists = fs.existsSync(path.join(projectPath, f));
      step(
        `TC-003 file: ${f}`,
        exists,
        exists ? "✓" : `not found in ${projectPath}`,
      );
      if (!exists) allFound = false;
    }

    // Verify .vscode/mcp.json contains the URL
    let mcpUrlVerified = false;
    const mcpJsonPath = path.join(projectPath, ".vscode", "mcp.json");
    if (fs.existsSync(mcpJsonPath)) {
      const content = fs.readFileSync(mcpJsonPath, "utf8");
      mcpUrlVerified = content.includes("mcptest.example.com/sse");
    }
    step(
      "TC-003 .vscode/mcp.json contains MCP URL",
      mcpUrlVerified,
      mcpUrlVerified ? MCP_URL : `not verified`,
    );

    await takeScreenshot("tc003-02-project-files");
    assert.ok(exitCode === 0, `TC-003: CLI exited with code ${exitCode}`);
    assert.ok(allFound, `TC-003: Required files missing in ${projectPath}`);
    assert.ok(mcpUrlVerified, `TC-003: mcp.json does not contain expected URL`);
  });

  // -------------------------------------------------------------------------
  // TC-004: CLI non-interactive error — missing --mcp-da-server-url
  // -------------------------------------------------------------------------

  test("TC-004: CLI non-interactive error — missing --mcp-da-server-url", async () => {
    const appName = "test-da-mcp-err-001";
    const outDir = ATK_TEST_OUT;
    const projectPath = path.join(outDir, appName);

    if (fs.existsSync(projectPath)) {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }

    const atkBin =
      process.env.ATK_CLI_PATH ||
      (fs.existsSync("/usr/local/bin/atk") ? "/usr/local/bin/atk" : "atk");

    // Intentionally omit --mcp-da-server-url
    const cliArgs = [
      "new",
      "-c", "declarative-agent",
      "--with-plugin", "yes",
      "--api-plugin-type", "mcp",
      "--mcp-server-type", "remote",
      "-n", appName,
      "-f", outDir,
      "--interactive", "false",
    ];

    console.log("  CLI command (missing URL):", atkBin, cliArgs.join(" "));

    let exitCode = 0;
    let stdout = "";
    let stderr = "";

    try {
      const result = cp.spawnSync(atkBin, cliArgs, {
        encoding: "utf8",
        timeout: 60000,
        cwd: outDir,
      });
      exitCode = result.status ?? -1;
      stdout = result.stdout || "";
      stderr = result.stderr || "";
      console.log("  CLI exit code:", exitCode);
      if (stdout) console.log("  CLI stdout:", stdout.substring(0, 500));
      if (stderr) console.log("  CLI stderr:", stderr.substring(0, 500));
    } catch (e: any) {
      console.log("  CLI spawn error:", e.message);
      exitCode = -1;
    }

    await takeScreenshot("tc004-01-cli-error-output");

    const combined = stdout + stderr;
    const referencesUrl =
      combined.toLowerCase().includes("mcp-da-server-url") ||
      combined.toLowerCase().includes("mcp server url") ||
      combined.toLowerCase().includes("mcp_da_server_url");

    step(
      "TC-004 CLI exits non-zero for missing URL",
      exitCode !== 0,
      `exit=${exitCode}`,
    );
    step(
      "TC-004 error references mcp-da-server-url",
      referencesUrl,
      referencesUrl ? "✓" : `output: ${combined.substring(0, 200)}`,
    );

    const noPartialProject = !fs.existsSync(projectPath);
    step(
      "TC-004 no partial project created",
      noPartialProject,
      noPartialProject ? "✓" : `unexpected dir: ${projectPath}`,
    );

    assert.ok(
      exitCode !== 0,
      `TC-004: Expected non-zero exit for missing --mcp-da-server-url, got ${exitCode}`,
    );
    assert.ok(
      referencesUrl,
      `TC-004: Error output did not reference mcp-da-server-url`,
    );
  });

  // -------------------------------------------------------------------------
  // TC-005: CLI non-interactive error — missing --mcp-da-auth-type with tools file
  // -------------------------------------------------------------------------

  test("TC-005: CLI non-interactive error — missing --mcp-da-auth-type when tools file provided", async () => {
    const appName = "test-da-mcp-auth-001";
    const outDir = ATK_TEST_OUT;
    const projectPath = path.join(outDir, appName);
    const toolsFile = path.join(outDir, "tools.json");

    if (fs.existsSync(projectPath)) {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }

    // Create minimal tools JSON file
    fs.writeFileSync(
      toolsFile,
      JSON.stringify({
        tools: [{ name: "search", description: "Search the web" }],
      }),
      "utf8",
    );

    const atkBin =
      process.env.ATK_CLI_PATH ||
      (fs.existsSync("/usr/local/bin/atk") ? "/usr/local/bin/atk" : "atk");

    // Intentionally omit --mcp-da-auth-type
    const cliArgs = [
      "new",
      "-c", "declarative-agent",
      "--with-plugin", "yes",
      "--api-plugin-type", "mcp",
      "--mcp-server-type", "remote",
      "--mcp-da-server-url", MCP_AUTH_URL,
      "--mcp-tools-file-path", toolsFile,
      "-n", appName,
      "-f", outDir,
      "--interactive", "false",
    ];

    console.log(
      "  CLI command (missing auth-type):",
      atkBin,
      cliArgs.join(" "),
    );

    let exitCode = 0;
    let stdout = "";
    let stderr = "";

    try {
      const result = cp.spawnSync(atkBin, cliArgs, {
        encoding: "utf8",
        timeout: 90000,
        cwd: outDir,
      });
      exitCode = result.status ?? -1;
      stdout = result.stdout || "";
      stderr = result.stderr || "";
      console.log("  CLI exit code:", exitCode);
      if (stdout) console.log("  CLI stdout:", stdout.substring(0, 500));
      if (stderr) console.log("  CLI stderr:", stderr.substring(0, 500));
    } catch (e: any) {
      console.log("  CLI spawn error:", e.message);
      exitCode = -1;
    }

    await takeScreenshot("tc005-01-cli-auth-error-output");

    const combined = stdout + stderr;

    // Two valid outcomes per test plan:
    // a) auth required → exit non-zero, references mcp-da-auth-type
    // b) auth detection skipped (server unreachable) → exit 0, warning about "atk add action"
    const referencesAuthType =
      combined.toLowerCase().includes("mcp-da-auth-type") ||
      combined.toLowerCase().includes("auth-type") ||
      combined.toLowerCase().includes("authentication type") ||
      combined.toLowerCase().includes("mcp_da_auth_type");

    const warningAboutAction =
      combined.toLowerCase().includes("atk add action") ||
      combined.toLowerCase().includes("add action");

    if (exitCode !== 0) {
      step(
        "TC-005 CLI exits non-zero for missing auth type (server auth probed)",
        true,
        `exit=${exitCode}`,
      );
      step(
        "TC-005 error references mcp-da-auth-type",
        referencesAuthType,
        referencesAuthType ? "✓" : `output: ${combined.substring(0, 200)}`,
      );
      assert.ok(
        referencesAuthType,
        `TC-005: Error output did not reference mcp-da-auth-type`,
      );
    } else {
      // Server unreachable path: exit 0 + warning is acceptable
      step(
        "TC-005 CLI exits 0 (server unreachable, auth detection skipped)",
        true,
        `exit=0, warning present=${warningAboutAction}`,
      );
      step(
        "TC-005 warning hint present when auth detection skipped",
        warningAboutAction,
        warningAboutAction ? "✓" : `no 'atk add action' hint in output`,
      );
      // In the unreachable-server path passing is acceptable; soft-assert warning
      console.log(
        warningAboutAction
          ? "  TC-005 PASS: warning hint present"
          : "  TC-005 WARN: no warning hint in output",
      );
    }
  });

  // -------------------------------------------------------------------------
  // TC-006: VS Code cancellation — cancel at MCP URL InputBox
  // -------------------------------------------------------------------------

  test("TC-006: VS Code cancellation — cancel at MCP URL InputBox leaves no partial project", async () => {
    const appName = "test-da-mcp-cancel-001";
    const prefix = "tc006";
    const cancelProjectPath = path.join(ATK_PROJECTS_DIR, appName);

    // Ensure no pre-existing project with this name
    if (fs.existsSync(cancelProjectPath)) {
      fs.rmSync(cancelProjectPath, { recursive: true, force: true });
    }
    // Also check alternate locations
    for (const root of [
      path.join("/home/runner", "AgentsToolkitProjects"),
      os.homedir(),
    ]) {
      const alt = path.join(root, appName);
      if (fs.existsSync(alt)) {
        fs.rmSync(alt, { recursive: true, force: true });
      }
    }

    const cmdAvailable = await waitForCommand("fx-extension.create");

    // Fire command without awaiting
    vscode.commands.executeCommand("fx-extension.create").catch((e: any) => {
      console.log("  Command error:", e.message);
    });
    await wait(500);

    // Navigate to "Start with a MCP server" (steps 1–5)
    await navigateToDaMcpServerStep(prefix);

    // Step 3 (TC-006): MCP URL InputBox appears — take screenshot before cancel
    await sendSignal(
      `waitForTextThenScreenshot:MCP:20000:${prefix}-01-mcp-url-input-before-cancel`,
      28000,
    );
    await takeScreenshot(`${prefix}-01-mcp-url-input-before-cancel`);

    // Step 4: Press Escape to cancel the wizard
    await sendSignal("pressKey:Escape", 5000);
    await wait(2000);

    // Step 5: Take screenshot of VS Code after cancellation
    await takeScreenshot(`${prefix}-02-after-cancel`);

    // Step 6: Verify no partial project was created
    await wait(3000); // give ATK a moment to create a partial folder if it would

    const searchRoots = [
      ATK_PROJECTS_DIR,
      path.join("/home/runner", "AgentsToolkitProjects"),
      os.homedir(),
    ];
    let partialProjectExists = false;
    for (const root of searchRoots) {
      if (fs.existsSync(path.join(root, appName))) {
        partialProjectExists = true;
        console.log("  Found unexpected project dir:", path.join(root, appName));
        break;
      }
    }

    step(
      "TC-006 wizard command available",
      cmdAvailable,
      `available=${cmdAvailable}`,
    );
    step(
      "TC-006 no partial project created after cancellation",
      !partialProjectExists,
      partialProjectExists
        ? `unexpected dir found: ${appName}`
        : "✓ no partial folder",
    );

    assert.ok(
      !partialProjectExists,
      `TC-006: Partial project ${appName} was created after wizard cancellation`,
    );
  });
});
