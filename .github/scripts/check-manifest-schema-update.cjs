const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

// Each manifest template the toolkit ships, mapped to the microsoft/json-schemas
// folder that publishes its canonical schema. `versionField` is the JSON key that
// carries the schema version inside the template (values may be "1.29" or "v1.8").
const MANIFESTS = [
  {
    id: "teams-app-manifest",
    name: "Teams App Manifest",
    templatePath:
      "templates/vsc/ts/basic-custom-engine-agent/appPackage/manifest.json.tpl",
    versionField: "manifestVersion",
    schemaRepoPath: "teams",
    schemaUrl: (v) =>
      `https://developer.microsoft.com/en-us/json-schemas/teams/v${v}/MicrosoftTeams.schema.json`,
  },
  {
    id: "declarative-agent-manifest",
    name: "Declarative Agent Manifest",
    templatePath:
      "templates/vsc/common/declarative-agent-basic/appPackage/declarativeAgent.json.tpl",
    versionField: "version",
    schemaRepoPath: "copilot/declarative-agent",
    schemaUrl: (v) =>
      `https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v${v}/schema.json`,
  },
  {
    id: "plugin-manifest",
    name: "Plugin Manifest",
    templatePath:
      "templates/vsc/ts/declarative-agent-with-action-from-scratch/appPackage/ai-plugin.json.tpl",
    versionField: "schema_version",
    schemaRepoPath: "copilot/plugin",
    schemaUrl: (v) =>
      `https://developer.microsoft.com/json-schemas/copilot/plugin/v${v}/schema.json`,
  },
];

// Normalize "v1.29" / "1.29" into comparable numeric parts.
function normalizeVersionParts(version) {
  const matches = String(version || "")
    .trim()
    .replace(/^v/i, "")
    .match(/\d+/g);
  return matches ? matches.map(Number) : [];
}

