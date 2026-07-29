const assert = require("node:assert/strict");
const test = require("node:test");

const { compileCaseBundle } = require("./index.cjs");

const sourceText = `
version: 1

featureFlags:
  - TEAMSFX_MCP_FOR_DA_DT=true

cases:
  - id: remote
    scenarioId: SCN-REMOTE
    steps: [scaffold, deploy, deploy]
  - id: local
    scenarioId: SCN-LOCAL
    gate: manual
    steps: [scaffold, target]

steps:
  scaffold:
    type: scaffold
    with:
      template: weather-agent
      answers:
        - question: projectType
          value: custom-engine-agent-type
  deploy:
    type: deploy
  target:
    type: target
    with:
      profile: Debug in Teams (Chrome)
`;

function createStepCompiler(calls) {
  return ({ caseId, occurrence, stepName, definition }) => {
    calls.push(`${caseId}:${stepName}:${occurrence}`);
    return {
      ok: true,
      value: [
        {
          step_id: `step_${caseId}_${stepName}_${occurrence}`,
          agent: "assertion",
          tool: "",
          parameters: {},
          description: `Compiled ${definition.type}`,
          depends_on: [],
          tags: [],
        },
      ],
    };
  };
}

test("VCB-01: one YAML source deterministically compiles one plan per case", () => {
  const firstCalls = [];
  const secondCalls = [];

  const first = compileCaseBundle({
    sourcePath: "cases/weather.yml",
    sourceText,
    compileStep: createStepCompiler(firstCalls),
  });
  const second = compileCaseBundle({
    sourcePath: "cases/weather.yml",
    sourceText,
    compileStep: createStepCompiler(secondCalls),
  });

  assert.equal(first.ok, true);
  assert.deepEqual(second, first);
  assert.deepEqual(
    first.value.map(({ caseId, fileName, gate, templateId }) => ({
      caseId,
      fileName,
      gate,
      templateId,
    })),
    [
      {
        caseId: "remote",
        fileName: "weather-agent--remote.json",
        gate: "pr",
        templateId: "weather-agent",
      },
      {
        caseId: "local",
        fileName: "weather-agent--local.json",
        gate: "manual",
        templateId: "weather-agent",
      },
    ],
  );
  assert.deepEqual(secondCalls, firstCalls);
  for (const generated of first.value) {
    assert.equal(
      generated.plan.plan_metadata.tags.includes(
        "feature_flag:TEAMSFX_MCP_FOR_DA_DT=true",
      ),
      true,
    );
  }
});

