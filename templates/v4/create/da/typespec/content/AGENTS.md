---
description: 'Expert guidance for building declarative agents with TypeSpec for Microsoft 365 Copilot using Microsoft 365 Agents Toolkit'
applyTo: '**/*.tsp'
---

# TypeSpec Declarative Agent Development for Microsoft 365 Copilot

## TypeSpec Instructions

- Always use the latest stable version of TypeSpec compiler (`@typespec/compiler` v1.0.0+).
- Use the latest version of `@microsoft/typespec-m365-copilot` for agent-specific decorators and capabilities.
- Write clear and descriptive `@doc` comments for all operations, models, and namespaces.
- Follow semantic versioning for API operations when introducing breaking changes.

## General Instructions

- Make only high-confidence suggestions when reviewing TypeSpec definitions.
- Write TypeSpec with good maintainability practices, including comments explaining design decisions for complex schemas.
- Handle edge cases in action definitions and provide clear error documentation.
- For external APIs or services, document their purpose and integration points in comments.
- Always validate TypeSpec compilation (`npm run compile`) before provisioning.

## Naming Conventions

- Follow PascalCase for namespace names, model names, and operation names (e.g., `PoliciesAgent`, `AgentInfo`, `getAgents`).
- Use camelCase for parameter names and properties (e.g., `@path id: string`, `agentId: string`).
- Use descriptive names that reflect the operation's purpose (e.g., `getPolicies` instead of `getData`).
- Prefix enum members with their context when needed (e.g., `PolicyType.Compliance`, `AgentStatus.Active`).
- Use plural names for collection responses (e.g., `agents: AgentInfo[]` not `agent: AgentInfo[]`).

## Formatting

- Apply consistent indentation (2 or 4 spaces) throughout `.tsp` files.
- Group related imports together at the top of each file.
- Separate logical sections with comment dividers (e.g., `// --- Models ---`).
- Place decorators on separate lines above the element they modify.
- Use multiline format for operations with multiple parameters.
- Ensure consistent spacing around operators and colons in type annotations.
- Add a newline at the end of each file.

## Project Setup and Structure

