const assert = require("node:assert/strict");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const casesDirectory = path.join(__dirname, "..", "cases");
const componentsDirectory = path.join(__dirname, "..", "components");
const nodeModulesDirectory = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "node_modules",
);
const allowedEngineModules = new Set(
  [
    "compile-case-bundle.cjs",
    "diagnostics.cjs",
    "expand-case-bundle.cjs",
    "load-case-sources.cjs",
    "parse-case-bundle.cjs",
    "preflight-output-paths.cjs",
    "render-component.cjs",
    "render-plan-diff.cjs",
    "semantic-step-compiler.cjs",
    "setup-generated-plans.cjs",
    "validate-case-bundle.cjs",
    "write-generated-plans.cjs",
  ].map((fileName) => path.join(__dirname, fileName)),
);

function compileCaseBundle(options) {
  return require("./compile-case-bundle.cjs").compileCaseBundle(options);
}

function createSemanticStepCompiler() {
  return require("./semantic-step-compiler.cjs").createSemanticStepCompiler();
}

function setupGeneratedPlans(options) {
  return require("./setup-generated-plans.cjs").setupGeneratedPlans(options);
}

function isWithin(filePath, directory) {
  const relativePath = path.relative(directory, path.resolve(String(filePath)));
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

async function compileFixture(fileName, transform) {
  const sourceText = await fs.readFile(
    path.join(casesDirectory, fileName),
    "utf8",
  );
  return compileCaseBundle({
    compileStep: createSemanticStepCompiler(),
    sourcePath: `cases/${fileName}`,
    sourceText: transform(sourceText),
  });
}

test("VCB-128: numeric work item IDs remain distinct from scenario metadata", () => {
  const sourceText = `version: 1
cases:
  - id: remote
    scenarioId: SCN-REMOTE
    workItemIds: [1001, 1002]
    steps: [scaffold]
steps:
  scaffold:
    type: scaffold
    with:
      template: weather-agent
      answers: []
`;
  const compileStep = () => ({
    ok: true,
    value: [
      {
        step_id: "step_scaffold",
        agent: "assertion",
        tool: "",
        parameters: {},
        description: "Compiled scaffold",
        depends_on: [],
        tags: [],
      },
    ],
  });
  const result = compileCaseBundle({
    sourcePath: "cases/work-items.yml",
    sourceText,
    compileStep,
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.value[0].plan.plan_metadata.description.workitem,
    "1001,1002",
  );
  assert.equal(
    result.value[0].plan.plan_metadata.tags.includes("scenario_id:SCN-REMOTE"),
    true,
  );

  for (const invalidWorkItemIds of [
    undefined,
    "[]",
    "[0]",
    "[-1]",
    "[1.5]",
    "[9007199254740992]",
    "[1001, 1001]",
    '["1001"]',
  ]) {
    const invalid = compileCaseBundle({
      sourcePath: "cases/work-items.yml",
      sourceText: sourceText.replace(
        "    workItemIds: [1001, 1002]\n",
        invalidWorkItemIds === undefined
          ? ""
          : `    workItemIds: ${invalidWorkItemIds}\n`,
      ),
      compileStep,
    });
    const label = invalidWorkItemIds ?? "missing";
    assert.equal(invalid.ok, false, label);
    assert.ok(
      invalid.diagnostics.some(
        ({ code, yamlPath }) =>
          code === "VCB_WORK_ITEM_IDS_INVALID" &&
          yamlPath === "$.cases[0].workItemIds",
      ),
      label,
    );
  }
});

test("VCB-34: semantic compiler does not read external template contracts", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-contract-reads-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));

  const originalReadFileSync = fsSync.readFileSync;
  const originalReadFile = fs.readFile;
  const readPaths = [];
  fsSync.readFileSync = (filePath, ...args) => {
    readPaths.push(path.resolve(String(filePath)));
    return originalReadFileSync(filePath, ...args);
  };
  fs.readFile = async (filePath, ...args) => {
    readPaths.push(path.resolve(String(filePath)));
    return originalReadFile(filePath, ...args);
  };

  try {
    const result = await setupGeneratedPlans({
      onDiff: () => {},
      plansDirectory,
    });
    assert.equal(result.ok, true);
  } finally {
    fsSync.readFileSync = originalReadFileSync;
    fs.readFile = originalReadFile;
  }

  assert.equal(readPaths.length > 0, true);
  for (const readPath of readPaths) {
    assert.equal(
      allowedEngineModules.has(readPath) ||
        isWithin(readPath, nodeModulesDirectory) ||
        [casesDirectory, componentsDirectory, plansDirectory].some(
          (directory) => isWithin(readPath, directory),
        ),
      true,
      `Unexpected compiler read: ${readPath}`,
    );
  }
});

test("VCB-34: default setup compiles the checked-in YAML sources into 185 plans", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));

  const diffs = [];
  const first = await setupGeneratedPlans({
    onDiff: (diff) => diffs.push(diff),
    plansDirectory,
  });

  assert.equal(first.ok, true);
  assert.equal(first.value.files.length, 185);
  const generatedFiles = first.value.files;
  assert.equal(generatedFiles.length, 185);
  assert.equal(
    generatedFiles.includes(
      "da-api-plugin-from-existing-api--da-api-plugin-from-existing-api-no-auth.json",
    ),
    false,
  );

  for (const fileName of generatedFiles) {
    const plan = JSON.parse(
      await fs.readFile(path.join(plansDirectory, fileName), "utf8"),
    );
    assert.equal(plan.plan_metadata.version, "1.1");
    assert.equal(plan.plan_metadata.total_steps, plan.steps.length);
    assert.deepEqual(
      plan.plan_metadata.execution_order,
      plan.steps.map((step) => step.step_id),
    );
    assert.equal(
      new Set(plan.plan_metadata.execution_order).size,
      plan.steps.length,
    );
  }

  const secondDiffs = [];
  const second = await setupGeneratedPlans({
    onDiff: (diff) => secondDiffs.push(diff),
    plansDirectory,
  });
  assert.equal(second.ok, true);
  assert.equal(second.value.diff, "");
  assert.deepEqual(secondDiffs, [""]);
  assert.equal(diffs.length, 1);
});

test("generated plans define app_name before reading it", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));

  const result = await setupGeneratedPlans({
    onDiff: () => {},
    plansDirectory,
  });

  assert.equal(result.ok, true);
  for (const fileName of result.value.files) {
    const planText = await fs.readFile(
      path.join(plansDirectory, fileName),
      "utf8",
    );
    const firstReference = planText.indexOf("${{var:app_name");
    assert.notEqual(firstReference, -1, fileName);
    assert.equal(
      planText
        .slice(firstReference)
        .startsWith("${{var:app_name:vscuse_app_#####}}"),
      true,
      fileName,
    );
  }
});

test("scaffold focuses the toolkit view before the create command", async () => {
  const result = await compileFixture(
    "da-no-action.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const descriptions = result.value[0].plan.steps.map(
    (step) => step.description,
  );
  const focusIndex = descriptions.indexOf(
    "@assertion the Command Palette input box reads >Microsoft 365 Agents Toolkit: Focus on Microsoft 365 Agents Toolkit View and the highlighted command listed under it is titled Microsoft 365 Agents Toolkit: Focus on Microsoft 365 Agents Toolkit View.",
  );
  const settledIndex = descriptions.indexOf(
    "@assertion the Microsoft 365 Agents Toolkit view is open in the side bar and an editor tab labeled Welcome showing the Build a Declarative Agent walkthrough is open in the editor area.",
  );
  const createIndex = descriptions.indexOf(
    "@assertion the Command Palette input box reads >Microsoft 365 Agents: Create New Agent/App and the highlighted command listed under it is titled Microsoft 365 Agents: Create New Agent/App.",
  );
  const firstQuestionIndex = descriptions.indexOf(
    "@assertion the active prompt titled New Project is visible.",
  );

  assert.equal(focusIndex >= 0, true);
  assert.equal(focusIndex < settledIndex, true);
  assert.equal(settledIndex < createIndex, true);
  assert.equal(createIndex < firstQuestionIndex, true);
});

test("VCB-41: scaffold closes the Welcome editor before the create command", async () => {
  const result = await compileFixture(
    "da-no-action.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const descriptions = result.value[0].plan.steps.map(
    (step) => step.description,
  );
  const settledIndex = descriptions.indexOf(
    "@assertion the Microsoft 365 Agents Toolkit view is open in the side bar and an editor tab labeled Welcome showing the Build a Declarative Agent walkthrough is open in the editor area.",
  );
  const closeIndex = descriptions.indexOf(
    "Press Ctrl+W to close the Welcome editor tab.",
  );
  const closedIndex = descriptions.indexOf(
    "@assertion no editor tab is open in the Visual Studio Code editor area.",
  );
  const createIndex = descriptions.indexOf(
    "@assertion the Command Palette input box reads >Microsoft 365 Agents: Create New Agent/App and the highlighted command listed under it is titled Microsoft 365 Agents: Create New Agent/App.",
  );

  // The settled assertion guarantees the editor exists, so Ctrl+W targets it
  // instead of closing the window.
  assert.equal(settledIndex >= 0, true);
  assert.equal(settledIndex < closeIndex, true);
  assert.equal(closeIndex < closedIndex, true);
  assert.equal(closedIndex < createIndex, true);
});

test("VCB-42: login shows the side bar before the sign-in adapter runs", async () => {
  const result = await compileFixture(
    "da-api-plugin-from-scratch.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const descriptions = result.value[0].plan.steps.map(
    (step) => step.description,
  );
  const entryIndex = descriptions.findIndex((description) =>
    /^@assertion the ACCOUNTS section of the side bar lists an entry/.test(
      description,
    ),
  );
  const showIndex = descriptions.findLastIndex(
    (description, index) =>
      index < entryIndex &&
      description ===
        "@assertion the Command Palette input box reads >View: Show Microsoft 365 Agents Toolkit and the highlighted command listed under it is titled View: Show Microsoft 365 Agents Toolkit.",
  );
  const createIndex = descriptions.indexOf(
    "@assertion the Command Palette input box reads >Microsoft 365 Agents: Create New Agent/App and the highlighted command listed under it is titled Microsoft 365 Agents: Create New Agent/App.",
  );
  const readinessIndex = descriptions.findIndex(
    (description, index) =>
      index > entryIndex &&
      description.includes('the "ACCOUNTS" section lists'),
  );

  // The side bar step must belong to the login block, not to the scaffold block
  // that ran in the window scaffolding replaced.
  assert.equal(entryIndex >= 0, true);
  assert.equal(createIndex < showIndex, true);
  assert.equal(showIndex < entryIndex, true);
  assert.equal(entryIndex < readinessIndex, true);
});

test("VCB-53: no login step selects a palette result by position", async () => {
  const result = await compileFixture(
    "da-api-plugin-from-scratch.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const steps = result.value[0].plan.steps;

  for (const step of steps) {
    assert.equal(/the second result/.test(step.description), false);
    assert.equal(/selectSecond/.test(step.step_id), false);
  }
});

test("VCB-54: login opens the side bar with the container show command", async () => {
  const result = await compileFixture(
    "da-api-plugin-from-scratch.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const steps = result.value[0].plan.steps;

  // Two logins share one case, and each one shows the container that renders
  // the ACCOUNTS section before its adapter clicks a sign-in entry.
  const showFilters = steps.filter(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "View: Show Microsoft 365 Agents Toolkit",
  );
  assert.equal(showFilters.length, 2);

  for (const step of steps) {
    assert.equal(/Focus on Accounts View/.test(step.description), false);
  }
});

test("VCB-57: login enters from the ACCOUNTS section, not the palette", async () => {
  const result = await compileFixture(
    "da-api-plugin-from-scratch.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const steps = result.value[0].plan.steps;

  // Every word of `Microsoft 365 Agents: Accounts` is also a word of the
  // `Microsoft 365 Agents Toolkit: Focus on Accounts View` command VS Code
  // generates from the ACCOUNTS view, in the same order, so no filter text
  // lists one without the other and the highlighted result is VS Code's choice.
  for (const step of steps) {
    assert.equal(
      /Microsoft 365 Agents: Accounts/.test(step.parameters.text ?? ""),
      false,
    );
    assert.equal(
      /Microsoft 365 Agents: Accounts/.test(step.description),
      false,
    );
  }

  // Both logins enter from the labelled entry the ACCOUNTS section renders.
  const entrySteps = steps.filter((step) =>
    /^@assertion the ACCOUNTS section of the side bar lists an entry/.test(
      step.description,
    ),
  );
  assert.equal(entrySteps.length, 2);
});

test("DA scaffold filters its options before app name", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));

  const result = await setupGeneratedPlans({
    onDiff: () => {},
    plansDirectory,
  });
  assert.equal(result.ok, true);

  const plan = JSON.parse(
    await fs.readFile(
      path.join(
        plansDirectory,
        "da-no-action--da-no-action-remote-preview.json",
      ),
      "utf8",
    ),
  );
  const optionLabels = ["Declarative Agent", "No Action"];
  const optionIndexes = optionLabels.map((label) =>
    plan.steps.findIndex(
      (step) =>
        step.tool === "type_text" &&
        step.description ===
          `Type the resolved option label ${label} into the active single-select prompt.`,
    ),
  );
  const appNameIndex = plan.steps.findIndex(
    (step) => step.parameters.text === "${{var:app_name:vscuse_app_#####}}",
  );
  const workspaceFolderIndex = plan.steps.findIndex(
    (step) =>
      step.tool === "key_press" &&
      step.parameters.key === "enter" &&
      step.description === "Press Enter to confirm the Default folder option.",
  );

  assert.deepEqual(
    optionIndexes.every((index) => index >= 0),
    true,
  );
  assert.deepEqual(
    optionIndexes,
    [...optionIndexes].sort((left, right) => left - right),
  );
  assert.equal(optionIndexes.at(-1) < workspaceFolderIndex, true);
  assert.equal(workspaceFolderIndex < appNameIndex, true);
});

test("VCB-105: New API auth IDs resolve to their visible labels", async () => {
  for (const [optionId, optionLabel] of [
    ["api-key", "API Key"],
    ["microsoft-entra", "Microsoft Entra"],
    ["oauth", "OAuth"],
  ]) {
    const result = await compileFixture(
      "da-api-plugin-from-scratch.yml",
      (sourceText) => sourceText.replace("value: none", `value: ${optionId}`),
    );

    assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
    const typedValues = result.value[0].plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    assert.equal(typedValues.includes(optionLabel), true, optionId);
  }
});

test("VCB-91: Teams Other scaffolds resolve the complete authored selector path", async () => {
  for (const { caseId, optionLabel, template } of [
    {
      caseId: "simple-bot-ts",
      optionLabel: "Simple Bot",
      template: "default-bot",
    },
    {
      caseId: "message-extension-ts",
      optionLabel: "Message Extension",
      template: "default-message-extension",
    },
  ]) {
    const sourceText = `version: 1
cases:
  - id: ${caseId}
    scenarioId: VCB-91
    workItemIds: [1001]
    steps: [scaffold, check]
steps:
  scaffold:
    type: scaffold
    with:
      template: ${template}
      answers:
        - question: projectType
          value: teams-agent-and-app-type
        - question: teamsAppType
          value: teams-other-app-type
        - question: teamsOtherAppType
          value: ${template}
        - question: language
          value: typescript
        - question: workspaceFolder
          value: default
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: m365agents.yml
        expect:
          exists: true
`;
    const result = await compileCaseBundle({
      compileStep: createSemanticStepCompiler(),
      sourcePath: `cases/${template}.yml`,
      sourceText,
    });

    assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
    const typedValues = result.value[0].plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    const selectorIndexes = [
      "Teams Agents and Apps",
      "Other Teams Capabilities",
      optionLabel,
    ].map((label) => typedValues.indexOf(label));
    assert.equal(
      selectorIndexes.every((index) => index >= 0),
      true,
      template,
    );
    assert.deepEqual(
      selectorIndexes,
      [...selectorIndexes].sort((left, right) => left - right),
      template,
    );
  }
});

test("scaffold app names require a safe app_name initializer expression", async () => {
  const unsafeValues = [
    "literal-name",
    "${{var:app_name:../../outside}}",
    "${{var:app_name:folder/name}}",
    "${{var:app_name:folder\\\\name}}",
  ];

  for (const unsafeValue of unsafeValues) {
    const result = await compileFixture("da-no-action.yml", (sourceText) =>
      sourceText.replace(
        '"${{var:app_name:vscuse_app_#####}}"',
        JSON.stringify(unsafeValue),
      ),
    );

    assert.equal(result.ok, false, unsafeValue);
    assert.equal(
      result.diagnostics[0].code,
      "VCB_APP_NAME_EXPRESSION_REQUIRED",
      unsafeValue,
    );
  }
});

test("scaffold requires an app_name initializer answer", async () => {
  const result = await compileFixture("da-no-action.yml", (sourceText) =>
    sourceText.replace(
      /        - question: appName\n          type: text\n          value: "\$\{\{var:app_name:vscuse_app_#####\}\}"\n/,
      "",
    ),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_APP_NAME_EXPRESSION_REQUIRED");
});

test("MCP cases verify every dynamic discovery output", async () => {
  const result = await compileFixture(
    "da-mcp-server.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  for (const generated of result.value) {
    const assertions = generated.plan.steps.flatMap((step) => {
      const match = step.parameters.sample?.match(/ASSERTIONS_B64="([^"]+)"/);
      return match === undefined
        ? []
        : JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
    });
    const assertionByPath = new Map(
      assertions.map((assertion) => [assertion.path, assertion]),
    );
    const expectedUrl = generated.caseId.includes("none")
      ? "https://learn.microsoft.com/api/mcp"
      : "https://api.githubcopilot.com/mcp/";

    assert.equal(
      assertionByPath
        .get("appPackage/ai-plugin.json")
        ?.contains.includes('"functions": []'),
      true,
      generated.caseId,
    );
    assert.deepEqual(
      assertionByPath.get("appPackage/declarativeAgent.json")?.contains,
      ['"id": "action_1"', '"file": "ai-plugin.json"'],
      generated.caseId,
    );
    assert.equal(
      assertionByPath.get(".vscode/mcp.json")?.contains.includes(expectedUrl),
      true,
      generated.caseId,
    );
  }
});

test("VCB-34: DA API plugin from scratch compiles complete remote branches in authored order", async () => {
  const result = await compileFixture(
    "da-api-plugin-from-scratch.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.length, 4);
  const remoteCases = result.value.filter(
    (generated) => !generated.caseId.endsWith("-local-copilot"),
  );
  assert.equal(remoteCases.length, 2);
  for (const generated of remoteCases) {
    const descriptions = generated.plan.steps.map((step) => step.description);
    const language = generated.caseId.endsWith("-ts")
      ? "TypeScript"
      : "JavaScript";
    const authoredOptions = [
      "@assertion the option Declarative Agent is visible and selectable in the filtered single-select prompt.",
      "@assertion the option Add an Action is visible and selectable in the filtered single-select prompt.",
      "@assertion the option Start with a New API is visible and selectable in the filtered single-select prompt.",
      "@assertion the option None is visible and selectable in the filtered single-select prompt.",
      `@assertion the option ${language} is visible and selectable in the filtered single-select prompt.`,
      "Press Enter to confirm the Default folder option.",
    ];
    const optionIndexes = authoredOptions.map((description) =>
      descriptions.indexOf(description),
    );
    assert.equal(
      optionIndexes.every((index) => index >= 0),
      true,
    );
    assert.deepEqual(
      optionIndexes,
      [...optionIndexes].sort((left, right) => left - right),
    );
    const runtimeFlow = [
      "@assertion a visible Visual Studio Code notification contains the literal text provision stage executed successfully. A notification with different text, including an in-progress notification, does not satisfy this assertion.",
      'Click the "Message" input box in the Microsoft 365 Copilot web application.',
      "@assertion the Copilot action-consent Allow button is visible.",
      'Click the "Allow" button in the Microsoft 365 Copilot chat interface to grant the agent access.',
      "@assertion the Copilot action-consent Allow button is no longer visible.",
      '@assertion the current assistant response contains "Oil change".',
    ];
    const runtimeIndexes = runtimeFlow.map((description) =>
      descriptions.indexOf(description),
    );
    assert.equal(
      runtimeIndexes.every((index) => index >= 0),
      true,
      generated.caseId,
    );
    assert.deepEqual(
      runtimeIndexes,
      [...runtimeIndexes].sort((left, right) => left - right),
    );
    assert.equal(
      generated.plan.plan_metadata.tags.includes("gate:manual"),
      true,
    );
  }
});

test("VCB-35: multi-select answers check every option and confirm once", async () => {
  const valid = await compileFixture(
    "da-api-plugin-from-existing-api.yml",
    (sourceText) => sourceText,
  );

  assert.equal(valid.ok, true);
  assert.equal(valid.value.length, 4);
  for (const generated of valid.value) {
    const descriptions = generated.plan.steps.map((step) => step.description);
    const tools = generated.plan.steps.map((step) => step.tool);
    const multiSelectFlow = [
      "@assertion the multi-select prompt titled Select Operation(s) Copilot Can Interact with has finished loading and lists at least one selectable option: an option row with a text label beside a square selection control. The selection-count badge reports how many options are selected, not how many options are available.",
      "Move focus from the multi-select input box to the select-all checkbox of the prompt.",
      "Press Space to check every option of the multi-select prompt.",
      "Move focus from the select-all checkbox back to the multi-select input box.",
      "Press Enter to confirm the multi-select prompt.",
    ];
    const flowIndexes = multiSelectFlow.map((description) =>
      descriptions.indexOf(description),
    );
    assert.equal(
      flowIndexes.every((index) => index >= 0),
      true,
    );
    assert.deepEqual(
      flowIndexes,
      [...flowIndexes].sort((left, right) => left - right),
    );
    assert.equal(
      descriptions.filter(
        (description) =>
          description === "Press Enter to confirm the multi-select prompt.",
      ).length,
      1,
    );
    assert.equal(tools.includes("hotkey"), false);
  }

  for (const value of ['["GET /repairs"]', "none", '""']) {
    const invalid = await compileFixture(
      "da-api-plugin-from-existing-api.yml",
      (sourceText) => sourceText.replace("value: all", `value: ${value}`),
    );
    assert.equal(invalid.ok, false);
    assert.equal(
      [
        "VCB_SCAFFOLD_ANSWER_TYPE",
        "VCB_SCAFFOLD_MULTI_SELECT_ALL_REQUIRED",
      ].includes(invalid.diagnostics[0].code),
      true,
    );
  }
});

test("VCB-85: existing API registration credentials are prompted only during provision", async () => {
  const result = await compileFixture(
    "da-api-plugin-from-existing-api.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const plansByCase = new Map(
    result.value.map((generated) => [generated.caseId, generated.plan]),
  );
  const variants = [
    {
      caseId: "da-api-plugin-from-existing-api-api-key-remote-preview",
      credentialValues: ["${{secret:EXISTING_API_KEY}}"],
      url: "https://raw.githubusercontent.com/SLdragon/example-openapi-spec/refs/heads/main/real-custom-api-key.yaml",
    },
    {
      caseId: "da-api-plugin-from-existing-api-bearer-remote-preview",
      credentialValues: ["${{secret:EXISTING_API_BEARER_TOKEN}}"],
      url: "https://raw.githubusercontent.com/SLdragon/example-openapi-spec/refs/heads/main/real-bearer.yaml",
    },
    {
      caseId: "da-api-plugin-from-existing-api-oauth-remote-preview",
      credentialValues: [
        "${{env:EXISTING_API_OAUTH_CLIENT_ID}}",
        "${{secret:EXISTING_API_OAUTH_CLIENT_SECRET}}",
      ],
      url: "https://raw.githubusercontent.com/SLdragon/example-openapi-spec/refs/heads/main/real-oauth.yaml",
    },
  ];

  for (const { caseId, credentialValues, url } of variants) {
    const plan = plansByCase.get(caseId);
    assert.notEqual(plan, undefined, caseId);
    const typedValues = plan.steps.map((step) => step.parameters.text);
    assert.equal(typedValues.includes(url), true, caseId);
    const targetSelectionIndex = plan.steps.findIndex(
      (step) =>
        step.description ===
        "Press Enter to confirm the highlighted filtered option.",
    );
    assert.equal(targetSelectionIndex >= 0, true, caseId);
    for (const value of credentialValues) {
      const credentialIndices = typedValues.flatMap((typedValue, index) =>
        typedValue === value ? [index] : [],
      );
      assert.deepEqual(credentialIndices.length, 1, caseId);
      assert.equal(credentialIndices[0] < targetSelectionIndex, true, caseId);
    }
    assert.match(
      plan.steps[targetSelectionIndex + 1].step_id,
      /step_browserM365SignIn_refreshPage/,
      caseId,
    );
    assert.match(
      plan.steps[targetSelectionIndex + 2].step_id,
      /step_browserM365SignIn_assertAccount/,
      caseId,
    );
  }

  const oauthPlan = plansByCase.get(
    "da-api-plugin-from-existing-api-oauth-remote-preview",
  );
  const oauthDescriptions = oauthPlan.steps.map((step) => step.description);
  const environmentIndex = oauthDescriptions.indexOf(
    "Click the dev option in the active prompt.",
  );
  const clientIdIndex = oauthPlan.steps.findIndex(
    (step) => step.parameters.text === "${{env:EXISTING_API_OAUTH_CLIENT_ID}}",
  );
  const clientSecretIndex = oauthPlan.steps.findIndex(
    (step) =>
      step.parameters.text === "${{secret:EXISTING_API_OAUTH_CLIENT_SECRET}}",
  );
  const confirmationIndex = oauthDescriptions.findIndex((description) =>
    description.includes("uploads the client ID/Secret"),
  );
  const readinessIndex = oauthDescriptions.findIndex((description) =>
    description.includes("shows an agent's chat open"),
  );
  const targetSelectionIndex = oauthDescriptions.findIndex((description) =>
    description.includes("confirm the highlighted filtered option"),
  );
  const signInIndex = oauthDescriptions.indexOf(
    "@assertion a visible browser element has role button and an accessible name that starts with Sign in to.",
  );
  assert.equal(environmentIndex < clientIdIndex, true);
  assert.equal(clientIdIndex < clientSecretIndex, true);
  assert.equal(clientSecretIndex < confirmationIndex, true);
  assert.equal(confirmationIndex < targetSelectionIndex, true);
  assert.equal(readinessIndex >= 0, true);
  assert.equal(readinessIndex < signInIndex, true);
});

test("VCB-86: Copilot browser authentication preserves the launch deep link", async () => {
  const result = await compileFixture(
    "da-api-plugin-from-existing-api.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  for (const generated of result.value) {
    const confirmationIndex = generated.plan.steps.findIndex((step) =>
      step.step_id.startsWith("step_browserM365SignIn_confirmStaySignedIn_"),
    );
    assert.equal(confirmationIndex >= 0, true, generated.caseId);
    assert.equal(
      generated.plan.steps
        .slice(confirmationIndex + 1)
        .some((step) => step.parameters.key === "f5"),
      false,
      generated.caseId,
    );
  }
});

test("VCB-87: a Copilot target zooms the viewport out once after the readiness assertion", async () => {
  const result = await compileFixture(
    "da-api-plugin-from-existing-api.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  for (const generated of result.value) {
    const steps = generated.plan.steps;
    const readyIndex = steps.findIndex((step) =>
      step.step_id.includes("assertReady_assertReady"),
    );
    assert.equal(readyIndex >= 0, true, generated.caseId);
    assert.match(
      steps[readyIndex + 1].step_id,
      /step_zoomOut_zoomOut/,
      generated.caseId,
    );
    assert.equal(
      steps[readyIndex + 1].tool,
      "keyboard_shortcut",
      generated.caseId,
    );
    assert.equal(
      steps[readyIndex + 1].parameters.keys,
      "ctrl+-",
      generated.caseId,
    );
    assert.equal(
      steps.filter((step) => step.parameters.keys === "ctrl+-").length,
      1,
      generated.caseId,
    );
  }
});

test("VCB-87: a Teams target never zooms the viewport out", async () => {
  const result = await compileFixture(
    "weather-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  for (const generated of result.value.filter((candidate) =>
    candidate.caseId.endsWith("-teams"),
  )) {
    assert.equal(
      generated.plan.steps.some((step) => step.parameters.keys === "ctrl+-"),
      false,
      generated.caseId,
    );
  }
});

test("VCB-89: action consent closes on the Allow button, not on the prompt", async () => {
  const result = await compileFixture(
    "da-api-plugin-from-existing-api.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const oauth = result.value.find((candidate) =>
    candidate.caseId.endsWith("-oauth-remote-preview"),
  );
  const dismissed = oauth.plan.steps.find((step) =>
    step.step_id.includes("allowCopilotAction_assertDismissed"),
  );
  const click = oauth.plan.steps.find((step) =>
    step.step_id.includes("allowCopilotAction_click"),
  );

  assert.deepEqual(click.parameters, { button: "left", x: 333, y: 327 });
  assert.equal(click.tags.includes("ocr:true"), true);
  assert.equal(
    dismissed.description,
    "@assertion the Copilot action-consent Allow button is no longer visible.",
  );
  assert.equal(
    dismissed.tags.includes("exit_state:action-consent-dismissed"),
    true,
  );
  assert.equal(
    dismissed.tags.some((tag) =>
      tag.startsWith("exit_state:assistant-response"),
    ),
    false,
  );
});

test("existing API remote previews reach the Copilot action consent", async () => {
  const result = await compileFixture(
    "da-api-plugin-from-existing-api.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const plansByCase = new Map(
    result.value.map((generated) => [generated.caseId, generated.plan]),
  );
  // Only the no-auth variant reaches a repair service this repository can call,
  // so it is the only one that reads the answer.
  const responseStepsByCase = [
    ["da-api-plugin-from-existing-api-no-auth-remote-preview", 2],
    ["da-api-plugin-from-existing-api-api-key-remote-preview", 0],
    ["da-api-plugin-from-existing-api-bearer-remote-preview", 0],
  ];

  for (const [caseId, responseSteps] of responseStepsByCase) {
    const plan = plansByCase.get(caseId);
    assert.notEqual(plan, undefined, caseId);
    assert.equal(
      plan.steps.filter(
        (step) =>
          step.tool === "type_text" &&
          step.parameters.text ===
            "show repair records assigned to karin blair",
      ).length,
      1,
      caseId,
    );
    assert.equal(
      plan.steps.some((step) =>
        step.description.includes("action-consent Allow button"),
      ),
      true,
      caseId,
    );
    assert.equal(
      plan.steps.filter((step) =>
        step.tags.includes("action:assert-chat-response"),
      ).length,
      responseSteps,
      caseId,
    );
  }
});

test("existing API provision credentials require protected expressions", async () => {
  const invalidApiKey = await compileFixture(
    "da-api-plugin-from-existing-api.yml",
    (sourceText) =>
      sourceText.replace(
        'apiKey: "${{secret:EXISTING_API_KEY}}"',
        "apiKey: plaintext-api-key",
      ),
  );
  assert.equal(invalidApiKey.ok, false);
  assert.equal(
    invalidApiKey.diagnostics[0].code,
    "VCB_SECRET_EXPRESSION_REQUIRED",
  );

  const invalidOauth = await compileFixture(
    "da-api-plugin-from-existing-api.yml",
    (sourceText) =>
      sourceText.replace(
        'clientSecret: "${{secret:EXISTING_API_OAUTH_CLIENT_SECRET}}"',
        "clientSecret: plaintext-client-secret",
      ),
  );
  assert.equal(invalidOauth.ok, false);
  assert.equal(
    invalidOauth.diagnostics[0].code,
    "VCB_ACCOUNT_EXPRESSION_REQUIRED",
  );
});

test("browser checks require a preceding target", async () => {
  const result = await compileFixture(
    "da-api-plugin-from-existing-api.yml",
    (sourceText) =>
      sourceText
        .replace(
          /      - type: chat\r?\n        send: List all repairs with oauth\r?\n        allowAction: true\r?\n/,
          "",
        )
        .replace(
          /        f5-copilot-remote,\r?\n        open-agent,\r?\n        check-oauth-sign-in,/,
          "        check-oauth-sign-in,\n        f5-copilot-remote,\n        open-agent,",
        ),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_BROWSER_ADAPTER_UNKNOWN");
});

test("VCB-126: browser checks can match an accessible-name prefix", async () => {
  const result = await compileFixture(
    "da-api-plugin-from-scratch-oauth.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const browserAssertions = result.value.flatMap((generated) =>
    generated.plan.steps
      .map((step) => step.description)
      .filter((description) =>
        description.startsWith(
          "@assertion a visible browser element has role button",
        ),
      ),
  );
  assert.deepEqual(browserAssertions, [
    "@assertion a visible browser element has role button and an accessible name that starts with Sign in to.",
    "@assertion a visible browser element has role button and an accessible name that starts with Sign in to.",
    "@assertion a visible browser element has role button and an accessible name that starts with Sign in to.",
    "@assertion a visible browser element has role button and an accessible name that starts with Sign in to.",
  ]);
  assert.equal(
    browserAssertions.some((description) =>
      description.includes("Sign in to Repair Service"),
    ),
    false,
  );

  const ambiguous = await compileFixture(
    "da-api-plugin-from-scratch-oauth.yml",
    (sourceText) =>
      sourceText.replace(
        "namePrefix: Sign in to",
        "name: Sign in to Repair Service\n          namePrefix: Sign in to",
      ),
  );
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.diagnostics[0].code, "VCB_CHECK_ASSERTION_INVALID");
});

test("VCB-17: client ID prompt title follows the authored authentication answer", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));

  const result = await setupGeneratedPlans({
    onDiff: () => {},
    plansDirectory,
  });
  assert.equal(result.ok, true);

  const planTitles = [
    {
      absent: "OAuth Client ID",
      fileName: "da-mcp-server--da-mcp-remote-entra-preview.json",
      present: "Microsoft Entra Application (Client) ID",
    },
    {
      absent: "Microsoft Entra Application (Client) ID",
      fileName: "da-mcp-server--da-mcp-remote-oauth-preview.json",
      present: "OAuth Client ID",
    },
  ];
  for (const { absent, fileName, present } of planTitles) {
    const plan = JSON.parse(
      await fs.readFile(path.join(plansDirectory, fileName), "utf8"),
    );
    const descriptions = plan.steps.map((step) => step.description);
    assert.equal(
      descriptions.some((description) => description.includes(present)),
      true,
      fileName,
    );
    assert.equal(
      descriptions.some((description) => description.includes(absent)),
      false,
      fileName,
    );
  }
});

test("provision confirmation follows the authored provision input", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));

  const result = await setupGeneratedPlans({
    onDiff: () => {},
    plansDirectory,
  });
  assert.equal(result.ok, true);

  const daPlan = JSON.parse(
    await fs.readFile(
      path.join(
        plansDirectory,
        "da-no-action--da-no-action-remote-preview.json",
      ),
      "utf8",
    ),
  );
  const provisionCommandIndex = daPlan.steps.findIndex(
    (step) =>
      step.description ===
        "Press Enter to execute the selected Command Palette command." &&
      step.step_id.includes("executeCommand_execute") &&
      step.step_id.includes("_4_1"),
  );
  const environmentIndex = daPlan.steps.findIndex(
    (step) => step.description === "Click the dev option in the active prompt.",
  );
  const confirmationIndex = daPlan.steps.findIndex((step) =>
    step.description.includes("the dialog Provision is visible"),
  );
  const notificationIndex = daPlan.steps.findIndex(
    (step) =>
      step.description ===
      "@assertion a visible Visual Studio Code notification contains the literal text provision stage executed successfully. A notification with different text, including an in-progress notification, does not satisfy this assertion.",
  );

  assert.equal(provisionCommandIndex >= 0, true);
  assert.equal(provisionCommandIndex < environmentIndex, true);
  assert.equal(confirmationIndex, -1);
  assert.equal(environmentIndex < notificationIndex, true);

  const weatherPlan = JSON.parse(
    await fs.readFile(
      path.join(
        plansDirectory,
        "weather-agent--weather-ts-azure-openai-remote-teams.json",
      ),
      "utf8",
    ),
  );
  assert.equal(
    weatherPlan.steps.some((step) =>
      step.description.includes(
        "Do you want to provision resources in dev environment using listed accounts? is visible",
      ),
    ),
    true,
  );
});

test("Copilot target authenticates the browser before readiness", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));

  const result = await setupGeneratedPlans({
    onDiff: () => {},
    plansDirectory,
  });
  assert.equal(result.ok, true);

  const plan = JSON.parse(
    await fs.readFile(
      path.join(
        plansDirectory,
        "da-no-action--da-no-action-remote-preview.json",
      ),
      "utf8",
    ),
  );
  const profileIndex = plan.steps.findIndex(
    (step) =>
      step.description ===
      "Press Enter to confirm the highlighted filtered option.",
  );
  const accountIndex = plan.steps.findIndex(
    (step, index) =>
      index > profileIndex &&
      step.step_id.includes("browserM365SignIn_enterAccount"),
  );
  const passwordIndex = plan.steps.findIndex(
    (step, index) =>
      index > profileIndex &&
      step.step_id.includes("browserM365SignIn_enterPassword"),
  );
  const readinessIndex = plan.steps.findIndex(
    (step, index) =>
      index > passwordIndex && step.step_id.includes("assertReady"),
  );
  const readinessDescription = plan.steps[readinessIndex]?.description ?? "";

  assert.equal(profileIndex >= 0, true);
  assert.equal(profileIndex < accountIndex, true);
  assert.equal(accountIndex < passwordIndex, true);
  assert.equal(passwordIndex < readinessIndex, true);
  assert.equal(
    readinessDescription,
    "@assertion Microsoft 365 Copilot shows an agent's chat open in the main section with a visible message input.",
  );
  assert.doesNotMatch(readinessDescription, /\$\{\{var:app_name\}\}/);
  assert.doesNotMatch(readinessDescription, /\}\}local/);
  assert.doesNotMatch(readinessDescription, /\}\}dev/);
  assert.doesNotMatch(readinessDescription, /is ready is ready/);
});

