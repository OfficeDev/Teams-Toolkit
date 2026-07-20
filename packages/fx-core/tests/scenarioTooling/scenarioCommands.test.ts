// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { assert } from "chai";
import fsExtra from "fs-extra";
import * as fs from "fs-extra";
import os from "os";
import path from "path";
import { vi } from "vitest";
import { ScaffoldCatalog } from "../../src/v4/inspection/scaffoldCatalog";
import {
  acceptScenarioArtifact,
  checkScenarioArtifacts,
  initializeScenario,
  renderScenarioArtifacts,
} from "../../scripts/scenario-tooling/scenarioCommands";
import { replaceScenarioIndexData } from "../../scripts/scenario-tooling/scenarioProjection";

const createdRoots: string[] = [];

const scaffoldCatalog: ScaffoldCatalog = {
  kind: "create",
  questions: [
    {
      name: "projectType",
      title: "Project Type",
      placeholder: "Choose a project type",
      staticOptions: [{ id: "agent", label: "Agent" }],
    },
  ],
  templates: [
    {
      templateId: "agent-template",
      routes: [{ when: "projectType == 'agent'", engine: "v4", templateId: "agent-template" }],
      descriptor: { id: "agent-template", languages: ["typescript", "python"] },
      questions: [
        {
          name: "apiKey",
          type: "text",
          title: "API key",
          placeholder: "Enter an API key",
          password: true,
        },
        {
          name: "operations",
          type: "multiSelect",
          title: "Select operations",
          optionsFrom: "openapi.operations",
        },
      ],
      pipeline: { steps: [{ uses: "render" }] },
    },
  ],
  externalRoutes: [],
};

const modifyScaffoldCatalog: ScaffoldCatalog = {
  ...scaffoldCatalog,
  kind: "modify",
  templates: [
    {
      ...scaffoldCatalog.templates[0],
      templateId: "modify-template",
      routes: [{ when: "projectType == 'agent'", engine: "v4", templateId: "modify-template" }],
    },
  ],
};

const indexTemplate = `<!doctype html>
<html>
<body>
  <h2 id="current-heading">Current</h2>
  <ul id="currentTree"></ul>
  <h2 id="review-heading">In review</h2>
  <ul id="reviewTree"></ul>
  <!-- scenario-index-data:start -->
  <script id="scenario-index-data" type="application/json">{"current":[],"inReview":[]}</script>
  <!-- scenario-index-data:end -->
</body>
</html>
`;

function scenarioMarkdown(
  status: "draft" | "review" | "approved" | "implemented",
  secretAnswer: string = "{ state: non-empty }"
): string {
  return `# Create an agent

## Metadata

- Created: 2026-07-14T00:00:00Z
- Last updated: 2026-07-14T00:00:00Z
- Status: ${status}
- PM owner: owner
- Engineer owner: engineer
- Scenario group: da
- Scenario ID: SCN-DA-CREATE-AGENT
- Primary goal: create
- Start state: No project exists.
- Success state: A project exists.
- Lifecycle phases: [create]
- Visual/state reference: create-agent.html

## Scenario

A developer creates an agent.

## Surfaces

- VS Code

## States

- Entry
- Success

## User-visible outputs

- A generated project.

## Flow

\`\`\`mermaid
flowchart TD
  Start --> Complete
\`\`\`

## Validation notes

- Validate the generated project.

## Implementation binding

\`\`\`yaml
version: 1
scaffolding:
  kind: create
  templateIds:
    - agent-template
  reviewContexts:
    - id: vscode-default
      surface: vscode
      environmentProfile: vscode-shipped
      featureFlags: {}
      answers:
        apiKey: ${secretAnswer}
  reviewedFingerprints:
    semantic: pending
    presentation: pending
\`\`\`
`;
}

async function createFixture(status: "draft" | "review" | "approved" | "implemented" = "draft") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "scenario-commands-"));
  createdRoots.push(root);
  const scenarioRoot = path.join(root, "scenarios");
  const scenarioFile = path.join(scenarioRoot, "da", "create-agent.md");
  const indexPath = path.join(scenarioRoot, "index.html");
  await fs.ensureDir(path.dirname(scenarioFile));
  await fs.writeFile(scenarioFile, scenarioMarkdown(status), "utf8");
  await fs.writeFile(indexPath, indexTemplate, "utf8");
  return { root, scenarioRoot, scenarioFile, indexPath };
}

function codes(result: { diagnostics: { code: string }[] }): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(createdRoots.splice(0).map((root) => fs.remove(root)));
});

