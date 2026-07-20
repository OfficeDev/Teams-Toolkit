// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { assert } from "chai";
import * as fs from "fs-extra";
import os from "os";
import path from "path";
import {
  ScenarioCatalog,
  fingerprintScaffoldTemplate,
  parseScenarioBinding,
  scanScenarioDocuments,
} from "../../scripts/scenario-tooling/scenarioCatalog";
import { ScaffoldCatalogTemplate } from "../../src/v4/inspection/scaffoldCatalog";
import { PresentationQuestion } from "../../src/v4/buildTarget/parseSelector";

const createdRoots: string[] = [];

function scenarioMarkdown(
  scenarioId: string,
  status: string | undefined,
  extraMetadata: string[] = []
): string {
  const statusLine = status === undefined ? [] : [`- Status: ${status}`];
  return [
    `# ${scenarioId}`,
    "",
    "## Metadata",
    "",
    "- Created: 2026-07-14T00:00:00Z",
    "- Last updated: 2026-07-14T00:00:00Z",
    ...statusLine,
    "- PM owner: owner",
    "- Engineer owner: engineer",
    "- Scenario group: da",
    `- Scenario ID: ${scenarioId}`,
    "- Primary goal: create",
    "- Start state: start",
    "- Success state: success",
    "- Lifecycle phases: [create]",
    "- Visual/state reference: scenario.html",
    ...extraMetadata.map((line) => `- ${line}`),
    "",
    "## Scenario",
    "",
    "Scenario body.",
    "",
    "## Surfaces",
    "",
    "- VS Code",
    "",
    "## States",
    "",
    "- Success",
    "",
    "## User-visible outputs",
    "",
    "- Output",
    "",
    "## Flow",
    "",
    "```mermaid",
    "flowchart TD",
    "  Start --> Complete",
    "```",
    "",
    "## Validation notes",
    "",
    "- Validate success.",
    "",
  ].join("\n");
}

async function createScenarioRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "scenario-catalog-"));
  createdRoots.push(root);
  return root;
}