test("VCB-84: target profile selection follows the explicit case declaration", async () => {
  const existingApiResult = await compileFixture(
    "da-api-plugin-from-existing-api.yml",
    (sourceText) => sourceText,
  );

  assert.equal(existingApiResult.ok, true);
  const existingApiPlan = existingApiResult.value.find(
    (generated) =>
      generated.caseId ===
      "da-api-plugin-from-existing-api-api-key-remote-preview",
  ).plan;
  const existingApiFilterIndex = existingApiPlan.steps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "Preview in Copilot (Chrome)",
  );
  assert.equal(existingApiFilterIndex >= 0, true);
  const existingApiProfileSteps = existingApiPlan.steps.slice(
    existingApiFilterIndex,
    existingApiFilterIndex + 5,
  );
  assert.deepEqual(
    existingApiProfileSteps.map((step) => step.tool),
    ["type_text", "", "key_press", "", "key_press"],
  );
  assert.equal(existingApiProfileSteps[2].parameters.key, "down");
  assert.match(
    existingApiProfileSteps[3].description,
    /Preview in Copilot \(Chrome\).*highlighted/,
  );
  assert.equal(existingApiProfileSteps[4].parameters.key, "enter");

  const mcpResult = await compileFixture(
    "da-mcp-server.yml",
    (sourceText) => sourceText,
  );
  assert.equal(mcpResult.ok, true);
  const mcpPlan = mcpResult.value[0].plan;
  const mcpFilterIndex = mcpPlan.steps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "Preview in Copilot (Chrome)",
  );
  assert.equal(mcpFilterIndex >= 0, true);
  const mcpProfileSteps = mcpPlan.steps.slice(
    mcpFilterIndex,
    mcpFilterIndex + 3,
  );
  assert.deepEqual(
    mcpProfileSteps.map((step) => step.tool),
    ["type_text", "", "key_press"],
  );
  assert.equal(mcpProfileSteps[2].parameters.key, "enter");

  const missingSelection = await compileFixture(
    "da-api-plugin-from-existing-api.yml",
    (sourceText) =>
      sourceText.replace(/\n      profileSelection: (first|second)/, ""),
  );
  assert.equal(missingSelection.ok, false);
  assert.equal(
    missingSelection.diagnostics[0].code,
    "VCB_TARGET_PROFILE_SELECTION_REQUIRED",
  );

  const unsupportedSelection = await compileFixture(
    "da-api-plugin-from-existing-api.yml",
    (sourceText) =>
      sourceText.replace("profileSelection: second", "profileSelection: third"),
  );
  assert.equal(unsupportedSelection.ok, false);
  assert.equal(
    unsupportedSelection.diagnostics[0].code,
    "VCB_TARGET_PROFILE_SELECTION_UNKNOWN",
  );
});

test("semantic adapter rejects provision inputs that the template does not prompt for", async () => {
  const result = await compileFixture("da-no-action.yml", (sourceText) =>
    sourceText.replace(
      "  provision:\n    type: provision",
      `  provision:
    type: provision
    with:
      oauth:
        oauth-client-id: "\${{env:CLIENT_ID}}"
        oauth-client-secret: plaintext-secret`,
    ),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_PROVISION_INPUT_REDUNDANT");
});

test("provision environment selection follows the authored environment input", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));

  const result = await setupGeneratedPlans({
    onDiff: () => {},
    plansDirectory,
  });
  assert.equal(result.ok, true);

  const environmentDescription = "Click the dev option in the active prompt.";
  const mcpPlan = JSON.parse(
    await fs.readFile(
      path.join(
        plansDirectory,
        "da-mcp-server--da-mcp-remote-none-preview.json",
      ),
      "utf8",
    ),
  );
  const noActionPlan = JSON.parse(
    await fs.readFile(
      path.join(
        plansDirectory,
        "da-no-action--da-no-action-remote-preview.json",
      ),
      "utf8",
    ),
  );

  assert.equal(
    mcpPlan.steps.some((step) => step.description === environmentDescription),
    false,
  );
  assert.equal(
    noActionPlan.steps.some(
      (step) => step.description === environmentDescription,
    ),
    true,
  );
});

