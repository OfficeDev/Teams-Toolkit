const { createHash } = require("node:crypto");
const path = require("node:path");

const { renderComponent } = require("./render-component.cjs");

const componentRoot = path.join(__dirname, "..", "components");
const appNameExpressionPattern =
  /^\$\{\{var:app_name:[A-Za-z0-9][A-Za-z0-9_#-]*\}\}$/;
const connectionIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const environmentExpressionPattern = /^\$\{\{env:([A-Z_a-z][A-Z_a-z0-9]*)\}\}$/;
const secretExpressionPattern = /^\$\{\{secret:[A-Z_a-z][A-Z_a-z0-9]*\}\}$/;
const relativePathPattern =
  /^(?!\/)(?![A-Za-z]:)(?!.*(?:^|\/)\.\.(?:\/|$))[^\\]+$/;
const localEnvironmentNamePattern = /^[A-Z][A-Z0-9_]*$/;
const localEnvironmentValuePattern = /^[A-Za-z0-9:/._-]*$/;
const openAIModelPattern = /^gpt-[a-z0-9.-]+$/;
const runnerPlaceholderPattern = /\$\{\{[a-z]+:[A-Za-z0-9_:#-]+\}\}/g;
const userEnvironmentTargetFiles = Object.freeze({
  dev: ".env.dev.user",
  playground: ".env.playground.user",
});
const provisionInputGroups = new Set(["apiKey", "arm", "entra", "oauth"]);
const provisionEnvironmentInput = "environment";
const provisionEnvironmentSkipValue = "none";
const copilotLaunchFeatureFlag = "TEAMSFX_CEA_ENABLED=true";
const regenerateDaActionApiSpecLocation =
  "https://raw.githubusercontent.com/SLdragon/example-openapi-spec/675fd5e0bf33ac3c4cb77a4eb51fc80461caff1d/real-no-auth.yaml";
const pkceOAuthApiSpecLocation =
  "https://raw.githubusercontent.com/neil-yechenwei/uitest/6c0c1cb66ce41fd4112a15ee9d996dde9ff233f7/Spec_add_auth_oauth_pkce.yaml";
const unsupportedWorkflowVersionShareError =
  "Share feature only supports m365agents.yml version v1.10 or above, follow [the guide](https://github.com/OfficeDev/microsoft-365-agents-toolkit/wiki/Share-Declarative-Agents-with-Others#About-YAML-schema) to upgrade and proceed.";
const localUserEnvironmentMutationScript = String.raw`import os
from pathlib import Path

environment_file = Path(os.environ["PROJECT_DIR"]).resolve() / "env" / ".env.local.user"
name = os.environ["VARIABLE_NAME"]
value = os.environ["VARIABLE_VALUE"]
if not value:
  raise AssertionError("The variable value resolved to nothing")
lines = environment_file.read_text(encoding="utf-8").splitlines()
prefix = name + "="
matches = [index for index, line in enumerate(lines) if line.startswith(prefix)]
if len(matches) != 1:
  raise AssertionError("The local user environment variable must already exist exactly once")
expected = name + "='" + value + "'"
lines[matches[0]] = expected
environment_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
written = [line for line in environment_file.read_text(encoding="utf-8").splitlines() if line.startswith(prefix)]
if written != [expected]:
  raise AssertionError("The local user environment variable was not written exactly once with its value")
`;
const localUserEnvironmentMutationScriptBase64 = Buffer.from(
  localUserEnvironmentMutationScript,
  "utf8",
).toString("base64");
const userEnvironmentMutationScript = String.raw`import os
from pathlib import Path

project_dir = Path(os.environ["PROJECT_DIR"]).resolve()
target_key = os.environ["TARGET_KEY"]
targets = {
  "dev": project_dir / "env" / ".env.dev.user",
  "playground": project_dir / "env" / ".env.playground.user",
}
environment_file = targets.get(target_key)
if environment_file is None:
  raise AssertionError("The user environment target is not supported")
environment_file.parent.mkdir(parents=True, exist_ok=True)
environment_file.touch(exist_ok=True)
name = os.environ["VARIABLE_NAME"]
value = os.environ["VARIABLE_VALUE"]
if not value:
  raise AssertionError("The variable value resolved to nothing")
lines = environment_file.read_text(encoding="utf-8").splitlines()
prefix = name + "="
expected = name + "='" + value + "'"
kept = [line for line in lines if not line.startswith(prefix)]
kept.append(expected)
environment_file.write_text("\n".join(kept) + "\n", encoding="utf-8")
written = [line for line in environment_file.read_text(encoding="utf-8").splitlines() if line.startswith(prefix)]
if written != [expected]:
  raise AssertionError("The user environment variable was not written exactly once with its value")
`;
const userEnvironmentMutationScriptBase64 = Buffer.from(
  userEnvironmentMutationScript,
  "utf8",
).toString("base64");
const projectEnvironmentMutationScript = String.raw`import os
from pathlib import Path

project_dir = Path(os.environ["PROJECT_DIR"]).resolve()
environment_file = project_dir / "env" / ".env.dev"
if not environment_file.is_file():
  raise AssertionError("The project environment file must already exist")
name = os.environ["VARIABLE_NAME"]
value = os.environ["VARIABLE_VALUE"]
if not value:
  raise AssertionError("The variable value resolved to nothing")
lines = environment_file.read_text(encoding="utf-8").splitlines()
prefix = name + "="
matches = [index for index, line in enumerate(lines) if line.startswith(prefix)]
if len(matches) != 1:
  raise AssertionError("The project environment variable must already exist exactly once")
expected = name + "='" + value + "'"
lines[matches[0]] = expected
environment_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
written = [line for line in environment_file.read_text(encoding="utf-8").splitlines() if line.startswith(prefix)]
if written != [expected]:
  raise AssertionError("The project environment variable was not written exactly once with its value")
`;
const projectEnvironmentMutationScriptBase64 = Buffer.from(
  projectEnvironmentMutationScript,
  "utf8",
).toString("base64");

const armJsonTemplatesMutationScriptBase64 = Buffer.from(
  String.raw`import json
import os
from pathlib import Path

project_dir = Path(os.environ["PROJECT_DIR"]).resolve()
workflow_path = project_dir / "m365agents.yml"
workflow = workflow_path.read_text(encoding="utf-8")
anchor = "          deploymentName: Create-resources\n"
addition = (
  anchor
  + "        - path: ./infra/azure.json\n"
  + "          parameters: ./infra/azure.parameters.test.json\n"
  + "          deploymentName: test-json-format\n"
)
if workflow.count(anchor) != 1 or "azure.parameters.test.json" in workflow:
  raise AssertionError("The Tab workflow must contain one unmodified ARM template anchor")

arm_template = {
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {"resourceBaseName": {"type": "string"}},
  "resources": [],
  "outputs": {
    "SQLRESOURCEID": {
      "type": "string",
      "value": "[resourceId('Microsoft.Sql/servers', parameters('resourceBaseName'))]",
    }
  },
}
arm_parameters = {
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {"resourceBaseName": {"value": "vscuseSql"}},
}

infra_dir = project_dir / "infra"
template_path = infra_dir / "azure.json"
parameters_path = infra_dir / "azure.parameters.test.json"
workflow_path.write_text(workflow.replace(anchor, addition), encoding="utf-8")
template_path.write_text(json.dumps(arm_template, indent=2) + "\n", encoding="utf-8")
parameters_path.write_text(json.dumps(arm_parameters, indent=2) + "\n", encoding="utf-8")

written_workflow = workflow_path.read_text(encoding="utf-8")
if written_workflow.count("path: ./infra/azure.json") != 1:
  raise AssertionError("The JSON ARM template entry was not written exactly once")
if json.loads(template_path.read_text(encoding="utf-8")) != arm_template:
  raise AssertionError("The JSON ARM template was not written completely")
if json.loads(parameters_path.read_text(encoding="utf-8")) != arm_parameters:
  raise AssertionError("The JSON ARM parameters were not written completely")`,
  "utf8",
).toString("base64");
const typeSpecGitHubIssuesMutationScript = String.raw`import os
from pathlib import Path

project_dir = Path(os.environ["PROJECT_DIR"]).resolve()
source_file = project_dir / Path("src/agent/main.tsp")
disabled_to_enabled = {
  '// @conversationStarter(#{': '@conversationStarter(#{',
  '//   title: "Get latest issues",': '  title: "Get latest issues",',
  '//   text: "Get the latest issues from GitHub"': '  text: "Get the latest issues from GitHub"',
  '// })': '})',
  '  // op searchIssues is global.GitHubAPI.searchIssues;': '  op searchIssues is global.GitHubAPI.searchIssues;',
}
lines = source_file.read_text(encoding="utf-8").splitlines()
for disabled in disabled_to_enabled:
  if sum(line.rstrip() == disabled for line in lines) != 1:
    raise AssertionError("Each disabled GitHub issues declaration must occur exactly once")
updated = [disabled_to_enabled.get(line.rstrip(), line) for line in lines]
source_file.write_text("\n".join(updated) + "\n", encoding="utf-8")
written = source_file.read_text(encoding="utf-8").splitlines()
for disabled, enabled in disabled_to_enabled.items():
  if any(line.rstrip() == disabled for line in written) or written.count(enabled) != 1:
    raise AssertionError("The GitHub issues declaration was not enabled exactly once")
`;
const typeSpecGitHubIssuesMutationScriptBase64 = Buffer.from(
  typeSpecGitHubIssuesMutationScript,
  "utf8",
).toString("base64");
const typeSpecGitHubOAuthSource =
  "https://raw.githubusercontent.com/KennethBWSong/typeSpecSchema/e20150c80f47dfc9b068a282a9a8e429daa0b557/github-agent.tsp";

function createTypeSpecGitHubOAuthMutationScript(includeReferenceId) {
  const referenceMutation = includeReferenceId
    ? String.raw`
reference = '@authReferenceId("\${{OAUTH2_CONFIGURATION_ID}}")'
if reference in source:
  raise AssertionError("The OAuth reference must not already exist")
source = source.replace(oauth_model, reference + "\n" + oauth_model)
`
    : String.raw`
if "@authReferenceId" in source:
  raise AssertionError("The OAuth source must not contain an authentication reference")
`;
  return String.raw`import os
from pathlib import Path
from urllib.request import urlopen

source_url = "${typeSpecGitHubOAuthSource}"
source = urlopen(source_url, timeout=60).read().decode("utf-8")
project_dir = Path(os.environ["PROJECT_DIR"]).resolve()
fixture_agent_name = "github-agent0507"
generated_agent_name = project_dir.name
if source.count(fixture_agent_name) != 1:
  raise AssertionError("The pinned TypeSpec source must contain exactly one fixture agent name")
source = source.replace(fixture_agent_name, generated_agent_name)
oauth_model = "model oauth is OAuth2Auth<"
if source.count(oauth_model) != 1:
  raise AssertionError("The pinned TypeSpec source must contain exactly one OAuth model")
${referenceMutation}
source_file = project_dir / "src" / "agent" / "main.tsp"
source_file.write_text(source, encoding="utf-8")
written = source_file.read_text(encoding="utf-8")
if fixture_agent_name in written or written.count(generated_agent_name) != 1:
  raise AssertionError("The generated TypeSpec agent name is incorrect")
if written.count(oauth_model) != 1:
  raise AssertionError("The OAuth model was not written exactly once")
if ${includeReferenceId ? "True" : "False"} != ("@authReferenceId" in written):
  raise AssertionError("The OAuth authentication reference state is incorrect")
`;
}

const typeSpecGitHubOAuthWithReferenceMutationScriptBase64 = Buffer.from(
  createTypeSpecGitHubOAuthMutationScript(true),
  "utf8",
).toString("base64");
const typeSpecGitHubOAuthWithoutReferenceMutationScriptBase64 = Buffer.from(
  createTypeSpecGitHubOAuthMutationScript(false),
  "utf8",
).toString("base64");
const embeddedKnowledgeDocumentSource =
  "https://raw.githubusercontent.com/ayachensiyuan/vscuse-resources/282e74768fdd4ce6a62b2d5eeb0894e839ebd0ed/DA-EK/Document.docx";
const prepareEmbeddedKnowledgeDocumentScript = String.raw`import os
from pathlib import Path
from urllib.request import urlopen

document = urlopen("${embeddedKnowledgeDocumentSource}", timeout=60).read()
if not document.startswith(b"PK"):
  raise AssertionError("The pinned embedded knowledge fixture is not a DOCX file")
document_path = Path(os.environ["PROJECT_DIR"]).resolve() / "Document.docx"
document_path.write_bytes(document)
if document_path.stat().st_size != len(document):
  raise AssertionError("The embedded knowledge fixture was not written completely")
`;
const prepareEmbeddedKnowledgeDocumentScriptBase64 = Buffer.from(
  prepareEmbeddedKnowledgeDocumentScript,
  "utf8",
).toString("base64");

const commandTitles = {
  addDaAction: "Microsoft 365 Agents: Add Action",
  addApiAuthConfiguration:
    "Microsoft 365 Agents: Add Configurations to Support Actions with Authentication in Declarative Agent",
  addDaCapability: "Microsoft 365 Agents: Add Capability",
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
  packageApp: "Microsoft 365 Agents: Zip App Package",
  publishDeveloperPortal:
    "Microsoft 365 Agents: Publish to Store in Developer Portal",
  provision: "Microsoft 365 Agents: Provision",
  regenerateDaAction: "Microsoft 365 Agents: Regenerate Action",
  share: "Microsoft 365 Agents: Share",
  // VS Code generates one show command per view container, so this title exists
  // in both windows, and the container renders every view the current
  // `fx-extension.isTeamsFx` value allows, ACCOUNTS first.
  showToolkit: "View: Show Microsoft 365 Agents Toolkit",
  target: "Debug: Select and Start Debugging",
};

const rejectedScaffoldTextAttemptOrder = ["invalidCharacters", "overlength"];
const rejectedScaffoldTextAttemptAdapters = {
  invalidCharacters:
    "quick-input/rejected-app-name-invalid-characters.json.tpl",
  overlength: "quick-input/rejected-app-name-overlength.json.tpl",
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
  dependencyLabels: {
    "basic-custom-engine-agent": "src/requirements.txt",
    "custom-copilot-basic": "src/requirements.txt",
    "custom-copilot-rag-azure-ai-search": "src/requirements.txt",
    "custom-copilot-rag-custom-api": "requirements.txt",
    "custom-copilot-rag-customize": "src/requirements.txt",
    "default-bot": "src/requirements.txt",
    "default-message-extension": "src/requirements.txt",
  },
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
    options: {
      "api-key": "API Key",
      "microsoft-entra": "Microsoft Entra",
      none: "None",
      oauth: "OAuth",
    },
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
  customCopilotRag: {
    options: {
      "custom-copilot-rag-azure-ai-search": "Azure AI Search",
      "custom-copilot-rag-custom-api": "Custom API",
      "custom-copilot-rag-customize": "Customize",
    },
    title: "Teams Agent with Data",
    type: "singleSelect",
  },
  customEngineAgent: {
    options: {
      "basic-custom-engine-agent": "Basic Custom Engine Agent",
      "weather-agent": "Weather Agent",
    },
    title: "App Features Using Microsoft 365 Agents SDK",
    type: "singleSelect",
  },
  daTemplate: {
    options: {
      "add-action": "Add an Action",
      "no-action": "No Action",
      typespec: "Start with TypeSpec for Microsoft 365 Copilot",
    },
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
      "custom-copilot-basic": "General Teams Agent",
      "custom-copilot-rag": "Teams Agent with Data",
      "teams-collaborator-agent": "Teams Collaborator Agent",
      "teams-other-app-type": "Other Teams Capabilities",
    },
    title: "Teams Agent or App Using Microsoft Teams SDK",
    type: "singleSelect",
  },
  teamsOtherAppType: {
    options: {
      "default-bot": "Simple Bot",
      "default-message-extension": "Message Extension",
      "non-sso-tab": "Tab",
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

const provisionEntraQuestion = {
  component: "quick-input/text.json.tpl",
  key: "clientId",
  title: "Entra SSO client ID",
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
// A profile registers one activation adapter per destination it can reach. One
// launch title serves more than one scaffold package: the Teams debug and remote
// profiles open a conversation for a bot or message extension and a tab page for
// a tab, and only the case knows which of the two it scaffolded.
const teamsChatSubject =
  "the Microsoft Teams conversation with an app whose name starts with ${{var:app_name}} is open with its message box";
const teamsPageSubject =
  "the Microsoft Teams tab page for an app whose name starts with ${{var:app_name}} is open";
const teamsAppDetailsSubject =
  "the Microsoft Teams app details page for an app whose name starts with ${{var:app_name}} is visible";
const copilotAgentSubject =
  "Microsoft 365 Copilot shows an agent's chat open in the main section with a visible message input";
const targetAdapters = {
  // Every Chrome launch configuration the templates ship omits `userDataDir`, so
  // js-debug hands the session a profile of its own that carries no Microsoft 365
  // session and the browser always has to sign in. Which page it opens on is
  // decided by the launch URL: the Teams targets carry the toolkit's
  // `${account-hint}`, which resolves to a `login_hint` and asks straight for the
  // password of the account already signed in to Visual Studio Code.
  "Launch Remote in Teams (Chrome)": {
    appNameSuffix: "dev",
    browserAuthentication: {
      component: "authentication/browser/m365-password-sign-in.json.tpl",
      credentials: "m365",
    },
    host: "teams",
    open: {
      chat: { adapter: "teams-add", kind: "app", subject: teamsChatSubject },
    },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
    },
    readySubject: teamsAppDetailsSubject,
    requires: ["login:azure", "login:m365", "provision", "deploy"],
  },
  // The v4 TypeScript Bot and Message Extension templates title the same
  // remote Teams launch `View Remote App in Teams (Chrome)`, and so does the Tab
  // template, which reaches a tab page rather than a conversation.
  "View Remote App in Teams (Chrome)": {
    appNameSuffix: "dev",
    browserAuthentication: {
      component: "authentication/browser/m365-password-sign-in.json.tpl",
      credentials: "m365",
    },
    host: "teams",
    open: {
      chat: { adapter: "teams-add", kind: "app", subject: teamsChatSubject },
      page: { adapter: "teams-add", kind: "app", subject: teamsPageSubject },
    },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
    },
    readySubject: teamsAppDetailsSubject,
    requires: ["login:azure", "login:m365", "provision", "deploy"],
  },
  // The Python templates and the Teams Collaborator Agent TypeScript template
  // name the same remote Teams launch `Launch Remote (Chrome)`, without the `in
  // Teams` the other TypeScript and JavaScript templates use. It reaches the
  // same Teams app details page, so it reuses that adapter's open transition and
  // readiness subject.
  "Launch Remote (Chrome)": {
    appNameSuffix: "dev",
    browserAuthentication: {
      component: "authentication/browser/m365-password-sign-in.json.tpl",
      credentials: "m365",
    },
    host: "teams",
    open: {
      chat: { adapter: "teams-add", kind: "app", subject: teamsChatSubject },
    },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
    },
    readySubject: teamsAppDetailsSubject,
    requires: ["login:azure", "login:m365", "provision", "deploy"],
  },
  "Preview in Copilot (Chrome)": {
    browserAuthentication: {
      component: "authentication/browser/m365-sign-in.json.tpl",
      credentials: "m365",
    },
    host: "copilot",
    open: { chat: { adapter: "ready", kind: "agent" } },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
      second: {
        component: "quick-input/filter-second-option.json.tpl",
        initialOptionLabel: "Preview Local in Copilot (Chrome)",
      },
    },
    readySubject: copilotAgentSubject,
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
    open: { chat: { adapter: "ready", kind: "agent" } },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
    },
    readySubject: copilotAgentSubject,
    requires: ["login:azure", "login:m365", "provision", "deploy"],
  },
  // General Teams Agent templates expose the same custom-engine Copilot flow
  // without the preview prefix.
  "Launch Remote in Copilot (Chrome)": {
    browserAuthentication: {
      component: "authentication/browser/m365-sign-in.json.tpl",
      credentials: "m365",
    },
    host: "copilot",
    open: { chat: { adapter: "ready", kind: "agent" } },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
    },
    readySubject: copilotAgentSubject,
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
    appNameSuffix: "local",
    browserAuthentication: {
      component: "authentication/browser/m365-password-sign-in.json.tpl",
      credentials: "m365",
    },
    host: "teams",
    open: {
      chat: { adapter: "teams-add", kind: "app", subject: teamsChatSubject },
      // The local lifecycle serves the tab from `https://localhost:3978`, so the
      // adapter must trust its development certificate before opening the app and
      // then allow the cloud-hosted Teams page to access that local service. The
      // remote profile above needs neither local-only transition.
      page: {
        adapter: "teams-add-local-page",
        kind: "app",
        subject: teamsPageSubject,
      },
    },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
    },
    readySubject: teamsAppDetailsSubject,
    requires: ["login:m365"],
  },
  "(Preview) Debug in Copilot (Chrome)": {
    browserAuthentication: {
      component: "authentication/browser/m365-sign-in.json.tpl",
      credentials: "m365",
    },
    host: "copilot",
    open: { chat: { adapter: "ready", kind: "agent" } },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
    },
    readySubject: copilotAgentSubject,
    requires: ["login:m365"],
  },
  "Preview Local in Copilot (Chrome)": {
    browserAuthentication: {
      component: "authentication/browser/m365-sign-in.json.tpl",
      credentials: "m365",
    },
    host: "copilot",
    open: { chat: { adapter: "ready", kind: "agent" } },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
    },
    readySubject: copilotAgentSubject,
    requires: ["login:m365"],
  },
  "Debug in Copilot (Chrome)": {
    browserAuthentication: {
      component: "authentication/browser/m365-sign-in.json.tpl",
      credentials: "m365",
    },
    host: "copilot",
    open: { chat: { adapter: "ready", kind: "agent" } },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
    },
    readySubject: copilotAgentSubject,
    requires: ["login:m365"],
  },
  // The Agents Playground hosts the agent on the local machine and talks to it
  // over the local bot endpoint, so nothing in this target authenticates against
  // Microsoft 365 and no account has to be signed in first.
  "Debug in Microsoft 365 Agents Playground": {
    host: "playground",
    open: { chat: { adapter: "ready", kind: "app" } },
    profileSelections: {
      first: { component: "quick-input/filter-option.json.tpl" },
    },
    readySubject:
      "the Microsoft 365 Agents Playground page is open in the browser",
    requires: [],
  },
};