- Guide users through creating a new declarative agent project using Microsoft 365 Agents Toolkit.
- Explain the purpose of each generated file: `main.tsp` (entry point), `prompts/*.tsp` (Prompts), `actions/*.tsp` (API operations), `env.tsp` (environment variables).
- Demonstrate how to organize code using separate namespaces for actions and models.
- Show proper separation of concerns: agent definition (main.tsp), actions (actions/*.tsp), data models (models.tsp).
- Explain the `m365agents.yml` configuration and how it orchestrates the build and deployment lifecycle.
- Guide users on environment-specific configurations using `env/.env.dev`, `env/.env.prod`.

## TypeSpec Agent Fundamentals

- Declare agents using the `@agent(name, description)` decorator in the main namespace.
- Link instructions to the agent using `@instructions(Prompts.INSTRUCTIONS)` decorator.
- Add conversation starters with `@conversationStarter(#{ title, text })` to guide users. Limit the number of conversation starters to 12.
- Expose actions as operations: `op getPolicies is PoliciesAPI.getPolicies`.
- Trust the TypeSpec type system and define strong contracts for all API operations.

## Agent Decorators

### @agent Decorator

- **Purpose**: Indicates that a namespace represents an agent and provides its basic metadata.
- **Parameters**:
  - `name` (string, localizable, required): The name of the declarative agent. Must contain at least one non-whitespace character and must be 100 characters or less.
  - `description` (string, localizable, required): The description of the declarative agent. Must contain at least one non-whitespace character and must be 1,000 characters or less.
  - `id` (string, optional): The unique identifier of the agent.
- **Usage**:

  ```typespec
  @agent("Policy Assistant", "An agent that helps users find and understand company policies")
  namespace PolicyAgent {
    // Agent implementation
  }
  ```

- **Best practices**:
  - Use clear, descriptive names that convey the agent's purpose.
  - Write concise but informative descriptions that help users understand when to use the agent.
  - Only specify `id` when you need to maintain a specific agent identifier across deployments.

### @instructions Decorator

- **Purpose**: Defines the instructions that guide the agent's behavior.
- **Parameters**:
  - `instructions` (string, not localizable, required): The detailed instructions or guidelines on how the declarative agent should behave, its functions, and any behaviors to avoid. Must contain at least one non-whitespace character and must be 8,000 characters or less.
- **Usage**:

  ```typespec
  @instructions(Prompts.INSTRUCTIONS)
  namespace PolicyAgent {
    // Agent implementation
  }
  ```

- **Best practices**:
  - Store instructions in a dedicated `Prompts` namespace in `instructions.tsp`.
  - Use clear, directive language with keywords like **ALWAYS**, **NEVER**, **MUST**.
  - Provide concrete examples of expected behavior.
  - Keep instructions focused and relevant to the agent's purpose.

### @conversationStarter Decorator

- **Purpose**: Defines conversation starters that guide users on how to interact with the agent.
- **Parameters**:
  - `conversationStarter` (ConversationStarter object, required): An object with `title` (optional) and `text` (required) properties.
- **ConversationStarter Model**:
  - `title` (string, localizable, optional): A unique title for the conversation starter. Must contain at least one non-whitespace character.
  - `text` (string, localizable, required): A suggestion that the user can use to obtain the desired result. Must contain at least one non-whitespace character.
- **Usage**:

  ```typespec
  @conversationStarter(#{ title: "Find Policies", text: "Show me all compliance policies" })
  @conversationStarter(#{ text: "What's the vacation policy?" })
  namespace PolicyAgent {
    // Agent implementation
  }
  ```

- **Best practices**:
  - Limit the number of conversation starters to 12.
  - Use conversation starters to showcase the agent's key capabilities.
  - Make suggestions specific and actionable.
  - Cover diverse use cases to help users understand the agent's range.

### @disclaimer Decorator

- **Purpose**: Displays a disclaimer message to users at the start of a conversation to satisfy legal or compliance requirements.
- **Parameters**:
  - `disclaimer` (Disclaimer object, required): An object with a `text` property.
- **Disclaimer Model**:
  - `text` (string, required): The disclaimer message. Must contain at least 1 non-whitespace character. Characters beyond 500 may be ignored.
- **Usage**:

  ```typespec
  @disclaimer(#{ text: "This agent provides general information only. Consult HR for official policy interpretations." })
  namespace PolicyAgent {
    // Agent implementation
  }
  ```

- **Best practices**:
  - Use disclaimers when the agent handles sensitive information or provides advice.
  - Keep disclaimers concise and under 500 characters.
  - Ensure disclaimers comply with your organization's legal and compliance requirements.
  - Review disclaimers with legal/compliance teams before deployment.

### @behaviorOverrides Decorator

- **Purpose**: Defines settings that modify the behavior of the agent orchestration.
- **Parameters**:
  - `behaviorOverrides` (BehaviorOverrides object, required): An object with optional properties to control agent behavior.
- **BehaviorOverrides Model**:
  - `discourageModelKnowledge` (boolean, optional): Indicates whether the declarative agent should be discouraged from using model knowledge when generating responses.
  - `disableSuggestions` (boolean, optional): Indicates whether the suggestions feature is disabled.
- **Usage**:

  ```typespec
  @behaviorOverrides(#{ discourageModelKnowledge: true, disableSuggestions: false })
  namespace PolicyAgent {
    // Agent implementation
  }
  ```

- **Best practices**:
  - Use `discourageModelKnowledge: true` when you want the agent to rely primarily on provided knowledge sources rather than pre-trained knowledge.
  - Use `disableSuggestions: false` (default) to keep the suggestions feature enabled for better user experience.
  - Test behavior overrides thoroughly to ensure they produce the desired agent behavior.
  - Document the reasons for using behavior overrides in your agent documentation.

### @customExtension Decorator

- **Purpose**: Allows adding custom extension properties to the agent for future extensibility.
- **Parameters**:
  - `key` (string, required): The key name for the custom extension property.
  - `value` (unknown, required): The value for the custom extension property (can be any type).
- **Usage**:

  ```typespec
  @customExtension("customProperty", "customValue")
  @customExtension("featureFlag", true)
  namespace PolicyAgent {
    // Agent implementation
  }
  ```

- **Best practices**:
  - Use custom extensions sparingly and only when needed for specific scenarios.
  - Document the purpose and expected values of custom extensions clearly.
  - Coordinate with Microsoft documentation or support to understand supported custom extensions.
  - Be prepared for custom extensions to be ignored if not recognized by the platform.

## Action Definitions

- Define actions in dedicated namespaces decorated with `@service` and `@server(url)`.
- Use `@actions(metadata)` decorator to provide human-readable names and descriptions.
- Include `descriptionForModel` in action metadata to help the LLM understand when to invoke the action.
- Define operations using HTTP method decorators: `@get`, `@post`, `@put`, `@delete`.
- Specify routes with `@route("/path/{param}")` decorator.
- Use `@path`, `@query`, `@body`, `@header` decorators to define parameter sources.
- Provide default values for optional parameters (e.g., `@query type: PolicyType = PolicyType.Compliance`).
- Document all parameters with `@doc` comments explaining their purpose and constraints.
- Explain error scenarios in operation documentation (e.g., `404: Policy not found`).

## Model Design

- Create reusable models in a dedicated `models.tsp` file.
- Import the `models.tsp` file in the relevant `actions/*.tsp` files.
- Use descriptive model names that reflect their purpose (e.g., `PolicyInfo`, `PolicyResponse`).
- Define enums for fixed value sets (e.g., `enum AgentStatus { Active: "Active", Inactive: "Inactive" }`).
- Use proper TypeSpec primitive types: `string`, `int32`, `int64`, `float64`, `boolean`, `datetime`.
- Nest models when appropriate to avoid repetition and improve clarity.
- Add `@doc` comments to all model properties explaining their meaning and constraints.
- Use optional properties with `?` when fields may be absent (e.g., `days?: int32`).
- Leverage union types for fields that can have multiple types when needed.

## Instruction Crafting

- Write instructions in a dedicated `Prompts` namespace in `instructions.tsp`.
- Structure instructions with clear sections: GUIDELINES, EXAMPLES, SUGGESTIONS.
- Use strong directive keywords: **ALWAYS**, **NEVER**, **MUST** for critical rules.
- Provide concrete examples showing input, function calls, and expected output.
- Explain multi-step workflows explicitly (e.g., "First call getPolicies, then use the ID to call getStatus").
- Include guidance on visualization when using CodeInterpreter capability.
- Document error handling strategies (e.g., "If action fails, explain the issue to the user").
- Keep instructions concise and focused on behavior that the LLM should follow.
- Reference actions by their operation names to create clear associations.

## Environment Configuration

- Never manually edit `env.tsp` — it's auto-generated from `.env` files.
- Store environment-specific values in `env/.env.local`, `env/.env.dev`, `env/.env.prod`, etc.
- Run `npm run generate:env` after modifying `.env` files to regenerate `env.tsp`.
- All environment variables are in the `Environment` namespace.
- Reference environment constants using `Environment.CONSTANT_NAME` in TypeSpec files.
- Use uppercase snake_case for environment variable names (e.g., `APP_NAME_SHORT`, `POLICIES_API_ENDPOINT`).
- Never commit secrets or API keys in `.env` files — use secure storage (e.g., Azure Key Vault).
- Document required environment variables in the project README.

## Validation and Testing

- Always compile TypeSpec before provisioning: `npm run compile`.
- Fix all compilation errors and warnings before moving forward.
- Provision to local environment first: `atk provision --env local`.
- Test the agent in Microsoft 365 Copilot playground with diverse queries.
- Validate that the agent follows instructions (e.g., calls actions in the correct order).
- Test error scenarios: missing parameters, invalid IDs, API failures.
- Verify CodeInterpreter visualizations render correctly.
- Confirm conversation starters appear and work as expected.
- Test with multiple phrasings to ensure consistent agent behavior.
- Create test cases for critical workflows and validate after instruction changes.

## Multi-Step Workflows

- Guide the agent through multi-step workflows with explicit instructions.
- Example: "When the user asks about policies by agent name: 1- Call getAgents to get all agents IDs, 2- Match the user's requested name to an ID, 3- Call getAgentPolicy with that ID."
- Document prerequisite data fetching requirements in instructions.
- Explain fallback behavior when prerequisites fail (e.g., agent not found).
- Use action chaining judiciously to avoid overly complex workflows.

## Capabilities Best Practices

Microsoft 365 Copilot agents support multiple capabilities that extend the agent's functionality. Enable only the capabilities your agent needs.

### General Capability Guidelines

- Enable capabilities explicitly using `op capabilityName is AgentCapabilities.CapabilityName` syntax.
- Only enable capabilities that your agent will actively use — unnecessary capabilities increase complexity.
- Test each capability thoroughly in the Microsoft 365 Copilot playground before deployment.
- Document in your instructions how and when the agent should use each enabled capability.
- Combine capabilities strategically to create powerful multi-modal experiences.
- DO NOT add instructions related to the capabilities.

### WebSearch Capability

- **Enable (unscoped)**: `op webSearch is AgentCapabilities.WebSearch`
- **Enable (scoped)**:

  ```typescript
  op webSearch is AgentCapabilities.WebSearch<TSites = [
    { url: "https://learn.microsoft.com" },
    { url: "https://docs.microsoft.com" }
  ]>
  ```

- **Purpose**: Allows the agent to search the public web for current information.
- **Scoping**:
  - **CRITICAL**: Scoping is done via the `TSites` property in the capability definition, **NOT** in instructions.
  - **NOT scoped**: Omit `TSites` array to allow searching all web content.
  - **Scoped**: Specify `TSites` array with URLs to restrict web search to specific domains/sites.
  - The agent will only search content from the specified URLs when scoped.
  - A maximum of 4 URLs can be used.
- **Best practices**:
  - Use when your agent needs real-time or recent information not available in your APIs.
  - Scope to specific domains when you want to limit search to trusted sources (e.g., company documentation sites).
  - Instruct the agent on when to prefer web search vs. internal actions (e.g., "Use web search only if internal data is unavailable").
  - Guide the agent to cite sources from web results in responses.
  - Be aware that web search results may vary and are not under your control.
  - Consider privacy implications when combining web data with internal data.
- **Example instruction**: "If the user asks about current events or recent news, use web search. Always cite your sources."
- **Example (scoped to Microsoft Learn)**:

  ```typescript
  op webSearch is AgentCapabilities.WebSearch<Sites = [
    { url: "https://learn.microsoft.com" }
  ]>
  ```

### OneDriveAndSharePoint Capability

- **Enable (unscoped)**: `op oneDriveAndSharePoint is AgentCapabilities.OneDriveAndSharePoint`
- **Enable (scoped by URL)**:

  ```typescript
  op od_sp is AgentCapabilities.OneDriveAndSharePoint<ItemsByUrl = [
    { url: "https://contoso.sharepoint.com/sites/ProductSupport" },
    { url: "https://contoso.sharepoint.com/sites/Engineering/Documents/Specs" }
  ]>
  ```

- **Enable (scoped by SharePoint ID)**:

  ```typescript
  op od_sp is AgentCapabilities.OneDriveAndSharePoint<ItemsBySharePointIds = [
    { site_id: "contoso.sharepoint.com,guid,guid", web_id: "guid", list_id: "guid", unique_id: "guid" }
  ]>
  ```

- **Purpose**: Enables the agent to search and access files in the user's OneDrive and SharePoint.
- **Scoping**:
  - **CRITICAL**: Scoping is done via `ItemsByUrl` or `ItemsBySharePointIds` properties in the capability definition, **NOT** in instructions.
  - **NOT scoped**: Omit both `ItemsByUrl` and `ItemsBySharePointIds` arrays to allow access to all OneDrive and SharePoint content available to the user.
  - **Scoped by URL**: Use `ItemsByUrl` with full paths to SharePoint sites, document libraries, folders, or files.
  - **Scoped by SharePoint ID**: Use `ItemsBySharePointIds` for more precise control using SharePoint internal IDs.
  - URLs should be full paths (use "Copy direct link" in SharePoint: right-click → Details → Path → copy icon).
- **Best practices**:
  - Use when your agent needs to work with user documents, spreadsheets, or presentations.
  - Scope to specific sites/folders when you want to limit access to relevant content areas.
  - Respect user permissions — the agent can only access files the user can access.
  - Instruct the agent on file type preferences (e.g., "Prioritize Excel files for financial data").
  - Guide the agent to summarize file contents rather than returning raw data.
  - Combine with CodeInterpreter to analyze data from files (e.g., Excel sheets).
  - Be explicit about file name patterns or document types in instructions.
- **Example instruction**: "When the user asks about project documentation, search SharePoint for files matching the project name. Summarize key findings."
- **Example (scoped to Audits folder)**:

  ```typescript
  op odsp is AgentCapabilities.OneDriveAndSharePoint<ItemsByUrl = [
    { url: "https://contoso.sharepoint.com/Shared%20Documents/Audits" }
  ]>
  ```

### TeamsMessages Capability

- **Enable (unscoped)**: `op teamsMessages is AgentCapabilities.TeamsMessages`
- **Enable (scoped)**:

  ```typescript
  op teamsMessages is AgentCapabilities.TeamsMessages<TeamsMessagesByUrl = [
    { url: "https://teams.microsoft.com/l/team/19%3A..." },
    { url: "https://teams.microsoft.com/l/channel/19%3A..." }
  ]>
  ```

- **Purpose**: Allows the agent to use Teams channels, teams, and meeting chats as knowledge sources.
- **Scoping**:
  - **CRITICAL**: Scoping is done via the `TeamsMessagesByUrl` property in the capability definition, **NOT** in instructions.
  - **NOT scoped**: Omit `TeamsMessagesByUrl` array to allow access to all Teams channels, teams, meetings, 1:1 chats, and group chats available to the user.
  - **Scoped**: Specify `TeamsMessagesByUrl` array with well-formed Teams URLs to restrict access to specific teams, channels, or chats.
  - URLs must be valid Teams links (copy from Teams: team/channel → "..." menu → "Get link to channel/team").
- **Best practices**:
  - Use when your agent needs context from team conversations or project discussions.
  - Scope to specific teams/channels when you want to limit to project-specific or department-specific conversations.
  - Respect user permissions — the agent can only access messages the user can see.
  - Instruct the agent to respect conversation context and thread relationships.
  - Guide the agent to cite message authors and timestamps when referencing Teams content.
  - Be aware of privacy and confidentiality when using Teams messages as knowledge.
  - Consider combining with People capability to provide context about message authors.
- **Example instruction**: "When the user asks about project decisions, search Teams messages for discussions related to the topic. Cite the author and date of relevant messages."
- **Example (scoped to Engineering team)**:

  ```typescript
  op teamsMessages is AgentCapabilities.TeamsMessages<TeamsMessagesByUrl = [
    { url: "https://teams.microsoft.com/l/team/19%3Aengineering-team-id..." }
  ]>
  ```

### Email Capability

- **Enable (unscoped user mailbox)**: `op email is AgentCapabilities.Email`
- **Enable (scoped to specific folders)**:

  ```typescript
  op email is AgentCapabilities.Email<Folders = [
    { folder_id: "Inbox" },
    { folder_id: "SentItems" }
  ]>
  ```

- **Enable (scoped to shared mailbox)**:

  ```typescript
  op email is AgentCapabilities.Email<SharedMailbox = "support@contoso.com", Folders = [
    { folder_id: "Inbox" }
  ]>
  ```

- **Purpose**: Allows the agent to use email from the user's mailbox or a shared mailbox as a knowledge source.
- **Scoping**:
  - **CRITICAL**: Scoping is done via `Folders` and `SharedMailbox` properties in the capability definition, **NOT** in instructions.
  - **NOT scoped**: Omit `Folders` array to allow access to the entire mailbox.
  - **Scoped by folders**: Use `Folders` array with folder IDs (e.g., "Inbox", "SentItems", "Drafts", custom folder names).
  - **Scoped to shared mailbox**: Use `SharedMailbox` property with the shared mailbox email address.
  - Can combine shared mailbox with folder scoping for precise control.
- **Best practices**:
  - Use when your agent needs to answer questions based on email correspondence.
  - Scope to specific folders when you want to limit to relevant email categories (e.g., only customer support emails).
  - Use shared mailboxes for team-wide email knowledge (e.g., support@, sales@).
  - Respect user permissions — the agent can only access emails the user can access.
  - Instruct the agent on how to handle sensitive information in emails.
  - Guide the agent to cite sender, date, and subject when referencing emails.
  - Be aware of privacy and confidentiality when using email as knowledge.
  - Consider date range instructions to focus on recent communications.
- **Example instruction**: "When the user asks about customer inquiries, search emails for relevant correspondence. Summarize key points and include sender and date."
- **Example (scoped to support shared mailbox Inbox)**:

  ```typescript
  op email is AgentCapabilities.Email<SharedMailbox = "support@contoso.com", Folders = [
    { folder_id: "Inbox" }
  ]>
  ```

### People Capability

- **Enable**: `op people is AgentCapabilities.People`
- **Purpose**: Allows the agent to answer questions about individuals in the organization.
- **Scoping**:
  - **NOTE**: This capability does not support scoping parameters.
  - The agent can access information about all people in the organization directory that the user has permission to view.
- **Best practices**:
  - Use when your agent needs to provide information about team members, org structure, or contact details.
  - Instruct the agent on what people-related queries to handle (e.g., "Find contact info", "Who reports to X?").
  - Guide the agent to respect privacy and only share publicly available directory information.
  - Combine with other capabilities to provide context (e.g., Teams messages + People to understand who said what).
  - Be clear about what information is appropriate to share about people.
  - Consider compliance and privacy regulations when enabling this capability.
- **Example instruction**: "When the user asks about team members or contacts, use the People capability to find relevant individuals. Provide names, roles, and contact information."
- **Example**:

  ```typescript
  op people is AgentCapabilities.People;
  ```

### GraphicArt Capability

- **Enable**: `op graphicArt is AgentCapabilities.GraphicArt`
- **Purpose**: Enables the agent to generate images based on user prompts.
- **Scoping**:
  - **NOTE**: This capability does not support scoping parameters.
  - The agent can generate images based on any user prompt.
- **Best practices**:
  - Use when your agent needs to create visual content, diagrams, or illustrations.
  - Instruct the agent on when to generate images vs. describe content textually.
  - Guide the agent on image style preferences (e.g., "Generate professional diagrams", "Use corporate color scheme").
  - Set expectations about generation time and potential limitations.
  - Provide examples of appropriate image generation requests in instructions.
  - Consider content policy and appropriateness of generated images.
  - Inform users that generated images are AI-created and may need review.
- **Example instruction**: "When the user requests visual representations, diagrams, or illustrations, use the GraphicArt capability to generate images. Always describe what the image will show before generating."
- **Example**:

  ```typescript
  op graphicArt is AgentCapabilities.GraphicArt;
  ```

### CopilotConnectors Capability

- **Enable (unscoped)**: `op graphConnectors is AgentCapabilities.CopilotConnectors`
- **Enable (scoped)**:

  ```typespec
  op copilotConnectors is AgentCapabilities.CopilotConnectors<Connections = [
    { connectionId: "policieslocal" },
    { connectionId: "customersupport" }
  ]>
  ```

- **Purpose**: Allows the agent to search content ingested via Microsoft Graph connectors.
- **Scoping**:
  - **CRITICAL**: Scoping is done via the `Connections` generic parameter in the capability definition, **NOT** in instructions.
  - **NOT scoped**: Omit `Connections` parameter to allow access to all Graph connectors available to the user.
  - **Scoped**: Specify `Connections` parameter with connection IDs to restrict to specific connectors.
  - Connection IDs can be found using Microsoft Graph API or admin tools.
- **Best practices**:
  - Use when your organization has external data sources connected via Graph connectors.
  - Scope to specific connectors when you want to limit to relevant external data sources.
  - Ensure Graph connectors are properly configured and content is indexed before enabling.
  - Document the types of data available through each Graph connector in your agent documentation.
  - Guide the agent on when to prefer Graph connector data vs. direct API calls.
  - Test with real indexed content to validate search quality and relevance.
  - Monitor connector health and data freshness.
- **Example instruction**: "Search Graph connectors for customer support tickets when the user asks about customer issues. Provide ticket numbers and summaries."
- **Example (scoped to policies connector)**:

  ```typespec
  op copilotConnectors is AgentCapabilities.CopilotConnectors<Connections = [
    { connectionId: "policieslocal" }
  ]>
  ```

### CodeInterpreter Capability

- **Enable**: `op codeInterpreter is AgentCapabilities.CodeInterpreter`
- **Purpose**: Enables the agent to write and execute Python code for data analysis and visualization.
- **Scoping**:
  - **NOTE**: This capability does not support scoping parameters.
  - The agent can execute Python code for any user request.
- **Best practices**:
  - Use when your agent needs to perform calculations, data transformations, or create visualizations.
  - Ensure data returned from actions is in a format compatible with Python libraries (JSON, CSV-style arrays).
  - Instruct the agent on preferred visualization types (e.g., "Use line charts for trends, bar charts for comparisons").
  - Guide formatting requirements: "Always start y-axis at 0", "Add descriptive titles and axis labels".
  - Test visualizations with sample data to confirm proper rendering.
  - Provide fallback instructions if visualization fails (e.g., "If chart generation fails, provide data in a table").
  - Be aware of execution timeouts for long-running computations.
  - Document any data preparation requirements (e.g., "Ensure dates are in ISO 8601 format").
- **Example instruction**: "When displaying usage trends, use CodeInterpreter to create a line chart with dates on x-axis and usage count on y-axis. Always include a descriptive title."
- **Example**:

  ```typespec
  op codeInterpreter is AgentCapabilities.CodeInterpreter;
  ```

### Meetings Capability

- **Enable**: `op meetings is AgentCapabilities.Meetings`
- **Purpose**: Allows the agent to search meeting content.
- **Scoping**:
  - **NOTE**: This capability does not support scoping parameters.
  - The agent can search through meeting content that the user has access to.
- **Best practices**:
  - Use when your agent needs to access information from meeting transcripts, recordings, or notes.
  - Respect user permissions — the agent can only access meetings the user can see.
  - Guide the agent to cite meeting titles, dates, and participants when referencing meeting content.
  - Consider combining with People capability to provide context about meeting participants.
  - Be aware of privacy and confidentiality when using meeting content as knowledge.
- **Example instruction**: "When the user asks about decisions made in meetings, search meeting content for relevant discussions. Include the meeting date and key participants."
- **Example**:

  ```typespec
  op meetings is AgentCapabilities.Meetings;
  ```

### ScenarioModels Capability

- **Enable**:

  ```typespec
  op scenarioModels is AgentCapabilities.ScenarioModels<Models = [
    { id: "model-id-1" },
    { id: "model-id-2" }
  ]>
  ```

- **Purpose**: Allows the agent to use task-specific models for specialized scenarios.
- **Scoping**:
  - **CRITICAL**: The `Models` parameter is **required** and must contain at least one model ID.
  - Specify `Models` parameter with model IDs to enable specific task-specific models.
  - Model IDs are provided by Microsoft and identify specialized AI models for specific tasks.
- **Best practices**:
  - Use when your agent requires specialized models for domain-specific tasks.
  - Ensure you have the appropriate licenses and permissions for the models you specify.
  - Document which models are being used and their purpose in your agent documentation.
  - Test thoroughly with the specific models to ensure expected behavior.
  - Monitor model availability and updates from Microsoft.
- **Example instruction**: "Use specialized models for domain-specific analysis when processing user queries."
- **Example**:

  ```typespec
  op scenarioModels is AgentCapabilities.ScenarioModels<Models = [
    { id: "specialized-model-id" }
  ]>
  ```

### Dataverse Capability

- **Enable (unscoped)**: `op dataverse is AgentCapabilities.Dataverse`
- **Enable (scoped)**:

  ```typespec
  op dataverse is AgentCapabilities.Dataverse<KnowledgeSources = [
    { hostName: "contoso.crm.dynamics.com" },
    { hostName: "contoso-dev.crm.dynamics.com", skill: "custom-skill-id" }
  ]>
  ```

- **Enable (scoped with tables)**:

  ```typespec
  op dataverse is AgentCapabilities.Dataverse<KnowledgeSources = [
    {
      hostName: "contoso.crm.dynamics.com",
      tables: [
        { tableName: "account" },
        { tableName: "contact" }
      ]
    }
  ]>
  ```

- **Purpose**: Allows the agent to search for information in Microsoft Dataverse.
- **Scoping**:
  - **CRITICAL**: Scoping is done via the `KnowledgeSources` generic parameter in the capability definition, **NOT** in instructions.
  - **NOT scoped**: Omit `KnowledgeSources` parameter to allow access to all accessible Dataverse environments.
  - **Scoped by environment**: Specify `KnowledgeSources` parameter with environment hostnames.
  - **Scoped by tables**: Include `tables` array within a knowledge source to limit to specific Dataverse tables.
  - **Scoped by skill**: Include `skill` property to use a specific skill identifier.
- **Best practices**:
  - Use when your agent needs to access business data stored in Dataverse.
  - Scope to specific environments and tables when you want to limit access to relevant data.
  - Respect user permissions — the agent can only access Dataverse data the user has permission to view.
  - Document the Dataverse schema and table relationships in your agent documentation.
  - Guide the agent on how to interpret Dataverse entity relationships and field meanings.
  - Consider combining with other capabilities for richer experiences (e.g., Dataverse + CodeInterpreter for data visualization).
  - Test with real Dataverse data to ensure proper query formation and result interpretation.
- **Example instruction**: "When the user asks about customer information, search Dataverse for account and contact records. Provide relevant details while respecting data privacy."
- **Example (scoped to specific environment and tables)**:

  ```typespec
  op dataverse is AgentCapabilities.Dataverse<KnowledgeSources = [
    {
      hostName: "contoso.crm.dynamics.com",
      tables: [
        { tableName: "account" },
        { tableName: "opportunity" }
      ]
    }
  ]>
  ```

### Combining Capabilities

- **Multi-modal experiences**: Combine capabilities to create powerful workflows.
  - Example: OneDriveAndSharePoint + CodeInterpreter = "Find the sales Excel file and create a chart showing monthly revenue."
  - Example: WebSearch + GraphConnectors = "Search internal knowledge base first, then supplement with web search if needed."
  - Example: Email + People = "Find emails from my manager and provide their contact information."
  - Example: TeamsMessages + People = "Search our team channel for decisions made by the engineering lead."
  - Example: GraphicArt + WebSearch = "Search for the latest design trends and generate a mockup image."
- **Capability orchestration**: Provide clear instructions on the order of capability usage.
  - Example: "First search SharePoint for the report. If not found, search Graph connectors. If still not found, use web search as a last resort."
  - Example: "When asked about team communications, search Teams messages first, then check emails if no Teams conversations are found."
- **Performance considerations**: Multiple capabilities in one interaction may increase latency.
- **User experience**: Make capability usage transparent by mentioning sources (e.g., "Based on files in your SharePoint...", "According to Teams messages in the Engineering channel...").

## Error Handling

- Document expected error codes in operation comments (e.g., `404: Not found`, `403: Forbidden`).
- Provide guidance in instructions for handling errors (e.g., "If 404, inform user the agent doesn't exist").
- Recommend retry strategies for transient errors (5xx, timeouts) in instructions.
- Avoid retrying client errors (4xx) — they indicate bad requests.
- Return helpful error messages in API responses to aid agent responses.

## API Versioning

- Version API operations when introducing breaking changes (e.g., `getAgents_v1`, `getAgents_v2`).
- Use separate namespaces for different API versions if needed.
- Update agent definitions to reference the latest version explicitly.
- Maintain backward compatibility when possible to avoid disrupting existing agents.
- Document version differences and migration paths in comments.

## Performance Optimization

- Use efficient query patterns to minimize API latency.
- Implement pagination for operations that return large datasets.
- Cache frequently accessed data when appropriate (e.g., agent lists).
- Set reasonable defaults for query parameters (e.g., `limitDays: int32 = 720`).
- Monitor action latency and optimize slow endpoints.
- Explain performance considerations in operation documentation.

## Deployment and DevOps

- Provision to development environment first: `atk provision --env dev`.
- Use environment-specific configurations for each deployment stage.
- Implement health checks for backend APIs referenced by actions.
- Monitor agent usage and action invocations to identify issues.
- Set up CI/CD pipelines for automated compilation, validation, and deployment.
- Document rollback procedures in case of production issues.
- Explain deployment stages and environment promotion in project documentation.

## Security Best Practices

- Never hardcode secrets or API keys in TypeSpec files.
- Use environment variables for sensitive configuration.
- Implement proper authentication for backend APIs.
- Validate all user inputs in backend services, not just in TypeSpec definitions.
- Document authentication requirements in action metadata.
- Review generated manifests for unintended information disclosure.
- Follow principle of least privilege when granting API permissions.
- Conduct security reviews before deploying to production.

## Documentation Standards

- Add `@doc` comments to all public operations, models, and namespaces.
- Explain the purpose of each action in `descriptionForModel`.
- Document parameter constraints (e.g., "GUID format required", "positive integer").
- Provide examples in comments for complex operations.
- Keep documentation up to date when changing TypeSpec definitions.
- Explain design decisions in comments when using non-obvious patterns.
- Reference related operations and models in documentation for discoverability.

## Troubleshooting Common Issues

- **Compilation fails**: Check for syntax errors, missing imports, type mismatches. Read error messages carefully for line numbers and hints.
- **Agent doesn't appear in Copilot**: Verify provisioning succeeded, check manifest validity, clear browser cache and re-authenticate.
- **Agent calls wrong action**: Strengthen instructions with explicit rules, improve `descriptionForModel`, add examples showing correct behavior.
- **CodeInterpreter doesn't visualize**: Ensure capability is enabled, add explicit visualization instructions, verify data format compatibility.
- **Provision hangs**: Check network connectivity, verify Microsoft 365 service health, simplify agent temporarily to isolate issue.
- **Action returns errors**: Review backend API logs, verify authentication, check parameter types and values.

## Advanced Patterns

- **Conditional operations**: Define multiple operations for different query types and guide selection via instructions.
- **Parameterized queries**: Offer flexibility with optional parameters and sensible defaults.
- **Multi-file projects**: Split large agents into logical modules (usage.tsp, feedback.tsp, admin.tsp).
- **Mock data for testing**: Create test harnesses that simulate Copilot requests to validate instruction adherence.
- **Telemetry integration**: Add telemetry to track action usage, latency, and errors for continuous improvement.

## Best Practices Checklist

- [ ] Compile TypeSpec without errors before provisioning
- [ ] Provide clear `@doc` comments for all operations and models
- [ ] Define strong types for all parameters and responses
- [ ] Include `descriptionForModel` for all actions
- [ ] Write explicit, testable instructions with examples
- [ ] Handle error scenarios gracefully
- [ ] Use environment variables for configuration
- [ ] Add conversation starters to guide users
- [ ] Version API operations for breaking changes
- [ ] Document deployment and rollback procedures
- [ ] Monitor agent usage and performance
- [ ] Gather user feedback and iterate on instructions
- [ ] Keep dependencies up to date

---

**Remember**: TypeSpec is your contract. Write it clearly, compile it often, test it thoroughly, and deploy it confidently. The agent's quality reflects the clarity of your TypeSpec definitions and instructions.
