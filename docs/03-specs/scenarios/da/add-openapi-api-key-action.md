# Add OpenAPI API-Key Action

## Scope

This scenario covers adding an action from an existing OpenAPI document whose selected operations use API-key authentication, or adding API-key or bearer-token authentication to an existing no-auth OpenAPI action. The CLI may collect the secret value while adding the action or auth configuration, but provision remains the fallback owner when no value is supplied.

## Acceptance Criteria

| ID                     | Tier | Given                                                                                                     | When                                            | Then                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ---- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SCN-ADD-OPENAPI-KEY-01 | L1   | `atk add action --api-plugin-type api-spec` and selected operations use API-key authentication            | CLI options/questions are inspected             | optional `--api-key` is available; interactive CLI shows a password-style optional question; VS Code does not show it                                                                                                                                                                                                                 |
| SCN-ADD-OPENAPI-KEY-02 | L1   | API-key value supplied, with v4 either off or on                                                          | add action completes                            | `apiKey/register` includes `primaryClientSecret: ${{SECRET_<SAFE_AUTH_NAME>_API_KEY<UNIQUE_SUFFIX>}}`, where `<UNIQUE_SUFFIX>` matches the suffix allocated to a non-default registration ID; plaintext is absent from workflow YAML and regular environment files; the value is persisted through encrypted user-environment storage |
| SCN-ADD-OPENAPI-KEY-03 | L1   | API-key value omitted, with v4 either off or on                                                           | add action completes                            | `apiKey/register` has no `primaryClientSecret`, no API-key secret is persisted, and the existing provision-time question remains available                                                                                                                                                                                            |
| SCN-ADD-OPENAPI-KEY-04 | L2   | basic declarative agent and the repair-service OpenAPI URL, with v4 off/on and API-key supplied/omitted   | real `node cli.js add action` commands run      | all four runs succeed and satisfy SCN-ADD-OPENAPI-KEY-02 or SCN-ADD-OPENAPI-KEY-03 as applicable                                                                                                                                                                                                                                      |
| SCN-ADD-OPENAPI-KEY-05 | L1   | separate OpenAPI actions use the same API-key security-scheme name                                        | each action is added with an API-key value      | each registration references and persists a distinct secret name using its registration uniqueness suffix; adding a later action does not overwrite an earlier action's key                                                                                                                                                           |
| SCN-ADD-OPENAPI-KEY-06 | L1   | `atk add auth-config --api-auth api-key` targets an existing no-auth OpenAPI action                       | CLI options/questions are inspected             | optional `--api-key` is available; interactive CLI shows a password-style optional question; VS Code does not show it                                                                                                                                                                                                                 |
| SCN-ADD-OPENAPI-KEY-07 | L1   | API-key value supplied to `add auth-config`, with v4 either off or on                                     | auth configuration is added                     | `apiKey/register` includes `primaryClientSecret: ${{SECRET_<SAFE_AUTH_NAME>_API_KEY<UNIQUE_SUFFIX>}}`; plaintext is absent from workflow YAML and regular environment files; the trimmed value is persisted through encrypted user-environment storage                                                                                |
| SCN-ADD-OPENAPI-KEY-08 | L1   | API-key value omitted or blank in `add auth-config`, with v4 either off or on                             | auth configuration is added                     | `apiKey/register` has no `primaryClientSecret`, no API-key secret is persisted, and the existing provision-time question remains available                                                                                                                                                                                            |
| SCN-ADD-OPENAPI-KEY-09 | L2   | basic declarative agent with a no-auth repair-service action, with v4 off/on and API-key supplied/omitted | real `node cli.js add auth-config` commands run | all four runs succeed and satisfy SCN-ADD-OPENAPI-KEY-07 or SCN-ADD-OPENAPI-KEY-08 as applicable                                                                                                                                                                                                                                      |
| SCN-ADD-OPENAPI-KEY-10 | L1   | `atk add auth-config --api-auth bearer-token` targets an existing no-auth OpenAPI action                  | CLI options/questions are inspected             | optional `--api-key` is available; interactive CLI shows a password-style optional question; VS Code does not show it                                                                                                                                                                                                                 |
| SCN-ADD-OPENAPI-KEY-11 | L1   | secret value supplied to bearer-token `add auth-config`, with v4 either off or on                         | auth configuration is added                     | `apiKey/register` includes `primaryClientSecret: ${{SECRET_<SAFE_AUTH_NAME>_API_KEY<UNIQUE_SUFFIX>}}`; plaintext is absent from workflow YAML and regular environment files; the trimmed value is persisted through encrypted user-environment storage                                                                                |
| SCN-ADD-OPENAPI-KEY-12 | L1   | secret value omitted or blank in bearer-token `add auth-config`, with v4 either off or on                 | auth configuration is added                     | `apiKey/register` has no `primaryClientSecret`, no secret is persisted, and the existing provision-time question remains available                                                                                                                                                                                                    |

## Flow

```mermaid
flowchart TD
  A[Select OpenAPI operations or existing no-auth action] --> B{Add action or auth config uses API-key registration?}
  B -- No --> C[Existing flow]
  B -- Yes --> D{CLI API key supplied?}
  D -- No --> E[Inject apiKey/register without primaryClientSecret]
  D -- Yes --> F[Persist SECRET safe auth name API_KEY]
  F --> G[Inject only the secret reference]
  E --> H[Provision may collect the key later]
  G --> I[Provision resolves the stored secret]
```

## Boundary

- This scenario does not change OAuth or the behavior of unauthenticated OpenAPI actions before auth configuration is added.
- This scenario does not add an API-key option to the provision command.
- This scenario does not expose the add-time or auth-config secret question in VS Code.
- This scenario does not require the optional value in non-interactive CLI use.

## Invariants

- Plaintext API-key or bearer-token secrets never appear in workflow YAML or regular environment files.
- Secret values are written only through the existing encrypted user-environment path.
- Omitting `--api-key` preserves the existing provision-time collection flow.
- V4 feature state does not change the observable OpenAPI add-action or add-auth-config result.
- Separate OpenAPI registrations never share secret storage merely because their security-scheme names match.
