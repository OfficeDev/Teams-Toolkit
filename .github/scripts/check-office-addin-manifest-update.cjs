const fs = require("fs");
const path = require("path");

const { execSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BASELINE_PATH = path.join(
  REPO_ROOT,
  ".github",
  "office-addin-upstream-baseline.json",
);
const TEMPLATE_ROOT = path.join(REPO_ROOT, "templates", "vsc", "ts");

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

function toListText(items, limit = 10) {
  if (!items || items.length === 0) return "none";
  const shown = items.slice(0, limit).join(", ");
  if (items.length <= limit) return shown;
  return `${shown} (+${items.length - limit} more)`;
}

function buildFallbackSummary(driftedRows) {
  if (driftedRows.length === 0) {
    return "No upstream advances detected against the recorded baseline.";
  }
  return driftedRows
    .map(
      (row) =>
        `${row.id}: upstream advanced from baseline ${row.baselineVersion} to ${row.upstreamVersion} (toolkit ships ${row.toolkitVersion}).`,
    )
    .join(" ");
}

function generateAISummary(driftedRows) {
  const copilotToken = process.env.COPILOT_TOKEN || "";

  if (!copilotToken) {
    return {
      source: "fallback",
      text: "AI summary unavailable because no token was provided. Set COPILOT_TOKEN.",
    };
  }

  const promptPayload = driftedRows.map((row) => ({
    template: row.id,
    upstreamRepo: row.upstreamRepo,
    baselineVersion: row.baselineVersion,
    upstreamVersion: row.upstreamVersion,
    toolkitVersion: row.toolkitVersion,
  }));

  const prompt = `The following Microsoft 365 Agents Toolkit Office Add-in templates are forks of OfficeDev upstream templates, and upstream has published newer manifest versions. Output 5-8 bullet points covering: what changed, likely impact on the toolkit's forked templates, validation/compatibility risk, and upgrade priority.\n\n${JSON.stringify(promptPayload, null, 2)}`;

  try {
    const result = execSync(
      `copilot -p ${JSON.stringify(prompt)} --allow-tool=none --no-ask-user`,
      {
        encoding: "utf-8",
        timeout: 30000,
        env: { ...process.env, GITHUB_TOKEN: copilotToken },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    if (!result || typeof result !== "string") {
      return {
        source: "fallback",
        text: "AI summary unavailable because CLI response was empty.",
      };
    }

    return { source: "ai", text: result.trim() };
  } catch (error) {
    return {
      source: "fallback",
      text: `AI summary unavailable due to CLI error: ${error.message}`,
    };
  }
}

function buildIssueBody(report) {
  const tableRows = report.rows
    .map(
      (row) =>
        `| ${row.id} | ${row.toolkitVersion} | ${row.upstreamVersion} | ${row.baselineVersion} | ${row.status} | ${row.drifted ? "**yes**" : "no"} |`,
    )
    .join("\n");

  return [
    `<!-- office-addin-manifest-drift:${report.markerVersion} -->`,
    "## Office Add-in Upstream Manifest Drift Detected",
    "",
    "One or more OfficeDev upstream templates have published a newer manifest version than the",
    "recorded baseline for the corresponding toolkit Office Add-in template.",
    "",
    "## Status Table",
    "",
    "| Template | Toolkit ver | Upstream ver | Baseline | Status | Drifted |",
    "|---|---|---|---|---|---|",
    tableRows,
    "",
    "## AI Summary of Upstream Changes",
    "",
    `Source: ${report.aiSummarySource}`,
    report.aiSummaryText,
    "",
    "## Impact",
    "",
    `- Templates with upstream advances: ${toListText(report.driftedIds)}`,
    "",
    "## Recommended Upgrade Tasks",
    "",
    "- Review each drifted upstream template's manifest changes against the toolkit fork.",
    "- Update the affected `templates/vsc/ts/<id>/appPackage/manifest.json.tpl` where applicable.",
    "- Re-check `src/` divergence per `office-addin-toolkit-vs-upstream.md`.",
    "- Bump the corresponding entry in `.github/office-addin-upstream-baseline.json` once handled.",
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
  const rows = [];

  for (const template of TEMPLATES) {
    const toolkitVersion = readToolkitManifestVersion(template.id) || "unknown";
    const baselineVersion =
      baseline[template.id]?.upstreamManifestVersion || "N/A";

    let upstreamVersion = "N/A";
    let status;
    let drifted = false;

    if (!template.upstreamJson) {
      status = "xml-only";
    } else {
      const fetched = await fetchUpstreamManifestVersion(template);
      if (!fetched.ok) {
        status = "fetch-failed";
      } else {
        upstreamVersion = fetched.version || "N/A";
        status = "comparable";
        // Drift = upstream advanced beyond the recorded baseline.
        drifted =
          compareVersions(
            parseVersion(upstreamVersion),
            parseVersion(baselineVersion),
          ) > 0;
      }
    }

    rows.push({
      id: template.id,
      upstreamRepo: template.upstreamRepo,
      toolkitVersion,
      upstreamVersion,
      baselineVersion,
      status,
      drifted,
    });
  }

  const driftedRows = rows.filter((row) => row.drifted);
  const driftDetected = driftedRows.length > 0;
  const driftedIds = driftedRows.map((row) => row.id);

  let aiSummarySource = "none";
  let aiSummaryText = "No drift detected; no summary generated.";

  if (driftDetected) {
    const ai = generateAISummary(driftedRows);
    aiSummarySource = ai.source;
    aiSummaryText = ai.text;
    if (ai.source !== "ai") {
      aiSummaryText = `${ai.text}\n\nFallback summary: ${buildFallbackSummary(driftedRows)}`;
    }
  }

  const markerVersion = driftedRows
    .map((row) => `${row.id}:${row.upstreamVersion}`)
    .join(",");

  const report = {
    markerVersion,
    rows,
    driftedIds,
    aiSummarySource,
    aiSummaryText,
  };

  const issueTitle = driftDetected
    ? `Office Add-in upstream manifest drift: ${driftedIds.join(", ")}`
    : "Office Add-in upstream manifest drift";
  const issueBody = buildIssueBody(report);

  console.log(
    JSON.stringify(
      {
        driftDetected,
        driftedIds,
        rows,
        aiSummarySource,
      },
      null,
      2,
    ),
  );

  setOutput("drift_detected", String(driftDetected));
  setOutput("drift_marker_version", markerVersion);
  setOutput("drifted_ids", driftedIds.join(","));
  setOutput("ai_summary_source", aiSummarySource);
  setOutput("issue_title", issueTitle);
  setOutput("issue_body", issueBody);
}

main().catch((error) => {
  console.error("Office Add-in manifest drift check failed:", error);
  process.exitCode = 1;
});