test("semantic adapter rejects an unsupported provision environment input", async () => {
  const result = await compileFixture("da-no-action.yml", (sourceText) =>
    sourceText.replace(
      "  provision:\n    type: provision",
      "  provision:\n    type: provision\n    with:\n      environment: dev",
    ),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_LIFECYCLE_INPUT_UNKNOWN");
});

test("VCB-39: deploy selects the environment under the provision contract", async () => {
  const emitted = await compileFixture(
    "da-api-plugin-from-scratch.yml",
    (sourceText) => sourceText,
  );
  assert.equal(emitted.ok, true);
  const descriptions = emitted.value[0].plan.steps.map(
    (step) => step.description,
  );
  const deployCommandIndex = descriptions.indexOf(
    "@assertion the Command Palette input box reads >Microsoft 365 Agents: Deploy and the highlighted command listed under it is titled Microsoft 365 Agents: Deploy.",
  );
  const deployEnvironmentIndex = descriptions.findIndex(
    (description, index) =>
      index > deployCommandIndex &&
      description === "Click the dev option in the active prompt.",
  );
  const deployConfirmationIndex = descriptions.findIndex(
    (description, index) =>
      index > deployCommandIndex &&
      description.includes(
        "the dialog Do you want to deploy resources in dev environment? is visible",
      ),
  );

  assert.equal(deployCommandIndex >= 0, true);
  assert.equal(deployCommandIndex < deployEnvironmentIndex, true);
  assert.equal(deployEnvironmentIndex < deployConfirmationIndex, true);

  const skipped = await compileFixture(
    "da-api-plugin-from-scratch.yml",
    (sourceText) =>
      sourceText.replace(
        "  deploy:\n    type: deploy\n",
        "  deploy:\n    type: deploy\n    with:\n      environment: none\n",
      ),
  );
  assert.equal(skipped.ok, true);
  assert.equal(
    skipped.value[0].plan.steps.filter(
      (step) =>
        step.description === "Click the dev option in the active prompt.",
    ).length,
    1,
  );
});

test("VCB-39: an unsupported deploy input fails before plan output", async () => {
  const unsupportedEnvironment = await compileFixture(
    "da-api-plugin-from-scratch.yml",
    (sourceText) =>
      sourceText.replace(
        "  deploy:\n    type: deploy\n",
        "  deploy:\n    type: deploy\n    with:\n      environment: dev\n",
      ),
  );
  assert.equal(unsupportedEnvironment.ok, false);
  assert.equal(
    unsupportedEnvironment.diagnostics[0].code,
    "VCB_LIFECYCLE_INPUT_UNKNOWN",
  );

  const unsupportedInput = await compileFixture(
    "da-api-plugin-from-scratch.yml",
    (sourceText) =>
      sourceText.replace(
        "  deploy:\n    type: deploy\n",
        "  deploy:\n    type: deploy\n    with:\n      arm: {}\n",
      ),
  );
  assert.equal(unsupportedInput.ok, false);
  assert.equal(
    unsupportedInput.diagnostics[0].code,
    "VCB_LIFECYCLE_INPUT_UNKNOWN",
  );
});

test("VCB-40: environment selection precedes the operation-owned prompts", async () => {
  const result = await compileFixture(
    "da-api-plugin-from-scratch.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true);
  const descriptions = result.value[0].plan.steps.map(
    (step) => step.description,
  );
  const environmentIndex = descriptions.indexOf(
    "Click the dev option in the active prompt.",
  );
  const resourceGroupIndex = descriptions.indexOf(
    "@assertion the active prompt titled Select a resource group is visible.",
  );

  assert.equal(environmentIndex >= 0, true);
  assert.equal(environmentIndex < resourceGroupIndex, true);
});

test("VCB-51: ARM provision emits no subscription prompt", async () => {
  const result = await compileFixture(
    "da-api-plugin-from-scratch.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true);
  const descriptions = result.value[0].plan.steps.map(
    (step) => step.description,
  );

  // The toolkit asks for a subscription only when the account can see more
  // than one, and the prompt filters on the name, not the ID.
  assert.equal(
    descriptions.some((description) => /subscription/i.test(description)),
    false,
  );

  const authoredSubscription = await compileFixture(
    "da-api-plugin-from-scratch.yml",
    (sourceText) =>
      sourceText.replace(
        '        targetResourceGroupName: "+ New resource group"',
        '        subscriptionId: "${{env:AZURE_SUBSCRIPTION_ID}}"\n        targetResourceGroupName: "+ New resource group"',
      ),
  );
  assert.equal(authoredSubscription.ok, false);
  assert.equal(
    authoredSubscription.diagnostics[0].code,
    "VCB_PROVISION_INPUT_UNKNOWN",
  );
});

test("VCB-59: the notification center opens before the lifecycle command runs", async () => {
  const result = await compileFixture(
    "da-api-plugin-from-scratch.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true);
  const steps = result.value[0].plan.steps;
  const filters = steps.map((step) => step.parameters?.text ?? "");
  const suffixOf = (index) =>
    steps[index].step_id.replace("step_executeCommand_filter_", "");
  const indexOfStep = (stepId) =>
    steps.findIndex((step) => step.step_id === stepId);

  for (const lifecycle of [
    {
      commandTitle: "Microsoft 365 Agents: Provision",
      successText: "provision stage executed successfully",
    },
    {
      commandTitle: "Microsoft 365 Agents: Deploy",
      successText: "actions in deploy stage executed successfully",
    },
  ]) {
    const commandIndex = filters.indexOf(lifecycle.commandTitle);
    const notificationsIndex = filters.lastIndexOf(
      "Notifications: Show Notifications",
      commandIndex,
    );
    const successIndex = steps.findIndex((step) =>
      step.description.includes(lifecycle.successText),
    );

    assert.equal(notificationsIndex >= 0, true);
    assert.equal(commandIndex < successIndex, true);

    // The notification center is opened by the round trip that immediately
    // precedes the operation's own command.
    const notificationsSuffix = suffixOf(notificationsIndex);
    const commandSuffix = suffixOf(commandIndex);
    assert.equal(
      indexOfStep(`step_executeCommand_execute_${notificationsSuffix}`) + 1,
      indexOfStep(`step_executeCommand_open_${commandSuffix}`),
    );

    // VS Code closes the Command Palette when the window loses focus, and a
    // running lifecycle operation opens browser windows of its own, so nothing
    // between the command and its result may reopen the palette.
    const triggerIndex = indexOfStep(
      `step_executeCommand_execute_${commandSuffix}`,
    );
    const running = steps.slice(triggerIndex + 1, successIndex);
    assert.equal(
      running.some((step) => step.step_id.startsWith("step_executeCommand_")),
      false,
    );
  }
});

test("VCB-61: lifecycle confirmations assert the modal dialog message", async () => {
  const result = await compileFixture(
    "da-api-plugin-from-scratch.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true);
  const steps = result.value[0].plan.steps;
  const descriptions = steps.map((step) => step.description);

  // Both consents are showMessage(..., modal) calls, so the operation name
  // appears only on the button and never as a dialog title.
  assert.equal(
    descriptions.includes(
      "@assertion the dialog Costs may apply based on usage. Do you want to provision resources in dev environment using listed accounts? is visible with the primary action Provision.",
    ),
    true,
  );
  assert.equal(
    descriptions.includes(
      "@assertion the dialog Do you want to deploy resources in dev environment? is visible with the primary action Deploy.",
    ),
    true,
  );
  assert.equal(
    steps.some((step) => step.step_id.startsWith("step_confirm_")),
    false,
  );
});

test("semantic adapter rejects a target with missing prerequisites", async () => {
  const result = await compileFixture("weather-agent.yml", (sourceText) =>
    sourceText.replace("        login-m365,\n", ""),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_TARGET_PREREQUISITE");
});

test("VCB-64: local debug targets require no provision or deploy", async () => {
  const result = await compileFixture(
    "weather-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const plansByCase = new Map(
    result.value.map((generated) => [generated.caseId, generated.plan]),
  );
  for (const caseId of [
    "weather-ts-azure-openai-local-teams",
    "weather-ts-azure-openai-local-copilot",
    "weather-ts-azure-openai-playground",
  ]) {
    const plan = plansByCase.get(caseId);
    assert.notEqual(plan, undefined, caseId);
    const typedValues = plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    assert.equal(
      typedValues.includes("Microsoft 365 Agents: Provision"),
      false,
      caseId,
    );
    assert.equal(
      typedValues.includes("Microsoft 365 Agents: Deploy"),
      false,
      caseId,
    );
  }
});

test("VCB-65: the Agents Playground target signs no account in", async () => {
  const result = await compileFixture(
    "weather-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const plan = result.value.find(
    (generated) => generated.caseId === "weather-ts-azure-openai-playground",
  ).plan;
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(typedValues.includes("${{env:M365_ACCOUNT_NAME}}"), false);
  assert.equal(
    typedValues.includes("${{secret:M365_ACCOUNT_PASSWORD}}"),
    false,
  );
  assert.equal(
    plan.steps.some((step) =>
      ["step_signInAzure_", "step_signInM365_", "step_browserM365SignIn_"].some(
        (prefix) => step.step_id.startsWith(prefix),
      ),
    ),
    false,
  );
});

test("VCB-66: an Agents Playground chat check uses the Playground composer", async () => {
  const result = await compileFixture(
    "weather-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const plan = result.value.find(
    (generated) => generated.caseId === "weather-ts-azure-openai-playground",
  ).plan;
  assert.equal(
    plan.steps.some((step) =>
      step.step_id.startsWith("step_sendPlaygroundMessage_"),
    ),
    true,
  );
  assert.equal(
    plan.steps.some(
      (step) =>
        step.step_id.startsWith("step_sendTeamsMessage_") ||
        step.step_id.startsWith("step_sendCopilotMessage_"),
    ),
    false,
  );
});

test("semantic adapter rejects an open kind incompatible with its target profile", async () => {
  const result = await compileFixture("weather-agent.yml", (sourceText) =>
    sourceText.replace("      kind: app", "      kind: agent"),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_OPEN_ADAPTER_UNKNOWN");
});

test("VCB-67: a Python environment operation drives the Venv creation flow", async () => {
  const result = await compileFixture(
    "basic-custom-engine-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const plan = result.value.find(
    (generated) => generated.caseId === "basic-cea-py-azure-openai-playground",
  ).plan;
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  const commandIndex = typedValues.indexOf("Python: Create Environment...");
  assert.notEqual(commandIndex, -1);
  assert.equal(typedValues[commandIndex + 1], "Venv");
  assert.equal(typedValues[commandIndex + 2], "Python 3.12");
  assert.equal(
    plan.steps.some(
      (step) =>
        step.agent === "assertion" &&
        step.description.includes("Select dependencies to install"),
    ),
    true,
  );
});

test("VCB-159: Python dependency prompts name the exact requirements file", async () => {
  for (const [sourceName, caseId, dependencyLabel] of [
    [
      "basic-custom-engine-agent.yml",
      "basic-cea-py-azure-openai-playground",
      "src/requirements.txt",
    ],
    [
      "general-teams-agent.yml",
      "general-teams-py-azure-openai-playground",
      "src/requirements.txt",
    ],
    [
      "custom-copilot-rag-azure-ai-search.yml",
      "rag-azure-ai-search-py-azure-openai-remote-teams",
      "src/requirements.txt",
    ],
    [
      "custom-copilot-rag-custom-api.yml",
      "rag-custom-api-py-azure-openai-remote-teams",
      "requirements.txt",
    ],
    [
      "custom-copilot-rag-customize.yml",
      "rag-customize-py-azure-openai-playground",
      "src/requirements.txt",
    ],
    ["default-bot.yml", "simple-bot-py-playground", "src/requirements.txt"],
    [
      "default-message-extension.yml",
      "message-extension-py-playground",
      "src/requirements.txt",
    ],
  ]) {
    const result = await compileFixture(sourceName, (sourceText) => sourceText);
    assert.equal(result.ok, true, sourceName);
    const plan = result.value.find(
      (generated) => generated.caseId === caseId,
    ).plan;
    const dependencyAssertions = plan.steps.filter(
      (step) =>
        step.agent === "assertion" &&
        step.description.includes("Select dependencies to install"),
    );

    assert.equal(
      dependencyAssertions.some(
        (step) =>
          step.description ===
          `@assertion the active multi-select prompt titled Select dependencies to install has finished loading and lists the selectable dependency option labeled ${dependencyLabel}.`,
      ),
      true,
      caseId,
    );
    assert.equal(
      dependencyAssertions.some((step) =>
        step.description.includes("square selection control"),
      ),
      false,
      caseId,
    );
  }
});

test("VCB-161: Weather OpenAI Playground redirects use the Playground lifecycle", async () => {
  const result = await compileFixture(
    "weather-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  for (const caseId of [
    "weather-ts-openai-playground",
    "weather-js-openai-playground",
  ]) {
    const plan = result.value.find(
      (generated) => generated.caseId === caseId,
    ).plan;
    const environmentStep = plan.steps.find((step) =>
      step.description.includes("set OPENAI_BASE_URL"),
    );

    assert.equal(
      environmentStep.parameters.sample.includes("m365agents.playground.yml"),
      true,
      caseId,
    );
    assert.equal(
      environmentStep.parameters.sample.includes(".localConfigs.playground"),
      true,
      caseId,
    );
    assert.equal(
      environmentStep.parameters.sample.includes("m365agents.local.yml"),
      false,
      caseId,
    );
  }
});

test("VCB-68: a Python environment operation reads its interpreter from the case", async () => {
  const result = await compileFixture(
    "basic-custom-engine-agent.yml",
    (sourceText) =>
      sourceText.replace(
        'interpreter: "Python 3.12"',
        'interpreter: "Python 3.13"',
      ),
  );

  assert.equal(result.ok, true);
  const plan = result.value.find(
    (generated) => generated.caseId === "basic-cea-py-azure-openai-playground",
  ).plan;
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(typedValues.includes("Python 3.13"), true);
  assert.equal(typedValues.includes("Python 3.12"), false);
});

test("VCB-68: a Python environment operation without an interpreter is rejected", async () => {
  const result = await compileFixture(
    "basic-custom-engine-agent.yml",
    (sourceText) =>
      sourceText.replace('      interpreter: "Python 3.12"\n', ""),
  );

  assert.equal(result.ok, false);
  assert.equal(
    result.diagnostics[0].code,
    "VCB_PYTHON_ENVIRONMENT_INPUT_INVALID",
  );
});

test("VCB-69: a Python environment operation clicks no picker row", async () => {
  const result = await compileFixture(
    "basic-custom-engine-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const plan = result.value.find(
    (generated) => generated.caseId === "basic-cea-py-azure-openai-playground",
  ).plan;
  const environmentSteps = plan.steps.filter((step) =>
    ["step_filterOption_", "step_multiSelect_"].some((prefix) =>
      step.step_id.startsWith(prefix),
    ),
  );
  assert.notEqual(environmentSteps.length, 0);
  for (const step of environmentSteps) {
    assert.equal(step.tool === "click", false, step.step_id);
    assert.equal(step.parameters.x, undefined, step.step_id);
    assert.equal(step.parameters.y, undefined, step.step_id);
  }
});

test("VCB-70: a Python environment operation opens the notification center before asserting", async () => {
  const result = await compileFixture(
    "basic-custom-engine-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const plan = result.value.find(
    (generated) => generated.caseId === "basic-cea-py-azure-openai-playground",
  ).plan;
  const assertionIndex = plan.steps.findIndex(
    (step) =>
      step.agent === "assertion" &&
      step.description.includes("The following environment is selected:"),
  );
  assert.notEqual(assertionIndex, -1);
  const notificationIndex = plan.steps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "Notifications: Show Notifications",
  );
  assert.notEqual(notificationIndex, -1);
  assert.equal(notificationIndex < assertionIndex, true);
});

test("VCB-71: the Python remote Teams target opens the app through the Teams add transition", async () => {
  const result = await compileFixture(
    "basic-custom-engine-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const plan = result.value.find(
    (generated) =>
      generated.caseId === "basic-cea-py-azure-openai-remote-teams",
  ).plan;
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(typedValues.includes("Launch Remote (Chrome)"), true);
  assert.equal(
    plan.steps.some((step) => step.step_id.startsWith("step_addAndOpenApp_")),
    true,
  );
});

test("VCB-92: the View Remote App target uses the remote Teams adapter", async () => {
  const result = await compileFixture(
    "basic-custom-engine-agent.yml",
    (sourceText) =>
      sourceText.replace(
        'profile: "Launch Remote (Chrome)"',
        'profile: "View Remote App in Teams (Chrome)"',
      ),
  );

  assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.[0]));
  const plan = result.value.find(
    (generated) =>
      generated.caseId === "basic-cea-py-azure-openai-remote-teams",
  ).plan;
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(typedValues.includes("View Remote App in Teams (Chrome)"), true);
  assert.equal(
    plan.steps.some((step) => step.step_id.startsWith("step_addAndOpenApp_")),
    true,
  );
});

test("VCB-90: the Teams open converges on the conversation, not the app details page", async () => {
  const result = await compileFixture(
    "basic-custom-engine-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const plan = result.value.find(
    (generated) => generated.caseId === "basic-cea-py-azure-openai-local-teams",
  ).plan;
  const target = plan.steps.find((step) =>
    step.step_id.startsWith("step_assertReady_assertReady_"),
  );
  const opened = plan.steps.find((step) =>
    step.step_id.startsWith("step_addAndOpenApp_assertReady_"),
  );

  assert.match(target.description, /app details page/);
  assert.equal(/app details page/.test(opened.description), false);
  assert.match(opened.description, /conversation/);
  assert.match(opened.description, /\$\{\{var:app_name\}\}/);
});

test("VCB-72: the weather bundle authors every LLM, language, and Teams launch combination", async () => {
  const result = await compileFixture(
    "weather-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const caseIds = new Set(result.value.map((generated) => generated.caseId));
  for (const llm of ["azure-openai", "openai"]) {
    for (const language of ["ts", "js"]) {
      for (const launch of ["remote-teams", "local-teams"]) {
        assert.equal(
          caseIds.has(`weather-${language}-${llm}-${launch}`),
          true,
          `weather-${language}-${llm}-${launch} is not authored`,
        );
      }
    }
  }
});

test("VCB-93: CEA, Bot, and Message Extension bundles author their supported launch matrices", async () => {
  for (const { fileName, languages, prefix } of [
    {
      fileName: "basic-custom-engine-agent.yml",
      languages: ["ts", "js", "py"],
      prefix: "basic-cea",
    },
    {
      fileName: "default-bot.yml",
      languages: ["ts", "js", "py"],
      prefix: "simple-bot",
    },
    {
      fileName: "default-message-extension.yml",
      languages: ["ts", "py"],
      prefix: "message-extension",
    },
  ]) {
    const result = await compileFixture(fileName, (sourceText) => sourceText);
    assert.equal(result.ok, true, fileName);
    const caseIds = new Set(result.value.map((generated) => generated.caseId));
    for (const language of languages) {
      for (const launch of ["remote-teams", "local-teams", "playground"]) {
        const llm = prefix === "basic-cea" ? "-azure-openai" : "";
        const caseId = `${prefix}-${language}${llm}-${launch}`;
        assert.equal(caseIds.has(caseId), true, caseId);
      }
    }
    assert.equal(
      caseIds.size,
      prefix === "basic-cea" ? 23 : languages.length * 3,
      fileName,
    );
  }
});

test("VCB-132: Basic CEA retained Teams and Copilot plans have semantic replacements", async () => {
  const result = await compileFixture(
    "basic-custom-engine-agent.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.[0]));

  const expectedCases = [
    ["basic-cea-ts-openai-remote-teams", "36009400"],
    ["basic-cea-ts-openai-local-teams", "36009300"],
    ["basic-cea-ts-openai-remote-copilot", "36010157"],
    ["basic-cea-ts-openai-local-copilot", "36010142"],
    ["basic-cea-js-openai-remote-teams", "36009391"],
    ["basic-cea-js-openai-local-teams", "36002299"],
    ["basic-cea-js-openai-remote-copilot", "36010146"],
    ["basic-cea-js-openai-local-copilot", "36010130"],
    ["basic-cea-ts-azure-openai-remote-copilot", "36206193"],
    ["basic-cea-ts-azure-openai-local-copilot", "33338527"],
    ["basic-cea-js-azure-openai-remote-copilot", "36206141"],
    ["basic-cea-js-azure-openai-local-copilot", "33338523"],
  ];

  for (const [caseId, workItemId] of expectedCases) {
    const generated = result.value.find((entry) => entry.caseId === caseId);
    assert.notEqual(generated, undefined, caseId);
    assert.equal(
      generated.plan.plan_metadata.description.workitem,
      workItemId,
      caseId,
    );

    const typedValues = generated.plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    const targetsCopilot = caseId.endsWith("copilot");
    const isRemote = caseId.includes("-remote-");
    assert.equal(
      typedValues.includes(
        targetsCopilot
          ? isRemote
            ? "(Preview) Launch Remote in Copilot (Chrome)"
            : "(Preview) Debug in Copilot (Chrome)"
          : isRemote
            ? "Launch Remote in Teams (Chrome)"
            : "Debug in Teams (Chrome)",
      ),
      true,
      caseId,
    );
    assert.equal(
      generated.plan.steps.some((step) =>
        step.step_id.startsWith(
          targetsCopilot
            ? "step_sendCopilotMessage_"
            : "step_sendTeamsMessage_",
        ),
      ),
      true,
      caseId,
    );

    if (!caseId.includes("-azure-openai-")) {
      assert.equal(
        typedValues.includes("${{secret:AZURE_OPENAI_API_KEY}}"),
        true,
        caseId,
      );
    } else {
      assert.equal(
        generated.plan.steps.some((step) =>
          step.step_id.startsWith("step_assertChatNotContains_"),
        ),
        true,
        caseId,
      );
    }
  }
});

test("VCB-94: Basic CEA remote Teams cases use each language template's launch profile", async () => {
  const result = await compileFixture(
    "basic-custom-engine-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  for (const { caseId, expectedProfile, unexpectedProfile } of [
    {
      caseId: "basic-cea-ts-azure-openai-remote-teams",
      expectedProfile: "Launch Remote in Teams (Chrome)",
      unexpectedProfile: "Launch Remote (Chrome)",
    },
    {
      caseId: "basic-cea-js-azure-openai-remote-teams",
      expectedProfile: "Launch Remote in Teams (Chrome)",
      unexpectedProfile: "Launch Remote (Chrome)",
    },
    {
      caseId: "basic-cea-py-azure-openai-remote-teams",
      expectedProfile: "Launch Remote (Chrome)",
      unexpectedProfile: "Launch Remote in Teams (Chrome)",
    },
  ]) {
    const plan = result.value.find(
      (generated) => generated.caseId === caseId,
    ).plan;
    const typedValues = plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    assert.equal(typedValues.includes(expectedProfile), true, caseId);
    assert.equal(typedValues.includes(unexpectedProfile), false, caseId);
  }
});

test("VCB-95: the General Teams Agent bundle authors its explicit behavior matrix", async () => {
  const result = await compileFixture(
    "general-teams-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.[0]));
  const caseIds = new Set(result.value.map((generated) => generated.caseId));
  const expectedCaseIds = new Set();
  for (const language of ["ts", "js", "py"]) {
    for (const llm of ["azure-openai", "openai"]) {
      for (const launch of ["remote-teams", "local-teams"]) {
        expectedCaseIds.add(`general-teams-${language}-${llm}-${launch}`);
      }
    }
    expectedCaseIds.add(`general-teams-${language}-azure-openai-playground`);
    expectedCaseIds.add(
      `general-teams-${language}-azure-openai-remote-copilot`,
    );
    expectedCaseIds.add(`general-teams-${language}-azure-openai-local-copilot`);
  }

  assert.deepEqual(caseIds, expectedCaseIds);
  const typedValues = result.value[0].plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(typedValues.includes("General Teams Agent"), true);
});

test("VCB-96: General Teams Agent Copilot targets use their remote and local lifecycles", async () => {
  const result = await compileFixture(
    "general-teams-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  for (const { caseId, expectedProfile, expectedLifecycleCommands } of [
    {
      caseId: "general-teams-ts-azure-openai-remote-copilot",
      expectedProfile: "Launch Remote in Copilot (Chrome)",
      expectedLifecycleCommands: [
        "Microsoft 365 Agents: Provision",
        "Microsoft 365 Agents: Deploy",
      ],
    },
    {
      caseId: "general-teams-ts-azure-openai-local-copilot",
      expectedProfile: "Debug in Copilot (Chrome)",
      expectedLifecycleCommands: [],
    },
  ]) {
    const plan = result.value.find(
      (generated) => generated.caseId === caseId,
    ).plan;
    const typedValues = plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    const lifecycleCommands = typedValues.filter((value) =>
      [
        "Microsoft 365 Agents: Provision",
        "Microsoft 365 Agents: Deploy",
      ].includes(value),
    );
    assert.equal(typedValues.includes(expectedProfile), true, caseId);
    assert.deepEqual(lifecycleCommands, expectedLifecycleCommands, caseId);
    assert.equal(
      plan.steps.some((step) =>
        step.description.includes("shows an agent's chat open"),
      ),
      true,
      caseId,
    );
  }

  for (const transform of [
    (sourceText) =>
      sourceText.replace(
        /        deploy,\r?\n        f5-copilot-remote,/,
        "        f5-copilot-remote,",
      ),
    (sourceText) =>
      sourceText.replace(
        /        login-m365,\r?\n        f5-copilot-local,/,
        "        f5-copilot-local,",
      ),
  ]) {
    const missingPrerequisite = await compileFixture(
      "general-teams-agent.yml",
      transform,
    );
    assert.equal(missingPrerequisite.ok, false);
    assert.equal(
      missingPrerequisite.diagnostics[0].code,
      "VCB_TARGET_PREREQUISITE",
    );
  }
});

test("VCB-97: General Teams Agent OpenAI cases preserve local and remote chat contracts", async () => {
  const result = await compileFixture(
    "general-teams-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  for (const generated of result.value) {
    if (
      !generated.caseId.includes("-openai-") ||
      generated.caseId.includes("-azure-openai-")
    ) {
      continue;
    }
    const sendsAMessage = generated.plan.steps.some((step) =>
      /^step_sendTeamsMessage_/.test(step.step_id || ""),
    );
    const setsOpenAIBaseUrl = generated.plan.steps.some((step) =>
      /^step_setLocalEnvironmentVariable_/.test(step.step_id || ""),
    );
    assert.equal(sendsAMessage, true, generated.caseId);
    assert.equal(
      setsOpenAIBaseUrl,
      generated.caseId.includes("-local-"),
      generated.caseId,
    );
  }
});

test("VCB-98: only General Teams Agent Copilot cases inject the launch flag before startup", async () => {
  const result = await compileFixture(
    "general-teams-agent.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  assert.equal(result.value.length, 21);

  for (const entry of result.value) {
    const hasSettingOrReload = entry.plan.steps.some(
      (step) =>
        step.description?.includes(
          "M365AgentsToolkit.enableLaunchAgentForTeamsInCopilot",
        ) || step.parameters?.text === "Developer: Reload Window",
    );
    const hasFeatureFlag = entry.plan.plan_metadata.tags.includes(
      "feature_flag:TEAMSFX_CEA_ENABLED=true",
    );
    const targetsCopilot = entry.caseId.endsWith("-copilot");

    assert.equal(hasSettingOrReload, false, entry.caseId);
    assert.equal(hasFeatureFlag, targetsCopilot, entry.caseId);
  }

  const missingFeatureFlag = await compileFixture(
    "general-teams-agent.yml",
    (sourceText) =>
      sourceText.replace(
        /    featureFlags:\r?\n      - TEAMSFX_CEA_ENABLED=true\r?\n/,
        "",
      ),
  );
  assert.equal(missingFeatureFlag.ok, false);
  assert.equal(
    missingFeatureFlag.diagnostics[0].code,
    "VCB_TARGET_PREREQUISITE",
  );
});

test("VCB-106: the Copilot launch flag prerequisite is template-scoped", async () => {
  const result = await compileFixture(
    "da-api-plugin-from-scratch.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const generated = result.value.find(
    (entry) => entry.caseId === "da-api-plugin-from-scratch-js-local-copilot",
  );
  assert.equal(
    generated.plan.plan_metadata.tags.includes(
      "feature_flag:TEAMSFX_CEA_ENABLED=true",
    ),
    false,
  );
  assert.equal(
    generated.plan.steps.some(
      (step) => step.parameters.text === "Debug in Copilot (Chrome)",
    ),
    true,
  );
});

test("VCB-99: Playground reply checks use visible completion evidence", async () => {
  const result = await compileFixture(
    "general-teams-agent.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);

  const playground = result.value.find(
    (entry) => entry.caseId === "general-teams-py-azure-openai-playground",
  );
  const localTeams = result.value.find(
    (entry) => entry.caseId === "general-teams-py-azure-openai-local-teams",
  );
  assert.notEqual(playground, undefined);
  assert.notEqual(localTeams, undefined);
  assert.equal(
    playground.plan.steps.some(
      (step) =>
        step.description ===
        '@assertion the Agents Playground shows a non-empty assistant response, and the "Type a message..." composer is ready for the next user turn with no response-generation indicator visible.',
    ),
    true,
  );
  assert.equal(
    playground.plan.steps.some((step) =>
      step.description.includes("feedback controls"),
    ),
    false,
  );
  assert.equal(
    localTeams.plan.steps.some(
      (step) =>
        step.description ===
        "@assertion the current assistant turn is complete and contains a non-empty response.",
    ),
    true,
  );
});

test("VCB-73: OpenAI weather cases preserve their local and remote chat contracts", async () => {
  const result = await compileFixture(
    "weather-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  for (const generated of result.value) {
    if (
      !generated.caseId.includes("-openai-") ||
      generated.caseId.includes("-azure-openai-")
    ) {
      continue;
    }
    const sendsAMessage = generated.plan.steps.some((step) =>
      /^step_send(Teams|Copilot|Playground)Message_/.test(step.step_id || ""),
    );
    assert.equal(
      sendsAMessage,
      true,
      `${generated.caseId} sends ${sendsAMessage ? "a" : "no"} chat message`,
    );
  }
});

test("VCB-75: a local environment operation writes the variable into the local lifecycle", async () => {
  const result = await compileFixture(
    "weather-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const generated = result.value.find(
    (candidate) => candidate.caseId === "weather-ts-openai-local-teams",
  );
  const step = generated.plan.steps.find((candidate) =>
    candidate.step_id.startsWith("step_setLocalEnvironmentVariable_"),
  );

  assert.equal(step.agent, "code");
  assert.equal(
    step.parameters.sample.includes(
      'VARIABLE_NAME="OPENAI_BASE_URL" VARIABLE_VALUE="${{env:AZURE_OPENAI_ENDPOINT}}/openai/v1"',
    ),
    true,
  );
  assert.equal(step.parameters.sample.includes("m365agents.local.yml"), true);
  assert.equal(step.parameters.sample.includes('"envs:"'), true);
});

test("VCB-107: local user environment values update the fixed project file", async () => {
  const sourceText = `version: 1
cases:
  - id: local-user-environment
    scenarioId: VCB-107
    workItemIds: [1001]
    steps: [scaffold, check, set-api-key]
steps:
  scaffold:
    type: scaffold
    with:
      template: da/api-plugin-from-scratch-bearer
      answers:
        - question: apiAuth
          value: api-key
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: env/.env.local.user
        expect:
          exists: true
  set-api-key:
    type: localUserEnvironment
    with:
      SECRET_API_KEY: "\${{var:app_name}}-api-key"
`;
  const result = await compileCaseBundle({
    compileStep: createSemanticStepCompiler(),
    sourcePath: "cases/local-user-environment.yml",
    sourceText,
  });

  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const mutation = result.value[0].plan.steps.filter((candidate) =>
    candidate.step_id.startsWith("step_setLocalUserEnvironmentVariable_"),
  );
  const command = mutation.find((step) => step.tool === "type_text");
  const encodedScript = command.parameters.text.match(
    /base64\.b64decode\("([^"]+)"\)/,
  )?.[1];
  assert.equal(typeof encodedScript, "string");
  const mutationScript = Buffer.from(encodedScript, "base64").toString("utf8");
  assert.equal(mutationScript.includes('/ "env" / ".env.local.user"'), true);
  assert.equal(mutationScript.includes("if len(matches) != 1:"), true);
  assert.equal(
    mutation.some((step) => step.description.includes("SECRET_API_KEY")),
    true,
  );
  assert.equal(
    mutation.some((step) => step.description.includes("api-key")),
    false,
  );

  const unsafe = await compileCaseBundle({
    compileStep: createSemanticStepCompiler(),
    sourcePath: "cases/local-user-environment.yml",
    sourceText: sourceText.replace(
      'SECRET_API_KEY: "${{var:app_name}}-api-key"',
      'SECRET_API_KEY: "$(id)"',
    ),
  });
  assert.equal(unsafe.ok, false);
  assert.equal(
    unsafe.diagnostics[0].code,
    "VCB_LOCAL_USER_ENVIRONMENT_INPUT_INVALID",
  );
});

test("VCB-127: local user environment uses a verified terminal mutation", async () => {
  const result = await compileFixture(
    "da-api-plugin-from-scratch-bearer.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const generated = result.value.find(
    (candidate) =>
      candidate.caseId ===
      "da-api-plugin-from-scratch-api-key-js-local-copilot",
  );
  const mutation = generated.plan.steps.filter((step) =>
    step.step_id.startsWith("step_setLocalUserEnvironmentVariable_"),
  );
  assert.deepEqual(
    mutation.map((step) => [step.agent, step.tool]),
    [
      ["interaction", "keyboard_shortcut"],
      ["assertion", ""],
      ["interaction", "type_text"],
      ["interaction", "key_press"],
      ["interaction", "type_text"],
      ["interaction", "key_press"],
      ["assertion", ""],
      ["interaction", "keyboard_shortcut"],
      ["assertion", ""],
    ],
  );
  assert.equal(
    mutation.some((step) => step.agent === "code"),
    false,
  );
  const command = mutation.find(
    (step) =>
      step.tool === "type_text" && step.parameters.text.includes("read -rs"),
  );
  assert.equal(command.parameters.text.includes("SECRET_API_KEY"), true);
  assert.equal(command.parameters.text.includes("-api-key"), false);
  assert.equal(
    command.parameters.text.includes(
      "printf '\\nVSCUSE_LOCAL_USER_ENVIRONMENT_%s\\n' UPDATED",
    ),
    true,
  );
  const hiddenValue = mutation.find(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "${{var:app_name}}-api-key",
  );
  assert.equal(hiddenValue.description.includes("api-key"), false);
  assert.equal(
    mutation.some((step) =>
      step.description.includes("VSCUSE_LOCAL_USER_ENVIRONMENT_UPDATED"),
    ),
    true,
  );
  assert.equal(
    mutation.some((step) => step.description.includes("proving")),
    false,
  );
});

test("VCB-155: user environment targets dev and playground with closed shell-safe inputs", async () => {
  const validBlock = `      target: dev
      variables:
        SECRET_API_KEY: "\${{var:app_name}}-api-key"
        SECOND_SECRET: "alpha-value"
`;
  const sourceText = `version: 1
cases:
  - id: user-environment
    scenarioId: VCB-142
    workItemIds: [142]
    steps: [scaffold, check, set-user-environment]
steps:
  scaffold:
    type: scaffold
    with:
      template: da/api-plugin-from-scratch-bearer
      answers:
        - question: apiAuth
          value: api-key
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: env/.env.dev.user
        expect:
          exists: true
  set-user-environment:
    type: userEnvironment
    with:
${validBlock}`;
  const compile = (target) =>
    compileCaseBundle({
      compileStep: createSemanticStepCompiler(),
      sourcePath: "cases/user-environment.yml",
      sourceText: sourceText.replace("target: dev", `target: ${target}`),
    });

  for (const [target, fileName] of [
    ["dev", ".env.dev.user"],
    ["playground", ".env.playground.user"],
  ]) {
    const result = await compile(target);
    assert.equal(
      result.ok,
      true,
      `${target}: ${result.diagnostics?.[0]?.code}`,
    );
    const mutation = result.value[0].plan.steps.filter((step) =>
      step.step_id.startsWith("step_setUserEnvironmentVariable_"),
    );
    assert.notEqual(mutation.length, 0, target);
    const command = mutation.find(
      (step) =>
        step.tool === "type_text" && step.parameters.text.includes("read -rs"),
    );
    assert.equal(
      command.parameters.text.includes(`TARGET_KEY="${target}"`),
      true,
    );
    const encodedScript = command.parameters.text.match(
      /base64\.b64decode\("([^"]+)"\)/,
    )?.[1];
    assert.equal(typeof encodedScript, "string");
    const mutationScript = Buffer.from(encodedScript, "base64").toString(
      "utf8",
    );
    assert.equal(
      mutationScript.includes(
        `"${target}": project_dir / "env" / "${fileName}"`,
      ),
      true,
    );
    assert.equal(mutationScript.includes("touch(exist_ok=True)"), true);
    assert.equal(mutationScript.includes("if written != [expected]:"), true);
    assert.equal(
      mutation.some((step) => step.description.includes("alpha-value")),
      false,
    );
  }

  for (const [label, replacement] of [
    [
      "unknown target",
      `      target: prod
      variables:
        SECRET_API_KEY: "\${{var:app_name}}-api-key"
        SECOND_SECRET: "alpha-value"
`,
    ],
    [
      "extra field",
      `      target: dev
      path: env/.env.dev.user
      variables:
        SECRET_API_KEY: "\${{var:app_name}}-api-key"
        SECOND_SECRET: "alpha-value"
`,
    ],
    [
      "empty variables",
      `      target: dev
      variables: {}
`,
    ],
    [
      "invalid variable name",
      `      target: dev
      variables:
        not_safe: "alpha-value"
`,
    ],
    [
      "unsafe value",
      `      target: dev
      variables:
        SECRET_API_KEY: "$(id)"
`,
    ],
  ]) {
    const invalid = await compileCaseBundle({
      compileStep: createSemanticStepCompiler(),
      sourcePath: "cases/user-environment.yml",
      sourceText: sourceText.replace(validBlock, replacement),
    });
    assert.equal(invalid.ok, false, label);
    assert.equal(
      invalid.diagnostics[0].code,
      "VCB_USER_ENVIRONMENT_INPUT_INVALID",
      label,
    );
  }
});

test("VCB-172: project environment replaces existing dev variables with closed shell-safe inputs", async () => {
  const validBlock = `      variables:
        SECOND_VALUE: "alpha-value"
        AGENT_SCOPE: personal
`;
  const sourceText = `version: 1
cases:
  - id: project-environment
    scenarioId: VCB-172
    workItemIds: [171]
    steps: [scaffold, check, set-project-environment]
steps:
  scaffold:
    type: scaffold
    with:
      template: da/no-action
      answers:
        - question: projectType
          value: copilot-agent-type
        - question: daTemplate
          value: no-action
        - question: workspaceFolder
          value: default
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: env/.env.dev
        expect:
          exists: true
  set-project-environment:
    type: projectEnvironment
    with:
${validBlock}`;
  const compile = (replacement = validBlock) =>
    compileCaseBundle({
      compileStep: createSemanticStepCompiler(),
      sourcePath: "cases/project-environment.yml",
      sourceText: sourceText.replace(validBlock, replacement),
    });

  const result = await compile();
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const mutation = result.value[0].plan.steps.filter((step) =>
    step.step_id.startsWith("step_setProjectEnvironmentVariable_"),
  );
  assert.notEqual(mutation.length, 0);
  const commands = mutation.filter(
    (step) =>
      step.tool === "type_text" && step.parameters.text.includes("read -rs"),
  );
  assert.equal(commands.length, 2);
  assert.equal(
    commands[0].parameters.text.includes('VARIABLE_NAME="AGENT_SCOPE"'),
    true,
  );
  assert.equal(
    commands[1].parameters.text.includes('VARIABLE_NAME="SECOND_VALUE"'),
    true,
  );
  const encodedScript = commands[0].parameters.text.match(
    /base64\.b64decode\("([^"]+)"\)/,
  )?.[1];
  assert.equal(typeof encodedScript, "string");
  const mutationScript = Buffer.from(encodedScript, "base64").toString("utf8");
  assert.equal(
    mutationScript.includes('project_dir / "env" / ".env.dev"'),
    true,
  );
  assert.equal(mutationScript.includes(".env.dev.user"), false);
  assert.equal(mutationScript.includes("touch("), false);
  assert.equal(mutationScript.includes("if len(matches) != 1:"), true);
  assert.equal(mutationScript.includes("if written != [expected]:"), true);
  assert.equal(
    mutation.some((step) => step.description.includes("personal")),
    false,
  );

  for (const [label, replacement] of [
    [
      "extra field",
      `      path: env/.env.dev
      variables:
        AGENT_SCOPE: personal
`,
    ],
    ["empty variables", "      variables: {}\n"],
    [
      "invalid variable name",
      `      variables:
        agent_scope: personal
`,
    ],
    [
      "unsafe value",
      `      variables:
        AGENT_SCOPE: "$(id)"
`,
    ],
  ]) {
    const invalid = await compile(replacement);
    assert.equal(invalid.ok, false, label);
    assert.equal(
      invalid.diagnostics[0].code,
      "VCB_PROJECT_ENVIRONMENT_INPUT_INVALID",
      label,
    );
  }
});

test("VCB-123: TypeSpec GitHub issues action uses a deterministic terminal mutation", async () => {
  const sourceText = `version: 1
cases:
  - id: typespec-github-issues
    scenarioId: VCB-123
    workItemIds: [123]
    steps: [scaffold, check, configure-action]
steps:
  scaffold:
    type: scaffold
    with:
      template: da/typespec
      answers:
        - question: daTemplate
          value: typespec
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: src/agent/main.tsp
        expect:
          exists: true
  configure-action:
    type: configureTypeSpecAction
    with:
      action: github-issues
`;
  const result = await compileCaseBundle({
    compileStep: createSemanticStepCompiler(),
    sourcePath: "cases/da-typespec-with-action.yml",
    sourceText,
  });

  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const plan = result.value[0].plan;
  assert.equal(
    plan.steps.some((step) =>
      step.description.includes(
        "Start with TypeSpec for Microsoft 365 Copilot",
      ),
    ),
    true,
  );
  const mutation = plan.steps.filter((step) =>
    step.step_id.startsWith("step_configureTypeSpecGitHubIssuesAction_"),
  );
  assert.deepEqual(
    mutation.map((step) => [step.agent, step.tool]),
    [
      ["interaction", "keyboard_shortcut"],
      ["assertion", ""],
      ["interaction", "type_text"],
      ["interaction", "key_press"],
      ["assertion", ""],
      ["interaction", "keyboard_shortcut"],
      ["assertion", ""],
    ],
  );
  assert.equal(
    mutation.some((step) => step.agent === "code"),
    false,
  );
  const command = mutation.find((step) => step.tool === "type_text");
  assert.equal(
    command.parameters.text.includes(
      "/home/vscode/AgentsToolkitProjects/${{var:app_name}}",
    ),
    true,
  );
  assert.equal(command.parameters.text.includes("src/agent/main.tsp"), false);
  assert.equal(command.parameters.text.includes("range(16"), false);
  assert.equal(
    command.parameters.text.includes("VSCUSE_TYPESPEC_ACTION_CONFIGURED"),
    false,
  );
  assert.equal(
    command.parameters.text.includes(
      "printf '\\nVSCUSE_TYPESPEC_ACTION_%s\\n' CONFIGURED",
    ),
    true,
  );
  const markerAssertion = mutation.find(
    (step) =>
      step.agent === "assertion" &&
      step.description.includes("VSCUSE_TYPESPEC_ACTION_CONFIGURED"),
  );
  assert.equal(
    markerAssertion.description,
    "@assertion the VS Code integrated terminal visibly displays the complete text VSCUSE_TYPESPEC_ACTION_CONFIGURED.",
  );

  for (const invalidInput of [
    "action: unknown",
    "action: github-issues\n      path: other.tsp",
  ]) {
    const invalid = await compileCaseBundle({
      compileStep: createSemanticStepCompiler(),
      sourcePath: "cases/da-typespec-with-action.yml",
      sourceText: sourceText.replace("action: github-issues", invalidInput),
    });
    assert.equal(invalid.ok, false);
    assert.equal(
      invalid.diagnostics[0].code,
      "VCB_TYPESPEC_ACTION_INPUT_INVALID",
    );
  }
});

test("VCB-124: TypeSpec single environment skips the provision picker", async () => {
  const result = await compileFixture(
    "da-typespec-with-action.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const descriptions = result.value[0].plan.steps.map(
    (step) => step.description,
  );
  assert.equal(
    descriptions.includes(
      "@assertion the active prompt titled Select an environment is visible and the option dev is selectable.",
    ),
    false,
  );
  assert.equal(
    descriptions.includes("Click the dev option in the active prompt."),
    false,
  );
  assert.equal(
    descriptions.includes(
      "@assertion a visible Visual Studio Code notification contains the literal text provision stage executed successfully. A notification with different text, including an in-progress notification, does not satisfy this assertion.",
    ),
    true,
  );
});

test("VCB-129: TypeSpec action configuration clears notifications before opening its terminal", async () => {
  const result = await compileFixture(
    "da-typespec-with-action.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const steps = result.value[0].plan.steps;
  const terminalIndex = steps.findIndex((step) =>
    step.step_id.startsWith(
      "step_configureTypeSpecGitHubIssuesAction_openTerminal_",
    ),
  );
  assert.notEqual(terminalIndex, -1);
  assert.deepEqual(
    steps
      .slice(terminalIndex - 5, terminalIndex)
      .map((step) => [step.agent, step.tool]),
    [
      ["interaction", "key_press"],
      ["assertion", ""],
      ["interaction", "type_text"],
      ["assertion", ""],
      ["interaction", "key_press"],
    ],
  );
  assert.equal(
    steps[terminalIndex - 3].parameters.text,
    "Notifications: Clear All Notifications",
  );
  assert.deepEqual(steps[terminalIndex].depends_on, [
    steps[terminalIndex - 1].step_id,
  ]);
});

test("VCB-88: a local environment step names its variable and verifies its own write", async () => {
  const result = await compileFixture(
    "weather-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const generated = result.value.find(
    (candidate) => candidate.caseId === "weather-ts-openai-local-teams",
  );
  const step = generated.plan.steps.find((candidate) =>
    candidate.step_id.startsWith("step_setLocalEnvironmentVariable_"),
  );

  assert.equal(step.description.includes("OPENAI_BASE_URL"), true);
  assert.equal(
    step.parameters.sample.includes(
      'if not value:\n    raise AssertionError("The variable value resolved to nothing")',
    ),
    true,
  );
  assert.equal(
    step.parameters.sample.includes(
      'if written != [indent + name + ": " + value]:',
    ),
    true,
  );
});

test("VCB-76: a shell-unsafe local environment value fails the compilation", async () => {
  const result = await compileFixture("weather-agent.yml", (sourceText) =>
    sourceText.replace(
      'OPENAI_BASE_URL: "${{env:AZURE_OPENAI_ENDPOINT}}/openai/v1"',
      'OPENAI_BASE_URL: "$(id)"',
    ),
  );

  assert.equal(result.ok, false);
  assert.equal(
    result.diagnostics[0].code,
    "VCB_LOCAL_ENVIRONMENT_INPUT_INVALID",
  );
});

test("VCB-77: an Azure lifecycle waits longer for its notification than a local operation", async () => {
  const result = await compileFixture(
    "basic-custom-engine-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const plan = result.value.find(
    (generated) =>
      generated.caseId === "basic-cea-py-azure-openai-remote-teams",
  ).plan;
  const timeoutOf = (text) => {
    const step = plan.steps.find(
      (candidate) =>
        candidate.step_id.startsWith("step_assertNotificationContains_") &&
        candidate.description.includes(text),
    );
    assert.notEqual(step, undefined);
    return step.tags.find((tag) => tag.startsWith("step_retry_timeout: "));
  };
  assert.equal(
    timeoutOf("provision stage executed successfully"),
    "step_retry_timeout: 900",
  );
  assert.equal(
    timeoutOf("actions in deploy stage executed successfully"),
    "step_retry_timeout: 900",
  );
  assert.equal(
    timeoutOf("The following environment is selected:"),
    "step_retry_timeout: 300",
  );
});

test("VCB-78: a Chrome target signs the launched browser in before asserting readiness", async () => {
  const result = await compileFixture(
    "basic-custom-engine-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  for (const caseId of [
    "basic-cea-py-azure-openai-local-teams",
    "basic-cea-py-azure-openai-remote-teams",
  ]) {
    const plan = result.value.find(
      (generated) => generated.caseId === caseId,
    ).plan;
    const launchIndex = plan.steps.findIndex(
      (step) =>
        step.tool === "key_press" &&
        step.step_id.startsWith("step_filterOption_confirm_"),
    );
    const passwordIndex = plan.steps.findIndex((step) =>
      step.step_id.startsWith("step_browserM365PasswordSignIn_enterPassword_"),
    );
    const readyIndex = plan.steps.findIndex((step) =>
      step.step_id.startsWith("step_assertReady_assertReady_"),
    );
    assert.notEqual(passwordIndex, -1, caseId);
    assert.equal(launchIndex < passwordIndex, true, caseId);
    assert.equal(passwordIndex < readyIndex, true, caseId);
  }
});

test("VCB-79: the password prompt is focused before the password is typed", async () => {
  const result = await compileFixture(
    "basic-custom-engine-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const plan = result.value.find(
    (generated) => generated.caseId === "basic-cea-py-azure-openai-local-teams",
  ).plan;
  const focusIndex = plan.steps.findIndex((step) =>
    step.step_id.startsWith("step_browserM365PasswordSignIn_focusPassword_"),
  );
  const passwordIndex = plan.steps.findIndex((step) =>
    step.step_id.startsWith("step_browserM365PasswordSignIn_enterPassword_"),
  );

  assert.notEqual(focusIndex, -1);
  assert.equal(plan.steps[focusIndex].tool, "click");
  assert.equal(focusIndex < passwordIndex, true);
});

test("VCB-80: a lifecycle operation clears the notification center before it starts", async () => {
  const result = await compileFixture(
    "basic-custom-engine-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const plan = result.value.find(
    (generated) =>
      generated.caseId === "basic-cea-py-azure-openai-remote-teams",
  ).plan;
  const commands = plan.steps
    .filter((step) => step.step_id.startsWith("step_executeCommand_filter_"))
    .map((step) => step.parameters.text);

  for (const title of [
    "Microsoft 365 Agents: Provision",
    "Microsoft 365 Agents: Deploy",
  ]) {
    const index = commands.indexOf(title);
    assert.notEqual(index, -1, title);
    assert.deepEqual(commands.slice(index - 2, index), [
      "Notifications: Clear All Notifications",
      "Notifications: Show Notifications",
    ]);
  }
});

test("VCB-74: the remote Copilot target requires provision and deploy", async () => {
  const result = await compileFixture("weather-agent.yml", (sourceText) =>
    sourceText.replace(
      "        deploy,\n        f5-copilot-remote,",
      "        f5-copilot-remote,",
    ),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_TARGET_PREREQUISITE");
});

test("VCB-26: an already-ready Copilot target makes its open emit no step", async () => {
  const result = await compileFixture(
    "da-no-action.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  assert.equal(
    result.value[0].plan.steps.filter(
      (step) =>
        step.description ===
        "@assertion Microsoft 365 Copilot shows an agent's chat open in the main section with a visible message input.",
    ).length,
    1,
  );
});

test("semantic adapter requires an immediate post-scaffold file check", async () => {
  const result = await compileFixture("da-no-action.yml", (sourceText) =>
    sourceText.replace("        check-da-no-action,\n", ""),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_OPERATION_ORDER");
});

test("VCB-141: file checks preserve compiler-owned script semantics", async () => {
  const result = await compileFixture(
    "weather-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const fileChecks = result.value[0].plan.steps.filter((step) =>
    step.tags.includes("assertion:file"),
  );
  assert.notEqual(fileChecks.length, 0);
  for (const step of fileChecks) {
    assert.equal(
      step.description,
      "@code execute the supplied generated bash script exactly as authored and read its exact PROJECT_DIR under /home/vscode/AgentsToolkitProjects/ from that script; verify its project-relative file assertions, project files are not VS Code .code-workspace files, do not use /workspace, and do not log file contents.",
    );
  }
});

test("VCB-43: Copilot readiness requires an open agent chat", async () => {
  const readySubject = (result) =>
    result.value[0].plan.steps
      .map((step) => step.description)
      .find((description) => description.includes("agent's chat open"));
  const suffixed = await compileFixture(
    "da-no-action.yml",
    (sourceText) => sourceText,
  );
  const unsuffixed = await compileFixture(
    "da-api-plugin-from-existing-api.yml",
    (sourceText) => sourceText,
  );

  assert.equal(suffixed.ok, true);
  assert.equal(unsuffixed.ok, true);
  assert.equal(
    readySubject(suffixed),
    "@assertion Microsoft 365 Copilot shows an agent's chat open in the main section with a visible message input.",
  );
  assert.equal(readySubject(unsuffixed), readySubject(suffixed));
  assert.doesNotMatch(readySubject(suffixed), /\$\{\{var:app_name\}\}/);
});

test("VCB-143: Copilot readiness does not require an Agents list selection", async () => {
  const result = await compileFixture(
    "da-no-action.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const readiness = result.value[0].plan.steps.find(
    (step) =>
      step.tags.includes("component:browser") &&
      step.tags.includes("action:assert-ready"),
  );
  assert.equal(
    readiness?.description,
    "@assertion Microsoft 365 Copilot shows an agent's chat open in the main section with a visible message input.",
  );
  assert.doesNotMatch(readiness?.description ?? "", /Agents list|selected/);
});

test("VCB-44: the Copilot message input is read independently of its placeholder", async () => {
  const result = await compileFixture(
    "da-no-action.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const descriptions = result.value[0].plan.steps.map(
    (step) => step.description,
  );
  // Copilot ships the previewed agent page in placeholder variants, so reading
  // either name through the placeholder names a control that is sometimes
  // absent.
  assert.equal(
    descriptions.includes(
      "@assertion the Microsoft 365 Copilot message input is visible in the open agent chat.",
    ),
    true,
  );
  assert.equal(
    descriptions.includes(
      'Click the "Message" input box in the Microsoft 365 Copilot web application.',
    ),
    true,
  );
  assert.equal(
    descriptions.some((description) =>
      description.includes("Message ${{var:app_name}}"),
    ),
    false,
  );
  assert.equal(
    descriptions.some((description) => description.includes("Message Copilot")),
    false,
  );
});

test("VCB-125: Copilot assertions do not normalize or compare the app name", async () => {
  const result = await compileFixture(
    "da-no-action.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const descriptions = result.value[0].plan.steps.map(
    (step) => step.description,
  );
  assert.equal(
    descriptions.includes(
      "@assertion Microsoft 365 Copilot shows an agent's chat open in the main section with a visible message input.",
    ),
    true,
  );
  assert.equal(
    descriptions.includes(
      "@assertion the Microsoft 365 Copilot message input is visible in the open agent chat.",
    ),
    true,
  );
  assert.equal(
    descriptions.some((description) =>
      description.includes("${{var:app_name}}"),
    ),
    false,
  );
});

test("VCB-45: scaffolding ends by waiting for the reopened project window", async () => {
  const result = await compileFixture(
    "da-no-action.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const steps = result.value[0].plan.steps;
  const descriptions = steps.map((step) => step.description);
  const readyIndex = descriptions.indexOf(
    "@assertion the Preview README.md editor tab is open in Visual Studio Code.",
  );
  const lastScaffoldAnswerIndex = descriptions.lastIndexOf(
    "Press Enter to submit the accepted text input.",
  );
  const firstToolkitUiIndex = descriptions.indexOf(
    "@assertion the Command Palette input box reads >View: Show Microsoft 365 Agents Toolkit and the highlighted command listed under it is titled View: Show Microsoft 365 Agents Toolkit.",
  );

  // The reopened window has to activate the toolkit again before any later
  // operation can address a command or view the toolkit contributes.
  assert.equal(readyIndex > lastScaffoldAnswerIndex, true);
  assert.equal(readyIndex < firstToolkitUiIndex, true);
});

test("VCB-46: a login after another login signs in from the account picker", async () => {
  const withBothAccounts = await compileFixture(
    "weather-agent.yml",
    (sourceText) => sourceText,
  );
  const withOneAccount = await compileFixture(
    "da-no-action.yml",
    (sourceText) => sourceText,
  );

  assert.equal(withBothAccounts.ok, true);
  assert.equal(withOneAccount.ok, true);
  const pickerStepId = /^step_signInM365FromPicker_useAnotherAccount_/;
  const signInStepId = /^step_signIn(M365|Azure)_assertOption_/;

  // Azure signs in first from a signed-out browser, so only the Microsoft 365
  // sign-in that follows it meets the account picker.
  const bothSteps = withBothAccounts.value[0].plan.steps;
  assert.equal(
    bothSteps.filter((step) => signInStepId.test(step.step_id)).length,
    1,
  );
  assert.equal(
    bothSteps.filter((step) => pickerStepId.test(step.step_id)).length,
    1,
  );

  // A case with a single login starts from the signed-out browser the profile
  // guarantees, so it keeps the account-input recording.
  const oneSteps = withOneAccount.value[0].plan.steps;
  assert.equal(
    oneSteps.filter((step) => signInStepId.test(step.step_id)).length,
    1,
  );
  assert.equal(
    oneSteps.some((step) => pickerStepId.test(step.step_id)),
    false,
  );
});

test("VCB-46: an account with no account-picker recording fails to compile", async () => {
  const result = await compileFixture("weather-agent.yml", (sourceText) =>
    sourceText
      .replace(
        "        login-azure,\n        login-m365,",
        "        login-m365,\n        login-azure,",
      )
      .replace(
        "        login-azure,\n        login-m365,",
        "        login-m365,\n        login-azure,",
      ),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_ACCOUNT_PICKER_UNSUPPORTED");
});

test("VCB-47: every sign-in verifies the account in the ACCOUNTS section", async () => {
  const result = await compileFixture(
    "weather-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const steps = result.value[0].plan.steps;
  const readySteps = steps.filter((step) =>
    /^step_signIn[A-Za-z0-9]*_assertReady_/.test(step.step_id),
  );

  // Azure and Microsoft 365 both converge on the same sidebar assertion.
  assert.equal(readySteps.length, 2);
  for (const step of readySteps) {
    assert.match(step.description, /the "ACCOUNTS" section lists/);
    assert.match(step.description, /trailing ellipsis\.$/);
    assert.equal(
      steps.some(
        (other) =>
          other.depends_on.includes(step.step_id) &&
          other.step_id.startsWith("step_signIn"),
      ),
      false,
    );
  }

  // No sign-in adapter reopens the account menu after the browser closes.
  assert.equal(
    steps.some((step) =>
      /^step_signIn[A-Za-z0-9]*_(reopenAccounts|filterAccounts|openAccounts|closeAccounts)_/.test(
        step.step_id,
      ),
    ),
    false,
  );
});

test("semantic adapter requires chat-ready state before a chat check", async () => {
  const result = await compileFixture("weather-agent.yml", (sourceText) =>
    sourceText.replace("        open-app,\n", ""),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_CHAT_ADAPTER_UNKNOWN");
});

test("semantic adapter rejects unknown nested assertion fields", async () => {
  const result = await compileFixture("weather-agent.yml", (sourceText) =>
    sourceText.replace("contains: [Seattle]", "contain: [Seattle]"),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_CHECK_FIELD_UNKNOWN");
});

test("VCB-38: a chat check without an expectation sends without asserting the reply", async () => {
  const result = await compileFixture("weather-agent.yml", (sourceText) =>
    sourceText.replace(
      "        expect:\n          replied: true\n          contains: [Seattle]\n",
      "",
    ),
  );

  assert.equal(result.ok, true);
  const descriptions = result.value[0].plan.steps.map(
    (step) => step.description,
  );
  assert.equal(
    descriptions.includes(
      "@assertion the current assistant turn is complete and contains a non-empty response.",
    ),
    false,
  );
  assert.equal(
    descriptions.filter((description) =>
      description.includes("What is the weather in Seattle?"),
    ).length > 0,
    true,
  );
});

test("VCB-38: an empty chat expectation still fails", async () => {
  const result = await compileFixture("weather-agent.yml", (sourceText) =>
    sourceText.replace(
      "        expect:\n          replied: true\n          contains: [Seattle]\n",
      "        expect: {}\n",
    ),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_CHECK_ASSERTION_INVALID");
});

test("semantic adapter requires Azure login before prompted ARM provision", async () => {
  const result = await compileFixture("weather-agent.yml", (sourceText) =>
    sourceText.replace(
      "        login-azure,\n        login-m365,\n        provision-arm,",
      "        provision-arm,\n        login-azure,\n        login-m365,",
    ),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_PROVISION_PREREQUISITE");
});

const teamsAgentWithDataBundles = [
  ["custom-copilot-rag-customize.yml", "Customize"],
  ["custom-copilot-rag-azure-ai-search.yml", "Azure AI Search"],
  ["custom-copilot-rag-custom-api.yml", "Custom API"],
];

test("VCB-108: Teams Agent with Data cases resolve the full data source selector path", async () => {
  for (const [fileName, sourceLabel] of teamsAgentWithDataBundles) {
    const result = await compileFixture(fileName, (sourceText) => sourceText);
    assert.equal(result.ok, true, result.diagnostics?.[0]?.code);

    for (const generated of result.value) {
      const typed = generated.plan.steps
        .map((step) => step.parameters?.text)
        .filter((text) => typeof text === "string");

      assert.equal(
        typed.includes("Teams Agents and Apps"),
        true,
        generated.caseId,
      );
      assert.equal(
        typed.includes("Teams Agent with Data"),
        true,
        generated.caseId,
      );
      assert.equal(typed.includes(sourceLabel), true, generated.caseId);
      assert.equal(
        generated.plan.steps.some((step) =>
          step.description?.includes(
            "Teams Agent or App Using Microsoft Teams SDK",
          ),
        ),
        true,
        generated.caseId,
      );
      assert.equal(
        generated.plan.steps.filter((step) =>
          step.description?.includes("Teams Agent with Data"),
        ).length > 0,
        true,
        generated.caseId,
      );
    }
  }
});

test("VCB-109: the Teams Agent with Data OpenAPI document answer picks the URL item before typing it", async () => {
  const specUrl =
    "https://raw.githubusercontent.com/SLdragon/example-openapi-spec/main/real-no-auth.yaml";
  const result = await compileFixture(
    "custom-copilot-rag-custom-api.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);

  for (const generated of result.value) {
    const typed = generated.plan.steps
      .map((step) => step.parameters?.text)
      .filter((text) => typeof text === "string");
    const pickIndex = typed.indexOf("Enter OpenAPI Document URL");
    const urlIndex = typed.indexOf(specUrl);

    assert.notEqual(pickIndex, -1, generated.caseId);
    assert.notEqual(urlIndex, -1, generated.caseId);
    assert.equal(pickIndex < urlIndex, true, generated.caseId);
    assert.equal(
      generated.plan.steps.filter(
        (step) =>
          step.description ===
          "@assertion the active prompt titled OpenAPI Document is visible.",
      ).length,
      2,
      generated.caseId,
    );
  }

  const declarativeAgent = await compileFixture(
    "da-api-plugin-from-existing-api.yml",
    (sourceText) => sourceText,
  );
  assert.equal(
    declarativeAgent.ok,
    true,
    declarativeAgent.diagnostics?.[0]?.code,
  );
  for (const generated of declarativeAgent.value) {
    // The declarative agent answers the spec type first, so the item that opens
    // the input box belongs to that earlier prompt and the OpenAPI document
    // prompt itself stays a single input box.
    assert.equal(
      generated.plan.steps.filter(
        (step) =>
          step.description ===
          "@assertion the active prompt titled OpenAPI Document is visible.",
      ).length,
      1,
      generated.caseId,
    );
  }
});

test("VCB-110: the operation prompt names the surface the answered flow reaches", async () => {
  const teamsAgent = await compileFixture(
    "custom-copilot-rag-custom-api.yml",
    (sourceText) => sourceText,
  );
  assert.equal(teamsAgent.ok, true, teamsAgent.diagnostics?.[0]?.code);
  for (const generated of teamsAgent.value) {
    const descriptions = generated.plan.steps.map(
      (step) => step.description || "",
    );
    assert.equal(
      descriptions.some((description) =>
        description.includes("Select Operation(s) Teams Can Interact with"),
      ),
      true,
      generated.caseId,
    );
    assert.equal(
      descriptions.some((description) =>
        description.includes("Select Operation(s) Copilot Can Interact with"),
      ),
      false,
      generated.caseId,
    );
  }

  const declarativeAgent = await compileFixture(
    "da-api-plugin-from-existing-api.yml",
    (sourceText) => sourceText,
  );
  assert.equal(
    declarativeAgent.ok,
    true,
    declarativeAgent.diagnostics?.[0]?.code,
  );
  for (const generated of declarativeAgent.value) {
    const descriptions = generated.plan.steps.map(
      (step) => step.description || "",
    );
    assert.equal(
      descriptions.some((description) =>
        description.includes("Select Operation(s) Copilot Can Interact with"),
      ),
      true,
      generated.caseId,
    );
  }
});

test("VCB-111: the Teams Agent with Data bundles cover their launch matrix and supply unprompted credentials", async () => {
  const customize = await compileFixture(
    "custom-copilot-rag-customize.yml",
    (sourceText) => sourceText,
  );
  assert.equal(customize.ok, true, customize.diagnostics?.[0]?.code);
  assert.deepEqual(customize.value.map((entry) => entry.caseId).sort(), [
    "rag-customize-js-azure-openai-local-copilot",
    "rag-customize-js-azure-openai-local-teams",
    "rag-customize-js-azure-openai-playground",
    "rag-customize-js-azure-openai-remote-copilot",
    "rag-customize-js-azure-openai-remote-teams",
    "rag-customize-js-openai-local-copilot",
    "rag-customize-js-openai-local-teams",
    "rag-customize-js-openai-remote-copilot",
    "rag-customize-js-openai-remote-teams",
    "rag-customize-py-azure-openai-local-copilot",
    "rag-customize-py-azure-openai-local-teams",
    "rag-customize-py-azure-openai-playground",
    "rag-customize-py-azure-openai-remote-copilot",
    "rag-customize-py-azure-openai-remote-teams",
    "rag-customize-py-openai-local-copilot",
    "rag-customize-py-openai-local-teams",
    "rag-customize-py-openai-remote-copilot",
    "rag-customize-py-openai-remote-teams",
    "rag-customize-ts-azure-openai-local-copilot",
    "rag-customize-ts-azure-openai-local-teams",
    "rag-customize-ts-azure-openai-playground",
    "rag-customize-ts-azure-openai-remote-copilot",
    "rag-customize-ts-azure-openai-remote-teams",
    "rag-customize-ts-openai-local-copilot",
    "rag-customize-ts-openai-local-teams",
    "rag-customize-ts-openai-remote-copilot",
    "rag-customize-ts-openai-remote-teams",
  ]);
  for (const generated of customize.value) {
    assert.equal(
      generated.plan.plan_metadata.tags.includes(
        "feature_flag:TEAMSFX_CEA_ENABLED=true",
      ),
      generated.caseId.endsWith("-copilot"),
      generated.caseId,
    );
  }

  const search = await compileFixture(
    "custom-copilot-rag-azure-ai-search.yml",
    (sourceText) => sourceText,
  );
  assert.equal(search.ok, true, search.diagnostics?.[0]?.code);
  assert.deepEqual(search.value.map((entry) => entry.caseId).sort(), [
    "rag-azure-ai-search-js-azure-openai-local-teams",
    "rag-azure-ai-search-js-azure-openai-playground",
    "rag-azure-ai-search-js-azure-openai-remote-teams",
    "rag-azure-ai-search-js-openai-local-teams",
    "rag-azure-ai-search-js-openai-remote-teams",
    "rag-azure-ai-search-py-azure-openai-local-teams",
    "rag-azure-ai-search-py-azure-openai-playground",
    "rag-azure-ai-search-py-azure-openai-remote-teams",
    "rag-azure-ai-search-py-openai-local-teams",
    "rag-azure-ai-search-py-openai-remote-teams",
    "rag-azure-ai-search-ts-azure-openai-local-teams",
    "rag-azure-ai-search-ts-azure-openai-playground",
    "rag-azure-ai-search-ts-azure-openai-remote-teams",
    "rag-azure-ai-search-ts-openai-local-teams",
    "rag-azure-ai-search-ts-openai-remote-teams",
  ]);
  for (const generated of search.value) {
    const usesLocalEnvironment = generated.caseId.includes("-local-teams");
    const credentialNames = generated.plan.steps.flatMap((step) => {
      if (
        usesLocalEnvironment &&
        step.step_id?.startsWith("step_setLocalEnvironmentVariable_")
      ) {
        return (
          step.parameters.sample.match(/VARIABLE_NAME="([^"]+)"/)?.[1] ?? ""
        );
      }
      if (
        !usesLocalEnvironment &&
        step.step_id?.includes("step_setUserEnvironmentVariable_typeCommand_")
      ) {
        return step.parameters.text.match(/VARIABLE_NAME="([^"]+)"/)?.[1] ?? "";
      }
      return [];
    });

    assert.equal(
      credentialNames.includes(
        usesLocalEnvironment ? "AZURE_SEARCH_KEY" : "SECRET_AZURE_SEARCH_KEY",
      ),
      true,
      generated.caseId,
    );
    assert.equal(
      credentialNames.includes("AZURE_SEARCH_ENDPOINT"),
      true,
      generated.caseId,
    );

    const usesAzureOpenAI = generated.caseId.includes("-azure-openai-");
    const embeddingName = generated.caseId.startsWith("rag-azure-ai-search-py-")
      ? "AZURE_OPENAI_EMBEDDING_DEPLOYMENT"
      : "AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME";
    assert.equal(
      credentialNames.includes(embeddingName),
      usesAzureOpenAI,
      generated.caseId,
    );
  }

  const customApi = await compileFixture(
    "custom-copilot-rag-custom-api.yml",
    (sourceText) => sourceText,
  );
  assert.equal(customApi.ok, true, customApi.diagnostics?.[0]?.code);
  assert.deepEqual(customApi.value.map((entry) => entry.caseId).sort(), [
    "feature-local-debug-custom-api-without-openai-key",
    "rag-custom-api-js-azure-openai-local-teams",
    "rag-custom-api-js-azure-openai-playground",
    "rag-custom-api-js-azure-openai-remote-teams",
    "rag-custom-api-js-openai-local-teams",
    "rag-custom-api-js-openai-remote-teams",
    "rag-custom-api-py-azure-openai-local-teams",
    "rag-custom-api-py-azure-openai-playground",
    "rag-custom-api-py-azure-openai-remote-teams",
    "rag-custom-api-py-openai-local-teams",
    "rag-custom-api-py-openai-remote-teams",
    "rag-custom-api-ts-azure-openai-local-teams",
    "rag-custom-api-ts-azure-openai-playground",
    "rag-custom-api-ts-azure-openai-remote-teams",
    "rag-custom-api-ts-openai-local-teams",
    "rag-custom-api-ts-openai-remote-teams",
  ]);
});

test("VCB-133: retained RAG Customize local Copilot plans have semantic replacements", async () => {
  const result = await compileFixture(
    "custom-copilot-rag-customize.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.[0]));

  for (const [caseId, workItemId] of [
    ["rag-customize-ts-openai-local-copilot", "36031897"],
    ["rag-customize-js-openai-local-copilot", "36031895"],
    ["rag-customize-ts-azure-openai-local-copilot", "36048259"],
    ["rag-customize-js-azure-openai-local-copilot", "36048248"],
    ["rag-customize-py-azure-openai-local-copilot", "36048572"],
  ]) {
    const generated = result.value.find((entry) => entry.caseId === caseId);
    assert.notEqual(generated, undefined, caseId);
    assert.equal(
      generated.plan.plan_metadata.description.workitem,
      workItemId,
      caseId,
    );
    assert.equal(
      generated.plan.plan_metadata.tags.includes(
        "feature_flag:TEAMSFX_CEA_ENABLED=true",
      ),
      true,
      caseId,
    );

    const typedValues = generated.plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    assert.equal(
      typedValues.includes("Debug in Copilot (Chrome)"),
      true,
      caseId,
    );
    assert.equal(
      generated.plan.steps.some((step) =>
        step.step_id.startsWith("step_sendCopilotMessage_"),
      ),
      true,
      caseId,
    );

    const usesAzureOpenAI = caseId.includes("-azure-openai-");
    assert.equal(
      typedValues.includes(
        usesAzureOpenAI
          ? "Tell me the history of Contoso Electronics, format in a table."
          : "How to develop agent for Teams?",
      ),
      true,
      caseId,
    );
    assert.equal(
      generated.plan.steps.some((step) =>
        step.step_id.startsWith("step_assertChatNotContains_"),
      ),
      true,
      caseId,
    );
    assert.equal(
      generated.plan.steps.some(
        (step) =>
          typeof step.parameters.sample === "string" &&
          step.parameters.sample.includes('VARIABLE_NAME="OPENAI_BASE_URL"'),
      ),
      !usesAzureOpenAI,
      caseId,
    );
  }
});

test("VCB-134: retained RAG Customize remote Copilot plans have semantic replacements", async () => {
  const result = await compileFixture(
    "custom-copilot-rag-customize.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.[0]));

  for (const [caseId, workItemId] of [
    ["rag-customize-ts-openai-remote-copilot", "36031917"],
    ["rag-customize-js-openai-remote-copilot", "36031915"],
    ["rag-customize-py-openai-remote-copilot", "36031923"],
    ["rag-customize-ts-azure-openai-remote-copilot", "36048528"],
    ["rag-customize-js-azure-openai-remote-copilot", "36048277"],
    ["rag-customize-py-azure-openai-remote-copilot", "36048992"],
  ]) {
    const generated = result.value.find((entry) => entry.caseId === caseId);
    assert.notEqual(generated, undefined, caseId);
    assert.equal(
      generated.plan.plan_metadata.description.workitem,
      workItemId,
      caseId,
    );
    assert.equal(
      generated.plan.plan_metadata.tags.includes(
        "feature_flag:TEAMSFX_CEA_ENABLED=true",
      ),
      true,
      caseId,
    );

    const typedValues = generated.plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    for (const value of [
      "Microsoft 365 Agents: Provision",
      "Microsoft 365 Agents: Deploy",
      "Launch Remote in Copilot (Chrome)",
    ]) {
      assert.equal(typedValues.includes(value), true, `${caseId}: ${value}`);
    }
    assert.equal(
      generated.plan.steps.some((step) =>
        step.step_id.startsWith("step_sendCopilotMessage_"),
      ),
      true,
      caseId,
    );

    const usesAzureOpenAI = caseId.includes("-azure-openai-");
    assert.equal(
      typedValues.includes(
        usesAzureOpenAI
          ? "Tell me the history of Contoso Electronics, format in a table."
          : "How to develop agent for Teams?",
      ),
      true,
      caseId,
    );
    assert.equal(
      generated.plan.steps.some((step) =>
        step.step_id.startsWith("step_assertChatNotContains_"),
      ),
      true,
      caseId,
    );
    assert.equal(
      typedValues.includes("${{secret:AZURE_OPENAI_API_KEY}}"),
      true,
      caseId,
    );
  }
});

test("VCB-135: retained Custom API Azure OpenAI remote Teams plans have semantic replacements", async () => {
  const result = await compileFixture(
    "custom-copilot-rag-custom-api.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.[0]));

  for (const [caseId, workItemId, prompt] of [
    [
      "rag-custom-api-ts-azure-openai-remote-teams",
      "28891618",
      "get repairs assign karin",
    ],
    [
      "rag-custom-api-js-azure-openai-remote-teams",
      "28891605",
      "get repairs assign karin",
    ],
    [
      "rag-custom-api-py-azure-openai-remote-teams",
      "29165758",
      "list all repairs without auth",
    ],
  ]) {
    const generated = result.value.find((entry) => entry.caseId === caseId);
    assert.notEqual(generated, undefined, caseId);
    assert.equal(
      generated.plan.plan_metadata.description.workitem,
      workItemId,
      caseId,
    );

    const typedValues = generated.plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    const remoteProfile = caseId.includes("-py-")
      ? "Launch Remote (Chrome)"
      : "Launch Remote in Teams (Chrome)";
    for (const value of [
      "Microsoft 365 Agents: Provision",
      "Microsoft 365 Agents: Deploy",
      remoteProfile,
      prompt,
    ]) {
      assert.equal(typedValues.includes(value), true, `${caseId}: ${value}`);
    }
    assert.equal(
      generated.plan.steps.some((step) =>
        step.step_id.startsWith("step_assertChatNotContains_"),
      ),
      true,
      caseId,
    );
    assert.equal(
      typedValues.includes("Python: Create Environment..."),
      caseId.includes("-py-"),
      caseId,
    );
  }
});

test("VCB-136: retained Custom API OpenAI remote Teams plans have semantic replacements", async () => {
  const result = await compileFixture(
    "custom-copilot-rag-custom-api.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.[0]));

  for (const [caseId, workItemId] of [
    ["rag-custom-api-ts-openai-remote-teams", "28939523"],
    ["rag-custom-api-js-openai-remote-teams", "28939529"],
  ]) {
    const generated = result.value.find((entry) => entry.caseId === caseId);
    assert.notEqual(generated, undefined, caseId);
    assert.equal(
      generated.plan.plan_metadata.description.workitem,
      workItemId,
      caseId,
    );

    const typedValues = generated.plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    for (const value of [
      "${{secret:AZURE_OPENAI_API_KEY}}",
      "Microsoft 365 Agents: Provision",
      "Microsoft 365 Agents: Deploy",
      "Launch Remote in Teams (Chrome)",
      "List all repairs without auth",
    ]) {
      assert.equal(typedValues.includes(value), true, `${caseId}: ${value}`);
    }
    assert.equal(
      generated.plan.steps.some((step) =>
        step.step_id.startsWith("step_assertChatReplied_"),
      ),
      true,
      caseId,
    );
    assert.equal(
      generated.plan.steps.some((step) =>
        step.step_id.startsWith("step_assertChatNotContains_"),
      ),
      true,
      caseId,
    );
  }
});

test("VCB-137: retained RAG Customize Azure OpenAI Playground plans have semantic replacements", async () => {
  const result = await compileFixture(
    "custom-copilot-rag-customize.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.[0]));

  for (const [caseId, workItemId] of [
    ["rag-customize-ts-azure-openai-playground", "36230313"],
    ["rag-customize-js-azure-openai-playground", "36229473"],
    ["rag-customize-py-azure-openai-playground", "36231322"],
  ]) {
    const generated = result.value.find((entry) => entry.caseId === caseId);
    assert.notEqual(generated, undefined, caseId);
    assert.equal(
      generated.plan.plan_metadata.description.workitem,
      workItemId,
      caseId,
    );

    const typedValues = generated.plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    for (const value of [
      "Debug in Microsoft 365 Agents Playground",
      "hi",
      "List Contoso history in table",
    ]) {
      assert.equal(typedValues.includes(value), true, `${caseId}: ${value}`);
    }
    assert.equal(
      typedValues.filter((value) =>
        ["hi", "List Contoso history in table"].includes(value),
      ).length,
      2,
      caseId,
    );
    assert.equal(
      generated.plan.steps.some((step) =>
        step.step_id.startsWith("step_sendPlaygroundMessage_"),
      ),
      true,
      caseId,
    );
    assert.equal(
      generated.plan.steps.some((step) =>
        step.step_id.startsWith("step_assertChatReplied_"),
      ),
      true,
      caseId,
    );
    assert.equal(
      generated.plan.steps.some((step) =>
        ["step_signInAzure_", "step_signInM365_"].some((prefix) =>
          step.step_id.startsWith(prefix),
        ),
      ),
      false,
      caseId,
    );
    assert.equal(
      typedValues.includes("Python: Create Environment..."),
      caseId.includes("-py-"),
      caseId,
    );
  }
});

test("VCB-138: retained Custom API Azure OpenAI Python Playground plan has a semantic replacement", async () => {
  const result = await compileFixture(
    "custom-copilot-rag-custom-api.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.[0]));

  const generated = result.value.find(
    (entry) => entry.caseId === "rag-custom-api-py-azure-openai-playground",
  );
  assert.notEqual(generated, undefined);
  assert.equal(generated.plan.plan_metadata.description.workitem, "36231823");

  const typedValues = generated.plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  for (const value of [
    "Python: Create Environment...",
    "Debug in Microsoft 365 Agents Playground",
    "get repairs assign Karin",
  ]) {
    assert.equal(typedValues.includes(value), true, value);
  }
  assert.equal(
    generated.plan.steps.some((step) =>
      step.step_id.startsWith("step_assertChatReplied_"),
    ),
    true,
  );
  assert.equal(
    generated.plan.steps.some((step) =>
      ["step_signInAzure_", "step_signInM365_"].some((prefix) =>
        step.step_id.startsWith(prefix),
      ),
    ),
    false,
  );
});

test("VCB-139: retained RAG Customize remote Teams plans have semantic replacements", async () => {
  const result = await compileFixture(
    "custom-copilot-rag-customize.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.[0]));

  for (const [caseId, workItemId, prompt] of [
    [
      "rag-customize-ts-openai-remote-teams",
      "36020780",
      "Compare Contoso Electronics plan",
    ],
    [
      "rag-customize-js-openai-remote-teams",
      "36022420",
      "Compare Contoso Electronics plan",
    ],
    [
      "rag-customize-ts-azure-openai-remote-teams",
      "27569142",
      "Compare Contoso Electronics plan",
    ],
    [
      "rag-customize-js-azure-openai-remote-teams",
      "27569147",
      "Compare Contoso Electronics plan",
    ],
    [
      "rag-customize-py-azure-openai-remote-teams",
      "27178092",
      "List Contoso history in table",
    ],
  ]) {
    const generated = result.value.find((entry) => entry.caseId === caseId);
    assert.notEqual(generated, undefined, caseId);
    assert.equal(
      generated.plan.plan_metadata.description.workitem,
      workItemId,
      caseId,
    );

    const typedValues = generated.plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    const remoteProfile = caseId.includes("-py-")
      ? "Launch Remote (Chrome)"
      : "Launch Remote in Teams (Chrome)";
    for (const value of [
      "Microsoft 365 Agents: Provision",
      "Microsoft 365 Agents: Deploy",
      remoteProfile,
      prompt,
    ]) {
      assert.equal(typedValues.includes(value), true, `${caseId}: ${value}`);
    }

    const usesAzureOpenAI = caseId.includes("-azure-openai-");
    const usesPython = caseId.includes("-py-");
    assert.equal(
      typedValues.includes("${{secret:AZURE_OPENAI_API_KEY}}"),
      true,
      caseId,
    );
    assert.equal(
      generated.plan.steps.some((step) =>
        step.step_id.startsWith("step_assertChatNotContains_"),
      ),
      !usesPython,
      caseId,
    );
    assert.equal(
      generated.plan.steps.some((step) =>
        step.step_id.startsWith("step_assertChatContains_"),
      ),
      usesPython,
      caseId,
    );
    assert.equal(
      typedValues.includes("Python: Create Environment..."),
      false,
      caseId,
    );
  }
});

test("VCB-140: OpenAI remote Teams replacements use Azure-compatible completions", async () => {
  const weather = await compileFixture(
    "weather-agent.yml",
    (sourceText) => sourceText,
  );
  assert.equal(weather.ok, true, JSON.stringify(weather.diagnostics?.[0]));

  for (const [caseId, workItemId] of [
    ["weather-ts-openai-remote-teams", "34648339"],
    ["weather-js-openai-remote-teams", "34648304"],
  ]) {
    const generated = weather.value.find((entry) => entry.caseId === caseId);
    assert.notEqual(generated, undefined, caseId);
    assert.equal(
      generated.plan.plan_metadata.description.workitem,
      workItemId,
      caseId,
    );
    const typedValues = generated.plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    for (const value of [
      "${{secret:AZURE_OPENAI_API_KEY}}",
      "Microsoft 365 Agents: Provision",
      "Microsoft 365 Agents: Deploy",
      "Launch Remote in Teams (Chrome)",
      "What is the weather in Seattle?",
    ]) {
      assert.equal(typedValues.includes(value), true, `${caseId}: ${value}`);
    }
    assert.equal(
      generated.plan.steps.some(
        (step) =>
          step.step_id.startsWith("step_assertChatContains_") &&
          step.description.includes("Seattle"),
      ),
      true,
      caseId,
    );
  }

  const general = await compileFixture(
    "general-teams-agent.yml",
    (sourceText) => sourceText,
  );
  assert.equal(general.ok, true, JSON.stringify(general.diagnostics?.[0]));

  for (const [caseId, workItemId] of [
    ["general-teams-ts-openai-remote-teams", "27042831"],
    ["general-teams-js-openai-remote-teams", "27042829"],
    ["general-teams-py-openai-remote-teams", "27551403"],
  ]) {
    const generated = general.value.find((entry) => entry.caseId === caseId);
    assert.notEqual(generated, undefined, caseId);
    assert.equal(
      generated.plan.plan_metadata.description.workitem,
      workItemId,
      caseId,
    );
    const typedValues = generated.plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    for (const value of [
      "${{secret:AZURE_OPENAI_API_KEY}}",
      "Microsoft 365 Agents: Provision",
      "Microsoft 365 Agents: Deploy",
      caseId.includes("-py-")
        ? "Launch Remote (Chrome)"
        : "Launch Remote in Teams (Chrome)",
      "How to develop agent for Teams?",
    ]) {
      assert.equal(typedValues.includes(value), true, `${caseId}: ${value}`);
    }
    assert.equal(
      generated.plan.steps.some((step) =>
        step.step_id.startsWith("step_assertChatNotContains_"),
      ),
      true,
      caseId,
    );
  }
});

test("VCB-156: retained Azure AI Search remote and Playground plans have exact semantic replacements", async () => {
  const result = await compileFixture(
    "custom-copilot-rag-azure-ai-search.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.[0]));

  const expectedCases = [
    {
      caseId: "rag-azure-ai-search-ts-azure-openai-remote-teams",
      workItemId: "27569083",
      target: "dev",
      profile: "Launch Remote in Teams (Chrome)",
      usesAzureOpenAI: true,
      usesPython: false,
    },
    {
      caseId: "rag-azure-ai-search-js-azure-openai-remote-teams",
      workItemId: "27569119",
      target: "dev",
      profile: "Launch Remote in Teams (Chrome)",
      usesAzureOpenAI: true,
      usesPython: false,
    },
    {
      caseId: "rag-azure-ai-search-py-azure-openai-remote-teams",
      workItemId: "27454388",
      target: "dev",
      profile: "Launch Remote (Chrome)",
      usesAzureOpenAI: true,
      usesPython: true,
    },
    {
      caseId: "rag-azure-ai-search-ts-azure-openai-playground",
      workItemId: "36534502",
      target: "playground",
      profile: "Debug in Microsoft 365 Agents Playground",
      usesAzureOpenAI: true,
      usesPython: false,
    },
    {
      caseId: "rag-azure-ai-search-js-azure-openai-playground",
      workItemId: "27569090",
      target: "playground",
      profile: "Debug in Microsoft 365 Agents Playground",
      usesAzureOpenAI: true,
      usesPython: false,
    },
    {
      caseId: "rag-azure-ai-search-py-azure-openai-playground",
      workItemId: "36534522",
      target: "playground",
      profile: "Debug in Microsoft 365 Agents Playground",
      usesAzureOpenAI: true,
      usesPython: true,
    },
    {
      caseId: "rag-azure-ai-search-ts-openai-remote-teams",
      workItemId: "28970327",
      target: "dev",
      profile: "Launch Remote in Teams (Chrome)",
      usesAzureOpenAI: false,
      usesPython: false,
    },
    {
      caseId: "rag-azure-ai-search-js-openai-remote-teams",
      workItemId: "28970337",
      target: "dev",
      profile: "Launch Remote in Teams (Chrome)",
      usesAzureOpenAI: false,
      usesPython: false,
    },
    {
      caseId: "rag-azure-ai-search-py-openai-remote-teams",
      workItemId: "27454412",
      target: "dev",
      profile: "Launch Remote (Chrome)",
      usesAzureOpenAI: false,
      usesPython: true,
    },
  ];
  const migrated = result.value
    .filter((entry) => !entry.caseId.includes("-local-teams"))
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  assert.deepEqual(
    migrated.map(({ caseId, fileName }) => [caseId, fileName]),
    expectedCases
      .map(({ caseId }) => [
        caseId,
        `custom-copilot-rag-azure-ai-search--${caseId}.json`,
      ])
      .sort(([left], [right]) => left.localeCompare(right)),
  );

  for (const expected of expectedCases) {
    const generated = migrated.find(
      (candidate) => candidate.caseId === expected.caseId,
    );
    assert.notEqual(generated, undefined, expected.caseId);
    assert.equal(
      generated.plan.plan_metadata.description.workitem,
      expected.workItemId,
      expected.caseId,
    );

    const openAIKeyPrompt = generated.plan.steps.find(
      (step) =>
        step.description ===
        "@assertion the active prompt titled OpenAI Key is visible.",
    );
    if (expected.usesAzureOpenAI) {
      assert.equal(openAIKeyPrompt, undefined, expected.caseId);
    } else {
      assert.notEqual(openAIKeyPrompt, undefined, expected.caseId);
      const scaffoldOpenAIKey = generated.plan.steps.find(
        (step) =>
          step.tool === "type_text" &&
          step.depends_on.includes(openAIKeyPrompt.step_id),
      );
      assert.notEqual(scaffoldOpenAIKey, undefined, expected.caseId);
      assert.equal(
        scaffoldOpenAIKey.parameters.text,
        "${{secret:AZURE_OPENAI_API_KEY}}",
        expected.caseId,
      );
    }

    const typedValues = generated.plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    const userEnvironmentSteps = generated.plan.steps.filter((step) =>
      step.step_id.startsWith("step_setUserEnvironmentVariable_"),
    );
    assert.notEqual(userEnvironmentSteps.length, 0, expected.caseId);
    assert.equal(
      userEnvironmentSteps.every((step) =>
        step.tags.includes("operation:user-environment"),
      ),
      true,
      expected.caseId,
    );
    const userEnvironment = userEnvironmentSteps
      .filter((step) => step.step_id.includes("_typeCommand_"))
      .map((command) => {
        const suffix = command.step_id.split("_typeCommand_")[1];
        const value = userEnvironmentSteps.find(
          (step) =>
            step.step_id ===
            `step_setUserEnvironmentVariable_typeValue_${suffix}`,
        );
        return [
          command.parameters.text.match(/TARGET_KEY="([^"]+)"/)?.[1],
          command.parameters.text.match(/VARIABLE_NAME="([^"]+)"/)?.[1],
          value?.parameters.text,
        ];
      })
      .sort((left, right) => left[1].localeCompare(right[1]));
    const expectedVariables = [
      [
        expected.target,
        "AZURE_SEARCH_ENDPOINT",
        "${{env:AZURE_SEARCH_ENDPOINT}}",
      ],
      [
        expected.target,
        "SECRET_AZURE_SEARCH_KEY",
        "${{secret:AZURE_SEARCH_KEY}}",
      ],
    ];
    if (expected.usesAzureOpenAI) {
      expectedVariables.push([
        expected.target,
        expected.usesPython
          ? "AZURE_OPENAI_EMBEDDING_DEPLOYMENT"
          : "AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME",
        "${{env:AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME}}",
      ]);
    } else {
      expectedVariables.push([
        expected.target,
        "SECRET_OPENAI_API_KEY",
        "${{secret:AZURE_OPENAI_API_KEY}}",
      ]);
    }
    expectedVariables.sort((left, right) => left[1].localeCompare(right[1]));
    assert.deepEqual(userEnvironment, expectedVariables, expected.caseId);

    const isRemote = expected.target === "dev";
    assert.equal(
      generated.plan.steps.some((step) =>
        step.step_id.startsWith("step_signInAzure_"),
      ),
      isRemote,
      `${expected.caseId}: Azure login`,
    );
    assert.equal(
      generated.plan.steps.some((step) =>
        ["step_signInM365_", "step_signInM365FromPicker_"].some((prefix) =>
          step.step_id.startsWith(prefix),
        ),
      ),
      isRemote,
      `${expected.caseId}: Microsoft 365 login`,
    );
    for (const command of [
      "Microsoft 365 Agents: Provision",
      "Microsoft 365 Agents: Deploy",
    ]) {
      assert.equal(
        typedValues.includes(command),
        isRemote,
        `${expected.caseId}: ${command}`,
      );
    }
    assert.equal(
      typedValues.includes("Python: Create Environment..."),
      expected.usesPython,
      expected.caseId,
    );
    const selectedProfiles = typedValues.filter((value) =>
      [
        "Launch Remote in Teams (Chrome)",
        "Launch Remote (Chrome)",
        "Debug in Microsoft 365 Agents Playground",
      ].includes(value),
    );
    assert.deepEqual(selectedProfiles, [expected.profile], expected.caseId);

    const expectedPrompts =
      expected.target === "playground"
        ? ["hi", "List Contoso history in table"]
        : ["What is the Contoso Electronics PerksPlus program?"];
    assert.deepEqual(
      typedValues.filter((value) => expectedPrompts.includes(value)),
      expectedPrompts,
      expected.caseId,
    );
    assert.equal(
      generated.plan.steps.some(
        (step) =>
          step.step_id.startsWith("step_assertChatNotContains_") &&
          step.description.includes("error"),
      ),
      isRemote,
      expected.caseId,
    );
    assert.equal(
      generated.plan.steps.some(
        (step) =>
          step.step_id.startsWith("step_assertChatContains_") &&
          step.description.includes("encountered an error"),
      ),
      false,
      expected.caseId,
    );
  }
});

test("VCB-112: a local environment step accepts either runtime environment file", async () => {
  const result = await compileFixture(
    "custom-copilot-rag-azure-ai-search.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);

  const generated = result.value.find(
    (candidate) =>
      candidate.caseId === "rag-azure-ai-search-py-azure-openai-local-teams",
  );
  const step = generated.plan.steps.find((candidate) =>
    candidate.step_id.startsWith("step_setLocalEnvironmentVariable_"),
  );

  assert.equal(
    step.parameters.sample.includes(
      'targets = ("target: ./.localConfigs", "target: ./.env")',
    ),
    true,
  );
  assert.equal(step.description.includes(".localConfigs"), false);
});

test("VCB-113: local Teams Agent with Data cases assert error-free replies", async () => {
  for (const [fileName] of teamsAgentWithDataBundles) {
    const result = await compileFixture(fileName, (sourceText) => sourceText);
    assert.equal(result.ok, true, result.diagnostics?.[0]?.code);

    for (const generated of result.value) {
      if (!generated.caseId.includes("-local-teams")) {
        continue;
      }
      const hasStep = (prefix) =>
        generated.plan.steps.some((candidate) =>
          candidate.step_id.startsWith(prefix),
        );
      assert.equal(hasStep("step_assertChatReplied_"), true, generated.caseId);
      assert.equal(
        hasStep("step_assertChatNotContains_"),
        true,
        generated.caseId,
      );
    }
  }
});

test("VCB-114: Azure AI Search OpenAI cases use the compatible endpoint and model", async () => {
  const result = await compileFixture(
    "custom-copilot-rag-azure-ai-search.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);

  const openAICases = [
    "rag-azure-ai-search-ts-openai-local-teams",
    "rag-azure-ai-search-js-openai-local-teams",
    "rag-azure-ai-search-py-openai-local-teams",
    "rag-azure-ai-search-ts-openai-remote-teams",
    "rag-azure-ai-search-js-openai-remote-teams",
    "rag-azure-ai-search-py-openai-remote-teams",
  ];
  for (const generated of result.value) {
    const onOpenAI = openAICases.includes(generated.caseId);

    assert.equal(
      JSON.stringify(generated.plan).includes("faked_openapi_key"),
      false,
      generated.caseId,
    );
    assert.equal(
      generated.plan.steps.some(
        (step) =>
          [
            "step_setLocalEnvironmentVariable_",
            "step_setRemoteEnvironmentVariable_",
          ].some((prefix) => step.step_id.startsWith(prefix)) &&
          step.description.includes("OPENAI_BASE_URL"),
      ),
      onOpenAI,
      generated.caseId,
    );
    assert.equal(
      generated.plan.steps.some((step) =>
        step.step_id.startsWith("step_setOpenAIModel_"),
      ),
      onOpenAI,
      generated.caseId,
    );
  }
});

test("VCB-115: the Tab selector path resolves without a language question", async () => {
  const result = await compileFixture(
    "non-sso-tab.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const plan = result.value.find(
    (generated) => generated.caseId === "tab-ts-local-teams",
  ).plan;
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);

  assert.equal(typedValues.includes("Other Teams Capabilities"), true);
  assert.equal(typedValues.includes("Tab"), true);
  assert.equal(typedValues.includes("TypeScript"), false);
});

test("VCB-116: a target profile registers one activation adapter per destination", async () => {
  const tabResult = await compileFixture(
    "non-sso-tab.yml",
    (sourceText) => sourceText,
  );
  const botResult = await compileFixture(
    "default-bot.yml",
    (sourceText) => sourceText,
  );

  assert.equal(tabResult.ok, true, tabResult.diagnostics?.[0]?.code);
  assert.equal(botResult.ok, true, botResult.diagnostics?.[0]?.code);
  for (const [result, caseId] of [
    [tabResult, "tab-ts-local-teams"],
    [botResult, "simple-bot-ts-local-teams"],
  ]) {
    const plan = result.value.find(
      (generated) => generated.caseId === caseId,
    ).plan;
    const typedValues = plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    assert.equal(typedValues.includes("Debug in Teams (Chrome)"), true, caseId);
    assert.equal(
      plan.steps.some((step) => step.step_id.startsWith("step_addAndOpenApp_")),
      true,
      caseId,
    );
  }

  const unregistered = await compileFixture("non-sso-tab.yml", (sourceText) =>
    sourceText.replace(
      'profile: "Debug in Teams (Chrome)"',
      'profile: "Debug in Microsoft 365 Agents Playground"',
    ),
  );

  assert.equal(unregistered.ok, false);
  assert.equal(unregistered.diagnostics[0].code, "VCB_OPEN_ADAPTER_UNKNOWN");
});

test("VCB-117: the Teams open closes on the subject its adapter supplies", async () => {
  const tabResult = await compileFixture(
    "non-sso-tab.yml",
    (sourceText) => sourceText,
  );
  const botResult = await compileFixture(
    "default-bot.yml",
    (sourceText) => sourceText,
  );

  assert.equal(tabResult.ok, true, tabResult.diagnostics?.[0]?.code);
  assert.equal(botResult.ok, true, botResult.diagnostics?.[0]?.code);
  const findConverged = (result, caseId) =>
    result.value
      .find((generated) => generated.caseId === caseId)
      .plan.steps.find((step) =>
        step.step_id.startsWith("step_addAndOpenApp_assertReady_"),
      );
  const tabConverged = findConverged(tabResult, "tab-ts-local-teams");
  const botConverged = findConverged(botResult, "simple-bot-ts-local-teams");

  assert.match(tabConverged.description, /tab page/);
  assert.equal(/conversation/.test(tabConverged.description), false);
  assert.equal(tabConverged.tags.includes("readiness:page-ready"), true);
  assert.match(botConverged.description, /conversation/);
  assert.equal(botConverged.tags.includes("readiness:chat-ready"), true);
  for (const converged of [tabConverged, botConverged]) {
    assert.equal(/app details page/.test(converged.description), false);
  }
});

test("VCB-118: local tab open trusts the certificate before opening and allows local access afterward", async () => {
  const result = await compileFixture(
    "non-sso-tab.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const local = result.value.find(
    (generated) => generated.caseId === "tab-ts-local-teams",
  ).plan;
  const remote = result.value.find(
    (generated) => generated.caseId === "tab-ts-remote-teams",
  ).plan;
  const indexOfComponent = (plan, componentId) =>
    plan.steps.findIndex((step) =>
      step.step_id.startsWith(`step_${componentId}_`),
    );

  const trustIndex = indexOfComponent(local, "trustLocalTabCertificate");
  const addIndex = indexOfComponent(local, "addAndOpenApp");
  const allowIndex = indexOfComponent(local, "allowLocalDeviceAccess");
  const pageCheckIndex = indexOfComponent(local, "assertPageContains");
  assert.notEqual(trustIndex, -1);
  assert.ok(trustIndex < addIndex);
  assert.ok(addIndex < allowIndex);
  assert.ok(allowIndex < pageCheckIndex);
  const allowStep = local.steps.find((step) =>
    step.step_id.startsWith("step_allowLocalDeviceAccess_allow_"),
  );
  assert.deepEqual(allowStep.parameters, {
    button: "left",
    x: 389,
    y: 241,
  });
  assert.equal(allowStep.tags.includes("ocr:true"), true);
  assert.equal(
    local.steps.some(
      (step) => step.parameters?.text === "https://localhost:3978/tabs/home",
    ),
    true,
  );
  assert.equal(indexOfComponent(remote, "trustLocalTabCertificate"), -1);
  assert.equal(indexOfComponent(remote, "allowLocalDeviceAccess"), -1);
});

test("VCB-119: a page check requires page-ready and asserts each authored substring", async () => {
  const result = await compileFixture(
    "non-sso-tab.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const pageAssertions = result.value
    .find((generated) => generated.caseId === "tab-ts-local-teams")
    .plan.steps.filter((step) =>
      step.step_id.startsWith("step_assertPageContains_"),
    );

  assert.equal(pageAssertions.length, 1);
  assert.match(
    pageAssertions[0].description,
    /Your app is running in TeamsModern/,
  );

  const withoutPageReady = await compileFixture(
    "non-sso-tab.yml",
    (sourceText) =>
      sourceText.replace("destination: page", "destination: chat"),
  );

  assert.equal(withoutPageReady.ok, false);
  assert.equal(
    withoutPageReady.diagnostics[0].code,
    "VCB_PAGE_ADAPTER_UNKNOWN",
  );
});

test("VCB-120: removeWorkspaceFile deletes one project-relative file", async () => {
  const result = await compileFixture(
    "non-sso-tab.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const removals = result.value
    .find(
      (generated) => generated.caseId === "tab-ts-local-teams-env-recreated",
    )
    .plan.steps.filter((step) =>
      step.step_id.startsWith("step_removeWorkspaceFile_"),
    );

  assert.equal(removals.length, 1);
  assert.equal(removals[0].agent, "code");
  assert.match(removals[0].description, /env\/\.env\.local/);
  assert.match(
    removals[0].parameters.sample,
    /RELATIVE_PATH="env\/\.env\.local"/,
  );

  const escaping = await compileFixture("non-sso-tab.yml", (sourceText) =>
    sourceText.replace(
      "\n      path: env/.env.local",
      "\n      path: ../escape.txt",
    ),
  );

  assert.equal(escaping.ok, false);
  assert.equal(
    escaping.diagnostics[0].code,
    "VCB_REMOVE_WORKSPACE_FILE_INPUT_INVALID",
  );
});

test("VCB-121: the Teams Collaborator Agent scaffold skips the LLM service and language questions", async () => {
  const result = await compileFixture(
    "teams-collaborator-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.[0]));
  const plan = result.value.find(
    (generated) =>
      generated.caseId === "collaborator-ts-azure-openai-local-teams",
  ).plan;
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);

  assert.deepEqual(typedValues.slice(2, 4), [
    "Teams Agents and Apps",
    "Teams Collaborator Agent",
  ]);
  assert.equal(typedValues.includes("General Teams Agent"), false);
  assert.equal(typedValues.includes("Other Teams Capabilities"), false);
  assert.equal(typedValues.includes("Azure OpenAI"), false);
  assert.equal(typedValues.includes("TypeScript"), false);

  const descriptions = plan.steps.map((step) => step.description).join("\n");
  for (const title of [
    "Azure OpenAI Key",
    "Azure OpenAI Endpoint",
    "Azure OpenAI Deployment Name",
    "Workspace Folder",
    "Application Name",
  ]) {
    assert.equal(descriptions.includes(title), true, title);
  }
  for (const title of [
    "Service for Large Language Model (LLM)",
    "Programming Language",
  ]) {
    assert.equal(descriptions.includes(title), false, title);
  }
});

test("VCB-122: the Teams Collaborator Agent bundle chats locally", async () => {
  const result = await compileFixture(
    "teams-collaborator-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.[0]));
  assert.deepEqual(
    result.value.map((generated) => generated.caseId),
    [
      "collaborator-ts-azure-openai-local-teams",
      "collaborator-ts-azure-openai-playground",
    ],
  );

  const generated = result.value.find(
    (entry) => entry.caseId === "collaborator-ts-azure-openai-local-teams",
  );
  assert.notEqual(generated, undefined);
  const typedValues = generated.plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);

  assert.equal(typedValues.includes("Debug in Teams (Chrome)"), true);
  assert.equal(
    generated.plan.steps.some((step) =>
      step.step_id.startsWith("step_addAndOpenApp_"),
    ),
    true,
  );
  assert.equal(
    generated.plan.steps.some((step) =>
      step.step_id.startsWith("step_sendTeamsMessage_"),
    ),
    true,
  );
  assert.equal(
    typedValues.includes("Create a task to review the proposal by Friday"),
    true,
  );
});

test("VCB-130: the Teams Collaborator Agent Playground case preserves its recorded chat path", async () => {
  const result = await compileFixture(
    "teams-collaborator-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.[0]));
  const generated = result.value.find(
    (entry) => entry.caseId === "collaborator-ts-azure-openai-playground",
  );
  assert.notEqual(generated, undefined);

  const typedValues = generated.plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(
    typedValues.includes("Debug in Microsoft 365 Agents Playground"),
    true,
  );
  assert.equal(
    typedValues.includes(
      "@Collaborator create a task to review the proposal by Friday",
    ),
    true,
  );
  assert.equal(
    generated.plan.steps.some(
      (step) =>
        step.description ===
        '@assertion the Agents Playground shows a non-empty assistant response, and the "Type a message..." composer is ready for the next user turn with no response-generation indicator visible.',
    ),
    true,
  );
  assert.equal(
    generated.plan.steps.some(
      (step) =>
        step.description.includes("Sign in") ||
        step.description.includes("Log in"),
    ),
    false,
  );
});

test("VCB-131: capability-free Copilot crossings replace their retained legacy plans", async () => {
  for (const { fileName, expectedCases } of [
    {
      fileName: "weather-agent.yml",
      expectedCases: [
        ["weather-js-azure-openai-remote-copilot", "33338497"],
        ["weather-js-azure-openai-local-copilot", "33338500"],
      ],
    },
    {
      fileName: "general-teams-agent.yml",
      expectedCases: [
        ["general-teams-js-azure-openai-remote-copilot", "36033116"],
        ["general-teams-js-azure-openai-local-copilot", "36031468"],
        ["general-teams-py-azure-openai-remote-copilot", "36033322"],
        ["general-teams-py-azure-openai-local-copilot", "36033211"],
      ],
    },
  ]) {
    const result = await compileFixture(fileName, (sourceText) => sourceText);
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.[0]));

    for (const [caseId, workItemId] of expectedCases) {
      const generated = result.value.find((entry) => entry.caseId === caseId);
      assert.notEqual(generated, undefined, caseId);
      assert.equal(
        generated.plan.plan_metadata.description.workitem,
        workItemId,
        caseId,
      );

      const typedValues = generated.plan.steps
        .filter((step) => step.tool === "type_text")
        .map((step) => step.parameters.text);
      assert.equal(
        typedValues.includes(
          caseId.endsWith("remote-copilot")
            ? caseId.startsWith("weather-")
              ? "(Preview) Launch Remote in Copilot (Chrome)"
              : "Launch Remote in Copilot (Chrome)"
            : caseId.startsWith("weather-")
              ? "(Preview) Debug in Copilot (Chrome)"
              : "Debug in Copilot (Chrome)",
        ),
        true,
        caseId,
      );
      assert.equal(
        generated.plan.steps.some((step) =>
          step.step_id.startsWith("step_sendCopilotMessage_"),
        ),
        true,
        caseId,
      );
    }
  }
});

test("VCB-144: all Message Extension launches preserve their recorded invocation contracts", async () => {
  const result = await compileFixture(
    "default-message-extension.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.[0]));

  const expectedCases = [
    ["message-extension-ts-remote-teams", "teams", "typescript", "dev"],
    ["message-extension-ts-local-teams", "teams", "typescript", "local"],
    ["message-extension-ts-playground", "playground", "typescript"],
    ["message-extension-py-remote-teams", "teams", "python", "dev"],
    ["message-extension-py-local-teams", "teams", "python", "local"],
    ["message-extension-py-playground", "playground", "python"],
  ];
  assert.deepEqual(
    result.value.map(({ caseId }) => caseId),
    expectedCases.map(([caseId]) => caseId),
  );

  const recordedTeamsClicks = {
    typescript: [
      [877, 724, "dhash:877:724:16:5:0404200404010000"],
      [780, 386, "dhash:780:386:16:5:ec315b4a5a32cc92"],
      [972, 511, "dhash:972:511:96:5:0101050d05050101"],
      [862, 511, "dhash:862:511:16:5:aa6aaa9b6a800000"],
      [926, 717, "dhash:926:717:16:5:ccf37c0f030f7cf2"],
    ],
    python: [
      [877, 724, "dhash:877:724:16:5:0404200404010000"],
      [780, 386, "dhash:780:386:16:5:ec315b4a5a32cc92"],
      [972, 511, "dhash:972:511:96:5:0101050d05050101"],
      [862, 511, "dhash:862:511:16:5:aa6aaa9b6a800000"],
      [926, 717, "dhash:926:717:16:5:ccf37c0f030f7cf2"],
    ],
  };

  for (const [caseId, host, language, appNameSuffix] of expectedCases) {
    const generated = result.value.find((entry) => entry.caseId === caseId);
    assert.notEqual(generated, undefined, caseId);
    const invocationSteps = generated.plan.steps.filter((step) =>
      step.tags.includes("check:message-extension"),
    );
    assert.notEqual(invocationSteps.length, 0, caseId);
    assert.equal(
      invocationSteps.every(
        (step) =>
          step.tags.includes(`host_surface:${host}`) &&
          step.tags.includes(`recording_language:${language}`),
      ),
      true,
      caseId,
    );
    assert.equal(
      invocationSteps
        .filter((step) => step.tool === "click")
        .every(
          (step) =>
            Number.isInteger(step.parameters.x) &&
            Number.isInteger(step.parameters.y) &&
            step.preconditions.length > 0 &&
            step.preconditions.every((value) => value.startsWith("dhash:")),
        ),
      true,
      caseId,
    );

    const typedValues = invocationSteps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    const descriptions = invocationSteps.map((step) => step.description);
    if (host === "teams") {
      for (const value of ["${{var:app_name}}", "test"]) {
        assert.equal(typedValues.includes(value), true, `${caseId}: ${value}`);
      }
      for (const text of [
        "Actions and apps",
        "This is the first item and this is your search query: test",
      ]) {
        assert.equal(
          descriptions.some((description) => description.includes(text)),
          true,
          `${caseId}: ${text}`,
        );
      }
      assert.equal(typedValues.includes("searchQuery"), false, caseId);
      assert.equal(typedValues.includes("createCard"), false, caseId);
      assert.equal(
        descriptions.some((description) =>
          description.includes(`\${{var:app_name}}${appNameSuffix}`),
        ),
        true,
        `${caseId}: exact app suffix`,
      );
      assert.equal(
        descriptions.some((description) =>
          description.includes(
            `\${{var:app_name}}${appNameSuffix === "dev" ? "local" : "dev"}`,
          ),
        ),
        false,
        `${caseId}: opposite app suffix`,
      );
      const clickSteps = invocationSteps.filter(
        (step) => step.tool === "click",
      );
      assert.deepEqual(
        clickSteps.map((step) => [
          step.parameters.x,
          step.parameters.y,
          recordedTeamsClicks[language].find(
            ([x, y]) => x === step.parameters.x && y === step.parameters.y,
          )?.[2],
        ]),
        recordedTeamsClicks[language],
        `${caseId}: recorded click coordinates`,
      );
      for (const [x, y, precondition] of recordedTeamsClicks[language]) {
        const clickStep = clickSteps.find(
          (step) => step.parameters.x === x && step.parameters.y === y,
        );
        assert.notEqual(clickStep, undefined, `${caseId}: click ${x},${y}`);
        assert.equal(
          clickStep.preconditions.includes(precondition),
          true,
          `${caseId}: ${precondition}`,
        );
      }
    } else {
      for (const value of [
        "searchQuery",
        "test",
        "createCard",
        "1",
        "2",
        "3",
        "https://botframework.com",
      ]) {
        assert.equal(typedValues.includes(value), true, `${caseId}: ${value}`);
      }
      for (const text of [
        "Search Command",
        "Action Command",
        "Link Unfurling",
        "Unfurled Link",
      ]) {
        assert.equal(
          descriptions.some((description) => description.includes(text)),
          true,
          `${caseId}: ${text}`,
        );
      }
      const sendToConversationStep = invocationSteps.find((step) =>
        step.description.includes("Send to Conversation"),
      );
      const unfurledLinkAssertionStep = invocationSteps.find((step) =>
        step.description.includes('"Unfurled Link"'),
      );
      assert.notEqual(
        sendToConversationStep,
        undefined,
        `${caseId}: Send to Conversation`,
      );
      assert.notEqual(
        unfurledLinkAssertionStep,
        undefined,
        `${caseId}: Unfurled Link assertion`,
      );
      const sendToConversationIndex = invocationSteps.indexOf(
        sendToConversationStep,
      );
      const unfurledLinkAssertionIndex = invocationSteps.indexOf(
        unfurledLinkAssertionStep,
      );
      assert.equal(
        sendToConversationIndex < unfurledLinkAssertionIndex,
        true,
        `${caseId}: Send to Conversation occurs before Unfurled Link assertion`,
      );
      assert.equal(
        unfurledLinkAssertionStep.depends_on.includes(
          sendToConversationStep.step_id,
        ),
        true,
        `${caseId}: Unfurled Link assertion depends on Send to Conversation`,
      );
      assert.equal(typedValues.includes("${{var:app_name}}"), false, caseId);
    }
  }
});

test("VCB-145: exactly eight retained template plans use stable semantic post-launch checks", async () => {
  const bundleDefinitions = [
    ["weather-agent.yml", 16],
    ["basic-custom-engine-agent.yml", 23],
    ["custom-copilot-rag-customize.yml", 27],
    ["custom-copilot-rag-custom-api.yml", 16],
  ];
  const bundles = new Map();
  for (const [fileName, expectedCaseCount] of bundleDefinitions) {
    const result = await compileFixture(fileName, (sourceText) => sourceText);
    assert.equal(
      result.ok,
      true,
      `${fileName}: ${result.diagnostics?.[0]?.code}`,
    );
    assert.equal(result.value.length, expectedCaseCount, fileName);
    bundles.set(fileName, result.value);
  }

  const expectedCases = [
    {
      fileName: "weather-agent.yml",
      caseId: "weather-ts-openai-playground",
      workItemId: "33338503",
      language: "TypeScript",
      provider: "OpenAI",
      profile: "Debug in Microsoft 365 Agents Playground",
      prompt: "What is the weather in Seattle?",
      assertion: "replied",
      isRemote: false,
      usesPython: false,
    },
    {
      fileName: "weather-agent.yml",
      caseId: "weather-js-openai-playground",
      workItemId: "33338498",
      language: "JavaScript",
      provider: "OpenAI",
      profile: "Debug in Microsoft 365 Agents Playground",
      prompt: "What is the weather in Seattle?",
      assertion: "replied",
      isRemote: false,
      usesPython: false,
    },
    {
      fileName: "basic-custom-engine-agent.yml",
      caseId: "basic-cea-ts-openai-playground",
      workItemId: "33338526",
      language: "TypeScript",
      provider: "OpenAI",
      profile: "Debug in Microsoft 365 Agents Playground",
      prompt: "How to develop agent for Teams?",
      assertion: "replied",
      isRemote: false,
      usesPython: false,
    },
    {
      fileName: "basic-custom-engine-agent.yml",
      caseId: "basic-cea-js-openai-playground",
      workItemId: "33338522",
      language: "JavaScript",
      provider: "OpenAI",
      profile: "Debug in Microsoft 365 Agents Playground",
      prompt: "How to develop agent for Teams?",
      assertion: "replied",
      isRemote: false,
      usesPython: false,
    },
    {
      fileName: "custom-copilot-rag-customize.yml",
      caseId: "rag-customize-py-openai-remote-teams",
      workItemId: "27178104",
      language: "Python",
      provider: "OpenAI",
      profile: "Launch Remote (Chrome)",
      prompt: "Compare Contoso Electronics plan",
      assertion: "replied",
      isRemote: true,
      usesPython: true,
    },
    {
      fileName: "custom-copilot-rag-custom-api.yml",
      caseId: "rag-custom-api-py-openai-remote-teams",
      workItemId: "29165762",
      language: "Python",
      provider: "OpenAI",
      profile: "Launch Remote (Chrome)",
      prompt: "List all repairs without auth",
      assertion: "replied",
      isRemote: true,
      usesPython: true,
    },
    {
      fileName: "custom-copilot-rag-custom-api.yml",
      caseId: "rag-custom-api-ts-azure-openai-playground",
      workItemId: "36230747",
      language: "TypeScript",
      provider: "Azure OpenAI",
      profile: "Debug in Microsoft 365 Agents Playground",
      prompt: "get repairs assign Karin",
      assertion: "replied",
      isRemote: false,
      usesPython: false,
    },
    {
      fileName: "custom-copilot-rag-custom-api.yml",
      caseId: "rag-custom-api-js-azure-openai-playground",
      workItemId: "36230103",
      language: "JavaScript",
      provider: "Azure OpenAI",
      profile: "Debug in Microsoft 365 Agents Playground",
      prompt: "get repairs assign Karin",
      assertion: "replied",
      isRemote: false,
      usesPython: false,
    },
  ];

  assert.deepEqual(
    bundles
      .get("weather-agent.yml")
      .filter(
        ({ caseId }) =>
          caseId.endsWith("-openai-playground") &&
          !caseId.includes("-azure-openai-"),
      )
      .map(({ caseId }) => caseId),
    ["weather-ts-openai-playground", "weather-js-openai-playground"],
  );
  assert.deepEqual(
    bundles
      .get("basic-custom-engine-agent.yml")
      .filter(
        ({ caseId }) =>
          caseId.endsWith("-openai-playground") &&
          !caseId.includes("-azure-openai-"),
      )
      .map(({ caseId }) => caseId),
    ["basic-cea-ts-openai-playground", "basic-cea-js-openai-playground"],
  );
  assert.deepEqual(
    bundles
      .get("custom-copilot-rag-customize.yml")
      .filter(({ caseId }) => caseId.includes("-py-openai-remote-teams"))
      .map(({ caseId }) => caseId),
    ["rag-customize-py-openai-remote-teams"],
  );
  assert.deepEqual(
    bundles
      .get("custom-copilot-rag-custom-api.yml")
      .filter(
        ({ caseId }) =>
          caseId.includes("-py-openai-remote-teams") ||
          (caseId.includes("-azure-openai-playground") &&
            !caseId.includes("-py-")),
      )
      .map(({ caseId }) => caseId),
    [
      "rag-custom-api-py-openai-remote-teams",
      "rag-custom-api-ts-azure-openai-playground",
      "rag-custom-api-js-azure-openai-playground",
    ],
  );

  for (const expected of expectedCases) {
    const generated = bundles
      .get(expected.fileName)
      .find(({ caseId }) => caseId === expected.caseId);
    assert.notEqual(generated, undefined, expected.caseId);
    assert.equal(
      generated.fileName,
      `${expected.fileName.slice(0, -4)}--${expected.caseId}.json`,
      expected.caseId,
    );
    assert.equal(
      generated.plan.plan_metadata.description.workitem,
      expected.workItemId,
      expected.caseId,
    );

    const typedValues = generated.plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    for (const value of [
      expected.language,
      expected.provider,
      expected.profile,
      expected.prompt,
    ]) {
      assert.equal(
        typedValues.includes(value),
        true,
        `${expected.caseId}: ${value}`,
      );
    }
    assert.equal(
      typedValues.includes("${{secret:AZURE_OPENAI_API_KEY}}"),
      true,
      `${expected.caseId}: provider credential`,
    );
    for (const command of [
      "Microsoft 365 Agents: Provision",
      "Microsoft 365 Agents: Deploy",
    ]) {
      assert.equal(
        typedValues.includes(command),
        expected.isRemote,
        `${expected.caseId}: ${command}`,
      );
    }
    assert.equal(
      typedValues.includes("Python: Create Environment..."),
      expected.usesPython,
      `${expected.caseId}: Python environment`,
    );
    assert.equal(
      generated.plan.steps.some((step) =>
        step.step_id.startsWith("step_signInAzure_"),
      ),
      expected.isRemote,
      `${expected.caseId}: Azure login`,
    );
    assert.equal(
      generated.plan.steps.some((step) =>
        ["step_signInM365_", "step_signInM365FromPicker_"].some((prefix) =>
          step.step_id.startsWith(prefix),
        ),
      ),
      expected.isRemote,
      `${expected.caseId}: Microsoft 365 login`,
    );
    assert.equal(
      generated.plan.steps.some((step) =>
        step.step_id.startsWith(
          expected.isRemote
            ? "step_sendTeamsMessage_"
            : "step_sendPlaygroundMessage_",
        ),
      ),
      true,
      `${expected.caseId}: post-launch chat`,
    );
    assert.equal(
      generated.plan.steps.some(
        (step) =>
          step.step_id.startsWith(
            expected.assertion === "replied"
              ? "step_assertChatReplied_"
              : "step_assertChatContains_",
          ) &&
          (expected.assertion === "replied" ||
            step.description.includes(expected.assertion)),
      ),
      true,
      `${expected.caseId}: stable assertion`,
    );
  }
});

test("VCB-146: exactly ten retained DA template success plans have semantic replacements", async () => {
  const bundleDefinitions = [
    ["da-api-plugin-from-scratch.yml", 4],
    ["da-api-plugin-from-scratch-bearer.yml", 4],
    ["da-api-plugin-from-scratch-oauth.yml", 8],
    ["da-no-action.yml", 2],
    ["da-typespec-no-action.yml", 1],
  ];
  const expectedCases = [
    {
      fileName: "da-api-plugin-from-scratch.yml",
      caseId: "da-api-plugin-from-scratch-ts-local-copilot",
      workItemId: "35692262",
      selector: "None",
      language: "TypeScript",
      profile: "Debug in Copilot (Chrome)",
      filePaths: ["appPackage/ai-plugin.json", "src/functions/repairs.ts"],
      prompt: "show repair records assigned to karin blair",
      assertion: "Oil change",
      remoteLifecycle: false,
      provision: false,
    },
    {
      fileName: "da-api-plugin-from-scratch-bearer.yml",
      caseId: "da-api-plugin-from-scratch-api-key-ts-remote-copilot",
      workItemId: "28941598",
      selector: "API Key",
      language: "TypeScript",
      profile: "Preview in Copilot (Chrome)",
      filePaths: ["appPackage/ai-plugin.json", "src/functions/repairs.ts"],
      prompt: "show repair records assigned to karin blair",
      assertion: "Oil change",
      remoteLifecycle: true,
      provision: true,
      userEnvironment: ["dev", "SECRET_API_KEY", "${{var:app_name}}-api-key"],
    },
    {
      fileName: "da-api-plugin-from-scratch-bearer.yml",
      caseId: "da-api-plugin-from-scratch-api-key-js-remote-copilot",
      workItemId: "34628865",
      selector: "API Key",
      language: "JavaScript",
      profile: "Preview in Copilot (Chrome)",
      filePaths: ["appPackage/ai-plugin.json", "src/functions/repair.js"],
      prompt: "show repair records assigned to karin blair",
      assertion: "Oil change",
      remoteLifecycle: true,
      provision: true,
      userEnvironment: ["dev", "SECRET_API_KEY", "${{var:app_name}}-api-key"],
    },
    {
      fileName: "da-api-plugin-from-scratch-oauth.yml",
      caseId: "da-api-plugin-from-scratch-entra-js-local-copilot",
      workItemId: "34628872",
      selector: "Microsoft Entra",
      language: "JavaScript",
      profile: "Debug in Copilot (Chrome)",
      filePaths: ["appPackage/ai-plugin.json", "src/functions/repairs.js"],
      prompt: "show repair records assigned to karin blair",
      assertion: "Oil change",
      remoteLifecycle: false,
      provision: false,
    },
    {
      fileName: "da-api-plugin-from-scratch-oauth.yml",
      caseId: "da-api-plugin-from-scratch-entra-ts-remote-copilot",
      workItemId: "29417723",
      selector: "Microsoft Entra",
      language: "TypeScript",
      profile: "Preview in Copilot (Chrome)",
      filePaths: ["appPackage/ai-plugin.json", "src/functions/repairs.ts"],
      prompt: "show repair records assigned to karin blair",
      assertion: "Oil change",
      remoteLifecycle: true,
      provision: true,
    },
    {
      fileName: "da-api-plugin-from-scratch-oauth.yml",
      caseId: "da-api-plugin-from-scratch-entra-js-remote-copilot",
      workItemId: "34628887",
      selector: "Microsoft Entra",
      language: "JavaScript",
      profile: "Preview in Copilot (Chrome)",
      filePaths: ["appPackage/ai-plugin.json", "src/functions/repairs.js"],
      prompt: "show repair records assigned to karin blair",
      assertion: "Oil change",
      remoteLifecycle: true,
      provision: true,
    },
    {
      fileName: "da-api-plugin-from-scratch-oauth.yml",
      caseId: "da-api-plugin-from-scratch-oauth-ts-remote-copilot",
      workItemId: "28941947",
      selector: "OAuth",
      language: "TypeScript",
      profile: "Preview in Copilot (Chrome)",
      filePaths: ["appPackage/ai-plugin.json", "src/functions/repairs.ts"],
      prompt: "show repair records assigned to karin blair",
      assertion: "oauth-sign-in",
      remoteLifecycle: true,
      provision: true,
    },
    {
      fileName: "da-api-plugin-from-scratch-oauth.yml",
      caseId: "da-api-plugin-from-scratch-oauth-js-remote-copilot",
      workItemId: "34628911",
      selector: "OAuth",
      language: "JavaScript",
      profile: "Preview in Copilot (Chrome)",
      filePaths: ["appPackage/ai-plugin.json", "src/functions/repairs.js"],
      prompt: "show repair records assigned to karin blair",
      assertion: "oauth-sign-in",
      remoteLifecycle: true,
      provision: true,
    },
    {
      fileName: "da-no-action.yml",
      caseId: "da-no-action-local-copilot",
      workItemId: "35719162",
      selector: "No Action",
      profile: "Preview Local in Copilot (Chrome)",
      filePaths: ["appPackage/declarativeAgent.json"],
      prompt: "how can you assistant me?",
      assertion: "replied",
      remoteLifecycle: false,
      provision: false,
    },
    {
      fileName: "da-typespec-no-action.yml",
      caseId: "da-typespec-no-action-remote-preview",
      workItemId: "32237977",
      selector: "Start with TypeSpec for Microsoft 365 Copilot",
      profile: "Preview in Copilot (Chrome)",
      filePaths: ["src/agent/main.tsp", "src/agent/actions/github.tsp"],
      prompt: "how can you assistant me?",
      assertion: "replied",
      remoteLifecycle: false,
      provision: true,
    },
  ];
  const bundles = new Map();
  for (const [fileName, expectedCaseCount] of bundleDefinitions) {
    const result = await compileFixture(fileName, (sourceText) => sourceText);
    assert.equal(
      result.ok,
      true,
      `${fileName}: ${result.diagnostics?.[0]?.code}`,
    );
    assert.equal(result.value.length, expectedCaseCount, fileName);
    bundles.set(fileName, result.value);
  }

  const generatedCases = expectedCases.map((expected) => {
    const generated = bundles
      .get(expected.fileName)
      .find(({ caseId }) => caseId === expected.caseId);
    assert.notEqual(generated, undefined, expected.caseId);
    return [expected, generated];
  });
  assert.deepEqual(
    generatedCases.map(([expected, generated]) => [
      expected.caseId,
      generated.fileName,
    ]),
    expectedCases.map(({ caseId, fileName, selector }) => [
      caseId,
      `${selector
        .replace("Start with TypeSpec for Microsoft 365 Copilot", "da/typespec")
        .replace("No Action", "da/no-action")
        .replace(/^(None)$/, "da/api-plugin-from-scratch")
        .replace("API Key", "da/api-plugin-from-scratch-bearer")
        .replace(
          /^(Microsoft Entra|OAuth)$/,
          "da/api-plugin-from-scratch-oauth",
        )
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase()}--${caseId}.json`,
    ]),
  );

  for (const [expected, generated] of generatedCases) {
    const { plan } = generated;
    assert.equal(
      plan.plan_metadata.description.workitem,
      expected.workItemId,
      expected.caseId,
    );
    assert.deepEqual(
      plan.plan_metadata.tags.filter((tag) => tag.startsWith("feature_flag:")),
      [],
      `${expected.caseId}: feature flags`,
    );
    const typedValues = plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    for (const value of [
      expected.selector,
      expected.language,
      expected.profile,
      expected.prompt,
    ].filter((value) => value !== undefined)) {
      assert.equal(
        typedValues.includes(value),
        true,
        `${expected.caseId}: ${value}`,
      );
    }

    const fileAssertions = plan.steps.flatMap((step) => {
      const match = step.parameters.sample?.match(/ASSERTIONS_B64="([^"]+)"/);
      return match === undefined
        ? []
        : JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
    });
    for (const filePath of expected.filePaths) {
      assert.equal(
        fileAssertions.some((assertion) => assertion.path === filePath),
        true,
        `${expected.caseId}: ${filePath}`,
      );
    }

    const hasStep = (prefix) =>
      plan.steps.some((step) => step.step_id.startsWith(prefix));
    assert.equal(
      hasStep("step_signInAzure_"),
      expected.remoteLifecycle,
      `${expected.caseId}: Azure login`,
    );
    assert.equal(
      ["step_signInM365_", "step_signInM365FromPicker_"].some(hasStep),
      true,
      `${expected.caseId}: Microsoft 365 login`,
    );
    assert.equal(
      typedValues.includes("Microsoft 365 Agents: Provision"),
      expected.provision,
      `${expected.caseId}: provision`,
    );
    assert.equal(
      typedValues.includes("Microsoft 365 Agents: Deploy"),
      expected.remoteLifecycle,
      `${expected.caseId}: deploy`,
    );
    assert.equal(
      hasStep("step_sendCopilotMessage_"),
      true,
      `${expected.caseId}: chat prompt`,
    );

    if (expected.assertion === "oauth-sign-in") {
      assert.equal(
        plan.steps.some((step) =>
          step.description.includes(
            "accessible name that starts with Sign in to",
          ),
        ),
        true,
        `${expected.caseId}: OAuth sign-in`,
      );
      assert.equal(
        plan.steps.some((step) =>
          step.description.includes("action-consent Allow button is visible"),
        ),
        true,
        `${expected.caseId}: action consent`,
      );
    } else if (expected.assertion === "replied") {
      assert.equal(
        hasStep("step_assertChatReplied_"),
        true,
        `${expected.caseId}: reply`,
      );
    } else {
      assert.equal(
        plan.steps.some(
          (step) =>
            step.step_id.startsWith("step_assertChatContains_") &&
            step.description.includes(expected.assertion),
        ),
        true,
        `${expected.caseId}: repair result`,
      );
      assert.equal(
        plan.steps.some((step) =>
          step.description.includes("action-consent Allow button is visible"),
        ),
        true,
        `${expected.caseId}: action consent`,
      );
    }

    const userEnvironmentSteps = plan.steps.filter((step) =>
      step.step_id.startsWith("step_setUserEnvironmentVariable_"),
    );
    const userEnvironment = userEnvironmentSteps
      .filter((step) => step.step_id.includes("_typeCommand_"))
      .map((command) => {
        const suffix = command.step_id.split("_typeCommand_")[1];
        const value = userEnvironmentSteps.find(
          (step) =>
            step.step_id ===
            `step_setUserEnvironmentVariable_typeValue_${suffix}`,
        );
        return [
          command.parameters.text.match(/TARGET_KEY="([^"]+)"/)?.[1],
          command.parameters.text.match(/VARIABLE_NAME="([^"]+)"/)?.[1],
          value?.parameters.text,
        ];
      });
    assert.deepEqual(
      userEnvironment,
      expected.userEnvironment === undefined ? [] : [expected.userEnvironment],
      `${expected.caseId}: user environment`,
    );
    assert.equal(
      plan.steps.some((step) =>
        step.step_id.startsWith("step_setLocalUserEnvironmentVariable_"),
      ),
      false,
      `${expected.caseId}: local user environment`,
    );
    if (expected.userEnvironment !== undefined) {
      assert.equal(
        userEnvironmentSteps.every((step) =>
          step.tags.includes("operation:user-environment"),
        ),
        true,
        `${expected.caseId}: user environment tags`,
      );
      assert.equal(
        plan.steps.some((step) =>
          step.description.includes(expected.userEnvironment[2]),
        ),
        false,
        `${expected.caseId}: credential description`,
      );
    }
  }
});

test("VCB-147: Preview Local in Copilot reaches chat readiness with only M365 login", async () => {
  const result = await compileFixture("da-no-action.yml", (sourceText) =>
    sourceText
      .replace("        provision,\n", "")
      .replace(
        'profile: "Preview in Copilot (Chrome)"',
        'profile: "Preview Local in Copilot (Chrome)"',
      )
      .replace("profileSelection: second", "profileSelection: first"),
  );
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const generated = result.value.find(
    ({ caseId }) => caseId === "da-no-action-remote-preview",
  );
  const typedValues = generated.plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(typedValues.includes("Preview Local in Copilot (Chrome)"), true);
  assert.equal(
    generated.plan.steps.some((step) =>
      step.step_id.startsWith("step_browserM365SignIn_"),
    ),
    true,
  );
  assert.equal(
    generated.plan.steps.some((step) =>
      step.description.includes(
        "Microsoft 365 Copilot shows an agent's chat open in the main section with a visible message input",
      ),
    ),
    true,
  );
  assert.equal(
    typedValues.some((value) =>
      [
        "Microsoft 365 Agents: Provision",
        "Microsoft 365 Agents: Deploy",
      ].includes(value),
    ),
    false,
  );
  assert.equal(
    generated.plan.steps.some((step) =>
      step.step_id.startsWith("step_signInAzure_"),
    ),
    false,
  );
});

function compileInlineSource(sourceText, sourceName) {
  return compileCaseBundle({
    compileStep: createSemanticStepCompiler(),
    sourcePath: `cases/${sourceName}`,
    sourceText,
  });
}

function readFileAssertions(plan) {
  return plan.steps.flatMap((step) => {
    const match = step.parameters.sample?.match(/ASSERTIONS_B64="([^"]+)"/);
    return match === undefined || match === null
      ? []
      : JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
  });
}

function assertRecordedClick(plan, x, y, preconditions) {
  const click = plan.steps.find(
    (step) =>
      step.tool === "click" &&
      step.parameters.x === x &&
      step.parameters.y === y,
  );
  assert.notEqual(click, undefined, `missing recorded click at (${x}, ${y})`);
  assert.deepEqual(click.preconditions, preconditions);
}

test("VCB-148: rejected scaffold text attempts preserve both recorded app-name failures", () => {
  const sourceText = `version: 1
cases:
  - id: tab-name-rejections
    scenarioId: VCB-148
    workItemIds: [148]
    steps: [scaffold, check]
steps:
  scaffold:
    type: scaffold
    with:
      template: non-sso-tab
      answers:
        - question: workspaceFolder
          value: default
        - type: rejectedScaffoldTextAttempt
          with:
            question: appName
            reason: invalidCharacters
        - type: rejectedScaffoldTextAttempt
          with:
            question: appName
            reason: overlength
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: m365agents.yml
        expect: { exists: true }
`;
  const result = compileInlineSource(sourceText, "vscuse-vcb-148.yml");
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const plan = result.value[0].plan;
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  const invalidIndex = typedValues.indexOf("g#ed!-k?/h");
  const overlengthIndex = typedValues.indexOf(
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
  const acceptedIndex = typedValues.indexOf(
    "${{var:app_name:vscuse_app_#####}}",
  );
  assert.equal(invalidIndex >= 0, true);
  assert.equal(invalidIndex < overlengthIndex, true);
  assert.equal(overlengthIndex < acceptedIndex, true);
  assert.equal(
    plan.steps.some((step) =>
      step.description.includes(
        "App name needs to begin with letters, include minimum two letters or digits, and exclude certain special characters.",
      ),
    ),
    true,
  );
  assert.equal(
    plan.steps.some((step) =>
      step.description.includes("App name is longer than the 30 characters."),
    ),
    true,
  );
  assertRecordedClick(plan, 228, 15, [
    "dhash:228:15:16:5:aac01865ca94b8d7",
    "dhash:228:15:96:5:3070703335b41230",
    "dhash:228:15:0:10:e0b89494b2717075",
  ]);
  assertRecordedClick(plan, 368, 75, [
    "dhash:368:75:16:5:60156a655559999b",
    "dhash:368:75:96:5:94222286a2460e00",
    "dhash:368:75:0:10:f0b09494b2717075",
  ]);
  assertRecordedClick(plan, 225, 21, [
    "dhash:225:21:16:5:9332656ca5928ae5",
    "dhash:225:21:96:5:b47272b0301919b4",
    "dhash:225:21:0:10:e0b89494b2717075",
  ]);
  assertRecordedClick(plan, 322, 72, [
    "dhash:322:72:16:5:00014033cb8ab6a6",
    "dhash:322:72:96:5:44a2b249ca120860",
    "dhash:322:72:0:10:f0b09494b2717075",
  ]);

  for (const [label, invalidSource] of [
    [
      "unknown reason",
      sourceText.replace("reason: invalidCharacters", "reason: unsupported"),
    ],
    [
      "missing question",
      sourceText.replace("            question: appName\n", ""),
    ],
    [
      "extra field",
      sourceText.replace(
        "            reason: invalidCharacters",
        "            reason: invalidCharacters\n            text: forbidden",
      ),
    ],
    [
      "reordered attempts",
      sourceText
        .replace("reason: invalidCharacters", "reason: placeholder")
        .replace("reason: overlength", "reason: invalidCharacters")
        .replace("reason: placeholder", "reason: overlength"),
    ],
    [
      "unsupported template",
      sourceText.replace("template: non-sso-tab", "template: default-bot"),
    ],
  ]) {
    const invalid = compileInlineSource(
      invalidSource,
      `vscuse-vcb-148-${label}.yml`,
    );
    assert.equal(invalid.ok, false, label);
    assert.equal(
      invalid.diagnostics[0].code,
      "VCB_REJECTED_SCAFFOLD_TEXT_ATTEMPT_INPUT_INVALID",
      label,
    );
  }
});

test("VCB-157: the overlength return assertion describes only the visible folder prompt", async () => {
  const result = await compileFixture(
    "feature-basic-tab-local-debug.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const folderAssertion = result.value[0].plan.steps.find((step) =>
    step.step_id.startsWith("step_rejectedOverlengthAppName_assertFolder_"),
  );
  assert.notEqual(folderAssertion, undefined);
  assert.equal(
    folderAssertion.description,
    "@assertion the Workspace Folder prompt is visible and Default folder is selectable.",
  );
});

test("VCB-163: the overlength entry assertion describes only the visible app-name prompt", async () => {
  const result = await compileFixture(
    "feature-basic-tab-local-debug.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const promptAssertion = result.value[0].plan.steps.find((step) =>
    step.step_id.startsWith("step_rejectedOverlengthAppName_assertPrompt_"),
  );
  assert.notEqual(promptAssertion, undefined);
  assert.equal(
    promptAssertion.description,
    "@assertion the Application Name prompt is visible and ready for text input.",
  );
});

test("VCB-149: addDaCapability adds the recorded Copilot connector and rejects unsafe input", () => {
  const sourceText = `version: 1
cases:
  - id: add-connector
    scenarioId: VCB-149
    workItemIds: [149]
    steps: [scaffold, check, add-connector, verify]
steps:
  scaffold:
    type: scaffold
    with:
      template: da/no-action
      answers:
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: appPackage/declarativeAgent.json
        expect: { exists: true }
  add-connector:
    type: addDaCapability
    with:
      capability: copilotConnector
      connectionId: testconnector
  verify:
    type: checks
    with:
      - type: file
        path: appPackage/declarativeAgent.json
        expect: { contains: [testconnector] }
`;
  const result = compileInlineSource(sourceText, "vscuse-vcb-149.yml");
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const plan = result.value[0].plan;
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  for (const value of [
    "Microsoft 365 Agents: Add Capability",
    "Copilot connector",
    "Enter a Copilot connector Connection ID",
    "testconnector",
  ]) {
    assert.equal(typedValues.includes(value), true, value);
  }
  assertRecordedClick(plan, 367, 75, [
    "dhash:367:75:16:5:00649b6452d25256",
    "dhash:367:75:96:5:0000902029c80000",
    "dhash:367:75:0:10:d0202223a62c2c2d",
  ]);
  assertRecordedClick(plan, 495, 116, [
    "dhash:495:116:16:5:c6d6b626b7de208c",
    "dhash:495:116:96:5:0008609818640800",
    "dhash:495:116:0:10:52322e6363636c2d",
  ]);

  for (const [label, invalidSource] of [
    [
      "unsupported capability",
      sourceText.replace("copilotConnector", "webSearch"),
    ],
    [
      "unsafe connection ID",
      sourceText.replace("testconnector", "test/connector"),
    ],
    [
      "missing connection ID",
      sourceText.replace("\n      connectionId: testconnector", ""),
    ],
    [
      "extra field",
      sourceText.replace(
        "      connectionId: testconnector",
        "      connectionId: testconnector\n      manifest: custom.json",
      ),
    ],
    [
      "unsupported template",
      sourceText.replace("template: da/no-action", "template: default-bot"),
    ],
  ]) {
    const invalid = compileInlineSource(
      invalidSource,
      `vscuse-vcb-149-${label}.yml`,
    );
    assert.equal(invalid.ok, false, label);
    assert.equal(
      invalid.diagnostics[0].code,
      "VCB_ADD_DA_CAPABILITY_INPUT_INVALID",
      label,
    );
  }
});

test("VCB-150: addDaAction adds the recorded OpenAPI action without tenant-policy provisioning", () => {
  const sourceText = `version: 1
cases:
  - id: add-action
    scenarioId: VCB-150
    workItemIds: [150]
    steps: [scaffold, check, add-action, verify]
steps:
  scaffold:
    type: scaffold
    with:
      template: da/no-action
      answers:
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: appPackage/declarativeAgent.json
        expect: { exists: true }
  add-action:
    type: addDaAction
    with:
      source: openapi
      url: https://raw.githubusercontent.com/huimiu/api-spec-example/main/repair-service.yml
      operations: all
  verify:
    type: checks
    with:
      - type: file
        path: appPackage/ai-plugin.json
        expect: { exists: true }
      - type: file
        path: appPackage/apiSpecificationFile/openapi.yaml
        expect: { exists: true }
      - type: file
        path: appPackage/declarativeAgent.json
        expect: { contains: ['"id": "action_1"'] }
`;
  const result = compileInlineSource(sourceText, "vscuse-vcb-150.yml");
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const plan = result.value[0].plan;
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(typedValues.includes("Microsoft 365 Agents: Add Action"), true);
  assert.equal(
    typedValues.includes(
      "https://raw.githubusercontent.com/huimiu/api-spec-example/main/repair-service.yml",
    ),
    true,
  );
  assert.equal(
    plan.steps.some(
      (step) =>
        step.description ===
        "@assertion the active prompt titled Enter OpenAPI Document URL is visible.",
    ),
    true,
  );
  assert.equal(typedValues.includes("Microsoft 365 Agents: Provision"), false);
  assert.equal(
    plan.steps.some((step) =>
      step.description.includes("Advanced declarative agent can't be deployed"),
    ),
    false,
  );
  assertRecordedClick(plan, 229, 53, [
    "dhash:229:53:16:5:84840404040c4946",
    "dhash:229:53:96:5:74746c7ebd5654ed",
    "dhash:229:53:0:10:444c226363626421",
  ]);
  assertRecordedClick(plan, 782, 56, [
    "dhash:782:56:16:5:ccd4d7c0d2c8e864",
    "dhash:782:56:96:5:142498991872301c",
    "dhash:782:56:0:10:444c2263666c6c2d",
  ]);
  assertRecordedClick(plan, 442, 81, [
    "dhash:442:81:16:5:636a0aaafb600aa1",
    "dhash:442:81:96:5:00012ed251080000",
    "dhash:442:81:0:10:d0282263666c6c2d",
  ]);
  assertRecordedClick(plan, 481, 112, [
    "dhash:481:112:16:5:12c034305256cac9",
    "dhash:481:112:96:5:0000304604300200",
    "dhash:481:112:0:10:72322e6363636421",
  ]);
  const assertionByPath = new Map(
    readFileAssertions(plan).map((assertion) => [assertion.path, assertion]),
  );
  assert.equal(assertionByPath.has("appPackage/ai-plugin.json"), true);
  assert.equal(
    assertionByPath.has("appPackage/apiSpecificationFile/openapi.yaml"),
    true,
  );
  assert.deepEqual(
    assertionByPath.get("appPackage/declarativeAgent.json").contains,
    ['"id": "action_1"'],
  );

  for (const [label, invalidSource] of [
    [
      "unsupported source",
      sourceText.replace("source: openapi", "source: mcp"),
    ],
    ["non-HTTPS URL", sourceText.replace("https://raw.", "http://raw.")],
    [
      "missing URL",
      sourceText.replace(
        "\n      url: https://raw.githubusercontent.com/huimiu/api-spec-example/main/repair-service.yml",
        "",
      ),
    ],
    [
      "unsupported operations",
      sourceText.replace("operations: all", "operations: one"),
    ],
    [
      "extra field",
      sourceText.replace(
        "      operations: all",
        "      operations: all\n      manifest: custom.json",
      ),
    ],
    [
      "unsupported template",
      sourceText.replace("template: da/no-action", "template: default-bot"),
    ],
  ]) {
    const invalid = compileInlineSource(
      invalidSource,
      `vscuse-vcb-150-${label}.yml`,
    );
    assert.equal(invalid.ok, false, label);
    assert.equal(
      invalid.diagnostics[0].code,
      "VCB_ADD_DA_ACTION_INPUT_INVALID",
      label,
    );
  }
});

test("VCB-151: regenerateDaAction selects a supported operation without pointer coordinates", () => {
  const sourceText = `version: 1
cases:
  - id: regenerate-action
    scenarioId: VCB-151
    workItemIds: [151]
    steps: [scaffold, check, regenerate, verify]
steps:
  scaffold:
    type: scaffold
    with:
      template: da/api-plugin-from-existing-api
      answers:
        - question: apiSpecLocation
          type: text
          value: https://raw.githubusercontent.com/SLdragon/example-openapi-spec/675fd5e0bf33ac3c4cb77a4eb51fc80461caff1d/real-no-auth.yaml
        - question: apiOperations
          type: multiSelect
          value: all
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: appPackage/ai-plugin.json
        expect: { exists: true }
  regenerate:
    type: regenerateDaAction
    with:
      operationId: listRepairs
  verify:
    type: checks
    with:
      - type: file
        path: appPackage/ai-plugin.json
        expect: { contains: [listRepairs] }
`;
  const result = compileInlineSource(sourceText, "vscuse-vcb-151.yml");
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const plan = result.value[0].plan;
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(
    typedValues.includes("Microsoft 365 Agents: Regenerate Action"),
    true,
  );
  assertRecordedClick(plan, 322, 77, [
    "dhash:322:77:16:5:00c0202020201060",
    "dhash:322:77:96:5:0000ba40c4b86060",
    "dhash:322:77:0:10:5024226363636421",
  ]);
  assert.equal(
    plan.steps.some(
      (step) =>
        step.description ===
        "@assertion the active multi-select prompt titled Select operation(s) Copilot can interact with. is visible.",
    ),
    true,
  );
  const operationPromptIndex = plan.steps.findIndex(
    (step) =>
      step.description ===
      "@assertion the active multi-select prompt titled Select operation(s) Copilot can interact with. is visible.",
  );
  const confirmationIndex = plan.steps.findIndex((step) =>
    step.step_id.startsWith("step_regenerateDaActionConfirm_assert_"),
  );
  assert.notEqual(operationPromptIndex, -1);
  assert.notEqual(confirmationIndex, -1);
  assert.equal(
    plan.steps
      .slice(operationPromptIndex, confirmationIndex)
      .some((step) => step.tool === "click"),
    false,
  );
  assert.equal(
    plan.steps.some(
      (step) =>
        step.tool === "key_press" &&
        step.parameters.key === "space" &&
        step.description ===
          "Press Space to check every option of the multi-select prompt.",
    ),
    true,
  );
  assert.equal(
    plan.steps.some(
      (step) =>
        step.tool === "click" &&
        step.parameters.x === 235 &&
        step.parameters.y === 258,
    ),
    false,
  );
  assertRecordedClick(plan, 494, 118, [
    "dhash:494:118:16:5:88953db1cd224900",
    "dhash:494:118:96:5:0028c0a323c40200",
    "dhash:494:118:0:10:72322e6363636421",
  ]);
  assert.equal(
    readFileAssertions(plan).some(
      (assertion) =>
        assertion.path === "appPackage/ai-plugin.json" &&
        assertion.contains.includes("listRepairs"),
    ),
    true,
  );

  for (const [label, invalidSource] of [
    ["unsupported operation", sourceText.replace("listRepairs", "getPetById")],
    [
      "missing operation",
      sourceText.replace("\n      operationId: listRepairs", ""),
    ],
    [
      "extra field",
      sourceText.replace(
        "      operationId: listRepairs",
        "      operationId: listRepairs\n      file: custom.json",
      ),
    ],
    [
      "unsupported template",
      sourceText.replace(
        "template: da/api-plugin-from-existing-api",
        "template: da/no-action",
      ),
    ],
  ]) {
    const invalid = compileInlineSource(
      invalidSource,
      `vscuse-vcb-151-${label}.yml`,
    );
    assert.equal(invalid.ok, false, label);
    assert.equal(
      invalid.diagnostics[0].code,
      "VCB_REGENERATE_DA_ACTION_INPUT_INVALID",
      label,
    );
  }
});

test("VCB-158: regeneration selects a pinned supported no-auth operation", async () => {
  const result = await compileFixture(
    "feature-da-regenerate-action.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const plan = result.value[0].plan;
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(
    typedValues.includes(
      "https://raw.githubusercontent.com/SLdragon/example-openapi-spec/675fd5e0bf33ac3c4cb77a4eb51fc80461caff1d/real-no-auth.yaml",
    ),
    true,
  );
  assert.equal(
    plan.steps.some(
      (step) =>
        step.description ===
        "@assertion the active multi-select prompt titled Select operation(s) Copilot can interact with. is visible.",
    ),
    true,
  );
  assert.equal(
    plan.steps.some((step) =>
      step.step_id.startsWith("step_regenerateDaActionSelectFindByStatus_"),
    ),
    false,
  );
  assert.equal(
    readFileAssertions(plan).some(
      (assertion) =>
        assertion.path === "appPackage/ai-plugin.json" &&
        assertion.contains.includes("listRepairs"),
    ),
    true,
  );
  for (const [label, mutate] of [
    [
      "mismatched source",
      (sourceText) =>
        sourceText.replace(
          "https://raw.githubusercontent.com/SLdragon/example-openapi-spec/675fd5e0bf33ac3c4cb77a4eb51fc80461caff1d/real-no-auth.yaml",
          "https://raw.githubusercontent.com/SLdragon/example-openapi-spec/refs/heads/main/petstore-official.yaml",
        ),
    ],
    [
      "missing select-all answer",
      (sourceText) =>
        sourceText.replace(
          `        - question: apiOperations
          type: multiSelect
          value: all
`,
          "",
        ),
    ],
  ]) {
    const invalid = await compileFixture(
      "feature-da-regenerate-action.yml",
      mutate,
    );
    assert.equal(invalid.ok, false, label);
    assert.equal(
      invalid.diagnostics[0].code,
      "VCB_REGENERATE_DA_ACTION_INPUT_INVALID",
      label,
    );
  }
  assert.equal(
    plan.steps.some(
      (step) =>
        step.description ===
        '@assertion a visible Visual Studio Code notification contains the literal text Action "action_1" updated successfully.. A notification with different text, including an in-progress notification, does not satisfy this assertion.',
    ),
    true,
  );
  const actionGroundingIndex = plan.steps.findIndex((step) =>
    readFileAssertions({ steps: [step] }).some(
      (assertion) =>
        assertion.path === "appPackage/declarativeAgent.json" &&
        assertion.contains.includes('"id": "action_1"'),
    ),
  );
  const confirmationIndex = plan.steps.findIndex((step) =>
    step.step_id.startsWith("step_regenerateDaActionConfirm_click_"),
  );
  const successIndex = plan.steps.findIndex((step) =>
    step.step_id.startsWith("step_assertNotificationContains_assert_"),
  );
  const finalCheckIndex = plan.steps.findIndex((step) =>
    readFileAssertions({ steps: [step] }).some(
      (assertion) =>
        assertion.path === "appPackage/ai-plugin.json" &&
        assertion.contains.includes("listRepairs"),
    ),
  );
  assert.equal(
    actionGroundingIndex < confirmationIndex &&
      confirmationIndex < successIndex &&
      successIndex < finalCheckIndex,
    true,
  );
});

function createPackageSource({
  includePackage = true,
  includePublish = false,
} = {}) {
  const caseSteps = [
    "scaffold",
    "check",
    "login-m365",
    "target-local",
    "open-app",
    ...(includePackage ? ["package-app"] : []),
    ...(includePublish ? ["publish"] : []),
  ];
  return `version: 1
cases:
  - id: package-and-publish
    scenarioId: VCB-152
    workItemIds: [152]
    steps: [${caseSteps.join(", ")}]
steps:
  scaffold:
    type: scaffold
    with:
      template: default-bot
      answers:
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: appPackage/manifest.json
        expect: { exists: true }
  login-m365:
    type: login
    with:
      type: m365
      account: "\${{env:M365_ACCOUNT_NAME}}"
      password: "\${{secret:M365_ACCOUNT_PASSWORD}}"
  target-local:
    type: target
    with:
      profile: "Debug in Teams (Chrome)"
      profileSelection: first
  open-app:
    type: open
    with: { kind: app, destination: chat }
  package-app:
    type: packageApp
    with:
      environment: local
  publish:
    type: publishDeveloperPortal
${includePublish ? "" : ""}
`;
}

test("VCB-152: packageApp preserves the recorded local package flow and rejects invalid state", () => {
  const sourceText = createPackageSource();
  const result = compileInlineSource(sourceText, "vscuse-vcb-152.yml");
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const plan = result.value[0].plan;
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(
    typedValues.includes("Microsoft 365 Agents: Zip App Package"),
    true,
  );
  assert.equal(typedValues.includes("local"), true);
  assert.equal(
    plan.steps.some((step) =>
      step.description.includes("App package successfully built at"),
    ),
    true,
  );
  assertRecordedClick(plan, 1002, 16, [
    "dhash:1002:16:16:5:2a14629919474709",
    "dhash:1002:16:96:5:d2233323c228c6e6",
    "dhash:1002:16:0:10:38bcb08e8eb681a1",
  ]);
  assertRecordedClick(plan, 394, 76, [
    "dhash:394:76:16:5:21a65953529ab34e",
    "dhash:394:76:96:5:0005804505010000",
    "dhash:394:76:0:10:d0832723b2292168",
  ]);

  for (const [label, invalidSource] of [
    [
      "unsupported environment",
      sourceText.replace("environment: local", "environment: dev"),
    ],
    [
      "missing environment",
      sourceText.replace("\n      environment: local", ""),
    ],
    [
      "extra field",
      sourceText.replace(
        "      environment: local",
        "      environment: local\n      manifest: custom.json",
      ),
    ],
    [
      "unsupported template",
      sourceText.replace("template: default-bot", "template: weather-agent"),
    ],
    [
      "missing chat-ready",
      sourceText.replace("open-app, package-app", "package-app"),
    ],
  ]) {
    const invalid = compileInlineSource(
      invalidSource,
      `vscuse-vcb-152-${label}.yml`,
    );
    assert.equal(invalid.ok, false, label);
    assert.equal(
      invalid.diagnostics[0].code,
      "VCB_PACKAGE_APP_INPUT_INVALID",
      label,
    );
  }
});

test("VCB-165: packageApp packages a configured TypeSpec action before provision", async () => {
  const sourceText = `version: 1
cases:
  - id: typespec-package
    scenarioId: VCB-165
    workItemIds: [33517192]
    steps: [scaffold, check, configure-action, package-app]
steps:
  scaffold:
    type: scaffold
    with:
      template: da/typespec
      answers:
        - question: projectType
          value: copilot-agent-type
        - question: daTemplate
          value: typespec
        - question: workspaceFolder
          value: default
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: src/agent/main.tsp
        expect: { exists: true }
  configure-action:
    type: configureTypeSpecAction
    with:
      action: github-issues
  package-app:
    type: packageApp
    with:
      environment: dev
`;
  const result = compileInlineSource(sourceText, "vscuse-vcb-165.yml");
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const plan = result.value[0].plan;
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(
    typedValues.includes("Microsoft 365 Agents: Zip App Package"),
    true,
  );
  assert.equal(typedValues.includes("dev"), true);
  assert.equal(typedValues.includes("npm run generate:env"), false);
  assert.equal(
    plan.steps.some((step) =>
      step.description.includes("App package successfully built at"),
    ),
    true,
  );
  assert.equal(
    plan.steps.some(
      (step) =>
        step.tool === "click" &&
        step.parameters.x === 1002 &&
        step.parameters.y === 16,
    ),
    false,
  );
  assertRecordedClick(plan, 442, 81, [
    "dhash:442:81:16:5:0c736a0aaafb608c",
    "dhash:442:81:96:5:000028d2d128121c",
    "dhash:442:81:0:10:d0712230b022a00d",
  ]);

  for (const [label, invalidSource] of [
    [
      "missing configured action",
      sourceText.replace(
        "check, configure-action, package-app",
        "check, package-app",
      ),
    ],
    [
      "unsupported environment",
      sourceText.replace("environment: dev", "environment: local"),
    ],
  ]) {
    const invalid = compileInlineSource(
      invalidSource,
      `vscuse-vcb-165-${label}.yml`,
    );
    assert.equal(invalid.ok, false, label);
    assert.equal(
      invalid.diagnostics[0].code,
      "VCB_PACKAGE_APP_INPUT_INVALID",
      label,
    );
  }

  const fixture = await compileFixture(
    "da-typespec-with-action.yml",
    (sourceText) => sourceText,
  );
  assert.equal(fixture.ok, true, fixture.diagnostics?.[0]?.code);
  const migrated = fixture.value.find(
    ({ caseId }) =>
      caseId === "feature-da-typespec-package-action-remote-preview",
  );
  assert.notEqual(migrated, undefined);
  assert.equal(migrated.plan.plan_metadata.description.workitem, "33517192");
  const migratedSteps = migrated.plan.steps;
  const packageIndex = migratedSteps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "Microsoft 365 Agents: Zip App Package",
  );
  const loginIndex = migratedSteps.findIndex((step) =>
    step.description.includes(
      "ACCOUNTS section of the side bar lists an entry whose label begins with Sign in to Microsoft",
    ),
  );
  const provisionIndex = migratedSteps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "Microsoft 365 Agents: Provision",
  );
  assert.notEqual(packageIndex, -1);
  assert.notEqual(loginIndex, -1);
  assert.notEqual(provisionIndex, -1);
  assert.equal(packageIndex < loginIndex, true);
  assert.equal(loginIndex < provisionIndex, true);
});

test("VCB-166: no-action API-key configuration uses coordinate-free prompts before provision", async () => {
  const sourceText = `version: 1
cases:
  - id: no-action-api-key
    scenarioId: VCB-166
    workItemIds: [31543255]
    steps: [scaffold, check, add-action, add-auth, check-auth, login, provision]
steps:
  scaffold:
    type: scaffold
    with:
      template: da/no-action
      answers:
        - question: projectType
          value: copilot-agent-type
        - question: daTemplate
          value: no-action
        - question: workspaceFolder
          value: default
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: appPackage/declarativeAgent.json
        expect: { exists: true }
  add-action:
    type: addDaAction
    with:
      source: openapi
      url: https://raw.githubusercontent.com/neil-yechenwei/uitest/6c0c1cb66ce41fd4112a15ee9d996dde9ff233f7/Spec_add_auth_apikey.yaml
      operations: all
  add-auth:
    type: addApiAuthConfiguration
    with:
      authType: api-key
      authName: apiKey
      location: header
      keyName: X-API-KEY
  check-auth:
    type: checks
    with:
      - type: file
        path: appPackage/ai-plugin.json
        expect: { contains: ['"type": "ApiKeyPluginVault"'] }
  login:
    type: login
    with:
      type: m365
      account: "\${{env:M365_ACCOUNT_NAME}}"
      password: "\${{secret:M365_ACCOUNT_PASSWORD}}"
  provision:
    type: provision
    with:
      apiKey: "\${{secret:EXISTING_API_KEY}}"
`;
  const result = compileInlineSource(sourceText, "vscuse-vcb-166.yml");
  assert.equal(
    result.ok,
    true,
    `${result.diagnostics?.[0]?.code}: ${result.diagnostics?.[0]?.message}`,
  );
  const steps = result.value[0].plan.steps;
  const commandTitle =
    "Microsoft 365 Agents: Add Configurations to Support Actions with Authentication in Declarative Agent";
  const commandIndex = steps.findIndex(
    (step) =>
      step.tool === "type_text" && step.parameters.text === commandTitle,
  );
  const successText =
    "Microsoft 365 Agents Toolkit has successfully updated your project configuration (m365agents.yaml and m365agents.local.yaml) files with added action to support authentication flow. You can proceed to remote provision.";
  const successIndex = steps.findIndex((step) =>
    step.description.includes(successText),
  );
  assert.notEqual(commandIndex, -1);
  assert.notEqual(successIndex, -1);
  const configurationSteps = steps.slice(commandIndex, successIndex + 1);
  assert.deepEqual(
    configurationSteps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text),
    [commandTitle, "apiKey", "API Key", "Header", "X-API-KEY"],
  );
  assert.equal(
    configurationSteps.some((step) => step.tool === "click"),
    false,
  );
  assert.equal(
    configurationSteps.some((step) =>
      step.description.includes(
        "the active prompt titled Import Manifest File is visible and the option ai-plugin.json is focused",
      ),
    ),
    true,
  );
  assert.equal(
    steps.some(
      (step) =>
        step.tool === "type_text" &&
        step.parameters.text === "Microsoft 365 Agents: Provision",
    ),
    true,
  );

  for (const [label, invalidSource, expectedCode] of [
    [
      "missing action",
      sourceText.replace("check, add-action, add-auth", "check, add-auth"),
      "VCB_ADD_API_AUTH_INPUT_INVALID",
    ],
    [
      "unconfigured provision",
      sourceText.replace("add-action, add-auth, check-auth", "add-action"),
      "VCB_PROVISION_INPUT_REDUNDANT",
    ],
    [
      "unsupported auth type",
      sourceText.replace("authType: api-key", "authType: oauth"),
      "VCB_ADD_API_AUTH_INPUT_INVALID",
    ],
    [
      "unsupported location",
      sourceText.replace("location: header", "location: query"),
      "VCB_ADD_API_AUTH_INPUT_INVALID",
    ],
  ]) {
    const invalid = compileInlineSource(
      invalidSource,
      `vscuse-vcb-166-${label}.yml`,
    );
    assert.equal(invalid.ok, false, label);
    assert.equal(invalid.diagnostics[0].code, expectedCode, label);
  }

  const fixture = await compileFixture(
    "feature-da-no-action-add-action.yml",
    (sourceText) => sourceText,
  );
  assert.equal(fixture.ok, true, fixture.diagnostics?.[0]?.code);
  const migrated = fixture.value.find(
    ({ caseId }) => caseId === "feature-da-no-action-api-key-auth-provision",
  );
  assert.notEqual(migrated, undefined);
  assert.equal(migrated.plan.plan_metadata.description.workitem, "31543255");
  const migratedSteps = migrated.plan.steps;
  assert.equal(
    migratedSteps.some(
      (step) =>
        step.tool === "type_text" &&
        step.parameters.text ===
          "https://raw.githubusercontent.com/neil-yechenwei/uitest/6c0c1cb66ce41fd4112a15ee9d996dde9ff233f7/Spec_add_auth_apikey.yaml",
    ),
    true,
  );
  const authSuccessIndex = migratedSteps.findIndex((step) =>
    step.description.includes(successText),
  );
  const loginIndex = migratedSteps.findIndex((step) =>
    step.description.includes(
      "ACCOUNTS section of the side bar lists an entry whose label begins with Sign in to Microsoft",
    ),
  );
  const provisionIndex = migratedSteps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "Microsoft 365 Agents: Provision",
  );
  assert.notEqual(authSuccessIndex, -1);
  assert.notEqual(loginIndex, -1);
  assert.notEqual(provisionIndex, -1);
  assert.equal(authSuccessIndex < loginIndex, true);
  assert.equal(loginIndex < provisionIndex, true);
  assert.deepEqual(
    readFileAssertions(migrated.plan).map((assertion) => assertion.path),
    [
      "appPackage/declarativeAgent.json",
      "appPackage/ai-plugin.json",
      "appPackage/ai-plugin.json",
      "appPackage/apiSpecificationFile/openapi.yaml",
      "appPackage/declarativeAgent.json",
      "appPackage/ai-plugin.json",
      "appPackage/apiSpecificationFile/openapi.yaml",
      "m365agents.yml",
      "m365agents.local.yml",
    ],
  );
});

test("VCB-167: no-action Bearer configuration provisions with the bearer token secret", async () => {
  const sourceText = `version: 1
cases:
  - id: no-action-bearer
    scenarioId: VCB-167
    workItemIds: [31043015]
    steps: [scaffold, check, add-action, add-auth, check-auth, login, provision]
steps:
  scaffold:
    type: scaffold
    with:
      template: da/no-action
      answers:
        - question: projectType
          value: copilot-agent-type
        - question: daTemplate
          value: no-action
        - question: workspaceFolder
          value: default
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: appPackage/declarativeAgent.json
        expect: { exists: true }
  add-action:
    type: addDaAction
    with:
      source: openapi
      url: https://raw.githubusercontent.com/neil-yechenwei/uitest/6c0c1cb66ce41fd4112a15ee9d996dde9ff233f7/Spec_add_auth_bearer.yaml
      operations: all
  add-auth:
    type: addApiAuthConfiguration
    with:
      authType: bearer-token
      authName: apiKey
  check-auth:
    type: checks
    with:
      - type: file
        path: appPackage/apiSpecificationFile/openapi.yaml
        expect: { contains: ["type: http", "scheme: bearer"] }
  login:
    type: login
    with:
      type: m365
      account: "\${{env:M365_ACCOUNT_NAME}}"
      password: "\${{secret:M365_ACCOUNT_PASSWORD}}"
  provision:
    type: provision
    with:
      apiKey: "\${{secret:EXISTING_API_BEARER_TOKEN}}"
`;
  const result = compileInlineSource(sourceText, "vscuse-vcb-167.yml");
  assert.equal(
    result.ok,
    true,
    `${result.diagnostics?.[0]?.code}: ${result.diagnostics?.[0]?.message}`,
  );
  const steps = result.value[0].plan.steps;
  const commandTitle =
    "Microsoft 365 Agents: Add Configurations to Support Actions with Authentication in Declarative Agent";
  const commandIndex = steps.findIndex(
    (step) =>
      step.tool === "type_text" && step.parameters.text === commandTitle,
  );
  const successText =
    "Microsoft 365 Agents Toolkit has successfully updated your project configuration (m365agents.yaml and m365agents.local.yaml) files with added action to support authentication flow. You can proceed to remote provision.";
  const successIndex = steps.findIndex((step) =>
    step.description.includes(successText),
  );
  assert.notEqual(commandIndex, -1);
  assert.notEqual(successIndex, -1);
  const configurationSteps = steps.slice(commandIndex, successIndex + 1);
  assert.deepEqual(
    configurationSteps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text),
    [commandTitle, "apiKey", "API Key (Bearer Token Auth)"],
  );
  assert.equal(
    configurationSteps.some((step) => step.tool === "click"),
    false,
  );
  assert.equal(
    steps.some(
      (step) =>
        step.tool === "type_text" &&
        step.parameters.text === "Microsoft 365 Agents: Provision",
    ),
    true,
  );

  for (const [label, invalidSource, expectedCode] of [
    [
      "missing action",
      sourceText.replace("check, add-action, add-auth", "check, add-auth"),
      "VCB_ADD_API_AUTH_INPUT_INVALID",
    ],
    [
      "unconfigured provision",
      sourceText.replace("add-action, add-auth, check-auth", "add-action"),
      "VCB_PROVISION_INPUT_REDUNDANT",
    ],
    [
      "unsupported auth type",
      sourceText.replace("authType: bearer-token", "authType: oauth"),
      "VCB_ADD_API_AUTH_INPUT_INVALID",
    ],
    [
      "API-key location field",
      sourceText.replace(
        "authName: apiKey",
        "authName: apiKey\n      location: header",
      ),
      "VCB_ADD_API_AUTH_INPUT_INVALID",
    ],
    [
      "API-key name field",
      sourceText.replace(
        "authName: apiKey",
        "authName: apiKey\n      keyName: X-API-KEY",
      ),
      "VCB_ADD_API_AUTH_INPUT_INVALID",
    ],
  ]) {
    const invalid = compileInlineSource(
      invalidSource,
      `vscuse-vcb-167-${label}.yml`,
    );
    assert.equal(invalid.ok, false, label);
    assert.equal(invalid.diagnostics[0].code, expectedCode, label);
  }

  const fixture = await compileFixture(
    "feature-da-no-action-add-action.yml",
    (sourceText) => sourceText,
  );
  assert.equal(fixture.ok, true, fixture.diagnostics?.[0]?.code);
  const migrated = fixture.value.find(
    ({ caseId }) => caseId === "feature-da-no-action-bearer-auth-provision",
  );
  assert.notEqual(migrated, undefined);
  assert.equal(migrated.plan.plan_metadata.description.workitem, "31043015");
  const migratedSteps = migrated.plan.steps;
  assert.equal(
    migratedSteps.some(
      (step) =>
        step.tool === "type_text" &&
        step.parameters.text ===
          "https://raw.githubusercontent.com/neil-yechenwei/uitest/6c0c1cb66ce41fd4112a15ee9d996dde9ff233f7/Spec_add_auth_bearer.yaml",
    ),
    true,
  );
  const authSuccessIndex = migratedSteps.findIndex((step) =>
    step.description.includes(successText),
  );
  const loginIndex = migratedSteps.findIndex((step) =>
    step.description.includes(
      "ACCOUNTS section of the side bar lists an entry whose label begins with Sign in to Microsoft",
    ),
  );
  const provisionIndex = migratedSteps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "Microsoft 365 Agents: Provision",
  );
  assert.notEqual(authSuccessIndex, -1);
  assert.notEqual(loginIndex, -1);
  assert.notEqual(provisionIndex, -1);
  assert.equal(authSuccessIndex < loginIndex, true);
  assert.equal(loginIndex < provisionIndex, true);
  assert.equal(
    migratedSteps.some(
      (step) =>
        step.tool === "type_text" &&
        step.parameters.text === "${{secret:EXISTING_API_BEARER_TOKEN}}",
    ),
    true,
  );
  assert.equal(
    migratedSteps.some(
      (step) =>
        step.tool === "type_text" &&
        step.parameters.text === "${{secret:EXISTING_API_KEY}}",
    ),
    false,
  );
  const fileAssertions = readFileAssertions(migrated.plan);
  assert.deepEqual(
    fileAssertions.map((assertion) => assertion.path),
    [
      "appPackage/declarativeAgent.json",
      "appPackage/ai-plugin.json",
      "appPackage/ai-plugin.json",
      "appPackage/apiSpecificationFile/openapi.yaml",
      "appPackage/declarativeAgent.json",
      "appPackage/ai-plugin.json",
      "appPackage/apiSpecificationFile/openapi.yaml",
      "m365agents.yml",
      "m365agents.local.yml",
    ],
  );
  for (const [path, expectedText] of [
    ["appPackage/ai-plugin.json", '"type": "ApiKeyPluginVault"'],
    ["appPackage/apiSpecificationFile/openapi.yaml", "scheme: bearer"],
    ["m365agents.yml", "uses: apiKey/register"],
    ["m365agents.local.yml", "uses: apiKey/register"],
  ]) {
    assert.equal(
      fileAssertions.some(
        (assertion) =>
          assertion.path === path && assertion.contains?.includes(expectedText),
      ),
      true,
      `${path}: ${expectedText}`,
    );
  }
});

test("VCB-168: no-action Microsoft Entra configuration verifies persistent notifications", async () => {
  const scope =
    "api://plugincb4aae.azurewebsites.net/4cfde729-32e4-4862-a409-07e14dbfd296/readpairs_read: Read repair records";
  const sourceText = `version: 1
cases:
  - id: no-action-entra
    scenarioId: VCB-168
    workItemIds: [31538607]
    steps: [scaffold, check, add-action, add-auth, check-auth, login, provision, target, open, check-sign-in]
steps:
  scaffold:
    type: scaffold
    with:
      template: da/no-action
      answers:
        - question: projectType
          value: copilot-agent-type
        - question: daTemplate
          value: no-action
        - question: workspaceFolder
          value: default
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: appPackage/declarativeAgent.json
        expect: { exists: true }
  add-action:
    type: addDaAction
    with:
      source: openapi
      url: https://raw.githubusercontent.com/neil-yechenwei/uitest/6c0c1cb66ce41fd4112a15ee9d996dde9ff233f7/Spec_add_auth_aad_tmp.yaml
      operations: all
  add-auth:
    type: addApiAuthConfiguration
    with:
      authType: microsoft-entra
      authName: aadAuthCode
      scope: "${scope}"
  check-auth:
    type: checks
    with:
      - type: file
        path: appPackage/ai-plugin.json
        expect: { contains: ['"type": "OAuthPluginVault"'] }
  login:
    type: login
    with:
      type: m365
      account: "\${{env:M365_ACCOUNT_NAME}}"
      password: "\${{secret:M365_ACCOUNT_PASSWORD}}"
  provision:
    type: provision
    with:
      entra:
        clientId: "\${{env:EXISTING_ENTRA_CLIENT_ID}}"
  target:
    type: target
    with:
      profile: "Preview in Copilot (Chrome)"
      profileSelection: second
  open:
    type: open
    with:
      kind: agent
      destination: chat
  check-sign-in:
    type: checks
    with:
      - type: chat
        send: show repair records assigned to karin blair
        allowAction: true
      - type: browser
        expect:
          role: button
          namePrefix: Sign in to
`;
  const result = compileInlineSource(sourceText, "vscuse-vcb-168.yml");
  assert.equal(
    result.ok,
    true,
    `${result.diagnostics?.[0]?.code}: ${result.diagnostics?.[0]?.message}`,
  );
  const steps = result.value[0].plan.steps;
  const commandTitle =
    "Microsoft 365 Agents: Add Configurations to Support Actions with Authentication in Declarative Agent";
  const commandIndex = steps.findIndex(
    (step) =>
      step.tool === "type_text" && step.parameters.text === commandTitle,
  );
  const guidancePrefix = "Microsoft 365 Agents Toolkit has successfully ad";
  const successText =
    "Microsoft 365 Agents Toolkit has successfully updated your project configuration (m365agents.yaml and m365agents.local.yaml) files with added action to support authentication flow. You can proceed to remote provision.";
  const notificationAssertions = steps.filter(
    (step) =>
      step.agent === "assertion" &&
      (step.description.includes(guidancePrefix) ||
        step.description.includes(successText)),
  );
  assert.notEqual(commandIndex, -1);
  assert.equal(notificationAssertions.length, 1);
  assert.equal(
    notificationAssertions[0].description.includes(guidancePrefix),
    true,
  );
  assert.match(notificationAssertions[0].description, /yellow warning/);
  assert.equal(
    notificationAssertions[0].description.includes(successText),
    true,
  );
  const notificationIndex = steps.indexOf(notificationAssertions[0]);
  const notificationCenterIndex = steps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "Notifications: Show Notifications",
  );
  assert.notEqual(notificationCenterIndex, -1);
  assert.equal(notificationCenterIndex < notificationIndex, true);
  const configurationSteps = steps.slice(commandIndex, notificationIndex + 1);
  assert.deepEqual(
    configurationSteps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text),
    [
      commandTitle,
      "aadAuthCode",
      "Microsoft Entra",
      scope,
      "Notifications: Show Notifications",
    ],
  );
  assert.equal(
    configurationSteps.some((step) => step.tool === "click"),
    false,
  );
  assert.equal(
    steps.some(
      (step) =>
        step.tool === "type_text" &&
        step.parameters.text === "${{env:EXISTING_ENTRA_CLIENT_ID}}",
    ),
    true,
  );

  for (const [label, invalidSource, expectedCode] of [
    [
      "missing action",
      sourceText.replace("check, add-action, add-auth", "check, add-auth"),
      "VCB_ADD_API_AUTH_INPUT_INVALID",
    ],
    [
      "unconfigured provision",
      sourceText.replace("add-action, add-auth, check-auth", "add-action"),
      "VCB_PROVISION_INPUT_REDUNDANT",
    ],
    [
      "unsupported auth type",
      sourceText.replace("authType: microsoft-entra", "authType: oauth"),
      "VCB_ADD_API_AUTH_INPUT_INVALID",
    ],
    [
      "unsupported auth name",
      sourceText.replace("authName: aadAuthCode", "authName: otherAuth"),
      "VCB_ADD_API_AUTH_INPUT_INVALID",
    ],
    [
      "unsupported scope",
      sourceText.replace(scope, "api://other/scope: Other scope"),
      "VCB_ADD_API_AUTH_INPUT_INVALID",
    ],
    [
      "literal client ID",
      sourceText.replace(
        "${{env:EXISTING_ENTRA_CLIENT_ID}}",
        "4cfde729-32e4-4862-a409-07e14dbfd296",
      ),
      "VCB_ACCOUNT_EXPRESSION_REQUIRED",
    ],
  ]) {
    const invalid = compileInlineSource(
      invalidSource,
      `vscuse-vcb-168-${label}.yml`,
    );
    assert.equal(invalid.ok, false, label);
    assert.equal(invalid.diagnostics[0].code, expectedCode, label);
  }

  const fixture = await compileFixture(
    "feature-da-no-action-add-action.yml",
    (sourceText) => sourceText,
  );
  assert.equal(fixture.ok, true, fixture.diagnostics?.[0]?.code);
  const migrated = fixture.value.find(
    ({ caseId }) => caseId === "feature-da-no-action-entra-auth-remote-preview",
  );
  assert.notEqual(migrated, undefined);
  assert.equal(migrated.plan.plan_metadata.description.workitem, "31538607");
  const migratedSteps = migrated.plan.steps;
  assert.equal(
    migratedSteps.some(
      (step) =>
        step.tool === "type_text" &&
        step.parameters.text ===
          "https://raw.githubusercontent.com/neil-yechenwei/uitest/6c0c1cb66ce41fd4112a15ee9d996dde9ff233f7/Spec_add_auth_aad_tmp.yaml",
    ),
    true,
  );
  const authSuccessIndex = migratedSteps.findIndex((step) =>
    step.description.includes(successText),
  );
  const loginIndex = migratedSteps.findIndex((step) =>
    step.description.includes(
      "ACCOUNTS section of the side bar lists an entry whose label begins with Sign in to Microsoft",
    ),
  );
  const provisionIndex = migratedSteps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "Microsoft 365 Agents: Provision",
  );
  const targetIndex = migratedSteps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "Debug: Select and Start Debugging",
  );
  const chatIndex = migratedSteps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "show repair records assigned to karin blair",
  );
  const signInIndex = migratedSteps.findIndex((step) =>
    step.description.includes(
      "a visible browser element has role button and an accessible name that starts with Sign in to",
    ),
  );
  for (const index of [
    authSuccessIndex,
    loginIndex,
    provisionIndex,
    targetIndex,
    chatIndex,
    signInIndex,
  ]) {
    assert.notEqual(index, -1);
  }
  assert.equal(authSuccessIndex < loginIndex, true);
  assert.equal(loginIndex < provisionIndex, true);
  assert.equal(provisionIndex < targetIndex, true);
  assert.equal(targetIndex < chatIndex, true);
  assert.equal(chatIndex < signInIndex, true);
  const fileAssertions = readFileAssertions(migrated.plan);
  assert.deepEqual(
    fileAssertions.map((assertion) => assertion.path),
    [
      "appPackage/declarativeAgent.json",
      "appPackage/ai-plugin.json",
      "appPackage/ai-plugin.json",
      "appPackage/apiSpecificationFile/openapi.yaml",
      "appPackage/declarativeAgent.json",
      "appPackage/ai-plugin.json",
      "appPackage/apiSpecificationFile/openapi.yaml",
      "m365agents.yml",
      "m365agents.local.yml",
    ],
  );
  for (const [path, expectedText] of [
    ["appPackage/ai-plugin.json", '"type": "OAuthPluginVault"'],
    [
      "appPackage/ai-plugin.json",
      '"reference_id": "${{AADAUTHCODE_REGISTRATION_ID}}"',
    ],
    ["appPackage/apiSpecificationFile/openapi.yaml", "aadAuthCode:"],
    ["appPackage/apiSpecificationFile/openapi.yaml", "type: oauth2"],
    [
      "appPackage/apiSpecificationFile/openapi.yaml",
      "https://login.microsoftonline.com/${{TEAMS_APP_TENANT_ID}}/oauth2/v2.0/authorize",
    ],
    ["m365agents.yml", "uses: oauth/register"],
    ["m365agents.yml", "identityProvider: MicrosoftEntra"],
    ["m365agents.yml", "configurationId: AADAUTHCODE_REGISTRATION_ID"],
    ["m365agents.yml", "applicationIdUri: AADAUTHCODE_APPLICATION_ID_URI"],
    ["m365agents.local.yml", "uses: oauth/register"],
    ["m365agents.local.yml", "identityProvider: MicrosoftEntra"],
  ]) {
    assert.equal(
      fileAssertions.some(
        (assertion) =>
          assertion.path === path && assertion.contains?.includes(expectedText),
      ),
      true,
      `${path}: ${expectedText}`,
    );
  }
});

test("VCB-169: Feature-derived cases use feature-prefixed descriptor filenames", async () => {
  const noAction = await compileFixture(
    "feature-da-no-action-add-action.yml",
    (sourceText) => sourceText,
  );
  const typeSpec = await compileFixture(
    "da-typespec-with-action.yml",
    (sourceText) => sourceText,
  );
  assert.equal(noAction.ok, true, noAction.diagnostics?.[0]?.code);
  assert.equal(typeSpec.ok, true, typeSpec.diagnostics?.[0]?.code);
  const noActionCaseIds = noAction.value.map(({ caseId }) => caseId);
  assert.equal(noActionCaseIds[0], "da-no-action-add-openapi-action");
  assert.equal(
    noActionCaseIds.includes("da-no-action-add-mcp-bearer-action"),
    true,
  );
  const expectedFeatureCaseIds = [
    "feature-da-add-mcp-server",
    "feature-da-two-openapi-actions-personal-provision",
    "feature-da-no-action-api-key-auth-provision",
    "feature-da-no-action-bearer-auth-provision",
    "feature-da-no-action-entra-auth-remote-preview",
    "feature-da-no-action-oauth-auth-remote-preview",
    "feature-da-no-action-pkce-oauth-auth-remote-preview",
  ];
  for (const expectedCaseId of expectedFeatureCaseIds) {
    assert.equal(
      noActionCaseIds.includes(expectedCaseId),
      true,
      expectedCaseId,
    );
  }
  assert.equal(
    noActionCaseIds.filter((caseId) => caseId.startsWith("feature-")).length,
    expectedFeatureCaseIds.length,
  );
  assert.deepEqual(
    typeSpec.value.map(({ caseId }) => caseId),
    [
      "da-typespec-with-action-remote-preview",
      "feature-da-typespec-package-action-remote-preview",
    ],
  );
  for (const generated of [
    ...noAction.value.filter(({ caseId }) => caseId.startsWith("feature-")),
    typeSpec.value[1],
  ]) {
    assert.equal(generated.caseId.startsWith("feature-"), true);
    assert.equal(generated.fileName, `${generated.caseId}.json`);
  }
});

test("VCB-170: no-action OAuth configuration provisions protected credentials", async () => {
  const authorizationUrl = "https://github.com/login/oauth/authorize";
  const tokenUrl = "https://github.com/login/oauth/access_token";
  const scope = "repo: Read repos";
  const sourceText = `version: 1
cases:
  - id: feature-no-action-oauth
    scenarioId: VCB-170
    workItemIds: [31043030]
    steps: [scaffold, check, add-action, add-auth, check-auth, login, provision, target, open, check-sign-in]
steps:
  scaffold:
    type: scaffold
    with:
      template: da/no-action
      answers:
        - question: projectType
          value: copilot-agent-type
        - question: daTemplate
          value: no-action
        - question: workspaceFolder
          value: default
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: appPackage/declarativeAgent.json
        expect: { exists: true }
  add-action:
    type: addDaAction
    with:
      source: openapi
      url: https://raw.githubusercontent.com/neil-yechenwei/uitest/6c0c1cb66ce41fd4112a15ee9d996dde9ff233f7/Spec_add_auth_oauth_github.yaml
      operations: all
  add-auth:
    type: addApiAuthConfiguration
    with:
      authType: oauth
      authName: oauth2
      authorizationUrl: ${authorizationUrl}
      tokenUrl: ${tokenUrl}
      refreshUrl: ""
      scope: "${scope}"
      pkce: false
  check-auth:
    type: checks
    with:
      - type: file
        path: appPackage/ai-plugin.json
        expect: { contains: ['"type": "OAuthPluginVault"'] }
  login:
    type: login
    with:
      type: m365
      account: "\${{env:M365_ACCOUNT_NAME}}"
      password: "\${{secret:M365_ACCOUNT_PASSWORD}}"
  provision:
    type: provision
    with:
      oauth:
        clientId: "\${{env:EXISTING_GITHUB_OAUTH_CLIENT_ID}}"
        clientSecret: "\${{secret:EXISTING_GITHUB_OAUTH_CLIENT_SECRET}}"
  target:
    type: target
    with:
      profile: "Preview in Copilot (Chrome)"
      profileSelection: second
  open:
    type: open
    with:
      kind: agent
      destination: chat
  check-sign-in:
    type: checks
    with:
      - type: chat
        send: List repositories for the authenticated user
        allowAction: true
      - type: browser
        expect:
          role: button
          name: Sign in to GitHub v3 REST API
`;
  const result = compileInlineSource(sourceText, "vscuse-vcb-170.yml");
  assert.equal(
    result.ok,
    true,
    `${result.diagnostics?.[0]?.code}: ${result.diagnostics?.[0]?.message}`,
  );
  const steps = result.value[0].plan.steps;
  const commandTitle =
    "Microsoft 365 Agents: Add Configurations to Support Actions with Authentication in Declarative Agent";
  const successText =
    "Microsoft 365 Agents Toolkit has successfully updated your project configuration (m365agents.yaml and m365agents.local.yaml) files with added action to support authentication flow. You can proceed to remote provision.";
  const commandIndex = steps.findIndex(
    (step) =>
      step.tool === "type_text" && step.parameters.text === commandTitle,
  );
  const successIndex = steps.findIndex((step) =>
    step.description.includes(successText),
  );
  assert.notEqual(commandIndex, -1);
  assert.notEqual(successIndex, -1);
  const configurationSteps = steps.slice(commandIndex, successIndex + 1);
  assert.deepEqual(
    configurationSteps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text),
    [commandTitle, "oauth2", "OAuth", authorizationUrl, tokenUrl, scope, "No"],
  );
  assert.equal(
    configurationSteps.some((step) => step.tool === "click"),
    false,
  );
  const refreshAssertionIndex = configurationSteps.findIndex((step) =>
    step.description.includes(
      "the active prompt titled Enter the OAuth Refresh URL is visible and its text input is empty",
    ),
  );
  assert.notEqual(refreshAssertionIndex, -1);
  assert.equal(configurationSteps[refreshAssertionIndex + 1].tool, "key_press");
  assert.equal(
    configurationSteps[refreshAssertionIndex + 1].parameters.key,
    "enter",
  );
  for (const credential of [
    "${{env:EXISTING_GITHUB_OAUTH_CLIENT_ID}}",
    "${{secret:EXISTING_GITHUB_OAUTH_CLIENT_SECRET}}",
  ]) {
    assert.equal(
      steps.some(
        (step) =>
          step.tool === "type_text" && step.parameters.text === credential,
      ),
      true,
      credential,
    );
  }

  for (const [label, invalidSource, expectedCode] of [
    [
      "missing action",
      sourceText.replace("check, add-action, add-auth", "check, add-auth"),
      "VCB_ADD_API_AUTH_INPUT_INVALID",
    ],
    [
      "unconfigured provision",
      sourceText.replace("add-action, add-auth, check-auth", "add-action"),
      "VCB_PROVISION_INPUT_REDUNDANT",
    ],
    [
      "nonempty refresh URL",
      sourceText.replace('refreshUrl: ""', `refreshUrl: ${tokenUrl}`),
      "VCB_ADD_API_AUTH_INPUT_INVALID",
    ],
    [
      "PKCE enabled",
      sourceText.replace("pkce: false", "pkce: true"),
      "VCB_ADD_API_AUTH_INPUT_INVALID",
    ],
    [
      "unsupported scope",
      sourceText.replace(scope, "gist: Read gists"),
      "VCB_ADD_API_AUTH_INPUT_INVALID",
    ],
    [
      "literal client ID",
      sourceText.replace(
        "${{env:EXISTING_GITHUB_OAUTH_CLIENT_ID}}",
        "fakefakefakefakeid1",
      ),
      "VCB_ACCOUNT_EXPRESSION_REQUIRED",
    ],
    [
      "literal client secret",
      sourceText.replace(
        "${{secret:EXISTING_GITHUB_OAUTH_CLIENT_SECRET}}",
        "fakefakefakefakefakefakefakefakefakefake",
      ),
      "VCB_ACCOUNT_EXPRESSION_REQUIRED",
    ],
  ]) {
    const invalid = compileInlineSource(
      invalidSource,
      `vscuse-vcb-170-${label}.yml`,
    );
    assert.equal(invalid.ok, false, label);
    assert.equal(invalid.diagnostics[0].code, expectedCode, label);
  }

  const fixture = await compileFixture(
    "feature-da-no-action-add-action.yml",
    (sourceText) => sourceText,
  );
  assert.equal(fixture.ok, true, fixture.diagnostics?.[0]?.code);
  const migrated = fixture.value.find(
    ({ caseId }) => caseId === "feature-da-no-action-oauth-auth-remote-preview",
  );
  assert.notEqual(migrated, undefined);
  assert.equal(migrated.plan.plan_metadata.description.workitem, "31043030");
  const migratedSteps = migrated.plan.steps;
  assert.equal(
    migratedSteps.some(
      (step) =>
        step.tool === "type_text" &&
        step.parameters.text ===
          "https://raw.githubusercontent.com/neil-yechenwei/uitest/6c0c1cb66ce41fd4112a15ee9d996dde9ff233f7/Spec_add_auth_oauth_github.yaml",
    ),
    true,
  );
  const authSuccessIndex = migratedSteps.findIndex((step) =>
    step.description.includes(successText),
  );
  const loginIndex = migratedSteps.findIndex((step) =>
    step.description.includes(
      "ACCOUNTS section of the side bar lists an entry whose label begins with Sign in to Microsoft",
    ),
  );
  const provisionIndex = migratedSteps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "Microsoft 365 Agents: Provision",
  );
  const targetIndex = migratedSteps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "Debug: Select and Start Debugging",
  );
  const chatIndex = migratedSteps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "List repositories for the authenticated user",
  );
  const signInIndex = migratedSteps.findIndex((step) =>
    step.description.includes(
      "a visible browser element has role button and accessible name Sign in to GitHub v3 REST API",
    ),
  );
  for (const index of [
    authSuccessIndex,
    loginIndex,
    provisionIndex,
    targetIndex,
    chatIndex,
    signInIndex,
  ]) {
    assert.notEqual(index, -1);
  }
  assert.equal(authSuccessIndex < loginIndex, true);
  assert.equal(loginIndex < provisionIndex, true);
  assert.equal(provisionIndex < targetIndex, true);
  assert.equal(targetIndex < chatIndex, true);
  assert.equal(chatIndex < signInIndex, true);
  const fileAssertions = readFileAssertions(migrated.plan);
  for (const [path, expectedText] of [
    ["appPackage/ai-plugin.json", '"type": "OAuthPluginVault"'],
    [
      "appPackage/ai-plugin.json",
      '"reference_id": "${{OAUTH2_REGISTRATION_ID}}"',
    ],
    ["appPackage/apiSpecificationFile/openapi.yaml", "oauth2:"],
    ["appPackage/apiSpecificationFile/openapi.yaml", "type: oauth2"],
    ["appPackage/apiSpecificationFile/openapi.yaml", authorizationUrl],
    ["appPackage/apiSpecificationFile/openapi.yaml", tokenUrl],
    ["appPackage/apiSpecificationFile/openapi.yaml", scope],
    ["m365agents.yml", "uses: oauth/register"],
    ["m365agents.yml", "name: oauth2"],
    ["m365agents.yml", "flow: authorizationCode"],
    ["m365agents.yml", "configurationId: OAUTH2_REGISTRATION_ID"],
    ["m365agents.local.yml", "uses: oauth/register"],
    ["m365agents.local.yml", "configurationId: OAUTH2_REGISTRATION_ID"],
  ]) {
    assert.equal(
      fileAssertions.some(
        (assertion) =>
          assertion.path === path && assertion.contains?.includes(expectedText),
      ),
      true,
      `${path}: ${expectedText}`,
    );
  }
  for (const path of ["m365agents.yml", "m365agents.local.yml"]) {
    assert.equal(
      fileAssertions.some(
        (assertion) =>
          assertion.path === path &&
          assertion.notContains?.includes("isPKCEEnabled: true"),
      ),
      true,
      `${path}: PKCE disabled`,
    );
  }
});

test("VCB-173: advanced DA authentication cases use personal scope before provision", async () => {
  const fixture = await compileFixture(
    "feature-da-no-action-add-action.yml",
    (sourceText) => sourceText,
  );
  assert.equal(fixture.ok, true, fixture.diagnostics?.[0]?.code);

  for (const caseId of [
    "feature-da-no-action-api-key-auth-provision",
    "feature-da-no-action-bearer-auth-provision",
    "feature-da-no-action-entra-auth-remote-preview",
    "feature-da-no-action-oauth-auth-remote-preview",
  ]) {
    const migrated = fixture.value.find(
      ({ caseId: compiledCaseId }) => compiledCaseId === caseId,
    );
    assert.notEqual(migrated, undefined, caseId);
    const steps = migrated.plan.steps;
    const scopeSteps = steps.filter(
      (step) =>
        step.step_id.startsWith(
          "step_setProjectEnvironmentVariable_typeCommand_",
        ) && step.parameters.text.includes('VARIABLE_NAME="AGENT_SCOPE"'),
    );
    const scopeIndex = steps.indexOf(scopeSteps[0]);
    const loginIndex = steps.findIndex((step) =>
      step.description.includes(
        "ACCOUNTS section of the side bar lists an entry whose label begins with Sign in to Microsoft",
      ),
    );
    const provisionIndex = steps.findIndex(
      (step) =>
        step.tool === "type_text" &&
        step.parameters.text === "Microsoft 365 Agents: Provision",
    );

    assert.equal(scopeSteps.length, 1, caseId);
    assert.notEqual(loginIndex, -1, caseId);
    assert.notEqual(provisionIndex, -1, caseId);
    assert.equal(scopeIndex < loginIndex, true, caseId);
    assert.equal(loginIndex < provisionIndex, true, caseId);
  }
});

test("VCB-174: TypeSpec OAuth with a reference ID uses an immutable compiler-owned mutation", () => {
  const sourceText = `version: 1
cases:
  - id: typespec-oauth-with-reference-id
    scenarioId: VCB-174
    workItemIds: [32238176]
    gate: manual
    steps: [scaffold, check, configure-action, verify, package-app]
steps:
  scaffold:
    type: scaffold
    with:
      template: da/typespec
      answers:
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: src/agent/main.tsp
        expect: { exists: true }
  configure-action:
    type: configureTypeSpecAction
    with:
      action: github-oauth-with-reference-id
  verify:
    type: checks
    with:
      - type: file
        path: src/agent/main.tsp
        expect:
          contains: ["model oauth is OAuth2Auth<", "@authReferenceId", "OAUTH2_CONFIGURATION_ID"]
  package-app:
    type: packageApp
    with:
      environment: dev
`;
  const result = compileInlineSource(sourceText, "vscuse-vcb-174.yml");
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const plan = result.value[0].plan;
  const mutationCommand = plan.steps.find(
    (step) =>
      step.step_id.startsWith("step_configureTypeSpecGitHubOAuthAction_") &&
      step.tool === "type_text",
  );
  assert.notEqual(mutationCommand, undefined);
  const encodedScript = mutationCommand.parameters.text.match(
    /base64\.b64decode\("([^"]+)"\)/,
  )?.[1];
  assert.equal(typeof encodedScript, "string");
  const mutationScript = Buffer.from(encodedScript, "base64").toString("utf8");
  assert.equal(
    mutationScript.includes(
      "e20150c80f47dfc9b068a282a9a8e429daa0b557/github-agent.tsp",
    ),
    true,
  );
  assert.equal(mutationScript.includes("refs/heads/main"), false);
  assert.equal(mutationScript.includes("@authReferenceId"), true);
  assert.equal(mutationScript.includes("OAUTH2_CONFIGURATION_ID"), true);
  assert.equal(
    plan.steps.some(
      (step) =>
        step.tool === "type_text" &&
        step.parameters.text === "Microsoft 365 Agents: Zip App Package",
    ),
    true,
  );

  for (const invalidAction of [
    "github-oauth-with-reference-id\n      path: other.tsp",
    "github-oauth-unknown",
  ]) {
    const invalid = compileInlineSource(
      sourceText.replace("github-oauth-with-reference-id", invalidAction),
      "vscuse-vcb-174-invalid.yml",
    );
    assert.equal(invalid.ok, false);
    assert.equal(
      invalid.diagnostics[0].code,
      "VCB_TYPESPEC_ACTION_INPUT_INVALID",
    );
  }
});

test("VCB-175: TypeSpec OAuth without a reference ID enables provision credentials", () => {
  const sourceText = `version: 1
cases:
  - id: typespec-oauth-without-reference-id
    scenarioId: VCB-175
    workItemIds: [32238147]
    gate: manual
    steps: [scaffold, check, configure-action, verify, login, provision]
steps:
  scaffold:
    type: scaffold
    with:
      template: da/typespec
      answers:
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: src/agent/main.tsp
        expect: { exists: true }
  configure-action:
    type: configureTypeSpecAction
    with:
      action: github-oauth-without-reference-id
  verify:
    type: checks
    with:
      - type: file
        path: src/agent/main.tsp
        expect:
          contains: ["model oauth is OAuth2Auth<"]
          notContains: ["@authReferenceId"]
  login:
    type: login
    with:
      type: m365
      account: "\${{env:M365_ACCOUNT_NAME}}"
      password: "\${{secret:M365_ACCOUNT_PASSWORD}}"
  provision:
    type: provision
    with:
      environment: none
      oauth:
        clientId: "\${{env:EXISTING_GITHUB_OAUTH_CLIENT_ID}}"
        clientSecret: "\${{secret:EXISTING_GITHUB_OAUTH_CLIENT_SECRET}}"
`;
  const result = compileInlineSource(sourceText, "vscuse-vcb-175.yml");
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const plan = result.value[0].plan;
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(
    typedValues.includes("${{env:EXISTING_GITHUB_OAUTH_CLIENT_ID}}"),
    true,
  );
  assert.equal(
    typedValues.includes("${{secret:EXISTING_GITHUB_OAUTH_CLIENT_SECRET}}"),
    true,
  );
  assert.equal(
    plan.steps.some((step) =>
      step.description.includes("client ID/Secret for OAuth Registration"),
    ),
    true,
  );

  const redundantCredentials = compileInlineSource(
    sourceText.replace(
      "github-oauth-without-reference-id",
      "github-oauth-with-reference-id",
    ),
    "vscuse-vcb-175-redundant.yml",
  );
  assert.equal(redundantCredentials.ok, false);
  assert.equal(
    redundantCredentials.diagnostics[0].code,
    "VCB_PROVISION_INPUT_REDUNDANT",
  );
});

test("VCB-176: addDaCapability adds immutable Embedded Knowledge", () => {
  const sourceText = `version: 1
cases:
  - id: da-add-embedded-knowledge
    scenarioId: VCB-176
    workItemIds: [34657755]
    gate: manual
    steps: [scaffold, check, add-knowledge, verify]
steps:
  scaffold:
    type: scaffold
    with:
      template: da/no-action
      answers:
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: appPackage/declarativeAgent.json
        expect: { exists: true }
  add-knowledge:
    type: addDaCapability
    with:
      capability: embeddedKnowledge
  verify:
    type: checks
    with:
      - type: file
        path: appPackage/EmbeddedKnowledge/Document.docx
        expect: { exists: true }
      - type: file
        path: appPackage/declarativeAgent.json
        expect:
          contains: ['"name": "EmbeddedKnowledge"', '"file": "EmbeddedKnowledge/Document.docx"']
`;
  const result = compileInlineSource(sourceText, "vscuse-vcb-176.yml");
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const plan = result.value[0].plan;
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  for (const value of [
    "Microsoft 365 Agents: Add Capability",
    "Embedded Knowledge",
    "manifest.json",
  ]) {
    assert.equal(typedValues.includes(value), true, value);
  }
  const prepareCommand = plan.steps.find(
    (step) =>
      step.step_id.startsWith("step_prepareEmbeddedKnowledgeDocument_") &&
      step.tool === "type_text",
  );
  assert.notEqual(prepareCommand, undefined);
  const encodedScript = prepareCommand.parameters.text.match(
    /base64\.b64decode\("([^"]+)"\)/,
  )?.[1];
  assert.equal(typeof encodedScript, "string");
  const prepareScript = Buffer.from(encodedScript, "base64").toString("utf8");
  assert.equal(
    prepareScript.includes(
      "282e74768fdd4ce6a62b2d5eeb0894e839ebd0ed/DA-EK/Document.docx",
    ),
    true,
  );
  assert.equal(prepareScript.includes("refs/heads/main"), false);
  for (const invalidInput of [
    "capability: embeddedKnowledge\n      fixture: other.docx",
    "capability: embeddedKnowledge\n      url: https://example.com/file.docx",
    "capability: unknown",
  ]) {
    const invalid = compileInlineSource(
      sourceText.replace("capability: embeddedKnowledge", invalidInput),
      "vscuse-vcb-176-invalid.yml",
    );
    assert.equal(invalid.ok, false);
    assert.equal(
      invalid.diagnostics[0].code,
      "VCB_ADD_DA_CAPABILITY_INPUT_INVALID",
    );
  }
});

test("VCB-177: runnable TypeSpec OAuth and Embedded Knowledge cases reuse Copilot chat", async () => {
  const oauthResult = await compileFixture(
    "da-typespec-oauth.yml",
    (sourceText) => sourceText,
  );
  assert.equal(oauthResult.ok, true, oauthResult.diagnostics?.[0]?.code);
  assert.equal(oauthResult.value.length, 2);

  const referenceDescriptor = oauthResult.value.find(
    (descriptor) => descriptor.caseId === "da-typespec-oauth-with-reference-id",
  );
  const withoutReferenceDescriptor = oauthResult.value.find(
    (descriptor) =>
      descriptor.caseId === "da-typespec-oauth-without-reference-id",
  );
  assert.notEqual(referenceDescriptor, undefined);
  assert.notEqual(withoutReferenceDescriptor, undefined);

  const referenceTypedValues = referenceDescriptor.plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  for (const deferredValue of [
    "Microsoft 365 Agents: Provision",
    "Debug: Select and Start Debugging",
    "List repositories for the authenticated user",
  ]) {
    assert.equal(
      referenceTypedValues.includes(deferredValue),
      false,
      deferredValue,
    );
  }

  const withoutReferenceTypedValues = withoutReferenceDescriptor.plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  for (const chatValue of [
    "Microsoft 365 Agents: Provision",
    "Debug: Select and Start Debugging",
    "List repositories for the authenticated user",
  ]) {
    assert.equal(
      withoutReferenceTypedValues.includes(chatValue),
      true,
      chatValue,
    );
  }
  assert.equal(
    withoutReferenceDescriptor.plan.steps.some((step) =>
      step.description.includes("Sign in to GitHub"),
    ),
    true,
  );

  const embeddedKnowledgeResult = await compileFixture(
    "feature-da-add-capability-embedded-knowledge.yml",
    (sourceText) => sourceText,
  );
  assert.equal(
    embeddedKnowledgeResult.ok,
    true,
    embeddedKnowledgeResult.diagnostics?.[0]?.code,
  );
  const embeddedKnowledgePlan = embeddedKnowledgeResult.value[0].plan;
  const embeddedKnowledgeTypedValues = embeddedKnowledgePlan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(
    embeddedKnowledgeTypedValues.includes(
      "What are the column headers in the student table?",
    ),
    true,
  );
  assert.equal(
    embeddedKnowledgePlan.steps.some((step) =>
      step.description.includes(
        'assistant response contains "Graduation Year"',
      ),
    ),
    true,
  );
});

test("VCB-178: package-only OAuth substitution and Embedded Knowledge chat avoid live failures", async () => {
  const oauthResult = await compileFixture(
    "da-typespec-oauth.yml",
    (sourceText) => sourceText,
  );
  assert.equal(oauthResult.ok, true, oauthResult.diagnostics?.[0]?.code);
  const referencePlan = oauthResult.value.find(
    (descriptor) => descriptor.caseId === "da-typespec-oauth-with-reference-id",
  )?.plan;
  assert.notEqual(referencePlan, undefined);
  const referenceTypedValues = referencePlan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  const placeholderIndex = referenceTypedValues.indexOf(
    "00000000-0000-0000-0000-000000000000",
  );
  const packageIndex = referenceTypedValues.indexOf(
    "Microsoft 365 Agents: Zip App Package",
  );
  assert.notEqual(placeholderIndex, -1);
  assert.notEqual(packageIndex, -1);
  assert.equal(placeholderIndex < packageIndex, true);
  assert.equal(
    referencePlan.steps.some(
      (step) =>
        step.step_id.startsWith(
          "step_setUserEnvironmentVariable_typeCommand_",
        ) &&
        step.description.includes("OAUTH2_CONFIGURATION_ID") &&
        step.description.includes("dev user environment"),
    ),
    true,
  );

  const embeddedKnowledgeResult = await compileFixture(
    "feature-da-add-capability-embedded-knowledge.yml",
    (sourceText) => sourceText,
  );
  assert.equal(
    embeddedKnowledgeResult.ok,
    true,
    embeddedKnowledgeResult.diagnostics?.[0]?.code,
  );
  const embeddedKnowledgePlan = embeddedKnowledgeResult.value[0].plan;
  const embeddedKnowledgeTypedValues = embeddedKnowledgePlan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(
    embeddedKnowledgeTypedValues.includes(
      "What are the column headers in the student table?",
    ),
    true,
  );
  assert.equal(
    embeddedKnowledgeTypedValues.includes("what's GPA of Sarah Miller"),
    false,
  );
  assert.equal(
    embeddedKnowledgePlan.steps.some((step) =>
      step.description.includes(
        'assistant response contains "Graduation Year"',
      ),
    ),
    true,
  );
});

test("VCB-179: TypeSpec OAuth mutations replace the fixture agent name with the generated project name", async () => {
  const result = await compileFixture(
    "da-typespec-oauth.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  assert.equal(result.value.length, 2);

  for (const descriptor of result.value) {
    const mutationCommand = descriptor.plan.steps.find(
      (step) =>
        step.step_id.startsWith("step_configureTypeSpecGitHubOAuthAction_") &&
        step.tool === "type_text",
    );
    assert.notEqual(mutationCommand, undefined, descriptor.caseId);
    const encodedScript = mutationCommand.parameters.text.match(
      /base64\.b64decode\("([^"]+)"\)/,
    )?.[1];
    assert.equal(typeof encodedScript, "string", descriptor.caseId);
    const mutationScript = Buffer.from(encodedScript, "base64").toString(
      "utf8",
    );
    assert.equal(
      mutationScript.includes("generated_agent_name = project_dir.name"),
      true,
      descriptor.caseId,
    );
    assert.equal(
      mutationScript.includes("if source.count(fixture_agent_name) != 1:"),
      true,
      descriptor.caseId,
    );
    assert.equal(
      mutationScript.includes(
        "source = source.replace(fixture_agent_name, generated_agent_name)",
      ),
      true,
      descriptor.caseId,
    );
    assert.equal(
      mutationScript.includes(
        "if fixture_agent_name in written or written.count(generated_agent_name) != 1:",
      ),
      true,
      descriptor.caseId,
    );
  }
});

test("VCB-180: Provision without account is a capability case instead of a remote Tab template case", async () => {
  const sourceText = `version: 1
cases:
  - id: provision-without-account
    scenarioId: VCB-180
    workItemIds: [15263834]
    steps: [scaffold, check, reject-provision]
steps:
  scaffold:
    type: scaffold
    with:
      template: non-sso-tab
      answers:
        - question: projectType
          value: teams-agent-and-app-type
        - question: teamsAppType
          value: teams-other-app-type
        - question: teamsOtherAppType
          value: non-sso-tab
        - question: workspaceFolder
          value: default
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: m365agents.yml
        expect: { contains: ["provision:"] }
  reject-provision:
    type: provisionWithoutAccount
`;
  const result = compileInlineSource(sourceText, "vscuse-vcb-180.yml");
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const plan = result.value[0].plan;
  assert.equal(
    plan.steps.some(
      (step) =>
        step.tool === "type_text" &&
        step.parameters.text === "Microsoft 365 Agents: Provision",
    ),
    true,
  );
  assert.equal(
    plan.steps.some((step) =>
      step.description.includes(
        "Microsoft 365 Agents Toolkit needs a Microsoft 365 account",
      ),
    ),
    true,
  );
  assert.equal(
    plan.steps.some((step) =>
      /account name|password|select.*environment|stage executed successfully/i.test(
        step.description,
      ),
    ),
    false,
  );

  const fixture = await compileFixture(
    "feature-provision-without-account.yml",
    (fixtureSource) => fixtureSource,
  );
  assert.equal(fixture.ok, true, fixture.diagnostics?.[0]?.code);
  assert.equal(fixture.value.length, 1);
  assert.equal(
    fixture.value[0].plan.plan_metadata.description.workitem,
    "15263834",
  );
  const remoteTab = await compileFixture(
    "non-sso-tab.yml",
    (fixtureSource) => fixtureSource,
  );
  assert.equal(remoteTab.ok, true, remoteTab.diagnostics?.[0]?.code);
  assert.equal(
    remoteTab.value.find(({ caseId }) => caseId === "tab-ts-remote-teams").plan
      .plan_metadata.description.workitem,
    "14134646",
  );

  for (const [invalidSource, expectedCode] of [
    [
      sourceText.replace(
        "    type: provisionWithoutAccount\n",
        "    type: provisionWithoutAccount\n    with:\n      unexpected: true\n",
      ),
      "VCB_PROVISION_WITHOUT_ACCOUNT_INPUT_INVALID",
    ],
    [
      sourceText
        .replace(
          "    steps: [scaffold, check, reject-provision]",
          "    steps: [scaffold, check, login, reject-provision]",
        )
        .replace(
          "  reject-provision:\n",
          '  login:\n    type: login\n    with:\n      type: m365\n      account: "${{env:M365_ACCOUNT_NAME}}"\n      password: "${{secret:M365_ACCOUNT_PASSWORD}}"\n  reject-provision:\n',
        ),
      "VCB_PROVISION_WITHOUT_ACCOUNT_INPUT_INVALID",
    ],
    [
      sourceText.replace(
        "    steps: [scaffold, check, reject-provision]",
        "    steps: [scaffold, reject-provision]",
      ),
      "VCB_OPERATION_ORDER",
    ],
  ]) {
    const invalid = compileInlineSource(
      invalidSource,
      "vscuse-vcb-180-invalid.yml",
    );
    assert.equal(invalid.ok, false);
    assert.equal(invalid.diagnostics[0].code, expectedCode);
  }
});

test("VCB-153: publishDeveloperPortal preserves every remaining recorded pointer precondition", () => {
  const sourceText = createPackageSource({ includePublish: true });
  const result = compileInlineSource(sourceText, "vscuse-vcb-153.yml");
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const plan = result.value[0].plan;
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(
    typedValues.includes(
      "Microsoft 365 Agents: Publish to Store in Developer Portal",
    ),
    true,
  );
  assert.equal(typedValues.includes("${{secret:M365_ACCOUNT_PASSWORD}}"), true);
  assert.equal(
    plan.steps.some((step) => step.description.includes("Status Submitted")),
    true,
  );
  for (const [x, y, preconditions] of [
    [
      457,
      72,
      [
        "dhash:457:72:16:5:0000000000000000",
        "dhash:457:72:96:5:2954160010000000",
        "dhash:457:72:0:10:d063676332696128",
      ],
    ],
    [
      393,
      80,
      [
        "dhash:393:80:16:5:9c5a543434b1cd48",
        "dhash:393:80:96:5:2494104a6a900000",
        "dhash:393:80:0:10:d063676332696128",
      ],
    ],
    [
      731,
      105,
      [
        "dhash:731:105:16:5:0008004a1966ab8a",
        "dhash:731:105:96:5:000000909c1d8104",
        "dhash:731:105:0:10:9c68636232696128",
      ],
    ],
    [
      640,
      567,
      [
        "dhash:640:567:16:5:8ea2a2a667509040",
        "dhash:640:567:96:5:000016e868140000",
        "dhash:640:567:0:10:1b18e0d8d9f6e6e4",
      ],
    ],
    [
      640,
      555,
      [
        "dhash:640:555:16:5:6799510995d82c93",
        "dhash:640:555:96:5:0000086060080000",
        "dhash:640:555:0:10:1818e0d8d9e6e6e4",
      ],
    ],
    [
      767,
      672,
      [
        "dhash:767:672:16:5:4929699449000000",
        "dhash:767:672:96:5:a048a4e448800000",
        "dhash:767:672:0:10:1b1c9087acab93b3",
      ],
    ],
    [
      1007,
      20,
      [
        "dhash:1007:20:16:5:13ec4c39394cec13",
        "dhash:1007:20:96:5:926363639200c6c4",
        "dhash:1007:20:0:10:1b1c9087aeac98b0",
      ],
    ],
    [
      672,
      191,
      [
        "dhash:672:191:16:5:8de6723b4b79229d",
        "dhash:672:191:96:5:4012276969170041",
        "dhash:672:191:0:10:79616087292d1131",
      ],
    ],
  ]) {
    assertRecordedClick(plan, x, y, preconditions);
  }

  for (const [label, invalidSource] of [
    [
      "authored input",
      sourceText.replace(
        "    type: publishDeveloperPortal",
        "    type: publishDeveloperPortal\n    with: { package: local }",
      ),
    ],
    [
      "missing package",
      createPackageSource({ includePackage: false, includePublish: true }),
    ],
  ]) {
    const invalid = compileInlineSource(
      invalidSource,
      `vscuse-vcb-153-${label}.yml`,
    );
    assert.equal(invalid.ok, false, label);
    assert.equal(
      invalid.diagnostics[0].code,
      "VCB_PUBLISH_DEVELOPER_PORTAL_INPUT_INVALID",
      label,
    );
  }
});

test("VCB-160: publishDeveloperPortal submits the local package through the native chooser location", () => {
  const sourceText = createPackageSource({ includePublish: true });
  const result = compileInlineSource(sourceText, "vscuse-vcb-160.yml");
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const plan = result.value[0].plan;
  const chooser = plan.steps.filter((step) =>
    step.step_id.startsWith("step_developerPortalPackageChooser_"),
  );

  assert.deepEqual(
    chooser.map((step) => [step.agent, step.tool]),
    [
      ["assertion", ""],
      ["interaction", "keyboard_shortcut"],
      ["interaction", "type_text"],
      ["assertion", ""],
      ["interaction", "keyboard_shortcut"],
    ],
  );
  assert.equal(chooser[1].parameters.keys, "ctrl+l");
  assert.equal(
    chooser[2].parameters.text,
    "/home/vscode/AgentsToolkitProjects/${{var:app_name}}/appPackage/build/appPackage.local.zip",
  );
  assert.equal(
    chooser[3].description,
    "@assertion the native package file chooser Location field visibly contains exactly /home/vscode/AgentsToolkitProjects/${{var:app_name}}/appPackage/build/appPackage.local.zip and is ready to submit that path.",
  );
  assert.equal(chooser[4].parameters.keys, "alt+o");
  assert.equal(
    chooser.some((step) => step.tool === "click"),
    false,
  );
  assert.deepEqual(
    chooser.map((step) => step.preconditions),
    chooser.map(() => []),
  );
  for (let index = 1; index < chooser.length; index += 1) {
    assert.deepEqual(chooser[index].depends_on, [chooser[index - 1].step_id]);
  }

  const chooserEndIndex = plan.steps.indexOf(chooser[chooser.length - 1]);
  const confirmation = plan.steps[chooserEndIndex + 1];
  assert.match(confirmation.step_id, /^step_clickOption_assertPrompt_/);
  assert.equal(
    confirmation.description.includes("Select Your App Package") &&
      confirmation.description.includes("appPackage.local.zip"),
    true,
  );
});

test("VCB-162: legacy workflow Share error uses a verified mutation and coordinate-free prompts", () => {
  const sourceText = `version: 1
cases:
  - id: da-legacy-share-error
    scenarioId: VCB-162
    workItemIds: [36266720]
    gate: manual
    steps: [scaffold, check, login, workflow-version, share]
steps:
  scaffold:
    type: scaffold
    with:
      template: da/no-action
      answers:
        - question: projectType
          value: copilot-agent-type
        - question: daTemplate
          value: no-action
        - question: workspaceFolder
          value: default
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: m365agents.yml
        expect: { contains: ["version: v1.12", "copilotAgent/publish"] }
  login:
    type: login
    with:
      type: m365
      account: "\${{env:M365_ACCOUNT_NAME}}"
      password: "\${{secret:M365_ACCOUNT_PASSWORD}}"
  workflow-version:
    type: workflowVersion
    with:
      version: v1.9
  share:
    type: share
    with:
      scope: users
      email: "\${{env:M365_ACCOUNT_NAME}}"
      expectError: unsupportedWorkflowVersion
`;
  const result = compileInlineSource(sourceText, "vscuse-vcb-162.yml");
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const plan = result.value[0].plan;
  assert.equal(plan.plan_metadata.tags.includes("gate:manual"), true);

  const descriptions = plan.steps.map((step) => step.description);
  const workflowMutation = plan.steps.find((step) =>
    step.step_id.startsWith("step_setWorkflowVersion_"),
  );
  assert.notEqual(workflowMutation, undefined);
  assert.equal(
    workflowMutation.parameters.sample.includes(
      'target_action = "  - uses: teamsApp/shareToOthers"',
    ),
    true,
  );
  assert.match(
    workflowMutation.parameters.sample,
    /if text\.count\(source_action\) != 2:/,
  );
  assert.match(
    workflowMutation.parameters.sample,
    /target_schema = source_schema\.replace\("v1\.12", os\.environ\["WORKFLOW_VERSION"\]\)/,
  );
  assert.match(
    workflowMutation.parameters.sample,
    /workflow schema directive was not written exactly once/,
  );
  assert.match(
    workflowMutation.parameters.sample,
    /scope: \$\{\{AGENT_SCOPE\}\}/,
  );
  assert.match(workflowMutation.parameters.sample, /scope: tenant/);
  assert.match(
    workflowMutation.parameters.sample,
    /if any\(line\.strip\(\)\.startswith\("scope:"\)/,
  );
  assert.match(workflowMutation.parameters.sample, /shareLink: SHARE_LINK/);
  assert.match(
    workflowMutation.description,
    /replace the top-level version in m365agents\.yml with v1\.9/,
  );
  assert.match(workflowMutation.description, /schema-valid legacy share shape/);
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  const scaffoldFlow = [
    "Declarative Agent",
    "No Action",
    "${{var:app_name:vscuse_app_#####}}",
  ];
  let previousScaffoldIndex = -1;
  const scaffoldIndexes = scaffoldFlow.map((value) => {
    previousScaffoldIndex = typedValues.indexOf(
      value,
      previousScaffoldIndex + 1,
    );
    return previousScaffoldIndex;
  });
  assert.equal(
    scaffoldIndexes.every((index) => index >= 0),
    true,
  );
  const scaffoldPromptTitles = [
    "New Project",
    "Create Declarative Agent",
    "Workspace Folder",
    "Application Name",
  ];
  let previousPromptIndex = -1;
  const scaffoldPromptIndexes = scaffoldPromptTitles.map((title) => {
    previousPromptIndex = descriptions.findIndex(
      (description, index) =>
        index > previousPromptIndex &&
        description.includes(`active prompt titled ${title}`),
    );
    return previousPromptIndex;
  });
  assert.equal(
    scaffoldPromptIndexes.every((index) => index >= 0),
    true,
  );
  const shareFlow = [
    "Microsoft 365 Agents: Share",
    "Share access",
    "Share to specified users(s) or user group",
    "${{env:M365_ACCOUNT_NAME}}",
  ];
  let previousShareIndex = -1;
  const shareIndexes = shareFlow.map((value) => {
    previousShareIndex = typedValues.indexOf(value, previousShareIndex + 1);
    return previousShareIndex;
  });
  assert.equal(
    shareIndexes.every((index) => index >= 0),
    true,
  );
  assert.deepEqual(
    shareIndexes,
    [...shareIndexes].sort((left, right) => left - right),
  );
  assert.equal(typedValues.includes("Microsoft 365 Agents: Provision"), false);

  const shareCommandIndex = plan.steps.findIndex(
    (step) =>
      step.tool === "type_text" && step.parameters.text === shareFlow[0],
  );
  const shareCommandSelection = plan.steps.slice(
    shareCommandIndex + 1,
    shareCommandIndex + 5,
  );
  assert.deepEqual(
    shareCommandSelection.map((step) => step.tool),
    ["", "key_press", "", "key_press"],
  );
  assert.match(
    shareCommandSelection[0].description,
    /Remove access to the shared app.*first.*Microsoft 365 Agents: Share.*second/,
  );
  assert.equal(shareCommandSelection[1].parameters.key, "down");
  assert.match(
    shareCommandSelection[2].description,
    /Microsoft 365 Agents: Share.*highlighted/,
  );
  assert.equal(shareCommandSelection[3].parameters.key, "enter");
  assert.match(
    plan.steps[shareCommandIndex + 5].description,
    /prompt titled Share the agent/,
  );
  const emailInputIndex = plan.steps.findIndex(
    (step, index) =>
      index > shareCommandIndex &&
      step.tool === "type_text" &&
      step.parameters.text === "${{env:M365_ACCOUNT_NAME}}",
  );
  const environmentSelection = plan.steps.slice(
    emailInputIndex + 2,
    emailInputIndex + 7,
  );
  assert.deepEqual(
    environmentSelection.map((step) => step.tool),
    ["", "", "type_text", "", "key_press"],
  );
  assert.match(environmentSelection[0].description, /Select an environment/);
  assert.equal(environmentSelection[2].parameters.text, "dev");
  assert.match(environmentSelection[3].description, /option dev/);
  assert.equal(environmentSelection[4].parameters.key, "enter");
  const clearNotificationsIndex = plan.steps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "Notifications: Clear All Notifications",
  );
  const showNotificationsIndex = plan.steps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "Notifications: Show Notifications",
  );
  assert.equal(clearNotificationsIndex >= 0, true);
  assert.equal(showNotificationsIndex > clearNotificationsIndex, true);
  assert.equal(shareCommandIndex > showNotificationsIndex, true);
  const errorText =
    "Share feature only supports m365agents.yml version v1.10 or above, follow [the guide](https://github.com/OfficeDev/microsoft-365-agents-toolkit/wiki/Share-Declarative-Agents-with-Others#About-YAML-schema) to upgrade and proceed.";
  const errorIndex = plan.steps.findIndex((step) =>
    step.description.includes(errorText),
  );
  assert.equal(errorIndex, emailInputIndex + 7);
  assert.deepEqual(plan.steps[errorIndex].depends_on, [
    environmentSelection[4].step_id,
  ]);
  assert.match(
    plan.steps[errorIndex].step_id,
    /^step_assertNotificationContains_assert_/,
  );
  assert.equal(
    plan.steps[errorIndex].description,
    `@assertion a visible Visual Studio Code notification contains the literal text ${errorText}. A notification with different text, including an in-progress notification, does not satisfy this assertion.`,
  );
  assert.deepEqual(plan.steps[errorIndex].tags, [
    "component:notifications",
    "action:assert-contains",
    "step_retry_timeout: 60",
  ]);
  assert.equal(
    plan.steps
      .slice(shareCommandIndex, errorIndex + 1)
      .some((step) => step.tool === "click"),
    false,
  );

  for (const [label, invalidSource] of [
    [
      "unsupported version",
      sourceText.replace("version: v1.9", "version: v1.10"),
    ],
    [
      "extra version field",
      sourceText.replace(
        "      version: v1.9",
        "      version: v1.9\n      path: custom.yml",
      ),
    ],
    [
      "unsupported template",
      sourceText.replace("template: da/no-action", "template: default-bot"),
    ],
  ]) {
    const invalid = compileInlineSource(
      invalidSource,
      `vscuse-vcb-162-workflow-${label}.yml`,
    );
    assert.equal(invalid.ok, false, label);
    assert.equal(
      invalid.diagnostics[0].code,
      "VCB_WORKFLOW_VERSION_INPUT_INVALID",
      label,
    );
  }

  for (const [label, invalidSource, diagnostic] of [
    [
      "missing login",
      sourceText.replace(
        "check, login, workflow-version",
        "check, workflow-version",
      ),
      "VCB_SHARE_PREREQUISITE",
    ],
    [
      "unsupported scope",
      sourceText.replace("scope: users", "scope: tenant"),
      "VCB_SHARE_INPUT_INVALID",
    ],
    [
      "missing scope",
      sourceText.replace("      scope: users\n", ""),
      "VCB_SHARE_INPUT_INVALID",
    ],
    [
      "extra field",
      sourceText.replace(
        "      scope: users",
        "      scope: users\n      environment: local",
      ),
      "VCB_SHARE_INPUT_INVALID",
    ],
    [
      "literal email",
      sourceText.replace(
        'email: "${{env:M365_ACCOUNT_NAME}}"',
        "email: user@example.com",
      ),
      "VCB_SHARE_INPUT_INVALID",
    ],
    [
      "unsupported expectation",
      sourceText.replace(
        "expectError: unsupportedWorkflowVersion",
        "expectError: serviceFailure",
      ),
      "VCB_SHARE_INPUT_INVALID",
    ],
  ]) {
    const invalid = compileInlineSource(
      invalidSource,
      `vscuse-vcb-162-share-${label}.yml`,
    );
    assert.equal(invalid.ok, false, label);
    assert.equal(invalid.diagnostics[0].code, diagnostic, label);
  }
});

