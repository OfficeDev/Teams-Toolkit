# Semantic VScUse Case Bundles

These YAML files exercise the proposed
[`compile-vscuse-case-bundles`](../../../../../docs/03-specs/operations/product/compile-vscuse-case-bundles.md)
contract. They are compiler inputs, not native `vscuse execute` plans.

See [`legacy-case-mapping.md`](legacy-case-mapping.md) for the generated case to legacy plan
migration inventory and coverage status.

## Initial coverage

| File                                  | Template family                       | Cases | Contract pressure                                                                            |
| ------------------------------------- | ------------------------------------- | ----: | -------------------------------------------------------------------------------------------- |
| `weather-agent.yml`                   | Custom Engine Agent                   |    12 | full LLM x language x Teams launch matrix, Azure lifecycle, Copilot remote/local, Playground |
| `basic-custom-engine-agent.yml`       | Custom Engine Agent                   |     9 | TypeScript, JavaScript, and Python against remote Teams, local Teams, and Playground         |
| `default-bot.yml`                     | Teams Bot                             |     9 | current Teams selector path, three languages, lifecycle boundaries, and chat validation      |
| `default-message-extension.yml`       | Teams Message Extension               |     6 | current Teams selector path, two languages, lifecycle boundaries, and launch profiles        |
| `general-teams-agent.yml`             | General Teams Agent                   |    17 | both LLM branches, three languages, Teams lifecycle matrix, Playground, and Copilot samples  |
| `da-no-action.yml`                    | Declarative Agent                     |     1 | negative file assertions, Copilot agent discoverability                                      |
| `da-mcp-server.yml`                   | Declarative Agent with MCP action     |     3 | conditional auth inputs, pipeline mutations, Copilot discoverability                         |
| `da-api-plugin-from-scratch.yml`      | Declarative Agent with new API action |     2 | language branches and no-auth API plugin output                                              |
| `da-api-plugin-from-existing-api.yml` | Declarative Agent with existing API   |     4 | no auth, API key, bearer, OAuth provision, and remote preview                                |

## Model findings

Authoring these fixtures exposed six gaps in the first contract draft:

1. Product Scenario IDs do not yet exist for every scaffold package. Contract-only cases therefore
   use an active engineering Scenario ID, or an AC ID when the Scenario Spec has no stable ID yet.
2. Hidden questions such as `mcpServerType` may have one available value without displaying a UI
   interaction. Cases omit questions that the user is not prompted to answer; the compiler does not
   duplicate their hidden state. Runtime-discovered local MCP server IDs remain unsupported.
3. Dynamic discovery requires asserting that static tool files are absent. File checks therefore
   support `exists: false`, mutually exclusive with content assertions.
4. The current VS Code create surface may append conditional questions that are not present in the
   v4 template question file. MCP static OAuth asks for client ID, client secret, and optional
   scopes; Entra SSO asks only for client ID; None asks no credential questions. Cases author these
   prompted answers in their observed order; the semantic adapter resolves their visible UI labels.
5. Local debug, remote preview, and Agents Playground all start through VS Code F5. A target therefore
   declares the exact launch title visible after template rendering and `profileSelection: first` or
   `profileSelection: second` for its position after filtering. The semantic adapter maps those
   authored values to lifecycle prerequisites and reusable UI components without inferring picker
   order from the scaffold template.
6. F5 completion and experience activation are distinct failure domains. A target starts its launch
   profile; an explicit `open` declares whether it activates an app or agent and whether it must
   converge to chat or page readiness. The current Teams adapter handles a fresh Add/Open path;
   other entry states require their own deterministic adapter. A `chat` check then sends one turn and
   validates the visible response; `replied: true` supports response-only bots while stable content
   proves capability outcomes.

The default setup parses, validates, and expands these sources, then resolves their semantic steps
through the compiler-owned adapter and reusable components into sixty-three independent runnable VScUse
plans. The case YAML is the only authored template/scenario source. Setup prints the generated-plan
diff before transactionally updating only manifest-owned files. A custom semantic-step adapter may
still be injected by focused compiler and writer tests.

Sources that require compatibility switches declare unique `NAME=true` or `NAME=false` entries in
`featureFlags`; the compiler emits the existing VScUse `feature_flag:` plan metadata convention.

General scenario identity resolution is not implemented yet; the current fixtures retain their
checked-in product or engineering scenario IDs. Local MCP selection is omitted until the test
environment owns a deterministic MCP server interaction fixture.
