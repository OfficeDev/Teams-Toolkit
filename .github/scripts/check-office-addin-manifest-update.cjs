const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { execSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BASELINE_PATH = path.join(
  REPO_ROOT,
  ".github",
  "office-addin-upstream-baseline.json",
);
const TEMPLATE_ROOT = path.join(REPO_ROOT, "templates", "vsc", "ts");
const RESULTS_PATH = path.join(REPO_ROOT, ".github", "office-addin-drift-results.json");

// Toolkit Office Add-in templates mapped to their OfficeDev upstream source.
// `upstreamJson` is false when upstream ships only an XML manifest (not comparable).
const TEMPLATES = [
  {
    id: "office-addin-wxpo-taskpane",
    upstreamRepo: "OfficeDev/Office-Addin-TaskPane",
    upstreamBranch: "release",
    upstreamJson: true,
  },
  {
    id: "office-addin-outlook-taskpane",
    upstreamRepo: "OfficeDev/Office-Addin-TaskPane",
    upstreamBranch: "release",
    upstreamJson: true,
  },
  {
    id: "office-addin-excel-customfunctions",
    upstreamRepo: "OfficeDev/Excel-Custom-Functions",
    upstreamBranch: "release",
    upstreamJson: true,
  },
  {
    id: "office-addin-excel-cfshortcut",
    upstreamRepo: "OfficeDev/Excel-Custom-Functions-Shared",
    upstreamBranch: "release",
    upstreamJson: true,
  },
  {
    id: "office-addin-sso-naa",
    upstreamRepo: "OfficeDev/Office-Addin-TaskPane-SSO-NAA",
    upstreamBranch: "yo-office",
    upstreamJson: false,
  },
];

function parseVersion(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] || 0),
  };
}