test("VCB-164: repeated OpenAPI actions provision a personal-scope declarative agent", async () => {
  const result = await compileFixture(
    "feature-da-no-action-add-action.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  const generated = result.value.find(
    ({ caseId }) =>
      caseId === "feature-da-two-openapi-actions-personal-provision",
  );
  assert.notEqual(generated, undefined);
  assert.equal(generated.plan.plan_metadata.description.workitem, "29293016");

  const plan = generated.plan;
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(
    typedValues.filter((value) => value === "Microsoft 365 Agents: Add Action")
      .length,
    2,
  );
  assert.equal(
    typedValues.filter(
      (value) =>
        value ===
        "https://raw.githubusercontent.com/huimiu/api-spec-example/229f757740f3d0ca22de8e79478062bd56bc4cbe/repair-service.yml",
    ).length,
    2,
  );

  const environmentIndex = plan.steps.findIndex((step) =>
    step.step_id.startsWith("step_setProjectEnvironmentVariable_"),
  );
  const loginIndex = plan.steps.findIndex((step) =>
    step.description.startsWith(
      "@assertion the ACCOUNTS section of the side bar lists an entry",
    ),
  );
  const provisionIndex = plan.steps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "Microsoft 365 Agents: Provision",
  );
  assert.equal(
    environmentIndex >= 0 &&
      loginIndex > environmentIndex &&
      provisionIndex > loginIndex,
    true,
  );
  assert.equal(typedValues.includes("personal"), true);

  const assertionByPath = new Map(
    readFileAssertions(plan).map((assertion) => [assertion.path, assertion]),
  );
  for (const path of [
    "appPackage/ai-plugin.json",
    "appPackage/ai-plugin_1.json",
    "appPackage/apiSpecificationFile/openapi.yaml",
    "appPackage/apiSpecificationFile/openapi_1.yaml",
  ]) {
    assert.equal(assertionByPath.get(path)?.exists, true, path);
  }
  assert.deepEqual(
    assertionByPath.get("appPackage/declarativeAgent.json").contains,
    ['"actions"', '"id": "action_1"', '"id": "action_2"'],
  );
});

