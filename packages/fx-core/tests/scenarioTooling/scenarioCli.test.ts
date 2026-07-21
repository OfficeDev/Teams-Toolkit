// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { assert } from "chai";
import * as fs from "fs-extra";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import {
  parseScenarioCliArguments,
  runScenarioCli,
} from "../../scripts/scenario-tooling/scenarioCli";

const createdRoots: string[] = [];

async function createReviewFixture(): Promise<{
  scenarioRoot: string;
  scenarioFile: string;
  indexPath: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "scenario-review-"));
  createdRoots.push(root);
  const scenarioRoot = path.join(root, "scenarios");
  const scenarioFile = path.join(scenarioRoot, "da", "unbound.md");
  const indexPath = path.join(scenarioRoot, "index.html");
  await fs.ensureDir(path.dirname(scenarioFile));
  await fs.writeFile(
    scenarioFile,
    `# Unbound scenario

## Metadata

- Created: 2026-07-14T00:00:00Z
- Last updated: 2026-07-14T00:00:00Z
- Status: draft
- PM owner: owner
- Engineer owner: engineer
- Scenario group: da
- Scenario ID: SCN-UNBOUND
- Primary goal: create
- Start state: No project exists.
- Success state: A project exists.
- Lifecycle phases: [create]
- Visual/state reference: unbound.html

## Scenario

Create a project.

## Surfaces

- VS Code

## States

- Success

## User-visible outputs

- A project.

## Flow

\`\`\`mermaid
flowchart TD
  Start --> Complete
\`\`\`

## Validation notes

- Validate success.
`,
    "utf8"
  );
  await fs.writeFile(
    indexPath,
    `<!-- scenario-index-data:start -->
<script id="scenario-index-data" type="application/json">{}</script>
<!-- scenario-index-data:end -->
`,
    "utf8"
  );
  return { scenarioRoot, scenarioFile, indexPath };
}

function captureOutput(): {
  stdout: string[];
  stderr: string[];
  output: { stdout(message: string): void; stderr(message: string): void };
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    output: {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
    },
  };
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map((root) => fs.remove(root)));
});