function compareVersionStrings(a, b) {
  const aParts = normalizeVersionParts(a);
  const bParts = normalizeVersionParts(b);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const av = aParts[i] ?? 0;
    const bv = bParts[i] ?? 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

async function githubApi(urlPath) {
  const token = process.env.GH_TOKEN || "";
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "manifest-schema-monitor",
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

// Templates carry {{...}} placeholders that break JSON.parse; the version field is
// always a literal, so pull it with a regex.
function readTemplateVersion(manifest) {
  const tplPath = path.join(REPO_ROOT, manifest.templatePath);
  if (!fs.existsSync(tplPath)) return null;
  const content = fs.readFileSync(tplPath, "utf8");
  const match = content.match(
    new RegExp(`"${manifest.versionField}"\\s*:\\s*"([^"]+)"`),
  );
  return match ? match[1] : null;
}

// Walk the version folders under the manifest's json-schemas path (newest first)
// and return the highest one whose published schema URL actually resolves.
async function fetchLatestSchemaVersion(manifest) {
  const folders = await githubApi(
    `/repos/microsoft/json-schemas/contents/${manifest.schemaRepoPath}`,
  );
  if (!Array.isArray(folders)) return null;

  const versions = folders
    .filter((f) => f.type === "dir")
    .map((f) => (f.name.match(/^v(\d+\.\d+)$/) || [])[1])
    .filter(Boolean)
    .sort((a, b) => compareVersionStrings(b, a));

  for (const version of versions) {
    try {
      const response = await fetch(manifest.schemaUrl(version), {
        method: "HEAD",
        signal: AbortSignal.timeout(20000),
      });
      if (response.ok) return version;
    } catch {
      // try the next-lower version
    }
  }
  return null;
}

// Latest commit that touched this version's schema folder — used to detect
// patch-level changes when the version number itself hasn't moved.
async function fetchLatestCommitSha(manifest, version) {
  const data = await githubApi(
    `/repos/microsoft/json-schemas/commits?path=${manifest.schemaRepoPath}/v${version}&per_page=1`,
  );
  if (Array.isArray(data) && data.length > 0) return data[0].sha;
  return null;
}

// The Copilot CLI streams its whole tool-call trace to stdout. Keep only the
// final answer: prefer everything from the SUMMARY marker onward, else drop the
// trace/tree-glyph lines.
function stripCliTrace(raw) {
  const text = String(raw).replace(/\r/g, "");
  const dropped = text
    .split("\n")
    .filter((line) => !/^\s*[●│└/✗✘✓]/.test(line))
    .filter((line) => !/^\s*●?\s*skill\(/.test(line))
    .filter(
      (line) =>
        !/Fetching web content|Content type .*cannot be simplified/.test(line),
    )
    .filter((line) => !/^\s*Search \(|(\d+ (files|lines) (found|read))/.test(line))
    .filter(
      (line) =>
        !/^\s*https?:\/\/(api\.github\.com|raw\.githubusercontent\.com|github\.com|developer\.microsoft\.com)/.test(
          line,
        ),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const summaryIdx = dropped.search(/^\**\s*summary\**\s*[:\-]/im);
  if (summaryIdx !== -1) return dropped.slice(summaryIdx).trim();
  return dropped || text.trim();
}

// Ask Copilot CLI to diff the two published schemas and summarize what changed,
// flagging any impact on properties the toolkit templates actually use.
function summarizeWithCopilot(row) {
  const copilotToken = process.env.COPILOT_GITHUB_TOKEN || "";
  if (!copilotToken) {
    return {
      source: "fallback",
      text: "Copilot summary unavailable because no token was provided. Set COPILOT_GITHUB_TOKEN.",
    };
  }

  const templatePath = row.templatePath.replace(/\\/g, "/");
  const prompt = [
    `You are auditing a Microsoft 365 Agents Toolkit manifest template against the canonical schema published in microsoft/json-schemas.`,
    ``,
    `Manifest: ${row.name}`,
    `Toolkit template (already checked out in this repo): ${templatePath}`,
    `Template schema version in use: v${row.templateVersion}`,
    `Latest published schema version: v${row.latestVersion}`,
    `Template schema URL:  ${row.templateSchemaUrl}`,
    `Latest schema URL:    ${row.latestSchemaUrl}`,
    ``,
    `Task:`,
    `1. Fetch both schema JSON documents from the two URLs above.`,
    `2. Diff them: identify added, removed, and changed properties.`,
    `3. Read the toolkit template locally to see which properties it actually uses.`,
    `4. Summarize what changed and call out whether any change affects properties the template relies on (breaking vs non-breaking).`,
    ``,
    `Output concise markdown beginning with a line "SUMMARY:", then: a short overview, an "Impacted properties" bullet list (properties the template uses that changed, each marked BREAKING or NON-BREAKING), and an "Other changes" bullet list. Keep it under ~30 lines.`,
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
        text: "Copilot summary unavailable because CLI response was empty.",
      };
    }
    return { source: "ai", text: stripCliTrace(result) };
  } catch (error) {
    return {
      source: "fallback",
      text: `Copilot summary unavailable due to CLI error: ${error.message}`,
    };
  }
}

function buildIssueBody(report) {
  const tableRows = report.rows
    .map(
      (row) =>
        `| ${row.name} | v${row.templateVersion} | v${row.latestVersion} | ${row.updateType} |`,
    )
    .join("\n");

  const summarySections = report.rows
    .filter((row) => row.drift)
    .map((row) =>
      [
        `### ${row.name}`,
        "",
        `Template \`v${row.templateVersion}\` → latest \`v${row.latestVersion}\` (${row.updateType})`,
        `Latest schema commit: [\`${(row.latestCommitSha || "").slice(0, 10)}\`](https://github.com/microsoft/json-schemas/commit/${row.latestCommitSha})`,
        "",
        `Copilot summary (source: ${row.summary.source}):`,
        "",
        row.summary.text,
        "",
      ].join("\n"),
    )
    .join("\n");

  return [
    `<!-- manifest-schema-drift:${report.markerVersion} -->`,
    "## Manifest Schema Update Detected",
    "",
    "One or more toolkit manifest templates are behind the canonical schema published in",
    "`microsoft/json-schemas` — a newer schema version, or new commits to the current version's schema folder.",
    "",
    "## Status Table",
    "",
    "| Manifest | Template ver | Latest ver | Update type |",
    "|---|---|---|---|",
    tableRows,
    "",
    "## Copilot Change Summary",
    "",
    summarySections || "_No drift detected._",
    "",
    "## Recommended Follow-up",
    "",
    "- Review each summary above and update the affected `*.tpl` manifest to the latest schema version and `$schema` URL.",
    "- Pay special attention to any property marked BREAKING.",
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
  // Manual test switch: treat every manifest as drifted to exercise the full path.
  const ignoreBaseline = /^(true|1)$/i.test(process.env.IGNORE_BASELINE || "");
  const rows = [];

  for (const manifest of MANIFESTS) {
    const templateVersion = readTemplateVersion(manifest) || "unknown";
    const latestVersion = await fetchLatestSchemaVersion(manifest);

    if (!latestVersion) {
      rows.push({
        ...manifest,
        templateVersion,
        latestVersion: "N/A",
        updateType: "fetch-failed",
        drift: false,
        summary: { source: "none", text: "" },
      });
      continue;
    }

    const latestCommitSha = await fetchLatestCommitSha(manifest, latestVersion);
    const versionBehind =
      compareVersionStrings(latestVersion, templateVersion) > 0;

    const drift = ignoreBaseline || versionBehind;
    const updateType = versionBehind
      ? "version-update"
      : ignoreBaseline
        ? "forced"
        : "up-to-date";

    const row = {
      ...manifest,
      templateVersion,
      latestVersion,
      latestCommitSha: latestCommitSha || "N/A",
      templateSchemaUrl: manifest.schemaUrl(
        normalizeVersionParts(templateVersion).join("."),
      ),
      latestSchemaUrl: manifest.schemaUrl(latestVersion),
      updateType,
      drift,
      summary: { source: "none", text: "" },
    };

    if (drift) row.summary = summarizeWithCopilot(row);
    rows.push(row);
  }

  const driftedRows = rows.filter((row) => row.drift);
  const driftDetected = driftedRows.length > 0;
  const driftedNames = driftedRows.map((row) => row.name);

  const markerVersion = driftedRows
    .map((row) => `${row.id}:${row.latestVersion}:${(row.latestCommitSha || "").slice(0, 10)}`)
    .join(",");

  const report = { markerVersion, rows, driftedNames };

  const issueTitle = driftDetected
    ? `Manifest schema update: ${driftedNames.join(", ")}`
    : "Manifest schema update";
  const issueBody = buildIssueBody(report);

  console.log(
    JSON.stringify(
      {
        driftDetected,
        rows: rows.map((row) => ({
          id: row.id,
          templateVersion: row.templateVersion,
          latestVersion: row.latestVersion,
          updateType: row.updateType,
          drift: row.drift,
          summarySource: row.summary.source,
        })),
      },
      null,
      2,
    ),
  );

  setOutput("drift_detected", String(driftDetected));
  setOutput("drift_marker_version", markerVersion);
  setOutput("issue_title", issueTitle);
  setOutput("issue_body", issueBody);
}

main().catch((error) => {
  console.error("Manifest schema update check failed:", error);
  process.exitCode = 1;
});