test("VCB-154: twenty-one legacy plans are replaced, four are retired, and one remains", async () => {
  const migrations = [
    {
      source: "feature-basic-tab-local-debug.yml",
      caseId: "tab-ts-local-name-validation",
      generated: "non-sso-tab--tab-ts-local-name-validation.json",
      legacy: "Basic_Tab_Local_Debug.json",
    },
    {
      source: "non-sso-tab.yml",
      caseId: "tab-ts-local-teams-env-recreated",
      generated: "non-sso-tab--tab-ts-local-teams-env-recreated.json",
      legacy: "Tab_Local_Debug_Env_Local_Creation.json",
    },
    {
      source: "feature-da-add-capability-copilot-connector.yml",
      caseId: "da-add-copilot-connector",
      generated: "da-no-action--da-add-copilot-connector.json",
      legacy: "DA_AddCapability_CopilotConnector.json",
    },
    {
      source: "feature-da-no-action-add-action.yml",
      caseId: "da-no-action-add-openapi-action",
      generated: "da-no-action--da-no-action-add-openapi-action.json",
      legacy: "DA_No_Action_Add_Action.json",
    },
    {
      source: "feature-da-no-action-add-action.yml",
      caseId: "feature-da-two-openapi-actions-personal-provision",
      generated: "feature-da-two-openapi-actions-personal-provision.json",
      legacy: "Feature_DA_Add_Action_From_OpenAPI_Spec.json",
    },
    {
      source: "da-typespec-with-action.yml",
      caseId: "feature-da-typespec-package-action-remote-preview",
      generated: "feature-da-typespec-package-action-remote-preview.json",
      legacy: "Feature_DA_Package_TypeSpec_Template_With_Action.json",
    },
    {
      source: "feature-da-no-action-add-action.yml",
      caseId: "feature-da-no-action-api-key-auth-provision",
      generated: "feature-da-no-action-api-key-auth-provision.json",
      legacy: "Feature_DA_No_Action_Add_ApiKey_Auth_Configurations.json",
    },
    {
      source: "feature-da-no-action-add-action.yml",
      caseId: "feature-da-no-action-bearer-auth-provision",
      generated: "feature-da-no-action-bearer-auth-provision.json",
      legacy: "Feature_DA_No_Action_Add_Bearer_Auth_Configurations.json",
    },
    {
      source: "feature-da-no-action-add-action.yml",
      caseId: "feature-da-no-action-entra-auth-remote-preview",
      generated: "feature-da-no-action-entra-auth-remote-preview.json",
      legacy:
        "Feature_DA_No_Action_Add_Microsoft_Entra_Auth_Configurations.json",
    },
    {
      source: "feature-da-no-action-add-action.yml",
      caseId: "feature-da-no-action-oauth-auth-remote-preview",
      generated: "feature-da-no-action-oauth-auth-remote-preview.json",
      legacy: "Feature_DA_No_Action_Add_OAuth_Auth_Configurations.json",
    },
    {
      source: "feature-da-no-action-add-action.yml",
      caseId: "feature-da-no-action-pkce-oauth-auth-remote-preview",
      generated: "feature-da-no-action-pkce-oauth-auth-remote-preview.json",
      legacy: "Feature_DA_No_Action_Add_PKCE_OAuth_Auth_Configurations.json",
    },
    {
      source: "feature-arm-json-multiple-templates.yml",
      caseId: "feature-arm-json-multiple-templates",
      generated: "feature-arm-json-multiple-templates.json",
      legacy:
        "Feature_Arm_Deoploy_Support_Json_Format_And_Multiple_Templates.json",
    },
    {
      source: "custom-copilot-rag-custom-api.yml",
      caseId: "feature-local-debug-custom-api-without-openai-key",
      generated: "feature-local-debug-custom-api-without-openai-key.json",
      legacy: "Feature_LocalDebug_Custom_API_without_OpenAI_Keys.json",
    },
    {
      source: "feature-da-regenerate-action.yml",
      caseId: "da-regenerate-list-repairs",
      generated:
        "da-api-plugin-from-existing-api--da-regenerate-list-repairs.json",
      legacy: "DA_Regenrate_Action.json",
    },
    {
      source: "feature-open-developer-portal-publish.yml",
      caseId: "simple-bot-ts-publish-developer-portal",
      generated: "default-bot--simple-bot-ts-publish-developer-portal.json",
      legacy: "Featrue_Open_DeveloperPortal_Publish.json",
    },
    {
      source: "feature-da-legacy-share-error.yml",
      caseId: "da-legacy-share-error",
      generated: "da-no-action--da-legacy-share-error.json",
      legacy: "DA_Error_Message_of_Legacy_Projects.json",
    },
    {
      source: "da-typespec-oauth.yml",
      caseId: "da-typespec-oauth-with-reference-id",
      generated: "da-typespec--da-typespec-oauth-with-reference-id.json",
      legacy: "DA_Typespec_Oauth_With_Reference_Id.json",
    },
    {
      source: "da-typespec-oauth.yml",
      caseId: "da-typespec-oauth-without-reference-id",
      generated: "da-typespec--da-typespec-oauth-without-reference-id.json",
      legacy: "DA_Typespec_Oauth_Without_Reference_Id.json",
    },
    {
      source: "feature-da-add-capability-embedded-knowledge.yml",
      caseId: "da-add-embedded-knowledge",
      generated: "da-no-action--da-add-embedded-knowledge.json",
      legacy: "DA_With_EK_Happy_Path.json",
    },
    {
      source: "feature-provision-without-account.yml",
      caseId: "feature-provision-without-account",
      generated: "feature-provision-without-account.json",
      legacy: "Basic_Tab_Remote_Debug.json",
    },
    {
      source: "feature-provision-without-account.yml",
      caseId: "feature-provision-without-account",
      generated: "feature-provision-without-account.json",
      legacy: "Feature_Provision_Without_Account.json",
    },
  ];
  const plansDirectory = path.join(casesDirectory, "..", "plans");
  for (const migration of migrations) {
    assert.equal(
      fsSync.existsSync(path.join(casesDirectory, migration.source)),
      true,
      migration.source,
    );
    const compiled = await compileFixture(
      migration.source,
      (sourceText) => sourceText,
    );
    assert.equal(compiled.ok, true, migration.source);
    assert.notEqual(
      compiled.value.find(({ caseId }) => caseId === migration.caseId),
      undefined,
      migration.caseId,
    );
    assert.equal(
      fsSync.existsSync(path.join(plansDirectory, migration.generated)),
      true,
      migration.generated,
    );
    assert.equal(
      fsSync.existsSync(path.join(plansDirectory, migration.legacy)),
      false,
      migration.legacy,
    );
  }

  const envRecreated = await compileFixture(
    "non-sso-tab.yml",
    (sourceText) => sourceText,
  );
  const envPlan = envRecreated.value.find(
    ({ caseId }) => caseId === "tab-ts-local-teams-env-recreated",
  ).plan;
  assert.equal(
    envPlan.steps.some((step) =>
      step.description.includes(
        "remove env/.env.local from the generated project",
      ),
    ),
    true,
  );
  assert.equal(
    readFileAssertions(envPlan).some(
      (assertion) =>
        assertion.path === "env/.env.local" && assertion.exists === true,
    ),
    true,
  );

  const notMapped = [
    ["DA_No_Action_Web_Search.json", "ambiguous second branch omits its URL"],
  ];
  const retired = [
    [
      "DA_No_Action_Add_Knowledge_Onedrive.json",
      "mislabeled and contains no OneDrive steps",
    ],
    [
      "DA_Add_Action_Import_Existing_API.json",
      "four authentication variants provide the retained coverage",
    ],
    [
      "Feature_DA_Advanced_Personal_Scope_Provision_with_Copilot_License.json",
      "only assertion is `AGENT_SCOPE=personal`",
    ],
    [
      "Feature_Prompt_Use_Run_From_Package.json",
      "threshold and link are covered by the fx-core unit test",
    ],
  ];
  const mapping = await fs.readFile(
    path.join(casesDirectory, "legacy-case-mapping.md"),
    "utf8",
  );
  const index = await fs.readFile(
    path.join(casesDirectory, "..", "..", "Index.md"),
    "utf8",
  );
  for (const [status, expectedCount] of [
    ["Partial", 0],
    ["Not Mapped", 1],
    ["Retired", 4],
  ]) {
    assert.equal(
      mapping.match(new RegExp(`^\\|[^\\n]*\\|\\s*${status}\\s*\\|`, "gmu"))
        ?.length ?? 0,
      expectedCount,
      `${status} row count`,
    );
  }
  for (const [legacy, blocker] of notMapped) {
    assert.equal(fsSync.existsSync(path.join(plansDirectory, legacy)), true);
    assert.match(
      mapping,
      new RegExp(
        `\\| \\\`${legacy.replaceAll(".", "\\.")}\\\`\\s+\\| Not Mapped\\s+\\|[^\\n]*${blocker}`,
        "i",
      ),
      legacy,
    );
  }
  for (const [legacy, reason] of retired) {
    assert.equal(fsSync.existsSync(path.join(plansDirectory, legacy)), false);
    assert.equal(
      index.includes(`\`${path.parse(legacy).name}\``),
      false,
      `${legacy} is not indexed`,
    );
    assert.match(
      mapping,
      new RegExp(
        `\\| \\\`${legacy.replaceAll(".", "\\.")}\\\`\\s+\\| Retired\\s+\\|[^\\n]*${reason}`,
        "i",
      ),
      legacy,
    );
  }
  for (const { legacy } of migrations) {
    assert.match(
      mapping,
      new RegExp(
        `\\\`${legacy.replaceAll(".", "\\.")}\\\`[^\\n]*\\| Full\\s+\\|`,
      ),
      legacy,
    );
  }
});