describe("scenario tooling CLI", () => {
  it("parses the six public commands without inventing implicit lifecycle state", () => {
    assert.deepEqual(parseScenarioCliArguments(["catalog", "--kind", "modify"]), {
      command: "catalog",
      kind: "modify",
    });
    assert.deepEqual(parseScenarioCliArguments(["render"]), {
      command: "render",
    });
    assert.deepEqual(parseScenarioCliArguments(["review"]), {
      command: "review",
    });
    assert.deepEqual(parseScenarioCliArguments(["check"]), {
      command: "check",
    });
    assert.deepEqual(
      parseScenarioCliArguments([
        "init",
        "--group",
        "da",
        "--slug",
        "create-agent",
        "--title",
        "Create agent",
        "--scenario-id",
        "SCN-DA-CREATE-AGENT",
        "--pm-owner",
        "pm",
        "--engineer-owner",
        "engineer",
        "--template-id",
        "declarative-agent",
        "--timestamp",
        "2026-07-14T00:00:00Z",
        "--proposal",
        "new-selector",
        "--redesign-trigger",
        "Selector redesign",
      ]),
      {
        command: "init",
        group: "da",
        slug: "create-agent",
        title: "Create agent",
        scenarioId: "SCN-DA-CREATE-AGENT",
        pmOwner: "pm",
        engineerOwner: "engineer",
        templateId: "declarative-agent",
        timestamp: "2026-07-14T00:00:00Z",
        proposalKey: "new-selector",
        redesignTrigger: "Selector redesign",
      }
    );
    assert.deepEqual(parseScenarioCliArguments(["accept", "--file", "da/create-agent.md"]), {
      command: "accept",
      scenarioFile: "da/create-agent.md",
    });
  });

  it("rejects unknown commands, options, kinds, and incomplete requests", () => {
    assert.throws(() => parseScenarioCliArguments([]), "Expected one scenario command");
    assert.throws(() => parseScenarioCliArguments(["promote"]), "Unknown scenario command");
    assert.throws(
      () => parseScenarioCliArguments(["render", "--kind", "create"]),
      "Unknown option '--kind'"
    );
    assert.throws(
      () => parseScenarioCliArguments(["check", "--extra", "value"]),
      "Unknown option '--extra'"
    );
    assert.throws(() => parseScenarioCliArguments(["accept"]), "Missing required option '--file'");
    assert.throws(
      () => parseScenarioCliArguments(["init", "--group", "da"]),
      "Missing required option '--slug'"
    );
  });

  it("MSA-12/MSA-16: renders unbound Markdown without catalogs and gates only errors", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "scenario-cli-"));
    createdRoots.push(root);
    const scenarioRoot = path.join(root, "scenarios");
    const scenarioFile = path.join(scenarioRoot, "da", "unbound.md");
    const indexPath = path.join(scenarioRoot, "index.html");
    await fs.ensureDir(path.dirname(scenarioFile));
    await fs.writeFile(
      scenarioFile,
      `# Unbound scenario

## Metadata

- Created: 2026-07-14T00:00:00Z
- Last updated: 2026-07-14T00:00:00Z
- Status: draft
- PM owner: owner
- Engineer owner: engineer
- Scenario group: da
- Scenario ID: SCN-UNBOUND
- Primary goal: create
- Start state: No project exists.
- Success state: A project exists.
- Lifecycle phases: [create]
- Visual/state reference: unbound.html

## Scenario

Create a project.

## Surfaces

- VS Code

## States

- Success

## User-visible outputs

- A project.

## Flow

\`\`\`mermaid
flowchart TD
  Start --> Complete
\`\`\`

## Validation notes

- Validate success.
`,
      "utf8"
    );
    await fs.writeFile(
      indexPath,
      `<!-- scenario-index-data:start -->
<script id="scenario-index-data" type="application/json">{}</script>
<!-- scenario-index-data:end -->
`,
      "utf8"
    );
    const stdout: string[] = [];
    const stderr: string[] = [];
    const output = {
      stdout: (message: string) => stdout.push(message),
      stderr: (message: string) => stderr.push(message),
    };

    const renderExit = await runScenarioCli(["render"], output, {
      scenarioRoot,
      indexPath,
      templateRoot: path.join(root, "missing-templates"),
    });
    const warningExit = await runScenarioCli(["check"], output, {
      scenarioRoot,
      indexPath,
      templateRoot: path.resolve(__dirname, "../../../../templates/v4"),
    });
    await fs.appendFile(path.join(scenarioRoot, "da", "unbound.html"), "stale", "utf8");
    const errorExit = await runScenarioCli(["check"], output, {
      scenarioRoot,
      indexPath,
      templateRoot: path.resolve(__dirname, "../../../../templates/v4"),
    });

    assert.equal(renderExit, 0);
    assert.equal(warningExit, 0);
    assert.equal(errorExit, 1);
    assert.isTrue(stdout.some((line) => line.includes("WARNING UnboundScaffoldTemplate")));
    assert.isTrue(stdout.some((line) => line.includes("WARNING UnboundExternalRoute")));
    assert.isTrue(stderr.some((line) => line.includes("ERROR StaleGeneratedHtml")));
  });

  it("MSA-17: reviews updated pages and uses the index-only fallback", async () => {
    const fixture = await createReviewFixture();
    const captured = captureOutput();
    const opened: string[][] = [];
    const dependencies = {
      launchArtifacts: async (artifacts: string[]) => {
        opened.push(artifacts);
      },
    };
    const paths = {
      ...fixture,
      templateRoot: path.join(path.dirname(fixture.scenarioRoot), "missing-templates"),
    };

    const firstExit = await runScenarioCli(["review"], captured.output, paths, dependencies);
    const unchangedExit = await runScenarioCli(["review"], captured.output, paths, dependencies);
    const generatedIndex = await fs.readFile(fixture.indexPath, "utf8");
    await fs.writeFile(
      fixture.indexPath,
      generatedIndex.replace("da/unbound.html", "da/stale.html"),
      "utf8"
    );
    const indexExit = await runScenarioCli(["review"], captured.output, paths, dependencies);

    assert.equal(firstExit, 0);
    assert.equal(unchangedExit, 0);
    assert.equal(indexExit, 0);
    assert.include(captured.stdout, "UPDATED da/unbound.html");
    assert.include(captured.stdout, "UPDATED index.html");
    assert.include(captured.stdout, "No generated scenario artifacts changed.");
    assert.deepEqual(opened, [
      [path.join(fixture.scenarioRoot, "da", "unbound.html")],
      [fixture.indexPath],
      [fixture.indexPath],
    ]);
  });

  it("MSA-17: preserves rendered files but fails when the browser cannot open", async () => {
    const fixture = await createReviewFixture();
    const captured = captureOutput();
    const paths = {
      ...fixture,
      templateRoot: path.join(path.dirname(fixture.scenarioRoot), "missing-templates"),
    };

    const exitCode = await runScenarioCli(["review"], captured.output, paths, {
      launchArtifacts: async () => {
        throw new Error("launcher unavailable");
      },
    });

    assert.equal(exitCode, 1);
    const generatedHtml = path.join(fixture.scenarioRoot, "da", "unbound.html");
    assert.isTrue(await fs.pathExists(generatedHtml));
    assert.isTrue(
      captured.stderr.some(
        (line) =>
          line.includes("ERROR ScenarioReviewOpenFailed") &&
          line.includes(pathToFileURL(generatedHtml).href)
      )
    );
  });

  it("MSA-17: does not launch artifacts when scenario validation fails", async () => {
    const fixture = await createReviewFixture();
    const captured = captureOutput();
    let launchCount = 0;
    const generatedHtml = path.join(fixture.scenarioRoot, "da", "unbound.html");
    const orphanHtml = path.join(fixture.scenarioRoot, "da", "orphan.html");
    await fs.writeFile(generatedHtml, "existing generated HTML", "utf8");
    await fs.writeFile(orphanHtml, "existing orphan HTML", "utf8");
    const htmlBefore = await fs.readFile(generatedHtml);
    const orphanBefore = await fs.readFile(orphanHtml);
    const indexBefore = await fs.readFile(fixture.indexPath);
    await fs.writeFile(fixture.scenarioFile, "# Invalid scenario\n", "utf8");

    const exitCode = await runScenarioCli(
      ["review"],
      captured.output,
      {
        ...fixture,
        templateRoot: path.join(path.dirname(fixture.scenarioRoot), "missing-templates"),
      },
      {
        launchArtifacts: async () => {
          launchCount += 1;
        },
      }
    );

    assert.equal(exitCode, 1);
    assert.equal(launchCount, 0);
    assert.deepEqual(await fs.readFile(generatedHtml), htmlBefore);
    assert.deepEqual(await fs.readFile(orphanHtml), orphanBefore);
    assert.deepEqual(await fs.readFile(fixture.indexPath), indexBefore);
  });
});