const messageExtensionComponents = Object.freeze({
  playground: {
    python: "browser/message-extension/playground-python.json.tpl",
    typescript: "browser/message-extension/playground-typescript.json.tpl",
  },
  teams: {
    python: "browser/message-extension/teams-python.json.tpl",
    typescript: "browser/message-extension/teams-typescript.json.tpl",
  },
});

function failure(code, message) {
  return { ok: false, diagnostics: [{ code, message }] };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyFields(value, allowedFields) {
  return Object.keys(value).every((field) => allowedFields.has(field));
}

function isHttpsUrl(value) {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
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
    const rejectedTextAttempts = [];
    for (const answer of definition.with.answers) {
      if (isRecord(answer) && answer.type === "rejectedScaffoldTextAttempt") {
        const inputs = answer.with;
        const expectedReason =
          rejectedScaffoldTextAttemptOrder[rejectedTextAttempts.length];
        if (
          definition.with.template !== "non-sso-tab" ||
          !hasOnlyFields(answer, new Set(["type", "with"])) ||
          !isRecord(inputs) ||
          !hasOnlyFields(inputs, new Set(["question", "reason"])) ||
          inputs.question !== "appName" ||
          inputs.reason !== expectedReason ||
          answerState.workspaceFolder !== "default" ||
          Object.hasOwn(answerState, "appName")
        ) {
          return failure(
            "VCB_REJECTED_SCAFFOLD_TEXT_ATTEMPT_INPUT_INVALID",
            "The rejected scaffold text attempt is not supported for this prompt state.",
          );
        }
        const component = rejectedScaffoldTextAttemptAdapters[inputs.reason];
        error = append(output, render(state, component, {}));
        if (error) return error;
        rejectedTextAttempts.push(inputs.reason);
        continue;
      }
      if (
        answer?.question === "appName" &&
        rejectedTextAttempts.length > 0 &&
        rejectedTextAttempts.length !== rejectedScaffoldTextAttemptOrder.length
      ) {
        return failure(
          "VCB_REJECTED_SCAFFOLD_TEXT_ATTEMPT_INPUT_INVALID",
          "The rejected scaffold text attempt sequence is incomplete.",
        );
      }
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
        !secretExpressionPattern.test(answer.value) &&
        !(
          answer.question === "openAIKey" &&
          answer.value === "deferred" &&
          definition.with.template === "custom-copilot-rag-custom-api" &&
          answerState.llmService === "llm-service-openai"
        )
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

      // The toolkit composes some prompts from answers the case already gave,
      // so the same question key can carry a different title, or reach a
      // different prompt shape, on a different path.
      const inTeamsAgentWithData = answerState.customCopilotRag !== undefined;
      const questionTitle =
        answer.question === "mcp-da-client-id" &&
        answerState.authType === "entra-sso"
          ? "Microsoft Entra Application (Client) ID"
          : answer.question === "apiOperations" && inTeamsAgentWithData
            ? "Select Operation(s) Teams Can Interact with"
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
        // The Teams Agent with Data flow reaches the OpenAPI document as a
        // `singleFileOrText` question, so its prompt lists the workspace files
        // beside an item that opens the input box the URL is typed into.
        if (answer.question === "apiSpecLocation" && inTeamsAgentWithData) {
          error = append(
            output,
            render(state, "quick-input/single-select.json.tpl", {
              optionLabel: "Enter OpenAPI Document URL",
              questionTitle,
            }),
          );
          if (error) return error;
        }
        if (
          rejectedTextAttempts.length > 0 &&
          rejectedTextAttempts.length !==
            rejectedScaffoldTextAttemptOrder.length
        ) {
          return failure(
            "VCB_REJECTED_SCAFFOLD_TEXT_ATTEMPT_INPUT_INVALID",
            "The rejected scaffold text attempt sequence is incomplete.",
          );
        }
        error = append(
          output,
          answer.question === "openAIKey" && answer.value === "deferred"
            ? render(state, "quick-input/empty-text.json.tpl", {
                questionTitle,
              })
            : render(state, "quick-input/text.json.tpl", {
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
    if (
      answerState.openAIKey === "deferred" &&
      answerState.language !== "python"
    ) {
      return failure(
        "VCB_DEFERRED_SECRET_INPUT_INVALID",
        "The deferred OpenAI key is supported only by the Python Custom API template.",
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
    state.language = answerState.language;
    state.apiSpecLocation = answerState.apiSpecLocation;
    state.apiOperations = answerState.apiOperations;
    state.deferredOpenAIKey = answerState.openAIKey === "deferred";
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
    const supportsApiKeyProvision =
      state.template === "da/api-plugin-from-existing-api" ||
      (state.template === "da/no-action" &&
        (state.completed.has("addApiAuthConfiguration:api-key") ||
          state.completed.has("addApiAuthConfiguration:bearer-token")));
    const supportsEntraProvision =
      state.template === "da/no-action" &&
      state.completed.has("addApiAuthConfiguration:microsoft-entra");
    const supportsOAuthProvision =
      state.template === "da/api-plugin-from-existing-api" ||
      (state.template === "da/no-action" &&
        state.completed.has("addApiAuthConfiguration:oauth")) ||
      (state.template === "da/typespec" &&
        state.completed.has(
          "configureTypeSpecAction:github-oauth-without-reference-id",
        ));
    if (
      (inputs.apiKey !== undefined && !supportsApiKeyProvision) ||
      (inputs.entra !== undefined && !supportsEntraProvision) ||
      (inputs.oauth !== undefined && !supportsOAuthProvision)
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
    if (inputs.entra !== undefined) {
      if (
        !isRecord(inputs.entra) ||
        !hasOnlyFields(inputs.entra, new Set([provisionEntraQuestion.key]))
      ) {
        return failure(
          "VCB_PROVISION_INPUT_UNKNOWN",
          "The Microsoft Entra provision operation does not match its supported input set.",
        );
      }
      if (!environmentExpressionPattern.test(inputs.entra.clientId ?? "")) {
        return failure(
          "VCB_ACCOUNT_EXPRESSION_REQUIRED",
          "The Microsoft Entra client ID must use an environment expression.",
        );
      }
      return {
        ok: true,
        value: {
          confirmation: undefined,
          questions: [
            { ...provisionEntraQuestion, value: inputs.entra.clientId },
          ],
        },
      };
    }
    if (inputs.oauth !== undefined) {
      const isPkceOAuth = state.completed.has(
        "addApiAuthConfiguration:oauth-pkce",
      );
      const oauthQuestions = isPkceOAuth
        ? provisionOauthQuestions.slice(0, 1)
        : provisionOauthQuestions;
      const expectedKeys = new Set(
        oauthQuestions.map((question) => question.key),
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
        (!isPkceOAuth &&
          !secretExpressionPattern.test(inputs.oauth.clientSecret ?? ""))
      ) {
        return failure(
          "VCB_ACCOUNT_EXPRESSION_REQUIRED",
          "OAuth provision credentials must use environment and secret expressions.",
        );
      }
      const questions = oauthQuestions.map((question) => ({
        ...question,
        value: inputs.oauth[question.key],
      }));
      return {
        ok: true,
        value: {
          confirmation: isPkceOAuth ? undefined : provisionOauthConfirmation,
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
    const dependencyLabel = pythonEnvironment.dependencyLabels[state.template];
    if (
      !isRecord(inputs) ||
      !hasOnlyFields(inputs, new Set(["interpreter"])) ||
      typeof inputs.interpreter !== "string" ||
      inputs.interpreter.length === 0 ||
      dependencyLabel === undefined
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
      render(state, "quick-input/python-dependencies.json.tpl", {
        dependencyLabel,
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

  function compileEnvironmentVariables(
    state,
    definition,
    { componentPath, diagnosticCode, diagnosticMessage },
  ) {
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
      return failure(diagnosticCode, diagnosticMessage);
    }
    const output = [];
    for (const name of names) {
      const error = append(
        output,
        render(state, componentPath, {
          variableName: name,
          variableValue: inputs[name],
        }),
      );
      if (error) return error;
    }
    return { ok: true, value: output };
  }

  function compileLocalEnvironment(state, definition) {
    return compileEnvironmentVariables(state, definition, {
      componentPath: "workspace/local-environment-variable.json.tpl",
      diagnosticCode: "VCB_LOCAL_ENVIRONMENT_INPUT_INVALID",
      diagnosticMessage:
        "The local environment operation requires shell-safe variable names and values.",
    });
  }

  function compilePlaygroundEnvironment(state, definition) {
    return compileEnvironmentVariables(state, definition, {
      componentPath: "workspace/playground-environment-variable.json.tpl",
      diagnosticCode: "VCB_PLAYGROUND_ENVIRONMENT_INPUT_INVALID",
      diagnosticMessage:
        "The Playground environment operation requires shell-safe variable names and values.",
    });
  }

  function compileRemoteEnvironment(state, definition) {
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
          !localEnvironmentValuePattern.test(
            inputs[name].replaceAll(runnerPlaceholderPattern, ""),
          ),
      )
    ) {
      return failure(
        "VCB_REMOTE_ENVIRONMENT_INPUT_INVALID",
        "The remote environment operation requires shell-safe variable names and values.",
      );
    }
    const output = [];
    for (const name of names) {
      const error = append(
        output,
        render(state, "workspace/remote-environment-variable.json.tpl", {
          variableName: name,
          variableValue: inputs[name],
        }),
      );
      if (error) return error;
    }
    return { ok: true, value: output };
  }

  function compileOpenAIModel(state, definition) {
    const inputs = definition.with ?? {};
    if (
      !isRecord(inputs) ||
      Object.keys(inputs).some(
        (field) => field !== "path" && field !== "current",
      ) ||
      typeof inputs.path !== "string" ||
      !relativePathPattern.test(inputs.path) ||
      typeof inputs.current !== "string" ||
      !openAIModelPattern.test(inputs.current) ||
      inputs.current === "gpt-4o" ||
      inputs.current === "gpt-4o-mini"
    ) {
      return failure(
        "VCB_OPENAI_MODEL_INPUT_INVALID",
        "The OpenAI model operation requires a safe relative path and an unsupported current GPT model.",
      );
    }
    return render(state, "workspace/openai-model.json.tpl", {
      currentModel: inputs.current,
      relativePath: inputs.path,
    });
  }

  function compileLocalUserEnvironment(state, definition) {
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
          !localEnvironmentValuePattern.test(
            inputs[name].replaceAll(runnerPlaceholderPattern, ""),
          ),
      )
    ) {
      return failure(
        "VCB_LOCAL_USER_ENVIRONMENT_INPUT_INVALID",
        "The local user environment operation requires shell-safe variable names and values.",
      );
    }
    const output = [];
    for (const name of names) {
      const error = append(
        output,
        render(state, "workspace/local-user-environment-variable.json.tpl", {
          mutationScriptBase64: localUserEnvironmentMutationScriptBase64,
          variableName: name,
          variableValue: inputs[name],
        }),
      );
      if (error) return error;
    }
    return { ok: true, value: output };
  }

  function compileUserEnvironment(state, definition) {
    const inputs = definition.with ?? {};
    const variables = inputs.variables ?? {};
    const names = isRecord(variables) ? Object.keys(variables).sort() : [];
    if (
      !isRecord(inputs) ||
      !hasOnlyFields(inputs, new Set(["target", "variables"])) ||
      typeof inputs.target !== "string" ||
      !Object.prototype.hasOwnProperty.call(
        userEnvironmentTargetFiles,
        inputs.target,
      ) ||
      !isRecord(variables) ||
      names.length === 0 ||
      names.some(
        (name) =>
          !localEnvironmentNamePattern.test(name) ||
          typeof variables[name] !== "string" ||
          variables[name].length === 0 ||
          !localEnvironmentValuePattern.test(
            variables[name].replaceAll(runnerPlaceholderPattern, ""),
          ),
      )
    ) {
      return failure(
        "VCB_USER_ENVIRONMENT_INPUT_INVALID",
        "The user environment operation requires one supported target and shell-safe variable names and values.",
      );
    }
    const output = [];
    for (const name of names) {
      const error = append(
        output,
        render(state, "workspace/user-environment-variable.json.tpl", {
          mutationScriptBase64: userEnvironmentMutationScriptBase64,
          targetKey: inputs.target,
          variableName: name,
          variableValue: variables[name],
        }),
      );
      if (error) return error;
    }
    return { ok: true, value: output };
  }

  function compileProjectEnvironment(state, definition) {
    const inputs = definition.with ?? {};
    const variables = inputs.variables ?? {};
    const names = isRecord(variables) ? Object.keys(variables).sort() : [];
    if (
      !isRecord(inputs) ||
      !hasOnlyFields(inputs, new Set(["variables"])) ||
      !isRecord(variables) ||
      names.length === 0 ||
      names.some(
        (name) =>
          !localEnvironmentNamePattern.test(name) ||
          typeof variables[name] !== "string" ||
          variables[name].length === 0 ||
          !localEnvironmentValuePattern.test(
            variables[name].replaceAll(runnerPlaceholderPattern, ""),
          ),
      )
    ) {
      return failure(
        "VCB_PROJECT_ENVIRONMENT_INPUT_INVALID",
        "The project environment operation requires shell-safe variable names and values.",
      );
    }
    const output = [];
    for (const name of names) {
      const error = append(
        output,
        render(state, "workspace/project-environment-variable.json.tpl", {
          mutationScriptBase64: projectEnvironmentMutationScriptBase64,
          variableName: name,
          variableValue: variables[name],
        }),
      );
      if (error) return error;
    }
    return { ok: true, value: output };
  }

  function compileRemoveWorkspaceFile(state, definition) {
    const inputs = definition.with ?? {};
    if (
      !isRecord(inputs) ||
      !hasOnlyFields(inputs, new Set(["path"])) ||
      typeof inputs.path !== "string" ||
      !relativePathPattern.test(inputs.path)
    ) {
      return failure(
        "VCB_REMOVE_WORKSPACE_FILE_INPUT_INVALID",
        "The remove workspace file operation requires one project-relative path.",
      );
    }
    return render(state, "workspace/remove-file.json.tpl", {
      relativePath: inputs.path,
    });
  }

  function compileConfigureArmJsonTemplates(state, definition) {
    if (state.template !== "non-sso-tab" || definition.with !== undefined) {
      return failure(
        "VCB_ARM_JSON_TEMPLATES_INPUT_INVALID",
        "The ARM JSON templates operation accepts no input and requires a non-SSO Tab project.",
      );
    }
    return render(state, "workspace/configure-arm-json-templates.json.tpl", {
      mutationScriptBase64: armJsonTemplatesMutationScriptBase64,
    });
  }

  function compileWorkflowVersion(state, definition) {
    const inputs = definition.with ?? {};
    if (
      state.template !== "da/no-action" ||
      !isRecord(inputs) ||
      !hasOnlyFields(inputs, new Set(["version"])) ||
      inputs.version !== "v1.9"
    ) {
      return failure(
        "VCB_WORKFLOW_VERSION_INPUT_INVALID",
        "The workflow version operation supports only v1.9 for a no-action declarative agent.",
      );
    }
    const result = render(state, "workspace/workflow-version.json.tpl", {
      workflowVersion: inputs.version,
    });
    if (!result.ok) return result;
    state.completed.add("workflowVersion:v1.9");
    return result;
  }

  function compileShare(state, definition) {
    const inputs = definition.with ?? {};
    if (
      state.template !== "da/no-action" ||
      !isRecord(inputs) ||
      !hasOnlyFields(inputs, new Set(["scope", "email", "expectError"])) ||
      inputs.scope !== "users" ||
      typeof inputs.email !== "string" ||
      !environmentExpressionPattern.test(inputs.email) ||
      inputs.expectError !== "unsupportedWorkflowVersion"
    ) {
      return failure(
        "VCB_SHARE_INPUT_INVALID",
        "The Share operation requires the supported scope, environment-backed email, and error expectation.",
      );
    }
    if (
      !state.completed.has("login:m365") ||
      !state.completed.has("workflowVersion:v1.9")
    ) {
      return failure(
        "VCB_SHARE_PREREQUISITE",
        "The legacy Share error requires Microsoft 365 login and the supported workflow-version mutation.",
      );
    }

    const output = [];
    for (const commandTitle of [
      commandTitles.clearNotifications,
      commandTitles.notifications,
    ]) {
      const error = append(
        output,
        render(state, "command-palette/execute-command.json.tpl", {
          commandTitle,
        }),
      );
      if (error) return error;
    }
    let error = append(
      output,
      render(state, "command-palette/execute-second-command.json.tpl", {
        firstCommandTitle:
          "Microsoft 365 Agents: Remove access to the shared app",
        commandTitle: commandTitles.share,
      }),
    );
    if (error) return error;
    for (const answer of [
      {
        component: "quick-input/single-select.json.tpl",
        values: {
          questionTitle: "Share the agent",
          optionLabel: "Share access",
        },
      },
      {
        component: "quick-input/single-select.json.tpl",
        values: {
          questionTitle: "Share the agent with users",
          optionLabel: "Share to specified users(s) or user group",
        },
      },
      {
        component: "quick-input/text.json.tpl",
        values: {
          questionTitle: "Email addresses of users or groups for agent sharing",
          inputValue: inputs.email,
        },
      },
      {
        component: "quick-input/single-select.json.tpl",
        values: {
          questionTitle: "Select an environment",
          optionLabel: "dev",
        },
      },
    ]) {
      error = append(output, render(state, answer.component, answer.values));
      if (error) return error;
    }
    error = append(
      output,
      render(state, "notifications/assert-contains.json.tpl", {
        notificationText: unsupportedWorkflowVersionShareError,
        retryTimeout: "60",
      }),
    );
    if (error) return error;
    state.completed.add("share");
    return { ok: true, value: output };
  }

  function compileConfigureTypeSpecAction(state, definition) {
    const action = definition.with?.action;
    if (
      state.template !== "da/typespec" ||
      !isRecord(definition.with) ||
      !hasOnlyFields(definition.with, new Set(["action"])) ||
      ![
        "github-issues",
        "github-oauth-with-reference-id",
        "github-oauth-without-reference-id",
      ].includes(action)
    ) {
      return failure(
        "VCB_TYPESPEC_ACTION_INPUT_INVALID",
        "The TypeSpec action input is not supported.",
      );
    }
    const output = [];
    let error = append(
      output,
      render(state, "command-palette/execute-command.json.tpl", {
        commandTitle: commandTitles.clearNotifications,
      }),
    );
    if (error) return error;
    const isGitHubIssues = action === "github-issues";
    const mutationScriptBase64 = isGitHubIssues
      ? typeSpecGitHubIssuesMutationScriptBase64
      : action === "github-oauth-with-reference-id"
        ? typeSpecGitHubOAuthWithReferenceMutationScriptBase64
        : typeSpecGitHubOAuthWithoutReferenceMutationScriptBase64;
    error = append(
      output,
      render(
        state,
        isGitHubIssues
          ? "workspace/configure-typespec-github-issues-action.json.tpl"
          : "workspace/configure-typespec-github-oauth-action.json.tpl",
        { mutationScriptBase64 },
      ),
    );
    if (error) return error;
    state.completed.add("configureTypeSpecAction");
    state.completed.add(`configureTypeSpecAction:${action}`);
    return { ok: true, value: output };
  }

  function compileAddDaCapability(state, definition) {
    const inputs = definition.with;
    const isCopilotConnector =
      isRecord(inputs) &&
      hasOnlyFields(inputs, new Set(["capability", "connectionId"])) &&
      inputs.capability === "copilotConnector" &&
      typeof inputs.connectionId === "string" &&
      connectionIdPattern.test(inputs.connectionId);
    const isEmbeddedKnowledge =
      isRecord(inputs) &&
      hasOnlyFields(inputs, new Set(["capability"])) &&
      inputs.capability === "embeddedKnowledge";
    if (
      state.template !== "da/no-action" ||
      (!isCopilotConnector && !isEmbeddedKnowledge)
    ) {
      return failure(
        "VCB_ADD_DA_CAPABILITY_INPUT_INVALID",
        "The declarative-agent capability input is not supported.",
      );
    }
    const output = [];
    if (isEmbeddedKnowledge) {
      let error = append(
        output,
        render(
          state,
          "workspace/prepare-embedded-knowledge-document.json.tpl",
          {
            preparationScriptBase64:
              prepareEmbeddedKnowledgeDocumentScriptBase64,
          },
        ),
      );
      if (error) return error;
      error = append(
        output,
        render(state, "command-palette/execute-command.json.tpl", {
          commandTitle: commandTitles.addDaCapability,
        }),
      );
      if (error) return error;
      for (const selection of [
        { optionLabel: "Embedded Knowledge", questionTitle: "Add Capability" },
        {
          optionLabel: "manifest.json",
          questionTitle: "Select Teams manifest.json File",
        },
      ]) {
        error = append(
          output,
          render(state, "quick-input/single-select.json.tpl", selection),
        );
        if (error) return error;
      }
      error = append(
        output,
        render(state, "quick-input/click-option.json.tpl", {
          optionLabel: "Browse...",
          preconditions: [
            "dhash:398:75:16:5:9191000000000000",
            "dhash:398:75:96:5:0000000000000000",
            "dhash:398:75:0:10:d094222323232421",
          ],
          questionTitle: "Add embedded knowledge files",
          x: 398,
          y: 75,
        }),
      );
      if (error) return error;
      error = append(
        output,
        render(state, "dialog/embedded-knowledge-file-chooser.json.tpl", {}),
      );
      if (error) return error;
      error = append(
        output,
        render(state, "dialog/click-primary-action.json.tpl", {
          actionLabel: "Add",
          dialogTitle:
            "the Microsoft 365 Agents Toolkit capability confirmation",
        }),
      );
      if (error) return error;
      state.completed.add("addDaCapability");
      return { ok: true, value: output };
    }
    let error = append(
      output,
      render(state, "command-palette/execute-command.json.tpl", {
        commandTitle: commandTitles.addDaCapability,
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/single-select.json.tpl", {
        optionLabel: "Copilot connector",
        questionTitle: "Add Capability",
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/single-select.json.tpl", {
        optionLabel: "Enter a Copilot connector Connection ID",
        questionTitle: "Copilot connector Content",
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/text.json.tpl", {
        inputValue: inputs.connectionId,
        questionTitle: "Connection ID",
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/click-option.json.tpl", {
        optionLabel: "manifest.json",
        preconditions: [
          "dhash:367:75:16:5:00649b6452d25256",
          "dhash:367:75:96:5:0000902029c80000",
          "dhash:367:75:0:10:d0202223a62c2c2d",
        ],
        questionTitle: "Select Teams manifest.json File",
        x: 367,
        y: 75,
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "dialog/add-da-capability-confirm.json.tpl", {}),
    );
    if (error) return error;
    state.completed.add("addDaCapability");
    return { ok: true, value: output };
  }

  function compileAddDaAction(state, definition) {
    const inputs = definition.with;
    const isOpenApi =
      isRecord(inputs) &&
      hasOnlyFields(inputs, new Set(["source", "url", "operations"])) &&
      inputs.source === "openapi" &&
      isHttpsUrl(inputs.url) &&
      inputs.operations === "all";
    const isMcpBearer =
      isRecord(inputs) &&
      hasOnlyFields(inputs, new Set(["source", "url", "authType"])) &&
      inputs.source === "mcp" &&
      isHttpsUrl(inputs.url) &&
      inputs.authType === "bearer-token";
    const isMcpNone =
      isRecord(inputs) &&
      hasOnlyFields(inputs, new Set(["source", "url", "authType"])) &&
      inputs.source === "mcp" &&
      isHttpsUrl(inputs.url) &&
      inputs.authType === "none";
    const isMcpOAuth =
      isRecord(inputs) &&
      hasOnlyFields(
        inputs,
        new Set([
          "source",
          "url",
          "authType",
          "clientId",
          "clientSecret",
          "scopes",
        ]),
      ) &&
      inputs.source === "mcp" &&
      isHttpsUrl(inputs.url) &&
      inputs.authType === "oauth" &&
      environmentExpressionPattern.test(inputs.clientId ?? "") &&
      secretExpressionPattern.test(inputs.clientSecret ?? "") &&
      typeof inputs.scopes === "string" &&
      inputs.scopes.length > 0;
    const isMcp = isMcpBearer || isMcpNone || isMcpOAuth;
    if (state.template !== "da/no-action" || (!isOpenApi && !isMcp)) {
      return failure(
        "VCB_ADD_DA_ACTION_INPUT_INVALID",
        "The declarative-agent action input is not supported.",
      );
    }
    const output = [];
    let error = append(
      output,
      render(state, "command-palette/execute-command.json.tpl", {
        commandTitle: commandTitles.addDaAction,
      }),
    );
    if (error) return error;
    if (isMcp) {
      error = append(
        output,
        render(state, "quick-input/single-select.json.tpl", {
          optionLabel: "Start with a MCP server",
          questionTitle: "Add an Action",
        }),
      );
      if (error) return error;
      error = append(
        output,
        render(state, "quick-input/text.json.tpl", {
          inputValue: inputs.url,
          questionTitle: "MCP Server URL",
        }),
      );
      if (error) return error;
      const authTypeLabel = isMcpBearer
        ? "API Key (Bearer Token Auth)"
        : isMcpOAuth
          ? "OAuth (with static registration)"
          : "None";
      error = append(
        output,
        render(state, "quick-input/single-select.json.tpl", {
          optionLabel: authTypeLabel,
          questionTitle: "Select Authentication Type",
        }),
      );
      if (error) return error;
      if (isMcpOAuth) {
        for (const [questionTitle, inputValue] of [
          ["OAuth Client ID", inputs.clientId],
          ["OAuth Client Secret", inputs.clientSecret],
          ["OAuth Scopes (optional)", inputs.scopes],
        ]) {
          error = append(
            output,
            render(state, "quick-input/text.json.tpl", {
              inputValue,
              questionTitle,
            }),
          );
          if (error) return error;
        }
      }
      state.completed.add("addDaAction");
      return { ok: true, value: output };
    }
    error = append(
      output,
      render(state, "quick-input/single-select.json.tpl", {
        optionLabel: "Start with an OpenAPI Description Document",
        questionTitle: "Add an Action",
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/single-select.json.tpl", {
        optionLabel: "Enter OpenAPI Document URL",
        questionTitle: "OpenAPI Spec Document",
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/text.json.tpl", {
        inputValue: inputs.url,
        questionTitle: "Enter OpenAPI Document URL",
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/add-da-action-select-all.json.tpl", {}),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/click-option.json.tpl", {
        optionLabel: "manifest.json",
        preconditions: [
          "dhash:442:81:16:5:636a0aaafb600aa1",
          "dhash:442:81:96:5:00012ed251080000",
          "dhash:442:81:0:10:d0282263666c6c2d",
        ],
        questionTitle: "Select Teams manifest.json File",
        x: 442,
        y: 81,
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "dialog/add-da-action-confirm.json.tpl", {}),
    );
    if (error) return error;
    state.completed.add("addDaAction");
    if (isOpenApi && inputs.url === pkceOAuthApiSpecLocation) {
      state.completed.add("addDaAction:pkce-oauth");
    }
    return { ok: true, value: output };
  }

  function compileAddApiAuthConfiguration(state, definition) {
    const inputs = definition.with;
    const entraScope =
      "api://plugincb4aae.azurewebsites.net/4cfde729-32e4-4862-a409-07e14dbfd296/readpairs_read: Read repair records";
    const oauthAuthorizationUrl = "https://github.com/login/oauth/authorize";
    const oauthTokenUrl = "https://github.com/login/oauth/access_token";
    const oauthScope = "repo: Read repos";
    const pkceAuthorizationUrl =
      "https://login.microsoftonline.com/81ccb34d-48d6-48a2-82ca-04d530ee06b7/oauth2/v2.0/authorize";
    const pkceTokenUrl =
      "https://login.microsoftonline.com/81ccb34d-48d6-48a2-82ca-04d530ee06b7/oauth2/v2.0/token";
    const pkceScope =
      "api://81ccb34d-48d6-48a2-82ca-04d530ee06b/repairs_read: Read repair records";
    const isApiKeyConfiguration =
      isRecord(inputs) &&
      hasOnlyFields(
        inputs,
        new Set(["authType", "authName", "location", "keyName"]),
      ) &&
      inputs.authType === "api-key" &&
      inputs.authName === "apiKey" &&
      inputs.location === "header" &&
      inputs.keyName === "X-API-KEY";
    const isBearerConfiguration =
      isRecord(inputs) &&
      hasOnlyFields(inputs, new Set(["authType", "authName"])) &&
      inputs.authType === "bearer-token" &&
      inputs.authName === "apiKey";
    const isMicrosoftEntraConfiguration =
      isRecord(inputs) &&
      hasOnlyFields(inputs, new Set(["authType", "authName", "scope"])) &&
      inputs.authType === "microsoft-entra" &&
      inputs.authName === "aadAuthCode" &&
      inputs.scope === entraScope;
    const isOAuthConfiguration =
      isRecord(inputs) &&
      hasOnlyFields(
        inputs,
        new Set([
          "authType",
          "authName",
          "authorizationUrl",
          "tokenUrl",
          "refreshUrl",
          "scope",
          "pkce",
        ]),
      ) &&
      inputs.authType === "oauth" &&
      inputs.authName === "oauth2" &&
      inputs.authorizationUrl === oauthAuthorizationUrl &&
      inputs.tokenUrl === oauthTokenUrl &&
      inputs.refreshUrl === "" &&
      inputs.scope === oauthScope &&
      inputs.pkce === false;
    const isPkceOAuthConfiguration =
      state.completed.has("addDaAction:pkce-oauth") &&
      isRecord(inputs) &&
      hasOnlyFields(
        inputs,
        new Set([
          "authType",
          "authName",
          "authorizationUrl",
          "tokenUrl",
          "refreshUrl",
          "scope",
          "pkce",
        ]),
      ) &&
      inputs.authType === "oauth" &&
      inputs.authName === "oAuth2AuthCode" &&
      inputs.authorizationUrl === pkceAuthorizationUrl &&
      inputs.tokenUrl === pkceTokenUrl &&
      inputs.refreshUrl === "" &&
      inputs.scope === pkceScope &&
      inputs.pkce === true;
    if (
      state.template !== "da/no-action" ||
      !state.completed.has("addDaAction") ||
      (!isApiKeyConfiguration &&
        !isBearerConfiguration &&
        !isMicrosoftEntraConfiguration &&
        !isOAuthConfiguration &&
        !isPkceOAuthConfiguration)
    ) {
      return failure(
        "VCB_ADD_API_AUTH_INPUT_INVALID",
        "The API authentication configuration input or entry state is not supported.",
      );
    }
    const output = [];
    let error = append(
      output,
      render(state, "command-palette/execute-command.json.tpl", {
        commandTitle: commandTitles.addApiAuthConfiguration,
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/confirm-option.json.tpl", {
        optionLabel: "ai-plugin.json",
        preconditions: ["dhash:512:384:0:20:4020226363636421"],
        questionTitle: "Import Manifest File",
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/text.json.tpl", {
        inputValue: inputs.authName,
        questionTitle: "Enter the Name of Auth Configuration",
      }),
    );
    if (error) return error;
    const authQuestions = isApiKeyConfiguration
      ? [
          ["Authentication Type", "API Key"],
          ["Enter where the API Key should be in the request", "Header"],
        ]
      : isBearerConfiguration
        ? [["Authentication Type", "API Key (Bearer Token Auth)"]]
        : isMicrosoftEntraConfiguration
          ? [["Authentication Type", "Microsoft Entra"]]
          : [["Authentication Type", "OAuth"]];
    for (const [questionTitle, optionLabel] of authQuestions) {
      error = append(
        output,
        render(state, "quick-input/single-select.json.tpl", {
          optionLabel,
          questionTitle,
        }),
      );
      if (error) return error;
    }
    if (isApiKeyConfiguration) {
      error = append(
        output,
        render(state, "quick-input/text.json.tpl", {
          inputValue: inputs.keyName,
          questionTitle: "Enter the Name of API Key",
        }),
      );
      if (error) return error;
    }
    const successNotificationText =
      "Microsoft 365 Agents Toolkit has successfully updated your project configuration (m365agents.yaml and m365agents.local.yaml) files with added action to support authentication flow. You can proceed to remote provision.";
    if (isMicrosoftEntraConfiguration) {
      error = append(
        output,
        render(state, "quick-input/text.json.tpl", {
          inputValue: inputs.scope,
          questionTitle:
            "Enter the OAuth Scope. Samle: scope1: description for scope1; scope2: description for scope2",
        }),
      );
      if (error) return error;
      error = append(
        output,
        render(state, "command-palette/execute-command.json.tpl", {
          commandTitle: commandTitles.notifications,
        }),
      );
      if (error) return error;
      error = append(
        output,
        render(
          state,
          "notifications/assert-collapsed-prefix-and-contains.json.tpl",
          {
            collapsedNotificationPrefix:
              "Microsoft 365 Agents Toolkit has successfully ad",
            notificationText: successNotificationText,
            retryTimeout: "60",
          },
        ),
      );
      if (error) return error;
    }
    if (isOAuthConfiguration || isPkceOAuthConfiguration) {
      for (const [questionTitle, inputValue] of [
        ["Enter the OAuth Authorization URL", inputs.authorizationUrl],
        ["Enter the OAuth Token URL", inputs.tokenUrl],
      ]) {
        error = append(
          output,
          render(state, "quick-input/text.json.tpl", {
            inputValue,
            questionTitle,
          }),
        );
        if (error) return error;
      }
      error = append(
        output,
        render(state, "quick-input/empty-text.json.tpl", {
          questionTitle: "Enter the OAuth Refresh URL",
        }),
      );
      if (error) return error;
      error = append(
        output,
        render(state, "quick-input/text.json.tpl", {
          inputValue: inputs.scope,
          questionTitle:
            "Enter the OAuth Scope. Samle: scope1: description for scope1; scope2: description for scope2",
        }),
      );
      if (error) return error;
      error = append(
        output,
        render(state, "quick-input/single-select.json.tpl", {
          optionLabel: inputs.pkce ? "Yes" : "No",
          questionTitle: "Enable PKCE for OAuth?",
        }),
      );
      if (error) return error;
    }
    if (!isMicrosoftEntraConfiguration) {
      error = append(
        output,
        render(state, "notifications/assert-contains.json.tpl", {
          notificationText: successNotificationText,
          retryTimeout: "60",
        }),
      );
      if (error) return error;
    }
    state.completed.add(`addApiAuthConfiguration:${inputs.authType}`);
    if (isPkceOAuthConfiguration) {
      state.completed.add("addApiAuthConfiguration:oauth-pkce");
    }
    return { ok: true, value: output };
  }

  function compileRegenerateDaAction(state, definition) {
    const inputs = definition.with;
    if (
      state.template !== "da/api-plugin-from-existing-api" ||
      state.apiSpecLocation !== regenerateDaActionApiSpecLocation ||
      state.apiOperations !== "all" ||
      !isRecord(inputs) ||
      !hasOnlyFields(inputs, new Set(["operationId"])) ||
      inputs.operationId !== "listRepairs"
    ) {
      return failure(
        "VCB_REGENERATE_DA_ACTION_INPUT_INVALID",
        "The declarative-agent regeneration input is not supported.",
      );
    }
    const output = [];
    let error = append(
      output,
      render(state, "command-palette/execute-command.json.tpl", {
        commandTitle: commandTitles.regenerateDaAction,
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/click-option.json.tpl", {
        optionLabel: "ai-plugin.json",
        preconditions: [
          "dhash:322:77:16:5:00c0202020201060",
          "dhash:322:77:96:5:0000ba40c4b86060",
          "dhash:322:77:0:10:5024226363636421",
        ],
        questionTitle: "Select plugin manifest file",
        x: 322,
        y: 77,
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/click-option.json.tpl", {
        optionLabel: "apiSpecificationFile/openapi.yaml",
        preconditions: [
          "dhash:322:77:16:5:320d225a5a722695",
          "dhash:322:77:96:5:000040aca7606060",
          "dhash:322:77:0:10:6024226363636421",
        ],
        questionTitle: "Select OpenAPI description document file",
        x: 322,
        y: 77,
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/multi-select.json.tpl", {
        questionTitle: "Select operation(s) Copilot can interact with.",
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "dialog/regenerate-da-action-confirm.json.tpl", {}),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "notifications/assert-contains.json.tpl", {
        notificationText: 'Action "action_1" updated successfully.',
        retryTimeout: "120",
      }),
    );
    if (error) return error;
    state.completed.add("regenerateDaAction");
    return { ok: true, value: output };
  }

  function compilePackageApp(state, definition) {
    const inputs = definition.with;
    if (
      !isRecord(inputs) ||
      !hasOnlyFields(inputs, new Set(["environment"])) ||
      !["dev", "local"].includes(inputs.environment)
    ) {
      return failure(
        "VCB_PACKAGE_APP_INPUT_INVALID",
        "The app package input or local Teams entry state is not supported.",
      );
    }
    const packagesDefaultBot =
      state.template === "default-bot" &&
      state.profile === targetAdapters["Debug in Teams (Chrome)"] &&
      state.completed.has("login:m365") &&
      state.completed.has("chat-ready") &&
      inputs.environment === "local";
    const packagesTypeSpec =
      state.template === "da/typespec" &&
      state.completed.has("configureTypeSpecAction") &&
      inputs.environment === "dev";
    if (!packagesDefaultBot && !packagesTypeSpec) {
      return failure(
        "VCB_PACKAGE_APP_INPUT_INVALID",
        "The app package input or entry state is not supported.",
      );
    }
    const output = [];
    let error;
    if (packagesDefaultBot) {
      error = append(
        output,
        render(state, "browser/teams/close-local-app-window.json.tpl", {}),
      );
      if (error) return error;
    }
    error = append(
      output,
      render(state, "command-palette/execute-command.json.tpl", {
        commandTitle: commandTitles.packageApp,
      }),
    );
    if (error) return error;
    const manifestOption = packagesTypeSpec
      ? {
          preconditions: [
            "dhash:442:81:16:5:0c736a0aaafb608c",
            "dhash:442:81:96:5:000028d2d128121c",
            "dhash:442:81:0:10:d0712230b022a00d",
          ],
          x: 442,
          y: 81,
        }
      : {
          preconditions: [
            "dhash:394:76:16:5:21a65953529ab34e",
            "dhash:394:76:96:5:0005804505010000",
            "dhash:394:76:0:10:d0832723b2292168",
          ],
          x: 394,
          y: 76,
        };
    error = append(
      output,
      render(state, "quick-input/click-option.json.tpl", {
        optionLabel: "manifest.json",
        preconditions: manifestOption.preconditions,
        questionTitle: "Select Teams manifest.json File",
        x: manifestOption.x,
        y: manifestOption.y,
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/filter-option.json.tpl", {
        optionLabel: inputs.environment,
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "notifications/assert-contains.json.tpl", {
        notificationText: "App package successfully built at",
        retryTimeout: "120",
      }),
    );
    if (error) return error;
    state.completed.add("packageApp");
    return { ok: true, value: output };
  }

  function compileProvisionWithoutAccount(state, definition) {
    if (
      definition.with !== undefined ||
      state.requiresInitialFileCheck ||
      state.completed.has("login:azure") ||
      state.completed.has("login:m365")
    ) {
      return failure(
        "VCB_PROVISION_WITHOUT_ACCOUNT_INPUT_INVALID",
        "Provision without account requires a checked scaffold with no prior login and no authored input.",
      );
    }
    const output = [];
    let error = append(
      output,
      render(state, "command-palette/execute-command.json.tpl", {
        commandTitle: commandTitles.provision,
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "dialog/assert-m365-account-required.json.tpl", {}),
    );
    if (error) return error;
    state.completed.add("provisionWithoutAccount");
    return { ok: true, value: output };
  }

  function compilePublishDeveloperPortal(state, definition) {
    const credentials = state.credentials.get("m365");
    if (
      definition.with !== undefined ||
      !state.completed.has("packageApp") ||
      credentials === undefined
    ) {
      return failure(
        "VCB_PUBLISH_DEVELOPER_PORTAL_INPUT_INVALID",
        "Developer Portal publishing requires the recorded package and Microsoft 365 credential state with no authored input.",
      );
    }
    const output = [];
    let error = append(
      output,
      render(state, "command-palette/execute-command.json.tpl", {
        commandTitle: commandTitles.publishDeveloperPortal,
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/click-option.json.tpl", {
        optionLabel: "Browse...",
        preconditions: [
          "dhash:457:72:16:5:0000000000000000",
          "dhash:457:72:96:5:2954160010000000",
          "dhash:457:72:0:10:d063676332696128",
        ],
        questionTitle: "Select Your App Package",
        x: 457,
        y: 72,
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "dialog/developer-portal-package-chooser.json.tpl", {}),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "quick-input/click-option.json.tpl", {
        optionLabel: "appPackage.local.zip",
        preconditions: [
          "dhash:393:80:16:5:9c5a543434b1cd48",
          "dhash:393:80:96:5:2494104a6a900000",
          "dhash:393:80:0:10:d063676332696128",
        ],
        questionTitle: "Select Your App Package",
        x: 393,
        y: 80,
      }),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "dialog/open-developer-portal.json.tpl", {}),
    );
    if (error) return error;
    error = append(
      output,
      render(
        state,
        "authentication/browser/developer-portal-sign-in.json.tpl",
        { accountPassword: credentials.accountPassword },
      ),
    );
    if (error) return error;
    error = append(
      output,
      render(state, "browser/developer-portal/publish.json.tpl", {}),
    );
    if (error) return error;
    state.completed.add("publishDeveloperPortal");
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
    const inputs = definition.with;
    if (
      !isRecord(inputs) ||
      !hasOnlyFields(
        inputs,
        new Set(["profile", "profileSelection", "runtimeInputs"]),
      )
    ) {
      return failure(
        "VCB_TARGET_INPUT_INVALID",
        "The target contains an unsupported input.",
      );
    }
    const profileTitle = inputs.profile;
    const profile = targetAdapters[profileTitle];
    if (profile === undefined) {
      return failure(
        "VCB_TARGET_PROFILE_UNKNOWN",
        "The launch profile is not supported by the semantic adapter.",
      );
    }
    if (
      state.template === "custom-copilot-basic" &&
      [
        "Launch Remote in Copilot (Chrome)",
        "Debug in Copilot (Chrome)",
      ].includes(profileTitle) &&
      !state.featureFlags.has(copilotLaunchFeatureFlag)
    ) {
      return failure(
        "VCB_TARGET_PREREQUISITE",
        "The General Teams Agent Copilot target requires its launch feature flag.",
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
    const runtimeInputs = inputs.runtimeInputs;
    const requiresDeferredOpenAIKey = state.deferredOpenAIKey === true;
    if (runtimeInputs !== undefined || requiresDeferredOpenAIKey) {
      if (
        !requiresDeferredOpenAIKey ||
        state.template !== "custom-copilot-rag-custom-api" ||
        state.language !== "python" ||
        profileTitle !== "Debug in Teams (Chrome)" ||
        !isRecord(runtimeInputs) ||
        !hasOnlyFields(runtimeInputs, new Set(["openAIKey"])) ||
        !secretExpressionPattern.test(runtimeInputs.openAIKey ?? "")
      ) {
        return failure(
          "VCB_TARGET_RUNTIME_INPUT_INVALID",
          "The target runtime input does not match a deferred Python Custom API OpenAI key.",
        );
      }
    }

    const output = [];
    let error = append(
      output,
      render(state, "command-palette/execute-command.json.tpl", {
        commandTitle: commandTitles.target,
      }),
    );
    if (error) return error;
    const profileSelectionId = inputs.profileSelection;
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
    if (requiresDeferredOpenAIKey) {
      error = append(
        output,
        render(state, "quick-input/deferred-text.json.tpl", {
          inputValue: runtimeInputs.openAIKey,
          questionTitle: "OpenAI Key",
        }),
      );
      if (error) return error;
    }
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
    const destination = definition.with?.destination;
    const activation =
      typeof destination === "string"
        ? state.profile?.open?.[destination]
        : undefined;
    if (activation === undefined || definition.with?.kind !== activation.kind) {
      return failure(
        "VCB_OPEN_ADAPTER_UNKNOWN",
        "The authored open operation has no compatible target adapter.",
      );
    }
    const output = [];
    if (
      activation.adapter === "teams-add" ||
      activation.adapter === "teams-add-local-page"
    ) {
      let error;
      if (activation.adapter === "teams-add-local-page") {
        // Trusting the certificate before the app opens is what lets the tab
        // render on its first load. Trusting it afterwards leaves an already
        // failed frame that only an in-Teams reload recovers, and that reload
        // races the browser permission prompt Teams raises on the same page.
        error = append(
          output,
          render(
            state,
            "browser/teams/trust-local-tab-certificate.json.tpl",
            {},
          ),
        );
        if (error) return error;
      }
      // The component carries the adapter's converged subject rather than the
      // profile's: the target asserts the app details page this component
      // enters on, and the two clicks in between leave it, for a conversation
      // when a bot was scaffolded and for a tab page when a tab was.
      error = append(
        output,
        render(state, "browser/teams/add-and-open-app.json.tpl", {
          convergedSubject: activation.subject,
          destination,
        }),
      );
      if (error) return error;
      if (activation.adapter === "teams-add-local-page") {
        error = append(
          output,
          render(state, "browser/teams/allow-local-device-access.json.tpl", {}),
        );
        if (error) return error;
      }
    } else if (activation.adapter !== "ready") {
      return failure(
        "VCB_OPEN_ADAPTER_UNKNOWN",
        "The target does not register an open adapter.",
      );
    }
    // A `ready` adapter emits nothing: the target already converged on this
    // destination and asserted this profile's readiness subject with nothing in
    // between, so rendering the same component again would only repeat a claim
    // that cannot fail on its own. The operation still earns its place by
    // declaring which destination and kind the case uses, which the check above
    // rejects when the profile cannot reach it.
    state.completed.add(`${destination}-ready`);
    return { ok: true, value: output };
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
    const replyComponents = {
      copilot: "browser/chat/assert-replied.json.tpl",
      playground: "browser/playground/assert-replied.json.tpl",
      teams: "browser/chat/assert-replied.json.tpl",
    };
    const sendComponent = sendComponents[state.profile?.host];
    const replyComponent = replyComponents[state.profile?.host];
    if (
      sendComponent === undefined ||
      replyComponent === undefined ||
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
      error = append(output, render(state, replyComponent));
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
    if (assertion.expect.namePrefix !== undefined) {
      return render(state, "browser/assert-element-name-prefix.json.tpl", {
        accessibleNamePrefix: assertion.expect.namePrefix,
        role: assertion.expect.role,
      });
    }
    return render(state, "browser/assert-element.json.tpl", {
      accessibleName: assertion.expect.name,
      role: assertion.expect.role,
    });
  }

  function compilePageCheck(state, assertion) {
    if (!state.completed.has("page-ready")) {
      return failure(
        "VCB_PAGE_ADAPTER_UNKNOWN",
        "The page check requires a preceding open operation reaching page-ready.",
      );
    }
    const output = [];
    for (const expectedText of assertion.expect.contains) {
      const error = append(
        output,
        render(state, "browser/page/assert-contains.json.tpl", {
          expectedText,
        }),
      );
      if (error) return error;
    }
    return { ok: true, value: output };
  }

  function compileMessageExtensionCheck(state) {
    const component =
      messageExtensionComponents[state.profile?.host]?.[state.language];
    if (
      state.template !== "default-message-extension" ||
      !state.completed.has("chat-ready") ||
      component === undefined
    ) {
      return failure(
        "VCB_MESSAGE_EXTENSION_ADAPTER_UNKNOWN",
        "The message extension check has no compatible recorded adapter.",
      );
    }
    return render(
      state,
      component,
      state.profile.host === "teams"
        ? { appNameSuffix: state.profile.appNameSuffix }
        : {},
    );
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
        : assertion.type === "browser" || assertion.type === "page"
          ? new Set(["type", "expect"])
          : assertion.type === "chat"
            ? new Set(["type", "send", "allowAction", "expect"])
            : assertion.type === "messageExtension"
              ? new Set(["type"])
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

    if (assertion.type === "messageExtension") {
      return { ok: true };
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
          ? new Set(["role", "name", "namePrefix"])
          : assertion.type === "page"
            ? new Set(["contains"])
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
          ["name", "namePrefix"].filter(
            (field) => expected[field] !== undefined,
          ).length !== 1 ||
          ["name", "namePrefix"].some(
            (field) =>
              expected[field] !== undefined &&
              (typeof expected[field] !== "string" ||
                expected[field].length === 0),
          ))) ||
      (assertion.type === "page" && expected.contains === undefined) ||
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
            : assertion.type === "page"
              ? compilePageCheck(state, assertion)
              : assertion.type === "chat"
                ? compileChatCheck(state, assertion)
                : assertion.type === "messageExtension"
                  ? compileMessageExtensionCheck(state)
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

  return ({ caseId, definition, featureFlags, occurrence }) => {
    let state = states.get(caseId);
    if (definition.type === "scaffold") {
      state = {
        caseId,
        completed: new Set(),
        componentIndex: 0,
        credentials: new Map(),
        featureFlags: new Set(featureFlags ?? []),
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
      case "provisionWithoutAccount":
        return compileProvisionWithoutAccount(state, definition);
      case "pythonEnvironment":
        return compilePythonEnvironment(state, definition);
      case "localEnvironment":
        return compileLocalEnvironment(state, definition);
      case "playgroundEnvironment":
        return compilePlaygroundEnvironment(state, definition);
      case "remoteEnvironment":
        return compileRemoteEnvironment(state, definition);
      case "openAIModel":
        return compileOpenAIModel(state, definition);
      case "localUserEnvironment":
        return compileLocalUserEnvironment(state, definition);
      case "userEnvironment":
        return compileUserEnvironment(state, definition);
      case "projectEnvironment":
        return compileProjectEnvironment(state, definition);
      case "removeWorkspaceFile":
        return compileRemoveWorkspaceFile(state, definition);
      case "configureArmJsonTemplates":
        return compileConfigureArmJsonTemplates(state, definition);
      case "workflowVersion":
        return compileWorkflowVersion(state, definition);
      case "configureTypeSpecAction":
        return compileConfigureTypeSpecAction(state, definition);
      case "addDaCapability":
        return compileAddDaCapability(state, definition);
      case "addDaAction":
        return compileAddDaAction(state, definition);
      case "addApiAuthConfiguration":
        return compileAddApiAuthConfiguration(state, definition);
      case "regenerateDaAction":
        return compileRegenerateDaAction(state, definition);
      case "packageApp":
        return compilePackageApp(state, definition);
      case "publishDeveloperPortal":
        return compilePublishDeveloperPortal(state, definition);
      case "share":
        return compileShare(state, definition);
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