function compareVersions(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function versionToString(version, includePatch = true) {
  if (!version) return "N/A";
  if (includePatch) return `${version.major}.${version.minor}.${version.patch}`;
  return `${version.major}.${version.minor}`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// GitHub API GET with optional token (higher rate limit + private access).
async function githubApi(urlPath) {
  const token = process.env.GH_TOKEN || "";
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "office-addin-manifest-drift-check",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetch(`https://api.github.com${urlPath}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// Toolkit .tpl manifests contain {{...}} placeholders that break JSON.parse.
// manifestVersion is always a literal, so extract it directly by regex.
function readToolkitManifestVersion(templateId) {
  const tplPath = path.join(
    TEMPLATE_ROOT,
    templateId,
    "appPackage",
    "manifest.json.tpl",
  );
  if (!fs.existsSync(tplPath)) return null;
  const content = fs.readFileSync(tplPath, "utf8");
  const match = content.match(/"manifestVersion"\s*:\s*"([^"]+)"/);
  return match ? match[1] : null;
}

// Toolkit .tpl package.json parses as JSON (its only placeholder sits inside a
// string value). Read its dependency maps; return null if it can't be parsed.
function readToolkitDependencies(templateId) {
  const tplPath = path.join(TEMPLATE_ROOT, templateId, "package.json.tpl");
  if (!fs.existsSync(tplPath)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(tplPath, "utf8"));
    return {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };
  } catch {
    return null;
  }
}

async function fetchUpstreamDependencies(template) {
  const url = `https://raw.githubusercontent.com/${template.upstreamRepo}/${template.upstreamBranch}/package.json`;
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return null;
    const pkg = JSON.parse(await response.text());
    return {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };
  } catch {
    return null;
  }
}

// Compare toolkit vs upstream dependency maps. added = upstream has, toolkit
// lacks; removed = toolkit has, upstream dropped; changed = version range differs.
function diffDependencies(toolkitDeps, upstreamDeps) {
  if (!toolkitDeps || !upstreamDeps) return null;
  const added = [];
  const removed = [];
  const changed = [];

  for (const name of Object.keys(upstreamDeps)) {
    if (!(name in toolkitDeps)) {
      added.push(`${name}@${upstreamDeps[name]}`);
    } else if (toolkitDeps[name] !== upstreamDeps[name]) {
      changed.push(`${name}: ${toolkitDeps[name]} → ${upstreamDeps[name]}`);
    }
  }
  for (const name of Object.keys(toolkitDeps)) {
    if (!(name in upstreamDeps)) {
      removed.push(`${name}@${toolkitDeps[name]}`);
    }
  }

  const drift = added.length > 0 || removed.length > 0 || changed.length > 0;
  return { added, removed, changed, drift };
}

// Stable short hash of an upstream dependency map, so we can record it in the
// baseline and only flag dep drift when UPSTREAM's deps change from what we last
// reconciled (rather than flagging the toolkit's intentional divergence forever).
function hashDependencies(deps) {
  if (!deps) return null;
  const normalized = Object.keys(deps)
    .sort()
    .map((name) => `${name}@${deps[name]}`)
    .join("\n");
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

async function fetchUpstreamManifestVersion(template) {
  const url = `https://raw.githubusercontent.com/${template.upstreamRepo}/${template.upstreamBranch}/manifest.json`;
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return { ok: false, version: null };
    const text = (await response.text()).replace(/\\a/g, "\\x07");
    const manifest = JSON.parse(text);
    return { ok: true, version: String(manifest.manifestVersion || "") };
  } catch {
    return { ok: false, version: null };
  }
}

async function fetchLatestCommitSha(template) {
  const data = await githubApi(
    `/repos/${template.upstreamRepo}/commits/${template.upstreamBranch}`,
  );
  return data && data.sha ? data.sha : null;
}

// Recent commits on the upstream branch, newest first, capped at `limit`.
async function fetchRecentCommits(template, limit = 15) {
  const data = await githubApi(
    `/repos/${template.upstreamRepo}/commits?sha=${template.upstreamBranch}&per_page=${limit}`,
  );
  if (!Array.isArray(data)) return [];
  return data.map((entry) => ({
    sha: (entry.sha || "").slice(0, 10),
    date: entry.commit?.author?.date || "",
    message: (entry.commit?.message || "").split("\n")[0],
  }));
}

function toListText(items, limit = 10) {
  if (!items || items.length === 0) return "none";
  const shown = items.slice(0, limit).join(", ");
  if (items.length <= limit) return shown;
  return `${shown} (+${items.length - limit} more)`;
}

// The Copilot CLI streams its whole tool-call trace to stdout (file reads, web
// fetches, greps). Keep only the final answer: prefer everything from the first
// VERDICT marker onward; otherwise drop the trace/tree-glyph lines.
// Classify a Copilot judgment into a coarse verdict for downstream automation.
// Returns "update" | "no-update" | "review" | "unknown".
function parseVerdict(judgmentText) {
  const t = String(judgmentText || "").toUpperCase();
  if (/VERDICT[:\s*]*NO UPDATE NEEDED/.test(t)) return "no-update";
  if (/VERDICT[:\s*]*UPDATE NEEDED/.test(t)) return "update";
  if (/VERDICT[:\s*]*REVIEW/.test(t)) return "review";
  return "unknown";
}

function stripCliTrace(raw) {
  const text = String(raw).replace(/\r/g, "");

  // Drop the CLI tool-call trace lines wherever they appear (tree glyphs, web
  // fetches, greps, file reads, content-type notes, api/raw URLs).
  const dropped = text
    .split("\n")
    .filter((line) => !/^\s*[●│└/✗✘✓]/.test(line))
    .filter((line) => !/^\s*●?\s*skill\(/.test(line))
    .filter((line) => !/Fetching web content|Content type .*cannot be simplified/.test(line))
    .filter((line) => !/^\s*Search \(|(\d+ (files|lines) (found|read))/.test(line))
    .filter((line) => !/^\s*https?:\/\/(api\.github\.com|raw\.githubusercontent\.com|github\.com)/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Prefer everything from the real verdict LINE onward (keyword required, so a
  // stray lowercase "verdict." in prose can't false-match), searched in the
  // already-cleaned text.
  const verdictIdx = dropped.search(
    /^\**\s*verdict\**\s*[:\-]?\s*(update needed|no update needed|review)/im,
  );
  if (verdictIdx !== -1) {
    return dropped.slice(verdictIdx).trim();
  }
  return dropped || text.trim();
}

// Ask Copilot CLI to explore upstream + toolkit code itself and judge whether
// the toolkit template should be updated. Copilot has its own tools enabled so
// it can fetch upstream files and read the checked-out toolkit template.
function judgeWithCopilot(row) {
  const copilotToken = process.env.COPILOT_GITHUB_TOKEN || "";
  if (!copilotToken) {
    return {
      source: "fallback",
      text: "Copilot judgment unavailable because no token was provided. Set COPILOT_GITHUB_TOKEN.",
    };
  }

  const toolkitSrcPath = path
    .join("templates", "vsc", "ts", row.id, "src")
    .replace(/\\/g, "/");

  const recentCommitsText = row.recentCommits.length
    ? row.recentCommits
        .map((c) => `- ${c.sha} ${c.date} ${c.message}`)
        .join("\n")
    : "- (none fetched)";

  const d = row.depDiff || {};
  const depText = row.depDrift
    ? [
        d.added && d.added.length
          ? `Added upstream (toolkit lacks): ${d.added.join(", ")}`
          : null,
        d.changed && d.changed.length
          ? `Version changed (toolkit → upstream): ${d.changed.join(", ")}`
          : null,
        d.removed && d.removed.length
          ? `Removed upstream (toolkit still has): ${d.removed.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "(no package.json dependency drift)";

  const prompt = [
    `You are auditing a Microsoft 365 Agents Toolkit Office Add-in template that is a fork of an OfficeDev upstream template.`,
    ``,
    `Toolkit template id: ${row.id}`,
    `Toolkit template source (in this repo, already checked out): ${toolkitSrcPath}`,
    `Upstream repo: https://github.com/${row.upstreamRepo} (branch: ${row.upstreamBranch})`,
    `Baseline upstream commit we last reconciled with: ${row.baselineSha}`,
    `Current upstream head commit: ${row.upstreamSha}`,
    ``,
    `Recent upstream commits since baseline (newest first):`,
    recentCommitsText,
    ``,
    `package.json dependency drift (precomputed, toolkit vs upstream):`,
    depText,
    ``,
    `Task:`,
    `1. Read the toolkit template's src/ files locally.`,
    `2. Fetch the corresponding upstream src/ files (raw.githubusercontent.com/${row.upstreamRepo}/${row.upstreamBranch}/src/...).`,
    `3. Compare the TypeScript logic (ignore formatting, comments, and the toolkit's {{placeholder}} tokens).`,
    `4. Consider the dependency drift above: judge whether the upstream dependency changes are security/compat-relevant and whether the toolkit's package.json.tpl should follow (note that some toolkit deps intentionally differ).`,
    `5. Judge whether the toolkit template needs a code and/or dependency update to track upstream.`,
    ``,
    `Output concise markdown: a one-line VERDICT (UPDATE NEEDED / NO UPDATE NEEDED / REVIEW), then 3-6 bullets citing the specific files/dependencies and behavioral differences, then an upgrade-priority (low/medium/high).`,
  ].join("\n");

  try {
    const result = execSync(
      `copilot -p ${JSON.stringify(prompt)} --allow-all-tools --no-ask-user`,
      {
        encoding: "utf-8",
        timeout: 180000,
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    if (!result || typeof result !== "string") {
      return {
        source: "fallback",
        text: "Copilot judgment unavailable because CLI response was empty.",
      };
    }
    return { source: "ai", text: stripCliTrace(result) };
  } catch (error) {
    return {
      source: "fallback",
      text: `Copilot judgment unavailable due to CLI error: ${error.message}`,
    };
  }
}

function buildIssueBody(report) {
  const tableRows = report.rows
    .map(
      (row) =>
        `| ${row.id} | ${row.toolkitVersion} | ${row.upstreamVersion} | ${row.baselineVersion} | ${row.manifestDrift ? "yes" : "no"} | ${row.codeDrift ? "yes" : "no"} | ${row.depDrift ? "yes" : "no"} | ${row.status} |`,
    )
    .join("\n");

  const depSections = report.rows
    .filter((row) => row.depDrift)
    .map((row) => {
      const d = row.depDiff || {};
      const line = (label, items) =>
        items && items.length
          ? `- ${label}:\n${items.map((i) => `  - ${i}`).join("\n")}`
          : null;
      return [
        `### ${row.id}`,
        "",
        line("Added upstream (toolkit lacks)", d.added),
        line("Version changed (toolkit → upstream)", d.changed),
        line("Removed upstream (toolkit still has)", d.removed),
        "",
      ]
        .filter((x) => x !== null)
        .join("\n");
    })
    .join("\n");

  const judgmentSections = report.rows
    .filter((row) => row.codeDrift || row.depDrift)
    .map((row) =>
      [
        `### ${row.id}`,
        "",
        `Upstream: \`${row.upstreamRepo}@${row.upstreamBranch}\` — baseline \`${row.baselineSha?.slice(0, 10)}\` → head \`${row.upstreamSha?.slice(0, 10)}\``,
        "",
        `Copilot judgment (source: ${row.judgment.source}):`,
        "",
        row.judgment.text,
        "",
      ].join("\n"),
    )
    .join("\n");

  return [
    `<!-- office-addin-manifest-drift:${report.markerVersion} -->`,
    "## Office Add-in Upstream Drift Detected",
    "",
    "One or more OfficeDev upstream templates have advanced past the recorded baseline for the",
    "corresponding toolkit Office Add-in template — a newer manifest version, new commits, or",
    "changed package.json dependencies.",
    "",
    "## Status Table",
    "",
    "| Template | Toolkit ver | Upstream ver | Baseline ver | Manifest drift | Code drift | Dep drift | Status |",
    "|---|---|---|---|---|---|---|---|",
    tableRows,
    "",
    "## Dependency Drift (package.json)",
    "",
    depSections || "_No dependency drift detected._",
    "",
    "## Copilot Code-Update Judgment",
    "",
    judgmentSections ||
      "_No code or dependency drift detected; no per-template judgment generated._",
    "",
    "## Recommended Follow-up",
    "",
    "- Review each Copilot judgment above and update the affected `templates/vsc/ts/<id>/src` where warranted.",
    "- Reconcile flagged `package.json.tpl` dependency ranges against upstream where appropriate.",
    "- Update the affected `templates/vsc/ts/<id>/appPackage/manifest.json.tpl` if manifest drift is flagged.",
    "- Re-check `office-addin-toolkit-vs-upstream.md` for known intentional divergences.",
    "- Bump the affected `upstreamManifestVersion` / `upstreamCommitSha` in `.github/office-addin-upstream-baseline.json` once reconciled.",
    "",
    "## Notes",
    "",
    `- Generated by workflow run: ${process.env.GITHUB_SERVER_URL || "https://github.com"}/${process.env.GITHUB_REPOSITORY || ""}/actions/runs/${process.env.GITHUB_RUN_ID || ""}`,
    "",
    "Please route this for Copilot-driven upgrade work.",
  ].join("\n");
}

function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;

  if (value.includes("\n")) {
    const delimiter = `EOF_${name}`;
    fs.appendFileSync(
      outputFile,
      `${name}<<${delimiter}\n${value}\n${delimiter}\n`,
    );
  } else {
    fs.appendFileSync(outputFile, `${name}=${value}\n`);
  }
}

async function main() {
  const baseline = readJson(BASELINE_PATH).templates || {};
  // Manual test switch (workflow_dispatch input): treat every template as
  // drifted regardless of baseline, to exercise the Copilot + issue path.
  const ignoreBaseline = /^(true|1)$/i.test(process.env.IGNORE_BASELINE || "");
  const rows = [];

  for (const template of TEMPLATES) {
    const toolkitVersion = readToolkitManifestVersion(template.id) || "unknown";
    const baselineEntry = baseline[template.id] || {};
    const baselineVersion = baselineEntry.upstreamManifestVersion || "N/A";
    const baselineSha = baselineEntry.upstreamCommitSha || "N/A";
    const baselineDepHash = baselineEntry.upstreamDepHash || "N/A";

    let upstreamVersion = "N/A";
    let status;
    let manifestDrift = false;

    if (!template.upstreamJson) {
      status = "xml-only";
    } else {
      const fetched = await fetchUpstreamManifestVersion(template);
      if (!fetched.ok) {
        status = "fetch-failed";
      } else {
        upstreamVersion = fetched.version || "N/A";
        status = "comparable";
        manifestDrift =
          compareVersions(
            parseVersion(upstreamVersion),
            parseVersion(baselineVersion),
          ) > 0;
      }
    }

    // Code drift: upstream head SHA differs from the reconciled baseline SHA.
    const upstreamSha = await fetchLatestCommitSha(template);
    const codeDrift =
      ignoreBaseline ||
      Boolean(
        upstreamSha && baselineSha !== "N/A" && upstreamSha !== baselineSha,
      );

    // Dependency drift: toolkit vs upstream package.json dependency ranges.
    // Dependency drift: only when UPSTREAM's dependency set changed from the
    // reconciled baseline hash (the toolkit-vs-upstream diff below is shown for
    // context, but it is not itself the trigger — that would flag intentional
    // toolkit divergence on every run).
    const upstreamDeps = await fetchUpstreamDependencies(template);
    const upstreamDepHash = hashDependencies(upstreamDeps);
    const depDiff = diffDependencies(
      readToolkitDependencies(template.id),
      upstreamDeps,
    );
    const depDrift =
      ignoreBaseline ||
      Boolean(
        upstreamDepHash &&
          baselineDepHash !== "N/A" &&
          upstreamDepHash !== baselineDepHash,
      );

    const recentCommits = codeDrift
      ? await fetchRecentCommits(template)
      : [];

    const row = {
      id: template.id,
      upstreamRepo: template.upstreamRepo,
      upstreamBranch: template.upstreamBranch,
      toolkitVersion,
      upstreamVersion,
      baselineVersion,
      baselineSha,
      upstreamSha: upstreamSha || "N/A",
      baselineDepHash,
      upstreamDepHash: upstreamDepHash || "N/A",
      status,
      manifestDrift,
      codeDrift,
      depDrift,
      depDiff,
      recentCommits,
      judgment: { source: "none", text: "" },
    };

    // Let Copilot explore + judge when code or dependencies actually drifted.
    if (codeDrift || depDrift) {
      row.judgment = judgeWithCopilot(row);
    }
    row.verdict = parseVerdict(row.judgment.text);

    rows.push(row);
  }

  const driftedRows = rows.filter(
    (row) => row.manifestDrift || row.codeDrift || row.depDrift,
  );
  const driftDetected = driftedRows.length > 0;
  const driftedIds = driftedRows.map((row) => row.id);

  const markerVersion = driftedRows
    .map(
      (row) =>
        `${row.id}:${row.upstreamVersion}:${(row.upstreamSha || "").slice(0, 10)}`,
    )
    .join(",");

  const report = {
    markerVersion,
    rows,
    driftedIds,
  };

  const issueTitle = driftDetected
    ? `Office Add-in upstream drift: ${driftedIds.join(", ")}`
    : "Office Add-in upstream drift";
  const issueBody = buildIssueBody(report);

  console.log(
    JSON.stringify(
      {
        driftDetected,
        driftedIds,
        rows: rows.map((row) => ({
          id: row.id,
          toolkitVersion: row.toolkitVersion,
          upstreamVersion: row.upstreamVersion,
          baselineVersion: row.baselineVersion,
          baselineSha: row.baselineSha?.slice(0, 10),
          upstreamSha: row.upstreamSha?.slice(0, 10),
          status: row.status,
          manifestDrift: row.manifestDrift,
          codeDrift: row.codeDrift,
          depDrift: row.depDrift,
          upstreamDepHash: row.upstreamDepHash,
          judgmentSource: row.judgment.source,
          verdict: row.verdict,
        })),
      },
      null,
      2,
    ),
  );

  // Templates Copilot judged as needing an update — the PR-generation step
  // consumes these. Write a full results file so the apply script has the
  // per-template judgment text and drift detail without re-running the check.
  const updateRows = rows.filter((row) => row.verdict === "update");
  const updateIds = updateRows.map((row) => row.id);
  fs.writeFileSync(
    RESULTS_PATH,
    JSON.stringify(
      {
        generatedForRun: process.env.GITHUB_RUN_ID || "",
        rows: rows.map((row) => ({
          id: row.id,
          upstreamRepo: row.upstreamRepo,
          upstreamBranch: row.upstreamBranch,
          verdict: row.verdict,
          manifestDrift: row.manifestDrift,
          codeDrift: row.codeDrift,
          depDrift: row.depDrift,
          depDiff: row.depDiff,
          judgment: row.judgment.text,
        })),
      },
      null,
      2,
    ),
  );

  setOutput("drift_detected", String(driftDetected));
  setOutput("drift_marker_version", markerVersion);
  setOutput("drifted_ids", driftedIds.join(","));
  setOutput("update_ids", updateIds.join(","));
  setOutput("issue_title", issueTitle);
  setOutput("issue_body", issueBody);
}

main().catch((error) => {
  console.error("Office Add-in manifest drift check failed:", error);
  process.exitCode = 1;
});