test("VCB-142: every OpenAI case reuses Azure OpenAI without fake-key error contracts", async () => {
  const generatedOpenAICases = [];
  for (const fileName of [
    "basic-custom-engine-agent.yml",
    "custom-copilot-rag-azure-ai-search.yml",
    "custom-copilot-rag-custom-api.yml",
    "custom-copilot-rag-customize.yml",
    "general-teams-agent.yml",
    "weather-agent.yml",
  ]) {
    const result = await compileFixture(fileName, (sourceText) => sourceText);
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.[0]));
    generatedOpenAICases.push(
      ...result.value.filter(
        ({ caseId }) =>
          caseId.includes("-openai-") && !caseId.includes("-azure-openai-"),
      ),
    );
  }

  assert.equal(generatedOpenAICases.length, 47);
  for (const { caseId, plan } of generatedOpenAICases) {
    const typedValues = plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    const descriptions = plan.steps.map((step) => step.description);
    const codeSteps = plan.steps.filter((step) => step.agent === "code");

    assert.equal(
      typedValues.includes("${{secret:AZURE_OPENAI_API_KEY}}"),
      true,
      caseId,
    );
    assert.equal(
      JSON.stringify(plan).includes("FAKE_OPENAI_API_KEY") ||
        JSON.stringify(plan).includes("faked_openapi_key"),
      false,
      caseId,
    );
    assert.equal(
      descriptions.some((description) =>
        description.toLowerCase().includes("encountered an error"),
      ),
      false,
      caseId,
    );

    const isRemote = caseId.includes("-remote-");
    const endpointStep = codeSteps.find((step) =>
      isRemote
        ? step.step_id.startsWith("step_setRemoteEnvironmentVariable_")
        : /step_set(?:Local|Playground)EnvironmentVariable_/.test(step.step_id),
    );
    assert.notEqual(endpointStep, undefined, caseId);
    assert.equal(
      codeSteps.some(
        (step) =>
          step.description.includes("OPENAI_BASE_URL") &&
          step.parameters.sample.includes(
            "${{env:AZURE_OPENAI_ENDPOINT}}/openai/v1",
          ),
      ),
      true,
      caseId,
    );
    for (const instruction of [
      "execute the supplied generated bash script exactly as authored",
      "/home/vscode/AgentsToolkitProjects/",
      "do not use /workspace",
    ]) {
      assert.equal(
        endpointStep.description.includes(instruction),
        true,
        `${caseId}: ${instruction}`,
      );
    }

    assert.equal(
      codeSteps.some((step) => step.step_id.startsWith("step_setOpenAIModel_")),
      !caseId.startsWith("weather-"),
      caseId,
    );
    if (!caseId.startsWith("weather-")) {
      const modelStep = codeSteps.find((step) =>
        step.step_id.startsWith("step_setOpenAIModel_"),
      );
      assert.equal(
        modelStep.parameters.sample.includes("gpt-3.5-turbo") &&
          modelStep.parameters.sample.includes("gpt-4o-mini"),
        true,
        caseId,
      );
      for (const instruction of [
        "execute the supplied generated bash script exactly as authored",
        "/home/vscode/AgentsToolkitProjects/",
        "do not use /workspace",
      ]) {
        assert.equal(
          modelStep.description.includes(instruction),
          true,
          `${caseId}: ${instruction}`,
        );
      }
    }
  }
});

