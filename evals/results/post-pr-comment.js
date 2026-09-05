const fs = require("fs");

const marker = "<!-- waza-compare-report -->";
const reportPath = "evals/results/compare.md";

function getReportBody() {
  let report = "Comparison report was not generated.";
  if (fs.existsSync(reportPath)) {
    report = fs.readFileSync(reportPath, "utf8");
  }

  if (report.length > 60000) {
    report = `${report.slice(0, 60000)}\n\n... report truncated ...`;
  }

  return [
    marker,
    "## Waza Compare Result",
    "",
    "Baseline: `evals/results/baseline.json`",
    "Latest: `evals/results/latest.json`",
    "",
    report,
  ].join("\n");
}

function getRepoInfo() {
  const repository = process.env.GITHUB_REPOSITORY || "";
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    throw new Error("GITHUB_REPOSITORY is missing or invalid");
  }
  return { owner, repo };
}

function getIssueNumber() {
  const issueNumberFromEnvironment = process.env.PR_NUMBER;
  if (issueNumberFromEnvironment) {
    const issueNumber = Number(issueNumberFromEnvironment);
    if (Number.isInteger(issueNumber) && issueNumber > 0) {
      return issueNumber;
    }
    throw new Error("PR_NUMBER is invalid");
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) {
    throw new Error("GITHUB_EVENT_PATH is missing or invalid");
  }

  const payload = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  const issueNumber = payload?.pull_request?.number || payload?.issue?.number;
  if (!issueNumber) {
    throw new Error("No pull request number found in event payload");
  }

  return issueNumber;
}

async function ghRequest(method, url, token, body) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "m365-agents-toolkit-eval-bot",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub API ${method} ${url} failed: ${response.status} ${text}`,
    );
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function run() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN is required");
  }

  const { owner, repo } = getRepoInfo();
  const issueNumber = getIssueNumber();
  const body = getReportBody();

  const commentsUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`;
  const comments = await ghRequest("GET", commentsUrl, token);

  const existing = Array.isArray(comments)
    ? comments.find(
        (comment) =>
          comment?.user?.type === "Bot" &&
          typeof comment?.body === "string" &&
          comment.body.includes(marker),
      )
    : null;

  if (existing?.id) {
    const updateUrl = `https://api.github.com/repos/${owner}/${repo}/issues/comments/${existing.id}`;
    await ghRequest("PATCH", updateUrl, token, { body });
  } else {
    const createUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
    await ghRequest("POST", createUrl, token, { body });
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
