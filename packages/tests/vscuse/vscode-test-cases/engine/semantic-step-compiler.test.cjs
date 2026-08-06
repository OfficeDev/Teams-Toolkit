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

test("VCB-34: default setup compiles the checked-in YAML sources into ninety-four plans", async (context) => {
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
  assert.equal(first.value.files.length, 94);
  const generatedFiles = first.value.files;
  assert.equal(generatedFiles.length, 94);
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
  assert.equal(result.value.length, 3);
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
      "@assertion a visible Visual Studio Code notification contains provision stage executed successfully.",
      'Click the "Message" input box in the Microsoft 365 Copilot web application.',
      "@assertion the Copilot action-consent Allow button is visible.",
      'Click the "Allow" button in the Microsoft 365 Copilot chat interface to grant the agent access.',
      "@assertion the Copilot action-consent Allow button is no longer visible.",
      '@assertion the current assistant response contains "Oil Change".',
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
    description.includes("shows an agent selected in the Agents list"),
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
    assert.equal(
      generated.plan.steps.some((step) => step.parameters.key === "f5"),
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
      "@assertion a visible Visual Studio Code notification contains provision stage executed successfully.",
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
    "@assertion Microsoft 365 Copilot shows an agent selected in the Agents list and that agent's chat open in the main section with a visible message input.",
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
    assert.equal(caseIds.size, languages.length * 3, fileName);
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
  }
  expectedCaseIds.add("general-teams-ts-azure-openai-remote-copilot");
  expectedCaseIds.add("general-teams-ts-azure-openai-local-copilot");

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
        step.description.includes("shows an agent selected in the Agents list"),
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

test("VCB-97: General Teams Agent OpenAI cases chat locally but not remotely", async () => {
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
    const isLocal = generated.caseId.includes("-local-");
    const sendsAMessage = generated.plan.steps.some((step) =>
      /^step_sendTeamsMessage_/.test(step.step_id || ""),
    );
    const setsOpenAIBaseUrl = generated.plan.steps.some((step) =>
      /^step_setLocalEnvironmentVariable_/.test(step.step_id || ""),
    );
    assert.equal(sendsAMessage, isLocal, generated.caseId);
    assert.equal(setsOpenAIBaseUrl, isLocal, generated.caseId);
  }
});

test("VCB-98: only General Teams Agent Copilot cases inject the launch flag before startup", async () => {
  const result = await compileFixture(
    "general-teams-agent.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);
  assert.equal(result.value.length, 17);

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

test("VCB-73: an OpenAI weather case asserts a completion locally but not remotely", async () => {
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
    const isLocal = generated.caseId.includes("-local-");
    const sendsAMessage = generated.plan.steps.some((step) =>
      /^step_send(Teams|Copilot|Playground)Message_/.test(step.step_id || ""),
    );
    assert.equal(
      sendsAMessage,
      isLocal,
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

test("VCB-123: TypeSpec GitHub issues action uses a deterministic terminal mutation", async () => {
  const sourceText = `version: 1
cases:
  - id: typespec-github-issues
    scenarioId: VCB-123
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
  assert.equal(
    mutation.some((step) =>
      step.description.includes("VSCUSE_TYPESPEC_ACTION_CONFIGURED"),
    ),
    true,
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
      "@assertion a visible Visual Studio Code notification contains provision stage executed successfully.",
    ),
    true,
  );
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
        "@assertion Microsoft 365 Copilot shows an agent selected in the Agents list and that agent's chat open in the main section with a visible message input.",
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

test("VCB-43: Copilot readiness requires a selected agent and open chat", async () => {
  const readySubject = (result) =>
    result.value[0].plan.steps
      .map((step) => step.description)
      .find((description) => description.includes("agent selected"));
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
    "@assertion Microsoft 365 Copilot shows an agent selected in the Agents list and that agent's chat open in the main section with a visible message input.",
  );
  assert.equal(readySubject(unsuffixed), readySubject(suffixed));
  assert.doesNotMatch(readySubject(suffixed), /\$\{\{var:app_name\}\}/);
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
      "@assertion Microsoft 365 Copilot shows an agent selected in the Agents list and that agent's chat open in the main section with a visible message input.",
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
    "rag-customize-js-azure-openai-local-teams",
    "rag-customize-js-openai-local-teams",
    "rag-customize-py-azure-openai-local-teams",
    "rag-customize-py-openai-local-copilot",
    "rag-customize-py-openai-local-teams",
    "rag-customize-ts-azure-openai-local-teams",
    "rag-customize-ts-openai-local-teams",
  ]);
  for (const generated of customize.value) {
    assert.equal(
      generated.plan.plan_metadata.tags.includes(
        "feature_flag:TEAMSFX_CEA_ENABLED=true",
      ),
      generated.caseId.endsWith("-local-copilot"),
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
    "rag-azure-ai-search-js-openai-local-teams",
    "rag-azure-ai-search-py-azure-openai-local-teams",
    "rag-azure-ai-search-py-openai-local-teams",
    "rag-azure-ai-search-ts-azure-openai-local-teams",
    "rag-azure-ai-search-ts-openai-local-teams",
  ]);
  for (const generated of search.value) {
    const samples = generated.plan.steps
      .filter((step) =>
        step.step_id?.startsWith("step_setLocalEnvironmentVariable_"),
      )
      .map((step) => step.parameters.sample);

    assert.equal(
      samples.some((sample) =>
        sample.includes('VARIABLE_NAME="AZURE_SEARCH_KEY"'),
      ),
      true,
      generated.caseId,
    );
    assert.equal(
      samples.some((sample) =>
        sample.includes('VARIABLE_NAME="AZURE_SEARCH_ENDPOINT"'),
      ),
      true,
      generated.caseId,
    );

    const usesAzureOpenAI = generated.caseId.includes("-azure-openai-");
    const embeddingName = generated.caseId.startsWith("rag-azure-ai-search-py-")
      ? "AZURE_OPENAI_EMBEDDING_DEPLOYMENT"
      : "AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME";
    assert.equal(
      samples.some((sample) =>
        sample.includes(`VARIABLE_NAME="${embeddingName}"`),
      ),
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
    "rag-custom-api-js-azure-openai-local-teams",
    "rag-custom-api-js-openai-local-teams",
    "rag-custom-api-py-azure-openai-local-teams",
    "rag-custom-api-py-openai-local-teams",
    "rag-custom-api-ts-azure-openai-local-teams",
    "rag-custom-api-ts-openai-local-teams",
  ]);
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

test("VCB-113: the OpenAI branch asserts no grounded answer", async () => {
  for (const [fileName] of teamsAgentWithDataBundles) {
    const result = await compileFixture(fileName, (sourceText) => sourceText);
    assert.equal(result.ok, true, result.diagnostics?.[0]?.code);

    for (const generated of result.value) {
      const hasStep = (prefix) =>
        generated.plan.steps.some((candidate) =>
          candidate.step_id.startsWith(prefix),
        );
      const onOpenAIBranch =
        generated.caseId.includes("-openai-") &&
        !generated.caseId.includes("-azure-openai-");

      assert.equal(hasStep("step_assertChatReplied_"), true, generated.caseId);
      assert.equal(
        hasStep("step_assertChatNotContains_"),
        !onOpenAIBranch,
        generated.caseId,
      );
    }
  }
});

test("VCB-114: the Node Azure AI Search OpenAI cases run on a fake key", async () => {
  const result = await compileFixture(
    "custom-copilot-rag-azure-ai-search.yml",
    (sourceText) => sourceText,
  );
  assert.equal(result.ok, true, result.diagnostics?.[0]?.code);

  const fakeKeyCases = [
    "rag-azure-ai-search-ts-openai-local-teams",
    "rag-azure-ai-search-js-openai-local-teams",
  ];
  for (const generated of result.value) {
    const descriptions = generated.plan.steps.map(
      (candidate) => candidate.description,
    );
    const onFakeKey = fakeKeyCases.includes(generated.caseId);

    assert.equal(
      descriptions.some((text) => text.includes("set OPENAI_API_KEY ")),
      onFakeKey,
      generated.caseId,
    );
    assert.equal(
      descriptions.some((text) => text.includes("set OPENAI_BASE_URL ")),
      generated.caseId === "rag-azure-ai-search-py-openai-local-teams",
      generated.caseId,
    );
    assert.equal(
      generated.plan.steps.some(
        (candidate) =>
          candidate.step_id.startsWith("step_assertChatContains_") &&
          candidate.description.includes("encountered an error"),
      ),
      onFakeKey,
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

test("VCB-122: the Teams Collaborator Agent bundle chats locally but stops after the remote launch", async () => {
  const result = await compileFixture(
    "teams-collaborator-agent.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true, JSON.stringify(result.diagnostics?.[0]));
  assert.deepEqual(
    result.value.map((generated) => generated.caseId),
    [
      "collaborator-ts-azure-openai-remote-teams",
      "collaborator-ts-azure-openai-local-teams",
    ],
  );

  for (const { caseId, expectedProfile, expectsChat } of [
    {
      caseId: "collaborator-ts-azure-openai-remote-teams",
      expectedProfile: "Launch Remote (Chrome)",
      expectsChat: false,
    },
    {
      caseId: "collaborator-ts-azure-openai-local-teams",
      expectedProfile: "Debug in Teams (Chrome)",
      expectsChat: true,
    },
  ]) {
    const plan = result.value.find(
      (generated) => generated.caseId === caseId,
    ).plan;
    const typedValues = plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);

    assert.equal(typedValues.includes(expectedProfile), true, caseId);
    assert.equal(
      plan.steps.some((step) => step.step_id.startsWith("step_addAndOpenApp_")),
      true,
      caseId,
    );
    assert.equal(
      plan.steps.some((step) =>
        step.step_id.startsWith("step_sendTeamsMessage_"),
      ),
      expectsChat,
      caseId,
    );
    assert.equal(
      typedValues.includes("Create a task to review the proposal by Friday"),
      expectsChat,
      caseId,
    );
  }
});