test("VCB-181: PKCE OAuth provisions with only a protected client ID", async () => {
  const sourceText = `version: 1
cases:
  - id: feature-da-no-action-pkce-oauth-auth-remote-preview
    scenarioId: VCB-181
    workItemIds: [31541624]
    steps: [scaffold, check, add-action, add-auth, check-auth, set-scope, login, provision, target, open, check-sign-in]
steps:
  scaffold:
    type: scaffold
    with:
      template: da/no-action
      answers:
        - { question: projectType, value: copilot-agent-type }
        - { question: daTemplate, value: no-action }
        - { question: workspaceFolder, value: default }
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: appPackage/declarativeAgent.json
        expect: { exists: true }
  add-action:
    type: addDaAction
    with:
      source: openapi
      url: https://raw.githubusercontent.com/neil-yechenwei/uitest/6c0c1cb66ce41fd4112a15ee9d996dde9ff233f7/Spec_add_auth_oauth_pkce.yaml
      operations: all
  add-auth:
    type: addApiAuthConfiguration
    with:
      authType: oauth
      authName: oAuth2AuthCode
      authorizationUrl: https://login.microsoftonline.com/81ccb34d-48d6-48a2-82ca-04d530ee06b7/oauth2/v2.0/authorize
      tokenUrl: https://login.microsoftonline.com/81ccb34d-48d6-48a2-82ca-04d530ee06b7/oauth2/v2.0/token
      refreshUrl: ""
      scope: "api://81ccb34d-48d6-48a2-82ca-04d530ee06b/repairs_read: Read repair records"
      pkce: true
  check-auth:
    type: checks
    with:
      - type: file
        path: m365agents.yml
        expect: { contains: ["isPKCEEnabled: true"] }
      - type: file
        path: m365agents.local.yml
        expect: { contains: ["isPKCEEnabled: true"] }
  set-scope:
    type: projectEnvironment
    with:
      variables: { AGENT_SCOPE: personal }
  login:
    type: login
    with:
      type: m365
      account: "\${{env:M365_ACCOUNT_NAME}}"
      password: "\${{secret:M365_ACCOUNT_PASSWORD}}"
  provision:
    type: provision
    with:
      oauth:
        clientId: "\${{env:EXISTING_GITHUB_OAUTH_CLIENT_ID}}"
  target:
    type: target
    with:
      profile: "Preview in Copilot (Chrome)"
      profileSelection: second
  open:
    type: open
    with: { kind: agent, destination: chat }
  check-sign-in:
    type: checks
    with:
      - type: chat
        send: List all repairs
        allowAction: true
      - type: browser
        expect: { role: button, namePrefix: Sign in }
`;
  const result = compileInlineSource(sourceText, "vscuse-vcb-181.yml");
  assert.equal(
    result.ok,
    true,
    `${result.diagnostics?.[0]?.code}: ${result.diagnostics?.[0]?.message}`,
  );
  const plan = result.value[0].plan;
  assert.equal(plan.plan_metadata.description.workitem, "31541624");
  const typedValues = plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(typedValues.includes("Yes"), true);
  assert.equal(
    typedValues.includes("${{env:EXISTING_GITHUB_OAUTH_CLIENT_ID}}"),
    true,
  );
  assert.equal(
    plan.steps.some((step) =>
      step.description.includes("OAuth registration client secret"),
    ),
    false,
  );
  assert.equal(
    plan.steps.some((step) =>
      step.description.includes("uploads the client ID/Secret"),
    ),
    false,
  );

  const unrelatedAction = compileInlineSource(
    sourceText.replace(
      "6c0c1cb66ce41fd4112a15ee9d996dde9ff233f7/Spec_add_auth_oauth_pkce.yaml",
      "6c0c1cb66ce41fd4112a15ee9d996dde9ff233f7/Spec_add_auth_oauth_github.yaml",
    ),
    "vscuse-vcb-181-unrelated-action.yml",
  );
  assert.equal(unrelatedAction.ok, false);
  assert.equal(
    unrelatedAction.diagnostics[0].code,
    "VCB_ADD_API_AUTH_INPUT_INVALID",
  );

  const extraClientSecret = compileInlineSource(
    sourceText.replace(
      '        clientId: "${{env:EXISTING_GITHUB_OAUTH_CLIENT_ID}}"',
      '        clientId: "${{env:EXISTING_GITHUB_OAUTH_CLIENT_ID}}"\n        clientSecret: "${{secret:EXISTING_GITHUB_OAUTH_CLIENT_SECRET}}"',
    ),
    "vscuse-vcb-181-client-secret.yml",
  );
  assert.equal(extraClientSecret.ok, false);
  assert.equal(
    extraClientSecret.diagnostics[0].code,
    "VCB_PROVISION_INPUT_UNKNOWN",
  );

  const fixture = await compileFixture(
    "feature-da-no-action-add-action.yml",
    (sourceText) => sourceText,
  );
  assert.equal(fixture.ok, true, fixture.diagnostics?.[0]?.code);
  const migrated = fixture.value.find(
    ({ caseId }) =>
      caseId === "feature-da-no-action-pkce-oauth-auth-remote-preview",
  );
  assert.notEqual(migrated, undefined);
  assert.equal(migrated.plan.plan_metadata.description.workitem, "31541624");
});

