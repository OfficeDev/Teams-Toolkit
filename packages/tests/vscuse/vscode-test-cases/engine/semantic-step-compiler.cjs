const { createHash } = require("node:crypto");
const path = require("node:path");

const { renderComponent } = require("./render-component.cjs");

const componentRoot = path.join(__dirname, "..", "components");
const appNameExpressionPattern =
  /^\$\{\{var:app_name:[A-Za-z0-9][A-Za-z0-9_#-]*\}\}$/;
const environmentExpressionPattern = /^\$\{\{env:([A-Z_a-z][A-Z_a-z0-9]*)\}\}$/;
const secretExpressionPattern = /^\$\{\{secret:[A-Z_a-z][A-Z_a-z0-9]*\}\}$/;
const relativePathPattern =
  /^(?!\/)(?![A-Za-z]:)(?!.*(?:^|\/)\.\.(?:\/|$))[^\\]+$/;
const localEnvironmentNamePattern = /^[A-Z][A-Z0-9_]*$/;
const localEnvironmentValuePattern = /^[A-Za-z0-9:/._-]*$/;
const runnerPlaceholderPattern = /\$\{\{[a-z]+:[A-Za-z0-9_:#-]+\}\}/g;
const provisionInputGroups = new Set(["apiKey", "arm", "oauth"]);
const provisionEnvironmentInput = "environment";
const provisionEnvironmentSkipValue = "none";

const commandTitles = {
  clearNotifications: "Notifications: Clear All Notifications",
  create: "Microsoft 365 Agents: Create New Agent/App",
  deploy: "Microsoft 365 Agents: Deploy",
  // The toolkit contributes one side bar view per section and VS Code generates
  // one focus command per view, so which focus commands exist depends on
  // `fx-extension.isTeamsFx`. The empty workspace a case starts in shows only
  // the `Microsoft 365 Agents Toolkit` welcome view, and the window scaffolding
  // opens hides that view and shows Accounts, Environment, Development,
  // Lifecycle, Utility, and Help and feedback instead. Neither title resolves in
  // the other window.
  focusToolkitView:
    "Microsoft 365 Agents Toolkit: Focus on Microsoft 365 Agents Toolkit View",
  notifications: "Notifications: Show Notifications",
  provision: "Microsoft 365 Agents: Provision",
  // VS Code generates one show command per view container, so this title exists
  // in both windows, and the container renders every view the current
  // `fx-extension.isTeamsFx` value allows, ACCOUNTS first.
  showToolkit: "View: Show Microsoft 365 Agents Toolkit",
  target: "Debug: Select and Start Debugging",
};

// Every toolkit sign-in runs through the same Microsoft identity endpoint in
// the same browser profile, so the first sign-in of a plan lands on the email
// form while a later one lands on the Pick an account page that lists the
// account the earlier sign-in left behind. Those are different pages, not the
// same page with an extra step: the email field is not where the first page put
// it, and Next moves too. Each entry state therefore gets its own component.
const accountAdapters = {
  azure: {
    accountVariable: "AZURE_ACCOUNT_NAME",
    component: "authentication/azure/sign-in.json.tpl",
  },
  m365: {
    accountVariable: "M365_ACCOUNT_NAME",
    component: "authentication/m365/sign-in.json.tpl",
    returningComponent:
      "authentication/m365/sign-in-from-account-picker.json.tpl",
  },
};

const defaultFolderOption = {
  component: "quick-input/confirm-option.json.tpl",
  label: "Default folder",
  preconditions: [
    "dhash:364:74:16:5:08056a9a5d5516b6",
    "dhash:364:74:96:5:44232286e2168e01",
    "dhash:364:74:0:10:f0b09494b2717075",
  ],
};

// Creating a Python virtual environment is a Python extension flow, not a
// toolkit flow, so its literals live next to the semantic step that drives it.
const pythonEnvironment = {
  commandTitle: "Python: Create Environment...",
  dependenciesTitle: "Select dependencies to install",
  environmentTypeLabel: "Venv",
  successText: "The following environment is selected:",
  successTimeout: "300",
};

const scaffoldQuestionAdapters = {
  actionSource: {
    options: {
      mcp: "Start with a MCP server",
      "new-api": "Start with a New API",
      openapi: "Start with an OpenAPI Description Document",
    },
    title: "Create an Action",
    type: "singleSelect",
  },
  appName: { title: "Application Name", type: "text" },
  apiAuth: {
    options: { none: "None" },
    title: "Authentication Type",
    type: "singleSelect",
  },
  apiOperations: {
    title: "Select Operation(s) Copilot Can Interact with",
    type: "multiSelect",
  },
  apiSpecLocation: { title: "OpenAPI Document", type: "text" },
  authType: {
    options: {
      "entra-sso": "Entra SSO",
      none: "None",
      oauth: "OAuth (with static registration)",
    },
    title: "Select Authentication Type",
    type: "singleSelect",
  },
  azureOpenAIDeploymentName: {
    title: "Azure OpenAI Deployment Name",
    type: "text",
  },
  azureOpenAIEndpoint: { title: "Azure OpenAI Endpoint", type: "text" },
  azureOpenAIKey: { secret: true, title: "Azure OpenAI Key", type: "text" },
  customEngineAgent: {
    options: {
      "basic-custom-engine-agent": "Basic Custom Engine Agent",
      "weather-agent": "Weather Agent",
    },
    title: "App Features Using Microsoft 365 Agents SDK",
    type: "singleSelect",
  },
  daTemplate: {
    options: { "add-action": "Add an Action", "no-action": "No Action" },
    title: "Create Declarative Agent",
    type: "singleSelect",
  },
  language: {
    options: {
      javascript: "JavaScript",
      python: "Python",
      typescript: "TypeScript",
    },
    title: "Programming Language",
    type: "singleSelect",
  },
  llmService: {
    options: {
      "llm-service-azure-openai": "Azure OpenAI",
      "llm-service-openai": "OpenAI",
    },
    title: "Service for Large Language Model (LLM)",
    type: "singleSelect",
  },
  "mcp-da-client-id": { title: "OAuth Client ID", type: "text" },
  "mcp-da-client-secret": {
    secret: true,
    title: "OAuth Client Secret",
    type: "text",
  },
  "mcp-da-scopes": { title: "OAuth Scopes (optional)", type: "text" },
  mcpServerUrl: { title: "MCP Server URL", type: "text" },
  openAIKey: { secret: true, title: "OpenAI Key", type: "text" },
  openApiSpecType: {
    options: { "enter-url": "Enter OpenAPI Document URL" },
    title: "OpenAPI Spec Document",
    type: "singleSelect",
  },
  projectType: {
    options: {
      "copilot-agent-type": "Declarative Agent",
      "custom-engine-agent-type": "Custom Engine Agent",
      "teams-agent-and-app-type": "Teams Agents and Apps",
    },
    title: "New Project",
    type: "singleSelect",
  },
  teamsAppType: {
    options: {
      "teams-other-app-type": "Other Teams Capabilities",
    },
    title: "Teams Agent or App Using Microsoft Teams SDK",
    type: "singleSelect",
  },
  teamsOtherAppType: {
    options: {
      "default-bot": "Simple Bot",
      "default-message-extension": "Message Extension",
    },
    title: "Teams Capability",
    type: "singleSelect",
  },
  workspaceFolder: {
    options: { default: defaultFolderOption },
    title: "Workspace Folder",
    type: "singleSelect",
  },
};

const provisionArmQuestions = [
  {
    component: "quick-input/single-select.json.tpl",
    key: "targetResourceGroupName",
    title: "Select a resource group",
  },
  {
    component: "quick-input/text.json.tpl",
    key: "newResourceGroupName",
    title: "New resource group name",
  },
  {
    component: "quick-input/single-select.json.tpl",
    key: "newResourceGroupLocation",
    title: "Location for the new resource group",
  },
];

const provisionApiKeyQuestion = {
  component: "quick-input/text.json.tpl",
  title: "Enter API Key in OpenAPI Description Document",
};

const provisionOauthQuestions = [
  {
    component: "quick-input/text.json.tpl",
    key: "clientId",
    title: "Oauth registration client ID",
  },
  {
    component: "quick-input/text.json.tpl",
    key: "clientSecret",
    title: "OAuth registration client secret",
  },
];

const provisionEnvironment = {
  component: "quick-input/click-option.json.tpl",
  optionLabel: "dev",
  preconditions: [
    "dhash:292:77:16:5:0000000000000000",
    "dhash:292:77:96:5:0000c0004020204c",
    "dhash:292:77:0:10:d088222323232421",
  ],
  questionTitle: "Select an environment",
  x: 292,
  y: 77,
};

// Every lifecycle consent is a showMessage(..., modal) call, so it renders as a
// VS Code modal dialog whose only on-screen text is the composed message and
// its buttons. The account lines above this sentence carry the signed-in user
// and subscription, so the assertion names the fixed sentence alone.
const provisionConfirmation = {
  actionLabel: "Provision",
  component: "dialog/click-primary-action.json.tpl",
  dialogTitle:
    "Costs may apply based on usage. Do you want to provision resources in dev environment using listed accounts?",
};

const provisionApiKeyConfirmation = {
  actionLabel: "Confirm",
  component: "dialog/click-primary-action.json.tpl",
  dialogTitle:
    "Microsoft 365 Agents Toolkit will upload the API key to Developer Portal. The API key will be used by Teams client to securely access your API in runtime. Microsoft 365 Agents Toolkit will not store your API key.",
};

const provisionOauthConfirmation = {
  actionLabel: "Confirm",
  component: "dialog/click-primary-action.json.tpl",
  dialogTitle:
    "Microsoft 365 Agents Toolkit uploads the client ID/Secret for OAuth Registration to Developer Portal. It is used by Teams client to securely access your API at runtime. Microsoft 365 Agents Toolkit doesn't store your client ID/Secret.",
};

// Both stages wait on an Azure control plane rather than on the toolkit: the
// provision stage watches an ARM deployment create the hosting plan, the web
// app, and the bot registration, and the deploy stage builds the project and
// uploads the package to that web app. Either can outlast the five minutes the
// hand-recorded plans allowed, and the wait is only ever paid in full when the
// stage never reports success.
const lifecycleAdapters = {
  deploy: {
    confirmation: {
      actionLabel: "Deploy",
      component: "dialog/click-primary-action.json.tpl",
      dialogTitle: "Do you want to deploy resources in dev environment?",
    },
    successText: "actions in deploy stage executed successfully",
    successTimeout: "900",
  },
  provision: {
    successText: "provision stage executed successfully",
    successTimeout: "900",
  },
};

// A readiness subject only has to show that the app on screen is the one this
// case scaffolded, so it names the app by the unique prefix the case authored
// and tolerates whatever the product appends. Manifests compose their name as
// `{{appName}}${{APP_NAME_SUFFIX}}`, but not every template appends the suffix
// and the previewed environment decides its value, so asserting the fully
// composed name makes readiness fail on naming detail that the post-scaffold
// file checks already assert exactly, and against the real manifest rather than
// against a screenshot.
//
// `profileSelections` lists the picker positions an adapter supports, and the
// case declares which one it means. Every profile below is reached from the
// first filtered result, because VS Code orders the launch picker by each
// configuration's `presentation.group` and `presentation.order` and the
// templates give the intended profile the earliest position among the entries
// its own title matches. The declarative-agent templates are the exception:
// they publish `Preview Local in Copilot (Chrome)` as a compound in group `all`
// and `Preview in Copilot (Chrome)` as a configuration in group `remote`, and
// the local title contains the remote one as a subsequence, so filtering on the
// remote title lists the local compound first.
const targetAdapters = {
  // Every Chrome launch configuration the templates ship omits `userDataDir`, so
  // js-debug hands the session a profile of its own that carries no Microsoft 365
  // session and the browser always has to sign in. Which page it opens on is
  // decided by the launch URL: the Teams targets carry the toolkit's
  // `${account-hint}`, which resolves to a `login_hint` and asks straight for the
  // password of the account already signed in to Visual Studio Code.
  "Launch Remote in Teams (Chrome)": {
    browserAuthentication: {
      component: "authentication/browser/m365-password-sign-in.json.tpl",
      credentials: "m365",
    },
    host: "teams",
    open: { adapter: "teams-add", destination: "chat", kind: "app" },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
    },
    readySubject:
      "the Microsoft Teams app details page for an app whose name starts with ${{var:app_name}} is visible",
    requires: ["login:azure", "login:m365", "provision", "deploy"],
  },
  // The v4 TypeScript Bot and Message Extension templates title the same
  // remote Teams launch `View Remote App in Teams (Chrome)`.
  "View Remote App in Teams (Chrome)": {
    browserAuthentication: {
      component: "authentication/browser/m365-password-sign-in.json.tpl",
      credentials: "m365",
    },
    host: "teams",
    open: { adapter: "teams-add", destination: "chat", kind: "app" },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
    },
    readySubject:
      "the Microsoft Teams app details page for an app whose name starts with ${{var:app_name}} is visible",
    requires: ["login:azure", "login:m365", "provision", "deploy"],
  },
  // The Python templates name the same remote Teams launch `Launch Remote
  // (Chrome)`, without the `in Teams` the TypeScript and JavaScript templates
  // use. It reaches the same Teams app details page, so it reuses that adapter's
  // open transition and readiness subject.
  "Launch Remote (Chrome)": {
    browserAuthentication: {
      component: "authentication/browser/m365-password-sign-in.json.tpl",
      credentials: "m365",
    },
    host: "teams",
    open: { adapter: "teams-add", destination: "chat", kind: "app" },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
    },
    readySubject:
      "the Microsoft Teams app details page for an app whose name starts with ${{var:app_name}} is visible",
    requires: ["login:azure", "login:m365", "provision", "deploy"],
  },
  "Preview in Copilot (Chrome)": {
    browserAuthentication: {
      component: "authentication/browser/m365-sign-in.json.tpl",
      credentials: "m365",
    },
    host: "copilot",
    open: { adapter: "ready", destination: "chat", kind: "agent" },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
      second: {
        component: "quick-input/filter-second-option.json.tpl",
        initialOptionLabel: "Preview Local in Copilot (Chrome)",
      },
    },
    readySubject:
      "an agent whose name starts with ${{var:app_name}} is displayed in the main section of Microsoft 365 Copilot",
    requires: ["login:m365", "provision"],
  },
  // A custom engine agent is hosted on Azure, so its Copilot preview needs the
  // deployed bot behind it. The declarative-agent preview above needs only
  // provision, because the toolkit uploads the agent definition itself.
  "(Preview) Launch Remote in Copilot (Chrome)": {
    browserAuthentication: {
      component: "authentication/browser/m365-sign-in.json.tpl",
      credentials: "m365",
    },
    host: "copilot",
    open: { adapter: "ready", destination: "chat", kind: "agent" },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
    },
    readySubject:
      "an agent whose name starts with ${{var:app_name}} is displayed in the main section of Microsoft 365 Copilot",
    requires: ["login:azure", "login:m365", "provision", "deploy"],
  },
  // The local debug profiles below carry a preLaunchTask chain that validates
  // prerequisites, registers the app, starts the tunnel, and runs the local
  // lifecycle before the application starts, so they require no authored
  // provision or deploy. They reach the same surfaces the remote profiles reach,
  // so they reuse those readiness subjects; the subjects name the app by the
  // prefix the case authored, which holds for the `local` suffix as it does for
  // `dev`.
  "Debug in Teams (Chrome)": {
    browserAuthentication: {
      component: "authentication/browser/m365-password-sign-in.json.tpl",
      credentials: "m365",
    },
    host: "teams",
    open: { adapter: "teams-add", destination: "chat", kind: "app" },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
    },
    readySubject:
      "the Microsoft Teams app details page for an app whose name starts with ${{var:app_name}} is visible",
    requires: ["login:m365"],
  },
  "(Preview) Debug in Copilot (Chrome)": {
    browserAuthentication: {
      component: "authentication/browser/m365-sign-in.json.tpl",
      credentials: "m365",
    },
    host: "copilot",
    open: { adapter: "ready", destination: "chat", kind: "agent" },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
    },
    readySubject:
      "an agent whose name starts with ${{var:app_name}} is displayed in the main section of Microsoft 365 Copilot",
    requires: ["login:m365"],
  },
  // The Agents Playground hosts the agent on the local machine and talks to it
  // over the local bot endpoint, so nothing in this target authenticates against
  // Microsoft 365 and no account has to be signed in first.
  "Debug in Microsoft 365 Agents Playground": {
    host: "playground",
    open: { adapter: "ready", destination: "chat", kind: "app" },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
    },
    readySubject:
      "the Microsoft 365 Agents Playground page is open in the browser",
    requires: [],
  },
};

