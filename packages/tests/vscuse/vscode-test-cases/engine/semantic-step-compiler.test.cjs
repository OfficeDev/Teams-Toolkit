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

test("VCB-34: default setup compiles the checked-in YAML sources into twelve plans", async (context) => {
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
  assert.equal(first.value.files.length, 12);
  const generatedFiles = first.value.files;
  assert.equal(generatedFiles.length, 12);
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
      index > entryIndex && description.includes('in the "ACCOUNTS" section'),
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
  assert.equal(result.value.length, 2);
  for (const generated of result.value) {
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
      "Click the Microsoft 365 Copilot message input.",
      "@assertion the Copilot action-consent Allow button is visible.",
      "Click the Copilot action-consent Allow button.",
      "@assertion the Copilot action-consent prompt is no longer visible.",
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
      "@assertion the multi-select prompt titled Select Operation(s) Copilot Can Interact with lists at least one option below its input box.",
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

test("existing API cases preserve legacy authentication variants", async () => {
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
    const typedValues = plan.steps
      .filter((step) => step.tool === "type_text")
      .map((step) => step.parameters.text);
    assert.equal(typedValues.includes(url), true, caseId);
    for (const value of credentialValues) {
      assert.equal(
        typedValues.filter((typedValue) => typedValue === value).length,
        2,
        caseId,
      );
    }
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
    description.includes("is displayed in the main section"),
  );
  const targetSelectionIndex = oauthDescriptions.findIndex((description) =>
    description.includes("Preview in Copilot (Chrome) is selected"),
  );
  const repeatedClientIdIndex = oauthPlan.steps.findLastIndex(
    (step) => step.parameters.text === "${{env:EXISTING_API_OAUTH_CLIENT_ID}}",
  );
  const repeatedClientSecretIndex = oauthPlan.steps.findLastIndex(
    (step) =>
      step.parameters.text === "${{secret:EXISTING_API_OAUTH_CLIENT_SECRET}}",
  );
  const signInIndex = oauthDescriptions.indexOf(
    "@assertion a visible browser element has role button and accessible name Sign in to Repair Service.",
  );
  assert.equal(environmentIndex < clientIdIndex, true);
  assert.equal(clientIdIndex < clientSecretIndex, true);
  assert.equal(clientSecretIndex < confirmationIndex, true);
  assert.equal(targetSelectionIndex < repeatedClientIdIndex, true);
  assert.equal(repeatedClientIdIndex < repeatedClientSecretIndex, true);
  assert.equal(readinessIndex >= 0, true);
  assert.equal(readinessIndex < signInIndex, true);
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
        "weather-agent--weather-ts-azure-openai-remote-preview.json",
      ),
      "utf8",
    ),
  );
  assert.equal(
    weatherPlan.steps.some((step) =>
      step.description.includes("the dialog Provision is visible"),
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
      step.description === "Press Enter to confirm the filtered option.",
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

  assert.equal(profileIndex < accountIndex, true);
  assert.equal(accountIndex < passwordIndex, true);
  assert.equal(passwordIndex < readinessIndex, true);
  // Readiness names the app by the prefix the case authored, so it holds
  // whether or not the manifest appended an environment suffix.
  assert.match(
    readinessDescription,
    /whose name starts with \$\{\{var:app_name\}\}/,
  );
  assert.doesNotMatch(readinessDescription, /\}\}local/);
  assert.doesNotMatch(readinessDescription, /\}\}dev/);
  assert.doesNotMatch(readinessDescription, /is ready is ready/);
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
      description.includes("the confirmation question Deploy is visible"),
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
  const notificationsIndex = filters.indexOf(
    "Notifications: Show Notifications",
  );
  const provisionIndex = filters.indexOf("Microsoft 365 Agents: Provision");
  const successIndex = steps.findIndex((step) =>
    step.description.includes("provision stage executed successfully"),
  );

  assert.equal(notificationsIndex >= 0, true);
  assert.equal(notificationsIndex < provisionIndex, true);
  assert.equal(provisionIndex < successIndex, true);

  const suffix = steps[provisionIndex].step_id.replace(
    "step_executeCommand_filter_",
    "",
  );
  const triggerIndex = steps.findIndex(
    (step) => step.step_id === `step_executeCommand_execute_${suffix}`,
  );

  // VS Code closes the Command Palette when the window loses focus, and a
  // running provision opens browser windows of its own, so nothing between the
  // command and its result may reopen the palette.
  const running = steps.slice(triggerIndex + 1, successIndex);
  assert.equal(
    running.some((step) => step.step_id.startsWith("step_executeCommand_")),
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

test("semantic adapter rejects an open kind incompatible with its target profile", async () => {
  const result = await compileFixture("weather-agent.yml", (sourceText) =>
    sourceText.replace("      kind: app", "      kind: agent"),
  );

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_OPEN_ADAPTER_UNKNOWN");
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
        "@assertion an agent whose name starts with ${{var:app_name}} is displayed in the main section of Microsoft 365 Copilot.",
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

test("VCB-43: the Copilot ready subject names the app by its authored prefix", async () => {
  const readySubject = (result) =>
    result.value[0].plan.steps
      .map((step) => step.description)
      .find((description) =>
        description.includes("is displayed in the main section"),
      );
  // These two templates compose the agent name differently: one appends
  // `${{APP_NAME_SUFFIX}}` and the other does not. One prefix claim covers both.
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
    "@assertion an agent whose name starts with ${{var:app_name}} is displayed in the main section of Microsoft 365 Copilot.",
  );
  assert.equal(readySubject(unsuffixed), readySubject(suffixed));
});

test("VCB-44: the Copilot message input is named by its previewed agent", async () => {
  const result = await compileFixture(
    "da-no-action.yml",
    (sourceText) => sourceText,
  );

  assert.equal(result.ok, true);
  const descriptions = result.value[0].plan.steps.map(
    (step) => step.description,
  );
  // The previewed agent owns the input placeholder, so the unscoped Copilot
  // wording names a control that is never on screen in these plans.
  assert.equal(
    descriptions.includes(
      "@assertion the Microsoft 365 Copilot message input is visible and its placeholder text starts with Message ${{var:app_name}}.",
    ),
    true,
  );
  assert.equal(
    descriptions.some((description) => description.includes("Message Copilot")),
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
    assert.match(step.description, /in the "ACCOUNTS" section$/);
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