describe("scenario artifact commands", () => {
  it("MSA-05: renders byte-identical HTML and index data without modifying Markdown", async () => {
    const fixture = await createFixture();
    const nestedScenario = path.join(
      fixture.scenarioRoot,
      "da",
      "proposals",
      "create-agent-review.md"
    );
    await fs.ensureDir(path.dirname(nestedScenario));
    await fs.writeFile(
      nestedScenario,
      scenarioMarkdown("review")
        .replaceAll("SCN-DA-CREATE-AGENT", "SCN-DA-CREATE-AGENT-REVIEW")
        .replace("create-agent.html", "create-agent-review.html"),
      "utf8"
    );
    const markdownBefore = await fs.readFile(fixture.scenarioFile, "utf8");

    const first = await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });
    const firstHtml = await fs.readFile(
      path.join(fixture.scenarioRoot, "da", "create-agent.html"),
      "utf8"
    );
    const firstIndex = await fs.readFile(fixture.indexPath, "utf8");
    const second = await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });

    assert.deepEqual(first.diagnostics, []);
    assert.deepEqual(second.diagnostics, []);
    assert.equal(
      await fs.readFile(path.join(fixture.scenarioRoot, "da", "create-agent.html"), "utf8"),
      firstHtml
    );
    assert.equal(await fs.readFile(fixture.indexPath, "utf8"), firstIndex);
    assert.equal(await fs.readFile(fixture.scenarioFile, "utf8"), markdownBefore);
    assert.include(firstHtml, "Generated from scenario Markdown and v4 declarations");
    assert.include(firstHtml, "scenario-markdown-section");
    assert.include(firstHtml, 'heading="Scenario" level="2"');
    assert.include(firstHtml, "vscode-single-select");
    const selectorStart = firstHtml.indexOf('data-question-name="projectType"');
    const selectorEnd = firstHtml.indexOf("</article>", selectorStart);
    const selectorControl = firstHtml.slice(selectorStart, selectorEnd);
    assert.match(selectorControl, /\n {8}<vscode-single-select/);
    assert.notMatch(selectorControl, /<vscode-option[^>]*\sicon=/);
    assert.include(firstHtml, "Runtime-provided options");
    assert.include(
      await fs.readFile(
        path.join(fixture.scenarioRoot, "da", "proposals", "create-agent-review.html"),
        "utf8"
      ),
      'href="../../index.html"'
    );
  });

  it("MSA-17: reports ordered pre-write generated artifact changes", async () => {
    const fixture = await createFixture();
    const nestedScenario = path.join(
      fixture.scenarioRoot,
      "da",
      "proposals",
      "create-agent-review.md"
    );
    await fs.ensureDir(path.dirname(nestedScenario));
    await fs.writeFile(
      nestedScenario,
      scenarioMarkdown("review")
        .replaceAll("SCN-DA-CREATE-AGENT", "SCN-DA-CREATE-AGENT-REVIEW")
        .replace("create-agent.html", "create-agent-review.html"),
      "utf8"
    );

    const first = await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });
    const second = await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });
    const generatedHtml = await fs.readFile(
      path.join(fixture.scenarioRoot, "da", "create-agent.html"),
      "utf8"
    );
    await fs.writeFile(path.join(fixture.scenarioRoot, "da", "orphan.html"), generatedHtml, "utf8");
    const withOrphan = await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });

    assert.deepEqual(first.updatedArtifacts, [
      "da/create-agent.html",
      "da/proposals/create-agent-review.html",
      "index.html",
    ]);
    assert.deepEqual(first.removedArtifacts, []);
    assert.deepEqual(second.updatedArtifacts, []);
    assert.deepEqual(second.removedArtifacts, []);
    assert.deepEqual(withOrphan.updatedArtifacts, []);
    assert.deepEqual(withOrphan.removedArtifacts, ["da/orphan.html"]);
  });

  it("MSA-05: renders create and modify bindings in one command invocation", async () => {
    const fixture = await createFixture();
    const modifyScenario = path.join(fixture.scenarioRoot, "da", "modify-agent.md");
    await fs.writeFile(
      modifyScenario,
      scenarioMarkdown("review")
        .replaceAll("SCN-DA-CREATE-AGENT", "SCN-DA-MODIFY-AGENT")
        .replaceAll("create-agent.html", "modify-agent.html")
        .replace("kind: create", "kind: modify")
        .replace("agent-template", "modify-template"),
      "utf8"
    );

    const rendered = await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalogs: [scaffoldCatalog, modifyScaffoldCatalog],
    });
    const checked = await checkScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalogs: [scaffoldCatalog, modifyScaffoldCatalog],
    });
    const accepted = await acceptScenarioArtifact({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalogs: [scaffoldCatalog, modifyScaffoldCatalog],
      scenarioFile: modifyScenario,
    });

    assert.deepEqual(rendered.diagnostics, []);
    assert.notInclude(codes(checked), "BindingKindMismatch");
    assert.notInclude(codes(checked), "UnknownBoundTemplate");
    assert.deepEqual(accepted.diagnostics, []);
    assert.notInclude(await fs.readFile(modifyScenario, "utf8"), "semantic: pending");
    assert.isTrue(await fs.pathExists(path.join(fixture.scenarioRoot, "da", "create-agent.html")));
    assert.isTrue(await fs.pathExists(path.join(fixture.scenarioRoot, "da", "modify-agent.html")));
  });

  it("MSA-12: renders an unbound scenario without a scaffold catalog", async () => {
    const fixture = await createFixture();
    const unboundMarkdown = scenarioMarkdown("draft").split("## Implementation binding")[0];
    await fs.writeFile(fixture.scenarioFile, unboundMarkdown, "utf8");

    const rendered = await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
    });
    const checked = await checkScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
    });
    const html = await fs.readFile(
      path.join(fixture.scenarioRoot, "da", "create-agent.html"),
      "utf8"
    );

    assert.deepEqual(rendered.diagnostics, []);
    assert.deepEqual(checked.diagnostics, []);
    assert.include(html, "This scenario has no scaffolding implementation binding.");
  });

  it("MSA-14: preserves localization keys beside English presentation", async () => {
    const fixture = await createFixture();
    const localizedCatalog: ScaffoldCatalog = {
      ...scaffoldCatalog,
      questions: scaffoldCatalog.questions.map((question) => ({
        ...question,
        keyPrefix: "core.selector.projectType",
        staticOptions: question.staticOptions.map((option) => ({
          ...option,
          keyPrefix: "core.selector.projectType.agent",
        })),
      })),
      templates: scaffoldCatalog.templates.map((template) => ({
        ...template,
        questions: template.questions.map((question) => ({
          ...question,
          keyPrefix: `core.template.${question.name}`,
          inputBoxConfig:
            question.name === "apiKey"
              ? {
                  name: "apiKeyInput",
                  title: "Nested API key",
                  placeholder: "Nested API key placeholder",
                  keyPrefix: "core.template.apiKey.input",
                }
              : question.inputBoxConfig,
        })),
      })),
    };

    const rendered = await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog: localizedCatalog,
    });
    const html = await fs.readFile(
      path.join(fixture.scenarioRoot, "da", "create-agent.html"),
      "utf8"
    );

    assert.deepEqual(rendered.diagnostics, []);
    assert.include(html, 'data-localization-key="core.selector.projectType"');
    assert.include(html, 'data-localization-key="core.selector.projectType.agent"');
    assert.include(html, 'data-localization-key="core.template.apiKey.input"');
    assert.include(html, 'title="Project Type"');
    assert.include(html, 'label="Agent"');
    assert.include(html, 'title="Nested API key"');
    assert.include(html, 'placeholder="Nested API key placeholder"');
  });

  it("MSA-13: treats nested input-box presentation as presentation drift", async () => {
    const fixture = await createFixture();
    const nestedCatalog: ScaffoldCatalog = {
      ...scaffoldCatalog,
      templates: scaffoldCatalog.templates.map((template) => ({
        ...template,
        questions: template.questions.map((question) => ({
          ...question,
          inputBoxConfig:
            question.name === "apiKey"
              ? {
                  name: "apiKeyInput",
                  title: "Nested API key",
                  keyPrefix: "core.template.apiKey.input",
                }
              : question.inputBoxConfig,
        })),
      })),
    };
    await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog: nestedCatalog,
    });
    await acceptScenarioArtifact({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog: nestedCatalog,
      scenarioFile: fixture.scenarioFile,
    });
    const changedCatalog: ScaffoldCatalog = {
      ...nestedCatalog,
      templates: nestedCatalog.templates.map((template) => ({
        ...template,
        questions: template.questions.map((question) => ({
          ...question,
          inputBoxConfig:
            question.inputBoxConfig === undefined
              ? undefined
              : { ...question.inputBoxConfig, title: "Changed nested API key" },
        })),
      })),
    };
    await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog: changedCatalog,
    });

    const checked = await checkScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog: changedCatalog,
    });

    assert.deepEqual(codes(checked), ["ReviewedPresentationFingerprintDrift"]);
  });

  it("MSA-15: warns once for each external route not covered by a bound template route", async () => {
    const fixture = await createFixture();
    const catalogWithExternalRoutes: ScaffoldCatalog = {
      ...scaffoldCatalog,
      externalRoutes: [
        {
          when: "projectType == 'agent'",
          engine: "v3-core-method",
          coreMethod: "coveredLegacyFlow",
        },
        {
          when: "projectType == 'legacy'",
          engine: "surface-action",
          action: "uncoveredLegacyFlow",
        },
      ],
    };
    await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog: catalogWithExternalRoutes,
    });

    const checked = await checkScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog: catalogWithExternalRoutes,
    });
    const routeWarnings = checked.diagnostics.filter(
      (diagnostic) => diagnostic.code === "UnboundExternalRoute"
    );

    assert.lengthOf(routeWarnings, 1);
    assert.equal(routeWarnings[0].severity, "warning");
    assert.include(routeWarnings[0].message, "projectType == 'legacy'");
    assert.notInclude(routeWarnings[0].message, "coveredLegacyFlow");
  });

  it("MSA-05: projects only conditional branches selected by review contexts", async () => {
    const fixture = await createFixture();
    await fs.writeFile(
      fixture.scenarioFile,
      scenarioMarkdown("draft").replace(
        "featureFlags: {}",
        "featureFlags: { TEAMSFX_MCP_FOR_DA_DT: false }"
      ),
      "utf8"
    );
    const conditionalCatalog: ScaffoldCatalog = {
      ...scaffoldCatalog,
      questions: [
        ...scaffoldCatalog.questions,
        {
          name: "advancedSelector",
          title: "Advanced selector branch",
          condition: { featureFlag: "TEAMSFX_MCP_FOR_DA_DT" },
          staticOptions: [],
        },
      ],
      templates: scaffoldCatalog.templates.map((template) => ({
        ...template,
        questions: [
          ...template.questions,
          {
            name: "surfaceQuestion",
            type: "text",
            title: "VS Code surface branch",
            condition: { expr: "surface == 'vscode'" },
          },
        ],
      })),
    };

    const first = await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog: conditionalCatalog,
    });
    const hiddenHtml = await fs.readFile(
      path.join(fixture.scenarioRoot, "da", "create-agent.html"),
      "utf8"
    );
    await fs.writeFile(
      fixture.scenarioFile,
      scenarioMarkdown("draft").replace(
        "featureFlags: {}",
        "featureFlags: { TEAMSFX_MCP_FOR_DA_DT: true }"
      ),
      "utf8"
    );
    const second = await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog: conditionalCatalog,
    });
    const visibleHtml = await fs.readFile(
      path.join(fixture.scenarioRoot, "da", "create-agent.html"),
      "utf8"
    );

    assert.deepEqual(first.diagnostics, []);
    assert.notInclude(hiddenHtml, "Advanced selector branch");
    assert.include(hiddenHtml, "VS Code surface branch");
    assert.deepEqual(second.diagnostics, []);
    assert.include(visibleHtml, "Advanced selector branch");

    const unresolvedFixture = await createFixture();
    const unresolvedCatalog: ScaffoldCatalog = {
      ...conditionalCatalog,
      questions: [
        {
          name: "unresolved",
          condition: { expr: "undeclaredAnswer == 'yes'" },
          staticOptions: [],
        },
      ],
    };
    const unresolved = await renderScenarioArtifacts({
      scenarioRoot: unresolvedFixture.scenarioRoot,
      indexPath: unresolvedFixture.indexPath,
      scaffoldCatalog: unresolvedCatalog,
    });
    assert.include(codes(unresolved), "ReviewContextConditionFailed");
    assert.isFalse(
      await fs.pathExists(path.join(unresolvedFixture.scenarioRoot, "da", "create-agent.html"))
    );
  });

  it("MSA-05: rejects unevaluable option conditions hidden by parent questions", async () => {
    const malformedCondition = { expr: "featureFlag('UNKNOWN" };
    const invalidCatalogs: ScaffoldCatalog[] = [
      {
        ...scaffoldCatalog,
        questions: scaffoldCatalog.questions.map((question) => ({
          ...question,
          condition: { equals: { surface: "cli" } },
          staticOptions: question.staticOptions.map((option) => ({
            ...option,
            condition: malformedCondition,
          })),
        })),
      },
      {
        ...scaffoldCatalog,
        templates: scaffoldCatalog.templates.map((template) => ({
          ...template,
          questions: [
            ...template.questions,
            {
              name: "hiddenChoice",
              type: "singleSelect",
              condition: { equals: { surface: "cli" } },
              staticOptions: [{ id: "hidden", condition: malformedCondition }],
            },
          ],
        })),
      },
      {
        ...scaffoldCatalog,
        questions: scaffoldCatalog.questions.map((question) => ({
          ...question,
          condition: { equals: { surface: "cli" } },
          staticOptions: question.staticOptions.map((option) => ({
            ...option,
            condition: { expr: "unknownFn()" },
          })),
        })),
      },
    ];

    for (const invalidCatalog of invalidCatalogs) {
      const fixture = await createFixture();
      const result = await renderScenarioArtifacts({
        scenarioRoot: fixture.scenarioRoot,
        indexPath: fixture.indexPath,
        scaffoldCatalog: invalidCatalog,
      });

      assert.include(codes(result), "ReviewContextConditionFailed");
      assert.isFalse(
        await fs.pathExists(path.join(fixture.scenarioRoot, "da", "create-agent.html"))
      );
    }
  });

  it("MSA-18: preserves authored review-context indexes in diagnostics", async () => {
    const fixture = await createFixture();
    await fs.writeFile(
      fixture.scenarioFile,
      scenarioMarkdown("draft").replace(
        `    - id: vscode-default
      surface: vscode
      environmentProfile: vscode-shipped
      featureFlags: {}
      answers:
        apiKey: { state: non-empty }`,
        `    - id: invalid-profile
      surface: vscode
      environmentProfile: missing-profile
      featureFlags: {}
      answers: {}
    - id: vscode-default
      surface: vscode
      environmentProfile: vscode-shipped
      featureFlags: {}
      answers:
        projectType: missing-option
        apiKey: { state: non-empty }`
      ),
      "utf8"
    );

    const result = await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });
    const answerDiagnostics = result.diagnostics.filter(
      (item) => item.code === "InvalidReviewAnswer"
    );

    assert.isNotEmpty(answerDiagnostics);
    assert.isTrue(
      answerDiagnostics.every((item) => item.message.includes("context at index 1")),
      JSON.stringify(answerDiagnostics)
    );
    assert.isFalse(await fs.pathExists(path.join(fixture.scenarioRoot, "da", "create-agent.html")));
  });

  it("MSA-18: renders an independent answered question walk for each review context", async () => {
    const fixture = await createFixture();
    await fs.writeFile(
      fixture.scenarioFile,
      scenarioMarkdown("draft").replace(
        `    - id: vscode-default
      surface: vscode
      environmentProfile: vscode-shipped
      featureFlags: {}
      answers:
        apiKey: { state: non-empty }`,
        `    - id: vscode-default
      surface: vscode
      environmentProfile: vscode-shipped
      featureFlags: {}
      answers:
        projectType: agent
        apiKey: { state: non-empty }
        vscodeName: Visual Studio Code
        apiSpecLocation: https://example.com/openapi.yaml
        language: typescript
        folder: C:\\projects
        app-name: weather-agent
    - id: cli-default
      surface: cli
      environmentProfile: cli-shipped
      featureFlags: {}
      answers:
        projectType: agent
        apiKey: { state: non-empty }
        cliToolsFile: tools.json
        language: python
        folder: C:\\cli-projects
        app-name: weather-cli
        operations:
          - getWeather`
      ),
      "utf8"
    );
    const contextCatalog: ScaffoldCatalog = {
      ...scaffoldCatalog,
      templates: scaffoldCatalog.templates.map((template) => ({
        ...template,
        questions: [
          ...template.questions.map((question) =>
            question.name === "operations"
              ? { ...question, condition: { expr: "surface == 'cli'" } }
              : question
          ),
          {
            name: "vscodeName",
            type: "text",
            title: "VS Code project name",
            condition: { expr: "surface == 'vscode'" },
          },
          {
            name: "apiSpecLocation",
            type: "singleFileOrText",
            title: "OpenAPI Document",
            inputOptionItem: { id: "input", label: "Enter OpenAPI Document URL" },
            inputBoxConfig: {
              name: "input-api-spec-url",
              title: "OpenAPI Document",
              placeholder: "Enter OpenAPI Document URL",
            },
            condition: { expr: "surface == 'vscode'" },
          },
          {
            name: "cliToolsFile",
            type: "singleFile",
            title: "CLI tools file",
            condition: { expr: "surface == 'cli'" },
          },
        ],
      })),
    };

    const result = await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog: contextCatalog,
    });
    const html = await fs.readFile(
      path.join(fixture.scenarioRoot, "da", "create-agent.html"),
      "utf8"
    );
    const vscodeStart = html.indexOf('data-review-context="vscode-default"');
    const cliStart = html.indexOf('data-review-context="cli-default"');
    const vscodeWalk = html.slice(vscodeStart, cliStart);
    const cliWalk = html.slice(cliStart);

    assert.deepEqual(result.diagnostics, []);
    assert.isAtLeast(vscodeStart, 0);
    assert.isAbove(cliStart, vscodeStart);
    assert.include(vscodeWalk, 'data-question-name="projectType"');
    assert.match(vscodeWalk, /<vscode-option[^>]*label="Agent"[^>]*selected/);
    assert.include(vscodeWalk, 'data-question-name="vscodeName"');
    assert.include(vscodeWalk, 'value="Visual Studio Code"');
    const fileOrTextStart = vscodeWalk.indexOf('data-question-name="apiSpecLocation"');
    const fileOrTextEnd = vscodeWalk.indexOf("</article>", fileOrTextStart);
    const fileOrText = vscodeWalk.slice(fileOrTextStart, fileOrTextEnd);
    assert.include(fileOrText, "<vscode-file-select");
    assert.match(fileOrText, /label="Enter OpenAPI Document URL"[^>]*selected/);
    assert.include(fileOrText, "<vscode-input-box");
    assert.include(fileOrText, 'value="https://example.com/openapi.yaml"');
    assert.include(vscodeWalk, 'data-question-name="language"');
    assert.match(vscodeWalk, /<vscode-option[^>]*label="TypeScript"[^>]*selected/);
    assert.include(vscodeWalk, 'data-question-name="folder"');
    assert.include(vscodeWalk, "C:\\projects");
    assert.include(vscodeWalk, 'data-question-name="app-name"');
    assert.include(vscodeWalk, 'value="weather-agent"');
    assert.isAbove(
      vscodeWalk.indexOf('data-question-name="language"'),
      vscodeWalk.indexOf('data-question-name="vscodeName"')
    );
    assert.isAbove(
      vscodeWalk.indexOf('data-question-name="folder"'),
      vscodeWalk.indexOf('data-question-name="language"')
    );
    assert.isAbove(
      vscodeWalk.indexOf('data-question-name="app-name"'),
      vscodeWalk.indexOf('data-question-name="folder"')
    );
    assert.notInclude(vscodeWalk, "CLI tools file");
    assert.notInclude(vscodeWalk, "Runtime-provided options");
    assert.include(cliWalk, 'data-question-name="cliToolsFile"');
    assert.include(cliWalk, "<vscode-file-select");
    assert.include(cliWalk, "tools.json");
    assert.notInclude(cliWalk, "VS Code project name");
    assert.include(cliWalk, 'data-question-name="operations"');
    assert.include(cliWalk, "<vscode-multi-select");
    assert.include(cliWalk, 'data-options-from="openapi.operations"');
    assert.match(cliWalk, /<vscode-option[^>]*label="Python"[^>]*selected/);
    assert.include(cliWalk, 'value="weather-cli"');
    assert.include(html, 'value="********"');
    assert.notInclude(html, "__symbolic_non_empty_secret__");
  });

  it("MSA-19: composes deterministic environment profiles with case overrides", async () => {
    const chatFlag = "TEAMSFX_CHAT_PARTICIPANT_ENTRIES";
    const v4Flag = "TEAMSFX_V4_ENABLED";
    const askCopilotLabel = "Use GitHub Copilot Chat";
    const v4Label = "Use the v4 scaffold engine";
    const profileCatalog: ScaffoldCatalog = {
      ...scaffoldCatalog,
      questions: scaffoldCatalog.questions.map((question) => ({
        ...question,
        staticOptions: [
          ...question.staticOptions,
          {
            id: "start-with-github-copilot",
            label: askCopilotLabel,
            condition: {
              expr: `surface == 'vscode' && featureFlag('${chatFlag}')`,
            },
          },
          {
            id: "v4-preview",
            label: v4Label,
            condition: { expr: `featureFlag('${v4Flag}')` },
          },
        ],
      })),
    };
    const withEnvironment = (
      markdown: string,
      surface: string,
      environmentProfile: string,
      featureFlags = "{}"
    ): string =>
      markdown.replace(
        "      surface: vscode\n      environmentProfile: vscode-shipped\n      featureFlags: {}",
        `      surface: ${surface}\n      environmentProfile: ${environmentProfile}\n      featureFlags: ${featureFlags}`
      );
    const previousChatFlag = process.env[chatFlag];
    process.env[chatFlag] = "false";
    try {
      const defaultFixture = await createFixture();
      await fs.writeFile(
        defaultFixture.scenarioFile,
        withEnvironment(scenarioMarkdown("draft"), "vscode", "vscode-shipped"),
        "utf8"
      );
      const defaultResult = await renderScenarioArtifacts({
        scenarioRoot: defaultFixture.scenarioRoot,
        indexPath: defaultFixture.indexPath,
        scaffoldCatalog: profileCatalog,
      });

      assert.deepEqual(defaultResult.diagnostics, []);
      const defaultHtml = await fs.readFile(
        path.join(defaultFixture.scenarioRoot, "da", "create-agent.html"),
        "utf8"
      );
      assert.include(defaultHtml, askCopilotLabel);
      assert.include(defaultHtml, "environment: vscode-shipped");
      assert.notInclude(defaultHtml, v4Label);

      const previewFixture = await createFixture();
      await fs.writeFile(
        previewFixture.scenarioFile,
        withEnvironment(scenarioMarkdown("draft"), "vscode", "vscode-v4-preview"),
        "utf8"
      );
      const previewResult = await renderScenarioArtifacts({
        scenarioRoot: previewFixture.scenarioRoot,
        indexPath: previewFixture.indexPath,
        scaffoldCatalog: profileCatalog,
      });
      assert.deepEqual(previewResult.diagnostics, []);
      const previewHtml = await fs.readFile(
        path.join(previewFixture.scenarioRoot, "da", "create-agent.html"),
        "utf8"
      );

      assert.include(previewHtml, askCopilotLabel);
      assert.include(previewHtml, v4Label);
      assert.include(previewHtml, "environment: vscode-v4-preview");

      const disabledFixture = await createFixture();
      await fs.writeFile(
        disabledFixture.scenarioFile,
        withEnvironment(
          scenarioMarkdown("draft"),
          "vscode",
          "vscode-shipped",
          `{ ${chatFlag}: false }`
        ),
        "utf8"
      );
      const disabledResult = await renderScenarioArtifacts({
        scenarioRoot: disabledFixture.scenarioRoot,
        indexPath: disabledFixture.indexPath,
        scaffoldCatalog: profileCatalog,
      });
      const disabledHtml = await fs.readFile(
        path.join(disabledFixture.scenarioRoot, "da", "create-agent.html"),
        "utf8"
      );

      assert.deepEqual(disabledResult.diagnostics, []);
      assert.notInclude(disabledHtml, askCopilotLabel);

      const cliFixture = await createFixture();
      await fs.writeFile(
        cliFixture.scenarioFile,
        withEnvironment(scenarioMarkdown("draft"), "cli", "cli-shipped"),
        "utf8"
      );
      const cliResult = await renderScenarioArtifacts({
        scenarioRoot: cliFixture.scenarioRoot,
        indexPath: cliFixture.indexPath,
        scaffoldCatalog: profileCatalog,
      });
      const cliHtml = await fs.readFile(
        path.join(cliFixture.scenarioRoot, "da", "create-agent.html"),
        "utf8"
      );

      assert.deepEqual(cliResult.diagnostics, []);
      assert.notInclude(cliHtml, askCopilotLabel);

      const invalidCases = [
        {
          profile: "unknown-profile",
          surface: "vscode",
          flags: "{}",
          catalog: profileCatalog,
          code: "UnknownEnvironmentProfile",
        },
        {
          profile: "toString",
          surface: "vscode",
          flags: "{}",
          catalog: profileCatalog,
          code: "UnknownEnvironmentProfile",
        },
        {
          profile: "cli-shipped",
          surface: "vscode",
          flags: "{}",
          catalog: profileCatalog,
          code: "EnvironmentProfileSurfaceMismatch",
        },
        {
          profile: "vscode-shipped",
          surface: "vscode",
          flags: "{ UNKNOWN_SCENARIO_FLAG: true }",
          catalog: profileCatalog,
          code: "UnknownFeatureFlag",
        },
        {
          profile: "vscode-shipped",
          surface: "vscode",
          flags: "{ constructor: true }",
          catalog: profileCatalog,
          code: "UnknownFeatureFlag",
        },
        {
          profile: "vscode-shipped",
          surface: "vscode",
          flags: "{}",
          catalog: {
            ...profileCatalog,
            questions: profileCatalog.questions.map((question) => ({
              ...question,
              staticOptions: question.staticOptions.map((option) =>
                option.id === "start-with-github-copilot"
                  ? { ...option, condition: { featureFlag: "UNKNOWN_CONDITION_FLAG" } }
                  : option
              ),
            })),
          },
          code: "UnknownFeatureFlag",
        },
        {
          profile: "vscode-shipped",
          surface: "vscode",
          flags: "{}",
          catalog: {
            ...profileCatalog,
            questions: profileCatalog.questions.map((question) => ({
              ...question,
              staticOptions: question.staticOptions.map((option) =>
                option.id === "start-with-github-copilot"
                  ? {
                      ...option,
                      condition: {
                        expr: "surface == 'cli' && featureFlag('UNKNOWN_SHORT_CIRCUIT_FLAG')",
                      },
                    }
                  : option
              ),
            })),
          },
          code: "UnknownFeatureFlag",
        },
        {
          profile: "vscode-shipped",
          surface: "vscode",
          flags: "{}",
          catalog: {
            ...profileCatalog,
            questions: profileCatalog.questions.map((question) => ({
              ...question,
              condition: { equals: { surface: "cli" } },
              staticOptions: question.staticOptions.map((option) =>
                option.id === "start-with-github-copilot"
                  ? { ...option, condition: { featureFlag: "UNKNOWN_HIDDEN_OPTION_FLAG" } }
                  : option
              ),
            })),
          },
          code: "UnknownFeatureFlag",
        },
      ];
      for (const invalidCase of invalidCases) {
        const fixture = await createFixture();
        await fs.writeFile(
          fixture.scenarioFile,
          withEnvironment(
            scenarioMarkdown("draft"),
            invalidCase.surface,
            invalidCase.profile,
            invalidCase.flags
          ),
          "utf8"
        );
        const result = await renderScenarioArtifacts({
          scenarioRoot: fixture.scenarioRoot,
          indexPath: fixture.indexPath,
          scaffoldCatalog: invalidCase.catalog,
        });

        assert.include(codes(result), invalidCase.code, JSON.stringify(invalidCase));
        assert.isFalse(
          await fs.pathExists(path.join(fixture.scenarioRoot, "da", "create-agent.html")),
          JSON.stringify(invalidCase)
        );
      }
    } finally {
      if (previousChatFlag === undefined) {
        delete process.env[chatFlag];
      } else {
        process.env[chatFlag] = previousChatFlag;
      }
    }
  });

  it("MSA-05: maps exact symbolic secret states into the canonical scalar scope", async () => {
    const nonEmptyFixture = await createFixture();
    const nonEmptyCatalog: ScaffoldCatalog = {
      ...scaffoldCatalog,
      templates: scaffoldCatalog.templates.map((template) => ({
        ...template,
        questions: [
          ...template.questions,
          {
            name: "nonEmptySecretBranch",
            type: "text",
            title: "Non-empty secret branch",
            condition: { expr: "apiKey != null" },
          },
        ],
      })),
    };
    const nonEmpty = await renderScenarioArtifacts({
      scenarioRoot: nonEmptyFixture.scenarioRoot,
      indexPath: nonEmptyFixture.indexPath,
      scaffoldCatalog: nonEmptyCatalog,
    });

    const emptyFixture = await createFixture();
    await fs.writeFile(
      emptyFixture.scenarioFile,
      scenarioMarkdown("draft", "{ state: empty }"),
      "utf8"
    );
    const emptyCatalog: ScaffoldCatalog = {
      ...scaffoldCatalog,
      templates: scaffoldCatalog.templates.map((template) => ({
        ...template,
        questions: [
          ...template.questions,
          {
            name: "emptySecretBranch",
            type: "text",
            title: "Empty secret branch",
            condition: { expr: "apiKey == ''" },
          },
        ],
      })),
    };
    const empty = await renderScenarioArtifacts({
      scenarioRoot: emptyFixture.scenarioRoot,
      indexPath: emptyFixture.indexPath,
      scaffoldCatalog: emptyCatalog,
    });

    assert.deepEqual(nonEmpty.diagnostics, []);
    assert.include(
      await fs.readFile(path.join(nonEmptyFixture.scenarioRoot, "da", "create-agent.html"), "utf8"),
      "Non-empty secret branch"
    );
    assert.deepEqual(empty.diagnostics, []);
    assert.include(
      await fs.readFile(path.join(emptyFixture.scenarioRoot, "da", "create-agent.html"), "utf8"),
      "Empty secret branch"
    );
  });

  it("MSA-05: rejects answers declared only by an unbound template", async () => {
    const fixture = await createFixture();
    await fs.writeFile(
      fixture.scenarioFile,
      scenarioMarkdown("draft").replace(
        "        apiKey: { state: non-empty }",
        "        apiKey: { state: non-empty }\n        unboundAnswer: enabled"
      ),
      "utf8"
    );
    const catalogWithUnboundTemplate: ScaffoldCatalog = {
      ...scaffoldCatalog,
      templates: [
        ...scaffoldCatalog.templates,
        {
          ...scaffoldCatalog.templates[0],
          templateId: "unbound-template",
          questions: [{ name: "unboundAnswer", type: "text" }],
        },
      ],
    };

    const rendered = await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog: catalogWithUnboundTemplate,
    });

    assert.include(codes(rendered), "UndeclaredReviewAnswer");
    assert.isFalse(await fs.pathExists(path.join(fixture.scenarioRoot, "da", "create-agent.html")));
  });

  it("MSA-11: rejects review answers incompatible with the declared question", async () => {
    const invalidAnswers = [
      "        projectType:\n          - agent",
      "        operations: getWeather",
      "        projectType: { state: non-empty }",
      "        projectType: unknown-option",
    ];

    for (const invalidAnswer of invalidAnswers) {
      const fixture = await createFixture();
      await fs.writeFile(
        fixture.scenarioFile,
        scenarioMarkdown("draft").replace(
          "        apiKey: { state: non-empty }",
          `        apiKey: { state: non-empty }\n${invalidAnswer}`
        ),
        "utf8"
      );

      const rendered = await renderScenarioArtifacts({
        scenarioRoot: fixture.scenarioRoot,
        indexPath: fixture.indexPath,
        scaffoldCatalog,
      });

      assert.include(codes(rendered), "InvalidReviewAnswer");
      assert.isFalse(
        await fs.pathExists(path.join(fixture.scenarioRoot, "da", "create-agent.html"))
      );
    }

    const conditionalFixture = await createFixture();
    await fs.writeFile(
      conditionalFixture.scenarioFile,
      scenarioMarkdown("draft")
        .replace("featureFlags: {}", "featureFlags: { TEAMSFX_MCP_FOR_DA_DT: false }")
        .replace(
          "        apiKey: { state: non-empty }",
          "        apiKey: { state: non-empty }\n        projectType: agent"
        ),
      "utf8"
    );
    const conditionalCatalog: ScaffoldCatalog = {
      ...scaffoldCatalog,
      questions: scaffoldCatalog.questions.map((question) => ({
        ...question,
        staticOptions: question.staticOptions.map((option) => ({
          ...option,
          condition: { featureFlag: "TEAMSFX_MCP_FOR_DA_DT" },
        })),
      })),
    };

    const conditional = await renderScenarioArtifacts({
      scenarioRoot: conditionalFixture.scenarioRoot,
      indexPath: conditionalFixture.indexPath,
      scaffoldCatalog: conditionalCatalog,
    });

    assert.include(codes(conditional), "InvalidReviewAnswer");
    assert.isFalse(
      await fs.pathExists(path.join(conditionalFixture.scenarioRoot, "da", "create-agent.html"))
    );

    const singleLanguageFixture = await createFixture();
    await fs.writeFile(
      singleLanguageFixture.scenarioFile,
      scenarioMarkdown("draft").replace(
        "        apiKey: { state: non-empty }",
        "        apiKey: { state: non-empty }\n        language: ruby"
      ),
      "utf8"
    );
    const singleLanguageCatalog: ScaffoldCatalog = {
      ...scaffoldCatalog,
      templates: scaffoldCatalog.templates.map((template) => ({
        ...template,
        descriptor: { languages: ["typescript"] },
      })),
    };

    const singleLanguage = await renderScenarioArtifacts({
      scenarioRoot: singleLanguageFixture.scenarioRoot,
      indexPath: singleLanguageFixture.indexPath,
      scaffoldCatalog: singleLanguageCatalog,
    });

    assert.include(codes(singleLanguage), "InvalidReviewAnswer");
    assert.isFalse(
      await fs.pathExists(path.join(singleLanguageFixture.scenarioRoot, "da", "create-agent.html"))
    );

    const hiddenQuestionFixture = await createFixture();
    await fs.writeFile(
      hiddenQuestionFixture.scenarioFile,
      scenarioMarkdown("draft").replace(
        "        apiKey: { state: non-empty }",
        "        apiKey: { state: non-empty }\n        hiddenChoice: not-authored"
      ),
      "utf8"
    );
    const hiddenQuestionCatalog: ScaffoldCatalog = {
      ...scaffoldCatalog,
      templates: scaffoldCatalog.templates.map((template) => ({
        ...template,
        questions: [
          ...template.questions,
          {
            name: "hiddenChoice",
            type: "singleSelect",
            staticOptions: [{ id: "authored", label: "Authored" }],
            condition: { featureFlag: "TEAMSFX_MCP_FOR_DA_DT" },
          },
        ],
      })),
    };

    const hiddenQuestion = await renderScenarioArtifacts({
      scenarioRoot: hiddenQuestionFixture.scenarioRoot,
      indexPath: hiddenQuestionFixture.indexPath,
      scaffoldCatalog: hiddenQuestionCatalog,
    });

    assert.include(codes(hiddenQuestion), "InvalidReviewAnswer");
    assert.isFalse(
      await fs.pathExists(path.join(hiddenQuestionFixture.scenarioRoot, "da", "create-agent.html"))
    );
  });

  it("MSA-05: ignores conditions owned by unbound templates", async () => {
    const fixture = await createFixture();
    const catalogWithConditionalUnboundTemplate: ScaffoldCatalog = {
      ...scaffoldCatalog,
      templates: [
        ...scaffoldCatalog.templates,
        {
          ...scaffoldCatalog.templates[0],
          templateId: "unbound-template",
          questions: [
            {
              name: "unboundBranch",
              type: "text",
              condition: { expr: "unboundAnswer == 'enabled'" },
            },
          ],
        },
      ],
    };

    const rendered = await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog: catalogWithConditionalUnboundTemplate,
    });

    assert.deepEqual(rendered.diagnostics, []);
    assert.isTrue(await fs.pathExists(path.join(fixture.scenarioRoot, "da", "create-agent.html")));
  });

  it("MSA-06: reports stale projections and gates fingerprint drift by lifecycle status", async () => {
    const draftFixture = await createFixture("draft");
    await renderScenarioArtifacts({
      scenarioRoot: draftFixture.scenarioRoot,
      indexPath: draftFixture.indexPath,
      scaffoldCatalog,
    });
    await fs.appendFile(
      path.join(draftFixture.scenarioRoot, "da", "create-agent.html"),
      "manual edit",
      "utf8"
    );

    const stale = await checkScenarioArtifacts({
      scenarioRoot: draftFixture.scenarioRoot,
      indexPath: draftFixture.indexPath,
      scaffoldCatalog,
    });
    assert.include(codes(stale), "StaleGeneratedHtml");

    await renderScenarioArtifacts({
      scenarioRoot: draftFixture.scenarioRoot,
      indexPath: draftFixture.indexPath,
      scaffoldCatalog,
    });
    const draftDrift = await checkScenarioArtifacts({
      scenarioRoot: draftFixture.scenarioRoot,
      indexPath: draftFixture.indexPath,
      scaffoldCatalog,
    });
    assert.isTrue(
      draftDrift.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "ReviewedSemanticFingerprintDrift" &&
          diagnostic.severity === "warning"
      )
    );

    const approvedFixture = await createFixture("approved");
    await renderScenarioArtifacts({
      scenarioRoot: approvedFixture.scenarioRoot,
      indexPath: approvedFixture.indexPath,
      scaffoldCatalog,
    });
    const approvedDrift = await checkScenarioArtifacts({
      scenarioRoot: approvedFixture.scenarioRoot,
      indexPath: approvedFixture.indexPath,
      scaffoldCatalog,
    });
    assert.isTrue(
      approvedDrift.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "ReviewedSemanticFingerprintDrift" && diagnostic.severity === "error"
      )
    );
  });

  it("MSA-13: reports semantic and presentation fingerprint drift independently", async () => {
    const semanticFixture = await createFixture();
    await renderScenarioArtifacts({
      scenarioRoot: semanticFixture.scenarioRoot,
      indexPath: semanticFixture.indexPath,
      scaffoldCatalog,
    });
    await acceptScenarioArtifact({
      scenarioRoot: semanticFixture.scenarioRoot,
      indexPath: semanticFixture.indexPath,
      scaffoldCatalog,
      scenarioFile: semanticFixture.scenarioFile,
    });
    const semanticCatalog: ScaffoldCatalog = {
      ...scaffoldCatalog,
      templates: scaffoldCatalog.templates.map((template) => ({
        ...template,
        pipeline: { steps: [...template.pipeline.steps, { uses: "validate" }] },
      })),
    };
    await renderScenarioArtifacts({
      scenarioRoot: semanticFixture.scenarioRoot,
      indexPath: semanticFixture.indexPath,
      scaffoldCatalog: semanticCatalog,
    });
    const semanticDrift = await checkScenarioArtifacts({
      scenarioRoot: semanticFixture.scenarioRoot,
      indexPath: semanticFixture.indexPath,
      scaffoldCatalog: semanticCatalog,
    });

    const presentationFixture = await createFixture();
    await renderScenarioArtifacts({
      scenarioRoot: presentationFixture.scenarioRoot,
      indexPath: presentationFixture.indexPath,
      scaffoldCatalog,
    });
    await acceptScenarioArtifact({
      scenarioRoot: presentationFixture.scenarioRoot,
      indexPath: presentationFixture.indexPath,
      scaffoldCatalog,
      scenarioFile: presentationFixture.scenarioFile,
    });
    const presentationCatalog: ScaffoldCatalog = {
      ...scaffoldCatalog,
      questions: scaffoldCatalog.questions.map((question) => ({
        ...question,
        title: "Choose a project type",
      })),
    };
    await renderScenarioArtifacts({
      scenarioRoot: presentationFixture.scenarioRoot,
      indexPath: presentationFixture.indexPath,
      scaffoldCatalog: presentationCatalog,
    });
    const presentationDrift = await checkScenarioArtifacts({
      scenarioRoot: presentationFixture.scenarioRoot,
      indexPath: presentationFixture.indexPath,
      scaffoldCatalog: presentationCatalog,
    });

    assert.deepEqual(codes(semanticDrift), ["ReviewedSemanticFingerprintDrift"]);
    assert.notInclude(codes(semanticDrift), "ReviewedPresentationFingerprintDrift");
    assert.match(
      semanticDrift.diagnostics[0].message,
      /reviewed '[a-f0-9]{64}'.*current '[a-f0-9]{64}'/
    );
    assert.deepEqual(codes(presentationDrift), ["ReviewedPresentationFingerprintDrift"]);
    assert.notInclude(codes(presentationDrift), "ReviewedSemanticFingerprintDrift");
    assert.match(
      presentationDrift.diagnostics[0].message,
      /reviewed '[a-f0-9]{64}'.*current '[a-f0-9]{64}'/
    );
  });

  it("MSA-06: reports and removes only orphaned generated scenario HTML", async () => {
    const fixture = await createFixture();
    await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });
    const orphan = path.join(fixture.scenarioRoot, "da", "orphan.html");
    const manual = path.join(fixture.scenarioRoot, "da", "manual.html");
    await fs.writeFile(
      orphan,
      "<!-- Generated from scenario Markdown and v4 declarations. Do not edit. -->\n",
      "utf8"
    );
    await fs.writeFile(manual, "<!doctype html><title>Manual</title>\n", "utf8");

    const checked = await checkScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });
    const rendered = await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });

    assert.include(codes(checked), "OrphanedGeneratedHtml");
    assert.deepEqual(rendered.diagnostics, []);
    assert.isFalse(await fs.pathExists(orphan));
    assert.isTrue(await fs.pathExists(manual));
  });

  it("MSA-06: regenerates promoted canonical and historical artifacts without proposal orphans", async () => {
    const fixture = await createFixture("approved");
    const proposalPath = path.join(fixture.scenarioRoot, "da", "create-agent--redesign.md");
    const proposalHtml = path.join(fixture.scenarioRoot, "da", "create-agent--redesign.html");
    await fs.writeFile(
      proposalPath,
      scenarioMarkdown("review").replace(
        "- Visual/state reference: create-agent.html",
        "- Visual/state reference: create-agent--redesign.html\n- Proposal key: redesign\n- Supersedes: create-agent.md\n- Redesign trigger: test redesign"
      ),
      "utf8"
    );
    await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });
    const accepted = await acceptScenarioArtifact({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
      scenarioFile: proposalPath,
    });
    assert.deepEqual(accepted.diagnostics, []);
    assert.isTrue(await fs.pathExists(proposalHtml));

    const historicalPath = path.join(
      fixture.scenarioRoot,
      "da",
      "create-agent-superseded-20260714.md"
    );
    const current = await fs.readFile(fixture.scenarioFile, "utf8");
    const proposal = await fs.readFile(proposalPath, "utf8");
    await fs.writeFile(
      historicalPath,
      current
        .replace("- Status: approved", "- Status: superseded")
        .replace(
          "- Visual/state reference: create-agent.html",
          "- Visual/state reference: create-agent-superseded-20260714.html\n- Supersedes: create-agent.md"
        ),
      "utf8"
    );
    await fs.writeFile(
      fixture.scenarioFile,
      proposal
        .replace("- Status: review", "- Status: approved")
        .replace(
          "- Visual/state reference: create-agent--redesign.html",
          "- Visual/state reference: create-agent.html"
        )
        .replace("- Proposal key: redesign\n", "")
        .replace("- Supersedes: create-agent.md\n", "")
        .replace("- Redesign trigger: test redesign\n", ""),
      "utf8"
    );
    await fs.remove(proposalPath);

    const rendered = await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });
    const checked = await checkScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });

    assert.isEmpty(rendered.diagnostics.filter((diagnostic) => diagnostic.severity === "error"));
    assert.isEmpty(checked.diagnostics.filter((diagnostic) => diagnostic.severity === "error"));
    assert.isFalse(await fs.pathExists(proposalHtml));
    assert.isTrue(
      await fs.pathExists(
        path.join(fixture.scenarioRoot, "da", "create-agent-superseded-20260714.html")
      )
    );
    assert.isTrue(await fs.pathExists(path.join(fixture.scenarioRoot, "da", "create-agent.html")));
    const promoted = await fs.readFile(fixture.scenarioFile, "utf8");
    assert.notInclude(promoted, "Proposal key:");
    assert.notInclude(promoted, "Supersedes:");
    assert.notInclude(promoted, "Redesign trigger:");
  });

  it("MSA-07: rejects a literal secret before writing or reporting its value", async () => {
    const fixture = await createFixture();
    const literal = "literal-super-secret-value";
    await fs.writeFile(fixture.scenarioFile, scenarioMarkdown("draft", literal), "utf8");

    const result = await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });

    assert.include(codes(result), "LiteralSecretReviewAnswer");
    assert.isFalse(await fs.pathExists(path.join(fixture.scenarioRoot, "da", "create-agent.html")));
    assert.notInclude(JSON.stringify(result.diagnostics), literal);

    const disguisedFixture = await createFixture();
    const disguised = `{ state: non-empty, value: ${literal} }`;
    await fs.writeFile(disguisedFixture.scenarioFile, scenarioMarkdown("draft", disguised), "utf8");
    const disguisedResult = await renderScenarioArtifacts({
      scenarioRoot: disguisedFixture.scenarioRoot,
      indexPath: disguisedFixture.indexPath,
      scaffoldCatalog,
    });

    assert.include(codes(disguisedResult), "InvalidImplementationBinding");
    assert.notInclude(JSON.stringify(disguisedResult.diagnostics), literal);

    const invalidContextFixture = await createFixture();
    await fs.writeFile(
      invalidContextFixture.scenarioFile,
      scenarioMarkdown("draft").replace(
        "featureFlags: {}",
        `featureFlags:\n        marker: ${literal}`
      ),
      "utf8"
    );
    const invalidContext = await renderScenarioArtifacts({
      scenarioRoot: invalidContextFixture.scenarioRoot,
      indexPath: invalidContextFixture.indexPath,
      scaffoldCatalog,
    });
    assert.include(codes(invalidContext), "InvalidImplementationBinding");
    assert.notInclude(JSON.stringify(invalidContext.diagnostics), literal);
    assert.isFalse(
      await fs.pathExists(path.join(invalidContextFixture.scenarioRoot, "da", "create-agent.html"))
    );
  });

  it("MSA-08: initializes canonical and explicit proposal Markdown without overwriting", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "scenario-init-"));
    createdRoots.push(root);
    const scenarioRoot = path.join(root, "scenarios");
    await fs.ensureDir(scenarioRoot);

    const created = await initializeScenario({
      scenarioRoot,
      group: "da",
      slug: "create-agent",
      title: "Create an agent",
      scenarioId: "SCN-DA-CREATE-AGENT",
      pmOwner: "owner",
      engineerOwner: "engineer",
      templateId: "agent-template",
      timestamp: "2026-07-14T00:00:00Z",
    });
    const canonicalPath = path.join(scenarioRoot, "da", "create-agent.md");
    const canonical = await fs.readFile(canonicalPath, "utf8");
    const duplicate = await initializeScenario({
      scenarioRoot,
      group: "da",
      slug: "create-agent",
      title: "Different title",
      scenarioId: "SCN-DA-CREATE-AGENT",
      pmOwner: "owner",
      engineerOwner: "engineer",
      templateId: "agent-template",
      timestamp: "2026-07-14T00:00:00Z",
    });
    assert.equal(await fs.readFile(canonicalPath, "utf8"), canonical);
    const draftProposal = await initializeScenario({
      scenarioRoot,
      group: "da",
      slug: "create-agent",
      title: "Create an agent too early",
      scenarioId: "SCN-DA-CREATE-AGENT",
      pmOwner: "owner",
      engineerOwner: "engineer",
      templateId: "agent-template",
      proposalKey: "early",
      timestamp: "2026-07-14T00:00:00Z",
    });
    const ambiguousSlug = await initializeScenario({
      scenarioRoot,
      group: "da",
      slug: "create-agent--implicit-proposal",
      title: "Create an agent",
      scenarioId: "SCN-AMBIGUOUS",
      pmOwner: "owner",
      engineerOwner: "engineer",
      templateId: "agent-template",
      timestamp: "2026-07-14T00:00:00Z",
    });
    await fs.writeFile(canonicalPath, canonical.replace("- Status: draft", "- Status: approved"));
    const proposal = await initializeScenario({
      scenarioRoot,
      group: "da",
      slug: "create-agent",
      title: "Create an agent with DT",
      scenarioId: "SCN-DA-CREATE-AGENT",
      pmOwner: "owner",
      engineerOwner: "engineer",
      templateId: "agent-template",
      proposalKey: "dt",
      redesignTrigger: "Dynamic Tool Discovery",
      timestamp: "2026-07-14T00:00:00Z",
    });
    const secondRoot = path.join(root, "second-scenarios");
    await fs.ensureDir(secondRoot);
    await initializeScenario({
      scenarioRoot: secondRoot,
      group: "da",
      slug: "create-agent",
      title: "Create an agent",
      scenarioId: "SCN-DA-CREATE-AGENT",
      pmOwner: "owner",
      engineerOwner: "engineer",
      templateId: "agent-template",
      timestamp: "2026-07-14T00:00:00Z",
    });

    assert.deepEqual(created.diagnostics, []);
    assert.include(canonical, "- Status: draft");
    assert.include(canonical, "- Start state: To be defined before review.");
    assert.include(canonical, "- Success state: To be defined before review.");
    assert.include(canonical, "## Scenario\n\nTo be defined before review.");
    assert.include(canonical, "## Surfaces\n\n- To be defined before review.");
    assert.include(canonical, "## Validation notes\n\n- To be defined before review.");
    assert.include(codes(duplicate), "ScenarioAlreadyExists");
    assert.include(codes(draftProposal), "ProposalBaselineMissing");
    assert.include(codes(ambiguousSlug), "InvalidScenarioPath");
    assert.deepEqual(proposal.diagnostics, []);
    assert.isTrue(await fs.pathExists(path.join(scenarioRoot, "da", "create-agent--dt.md")));
    assert.equal(
      await fs.readFile(path.join(secondRoot, "da", "create-agent.md"), "utf8"),
      canonical
    );
  });

  it("MSA-08: rejects initialization inputs that cannot form a valid scenario contract", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "scenario-invalid-init-"));
    createdRoots.push(root);
    const scenarioRoot = path.join(root, "scenarios");
    await fs.ensureDir(scenarioRoot);
    const base = {
      scenarioRoot,
      group: "da",
      title: "Create an agent",
      pmOwner: "owner",
      engineerOwner: "engineer",
      timestamp: "2026-07-14T00:00:00Z",
    };

    const invalidId = await initializeScenario({
      ...base,
      slug: "invalid-id",
      scenarioId: "invalid-id",
      templateId: "agent-template",
    });
    const emptyTemplate = await initializeScenario({
      ...base,
      slug: "empty-template",
      scenarioId: "SCN-EMPTY-TEMPLATE",
      templateId: "",
    });
    const emptyOwner = await initializeScenario({
      ...base,
      slug: "empty-owner",
      scenarioId: "SCN-EMPTY-OWNER",
      pmOwner: "",
      templateId: "agent-template",
    });
    const injectedOwner = await initializeScenario({
      ...base,
      slug: "injected-owner",
      scenarioId: "SCN-INJECTED-OWNER",
      pmOwner: "owner\n- Scenario ID: SCN-OVERRIDE",
      templateId: "agent-template",
    });
    const canonical = await initializeScenario({
      ...base,
      slug: "proposal-baseline",
      scenarioId: "SCN-PROPOSAL-BASELINE",
      templateId: "agent-template",
    });
    const canonicalPath = path.join(scenarioRoot, "da", "proposal-baseline.md");
    await fs.writeFile(
      canonicalPath,
      (await fs.readFile(canonicalPath, "utf8")).replace("- Status: draft", "- Status: approved"),
      "utf8"
    );
    const emptyTrigger = await initializeScenario({
      ...base,
      slug: "proposal-baseline",
      scenarioId: "SCN-PROPOSAL-BASELINE",
      templateId: "agent-template",
      proposalKey: "redesign",
      redesignTrigger: "",
    });

    assert.include(codes(invalidId), "InvalidScenarioId");
    assert.include(codes(emptyTemplate), "InvalidImplementationBinding");
    assert.include(codes(emptyOwner), "IncompleteMetadata");
    assert.include(codes(injectedOwner), "DuplicateMetadataField");
    assert.deepEqual(canonical.diagnostics, []);
    assert.include(codes(emptyTrigger), "ProposalMissingRedesignTrigger");
    assert.isFalse(await fs.pathExists(path.join(scenarioRoot, "da", "invalid-id.md")));
    assert.isFalse(await fs.pathExists(path.join(scenarioRoot, "da", "empty-template.md")));
    assert.isFalse(await fs.pathExists(path.join(scenarioRoot, "da", "empty-owner.md")));
    assert.isFalse(await fs.pathExists(path.join(scenarioRoot, "da", "injected-owner.md")));
    assert.isFalse(
      await fs.pathExists(path.join(scenarioRoot, "da", "proposal-baseline--redesign.md"))
    );
  });

  it("MSA-09: accepts only current generated artifacts and changes only reviewed fingerprints", async () => {
    const fixture = await createFixture("approved");
    const sourceWithDecoy = (await fs.readFile(fixture.scenarioFile, "utf8")).replace(
      "## Implementation binding",
      `## Review notes

reviewedFingerprints:
  semantic: decoy-semantic
  presentation: decoy-presentation

## Implementation binding`
    );
    await fs.writeFile(fixture.scenarioFile, sourceWithDecoy, "utf8");
    await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });
    const before = await fs.readFile(fixture.scenarioFile, "utf8");

    const accepted = await acceptScenarioArtifact({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
      scenarioFile: fixture.scenarioFile,
    });
    const after = await fs.readFile(fixture.scenarioFile, "utf8");

    assert.deepEqual(accepted.diagnostics, []);
    assert.include(after, "- Status: approved");
    assert.include(after, "semantic: decoy-semantic");
    assert.include(after, "presentation: decoy-presentation");
    assert.notInclude(after, "semantic: pending");
    assert.notInclude(after, "presentation: pending");
    const restoreFingerprints = (value: string) =>
      value
        .replace(/semantic: [a-f0-9]{64}/, "semantic: pending")
        .replace(/presentation: [a-f0-9]{64}/, "presentation: pending");
    assert.equal(restoreFingerprints(after), before);
  });

  it("MSA-09: accepts concurrent updates without temporary-file collisions", async () => {
    const fixture = await createFixture("approved");
    await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        acceptScenarioArtifact({
          scenarioRoot: fixture.scenarioRoot,
          indexPath: fixture.indexPath,
          scaffoldCatalog,
          scenarioFile: fixture.scenarioFile,
        })
      )
    );

    assert.isTrue(
      results.every((result) => result.diagnostics.length === 0),
      JSON.stringify(results)
    );
    assert.notInclude(await fs.readFile(fixture.scenarioFile, "utf8"), "semantic: pending");
    assert.isFalse(
      (await fs.readdir(path.dirname(fixture.scenarioFile))).some((file) => file.endsWith(".tmp"))
    );
  });

  it("MSA-09: rejects a scenario source changed after artifact validation", async () => {
    const fixture = await createFixture("approved");
    await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });
    const originalReadFile = fs.readFile;
    let scenarioReads = 0;
    // The ESM namespace is immutable, so Vitest must spy on the module's default object.
    vi.spyOn(fsExtra, "readFile").mockImplementation(async (filePath, options) => {
      const value = await originalReadFile(filePath, options);
      if (path.resolve(String(filePath)) === path.resolve(fixture.scenarioFile)) {
        scenarioReads++;
        if (scenarioReads === 2 && typeof value === "string") {
          await fs.writeFile(
            fixture.scenarioFile,
            value.replace("- Status: approved", "- Status: review"),
            "utf8"
          );
        }
      }
      return value;
    });

    const accepted = await acceptScenarioArtifact({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
      scenarioFile: fixture.scenarioFile,
    });
    const source = await originalReadFile(fixture.scenarioFile, "utf8");

    assert.include(codes(accepted), "ScenarioSourceChanged");
    assert.include(source, "- Status: review");
    assert.include(source, "semantic: pending");
    assert.include(source, "presentation: pending");
  });

  it("MSA-09: preserves a scenario changed while the accepted temporary file is written", async () => {
    const fixture = await createFixture("approved");
    await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });
    const originalWriteFile = fs.writeFile;
    vi.spyOn(fsExtra, "writeFile").mockImplementation(async (filePath, data, options) => {
      await originalWriteFile(filePath, data, options);
      if (String(filePath).endsWith(".tmp")) {
        const latest = (await fs.readFile(fixture.scenarioFile, "utf8")).replace(
          "- Status: approved",
          "- Status: review"
        );
        await originalWriteFile(fixture.scenarioFile, latest, "utf8");
      }
    });

    const accepted = await acceptScenarioArtifact({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
      scenarioFile: fixture.scenarioFile,
    });
    const source = await fs.readFile(fixture.scenarioFile, "utf8");

    assert.include(codes(accepted), "ScenarioSourceChanged");
    assert.include(source, "- Status: review");
    assert.include(source, "semantic: pending");
    assert.isFalse(
      (await fs.readdir(path.dirname(fixture.scenarioFile))).some(
        (file) => file.endsWith(".tmp") || file.endsWith(".bak")
      )
    );
  });

  it("MSA-09: restores the scenario when accepted-file publication fails", async () => {
    const fixture = await createFixture("approved");
    await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });
    const originalLink = fs.link;
    vi.spyOn(fsExtra, "link").mockImplementation(async (source, destination) => {
      if (String(source).endsWith(".tmp")) {
        throw Object.assign(new Error("publication denied"), { code: "EPERM" });
      }
      await originalLink(source, destination);
    });

    let failure: unknown;
    try {
      await acceptScenarioArtifact({
        scenarioRoot: fixture.scenarioRoot,
        indexPath: fixture.indexPath,
        scaffoldCatalog,
        scenarioFile: fixture.scenarioFile,
      });
    } catch (error) {
      failure = error;
    }
    const source = await fs.readFile(fixture.scenarioFile, "utf8");

    assert.instanceOf(failure, Error);
    assert.include(source, "- Status: approved");
    assert.include(source, "semantic: pending");
    assert.isFalse(
      (await fs.readdir(path.dirname(fixture.scenarioFile))).some(
        (file) => file.endsWith(".tmp") || file.endsWith(".bak")
      )
    );
  });

  it("MSA-09: falls back safely when backup hard-link restoration fails", async () => {
    const fixture = await createFixture("approved");
    await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });
    const originalWriteFile = fs.writeFile;
    const originalLink = fs.link;
    vi.spyOn(fsExtra, "writeFile").mockImplementation(async (filePath, data, options) => {
      await originalWriteFile(filePath, data, options);
      if (String(filePath).endsWith(".tmp")) {
        const latest = (await fs.readFile(fixture.scenarioFile, "utf8")).replace(
          "- Status: approved",
          "- Status: review"
        );
        await originalWriteFile(fixture.scenarioFile, latest, "utf8");
      }
    });
    vi.spyOn(fsExtra, "link").mockImplementation(async (source, destination) => {
      if (String(source).endsWith(".bak")) {
        throw Object.assign(new Error("hard links unavailable"), { code: "EPERM" });
      }
      await originalLink(source, destination);
    });

    const accepted = await acceptScenarioArtifact({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
      scenarioFile: fixture.scenarioFile,
    });
    const source = await fs.readFile(fixture.scenarioFile, "utf8");

    assert.include(codes(accepted), "ScenarioSourceChanged");
    assert.include(source, "- Status: review");
    assert.include(source, "semantic: pending");
    assert.isFalse(
      (await fs.readdir(path.dirname(fixture.scenarioFile))).some(
        (file) => file.endsWith(".tmp") || file.endsWith(".bak")
      )
    );
  });

  it("MSA-09: retains the backup when every no-clobber restoration method fails", async () => {
    const fixture = await createFixture("approved");
    await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });
    const originalWriteFile = fs.writeFile;
    const originalLink = fs.link;
    const originalCopyFile = fs.copyFile;
    vi.spyOn(fsExtra, "writeFile").mockImplementation(async (filePath, data, options) => {
      await originalWriteFile(filePath, data, options);
      if (String(filePath).endsWith(".tmp")) {
        const latest = (await fs.readFile(fixture.scenarioFile, "utf8")).replace(
          "- Status: approved",
          "- Status: review"
        );
        await originalWriteFile(fixture.scenarioFile, latest, "utf8");
      }
    });
    vi.spyOn(fsExtra, "link").mockImplementation(async (source, destination) => {
      if (String(source).endsWith(".bak")) {
        throw Object.assign(new Error("hard links unavailable"), { code: "EPERM" });
      }
      await originalLink(source, destination);
    });
    vi.spyOn(fsExtra, "copyFile").mockImplementation(async (source, destination, mode) => {
      if (String(source).endsWith(".bak")) {
        throw Object.assign(new Error("exclusive copy unavailable"), { code: "EPERM" });
      }
      await originalCopyFile(source, destination, mode);
    });

    let failure: unknown;
    try {
      await acceptScenarioArtifact({
        scenarioRoot: fixture.scenarioRoot,
        indexPath: fixture.indexPath,
        scaffoldCatalog,
        scenarioFile: fixture.scenarioFile,
      });
    } catch (error) {
      failure = error;
    }
    const siblings = await fs.readdir(path.dirname(fixture.scenarioFile));
    const backups = siblings.filter((file) => file.endsWith(".bak"));

    assert.instanceOf(failure, Error);
    assert.isFalse(await fs.pathExists(fixture.scenarioFile));
    assert.lengthOf(backups, 1);
    assert.include(
      await fs.readFile(path.join(path.dirname(fixture.scenarioFile), backups[0]), "utf8"),
      "- Status: review"
    );
    assert.isFalse(siblings.some((file) => file.endsWith(".tmp")));
  });

  it("MSA-09: serializes Windows path aliases that resolve to the same scenario", async () => {
    if (process.platform !== "win32") {
      return;
    }
    const fixture = await createFixture("approved");
    await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });
    vi.spyOn(fsExtra, "realpath").mockImplementation(async (filePath) =>
      path.resolve(String(filePath))
    );

    const results = await Promise.all(
      [fixture.scenarioFile.toUpperCase(), fixture.scenarioFile].map((scenarioFile) =>
        acceptScenarioArtifact({
          scenarioRoot: fixture.scenarioRoot,
          indexPath: fixture.indexPath,
          scaffoldCatalog,
          scenarioFile,
        })
      )
    );

    assert.isTrue(
      results.every((result) => result.diagnostics.length === 0),
      JSON.stringify(results)
    );
    assert.include(
      await fs.readdir(path.dirname(fixture.scenarioFile)),
      path.basename(fixture.scenarioFile)
    );
  });

  it("MSA-09: rejects a junction path that resolves outside the scenario root", async () => {
    if (process.platform !== "win32") {
      return;
    }
    const fixture = await createFixture("approved");
    const outside = path.join(fixture.root, "outside");
    const junction = path.join(fixture.scenarioRoot, "linked");
    const outsideScenario = path.join(outside, "create-agent.md");
    await fs.ensureDir(outside);
    await fs.writeFile(outsideScenario, scenarioMarkdown("approved"), "utf8");
    await fs.symlink(outside, junction, "junction");

    const accepted = await acceptScenarioArtifact({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
      scenarioFile: path.join(junction, "create-agent.md"),
    });

    assert.deepEqual(codes(accepted), ["ScenarioPathEscapesRoot"]);
    assert.include(await fs.readFile(outsideScenario, "utf8"), "semantic: pending");
  });

  it("MSA-09: preserves inline comments while updating fingerprint scalars", async () => {
    const fixture = await createFixture("approved");
    await fs.writeFile(
      fixture.scenarioFile,
      (await fs.readFile(fixture.scenarioFile, "utf8"))
        .replace("semantic: pending", "semantic: pending # semantic review")
        .replace("presentation: pending", "presentation: pending # presentation review"),
      "utf8"
    );
    await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });

    const accepted = await acceptScenarioArtifact({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
      scenarioFile: fixture.scenarioFile,
    });
    const after = await fs.readFile(fixture.scenarioFile, "utf8");

    assert.deepEqual(accepted.diagnostics, []);
    assert.include(after, "# semantic review");
    assert.include(after, "# presentation review");
  });

  it("MSA-10: generates index data from Current and In-review metadata only", async () => {
    const fixture = await createFixture("implemented");
    const reviewPath = path.join(fixture.scenarioRoot, "da", "review.md");
    const hiddenPath = path.join(fixture.scenarioRoot, "da", "hidden.md");
    const hiddenSuccessorPath = path.join(fixture.scenarioRoot, "da", "hidden-current.md");
    await fs.writeFile(
      reviewPath,
      scenarioMarkdown("review")
        .replaceAll("SCN-DA-CREATE-AGENT", "SCN-DA-REVIEW")
        .replace("create-agent.html", "review.html"),
      "utf8"
    );
    await fs.writeFile(
      hiddenPath,
      scenarioMarkdown("draft")
        .replace("- Status: draft", "- Status: archived")
        .replaceAll("SCN-DA-CREATE-AGENT", "SCN-DA-HIDDEN")
        .replace("create-agent.html", "hidden.html")
        .replace("## Scenario", "- Supersedes: hidden-current.md\n\n## Scenario")
        .split("## Implementation binding")[0],
      "utf8"
    );
    await fs.writeFile(
      hiddenSuccessorPath,
      scenarioMarkdown("approved")
        .replaceAll("SCN-DA-CREATE-AGENT", "SCN-DA-HIDDEN")
        .replace("create-agent.html", "hidden-current.html")
        .split("## Implementation binding")[0],
      "utf8"
    );

    await renderScenarioArtifacts({
      scenarioRoot: fixture.scenarioRoot,
      indexPath: fixture.indexPath,
      scaffoldCatalog,
    });
    const index = await fs.readFile(fixture.indexPath, "utf8");
    const dataMatch = index.match(
      /<script id="scenario-index-data" type="application\/json">\s*([\s\S]*?)\s*<\/script>/
    );

    assert.isNotNull(dataMatch);
    const data: unknown = JSON.parse(dataMatch?.[1] ?? "null");
    assert.deepEqual(data, {
      current: ["da/create-agent.html", "da/hidden-current.html"],
      inReview: ["da/review.html"],
    });
    assert.notInclude(index, "hidden.html");
    assert.notInclude(index, "liveArtifacts");
    assert.notInclude(index, "draftArtifacts");
  });

  it("MSA-10: escapes scenario paths before embedding index JSON in a script element", () => {
    const injectedPath = "da/</script><script>globalThis.pwned=true</script>.md";
    const catalog = {
      documents: [],
      current: [
        {
          relativePath: injectedPath,
          title: "Injected",
          status: "approved" as const,
          scenarioId: "SCN-INJECTED",
          scenarioGroup: "da",
          visualStateReference: "injected.html",
        },
      ],
      inReview: [],
      hidden: [],
      diagnostics: [],
    };

    const updated = replaceScenarioIndexData(indexTemplate, catalog);

    assert.isString(updated);
    assert.notInclude(updated, "</script><script>globalThis.pwned");
    assert.include(updated, "\\u003c/script>");
  });
});