function failure(code, message) {
  return { ok: false, diagnostics: [{ code, message }] };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyFields(value, allowedFields) {
  return Object.keys(value).every((field) => allowedFields.has(field));
}

function isConfirmOption(option) {
  return (
    isRecord(option) &&
    hasOnlyFields(option, new Set(["component", "label", "preconditions"])) &&
    option.component === "quick-input/confirm-option.json.tpl" &&
    typeof option.label === "string" &&
    Array.isArray(option.preconditions) &&
    option.preconditions.every(
      (precondition) => typeof precondition === "string",
    )
  );
}

function createSuffix(caseId, occurrence, componentIndex) {
  const hash = createHash("sha256").update(caseId).digest("hex").slice(0, 8);
  return `c${hash}_${occurrence}_${componentIndex}`;
}

function createSemanticStepCompiler() {
  const states = new Map();

  function render(state, relativePath, values = {}) {
    state.componentIndex += 1;
    const rendered = renderComponent({
      componentRoot,
      relativePath,
      values: {
        instanceSuffix: createSuffix(
          state.caseId,
          state.occurrence,
          state.componentIndex,
        ),
        ...values,
      },
    });
    if (!rendered.ok) {
      return rendered;
    }
    if (state.lastStepId !== undefined && rendered.value.length > 0) {
      rendered.value[0].depends_on = [state.lastStepId];
    }
    if (rendered.value.length > 0) {
      state.lastStepId = rendered.value.at(-1).step_id;
    }
    return rendered;
  }

  function append(output, rendered) {
    if (!rendered.ok) {
      return rendered;
    }
    output.push(...rendered.value);
    return undefined;
  }

  function compileScaffold(state, definition) {
    const output = [];
    let error = append(
      output,
      render(state, "initialization/close-welcome-overlay.json.tpl"),
    );
    if (error) return error;
    // Activating the toolkit opens a walkthrough, which VS Code renders in a
    // tab labeled Welcome. That tab keeps keyboard focus and swallows the text
    // typed into the first scaffold quick pick.
    // Focusing the toolkit view first parks focus on a tree view instead.
    error = append(
      output,
      render(state, "command-palette/execute-command.json.tpl", {
        commandTitle: commandTitles.focusToolkitView,
      }),
    );
    if (error) return error;
    // The Welcome editor can still open after the focus command returns, so
    // wait for it to settle before closing it.
    error = append(
      output,
      render(state, "initialization/assert-toolkit-view-settled.json.tpl"),
    );
    if (error) return error;
    // The toolkit sets `ignoreFocusOut` on every quick pick it opens, so one
    // that loses keyboard focus stays on screen instead of dismissing itself.
    // Leaving the Welcome editor open lets it reclaim focus while the create
    // command opens its first quick pick, which then passes its prompt assertion
    // but sends the filter keystrokes to the editor, so close the editor instead
    // of racing it.
    error = append(
      output,
      render(state, "initialization/close-get-started-editor.json.tpl"),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "command-palette/execute-command.json.tpl", {
        commandTitle: commandTitles.create,
      }),
    );
    if (error) return error;

    const answerState = {};
    for (const answer of definition.with.answers) {
      const question = scaffoldQuestionAdapters[answer.question];
      if (question === undefined) {
        return failure(
          "VCB_SCAFFOLD_QUESTION_UNKNOWN",
          "The scaffold answer question is not supported.",
        );
      }
      if (Object.hasOwn(answerState, answer.question)) {
        return failure(
          "VCB_SCAFFOLD_QUESTION_DUPLICATE",
          "A scaffold answer question is duplicated.",
        );
      }
      const answerType = answer.type ?? "singleSelect";
      if (answerType !== question.type || typeof answer.value !== "string") {
        return failure(
          "VCB_SCAFFOLD_ANSWER_TYPE",
          "A scaffold answer does not match its supported question type.",
        );
      }
      // The multi-select component checks every option through the prompt's own
      // select-all control, so it never filters the list and never depends on
      // an option's position. The option set a prompt renders comes from the
      // resource the earlier answers pointed at, not from this file, so `all`
      // is the only selection the compiler can name.
      if (answerType === "multiSelect" && answer.value !== "all") {
        return failure(
          "VCB_SCAFFOLD_MULTI_SELECT_ALL_REQUIRED",
          "A multi-select answer must be all.",
        );
      }
      if (
        question.secret === true &&
        !secretExpressionPattern.test(answer.value)
      ) {
        return failure(
          "VCB_SECRET_EXPRESSION_REQUIRED",
          "A secret answer must use a secret expression.",
        );
      }
      if (
        answer.question === "appName" &&
        !appNameExpressionPattern.test(answer.value)
      ) {
        return failure(
          "VCB_APP_NAME_EXPRESSION_REQUIRED",
          "The app name must use a safe app_name initializer expression.",
        );
      }

      const questionTitle =
        answer.question === "mcp-da-client-id" &&
        answerState.authType === "entra-sso"
          ? "Microsoft Entra Application (Client) ID"
          : question.title;
      answerState[answer.question] = answer.value;
      if (question.type === "singleSelect") {
        const option = question.options[answer.value];
        if (option === undefined) {
          return failure(
            "VCB_SCAFFOLD_OPTION_UNKNOWN",
            "The scaffold answer option is not supported.",
          );
        }
        if (typeof option === "string") {
          error = append(
            output,
            render(state, "quick-input/single-select.json.tpl", {
              optionLabel: option,
              questionTitle,
            }),
          );
        } else if (isConfirmOption(option)) {
          error = append(
            output,
            render(state, option.component, {
              optionLabel: option.label,
              preconditions: option.preconditions,
              questionTitle,
            }),
          );
        } else {
          return failure(
            "VCB_SCAFFOLD_OPTION_INVALID",
            "The scaffold option adapter is invalid.",
          );
        }
      } else if (question.type === "multiSelect") {
        error = append(
          output,
          render(state, "quick-input/multi-select.json.tpl", {
            questionTitle,
          }),
        );
      } else {
        error = append(
          output,
          render(state, "quick-input/text.json.tpl", {
            inputValue: answer.value,
            questionTitle,
          }),
        );
      }
      if (error) return error;
    }
    if (!Object.hasOwn(answerState, "appName")) {
      return failure(
        "VCB_APP_NAME_EXPRESSION_REQUIRED",
        "The scaffold must initialize app_name.",
      );
    }
    // The last answer starts project creation, which reopens the workspace in a
    // new window whose extension host has to start the toolkit again. Every
    // later operation drives toolkit-contributed UI, and the toolkit registers
    // that UI only once activation sets `fx-extension.isTeamsFx`, so scaffolding
    // ends by waiting for the README preview the toolkit opens for a freshly
    // created project. Nothing else in the reopened window proves activation:
    // the post-scaffold file checks read the workspace directly, and a command
    // the Command Palette has already filtered does not appear when it
    // registers late.
    error = append(
      output,
      render(state, "initialization/assert-project-window-ready.json.tpl", {}),
    );
    if (error) return error;
    state.template = definition.with.template;
    return { ok: true, value: output };
  }

  function compileLogin(state, definition) {
    const accountMatch = environmentExpressionPattern.exec(
      definition.with?.account ?? "",
    );
    if (
      accountMatch === null ||
      !secretExpressionPattern.test(definition.with?.password ?? "")
    ) {
      return failure(
        "VCB_ACCOUNT_EXPRESSION_REQUIRED",
        "Login credentials must use environment and secret expressions.",
      );
    }
    const account = accountAdapters[definition.with?.type];
    if (account === undefined || account.accountVariable !== accountMatch[1]) {
      return failure(
        "VCB_ACCOUNT_UNKNOWN",
        "The login account is not supported by the semantic adapter.",
      );
    }

    const output = [];
    // Scaffolding reopens the workspace in a new window whose side bar defaults
    // to the Explorer, so the toolkit view container that owns the ACCOUNTS
    // section is not showing. Show the container and let the account components
    // click the sign-in entry the ACCOUNTS section renders. The Command Palette
    // cannot reach `Microsoft 365 Agents: Accounts`: VS Code generates
    // `Microsoft 365 Agents Toolkit: Focus on Accounts View` from the ACCOUNTS
    // view, every word of the account command's title is also a word of that
    // generated title in the same order, so no filter text separates them, and
    // which of the two the palette highlights moves with the palette's recently
    // used list. The container title carries no word that would collide here,
    // and the ACCOUNTS section it reveals labels its own entries, so the
    // account components can name what they click.
    let error = append(
      output,
      render(state, "command-palette/execute-command.json.tpl", {
        commandTitle: commandTitles.showToolkit,
      }),
    );
    if (error) return error;
    const signedInBefore = state.credentials.size > 0;
    if (signedInBefore && account.returningComponent === undefined) {
      return failure(
        "VCB_ACCOUNT_PICKER_UNSUPPORTED",
        "The login account has no recorded sign-in for the account picker a previous login leaves behind.",
      );
    }
    error = append(
      output,
      render(
        state,
        signedInBefore ? account.returningComponent : account.component,
        {
          accountName: definition.with.account,
          accountPassword: definition.with.password,
        },
      ),
    );
    if (error) return error;
    state.credentials.set(definition.with.type, {
      accountName: definition.with.account,
      accountPassword: definition.with.password,
    });
    state.completed.add(`login:${definition.with.type}`);
    return { ok: true, value: output };
  }

  // The toolkit selects the environment in the same middleware for every
  // lifecycle command, so `provision` and `deploy` share one input contract.
  function validateEnvironmentInput(definition) {
    const declared = definition.with ?? {};
    if (!isRecord(declared)) {
      return failure(
        "VCB_LIFECYCLE_INPUT_UNKNOWN",
        "The lifecycle operation contains an unsupported input.",
      );
    }
    const { [provisionEnvironmentInput]: environment, ...inputs } = declared;
    if (
      environment !== undefined &&
      environment !== provisionEnvironmentSkipValue
    ) {
      return failure(
        "VCB_LIFECYCLE_INPUT_UNKNOWN",
        `The lifecycle environment input supports only "${provisionEnvironmentSkipValue}".`,
      );
    }
    return {
      ok: true,
      value: {
        inputs,
        selectsEnvironment: environment !== provisionEnvironmentSkipValue,
      },
    };
  }

  function validateProvisionInputs(state, definition) {
    const environment = validateEnvironmentInput(definition);
    if (!environment.ok) return environment;
    const groups = validateProvisionInputGroups(
      state,
      environment.value.inputs,
    );
    if (!groups.ok) return groups;
    return {
      ok: true,
      value: {
        ...groups.value,
        selectsEnvironment: environment.value.selectsEnvironment,
      },
    };
  }

  function validateProvisionInputGroups(state, inputs) {
    if (Object.keys(inputs).some((key) => !provisionInputGroups.has(key))) {
      return failure(
        "VCB_PROVISION_INPUT_UNKNOWN",
        "The provision operation contains an unsupported input.",
      );
    }
    const activeInputGroups = Object.keys(inputs);
    if (activeInputGroups.length > 1) {
      return failure(
        "VCB_PROVISION_INPUT_UNKNOWN",
        "The provision operation must declare at most one input group.",
      );
    }
    if (
      (inputs.apiKey !== undefined || inputs.oauth !== undefined) &&
      state.template !== "da/api-plugin-from-existing-api"
    ) {
      return failure(
        "VCB_PROVISION_INPUT_REDUNDANT",
        "The provision operation declares an input that is not prompted.",
      );
    }
    if (inputs.apiKey !== undefined) {
      if (
        typeof inputs.apiKey !== "string" ||
        !secretExpressionPattern.test(inputs.apiKey)
      ) {
        return failure(
          "VCB_SECRET_EXPRESSION_REQUIRED",
          "The API key provision input must use a secret expression.",
        );
      }
      const questions = [{ ...provisionApiKeyQuestion, value: inputs.apiKey }];
      return {
        ok: true,
        value: {
          confirmation: provisionApiKeyConfirmation,
          questions,
        },
      };
    }
    if (inputs.oauth !== undefined) {
      const expectedKeys = new Set(
        provisionOauthQuestions.map((question) => question.key),
      );
      if (
        !isRecord(inputs.oauth) ||
        Object.keys(inputs.oauth).some((key) => !expectedKeys.has(key))
      ) {
        return failure(
          "VCB_PROVISION_INPUT_UNKNOWN",
          "The OAuth provision operation does not match its supported input set.",
        );
      }
      if (
        !environmentExpressionPattern.test(inputs.oauth.clientId ?? "") ||
        !secretExpressionPattern.test(inputs.oauth.clientSecret ?? "")
      ) {
        return failure(
          "VCB_ACCOUNT_EXPRESSION_REQUIRED",
          "OAuth provision credentials must use environment and secret expressions.",
        );
      }
      const questions = provisionOauthQuestions.map((question) => ({
        ...question,
        value: inputs.oauth[question.key],
      }));
      return {
        ok: true,
        value: {
          confirmation: provisionOauthConfirmation,
          questions,
        },
      };
    }
    if (inputs.arm === undefined) {
      return {
        ok: true,
        value: {
          confirmation: undefined,
          questions: [],
        },
      };
    }
    if (!state.completed.has("login:azure")) {
      return failure(
        "VCB_PROVISION_PREREQUISITE",
        "ARM provision requires a preceding Azure login.",
      );
    }
    const expectedKeys = new Set(
      provisionArmQuestions.map((question) => question.key),
    );
    if (
      !isRecord(inputs.arm) ||
      Object.keys(inputs.arm).some((key) => !expectedKeys.has(key))
    ) {
      return failure(
        "VCB_PROVISION_INPUT_UNKNOWN",
        "The provision operation does not match its supported input set.",
      );
    }
    return {
      ok: true,
      value: {
        confirmation: provisionConfirmation,
        questions: provisionArmQuestions.map((question) => ({
          ...question,
          value: inputs.arm[question.key],
        })),
      },
    };
  }

  function renderProvisionQuestions(state, questions, output) {
    for (const question of questions) {
      const { value } = question;
      if (typeof value !== "string") {
        return failure(
          "VCB_PROVISION_INPUT_REQUIRED",
          "The provision operation is missing a required input.",
        );
      }
      const values = question.component.endsWith("single-select.json.tpl")
        ? { optionLabel: value, questionTitle: question.title }
        : { inputValue: value, questionTitle: question.title };
      const error = append(output, render(state, question.component, values));
      if (error) return error;
    }
    return { ok: true };
  }

  function compilePythonEnvironment(state, definition) {
    const inputs = definition.with ?? {};
    if (
      !isRecord(inputs) ||
      !hasOnlyFields(inputs, new Set(["interpreter"])) ||
      typeof inputs.interpreter !== "string" ||
      inputs.interpreter.length === 0
    ) {
      return failure(
        "VCB_PYTHON_ENVIRONMENT_INPUT_INVALID",
        "The Python environment operation requires an interpreter label.",
      );
    }
    const output = [];
    let error = append(
      output,
      render(state, "command-palette/execute-command.json.tpl", {
        commandTitle: pythonEnvironment.commandTitle,
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/filter-option.json.tpl", {
        optionLabel: pythonEnvironment.environmentTypeLabel,
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/filter-option.json.tpl", {
        optionLabel: inputs.interpreter,
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/multi-select.json.tpl", {
        questionTitle: pythonEnvironment.dependenciesTitle,
      }),
    );
    if (error) return error;
    // Creating the virtual environment and installing the requirements it
    // declares takes minutes, and the notification the Python extension raises
    // when it finishes is the only visible completion signal, so the
    // notification center is opened before the assertion waits on it.
    error = append(
      output,
      render(state, "command-palette/execute-command.json.tpl", {
        commandTitle: commandTitles.notifications,
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "notifications/assert-contains.json.tpl", {
        notificationText: pythonEnvironment.successText,
        retryTimeout: pythonEnvironment.successTimeout,
      }),
    );
    if (error) return error;
    state.completed.add("pythonEnvironment");
    return { ok: true, value: output };
  }

  function compileLocalEnvironment(state, definition) {
    const inputs = definition.with ?? {};
    const names = isRecord(inputs) ? Object.keys(inputs).sort() : [];
    if (
      !isRecord(inputs) ||
      names.length === 0 ||
      names.some(
        (name) =>
          !localEnvironmentNamePattern.test(name) ||
          typeof inputs[name] !== "string" ||
          inputs[name].length === 0 ||
          // The runner resolves its own placeholders before the shell sees the
          // value, so they are stripped before the shell-safety check.
          !localEnvironmentValuePattern.test(
            inputs[name].replaceAll(runnerPlaceholderPattern, ""),
          ),
      )
    ) {
      return failure(
        "VCB_LOCAL_ENVIRONMENT_INPUT_INVALID",
        "The local environment operation requires shell-safe variable names and values.",
      );
    }
    const output = [];
    for (const name of names) {
      const error = append(
        output,
        render(state, "workspace/local-environment-variable.json.tpl", {
          variableName: name,
          variableValue: inputs[name],
        }),
      );
      if (error) return error;
    }
    return { ok: true, value: output };
  }

  function compileLifecycle(state, definition) {
    const recipe = lifecycleAdapters[definition.type];
    let confirmation = recipe.confirmation;
    const output = [];
    // The notification center keeps every notification the run has raised, so
    // the assertion that waits for this operation's success would read it out of
    // a list that also holds the scaffolding, sign-in, and earlier lifecycle
    // entries.
    let error = append(
      output,
      render(state, "command-palette/execute-command.json.tpl", {
        commandTitle: commandTitles.clearNotifications,
      }),
    );
    if (error) return error;
    // VS Code closes the Command Palette as soon as the window loses focus, and
    // a running lifecycle operation opens browser windows of its own, so the
    // notification center is opened before the operation starts.
    error = append(
      output,
      render(state, "command-palette/execute-command.json.tpl", {
        commandTitle: commandTitles.notifications,
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "command-palette/execute-command.json.tpl", {
        commandTitle: commandTitles[definition.type],
      }),
    );
    if (error) return error;
    let questions = [];
    let selectsEnvironment;
    if (definition.type === "provision") {
      const provision = validateProvisionInputs(state, definition);
      if (!provision.ok) return provision;
      confirmation = provision.value.confirmation;
      questions = provision.value.questions;
      selectsEnvironment = provision.value.selectsEnvironment;
    } else {
      const environment = validateEnvironmentInput(definition);
      if (!environment.ok) return environment;
      if (Object.keys(environment.value.inputs).length > 0) {
        return failure(
          "VCB_LIFECYCLE_INPUT_UNKNOWN",
          "The lifecycle operation contains an unsupported input.",
        );
      }
      selectsEnvironment = environment.value.selectsEnvironment;
    }

    // The toolkit resolves the environment in the middleware that wraps every
    // lifecycle command, before the command body asks any of its own questions,
    // so the picker always precedes the operation-owned prompts.
    if (selectsEnvironment) {
      const { component, ...environmentValues } = provisionEnvironment;
      error = append(output, render(state, component, environmentValues));
      if (error) return error;
    }
    const renderedQuestions = renderProvisionQuestions(
      state,
      questions,
      output,
    );
    if (!renderedQuestions.ok) return renderedQuestions;

    if (confirmation !== undefined) {
      const { component, ...confirmationValues } = confirmation;
      error = append(output, render(state, component, confirmationValues));
      if (error) return error;
    }
    error = append(
      output,
      render(state, "notifications/assert-contains.json.tpl", {
        notificationText: recipe.successText,
        retryTimeout: recipe.successTimeout,
      }),
    );
    if (error) return error;
    state.completed.add(definition.type);
    return { ok: true, value: output };
  }

  function compileTarget(state, definition) {
    const profileTitle = definition.with?.profile;
    const profile = targetAdapters[profileTitle];
    if (profile === undefined) {
      return failure(
        "VCB_TARGET_PROFILE_UNKNOWN",
        "The launch profile is not supported by the semantic adapter.",
      );
    }
    const missingPrerequisite = profile.requires.find(
      (requirement) => !state.completed.has(requirement),
    );
    if (missingPrerequisite !== undefined) {
      return failure(
        "VCB_TARGET_PREREQUISITE",
        "The target is missing a required preceding operation.",
      );
    }

    const output = [];
    let error = append(
      output,
      render(state, "command-palette/execute-command.json.tpl", {
        commandTitle: commandTitles.target,
      }),
    );
    if (error) return error;
    const profileSelectionId = definition.with?.profileSelection;
    if (profileSelectionId === undefined) {
      return failure(
        "VCB_TARGET_PROFILE_SELECTION_REQUIRED",
        "The target must declare which filtered launch profile to select.",
      );
    }
    if (
      typeof profileSelectionId !== "string" ||
      !Object.hasOwn(profile.profileSelections, profileSelectionId)
    ) {
      return failure(
        "VCB_TARGET_PROFILE_SELECTION_UNKNOWN",
        "The target profile selection is not supported by the semantic adapter.",
      );
    }
    const profileSelection = profile.profileSelections[profileSelectionId];
    const { component, ...profileSelectionValues } = profileSelection;
    error = append(
      output,
      render(state, component, {
        optionLabel: profileTitle,
        ...profileSelectionValues,
      }),
    );
    if (error) return error;
    if (profile.browserAuthentication !== undefined) {
      const credentials = state.credentials.get(
        profile.browserAuthentication.credentials,
      );
      if (credentials === undefined) {
        return failure(
          "VCB_TARGET_BROWSER_AUTH_REQUIRED",
          "The target browser authentication credentials are unavailable.",
        );
      }
      error = append(
        output,
        render(state, profile.browserAuthentication.component, credentials),
      );
      if (error) return error;
    }
    error = append(
      output,
      render(state, "browser/assert-ready.json.tpl", {
        readySubject: profile.readySubject,
      }),
    );
    if (error) return error;
    if (profile.host === "copilot") {
      error = append(output, render(state, "browser/zoom-out.json.tpl", {}));
      if (error) return error;
    }
    state.profile = profile;
    state.completed.add("target");
    return error ?? { ok: true, value: output };
  }

  function compileOpen(state, definition) {
    if (
      state.profile === undefined ||
      state.profile.open === undefined ||
      definition.with?.destination !== state.profile.open.destination ||
      definition.with?.kind !== state.profile.open.kind
    ) {
      return failure(
        "VCB_OPEN_ADAPTER_UNKNOWN",
        "The authored open operation has no compatible target adapter.",
      );
    }
    let rendered;
    if (state.profile.open.adapter === "teams-add") {
      // The component carries its own converged subject rather than the
      // profile's: the target asserts the app details page this component
      // enters on, and the two clicks in between leave it.
      rendered = render(state, "browser/teams/add-and-open-app.json.tpl", {});
    } else if (state.profile.open.adapter === "ready") {
      // The target already converged on this destination and asserted this
      // profile's readiness subject with nothing in between, so rendering the
      // same component again would only repeat a claim that cannot fail on its
      // own. The operation still earns its place by declaring which destination
      // and kind the case chats in, which the check above rejects when the
      // profile cannot reach it.
      rendered = { ok: true, value: [] };
    } else {
      return failure(
        "VCB_OPEN_ADAPTER_UNKNOWN",
        "The target does not register an open adapter.",
      );
    }
    if (rendered.ok) {
      state.completed.add(`${state.profile.open.destination}-ready`);
    }
    return rendered;
  }

  function normalizeFileAssertion(assertion) {
    const expected = assertion.expect ?? {};
    const exists = expected.exists ?? true;
    const contains = expected.contains ?? [];
    const notContains = expected.notContains ?? [];
    if (
      typeof assertion.path !== "string" ||
      !relativePathPattern.test(assertion.path) ||
      typeof exists !== "boolean" ||
      !Array.isArray(contains) ||
      contains.some((value) => typeof value !== "string") ||
      !Array.isArray(notContains) ||
      notContains.some((value) => typeof value !== "string") ||
      (exists === false && (contains.length > 0 || notContains.length > 0))
    ) {
      return undefined;
    }
    const replaceAppName = (value) =>
      value.replaceAll("${{var:app_name}}", "__VSCUSE_APP_NAME__");
    return {
      path: assertion.path,
      exists,
      contains: contains.map(replaceAppName),
      notContains: notContains.map(replaceAppName),
    };
  }

  function compileFileCheck(state, assertion) {
    const normalized = normalizeFileAssertion(assertion);
    if (normalized === undefined) {
      return failure(
        "VCB_FILE_ASSERTION_INVALID",
        "A workspace file assertion is invalid.",
      );
    }
    const assertionsBase64 = Buffer.from(
      JSON.stringify([normalized]),
      "utf8",
    ).toString("base64");
    return render(state, "checks/workspace-file.json.tpl", {
      assertionsBase64,
    });
  }

  function compileChatCheck(state, assertion) {
    const sendComponents = {
      copilot: "browser/copilot/send-message.json.tpl",
      playground: "browser/playground/send-message.json.tpl",
      teams: "browser/teams/send-message.json.tpl",
    };
    const sendComponent = sendComponents[state.profile?.host];
    if (
      sendComponent === undefined ||
      !state.completed.has("chat-ready") ||
      typeof assertion.send !== "string"
    ) {
      return failure(
        "VCB_CHAT_ADAPTER_UNKNOWN",
        "The chat check has no compatible message adapter.",
      );
    }

    const output = [];
    let error = append(
      output,
      render(state, sendComponent, { message: assertion.send }),
    );
    if (error) return error;
    if (assertion.allowAction === true) {
      if (state.profile.host !== "copilot") {
        return failure(
          "VCB_CHAT_ACTION_CONSENT_UNKNOWN",
          "Action consent is not supported by the current chat adapter.",
        );
      }
      error = append(
        output,
        render(state, "browser/copilot/allow-action.json.tpl", {}),
      );
      if (error) return error;
    }
    const expected = assertion.expect ?? {};
    if (
      expected.replied === true ||
      expected.contains !== undefined ||
      expected.notContains !== undefined
    ) {
      error = append(
        output,
        render(state, "browser/chat/assert-replied.json.tpl"),
      );
      if (error) return error;
    }
    for (const expectedText of expected.contains ?? []) {
      error = append(
        output,
        render(state, "browser/chat/assert-contains.json.tpl", {
          expectedText,
        }),
      );
      if (error) return error;
    }
    for (const unexpectedText of expected.notContains ?? []) {
      error = append(
        output,
        render(state, "browser/chat/assert-not-contains.json.tpl", {
          unexpectedText,
        }),
      );
      if (error) return error;
    }
    return { ok: true, value: output };
  }

  function compileBrowserCheck(state, assertion) {
    if (!state.completed.has("target")) {
      return failure(
        "VCB_BROWSER_ADAPTER_UNKNOWN",
        "The browser check requires a preceding target operation.",
      );
    }
    return render(state, "browser/assert-element.json.tpl", {
      accessibleName: assertion.expect.name,
      role: assertion.expect.role,
    });
  }

  function validateCheckAssertion(assertion) {
    if (!isRecord(assertion)) {
      return failure(
        "VCB_CHECK_ASSERTION_INVALID",
        "Each check assertion must be a map.",
      );
    }
    const assertionFields =
      assertion.type === "file"
        ? new Set(["type", "path", "expect"])
        : assertion.type === "browser"
          ? new Set(["type", "expect"])
          : assertion.type === "chat"
            ? new Set(["type", "send", "allowAction", "expect"])
            : undefined;
    if (assertionFields === undefined) {
      return failure(
        "VCB_CHECK_ADAPTER_UNKNOWN",
        "The assertion type is not supported by the semantic adapter.",
      );
    }
    if (!hasOnlyFields(assertion, assertionFields)) {
      return failure(
        "VCB_CHECK_FIELD_UNKNOWN",
        "The check assertion contains an unsupported field.",
      );
    }

    // A chat check may omit its expectation when the message only has to reach
    // the agent so that a later assertion can observe the resulting surface.
    const sendOnlyChat =
      assertion.type === "chat" && assertion.expect === undefined;
    const expected = sendOnlyChat ? {} : assertion.expect;
    const expectationFields =
      assertion.type === "file"
        ? new Set(["exists", "contains", "notContains"])
        : assertion.type === "browser"
          ? new Set(["role", "name"])
          : new Set(["replied", "contains", "notContains"]);
    if (!isRecord(expected) || !hasOnlyFields(expected, expectationFields)) {
      return failure(
        "VCB_CHECK_FIELD_UNKNOWN",
        "The check expectation contains an unsupported field.",
      );
    }
    const listFields = ["contains", "notContains"];
    if (
      (!sendOnlyChat && Object.keys(expected).length === 0) ||
      (assertion.type === "browser" &&
        (typeof expected.role !== "string" ||
          expected.role.length === 0 ||
          typeof expected.name !== "string" ||
          expected.name.length === 0)) ||
      listFields.some(
        (field) =>
          expected[field] !== undefined &&
          (!Array.isArray(expected[field]) ||
            expected[field].length === 0 ||
            expected[field].some((value) => typeof value !== "string")),
      ) ||
      (expected.exists !== undefined && typeof expected.exists !== "boolean") ||
      (expected.replied !== undefined &&
        typeof expected.replied !== "boolean") ||
      (assertion.allowAction !== undefined && assertion.allowAction !== true)
    ) {
      return failure(
        "VCB_CHECK_ASSERTION_INVALID",
        "The check expectation is invalid.",
      );
    }
    return { ok: true };
  }

  function compileChecks(state, definition) {
    if (!Array.isArray(definition.with)) {
      return failure(
        "VCB_CHECKS_INVALID",
        "Checks must contain an ordered assertion list.",
      );
    }
    if (
      state.requiresInitialFileCheck &&
      !definition.with.some((assertion) => assertion.type === "file")
    ) {
      return failure(
        "VCB_OPERATION_ORDER",
        "The scaffold operation must be immediately followed by a file check.",
      );
    }
    const output = [];
    for (const assertion of definition.with) {
      const validated = validateCheckAssertion(assertion);
      if (!validated.ok) return validated;
      const result =
        assertion.type === "file"
          ? compileFileCheck(state, assertion)
          : assertion.type === "browser"
            ? compileBrowserCheck(state, assertion)
            : assertion.type === "chat"
              ? compileChatCheck(state, assertion)
              : failure(
                  "VCB_CHECK_ADAPTER_UNKNOWN",
                  "The assertion type is not supported by the semantic adapter.",
                );
      if (!result.ok) return result;
      output.push(...result.value);
    }
    state.requiresInitialFileCheck = false;
    return { ok: true, value: output };
  }

  return ({ caseId, definition, occurrence }) => {
    let state = states.get(caseId);
    if (definition.type === "scaffold") {
      state = {
        caseId,
        completed: new Set(),
        componentIndex: 0,
        credentials: new Map(),
        occurrence,
        requiresInitialFileCheck: true,
      };
      states.set(caseId, state);
    } else if (state === undefined) {
      return failure(
        "VCB_OPERATION_ORDER",
        "The scaffold operation must be compiled first.",
      );
    }
    state.occurrence = occurrence;
    state.componentIndex = 0;
    if (
      definition.type !== "scaffold" &&
      definition.type !== "checks" &&
      state.requiresInitialFileCheck
    ) {
      return failure(
        "VCB_OPERATION_ORDER",
        "The scaffold operation must be immediately followed by a file check.",
      );
    }

    switch (definition.type) {
      case "scaffold":
        return compileScaffold(state, definition);
      case "login":
        return compileLogin(state, definition);
      case "provision":
      case "deploy":
        return compileLifecycle(state, definition);
      case "pythonEnvironment":
        return compilePythonEnvironment(state, definition);
      case "localEnvironment":
        return compileLocalEnvironment(state, definition);
      case "target":
        return compileTarget(state, definition);
      case "open":
        return compileOpen(state, definition);
      case "checks":
        return compileChecks(state, definition);
      default:
        return failure(
          "VCB_STEP_TYPE_UNSUPPORTED",
          "The semantic step type is not supported.",
        );
    }
  };
}

module.exports = { createSemanticStepCompiler };