async function writeScenario(
  root: string,
  relativePath: string,
  markdown: string,
  templateIds: string[] = [],
  kind: "create" | "modify" = "create"
): Promise<void> {
  const binding =
    templateIds.length === 0
      ? ""
      : [
          "## Implementation binding",
          "",
          "```yaml",
          "version: 1",
          "scaffolding:",
          `  kind: ${kind}`,
          "  templateIds:",
          ...templateIds.map((templateId) => `    - ${templateId}`),
          "  reviewContexts: []",
          "  reviewedFingerprints:",
          "    semantic: pending",
          "    presentation: pending",
          "```",
          "",
        ].join("\n");
  const filePath = path.join(root, relativePath);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${markdown}${binding}`, "utf8");
}

function diagnosticCodes(catalog: ScenarioCatalog): string[] {
  return catalog.diagnostics.map((diagnostic) => diagnostic.code);
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map((root) => fs.remove(root)));
});

describe("scenario artifact catalog", () => {
  it("MSA-01: classifies lifecycle state from metadata in deterministic path order", async () => {
    const root = await createScenarioRoot();
    await writeScenario(root, "da/z-review.md", scenarioMarkdown("SCN-Z", "review"));
    await writeScenario(root, "da/a-current.md", scenarioMarkdown("SCN-A", "approved"));
    await writeScenario(root, "da/m-hidden.md", scenarioMarkdown("SCN-M", "archived"));
    await writeScenario(root, "da/b-draft.md", scenarioMarkdown("SCN-B", "draft"));
    await writeScenario(root, "da/c-implemented.md", scenarioMarkdown("SCN-C", "implemented"));

    const catalog = await scanScenarioDocuments(root);

    assert.deepEqual(
      catalog.current.map((scenario) => scenario.relativePath),
      ["da/a-current.md", "da/c-implemented.md"]
    );
    assert.deepEqual(
      catalog.inReview.map((scenario) => scenario.relativePath),
      ["da/b-draft.md", "da/z-review.md"]
    );
    assert.deepEqual(
      catalog.hidden.map((scenario) => scenario.relativePath),
      ["da/m-hidden.md"]
    );
  });

  it("MSA-02: reports duplicate current ownership and malformed proposals without writes", async () => {
    const root = await createScenarioRoot();
    await writeScenario(root, "da/first.md", scenarioMarkdown("SCN-FIRST", "approved"), [
      "shared-template",
    ]);
    await writeScenario(root, "da/second.md", scenarioMarkdown("SCN-SECOND", "implemented"), [
      "shared-template",
    ]);
    await writeScenario(
      root,
      "da/first--dt.md",
      scenarioMarkdown("SCN-FIRST", "draft", ["Proposal key: other-key", "Supersedes: missing.md"])
    );
    await writeScenario(
      root,
      "da/first--second.md",
      scenarioMarkdown("SCN-FIRST", "review", ["Proposal key: other-key", "Supersedes: first.md"])
    );
    await writeScenario(root, "da/third.md", scenarioMarkdown("SCN-THIRD", "approved"));
    await writeScenario(
      root,
      "da/draft/third-legacy-name.md",
      scenarioMarkdown("SCN-THIRD", "review", ["Proposal key: proposal", "Supersedes: ../third.md"])
    );
    await writeScenario(root, "da/history.md", scenarioMarkdown("SCN-HISTORY", "archived"));
    await writeScenario(
      root,
      "da/history-current.md",
      scenarioMarkdown("SCN-HISTORY-LINK", "approved")
    );
    await writeScenario(
      root,
      "da/history-invalid.md",
      scenarioMarkdown("SCN-HISTORY-LINK", "superseded", ["Supersedes: missing.md"])
    );
    const before = await fs.readFile(path.join(root, "da", "first--dt.md"), "utf8");

    const catalog = await scanScenarioDocuments(root);

    assert.includeMembers(diagnosticCodes(catalog), [
      "DuplicateCurrentTemplateOwner",
      "ProposalFilenameMismatch",
      "DuplicateProposalKey",
      "ProposalBaselineMismatch",
      "ProposalMissingRedesignTrigger",
      "HistoricalMissingSupersedes",
      "HistoricalSuccessorMismatch",
    ]);
    assert.isTrue(
      catalog.diagnostics.some(
        (item) =>
          item.code === "ProposalFilenameMismatch" &&
          item.relativePath === "da/draft/third-legacy-name.md"
      )
    );
    assert.equal(await fs.readFile(path.join(root, "da", "first--dt.md"), "utf8"), before);
  });

  it("MSA-03: preserves metadata classification for legacy files and warns about migration", async () => {
    const root = await createScenarioRoot();
    await writeScenario(root, "da/legacy.md", scenarioMarkdown("SCN-LEGACY", undefined));
    await writeScenario(root, "da/draft/proposal.md", scenarioMarkdown("SCN-PROPOSAL", "review"));

    const catalog = await scanScenarioDocuments(root);

    assert.deepEqual(
      catalog.current.map((scenario) => scenario.relativePath),
      ["da/legacy.md"]
    );
    assert.deepEqual(
      catalog.inReview.map((scenario) => scenario.relativePath),
      ["da/draft/proposal.md"]
    );
    assert.includeMembers(diagnosticCodes(catalog), [
      "LegacyMissingStatus",
      "LegacyLifecycleDirectory",
    ]);

    await writeScenario(
      root,
      "da/invalid-internal-status.md",
      scenarioMarkdown("SCN-INTERNAL", "legacy-current")
    );
    await writeScenario(
      root,
      "da/wrong-group.md",
      scenarioMarkdown("SCN-WRONG-GROUP", "approved").replace(
        "- Scenario group: da",
        "- Scenario group: teams-app"
      )
    );
    const invalidCatalog = await scanScenarioDocuments(root);
    assert.includeMembers(diagnosticCodes(invalidCatalog), [
      "InvalidStatus",
      "ScenarioGroupMismatch",
    ]);
  });

  it("parses Markdown metadata prose without interpreting it as YAML", async () => {
    const root = await createScenarioRoot();
    const markdown = scenarioMarkdown("SCN-PROSE", "approved").replace(
      "- Start state: start",
      "- Start state: `.vscode/mcp.json` is open: the server is ready #1"
    );
    await writeScenario(root, "da/prose.md", markdown);

    const catalog = await scanScenarioDocuments(root);

    assert.deepEqual(
      catalog.current.map((scenario) => scenario.relativePath),
      ["da/prose.md"]
    );
    assert.isEmpty(catalog.diagnostics);
  });

  it("keys current template ownership by scaffold kind and template ID", async () => {
    const root = await createScenarioRoot();
    await writeScenario(root, "da/create.md", scenarioMarkdown("SCN-CREATE", "approved"), [
      "shared-id",
    ]);
    await writeScenario(
      root,
      "da/modify.md",
      scenarioMarkdown("SCN-MODIFY", "approved"),
      ["shared-id"],
      "modify"
    );

    const catalog = await scanScenarioDocuments(root);

    assert.notInclude(diagnosticCodes(catalog), "DuplicateCurrentTemplateOwner");
  });

  it("rejects malformed and structurally invalid bindings without exposing source values", async () => {
    const root = await createScenarioRoot();
    const secretMarker = "literal-secret-must-not-escape";
    const malformedPath = path.join(root, "da", "malformed.md");
    const invalidPath = path.join(root, "da", "invalid.md");
    await fs.ensureDir(path.dirname(malformedPath));
    await fs.writeFile(
      malformedPath,
      `${scenarioMarkdown("SCN-MALFORMED", "draft")}## Implementation binding

\`\`\`yaml
version: 1
scaffolding: [${secretMarker}
\`\`\`
`,
      "utf8"
    );
    await fs.writeFile(
      invalidPath,
      `${scenarioMarkdown("SCN-INVALID", "draft")}## Implementation binding

\`\`\`yaml
version: 1
scaffolding:
  kind: create
  templateIds: agent-template
  reviewContexts: []
\`\`\`
`,
      "utf8"
    );

    const catalog = await scanScenarioDocuments(root);

    assert.deepEqual(
      catalog.diagnostics.map((item) => item.code),
      ["InvalidImplementationBinding", "InvalidImplementationBinding"]
    );
    assert.notInclude(JSON.stringify(catalog.diagnostics), secretMarker);
  });

  it("MSA-11: rejects incomplete Markdown contracts and invalid scenario identities", async () => {
    const root = await createScenarioRoot();
    await writeScenario(
      root,
      "da/missing-metadata.md",
      scenarioMarkdown("SCN-MISSING-METADATA", "draft").replace("- Primary goal: create\n", "")
    );
    await writeScenario(
      root,
      "da/missing-section.md",
      scenarioMarkdown("SCN-MISSING-SECTION", "draft").replace("## Surfaces\n\n- VS Code\n\n", "")
    );
    await writeScenario(root, "da/invalid-id.md", scenarioMarkdown("invalid scenario id", "draft"));
    await writeScenario(
      root,
      "da/duplicate-metadata.md",
      scenarioMarkdown("SCN-DUPLICATE-METADATA", "draft").replace(
        "- Primary goal: create",
        "- Primary goal: create\n- Primary goal: extend"
      )
    );
    await writeScenario(
      root,
      "da/duplicate-metadata-section.md",
      `${scenarioMarkdown("SCN-DUPLICATE-METADATA-SECTION", "draft")}## Metadata\n\n- Status: archived\n`
    );
    await writeScenario(
      root,
      "da/empty-metadata-section.md",
      scenarioMarkdown("SCN-EMPTY-METADATA-SECTION", "draft").replace(
        /## Metadata\n\n[\s\S]*?\n## Scenario/,
        "## Metadata\n\n## Scenario"
      )
    );
    await writeScenario(
      root,
      "da/empty-section.md",
      scenarioMarkdown("SCN-EMPTY-SECTION", "draft").replace("- VS Code", "")
    );
    await writeScenario(
      root,
      "da/duplicate-section.md",
      `${scenarioMarkdown("SCN-DUPLICATE-SECTION", "draft")}## Surfaces\n\n- CLI\n`
    );

    const catalog = await scanScenarioDocuments(root);

    assert.includeMembers(diagnosticCodes(catalog), [
      "IncompleteMetadata",
      "MissingRequiredSection",
      "InvalidScenarioId",
      "DuplicateMetadataField",
      "DuplicateMetadataSection",
      "EmptyMetadataSection",
      "EmptyRequiredSection",
      "DuplicateRequiredSection",
    ]);
    assert.notInclude(
      catalog.documents.map((document) => document.relativePath),
      "da/missing-metadata.md"
    );
  });

  it("MSA-11: rejects non-closed bindings and invalid stable identifiers", () => {
    const binding = `## Implementation binding

\`\`\`yaml
version: 1
scaffolding:
  kind: create
  templateIds: [agent-template]
  reviewContexts:
    - id: vscode-default
      surface: vscode
      environmentProfile: vscode-shipped
      featureFlags: {}
      answers: {}
  reviewedFingerprints:
    semantic: pending
    presentation: pending
\`\`\`
`;
    assert.equal(parseScenarioBinding(binding).state, "valid");
    const invalidBindings = [
      binding.replace("version: 1", "version: 1\nunexpected: true"),
      binding.replace("  kind: create", "  kind: create\n  unexpected: true"),
      binding.replace("    semantic: pending", "    semantic: pending\n    unexpected: true"),
      binding.replace(
        "  templateIds: [agent-template]",
        "  templateIds: [agent-template, agent-template]"
      ),
      binding.replace(
        "      answers: {}",
        "      answers: {}\n    - id: vscode-default\n      surface: cli\n      environmentProfile: cli-shipped\n      featureFlags: {}\n      answers: {}"
      ),
      binding.replace("      featureFlags: {}", '      featureFlags: { "": true }'),
      binding.replace("      environmentProfile: vscode-shipped\n", ""),
      binding.replace("    semantic: pending", "    semantic: not-a-fingerprint"),
      `${binding}\n\`\`\`yaml\nversion: 1\nscaffolding: {}\n\`\`\`\n`,
      `${binding}\n## Implementation binding\n\n${binding.split("## Implementation binding\n\n")[1]}`,
    ];

    for (const invalid of invalidBindings) {
      assert.deepEqual(parseScenarioBinding(invalid), { state: "invalid" });
    }
  });

  it("MSA-04: fingerprints normalized semantics separately from English presentation", () => {
    const selectorQuestions: PresentationQuestion[] = [
      {
        name: "projectType",
        title: "Project Type",
        staticOptions: [{ id: "agent", label: "Agent" }],
      },
    ];
    const template: ScaffoldCatalogTemplate = {
      templateId: "agent-template",
      routes: [{ engine: "v4", templateId: "agent-template", when: "projectType == 'agent'" }],
      descriptor: { languages: ["typescript"], id: "agent-template", $schema: "ignored" },
      questions: [
        {
          name: "apiKey",
          type: "text",
          title: "API key",
          password: true,
          condition: { expr: "projectType == 'agent'" },
        },
      ],
      pipeline: { steps: [{ with: { second: "b", first: "a" }, uses: "render" }] },
    };
    const reordered: ScaffoldCatalogTemplate = {
      ...template,
      descriptor: { id: "agent-template", $schema: "different", languages: ["typescript"] },
      pipeline: { steps: [{ uses: "render", with: { first: "a", second: "b" } }] },
    };

    const baseline = fingerprintScaffoldTemplate(template, selectorQuestions);
    const normalized = fingerprintScaffoldTemplate(reordered, selectorQuestions);
    const semanticChange = fingerprintScaffoldTemplate(
      { ...template, routes: [{ ...template.routes[0], when: "projectType == 'other'" }] },
      selectorQuestions
    );
    const presentationChange = fingerprintScaffoldTemplate(template, [
      { ...selectorQuestions[0], title: "Choose a project type" },
    ]);
    const specPathOnlyChange = fingerprintScaffoldTemplate(
      { ...template, descriptor: { ...template.descriptor, spec: "other/spec.json" } },
      selectorQuestions
    );
    const selectorConditionChange = fingerprintScaffoldTemplate(template, [
      { ...selectorQuestions[0], condition: { featureFlag: "NEW_SELECTOR" } },
    ]);

    assert.deepEqual(normalized, baseline);
    assert.notEqual(semanticChange.semantic, baseline.semantic);
    assert.equal(semanticChange.presentation, baseline.presentation);
    assert.equal(presentationChange.semantic, baseline.semantic);
    assert.notEqual(presentationChange.presentation, baseline.presentation);
    assert.equal(specPathOnlyChange.semantic, baseline.semantic);
    assert.notEqual(selectorConditionChange.semantic, baseline.semantic);
  });

  it("MSA-04: includes rendered option icons in presentation fingerprints", () => {
    const selectorQuestions: PresentationQuestion[] = [
      {
        name: "projectType",
        staticOptions: [{ id: "agent", label: "Agent", iconPath: "agent.svg" }],
      },
    ];
    const template: ScaffoldCatalogTemplate = {
      templateId: "agent-template",
      routes: [],
      descriptor: { id: "agent-template" },
      questions: [
        {
          name: "language",
          type: "singleSelect",
          staticOptions: [{ id: "typescript", label: "TypeScript", iconPath: "ts.svg" }],
        },
      ],
      pipeline: { steps: [] },
    };
    const baseline = fingerprintScaffoldTemplate(template, selectorQuestions);
    const selectorIconChange = fingerprintScaffoldTemplate(template, [
      {
        ...selectorQuestions[0],
        staticOptions: [{ id: "agent", label: "Agent", iconPath: "agent-new.svg" }],
      },
    ]);
    const questionIconChange = fingerprintScaffoldTemplate(
      {
        ...template,
        questions: [
          {
            ...template.questions[0],
            staticOptions: [{ id: "typescript", label: "TypeScript", iconPath: "ts-new.svg" }],
          },
        ],
      },
      selectorQuestions
    );

    assert.notEqual(selectorIconChange.presentation, baseline.presentation);
    assert.notEqual(questionIconChange.presentation, baseline.presentation);
  });
});
