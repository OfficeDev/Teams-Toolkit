const fs = require("fs");
const path = require("path");

const { execSync, execFileSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RESULTS_PATH = path.join(
  REPO_ROOT,
  ".github",
  "office-addin-drift-results.json",
);
const TEMPLATE_REL = path.join("templates", "vsc", "ts");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// The Copilot CLI streams its tool-call trace (file reads, greps, shell, failed
// MCP calls with 403 policy messages, URLs) to stdout. Keep only the prose
// summary: drop tree-glyph/status-glyph lines, tool-call scaffolding, and the
// multi-line 403 "forbids fine-grained PAT" blocks.
function stripCliTrace(raw) {
  const text = String(raw || "").replace(/\r/g, "");
  const cleaned = text
    .split("\n")
    .filter((line) => !/^\s*[●│└/✗✘xX✓]\s/.test(line))
    .filter((line) => !/^\s*●?\s*skill\(/.test(line))
    .filter((line) => !/Get file or directory contents|MCP:|for "refs\/heads/.test(line))
    .filter((line) => !/^\s*https?:\/\/api\.github\.com/.test(line))
    .filter((line) => !/forbids access via a fine-grained|adjust your token's lifetime|following URL:/.test(line))
    .filter((line) => !/^\s*for "refs\//.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned;
}

function run(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    cwd: REPO_ROOT,
    ...opts,
  });
}

// Deterministic branch name (no Date.now — keep re-runs idempotent per run id).
function branchName(id) {
  const runId = process.env.GITHUB_RUN_ID || "manual";
  return `auto/office-addin-drift/${id}-${runId}`;
}

// Fetch upstream files from the PUBLIC raw endpoint (no auth → not subject to
// the fine-grained-PAT policy that 403s Copilot's own GitHub tool). We list the
// src/ tree via the public API, then pull each file's raw content.
async function fetchRaw(repo, branch, filePath) {
  const url = `https://raw.githubusercontent.com/${repo}/${branch}/${filePath}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function listUpstreamSrcFiles(repo, branch) {
  const url = `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "office-addin-drift-apply",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.tree || [])
      .filter((e) => e.type === "blob" && /^src\/.*\.(ts|tsx|js|json)$/.test(e.path))
      .map((e) => e.path);
  } catch {
    return [];
  }
}

// Build a text bundle of upstream src/ + package.json so Copilot never needs to
// call a GitHub tool (which fails under the fine-grained-PAT policy).
async function buildUpstreamContext(row) {
  const { upstreamRepo: repo, upstreamBranch: branch } = row;
  const parts = [];

  const pkg = await fetchRaw(repo, branch, "package.json");
  if (pkg) {
    parts.push(`### upstream package.json\n\`\`\`json\n${pkg}\n\`\`\``);
  }

  const srcFiles = await listUpstreamSrcFiles(repo, branch);
  for (const filePath of srcFiles) {
    const content = await fetchRaw(repo, branch, filePath);
    if (content) {
      parts.push(`### upstream ${filePath}\n\`\`\`\n${content}\n\`\`\``);
    }
  }

  if (parts.length === 0) {
    return "(upstream files could not be fetched; rely on the audit judgment only)";
  }
  return parts.join("\n\n");
}

function depDiffText(depDiff) {
  if (!depDiff) return "(no dependency drift)";
  const line = (label, items) =>
    items && items.length ? `${label}:\n- ${items.join("\n- ")}` : null;
  return [
    line("Added upstream (toolkit lacks)", depDiff.added),
    line("Version changed (toolkit → upstream)", depDiff.changed),
    line("Removed upstream (toolkit still has)", depDiff.removed),
  ]
    .filter(Boolean)
    .join("\n\n");
}

// Ask Copilot CLI to APPLY the recommended src + dependency updates to the
// template in the working tree, using upstream source we pre-fetched and embed
// in the prompt — so Copilot never calls a GitHub tool (which 403s under the
// fine-grained-PAT policy).
async function applyWithCopilot(row) {
  const templateDir = path.join(TEMPLATE_REL, row.id).replace(/\\/g, "/");
  const upstreamContext = await buildUpstreamContext(row);
  const prompt = [
    `You are updating a Microsoft 365 Agents Toolkit Office Add-in template that is a fork of an OfficeDev upstream template. Apply ONLY the changes justified by the audit below; make the minimal edits needed and do not restructure the template.`,
    ``,
    `Toolkit template id: ${row.id}`,
    `Toolkit template directory (edit files here, in the working tree): ${templateDir}`,
    `Upstream repo: https://github.com/${row.upstreamRepo} (branch: ${row.upstreamBranch})`,
    ``,
    `Prior audit judgment (what needs updating and why):`,
    row.judgment,
    ``,
    `Precomputed package.json dependency drift (toolkit vs upstream):`,
    depDiffText(row.depDiff),
    ``,
    `Upstream reference files (already fetched for you — do NOT fetch them yourself):`,
    upstreamContext,
    ``,
    `Rules:`,
    `- Do NOT call any GitHub tool or fetch from the network. All upstream reference you need is embedded above; read the toolkit files locally from the working tree.`,
    `- Edit files under ${templateDir} only. Do NOT touch other templates, the baseline file, or workflow files.`,
    `- Preserve the toolkit's {{placeholder}} tokens and its intentional divergences (host-selection wiring, unified JSON manifest asset paths, no test suite).`,
    `- src/: apply the specific behavioral fixes named in the judgment (e.g. null guards, API usage), using the embedded upstream src as reference.`,
    `- ${templateDir}/package.json.tpl: apply ONLY the dependency bumps the judgment endorses. Do NOT add upstream test-only packages (mocha, ts-node, office-addin-test-*, @types/mocha) or any private registry / .npmrc config. Do NOT downgrade a dependency where the toolkit is intentionally ahead.`,
    `- Do not run npm install or modify any lockfile.`,
    `- After editing, output a short markdown summary of exactly which files you changed and why.`,
  ].join("\n");

  // Invoke without a shell (execFileSync + args array) so the prompt's
  // backticks/parens/quotes (e.g. `PowerPoint.run(...)`) are passed literally
  // and never interpreted by /bin/sh — that was breaking the wxpo template.
  return execFileSync(
    "copilot",
    ["--allow-all-tools", "--no-ask-user", "-p", prompt],
    {
      encoding: "utf-8",
      cwd: REPO_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 600000,
      maxBuffer: 20 * 1024 * 1024,
    },
  );
}

function hasChanges() {
  const out = run(`git status --porcelain -- ${TEMPLATE_REL}`);
  return out.trim().length > 0;
}

function createPr(row, changeSummary) {
  const token = process.env.GH_TOKEN || "";
  if (!token) throw new Error("GH_TOKEN not set; cannot push or open PR.");

  const base = process.env.PR_BASE_BRANCH || "dev";
  const branch = branchName(row.id);
  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  const repo = process.env.GITHUB_REPOSITORY || "";
  const runId = process.env.GITHUB_RUN_ID || "";

  run(`git checkout -b ${branch}`);
  run(`git add -- ${TEMPLATE_REL}/${row.id}`);
  run(
    `git -c user.name="office-addin-drift-bot" -c user.email="noreply@github.com" commit -m ${JSON.stringify(
      `fix(office-addin): sync ${row.id} with upstream ${row.upstreamRepo}`,
    )}`,
  );
  run(`git push --force-with-lease origin ${branch}`);

  const title = `fix(office-addin): sync ${row.id} with upstream`;
  const lines = [
    `## Automated upstream sync: \`${row.id}\``,
    "",
    `Upstream: \`${row.upstreamRepo}@${row.upstreamBranch}\``,
    "",
    "This PR was generated from the Office Add-in drift audit. Review carefully — the edits were produced by Copilot from the audit judgment.",
    "",
    "### Audit judgment",
    "",
    row.judgment,
    "",
    "### Copilot change summary",
    "",
    stripCliTrace(changeSummary) || "(none reported)",
  ];
  if (runId) {
    lines.push(
      "",
      "---",
      `Generated by workflow run: ${serverUrl}/${repo}/actions/runs/${runId}`,
    );
  }
  const body = lines.join("\n");

  // Write the JSON body to a temp file and use `curl --data @file` so the body
  // (which contains newlines, backticks, quotes from the judgment) never passes
  // through shell escaping — that was causing GitHub 400 "Problems parsing JSON".
  const payload = JSON.stringify({ title, head: branch, base, body });
  const apiUrl = `https://api.github.com/repos/${repo}/pulls`;
  const payloadPath = path.join(REPO_ROOT, ".github", `.pr-payload-${row.id}.json`);
  fs.writeFileSync(payloadPath, payload);
  let result;
  try {
    result = run(
      `curl -s -X POST ${apiUrl} ` +
        `-H "Authorization: Bearer ${token}" ` +
        `-H "Accept: application/vnd.github+json" ` +
        `-H "Content-Type: application/json" ` +
        `--data @${payloadPath}`,
    );
  } finally {
    fs.rmSync(payloadPath, { force: true });
  }
  const parsed = JSON.parse(result);
  return parsed.html_url || `(PR create response: ${result.slice(0, 300)})`;
}

async function main() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.log("No drift results file found; nothing to do.");
    return;
  }
  const results = readJson(RESULTS_PATH);
  const updateRows = (results.rows || []).filter((r) => r.verdict === "update");

  if (updateRows.length === 0) {
    console.log("No templates with verdict 'update'; no PRs to create.");
    return;
  }

  const created = [];
  for (const row of updateRows) {
    console.log(`\n=== Processing ${row.id} ===`);
    try {
      // Start each template from a clean base branch.
      const base = process.env.PR_BASE_BRANCH || "dev";
      run(`git checkout ${base}`);
      run(`git reset --hard origin/${base}`);

      const summary = await applyWithCopilot(row);

      if (!hasChanges()) {
        console.log(`No file changes produced for ${row.id}; skipping PR.`);
        continue;
      }

      const url = createPr(row, summary);
      console.log(`PR created for ${row.id}: ${url}`);
      created.push({ id: row.id, url });
    } catch (error) {
      console.error(`Failed to create PR for ${row.id}: ${error.message}`);
    }
  }

  console.log(`\nCreated ${created.length} PR(s):`);
  for (const c of created) console.log(`- ${c.id}: ${c.url}`);
}

main().catch((error) => {
  console.error("Apply Office Add-in PRs failed:", error);
  process.exitCode = 1;
});