test("VCB-182: ARM JSON multiple templates use one immutable mutation", async () => {
  const sourceText = `version: 1
cases:
  - id: feature-arm-json-multiple-templates
    scenarioId: VCB-182
    workItemIds: [16835373]
    steps: [scaffold, check, configure, check-fixtures, login-azure, login-m365, provision, check-output]
steps:
  scaffold:
    type: scaffold
    with:
      template: non-sso-tab
      answers:
        - { question: projectType, value: teams-agent-and-app-type }
        - { question: teamsAppType, value: teams-other-app-type }
        - { question: teamsOtherAppType, value: non-sso-tab }
        - { question: workspaceFolder, value: default }
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: m365agents.yml
        expect: { contains: ["path: ./infra/azure.bicep"] }
  configure:
    type: configureArmJsonTemplates
  check-fixtures:
    type: checks
    with:
      - type: file
        path: m365agents.yml
        expect:
          contains: ["path: ./infra/azure.json", "parameters: ./infra/azure.parameters.test.json", "deploymentName: test-json-format"]
      - type: file
        path: infra/azure.json
        expect: { contains: ['"SQLRESOURCEID"'] }
      - type: file
        path: infra/azure.parameters.test.json
        expect: { contains: ['"resourceBaseName"'] }
  login-azure:
    type: login
    with:
      type: azure
      account: "\${{env:AZURE_ACCOUNT_NAME}}"
      password: "\${{secret:AZURE_ACCOUNT_PASSWORD}}"
  login-m365:
    type: login
    with:
      type: m365
      account: "\${{env:M365_ACCOUNT_NAME}}"
      password: "\${{secret:M365_ACCOUNT_PASSWORD}}"
  provision:
    type: provision
    with:
      environment: none
      arm:
        targetResourceGroupName: "+ New resource group"
        newResourceGroupName: "\${{var:app_name}}-rg"
        newResourceGroupLocation: "\${{env:RESOURCE_GROUP_REGION}}"
  check-output:
    type: checks
    with:
      - type: file
        path: env/.env.dev
        expect: { contains: ["SQLRESOURCEID="] }
`;
  const result = compileInlineSource(sourceText, "vscuse-vcb-182.yml");
  assert.equal(
    result.ok,
    true,
    `${result.diagnostics?.[0]?.code}: ${result.diagnostics?.[0]?.message}`,
  );
  const plan = result.value[0].plan;
  assert.equal(plan.plan_metadata.description.workitem, "16835373");
  assert.equal(
    plan.steps.some((step) =>
      step.description.includes("Select an environment"),
    ),
    false,
  );
  assert.equal(
    plan.steps.some((step) =>
      step.step_id.startsWith("step_configureArmJsonTemplates_"),
    ),
    true,
  );
  const assertions = readFileAssertions(plan);
  for (const expectedPath of [
    "m365agents.yml",
    "infra/azure.json",
    "infra/azure.parameters.test.json",
    "env/.env.dev",
  ]) {
    assert.equal(
      assertions.some(({ path }) => path === expectedPath),
      true,
      expectedPath,
    );
  }

  const fixture = await compileFixture(
    "feature-arm-json-multiple-templates.yml",
    (fixtureSource) => fixtureSource,
  );
  assert.equal(fixture.ok, true, fixture.diagnostics?.[0]?.code);
  assert.equal(fixture.value.length, 1);
  assert.equal(
    fixture.value[0].plan.plan_metadata.description.workitem,
    "16835373",
  );

  const authoredMutationInput = compileInlineSource(
    sourceText.replace(
      "    type: configureArmJsonTemplates",
      "    type: configureArmJsonTemplates\n    with: { path: infra/azure.json }",
    ),
    "vscuse-vcb-182-authored-input.yml",
  );
  assert.equal(authoredMutationInput.ok, false);
  assert.equal(
    authoredMutationInput.diagnostics[0].code,
    "VCB_ARM_JSON_TEMPLATES_INPUT_INVALID",
  );
});

test("VCB-183: deferred OpenAI key is supplied by the local target", async () => {
  const sourceText = `version: 1
cases:
  - id: feature-local-debug-custom-api-without-openai-key
    scenarioId: VCB-183
    workItemIds: [31256782, 33502084]
    steps: [scaffold, check, model, endpoint, python, login, target, open, chat]
steps:
  scaffold:
    type: scaffold
    with:
      template: custom-copilot-rag-custom-api
      answers:
        - { question: projectType, value: teams-agent-and-app-type }
        - { question: teamsAppType, value: custom-copilot-rag }
        - { question: customCopilotRag, value: custom-copilot-rag-custom-api }
        - question: apiSpecLocation
          type: text
          value: https://raw.githubusercontent.com/SLdragon/example-openapi-spec/main/real-no-auth.yaml
        - { question: apiOperations, type: multiSelect, value: all }
        - { question: llmService, value: llm-service-openai }
        - { question: openAIKey, type: text, value: deferred }
        - { question: language, value: python }
        - { question: workspaceFolder, value: default }
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: src/config.py
        expect: { contains: [OPENAI_API_KEY, "OPENAI_MODEL_NAME='gpt-3.5-turbo'"] }
  model:
    type: openAIModel
    with: { path: src/config.py, current: gpt-3.5-turbo }
  endpoint:
    type: localEnvironment
    with:
      OPENAI_BASE_URL: "\${{env:AZURE_OPENAI_ENDPOINT}}/openai/v1"
  python:
    type: pythonEnvironment
    with: { interpreter: "Python 3.12" }
  login:
    type: login
    with:
      type: m365
      account: "\${{env:M365_ACCOUNT_NAME}}"
      password: "\${{secret:M365_ACCOUNT_PASSWORD}}"
  target:
    type: target
    with:
      profile: "Debug in Teams (Chrome)"
      profileSelection: first
      runtimeInputs:
        openAIKey: "\${{secret:AZURE_OPENAI_API_KEY}}"
  open:
    type: open
    with: { kind: app, destination: chat }
  chat:
    type: checks
    with:
      - type: chat
        send: List all repairs without auth
        expect: { replied: true, notContains: ["error"] }
`;
  const result = compileInlineSource(sourceText, "vscuse-vcb-183.yml");
  assert.equal(
    result.ok,
    true,
    `${result.diagnostics?.[0]?.code}: ${result.diagnostics?.[0]?.message}`,
  );
  const plan = result.value[0].plan;
  assert.equal(plan.plan_metadata.description.workitem, "31256782,33502084");
  const deferredIndex = plan.steps.findIndex((step) =>
    step.description.includes(
      "active prompt titled OpenAI Key is visible and its text input is empty",
    ),
  );
  const targetIndex = plan.steps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "Debug: Select and Start Debugging",
  );
  const runtimeSecretIndex = plan.steps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "${{secret:AZURE_OPENAI_API_KEY}}",
  );
  const readyIndex = plan.steps.findIndex((step) =>
    step.description.includes("Microsoft Teams app details page"),
  );
  assert.equal(deferredIndex >= 0, true);
  assert.equal(targetIndex < runtimeSecretIndex, true);
  assert.equal(runtimeSecretIndex < readyIndex, true);
  assert.equal(JSON.stringify(plan).includes("fackedkey"), false);

  const fixture = await compileFixture(
    "custom-copilot-rag-custom-api.yml",
    (fixtureSource) => fixtureSource,
  );
  assert.equal(fixture.ok, true, fixture.diagnostics?.[0]?.code);
  const migrated = fixture.value.find(
    ({ caseId }) =>
      caseId === "feature-local-debug-custom-api-without-openai-key",
  );
  assert.notEqual(migrated, undefined);
  assert.equal(
    migrated.plan.plan_metadata.description.workitem,
    "31256782,33502084",
  );

  for (const [label, transformedSource] of [
    [
      "literal runtime key",
      sourceText.replace(
        'openAIKey: "${{secret:AZURE_OPENAI_API_KEY}}"',
        'openAIKey: "literal-key"',
      ),
    ],
    [
      "wrong target profile",
      sourceText.replace(
        'profile: "Debug in Teams (Chrome)"',
        'profile: "Debug in Microsoft 365 Agents Playground"',
      ),
    ],
    [
      "missing deferred scaffold state",
      sourceText.replace(
        "{ question: openAIKey, type: text, value: deferred }",
        '{ question: openAIKey, type: text, value: "${{secret:AZURE_OPENAI_API_KEY}}" }',
      ),
    ],
  ]) {
    const invalid = compileInlineSource(
      transformedSource,
      `vscuse-vcb-183-${label.replaceAll(" ", "-")}.yml`,
    );
    assert.equal(invalid.ok, false, label);
    assert.equal(
      [
        "VCB_TARGET_PROFILE_UNKNOWN",
        "VCB_TARGET_RUNTIME_INPUT_INVALID",
      ].includes(invalid.diagnostics[0].code),
      true,
      label,
    );
  }
});

test("VCB-184: migrated feature fixtures retain runtime prerequisites and waits", async () => {
  const armFixture = await compileFixture(
    "feature-arm-json-multiple-templates.yml",
    (fixtureSource) => fixtureSource,
  );
  assert.equal(armFixture.ok, true, armFixture.diagnostics?.[0]?.code);
  assert.equal(
    armFixture.value[0].plan.steps.some((step) =>
      step.description.includes("Select an environment"),
    ),
    false,
  );

  const authFixture = await compileFixture(
    "feature-da-no-action-add-action.yml",
    (fixtureSource) => fixtureSource,
  );
  assert.equal(authFixture.ok, true, authFixture.diagnostics?.[0]?.code);
  const pkcePlan = authFixture.value.find(
    ({ caseId }) =>
      caseId === "feature-da-no-action-pkce-oauth-auth-remote-preview",
  ).plan;
  const typedValues = pkcePlan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  assert.equal(
    typedValues.includes("${{env:EXISTING_GITHUB_OAUTH_CLIENT_ID}}"),
    true,
  );
  assert.equal(
    typedValues.includes("${{env:EXISTING_OAUTH_CLIENT_ID}}"),
    false,
  );

  const customApiFixture = await compileFixture(
    "custom-copilot-rag-custom-api.yml",
    (fixtureSource) => fixtureSource,
  );
  assert.equal(
    customApiFixture.ok,
    true,
    customApiFixture.diagnostics?.[0]?.code,
  );
  const customApiPlan = customApiFixture.value.find(
    ({ caseId }) =>
      caseId === "feature-local-debug-custom-api-without-openai-key",
  ).plan;
  const deferredOpenAIKeyPrompt = customApiPlan.steps.find((step) =>
    step.step_id.startsWith("step_deferredTextInput_assertQuestion_"),
  );
  assert.notEqual(deferredOpenAIKeyPrompt, undefined);
  assert.equal(
    deferredOpenAIKeyPrompt.tags.includes("step_retry_timeout: 180"),
    true,
  );
  const scaffoldOpenAIKeyPrompt = customApiPlan.steps.find(
    (step) =>
      step.step_id.startsWith("step_emptyTextInput_assertQuestion_") &&
      step.description.includes("OpenAI Key"),
  );
  assert.notEqual(scaffoldOpenAIKeyPrompt, undefined);
  assert.equal(
    scaffoldOpenAIKeyPrompt.tags.includes("step_retry_timeout: 30"),
    true,
  );
});

test("VCB-185: MCP Add Action supports None and static OAuth in one generated case", async () => {
  const sourceText = `version: 1
cases:
  - id: feature-da-add-mcp-server
    scenarioId: SCN-DA-ADD-MCP-ACTION-TO-DA
    workItemIds: [37636970]
    steps: [scaffold, check, add-none, add-oauth, verify]
steps:
  scaffold:
    type: scaffold
    with:
      template: da/no-action
      answers:
        - question: projectType
          value: copilot-agent-type
        - question: daTemplate
          value: no-action
        - question: workspaceFolder
          value: default
        - question: appName
          type: text
          value: "\${{var:app_name:vscuse_app_#####}}"
  check:
    type: checks
    with:
      - type: file
        path: appPackage/declarativeAgent.json
        expect: { exists: true }
  add-none:
    type: addDaAction
    with:
      source: mcp
      url: https://learn.microsoft.com/api/mcp
      authType: none
  add-oauth:
    type: addDaAction
    with:
      source: mcp
      url: https://api.githubcopilot.com/mcp/
      authType: oauth
      clientId: "\${{env:DA_MCP_OAUTH_CLIENTID}}"
      clientSecret: "\${{secret:DA_MCP_OAUTH_CLIENT_SECRET}}"
      scopes: read:user
  verify:
    type: checks
    with:
      - type: file
        path: appPackage/declarativeAgent.json
        expect: { contains: ['"id": "action_1"', '"id": "action_2"'] }
`;
  const result = compileInlineSource(sourceText, "vscuse-vcb-185.yml");
  assert.equal(
    result.ok,
    true,
    `${result.diagnostics?.[0]?.code}: ${result.diagnostics?.[0]?.message}`,
  );
  const generated = result.value[0];
  assert.equal(generated.caseId, "feature-da-add-mcp-server");
  assert.equal(generated.plan.plan_metadata.description.workitem, "37636970");
  assert.equal(
    generated.plan.plan_metadata.tags.some((tag) =>
      tag.startsWith("feature_flag:TEAMSFX_MCP_FOR_DA_DT="),
    ),
    false,
  );
  const typedValues = generated.plan.steps
    .filter((step) => step.tool === "type_text")
    .map((step) => step.parameters.text);
  const expectedSequence = [
    "https://learn.microsoft.com/api/mcp",
    "None",
    "https://api.githubcopilot.com/mcp/",
    "OAuth (with static registration)",
    "${{env:DA_MCP_OAUTH_CLIENTID}}",
    "${{secret:DA_MCP_OAUTH_CLIENT_SECRET}}",
    "read:user",
  ];
  let previousIndex = -1;
  for (const expectedValue of expectedSequence) {
    const index = typedValues.indexOf(expectedValue, previousIndex + 1);
    assert.notEqual(index, -1, expectedValue);
    assert.equal(index > previousIndex, true, expectedValue);
    previousIndex = index;
  }
  const addActionStart = generated.plan.steps.findIndex(
    (step) =>
      step.tool === "type_text" &&
      step.parameters.text === "Microsoft 365 Agents: Add Action",
  );
  const addActionEnd = generated.plan.steps.findIndex(
    (step) => step.tool === "type_text" && step.parameters.text === "read:user",
  );
  assert.notEqual(addActionStart, -1);
  assert.equal(addActionEnd > addActionStart, true);
  assert.equal(
    generated.plan.steps
      .slice(addActionStart, addActionEnd + 1)
      .some((step) => step.tool === "click"),
    false,
  );

  for (const [label, invalidSource] of [
    [
      "None extra field",
      sourceText.replace(
        "      authType: none",
        "      authType: none\n      scopes: read:user",
      ),
    ],
    [
      "OAuth literal client ID",
      sourceText.replace(
        'clientId: "${{env:DA_MCP_OAUTH_CLIENTID}}"',
        "clientId: literal-client-id",
      ),
    ],
    [
      "OAuth literal client secret",
      sourceText.replace(
        'clientSecret: "${{secret:DA_MCP_OAUTH_CLIENT_SECRET}}"',
        "clientSecret: literal-client-secret",
      ),
    ],
    [
      "OAuth empty scopes",
      sourceText.replace("scopes: read:user", 'scopes: ""'),
    ],
    [
      "unsupported auth",
      sourceText.replace("authType: none", "authType: entra-sso"),
    ],
  ]) {
    const invalid = compileInlineSource(
      invalidSource,
      `vscuse-vcb-185-${label}.yml`,
    );
    assert.equal(invalid.ok, false, label);
    assert.equal(
      invalid.diagnostics[0].code,
      "VCB_ADD_DA_ACTION_INPUT_INVALID",
      label,
    );
  }

  const fixture = await compileFixture(
    "feature-da-no-action-add-action.yml",
    (fixtureSource) => fixtureSource,
  );
  assert.equal(fixture.ok, true, fixture.diagnostics?.[0]?.code);
  const migrated = fixture.value.find(
    ({ caseId }) => caseId === "feature-da-add-mcp-server",
  );
  assert.notEqual(migrated, undefined);
  assert.equal(migrated.plan.plan_metadata.description.workitem, "37636970");
  assert.equal(
    migrated.plan.plan_metadata.tags.some((tag) =>
      tag.startsWith("feature_flag:TEAMSFX_MCP_FOR_DA_DT="),
    ),
    false,
  );
  const fileAssertions = readFileAssertions(migrated.plan);
  for (const [path, expectedText] of [
    ["appPackage/ai-plugin.json", '"type": "None"'],
    ["appPackage/ai-plugin_1.json", '"type": "OAuthPluginVault"'],
    ["appPackage/declarativeAgent.json", '"id": "action_1"'],
    ["appPackage/declarativeAgent.json", '"id": "action_2"'],
    ["m365agents.yml", "uses: oauth/register"],
    ["env/.env.dev", "MCP_DA_OAUTH_CLIENT_ID_APIGITHUBC="],
  ]) {
    assert.equal(
      fileAssertions.some(
        (assertion) =>
          assertion.path === path && assertion.contains?.includes(expectedText),
      ),
      true,
      `${path}: ${expectedText}`,
    );
  }
});