test("VCB-01: generated cases do not share mutable plan or definition state", () => {
  const templates = [];
  const result = compileCaseBundle({
    sourcePath: "cases/weather.yml",
    sourceText,
    compileStep: ({ caseId, definition, occurrence, stepName }) => {
      if (definition.type === "scaffold") {
        templates.push(definition.with.template);
        definition.with.template = caseId;
      }
      return {
        ok: true,
        value: [
          {
            step_id: `step_${caseId}_${stepName}_${occurrence}`,
            agent: "assertion",
            tool: "",
            parameters: {},
            description: "Compiled independently",
            depends_on: [],
            tags: [],
          },
        ],
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(templates, ["weather-agent", "weather-agent"]);
  assert.notEqual(
    result.value[0].plan.plan_metadata.execution_context,
    result.value[1].plan.plan_metadata.execution_context,
  );
  result.value[0].plan.plan_metadata.execution_context.delay_between_steps = 99;
  assert.equal(
    result.value[1].plan.plan_metadata.execution_context.delay_between_steps,
    1,
  );
});

test("VCB-01: adapter-returned steps are isolated between generated cases", () => {
  const sharedStep = {
    step_id: "shared",
    agent: "assertion",
    tool: "",
    parameters: {},
    description: "Shared adapter object",
    depends_on: [],
    tags: [],
  };
  const result = compileCaseBundle({
    sourcePath: "cases/weather.yml",
    sourceText,
    compileStep: () => ({ ok: true, value: [sharedStep] }),
  });

  assert.equal(result.ok, true);
  assert.notEqual(result.value[0].plan.steps[0], result.value[1].plan.steps[0]);
  result.value[0].plan.steps[0].description = "Changed";
  assert.equal(
    result.value[1].plan.steps[0].description,
    "Shared adapter object",
  );
});

test("VCB-02: every case expands exact step references in authored order", () => {
  const calls = [];

  const result = compileCaseBundle({
    sourcePath: "cases/weather.yml",
    sourceText,
    compileStep: createStepCompiler(calls),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    "remote:scaffold:1",
    "remote:deploy:2",
    "remote:deploy:3",
    "local:scaffold:1",
    "local:target:2",
  ]);
  assert.deepEqual(
    result.value.map(({ plan }) => plan.plan_metadata.execution_order),
    [
      [
        "step_remote_scaffold_1",
        "step_remote_deploy_2",
        "step_remote_deploy_3",
      ],
      ["step_local_scaffold_1", "step_local_target_2"],
    ],
  );
});

test("VCB-08 foundation: invalid YAML and closed-schema violations return precise redacted diagnostics", () => {
  const fixtures = [
    {
      code: "VCB_YAML_PARSE",
      source: "version: [",
      yamlPath: "$",
    },
    {
      code: "VCB_VERSION_UNSUPPORTED",
      source: sourceText.replace("version: 1", "version: 2"),
      yamlPath: "$.version",
    },
    {
      code: "VCB_FIELD_UNKNOWN",
      source: `${sourceText}\nextra: top-secret-answer\n`,
      yamlPath: "$.extra",
    },
    {
      code: "VCB_FEATURE_FLAGS_INVALID",
      source: sourceText.replace(
        "TEAMSFX_MCP_FOR_DA_DT=true",
        "teamsfx_mcp_for_da_dt=enabled",
      ),
      yamlPath: "$.featureFlags",
    },
    {
      code: "VCB_FEATURE_FLAGS_INVALID",
      source: sourceText.replace(
        "  - TEAMSFX_MCP_FOR_DA_DT=true",
        "  - TEAMSFX_MCP_FOR_DA_DT=true\n  - TEAMSFX_MCP_FOR_DA_DT=true",
      ),
      yamlPath: "$.featureFlags",
    },
    {
      code: "VCB_CASE_ID_DUPLICATE",
      source: sourceText.replace("id: local", "id: remote"),
      yamlPath: "$.cases[1].id",
    },
    {
      code: "VCB_STEP_REFERENCE_UNKNOWN",
      source: sourceText.replace(
        "steps: [scaffold, target]",
        "steps: [scaffold, missing]",
      ),
      yamlPath: "$.cases[1].steps[1]",
    },
  ];

  for (const fixture of fixtures) {
    let compileCalls = 0;
    const result = compileCaseBundle({
      sourcePath: "cases/invalid.yml",
      sourceText: fixture.source,
      compileStep: () => {
        compileCalls += 1;
        return { ok: true, value: [] };
      },
    });

    assert.equal(result.ok, false, fixture.code);
    assert.equal(compileCalls, 0, fixture.code);
    assert.ok(
      result.diagnostics.some(
        ({ code, sourcePath, yamlPath }) =>
          code === fixture.code &&
          sourcePath === "cases/invalid.yml" &&
          yamlPath === fixture.yamlPath,
      ),
      fixture.code,
    );
    assert.doesNotMatch(
      JSON.stringify(result.diagnostics),
      /top-secret-answer/,
    );
  }
});

test("VCB-08 foundation: hostile aliases and inherited step names return diagnostics", () => {
  const aliasSource = `
version: 1
cases: &cases
  - &case
    id: alias
    scenarioId: SCN-ALIAS
    steps: [scaffold]
copies: &copies [*cases, *cases, *cases, *cases, *cases, *cases, *cases, *cases, *cases, *cases]
more: [*copies, *copies, *copies, *copies, *copies, *copies, *copies, *copies, *copies, *copies]
steps:
  scaffold:
    type: scaffold
    with:
      template: weather-agent
      answers: []
`;
  const inheritedReferenceSource = sourceText.replace(
    "steps: [scaffold, target]",
    "steps: [scaffold, toString]",
  );

  assert.doesNotThrow(() =>
    compileCaseBundle({
      sourcePath: "cases/aliases.yml",
      sourceText: aliasSource,
      compileStep: () => ({ ok: true, value: [] }),
    }),
  );
  const aliasResult = compileCaseBundle({
    sourcePath: "cases/aliases.yml",
    sourceText: aliasSource,
    compileStep: () => ({ ok: true, value: [] }),
  });
  assert.equal(aliasResult.ok, false);
  assert.ok(
    aliasResult.diagnostics.some(
      ({ code, yamlPath }) => code === "VCB_YAML_UNSAFE" && yamlPath === "$",
    ),
  );

  const inheritedResult = compileCaseBundle({
    sourcePath: "cases/inherited.yml",
    sourceText: inheritedReferenceSource,
    compileStep: () => ({ ok: true, value: [] }),
  });
  assert.equal(inheritedResult.ok, false);
  assert.ok(
    inheritedResult.diagnostics.some(
      ({ code, yamlPath, message }) =>
        code === "VCB_STEP_REFERENCE_UNKNOWN" &&
        yamlPath === "$.cases[1].steps[1]" &&
        !message.includes("toString"),
    ),
  );
});

test("VCB-13: every case has one scaffold and one source has one template", () => {
  const fixtures = [
    {
      code: "VCB_CASE_SCAFFOLD_COUNT",
      source: sourceText.replace(
        "steps: [scaffold, target]",
        "steps: [target]",
      ),
      yamlPath: "$.cases[1].steps",
    },
    {
      code: "VCB_CASE_SCAFFOLD_COUNT",
      source: sourceText.replace(
        "steps: [scaffold, target]",
        "steps: [scaffold, scaffold, target]",
      ),
      yamlPath: "$.cases[1].steps",
    },
    {
      code: "VCB_SOURCE_TEMPLATE_CONFLICT",
      source: `${sourceText.replace(
        "steps: [scaffold, target]",
        "steps: [scaffold-other, target]",
      )}
  scaffold-other:
    type: scaffold
    with:
      template: da/no-action
      answers:
        - question: projectType
          value: copilot-agent-type
`,
      yamlPath: "$.steps.scaffold-other.with.template",
    },
  ];

  for (const fixture of fixtures) {
    let compileCalls = 0;
    const result = compileCaseBundle({
      sourcePath: "cases/scaffold-invalid.yml",
      sourceText: fixture.source,
      compileStep: () => {
        compileCalls += 1;
        return { ok: true, value: [] };
      },
    });

    assert.equal(result.ok, false, fixture.code);
    assert.equal(compileCalls, 0, fixture.code);
    assert.ok(
      result.diagnostics.some(
        ({ code, yamlPath }) =>
          code === fixture.code && yamlPath === fixture.yamlPath,
      ),
      fixture.code,
    );
  }
});

test("VCB-13: normalized output filenames are non-empty and unique before composition", () => {
  const collisionSource = sourceText.replace("id: local", 'id: "REMOTE"');
  const emptySegmentSource = sourceText.replace("id: local", 'id: "---"');

  for (const [source, code, yamlPath] of [
    [collisionSource, "VCB_OUTPUT_PATH_COLLISION", "$.cases[1].id"],
    [emptySegmentSource, "VCB_OUTPUT_PATH_INVALID", "$.cases[1].id"],
  ]) {
    let compileCalls = 0;
    const result = compileCaseBundle({
      sourcePath: "cases/output-invalid.yml",
      sourceText: source,
      compileStep: () => {
        compileCalls += 1;
        return { ok: true, value: [] };
      },
    });

    assert.equal(result.ok, false);
    assert.equal(compileCalls, 0);
    assert.ok(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === code && diagnostic.yamlPath === yamlPath,
      ),
    );
  }
});
