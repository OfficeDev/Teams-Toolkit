# Changelog
> Note: This changelog only includes the changes for the stable versions of Microsoft 365 Agents Toolkit (evolved from Teams Toolkit). For the changelog of pre-released versions, please refer to the [Microsoft 365 Agents Toolkit Pre-release Changelog](https://github.com/OfficeDev/TeamsFx/blob/dev/packages/vscode-extension/PRERELEASE.md).


## 6.10.2 - June 9, 2026

This is a hotfix version.

### Bug Fix
- Resolved an issue causing the "Fetch action from MCP" feature to fail on macOS by using the MCP gateway's tool list directly rather than relying on the VS Code LM tool registry.


## 6.10.1 - June 3, 2026

### New Features

#### Agent evaluation support for Declarative Agent templates
We introduce an evaluation mechanism for all declarative agent (DA) project templates in the form of a predefined `evals/prompts.json` sample dataset. It enhances the development workflow by enabling users to test and refine their agents more effectively. The accompanying project README files have been updated to include an "Evaluating Agents" section, providing step-by-step guidance on using the `@microsoft/m365-copilot-eval` CLI for agent evaluation. Additionally, environment variable placeholders have been added to simplify configuration, improving user experience and speeding up setup.

### Enhancement

#### Re-designed terminate process for port conflict handling
We enhance the developer experience by redesigning how the extension handles port conflicts during debugging. When a port conflict is detected, the terminate process workflow has been restructured to enable smoother and more efficient resolution. This improvement minimizes disruption during local development, ensuring that debugging can resume quickly and with less manual intervention. The updated process is seamlessly integrated into the toolkit’s existing functionality for better usability.

### Bug Fix
- Added trailing newline to repair.yml.tpl for better formatting consistency.
- Updated the Evaluating Agents section in DA template READMEs to include a required project provisioning step before running evaluations. Also reverted previous changes to the TENANT_ID placeholder for greater clarity.

## 6.10.0 - May 22, 2026

### New Features

#### Sovereign cloud support for advanced Declarative Agents (GCC High and DoD)

This release adds end-to-end support for Declarative Agent scenarios in sovereign high-cloud environments, including GCC High and DoD. The implementation updates authentication endpoints, token scopes, and cloud-specific service routing so provisioning and runtime behaviors align with sovereign requirements. It also introduces Teams Graph client flows used by API key, OAuth, and Entra SSO registration paths in these cloud contexts. In ATK VSCode, users targeting sovereign tenants can now run the same agent creation and update flows with cloud-aware handling instead of manual workarounds. Note that the publishing flow for advanced Declarative Agents is not enabled yet because of current-stage limitations.

To switch the cloud environment you are using in ATK, go to User Settings in VS Code and find the setting named `M365 Agents Toolkit: Sovereign Cloud Environment`, then select `GCC M`, `GCC H`, or `DoD`. Note that there is also a native VS Code setting, `Microsoft Sovereign Cloud: Environment`, which must be set to `USGovernment`. Do not confuse these two settings. After configuring both correctly, you can continue using ATK with your government account.

<img width="744" height="288" alt="image" src="https://github.com/user-attachments/assets/27827c9a-7fdf-48e1-a29a-8e1a04cff9f4" />

#### New sample introduced in Sample Gallery

The well-received sample `Microsoft Foundry Agent to Microsoft 365 Copilot With SSO`, which was previously available for C# and JavaScript, is now also available in Python in our Sample Gallery. This sample enables developers to connect or proxy an existing Foundry agent into the Microsoft 365 ecosystem and expose it through familiar M365 surfaces such as Copilot and Teams. It allows Foundry-hosted agents to be surfaced and interacted with through the M365 interface without rebuilding the agent logic, while still benefiting from ATK's standard provisioning, deployment, and developer workflow integration.

### Enhancement

#### Teams app publishing polished for a better experience

The Teams app publish path was enhanced by updating its underlying API service as well. This modernizes the existing publish experience and aligns it with current platform interfaces used across Microsoft 365 app management. The change also included review-request handling adjustments and corresponding test coverage to stabilize publishing behavior. For users running ATK publish operations in VSCode or CLI-driven lifecycle actions, this improves consistency and forward compatibility of app publishing.

#### Create new ai-plugin.json during MCP action update flow

The MCP action update experience now supports creating a brand new ai-plugin.json when one does not already exist. The question model and flow logic were extended so users can select or create target plugin files during update-action operations. This improves first-time MCP setup in Declarative Agent projects by removing a manual pre-step and reducing setup errors. In practical terms, both ATK-based guided flows and VSCode-triggered update action paths now handle missing plugin manifest scenarios more gracefully.

#### Template and manifest schema modernization across Declarative Agent and plugin artifacts

Templates were upgraded to latest schema, including Declarative Agent schema v1.7 and plugin schema v2.4, with related URL/schema alignment updates. App manifest template versions were also advanced in the release train to keep generated projects current with latest manifest capabilities. These updates do not introduce a brand-new scenario by themselves, but they improve generated project correctness and reduce schema drift over time. For users creating new projects from ATK templates, outputs are now better aligned with current manifest expectations.

#### Developer guidance surfaced directly in terminal output for faster issue resolution

Terminal diagnostics were enhanced to include a clearer hint about resolving issues with Copilot. This is an experience improvement to an existing troubleshooting path rather than a brand-new feature area. The update focuses on helping users react faster when a task fails by guiding them to an immediate recovery path in context. In VSCode task terminal usage, this shortens the time from failure to actionable fix.

### Bug Fix
- Fixed macOS Agents Playground startup failure
- Fixed Python Teams agent startup issue
- Fixed manifest validation fallback by preferring local JSON schemas before remote schema URLs
- Fixed blank wizard options caused by missing NLS keys
- Fixed environment file flush timing between lifecycle actions
- Fixed TypeSpec error handling to surface compiler diagnostics instead of ENOENT
- Fixed broker authentication availability after packaging
- Fixed Linux command handling for set-teamsfx-env with semicolons by wrapping in a subshell
- Fixed TDP portal scaffold failures for certain Declarative Agent special-generator templates
- Fixed C# travel agent template compile failures when project names contain dots
- Fixed invalid declarativeAgent.json array-shape errors with clearer diagnostics
- Fixed accessibility issues in Sample Gallery focus and keyboard navigation

## 6.8.0 - Apr 17, 2026


### New Features

#### Declarative Agent + MCP scaffolding in ATK CLI

ATK now supports scaffolding a Declarative Agent (DA) directly from an MCP server and adding MCP actions through the CLI experience. This enables automatic generation of plugin/runtime wiring without manually creating MCP mapping files. Below command is used to create or update a DA action from an MCP server:

```bash
atk add action \
  --api-plugin-type mcp \
  --mcp-da-server-url <your-mcp-server-url> \
  --mcp-tools-file-path <path-to-tools-json> \
  --interactive false
```

You can also:

- Create a DA project from MCP-capable templates, then add MCP actions using the same command.

Note that a reachable MCP server URL and valid tool definitions are required. If the MCP server requires authentication, auth type must be provided and resolvable. If no tools are fetched or selected, a minimal action is generated by design; tools can be added later.

#### CLI broker-based authentication for login

ATK CLI introduced broker-based authentication to improve interactive login reliability and overall sign-in experience on supported environments. A native window will pop-up for users to select account when using below commands:

```bash
atk auth login m365
atk auth login azure
```

Broker mode is automatically used when supported by the runtime and configuration to unblock users who are enabled with token protection policy resulting in not able to login ATK with corporation account. Automatic fallback is applied when broker capability is not present.


#### Azure AI Foundry proxy agent template expansion to include C#

ATK added and matured Azure AI Foundry proxy agent templates, including C# support, making it easier to bring Foundry agents into Microsoft 365 and Copilot surfaces. You can now create a Foundry proxy project via the template selection flow in ATK CLI or VS ATK. Provision and deploy using standard ATK lifecycle commands.


### Enhancement

#### App manifest schema upgrades (v1.25 -> v1.26)

Template and package manifest schemas were upgraded to improve alignment with the latest platform requirements and reduce validation mismatches during packaging and provisioning.

#### Template alias support in CLI create flow

ATK CLI now supports alias names for template IDs, making project scaffolding easier and less error-prone without requiring full canonical IDs. You can now use supported template aliases in `atk create` commands.

#### Declarative Agent OpenAPI action UX improvements

The DA OpenAPI source selection flow was flattened and simplified to improve discoverability and reduce dead-end decision paths when adding API actions.

#### Improved template metadata refresh behavior

Template metadata is now refreshed on startup to reduce stale-cache issues and improve reliability when accessing newly published templates.

#### MCP interoperability updates for newer gateway and API behavior

ATK updated MCP integration paths to align with newer MCP gateway/API responses, reducing breakages caused by upstream contract changes.

### Bug Fix

- **Fixed missing schema in DA MCP template output**: Corrected a missing schema reference in DA MCP template artifacts, reducing editor validation and tooling errors.

- **Fixed Python template path and task wiring issues**: Resolved multiple Python template issues (symlink paths, task wiring, debug launch flow), improving out-of-box run and debug experience.

- **Fixed keytar-missing exception in CLI**: Improved CLI handling when keychain dependencies are missing, preventing login and runtime crashes in affected environments.

- **Fixed Linux PATH separator issues in playground tasks**: Updated task command generation to use Linux-compatible path separators in playground flows.

- **Fixed MCP server labels, tags, and CLI/VS Code integration regressions**: Resolved multiple MCP-related issues, including deprecated tag handling, MCP question flow problems, and CLI/VS Code integration regressions.

- **Fixed macOS playground startup issue**: Resolved playground startup failures on macOS under affected scenarios.

- **Fixed template compatibility for Teams SDK 2.0.7**: Corrected tab and message extension templates to prevent SDK-related build and runtime issues.

- **Fixed Python Teams agent startup issue**: Resolved startup failures in the Python Teams agent template runtime flow.

- **Fixed security and dependency issues**: Updated dependency chains to address warnings and vulnerabilities (including `node-fetch`, `glob`, `shx`, and `punycode`).

- **Fixed CLI login variable naming bug**: Corrected a variable naming issue affecting certain authentication flows.


## 6.6.1 - Mar 26, 2026
Hotfix version.

Enhanced the MCP tools integration for Declarative Agents to automatically retrieve all parameters defined in MCP tool definitions.

## 6.6.0 - Mar 9, 2025

This is a stable release that brings streamlined MCP integration to declarative agent development, sovereign cloud support and expanded AI capabilities. Below you'll find a comprehensive list of new features and enhancements included in this release:

### New Features
- **ATK Supports Government Cloud GCC-M Now**

Agents Toolkit is actively expanding support for building apps in Government Community Cloud (GCC), GCC High, Department of Defense (DoD), and Teams operated by 21Vianet environments.

Support for GCC‑Moderate (GCC‑M) is now available in this release, so project creation and cloud operations can target GCC-M Azure/M365 environments. Support for GCC High and DoD environments are not available yet, but both are on our roadmap. Updates will be shared as soon as they are ready.

To switch the cloud environment you are working on in ATK, go to user settings in VS Code and find the setting `M365 Agents Toolkit: Sovereign Cloud Environment`, and set the value to `GCC M`. Then you are ready to continue your journey with ATK using your government account.

<img width="818" height="257" alt="gcc" src="https://github.com/user-attachments/assets/03476d1d-a876-4294-bbbc-b12a77c478f1" />

- **Embedded Knowledge Support for Declarative Agents**

We're excited to introduce Embedded Knowledge support in the Declarative Agent workflow, making it easier to ground your agents in project-specific content and deliver more accurate, context-aware responses. You can now include local knowledge files as part of agent configuration. This allows your agent to directly use curated knowledge sources that are packaged and deployed with the agent itself, without relying solely on external or runtime knowledge connections.

Open your declarative agent project, in the ATK menu, find the option to `Add Capability`, select `Embedded Knowledge`, then you can choose the file you want to add.

<img width="1018" height="484" alt="EK_DA" src="https://github.com/user-attachments/assets/15f910f6-229a-4b2a-b242-5eebc9c35e04" />

- **New CLI Command: atk init - Initialize Your Teams Projects with Agents Toolkit**

We're introducing a new Agents Toolkit CLI command: `atk init`, designed to help you bring existing agent or Teams app projects into the Agents Toolkit (ATK) workflow — without starting from creating new projects in ATK. The new `atk init` command lets you convert an existing project into an ATK‑compatible project. This is especially useful if you already have an agent or app package (for example, a prebuilt ZIP created using other tooling) and want to adopt ATK for provisioning, configuration, and lifecycle management.

This capability was introduced to unblock scenarios where developers want to reuse existing assets while benefiting from ATK's standardized project structure and tooling support. To try the new command, download ATK CLI [v 1.1.5](https://www.npmjs.com/package/@microsoft/m365agentstoolkit-cli?activeTab=readme) and ensure you set feature flag `TEAMSFX_GENERATE_CONFIG_FILES` to `true`.

- **New Templates Making Microsoft Foundry Agents available in Microsoft 365 Copilot and Teams in CLI**

A new Microsoft Foundry agent template is now available in the ATK CLI, enabling developers to connect or proxy an existing Foundry agent into the Microsoft 365 ecosystem and expose it through familiar M365 surfaces such as Copilot and Teams, allowing Foundry‑hosted agents to be surfaced and interacted with via the M365 interface without rebuilding the agent logic, while benefiting from ATK's standard provisioning, deployment, and developer workflow integration.

- **Integrate MCP Tools to Declarative Agents**

This was a preview feature from last stable version. The feature was designed to support for integrating Model Context Protocol (MCP) tools into Declarative Agents through actions or plugins. Now this capability becomes generally available and we made enhancement after incorporating early feedback. Compared to the initial version, we improved how MCP tool definitions are managed and referenced in agent configuration. This experience fetches more detailed tool definitions and stores them in a separate, dedicated file. Instead of embedding full tool definitions directly in the plugin configuration. This change improves clarity, structure, and maintainability when working with MCP‑backed tools.


### Enhancement 

- **Enhanced Share Declarative Agents to Others**

Share declarative agents to others is a feature introduced in last stable version, in this release we have refined the share flow to be streamlined, offered clearer environments differentiation during provision, improved the error handling to clearly explain the limitation and related guidance doc to reduce confusion when debugging or provisioning the agents. For more details please see [Share Declarative Agents with Others](https://github.com/OfficeDev/microsoft-365-agents-toolkit/wiki/Share-Declarative-Agents-with-Other).


- **Modernize Template Configurations and Schema Updates Handling**

We've made a set of improvements to templates configurations and schema handling to modernize the developer experience and reduce inconsistencies across environments. This brings more consistent scaffolding output across projects and fewer environment‑specific surprises when moving between local, dev, and other environments. Together resulting in fewer validation mismatches and better alignment with latest platform expectations.

### Bug Fix

- Fixed provisioning failures caused by incompatible properties.  
  PRs: [#15098](https://github.com/OfficeDev/microsoft-365-agents-toolkit/pull/15098)

- Fixed script output parsing, semicolon handling, cross-shell execution, and real-time terminal output behavior.  
  PRs: [#15160](https://github.com/OfficeDev/microsoft-365-agents-toolkit/pull/15160), [#15202](https://github.com/OfficeDev/microsoft-365-agents-toolkit/pull/15202), [#15299](https://github.com/OfficeDev/microsoft-365-agents-toolkit/pull/15299), [#15234](https://github.com/OfficeDev/microsoft-365-agents-toolkit/pull/15234), [#15277](https://github.com/OfficeDev/microsoft-365-agents-toolkit/pull/15277)

- Fixed workflow schedule execution and permission issues in automation pipelines.  
  PRs: [#15210](https://github.com/OfficeDev/microsoft-365-agents-toolkit/pull/15210), [#15219](https://github.com/OfficeDev/microsoft-365-agents-toolkit/pull/15219), [#15221](https://github.com/OfficeDev/microsoft-365-agents-toolkit/pull/15221)

- Fixed template retrieval, missing dependency wiring, schema/manifest handling, and VS template dependency conflicts.  
  PRs: [#15248](https://github.com/OfficeDev/microsoft-365-agents-toolkit/pull/15248), [#15275](https://github.com/OfficeDev/microsoft-365-agents-toolkit/pull/15275), [#15345](https://github.com/OfficeDev/microsoft-365-agents-toolkit/pull/15345), [#15350](https://github.com/OfficeDev/microsoft-365-agents-toolkit/pull/15350)

- Fixed user-assigned identity deployment and silent subscription-fetch fallback behavior.  
  PRs: [#15328](https://github.com/OfficeDev/microsoft-365-agents-toolkit/pull/15328), [#15286](https://github.com/OfficeDev/microsoft-365-agents-toolkit/pull/15286)

- Fixed inline MCP description and related output edge cases.  
  PRs: [#15281](https://github.com/OfficeDev/microsoft-365-agents-toolkit/pull/15281)

## 6.4.3 - Jan 16, 2026

Hotfix version.

### Enhancement
- Refined the telemetry collection algorithm to deliver more accurate and reliable data insights, ensuring better decision-making and performance tracking.
- Improved the pop-up notification logic to minimize false reminders for non-ATK projects, providing a more focused and streamlined user experience.

## 6.4.2 - Dec 15, 2025

Hotfix version.

### Enhancement
- Improved the Agents Playground installation flow to make setup more reliable and reduce potential debugging failures caused by installation issues.
- Updated Teams message extension template to prevent npm build errors triggered by certain parameter types, ensuring a smoother development experience.

## 6.4.1 - Nov 17, 2025

Hotfix Version.

### Enhancement
Increased retry duration for the Check Status API to reduce 429 (Too Many Requests) errors during local debugging or provisioning.

## 6.4.0 - Nov 14, 2025

Building on the incremental enhancements previously introduced in the [prerelease version](https://github.com/OfficeDev/microsoft-365-agents-toolkit/blob/dev/packages/vscode-extension/PRERELEASE.md), this release brings a streamlined developer experience, deeper Teams integration, and expanded AI capabilities. Below you’ll find a comprehensive list of new features and enhancements included in this release:

### New Features
- **Declarative agents: sharing made easy**
 
Users can now share their declarative agents more flexibly — either with all tenant users or with a specific group of users by listing their email addresses. This can be done directly through the ATK UI or via the ATK CLI.
 
To make this simpler, a new “Share” button has been added to the lifecycle management panel, giving you a quick and intuitive way to manage agent access.
<img width="1031" height="661" alt="image" src="https://github.com/user-attachments/assets/7ca5ff5b-02ee-4d90-994a-c8e4f9a9b12f" />
 
> If you are using ATK CLI, share the agent by:`atk share -scope [tenant/users]` or run `atk share -h` to get help.

- **Declarative agents: expanded publish scope**
 
In previous versions, declarative agents were uploaded to Copilot with the default `Personal` scope. With this release, developers can now upload their declarative agents using a `Shared` scope, enabling broader distribution on the Copilot platform.
 
⚠️ Note: If you plan to share an agent with others later, it must be uploaded with the Shared scope from the start.
 
This behavior is controlled through the `AGENT_SCOPE` parameter defined in the environment configuration files. The parameter value is passed to the `extendToM365` action during the `Provision` lifecycle stage.
 
> If you are using ATK CLI, specify the install scope by: `atk install --file-path [Your zip package path] -scope [Shared/Personal] ` or run `atk install -h` to get help.

- **[Preview Feature] Declarative agents: MCP server integration**
  
We’ve added native support for integrating Model Context Protocol (MCP) servers into Declarative Agents through actions. Developers can now easily connect MCP servers via a discovery URL, with auto-generated manifests and authentication scaffolding for quick setup. The feature supports static tool discovery, secure credential handling, and streamlined workflows consistent with ATK standards. This enhancement reduces setup time, ensures a unified developer experience, and enables future-ready flexibility for evolving MCP capabilities.

<img width="1340" height="791" alt="image" src="https://github.com/user-attachments/assets/ee911a1b-5d92-4e7e-a7b8-6ff0dcaae831" />

Quick Start: 1> Click Create New Agent, select Declarative Agent, then choose Add an Action → Start with MCP Server. 2> Once the project is generated, you’ll land on the mcp.json configuration file. 3> Click Start to connect to the MCP server. 4> Finally, select Fetch Actions to retrieve available tools and add them as actions for your agent. 5> Go ahead and provision your agent and start testing in multiple Copilot surface (Copilot in web, Teams, office.com etc)

- **New Templates: Teams Collaborator Agent**

We’ve added a new Teams Collaborator Agent template to ATK, enabling developers to build agents that enhance collaboration in Microsoft Teams. Teams collaboration agents are powered by Teams SDK and assistant daily work across Teams chats, channels, and meetings using secure RSC patterns. They help summarize conversations, automate workflows, extract tasks, answer questions, and boost productivity—right where your team member collaborates. It accelerates development with ready-to-use scaffolding and best practices, helping teams stay organized and productive.

<img width="1189" height="483" alt="image" src="https://github.com/user-attachments/assets/7d87479c-44e6-4c3d-a9c5-2454c1152ae7" />

- **New Sample: AI Foundry to M365 Proxy Agent**
  
We've added a new sample to show how to integrate AI Foundry agents—grounded in SharePoint—into Microsoft 365 Copilot and Teams using Agent Framework v2 and the M365 Agents SDK. It turns a complex, multi-day setup into a secure, two-click experience. You can easily find new samples in "View Samples" from ATK menu.

    What You’ll Learn in this sample:

    * How to connect AI Foundry agents to M365 Copilot and Teams.
    * How to leverage SharePoint grounding for enterprise-ready solutions.
    * How Agent Framework v2 and M365 Agents SDK simplify deployment.
    * Secure identity flow with SSO and user impersonation for SharePoint grounding.
    * How this approach complements the “Publish to M365” feature in the Foundry portal.

- **New Sample using M365 Retrieval API: Travel Agent**

We added a new sample to demonstrate how to build an intelligent travel agent using the Microsoft 365 Agents Toolkit. The agent provides comprehensive travel assistance by answering travel-related questions, helping users understand company travel policies, and finding flights and hotels that comply with organizational guidelines. You can easily find new samples in "View Samples" from ATK menu.

The Travel Agent leverages Azure OpenAI and the Microsoft 365 Retrieval API to access company travel documents and policies stored in SharePoint or OneDrive for Business, providing contextual and policy-compliant travel recommendations directly within Microsoft Teams. 

    This sample illustrates:

    * How to build an intelligent agent using Microsoft 365 Agents Toolkit and .NET 9.0
    * Integration with Azure OpenAI for natural language processing and conversation handling
    * Use of Microsoft 365 Retrieval API to access and search company documents
    * Implementation of custom plugins for specialized travel assistance
    * Authentication and authorization with Microsoft 365 services
    * Deployment and debugging of agents in Microsoft Teams

- **New Sample using Teams SDK: Coffee Agent**
This sample is built with the [Microsoft Teams SDK](https://aka.ms/teams-ai-library-v2), and showcases how easy it is to use activity handlers, adaptive cards, and AI to create a fun, interactive bot with just a few building blocks.

This Coffee Agent helps teams coordinate their daily coffee orders by randomly selecting coffee shops and orderers, managing team coffee orders, and maintaining information about available coffee shops and their offerings. It's perfect for teams that want to streamline their coffee coordination process while having fun with their daily caffeine routine.

    This sample illustrates:
    
    * Use Microsoft 365 Agents Toolkit to create an AI-powered Teams bot
    * Use Microsoft Teams SDK for activity handlers and adaptive cards
    * Implement tool calling and function execution in Teams bots
    * Create interactive experiences with adaptive cards and AI responses
    * Build a collaborative team management bot for daily coordination

- **[Preview] Python templates for Teams Agents and apps is in preview**

The Teams Agents and apps templates which are powered by Teams SDK supports Python language now.

#### Enhancement

- **Important update: single-tenant Bot registration**
 
In this release, ATK is switching from multi-tenant to single-tenant bot registrations to align with Azure Bot Service (ABS) security requirements. ABS is retiring support for multi-tenant bot registrations. All new bot registrations must now use single-tenant configuration. This change enhances security and compliance across Microsoft 365 services.

Multi-tenant registration will be fully blocked. Existing multi-tenant bots will continue to function correctly but should eventually migrate to single-tenant registration. Follow the [migration guide](https://learn.microsoft.com/en-us/azure/bot-service/skill-pva-convert-skill-single-tenant?view=azure-bot-service-4.0) to switch your Azure Bot Service registration to single-tenant.

- **Important update: enforcing MFA**

Starting October 1, 2025, Microsoft Entra MFA enforcement applies to all Create, Update, and Delete operations on Azure resources accessed through the Microsoft 365 Agents Toolkit (ATK) Visual Studio extension. Users without MFA enabled in their tenant will encounter 401 errors for these operations, while read-only actions remain unaffected. Admins should enable MFA for users or configure security defaults to avoid disruptions. See more information in [Mandatory MFA](https://learn.microsoft.com/en-us/entra/identity/authentication/concept-mandatory-multifactor-authentication?tabs=dotnet#enforcement-phases)

- Enhanced the filters and other UI elements in sample gallery for users to easier locate the right sample.
- Updated the [app manifest version to v1.24](https://developer.microsoft.com/json-schemas/teams/v1.24/MicrosoftTeams.schema.json).
- Updated the [TypeSpec version to v1.0](https://www.npmjs.com/package/@microsoft/typespec-m365-copilot)
  
## 6.2.2 - Oct 16, 2025

Hotfix Version.

Add fix for debug telemetry collection.

## 6.2.1 - Sep 29, 2025

Hotfix Version.

Starting October 1st, MFA will be enforced for create, update, and delete operations regarding to Azure resources in VS Code extensions, requiring users to complete MFA setup to avoid 401 errors. This update ensures compliance with Microsoft's global MFA policy and improves security for all extension users.

## 6.2.0 - Sep 18, 2025
This release marks a major step forward in agent development and Teams app innovation, as we comprehensively upgrade Teams agents and app project templates to the new generation **Teams AI Library V2**.

Building on the incremental enhancements previously introduced in the [prerelease version](https://github.com/OfficeDev/microsoft-365-agents-toolkit/blob/dev/packages/vscode-extension/PRERELEASE.md), this release brings a streamlined developer experience, deeper Teams integration, and expanded AI capabilities.

Below you’ll find a comprehensive list of new featuree and enhancements included in this release:

### New Features

- **Comprehensive upgrade Teams Agents and apps templates**

We’re thrilled to announce that in this release, all Teams agents and Teams app project templates have been upgraded to use the next generation and modern Teams SDK — the Teams AI Library V2!

These brand-new templates showcase what’s possible with Teams AI library v2:

Seamless connection to Large Language Models (LLMs) of your choice – plug in OpenAI, Azure OpenAI, or others, all without rewriting your core bot logic.

Built-in support to connect to external data sources (think real-time info, domain-specific content) so your apps stay current, relevant, and responsive.

Deep integration with Teams’ UI: adaptive cards that look and behave like native components, expressive emojis, rich interactive elements, and more.

With these updates, developers can now spin up fully functional Teams agents faster than ever, enjoy a smoother development journey, and deliver delightful user experiences that feel truly native.

<img width="1128" height="686" alt="image" src="https://github.com/user-attachments/assets/cd50a8e4-abc6-4737-8e09-b115868602ac" />

Let’s build smarter, more interactive Teams apps together! 💡

- **TeamsFx SDK Deprecation Notice**
We’re beginning the deprecation process for the TeamsFx SDK. Its core functionalities are now covered by the modern M365 Agents SDK and Teams AI library. While TeamsFx SDK will continue to be maintained, no new features will be added. Full deprecation is planned for July 2026.

### Enhancement 

- Updated the [app manifest version to v1.23](https://developer.microsoft.com/json-schemas/teams/v1.23/MicrosoftTeams.schema.json).
- Updated [Declarative Agents manifest version to v1.5](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/declarative-agent-manifest-1.5).
- Updated [Microsoft 365 Agents SDK to v1.0.0](https://www.npmjs.com/package/@microsoft/agents-hosting).


## 6.0.3 - Jul 19, 2025
Hotfix version

- Add a fix to resolve Agents Playground installation error.
- Add a fix to guide users to switch M365 account or switch tenant if they encounter the tenant mismatch error during debug.

## 6.0.2 - Jun 26, 2025
Hotfix version.

- **Enhanced Agent project generation**

Previously, users could create an Agents project without entering an OpenAI key during the initial question flow. Instead, a prompt to input the key would appear just before debugging. While this provided a smoother experience, it was not generally and consistently applied across agents templates.

This issue has now been resolved. The improved flow is now supported across all templates that requires a Key, ensuring a seamless and consistent project setup experience.

## 6.0.1 - Jun 03, 2025
Hotfix version.

- Updated the [app manifest version to v1.21](https://developer.microsoft.com/json-schemas/teams/v1.21/MicrosoftTeams.schema.json).
- Updated [Declarative Agents manifest version to v1.4](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/declarative-agent-manifest-1.4).
- Updated [Kiota version to 1.26.1](https://github.com/microsoft/kiota/releases/tag/v1.26.1).
- Fixed an issue of telemetry events in Kiota integration.
- Fixed incorrect CLI command name references in the README file and messages prompts in Office add-in projects.
- [Preview] Fixed the typespec projects failure in lifecycle stage Provision.
- [Preview] Updated the typespec package version to latest. Note that the typespec package is rc version now and subject to changes.
- [Preview] Fixed a repository reference issue in typespec projects.

## 6.0.0 - May 19, 2025
This major version upgrade is a milestone as Teams Toolkit evolves to Microsoft 365 Agents Toolkit with a set of awesome new features to provide better development experience for agents building and a brand new icon!

### Introducing Microsoft 365 Agents Toolkit

We’re excited to announce that our product — `Microsoft 365 Agents Toolkit`(evolved from Teams Toolkit). This update reflects our broader vision and ongoing commitment to support a wide range of development scenarios across the Microsoft 365 ecosystem.

As we evolve, we’re expanding beyond Microsoft Teams development to empower developers to build agents for Microsoft 365 Copilot and applications across platforms like Microsoft Teams, Microsoft 365 Copilot, Microsoft 365 apps. This broader scope enables us to deliver a more versatile and comprehensive set of tools, templates, and resources to help you create powerful, integrated solutions.

![ATK animation](https://github.com/user-attachments/assets/96e34da7-06a5-4632-9243-db823e9edb51)

The name — Microsoft 365 Agents Toolkit - better represents the full range of capabilities we now support. We believe this change will help you more easily discover and unlock the potential of building across the Microsoft 365 platforms.

### New Features

- **Use OneDrive and SharePoint as Knowledge Sources in Declarative Agents**

[You can now enhance your declarative agents by connecting them to knowledge sources from OneDrive and SharePoint](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/knowledge-sources). The toolkit allows agents to retrieve grounded, contextually relevant information from files, folders, and sites a user has access to. To get started, open your declarative agent project and select "Add Capability" → "OneDrive and SharePoint."

<img width="882" alt="SP-capability-da" src="https://github.com/user-attachments/assets/9bed27ab-fe7f-4c7e-acb6-989b01d6137b" />

- **Leverage Copilot Connectors in Declarative Agents**

Expand your agent’s knowledge base by integrating Copilot connectors. These connectors let you ingest data from third-party data sources into Microsoft Graph, which can then be used within Microsoft 365 Copilot or through a declarative agent. You can add a Copilot connector when creating a declarative agent or use the "Copilot Connectors" template to build and extend your solution to declarative agents later.

<img width="1088" alt="copilot-connector-in-DA" src="https://github.com/user-attachments/assets/5d9a4e48-a9ba-45a4-a7a3-1797cf0fc3f7" />

- **Kiota Integration for Declarative Agents**

We’ve added [Kiota](https://aka.ms/kiota/docs) integration to streamline working with OpenAPI specifications in declarative agent projects. Developers often need to handle OpenAPI documents when defining actions, this update enables developers to search Open API description documentations and easily regenerate actions. The toolkit now uses Kiota to read, process, and generate code from OpenAPI files—making it easier and more consistent to define and consume external APIs within your declarative agents.

<img width="865" alt="image" src="https://github.com/user-attachments/assets/906dc3a3-ec83-4cb0-a73d-d1a207876a19" />

- **Build a Copilot connector**
  
You can now get started with building a [Copilot connector](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/overview-graph-connector) to bring your enterprise data to Microsoft 365 Copilot and Agents. This create new agent/app experience will help you get started by scaffolding all the code you need (creates connection via the Graph API, registers schema & maps items) to start ingesting items into the Microsoft Graph with a sample REST API datasource (GitHub issues API). Then, you can customize it to your needs and specific data sources to get more value from your enterprise data in Microsoft 365 Copilot! 

<img width="889" alt="image" src="https://github.com/user-attachments/assets/e7600b5a-0c38-4ee5-be35-15dcf7892289" />

- **Build Custom Engine Agent using Microsoft 365 Agents SDK**

We’ve introduced support for building Custom Engine Agents using the [Microsoft 365 Agents SDK](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/agents-sdk-overview?tabs=csharp). This SDK is a flexible framework that allows developers to build and deploy AI-powered agents across multiple channels — such as Microsoft 365 Copilot, Teams, and custom apps — using the AI services of their choice. It simplifies the creation of agentic patterns with built-in support for state, storage, and channel-specific behaviors.

<img width="1089" alt="CEA-Agents-SDK" src="https://github.com/user-attachments/assets/df90331d-fd85-46bc-9d9a-4a1649d6e09c" />

- **Microsoft 365 Agents Playground**
We’re excited to introduce the [Microsoft 365 Agents Playground](https://www.npmjs.com/package/@microsoft/teams-app-test-tool), a component evolved from Teams App Test Tool, which provides a web-based chat environment that simulates the behavior, look, and feel of various channels — such as Copilot and Microsoft Teams — allowing developers to test, debug, and iterate on their agent or app design without the need for complex setup.

<img width="711" alt="Agents-playground" src="https://github.com/user-attachments/assets/daf9307d-84d0-42a3-bda6-d63e801acb14" />

- **[Preview Feature] Use TypeSpec to build Declarative Agent**

To enhance the developer experience for pro-code agent builders, we see strong value in introducing the option that leverages TypeSpec for Microsoft 365 Copilot. This approach provides a type-safe development experience, reduces dependency on JSON files, improves the developer's inner-loop and offer greater flexibility in generating artifacts for your agents and actions.

### Enhancement

- **Smooth installation for Microsoft 365 Agents Playground**: The toolkit will automatically install NodeJS to avoid unnecessary errors in Microsoft 365 Agents Playground installation, for users who don't have NodeJS installed on their machine.

- **Support SharePoint Framework v1.21**: For Teams tab app using SharePoint Framework, we upgrade to support v1.21.

### Bug Fix

- Enhanced compatibility with previous version of YAML files using old names to ensure smoother migration or continued use of existing projects.
  
- Upgraded dependencies like `axios` to address security vulnerabilities.

- Clear error messages for troubleshooting: Enhanced error messages by explicitly showing YAML file names where missing or unresolved environment variables or no valid app catelog. Show clear error messages to make it easier for users to identify and resolve configuration issues.

- Enhanced logging for CDP client and telemetry for agents development activites.

## 5.14.1 - Mar 28, 2025
This patch version update of Teams Toolkit includes several incremental enhancements and bug fixes:
- Updated manifest version for Declarative Agent to v1.3
- Added a warning message for upcomong CLI breaking changes in the next version

## 5.14.0 - Mar 24, 2025
This update represents a minor version increment of the Teams Toolkit, below is a comprehensive list of new features, enhancements, and bug fixes implemented since the last stable release.

### New Features

- **Switch Tenant**: Teams Toolkit now supports switching target tenant for users with multiple tenants in their Microsoft 365 or Azure account. A "Switch Tenant" button is located next to the account information, and the currently logged-in tenant is displayed alongside the account details.

<img width="643" alt="image" src="https://github.com/user-attachments/assets/f4c541ee-f79e-44cc-8f1e-84873a785c0e" />

- **Add Capability For Declarative Agent**: With Teams Toolkit, you can now enhance your Declarative Agent by integrating Web Search capabilities. This allows your agent to access and utilize information from the web, providing more accurate and relevant responses to your customers' queries.

![image](https://github.com/user-attachments/assets/87ebc692-6985-424d-9819-3b263a7e7206)


- **Add Agent Debugging Experience**: To provide a better debugging experience for Agent developers, we have integrated the debugging experience in Microsoft 365 Copilot in-chat debugger (available in developer mode only). You can get a clear picture of what capability and action that your agent is set up with. You can easily view how your agent is executing actions and gain deeper insights into execution details, including success or failure hints for both capabilities and actions.

![image](https://github.com/user-attachments/assets/1db606aa-fbe9-4da5-a6bf-146d1d251abb)


- **Manage Authentication For Declarative Agent**: When adding actions to your Declarative Agent, you might encounter OpenAPI specifications that lack authentication configurations, even though the actual API calls require OAuth. To address this, we introduce commands that assist users to add and manage authentication for their agents. This enhancement would streamline the process and ensure that your API calls are properly authenticated, making it easier to work with your Declarative Agent.

![image](https://github.com/user-attachments/assets/23d7b4b7-962f-4948-a640-2afc0099c657)


- **Enable Adaptive Card Previewer For Declarative Agent**: We understand that designing an adaptive card for the Declarative Agent has been challenging due to compatibility issues with the Adaptive Card Previewer extension. We're excited to announce that we've now added support to preview Adaptive Card, making the process much smoother and more efficient for you. This enhancement ensures that you can seamlessly design adaptive cards without any hassle.

- **GitHub Copilot Extension Walkthrough**: To make it easier for users to get started with the GitHub Copilot Extension "@teamsapp," Teams Toolkit has added a walkthrough UI experience. This guide helps users understand how to install and use this helpful AI assistant to build Teams apps.

<img width="1306" alt="image" src="https://github.com/user-attachments/assets/0af92cf1-c784-4e5c-ac2e-9a6e07133546" />

#### Enhancements


- **Use Existing Entra ID Instead of Always Create New**: Teams Toolkit creates Entra ID during debugging. While users are easily blocked by no permission to create Entra ID in their tenant. Now we improve this process to allow users to use an existing Entra ID which can be created by tenant admin. You will need to input the ID and password to continue.

- **Input OpenAI Key to Debug**: Custom Engine Agent projects require an OpenAI key for debugging. Teams Toolkit now allows users to create these projects without inputting the OpenAI key. However, missing this value will definitely cause a failure in preview and debugging. Therefore, an input box will pop up before debug to remind users of the required value.

<img width="386" alt="image" src="https://github.com/user-attachments/assets/c197d84c-fa87-4269-bfb5-2609c6e00370" />

- **Declarative Agent API Key Authentication**: API Key Authentication in the DA project was implemented using Bearer Tokens in the past. Recently, the Teams platform has added support for developers to specify the key name in the API request header or query URL. As a result, we have updated the corresponding templates to reflect this change.
  
- **Microsoft Entra Manifest**: Teams Toolkit has updated Microsoft Entra app manifest to apply MS Graph format for better integration with platform.

- **Troubleshooting with GitHub Copilot Extension**: Teams Toolkit now improve the troubleshooting experience with GitHub Copilot extension by adding a "Resolve with @teamsapp" button, click this button will ask Teams Toolkit to open the output channel in the editor. Then the GitHub Copilot Chat will use the output log as a reference for troubleshooting requests. Consequently, @teamsapp can read the log and perform troubleshooting.

<img width="412" alt="image" src="https://github.com/user-attachments/assets/60408b17-4cb2-4e80-805f-f554eae05661" />

- **Publish Teams App**: Refine the "Publish Teams App" UI in Teams Toolkit to reduce confusion. Now there are two buttons: one for publishing the Teams app to your organization and the other for publishing your app to the Teams store. The latter will require users to go to the Teams Developer Portal to complete the publishing process.

<img width="432" alt="image" src="https://github.com/user-attachments/assets/c7acfd7c-a29b-4bda-8baa-c3ff5f5c47c9" />

- **Upgrade to Node 22**: All the app templates in Teams Toolkit now are updated to support Node 22.

- **Add streaming experience in App Test Tool** 

- **Security Enhancement**: 1.Consolidate and standardize the Tab templates for quality and security. This involves ensuring consistency in the use of tools and dependencies, such as using npm packages instead of CDNs and updating the Teams JS version. 2. Upgrade python app templates to use MSI authentication when deploying to Azure.


#### Bug Fixes

- Fixed the missing environment variable error `M365_App_ID` when debug Declarative Agent with action. [#12966](https://github.com/OfficeDev/teams-toolkit/pull/12966)

- Microsoft tenant users have issues to login Microsoft 365 account and create Entra ID app, we provide a [workaround guidance](https://stackoverflow.microsoft.com/questions/446689/446691) to help them fix the issue. [#13343](https://github.com/OfficeDev/teams-toolkit/pull/13343)

- Fixed the issue that Tab project shows blank page when remotely preview the app. [#13212](https://github.com/OfficeDev/teams-toolkit/pull/13213)

- Resolve the issue where adding a plugin results in the error message 'Cannot read properties of undefined (reading 'replace')'. [#13422](https://github.com/OfficeDev/teams-toolkit/pull/13422)

- Ensure a seamless experience by addressing the error that occurs when the plugin manifest is located in a subfolder during the zip app package action. [#13349](https://github.com/OfficeDev/teams-toolkit/pull/13349)

- Addressed the issue where the dev tunnel was not forwarding requests, causing the Bot project to be unresponsive during local debugging. This fix ensures a smoother and more reliable debugging experience. [#12730](https://github.com/OfficeDev/teams-toolkit/pull/12730)

- Updated the Welcome page of Teams Toolkit. [#12879](https://github.com/OfficeDev/teams-toolkit/pull/12879)

## 5.12.1 - Jan 23, 2025

Hotfix version.

- Fixed an issue where the API Key and Secret is not using password style input. [#13081](https://github.com/OfficeDev/teams-toolkit/pull/13081)
- Fixed an issue where creating a declartaive agent with an action using Microsoft Kiota might fail in some cases. [#13082](https://github.com/OfficeDev/teams-toolkit/pull/13082)

## 5.12.0 - Dec 17, 2024

This update represents a minor version increment of the Teams Toolkit, introducing new features and addressing user-reported bugs. These incremental enhancements were previously documented in the prerelease version and a blog post: [Teams Toolkit for Visual Studio Code update – November 2024](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-november-2024/)

Below is a comprehensive list of new features, enhancements, and bug fixes implemented since the last stable release.

### New Features

- **Added Local Authentication Support for API ME and API Plugin**: We have introduced local authentication support for application templates of API-ME and API Plugin application with Microsoft Entra and OAuth. which eliminates the anonymous setup for APIs on local environment end to end and also helps developers verify the behavior when Teams and Microsoft 365 Copilot invokes an API without proper authorization. This feature includes built-in middleware that implements the token validation and a guided code tour explains how it works.
![Local Authentication](https://github.com/user-attachments/assets/dbf7173d-d11e-4a8d-b26d-fbfb6abfa976)

- **Process Termination For Port Conflict**: Port conflict is a common pain point for developers when debugging bot applications. It happens when the processes are not fully terminated when debug session stops. Now Teams Toolkit has added additional support to help terminate those unkilled processes to release ports.
![Port Conflicts](https://github.com/user-attachments/assets/208a21d5-0232-470b-a102-620e542a20cb)

- **Integrated with Microsoft Kiota for API Plugin Generation**: Now Teams Toolkit has integrated with [Microsoft Kiota](https://learn.microsoft.com/openapi/kiota/overview) when adding API Plugins into Declarative Agent. With this integration, developers are enabled to create API Plugins by browsing public API catalogs and Microsoft Kiota is capable of handling large OpenAPI Description Document. This is an experimental feature, for early access make sure to turn on [VSCode Settings](https://code.visualstudio.com/docs/getstarted/settings#_workspace-settings) with `Enable Microsoft Kiota`.

- **Using Assistant API on Azure OpenAI Service**: We have previously announced the support for Assistant API on Azure OpenAI Services in Teams Toolkit for Python language, and now it has expanded to TypeScript and JavaScript.

- **Manifest Schema Validation Enhancement**: Added support for manifest schema validation to cover localization files and default language files.

#### Enhancements

- Updated Bot application templates from `restify` to `express` server for better support of Node.js 20.
- Updated Tab application templates from `react-scripts` to `vite` for better performance and developer experience.
- Updated application templates and pre-requisite checker for Node.js 20 support.
- Updated application templates to the latest stable [App Manifest](https://learn.microsoft.com/microsoftteams/platform/resources/schema/manifest-schema#sample-app-manifest) version v1.19.

#### Bug Fixes

- Resolved a build error caused by changes to the `clientCitation` interface. [#12884](https://github.com/OfficeDev/teams-toolkit/pull/12884)
- Addressed persistent port conflict issues encountered by some users when stopping a debug session. [#12881](https://github.com/OfficeDev/teams-toolkit/pull/12881)
- Improved default instructions for Declarative Agent to ensure better compliance. [#12880](https://github.com/OfficeDev/teams-toolkit/pull/12880)
- Resolved an issue where Teams Toolkit could fail to generate authentication actions when creating a declarative agent with an API plugin using Microsoft Kiota. [#12764](https://github.com/OfficeDev/teams-toolkit/pull/12764)
- Update `@azure/storage-blob` to avoid AbortSignal error when deploying with `azureStorage/enableStaticWebsite`. [#12583](https://github.com/OfficeDev/teams-toolkit/pull/12583)
- Upgraded `path-to-regexp` and `body-parser` to fix vulnerability issues. [#12610](https://github.com/OfficeDev/teams-toolkit/pull/12610)
- Fixed an issue where `teamsapp.yml` when adding an API Plugin to the declarative agent. [#12656](https://github.com/OfficeDev/teams-toolkit/pull/12656)

## 5.10.1 - Nov 19, 2024

This patch version update of Teams Toolkit introduces several incremental enhancements:

- **Terminology Update**: The term `Copilot Agent` has been updated to `Agent` in the user interface. [#12672](https://github.com/OfficeDev/teams-toolkit/pull/12672)
- **Debug Session Improvement**: Resolved an issue where child processes were not fully terminated when a debug session was stopped. [#12673](https://github.com/OfficeDev/teams-toolkit/pull/12673)
- **Manifest Validation Fix**: Addressed a problem where manifest validation failed with multi-line user instructions for declarative agents. [#12677](https://github.com/OfficeDev/teams-toolkit/pull/12677)
- **Schema Validation Fix**: Corrected an issue where manifest schema validation was unsuccessful for projects that included an API Plugin. [#12679](https://github.com/OfficeDev/teams-toolkit/pull/12679)

## 5.10.0 - Oct 16, 2024

This update represents a minor version increment of the Teams Toolkit, introducing new features and addressing user-reported bugs. These incremental enhancements were previously documented in the prerelease version and a series of blog posts:

- [July Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-july-2024/): You can now debug Teams apps directly in the desktop client, use managed identities for better security, and clean up development resources more easily.
- [August Prererelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-august-2024/): This update adds enhanced app validation, Python support for intelligent chatbots, and the ability to create custom copilots. It also introduces the Assistant API on Azure OpenAI Service for AI Agents.

Below is a comprehensive list of new features, enhancements, and bug fixes implemented since the last stable release.

### New Features

- **External File Support for Declarative Copilot Instructions**: Developers now have the ability to use an external file to author instructions for their declarative copilots and reference it in the manifest file. This greatly improves the authoring experience for longer instructions compared to using JSON files.
  ![External File](https://github.com/user-attachments/assets/fa13711c-fe8c-4155-bd7f-9e0a8e0ed606)

- **Plugin Integration for Declarative Copilot**: Teams Toolkit now allows developers to add a plugin as a skill to the declarative copilot. Developers can either add a new API plugin using an OpenAPI description document or reference an existing API plugin via its manifest file.
  ![Add Plugin](https://github.com/user-attachments/assets/009a63d0-8bc0-4449-8ba6-cef25779c140)

- **Enhanced App Validation**: Developers can now evaluate their app packages using the same test cases Microsoft employs during app review. The Enhanced App Validation feature in Teams Toolkit identifies any errors or warnings within your app package and provides clear guidelines for resolution. For more details on Microsoft test cases, refer to the [Teams Store validation guidelines](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/teams-store-validation-guidelines) and [Commercial marketplace certification policies](https://learn.microsoft.com/en-us/legal/marketplace/certification-policies).
  ![App Validation](https://github.com/user-attachments/assets/4c2b8c49-6a0a-4ea7-8796-a94464714463)

- **Generate an Intelligent Chatbot with Python**: Following the release of support for building [Custom Engine Copilot](https://learn.microsoft.com/microsoft-365-copilot/extensibility/overview-custom-engine-copilot) during Build 2024, which included the ability to "chat with" your own API, Teams Toolkit now extends this capability to the Python programming language.
  ![App Generator](https://github.com/user-attachments/assets/21efa344-aea5-4d44-bb78-aa8e26dc68a1)

- **Create Declarative Copilot**: Teams Toolkit now allows you to build a declarative copilot, enabling you to customize Microsoft 365 Copilot by declaring specific instructions, actions, and knowledge. Declarative copilots run on the same orchestrator, foundation models, and trusted AI services that power Microsoft Copilot. You can learn more about [declarative copilots here](https://learn.microsoft.com/microsoft-365-copilot/extensibility/overview-declarative-copilot). The toolkit supports the creation of both basic declarative copilots and those with an API plugin.
  ![Declarative Copilot](https://github.com/user-attachments/assets/37412cdd-c7e8-4e38-bd45-794997b050ec)

- **Using Assistant API on Azure OpenAI Service**: The Teams Toolkit has updated the `AI Agent` (Python) app template to support the Assistant API on Azure OpenAI Service. You can now build your own AI Agents on Microsoft 365 using Python, with the option to use either Azure OpenAI Service or OpenAI directly. Support for TypeScript and JavaScript is forthcoming.

- **Debug Apps in Teams Desktop Client**: The Teams desktop client now offers a faster and more reliable way to debug your Teams applications, with the same capabilities available in the Teams web client, such as breakpoints and hot reload. This feature is now available for Custom Engine Copilots, Bots, and Message Extensions apps.
  ![Debug in Desktop](https://github.com/OfficeDev/teams-toolkit/assets/11220663/dc85ee11-e847-40d7-bceb-b5dc3e83f040)

- **Use Managed Identity for Bot and Message Extension when deploying to Azure**: The Teams Toolkit has transitioned from client ID and secret-based identity to user-assigned managed identity for Bot and Message Extension application templates, enhancing security. [Learn more](https://learn.microsoft.com/entra/identity/managed-identities-azure-resources/overview) about the benefits of using managed identities for Azure resources.
  ![MSI](https://github.com/OfficeDev/teams-toolkit/assets/11220663/b2ffddb2-8c04-4ee4-aaaa-ae7c666af6e1)

- **Clean Up Resources Created After Development**: You can now safely clean up resources created after application development by deleting the application registration in the Teams Developer Portal and Bot Framework Portal, and removing uploaded custom apps in Microsoft 365 applications. This can be done via the `teamsapp uninstall` command, either by using the App ID in the Teams application manifest file or by specifying an environment if your project is managed by the Teams Toolkit.
  ![Uninstall](https://github.com/OfficeDev/teams-toolkit/assets/11220663/294447b7-d5f9-47cc-ab37-9235dbd5c111)

- **Integrated CodeTour Instructions for Using Graph Connector Data Source**: The `Chat With Your Data - Microsoft 365` app template in Teams Toolkit now includes interactive CodeTour instructions. By default, the app uses content uploaded to SharePoint, but with these instructions, you can easily switch to a Graph connector data source if you have external content. Learn more about using the [Graph connector](https://learn.microsoft.com/microsoft-365-copilot/extensibility/overview-graph-connector).
  ![Code Tour](https://github.com/OfficeDev/teams-toolkit/assets/11220663/be2eb3d6-0468-4316-8e6f-e8025408045a)

- **Build AI Agent With Assistant API and Python**: Previously we have included the AI Assistant Bot app template to help you get started with building a GPT-like chat bot with AI capabilities using `Teams AI Library`. Now we have added a new AI Agent app template to help you build an AI agent with Assistant API and Python. This template showcases how to build an intelligent chat bot in Teams capable of helping users accomplish a specific task using natural language right in the Teams conversations, such as solving a math problem.

### Enhancemens

- Teams Toolkit will continue to update scaffold app templates to ensure compliance with [Teams Store validation guidelines](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/teams-store-validation-guidelines). The first round of updates focuses on bot templates, including:
  - [PR#12063](https://github.com/OfficeDev/teams-toolkit/pull/12063): Updated `Basic Bot` and `Message Extension`
  - [PR#12096](https://github.com/OfficeDev/teams-toolkit/pull/12096): Updated `Chat Command`
  - [PR#12123](https://github.com/OfficeDev/teams-toolkit/pull/12123): Updated `Chat Notification Messages`
  - [PR#12119](https://github.com/OfficeDev/teams-toolkit/pull/12119): Updated `Sequential Workflow in Chat`
- Teams Toolkit now prompts users to generate an API key before debugging API ME or API Plugin with API Key authentication templates.
- Secret values have been redacted from the Visual Studio Code output channel.
- Updated application templates to use the latest [manifest schema version v1.17](https://learn.microsoft.com/microsoftteams/platform/resources/schema/manifest-schema).
- Improved the readability of error messages generated by the Teams Toolkit.

### Bug Fixes

- Upgraded the axios dependency used in Teams Toolkit to version 1.7.6 to fix a vulnerability issue. [#12306](https://github.com/OfficeDev/teams-toolkit/pull/12306)
- Changed a string for better clarity when creating an `AI Agent` without Assistant API. [#12266](https://github.com/OfficeDev/teams-toolkit/pull/12266)
- Fixed vulnerability issues in TeamsFx SDK. [#11973](https://github.com/OfficeDev/teams-toolkit/pull/11937)
- Resolved compatibility issues with `groupchat` and `groupChat` in the Teams app manifest. [#12028](https://github.com/OfficeDev/teams-toolkit/pull/12028)
- Corrected an issue where the link redirection for the lifecycle `Provision` button was incorrect. [#12120](https://github.com/OfficeDev/teams-toolkit/pull/12120)
- Fixed initialization failures of `publicClientApplication` in TeamsFx SDK. [#12159](https://github.com/OfficeDev/teams-toolkit/pull/12159)
- Addressed issues when creating SharePoint Framework-based tab apps. [#12173](https://github.com/OfficeDev/teams-toolkit/pull/12173)
- Resolved an issue where users still saw a pop-up window when logging into a Microsoft 365 account in non-interactive mode. [#11978](https://github.com/OfficeDev/teams-toolkit/pull/11978)
- Fixed an issue where importing an SPFx project failed due to case-sensitive file systems on Ubuntu. [#11972](https://github.com/OfficeDev/teams-toolkit/pull/11972)
- Addressed an issue where debugging an Outlook Add-in might fail with the error `Package is invalid`. [#11963](https://github.com/OfficeDev/teams-toolkit/pull/11963)
- Corrected unclear error messages for commands that only work for projects created by the Teams Toolkit. [#11945](https://github.com/OfficeDev/teams-toolkit/pull/11945)
- Fixed a vulnerability issue with `ws` affected by a DoS when handling a request with many HTTP headers. [#11937](https://github.com/OfficeDev/teams-toolkit/pull/11937)
- Fixed an issue where sometimes you may not be able to scroll down in Teams Toolkit CLI. [#11762](https://github.com/OfficeDev/teams-toolkit/pull/11762)
- Fixed an issue where Teams Toolkit generated Adaptive Cards may contain empty property. [#11759](https://github.com/OfficeDev/teams-toolkit/pull/11759)
- Fixed an issue where you may need to press enter twice after selecting resource group during provision using Teams Toolkit CLI. [#11724](https://github.com/OfficeDev/teams-toolkit/pull/11724)
- Fixed an issue to enable shell option in Windows platform to avoid [command injection via args parameters](https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2#command-injection-via-args-parameter-of-child_processspawn-without-shell-option-enabled-on-windows-cve-2024-27980---high). [#11699](https://github.com/OfficeDev/teams-toolkit/pull/11699)
- Fixed an issue where provision summary logs are printed twice. [#11658](https://github.com/OfficeDev/teams-toolkit/pull/11658)

## 5.8.2 - Sep 26, 2024

Hotfix version.

- Fixed an issue ([#12143](https://github.com/OfficeDev/teams-toolkit/issues/12143)) where users may encounter an error (`SPFx.LatestPackageInstallFailed`) when creating a Tab with SPFx project.
- Resolved an issue ([#12384](https://github.com/OfficeDev/teams-toolkit/issues/12384)) where users may encounter an error (`AppStudioPlugin.TeamsAppCreateConflict`) during local debugging.
- Updated TypeScript from `4.4.4` to `5.5.4` to avoid build failures for `Custom Engine Agent` templates in [#12462](https://github.com/OfficeDev/teams-toolkit/pull/12462).

## 5.8.1 - May 27, 2024

Hotfix version.

- Resolved an issue that occurred when the Teams Toolkit extension was used with VS Code versions v1.87.2 or earlier. See issue [#11679](https://github.com/OfficeDev/teams-toolkit/issues/11679) for more details.
- Fixed the launch URL issue in the API-based message extension template with Microsoft Entra authentication.
- Fixed an issue where a `Create` label is unexpectedly shown in the Create New App dialog.

## 5.8.0 - May 14, 2024

This update, marking a minor version increment of the Teams Toolkit, incorporates new features and resolves bugs based on user input. Previously, these incremental modifications were detailed in the prerelease version and a series of blog posts:

- [March Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-march-2024/): Included enhancements to the user interface and application templates for custom copilots, introducing a basic AI chatbot and AI agent, along with Python language support for constructing custom copilots using the Teams AI Library.
- [April Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-april-2024/): Introduced the ability to utilize authentication-protected APIs in API-based message extensions, debug message extensions using the Teams App Test Tool, and build custom copilots with retrieval augmented generation employing Azure AI Search, custom APIs, and Microsoft 365 data.

### New Features

- **Create API based Message Extensions using auth-protected API**: Teams Toolkit now supports two forms of API authentication protection for your API-based Message Extension app:
  ![add-auth-api-me](https://github.com/OfficeDev/TeamsFx/assets/113089977/c5faea2f-676b-4a8c-82d6-f3b037e54f0e)

  - API-Key: You can either add the API key of your existing API or, if you don't have one, Teams Toolkit will generate one to demonstrate authentication flow.
  - Microsoft Entra (Azure AD): Teams Toolkit facilitates the creation of Microsoft Entra IDs to authenticate your new API.

- **Debug Message Extensions in Teams App Test Tool**: Developers can now debug and test the message extensions in a web-based environment using the Teams App Test Tool, which emulates Microsoft Teams without requiring tunnels or a Microsoft 365 account. This version extends Teams App Test Tool support to search-based, action-based, and link-unfurling message extension apps.
  ![ME-test-tool](https://github.com/OfficeDev/TeamsFx/assets/113089977/2b55996f-87a9-4683-abaf-3089b7ea878e)

- **Create Intelligent Chatbot with RAG Capability**: The Custom Copilot with RAG capability is an AI-powered chatbot capable of understanding natural language and retrieving domain-specific data to answer questions. Teams Toolkit now supports accessing custom data in Custom Copilot apps. When creating a Custom Copilot app, developers can select 'Chat with your Data' and then choose the desired data source.
  ![access-data-custom-copilot](https://github.com/OfficeDev/TeamsFx/assets/113089977/d40cfc84-8cb8-4816-b587-668a2bcf9560)
  Four types of data sources are available:
  ![data-source-custom-copilot](https://github.com/OfficeDev/TeamsFx/assets/113089977/2d010366-96a0-4f8b-861d-28d5bb9e36b8)

  - `Customize`: Load data from a custom data source, for example, the file system or vector Database.
  - `Azure AI Search`: Load data from Azure AI Search service and use it in conversation with users.
  - `Custom API`: Invoke the API defined in the OpenAPI description document to retrieve domain data from the API service.
  - `Microsoft 365`: Query Microsoft 365 data from the Microsoft Graph Search API as a data source in the conversation.

- **Build Your Own Copilots in Teams with Teams AI Library**: Enhancements have been made to the user experience for developers to create their custom copilots, AI-powered intelligent chatbots for Teams, with the following improvements:
  ![Custom Copilots](https://github.com/OfficeDev/TeamsFx/assets/11220663/0387a2ce-ec39-4c72-aabc-1ec2b9e85d59)
  - Streamlined UX for scaffolding, including top-level entry points and easy configuration of LLM services and credentials during the scaffolding flow.
  - New application templates allowing developers to build an AI Agent from scratch.
  - Python language support for building a `Basic AI Chatbot` and `AI Agent`.

### Enhancements

- The `aadApp/create` action now supports setting `serviceManagementReference` for Entra apps, facilitating referencing application or service contact information from a Service or Asset Management database.
- The `office-addin-manifest` and `office-addin-project` have been upgraded to the latest version to enable the use of the latest version of the manifest schema when importing an existing XML-based Outlook Add-in project.
- The `@azure/identity` and `@azure/msal-node` packages have been updated to the latest version to ensure the security of the authentication process.
- The `teamsjs` dependency in `teamsfx` and `teamsfx-react` has been upgraded to the latest version to ensure compatibility with the latest TeamsJS SDK.

### Bug Fixes

- Fixed an issue in the `teamsapp` CLI, where scrolling down would result in an error when selecting an item of a large index from a list. ([#11521](https://github.com/OfficeDev/TeamsFx/pull/11521))
- Fixed a bug in API-based message extension app templates, where the launch URL pointed to the home page instead of the app installation page. ([#11461](https://github.com/OfficeDev/TeamsFx/pull/11461))
- Fixed a vulnerability issue introduced by the `axios` package. ([#11449](https://github.com/OfficeDev/TeamsFx/pull/11449))

## 5.6.0 - Mar 12, 2024

This minor version update of Teams Toolkit includes new features and bug fixes based on your feedback. The new features include Deploy Tab Apps to Static Web App, Teams Toolkit CLI v3 and many other enhancements. We previously shared these incremental changes in the prerelease version and through a blog post:

- [Janaury Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-january-2024/): Deploy Tab Apps to Static Web App, Teams Toolkit CLI v3, new Link Unfurling sample app and many other enhancements.

We've listened to your feedback and included these additional new features, enhancements, and bug fixes to this release.

New features:

- **Deploy Tab Apps to Static Web App**: Azure Static Web Apps, an automatic service for building and deploying full-stack web apps to Azure from a code repository, is now the default solution for deploying Tab-based applications in Teams Toolkit. If you prefer the old way using Azure Storage, please refer to this [sample](https://github.com/OfficeDev/TeamsFx-Samples/tree/dev/hello-world-tab-codespaces).
- **Teams Toolkit CLI ([`@microsoft/teamsapp-cli`](https://www.npmjs.com/package/@microsoft/teamsapp-cli)) `v3.0.0`**. Teams Toolkit CLI version 3 is now released in stable version. Major changes include:
  ![Teams Toolkit CLI](https://camo.githubusercontent.com/67608a468cbd406d6ff18585c8bc3b34d3d97d0a8ef525bdf516ca23fd5e32dd/68747470733a2f2f616b612e6d732f636c692d6865726f2d696d616765)
  - **New Command Signature**: Teams Toolkit CLI now starts with `teamsapp` as the root command signature for more clarity. We recommend changing your scripts to use `teamsapp` as the command prefix.
  - **New Command Structure**: Teams Toolkit CLI now has a new command structure that is more intuitive and easier to use. You can find the new command structure in the [Teams Toolkit CLI Command Reference](https://aka.ms/teamsfx-toolkit-cli).
  - **New Doctor Command**: `teamsapp doctor` command is a new command that helps diagnose and fix common issues with Teams Toolkit and Teams application development.

Enhancements:

- **Format Reddit Link into Adaptive Card Sample**: This sample application demonstrates how to format a Reddit link into an Adaptive Card in Microsoft Teams conversations.
  ![Link Unfurling Sample](https://github.com/OfficeDev/TeamsFx/assets/11220663/0d44f8c3-d02e-4912-bfa2-6ed3fdb29c1b)
- **Clean up `.deployment` Folder in between Deployments**: Teams Toolkit now cleans up the `.deployment` folder in the build directory before each deployment, addressing a [known issue](https://github.com/OfficeDev/TeamsFx/issues/10075) and reducing deployment time.
- **Optimized Dev Tunnel Expiration**: Inactive Dev Tunnel instances will now be automatically cleaned up after an hour, mitigating Dev Tunnel instance limitation errors.
- **Log Level Settings**: Added log level settings for controlling the verbosity of Teams Toolkit logs. You can find the settings in the [User and Workspace Settings](https://code.visualstudio.com/docs/getstarted/settings) under the `Teams Toolkit` section.
  ![Logs](https://github.com/OfficeDev/TeamsFx/assets/11220663/3a1fc3a0-d69b-446e-8db2-0c756a18f95e)
- **Richer Information in Sample App Details Page**: The Sample app detail page now includes additional details from the project README file, such as the project description, prerequisites, and steps to run the project.
- **Improved Troubleshooting for Multi-tenant Scenario**: Teams Toolkit now provides a [troubleshooting guide](https://aka.ms/teamsfx-multi-tenant) for scenarios where `aadApp/update` action fails with a `HostNameNotOnVerifiedDomain` error in multi-tenant setups.
- **Optimized SPFx Solution Version Handling**: Teams Toolkit now compares the SPFx solution version between global installations and the one used by Teams Toolkit when developers add additional web parts. Developers will be prompted if there's a need to install or upgrade the solution version when differences are detected.

## 5.4.1 - Feb 07, 2024

Hotfix version.

We have made UI and docs updates to multiple places according to the [latest updates to the Microsoft 365 Developer Program](https://devblogs.microsoft.com/microsoft365dev/stay-ahead-of-the-game-with-the-latest-updates-to-the-microsoft-365-developer-program/).

## 5.4.0 - Dec 18, 2023

This minor version update of Teams Toolkit includes new features and bug fixes based on your feedback. The new features include the Adaptive Card Previewer, Teams App Test Tool, new project templates for AI Assistant Bot, and a refreshed Sample Gallery. We previously shared these incremental changes in the prerelease version and through a series of blog posts:

- [October Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-update-october-2023): Search sample app, new Contoso Retail Dashboard sample app, Teams Toolkit CLI improvement.
- [November Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-november-2023): Brand-new AI Assistant Bot App template, Teams app test tool, integrated Adaptive Card Previewer, Refreshed look for Sample Gallery etc.

We've listened to your feedback and included these additional new features, enhancements, and bug fixes to this release.

New features:

- [Preview Feature] AI Assistant Bot App template using Teams AI library and the OpenAI Assistants API. This template demonstrates how to build an intelligent chatbot within Teams.
  ![AI-assistant-bot](https://github.com/OfficeDev/TeamsFx/assets/113089977/13877e7b-cffb-4717-9d1e-587478a43e5d)
- [Preview Feature] Teams App Test Tool removes the need for a lot of the setup to run and debug a Teams bot in a web-based chat environment that is similar to Teams.
  ![Teams app test tool](https://github.com/OfficeDev/TeamsFx/assets/113089977/7f6bcf56-27b3-4a7b-a160-64ab847efd92)
- [Preview Feature] Preview and edit Adaptive Cards effortlessly using the Adaptive Card Previewer now included in Teams Toolkit.
  ![Adaptive Card Previwer](https://github.com/OfficeDev/TeamsFx/assets/113089977/8062f237-d640-45b2-a7b2-81a0a4b0aa10)
- [Generally Available] Navigate quickly through samples using list or grid views. You can also search samples or filter samples by type, capability, and programming language.
  ![New sample gallery UI](https://github.com/OfficeDev/TeamsFx/assets/113089977/cbb18477-1f6d-4ab5-a947-1840d3290e40)
- [Preview Feature] Developing with Microsoft Copilot? We’ve added a helpful license check UI to ensure that your account has the necessary Microsoft Copilot licenses.
  ![Copilot license check](https://github.com/OfficeDev/TeamsFx/assets/113089977/78fa1fc5-0e19-40f0-b324-65583485f743)

Enhancement:

- New samples in the Sample Gallery:
  ![new samples](https://github.com/OfficeDev/TeamsFx/assets/113089977/2af41ec4-ee19-4b66-a58a-d2d8bdbbbd60)

  - Large Scale Notification Bot: send individual chat messages to a large number of users in a tenant
  - Graph Connector Bot: Teams command bot that queries custom data ingested into Microsoft Graph using Graph connector.
  - Contoso Retail Dashboard: demonstrates how to build a dashboard for control layouts. It runs in Teams, Outlook, and the Microsoft 365 app.
  - Teams Conversation Bot using Python: Python example for Teams Bot app.
  - Teams Messaging Extensions Search using Python: Python example for Teams Messaging Extensions app.
  - SSO Enabled Tab via APIM Proxy: Teams tab app that can display user login information with SSO.
  - Ingest Custom API Data into Microsoft 365 with Microsoft Graph Connector: simplify the process of creating a Microsoft Graph connector that ingests data from a custom API to Microsoft Graph

- Recommended Regions in Provision
  ![Provision Region](https://github.com/OfficeDev/TeamsFx/assets/113089977/97867d08-b7af-4eae-b1e7-d0102e1a1361)
- Automatic `npm install` for SPFx Tab App
  ![npm install for SPFx](https://github.com/OfficeDev/TeamsFx/assets/113089977/514d262d-9695-40dc-91aa-5c35044a319d)
- Teams Toolkit CLI Enhancement including: Commands have been reorganized into a hierarchical structure, added a teamsfx list command, improve the help command readability, outputs have been refreshed and log levels have been streamlined for clarity.
- Update Teams AI chat bot template to use latest teams-ai library.

Bug Fixes:

- Resolved an issue causing an No localized strings file found error in Visual Studio Code output. ([#10090](https://github.com/OfficeDev/TeamsFx/pull/10090))
- Fixed a flickering issue when selecting an option in Quick Pick. ([#10100](https://github.com/OfficeDev/TeamsFx/pull/10100))
- Corrected a string typo in the Create a New App dialog. ([#10197](https://github.com/OfficeDev/TeamsFx/pull/10197))
- Fixed the notification store path missing issue when using Test tool for Teams notification bot app. ([#10499](https://github.com/OfficeDev/TeamsFx/pull/10499))

## 5.2.0 - Sep 19, 2023

This minor version update of Teams Toolkit includes new features and bug fixes based on your feedback. The new features include the ability to import an existing SharePoint Framework solution, new project templates for Link Unfurling and AI Chat Bot, and more. We previously shared these incremental changes in the prerelease version and through a series of blog posts:

- [July Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-july-2023): Import an existing SharePoint Framework solution, implement link unfurling in Teams and Outlook.
- [August Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-with-new-ai-chat-bot-template/): Create an AI chat bot with the new AI Chat Bot template.

We've listened to your feedback and included these additional new features, enhancements, and bug fixes to this release.

New features:

- Import an existing SharePoint Framework solution and continue development with Teams Toolkit.
  ![SPFx Existing App](https://github.com/OfficeDev/TeamsFx/assets/11220663/3944f5c8-6c8c-4b4d-8df8-dc4f45b5967f)
- A new link unfurling project template to help you get started with displaying rich content from links in Teams messages and Outlook emails.
  ![Link Unfurling](https://github.com/OfficeDev/TeamsFx/assets/11220663/6e8b982a-0531-4ec1-8420-f6f17955ff40)
- A new AI Chat Bot project template to help you get started with building a GPT-like chat bot with AI capabilities using the [Teams AI Library](https://github.com/microsoft/teams-ai).
  ![AI Bot](https://github.com/OfficeDev/TeamsFx/assets/11220663/86a90d2a-efc3-4d8b-9e8c-5d34a1e8c081)
- The Sample Gallery has a new sample, One Productivity Hub using Graph Toolkit with SPFx, that shows you how to build a Tab for viewing your calendar events, to-do tasks, and files using Microsoft Graph Toolkit components and a SharePoint provider.
  ![SPFx Sample](https://github.com/OfficeDev/TeamsFx/assets/11220663/084ac508-49ea-4b30-854c-8b4d578ff6ee)
- Run life-cycle commands like Provision, Deploy, and Publish using new CodeLens hints added in-line to `teamsapp.yml`` when editing the file.
  ![Inline Commands](https://github.com/OfficeDev/TeamsFx/assets/11220663/f6897b26-0e3c-441c-b028-32093e8322a7)

Bug fixes:

- Fixed an issue where the `Preview` tag for the `AI Chat Bot` project template was not included in previous version. ([#9901](https://github.com/OfficeDev/TeamsFx/pull/9901))
- Fixed an issue where sometimes Teams Toolkit may fail to activate due to an unexpected package dependency on `types/keytar`. ([#9910](https://github.com/OfficeDev/TeamsFx/pull/9910))

## 5.0.1 - June 20, 2023

Incremental version for Teams Toolkit with multiple bug fixes:

- Fixed an issue where older versions of Teams Toolkit CLI and Node.js were referenced in CI/CD templates. ([#8972](https://github.com/OfficeDev/TeamsFx/pull/8972))
- Fixed an issue [#8929](https://github.com/OfficeDev/TeamsFx/issues/8929) in [`teamsApp/create`](https://github.com/OfficeDev/TeamsFx/wiki/Available-actions-in-Teams-Toolkit#teamsappcreate) and [`teamsApp/update`](https://github.com/OfficeDev/TeamsFx/wiki/Available-actions-in-Teams-Toolkit#teamsappupdate) actions where detailed error messages were not printed in output channel when Teams Toolkit failed to create or update app in Teams Developer Portal. ([#8967](https://github.com/OfficeDev/TeamsFx/pull/8967))
- Fixed an issue in [`script`](https://github.com/OfficeDev/TeamsFx/wiki/Available-actions-in-Teams-Toolkit#script) action where not all env output pairs were parsed. ([#8811](https://github.com/OfficeDev/TeamsFx/pull/8811))
- Fixed an issue in [`script`](https://github.com/OfficeDev/TeamsFx/wiki/Available-actions-in-Teams-Toolkit#script) action where charset encoding were not properly handled. ([#8769](https://github.com/OfficeDev/TeamsFx/pull/8769))
- Fixed an issue where the app might fail to start the dev tunnel for local development due to an unexpected token error. ([#8980](https://github.com/OfficeDev/TeamsFx/pull/8980))
- Fixed an issue where migration failed due to the expected path of the `.gitignore` file. ([#8912](https://github.com/OfficeDev/TeamsFx/pull/8912))
- Fixed an issue [#8853](https://github.com/OfficeDev/TeamsFx/issues/8853) in [`botAadApp/create`](https://github.com/OfficeDev/TeamsFx/wiki/Available-actions-in-Teams-Toolkit#botaadappcreate) action where no detailed errors were printed when Teams Toolkit failed to create the app in Microsoft Entra. ([#8910](https://github.com/OfficeDev/TeamsFx/pull/8910))
- Fixed an issue in [`aadApp/create`](https://github.com/OfficeDev/TeamsFx/wiki/Available-actions-in-Teams-Toolkit#aadappcreate) and [`aadApp/update`](https://github.com/OfficeDev/TeamsFx/wiki/Available-actions-in-Teams-Toolkit#aadappupdate) actions where no detailed error messages were printed when Teams Toolkit failed to create or update the app in Microsoft Entra. ([#8911](https://github.com/OfficeDev/TeamsFx/pull/8911))
- Fixed an issue where you might see multiple login prompts when Teams Toolkit failed to retrieve the token by automatically clearing the cache. ([#9026](https://github.com/OfficeDev/TeamsFx/pull/9026))

## 5.0.0 - May 16, 2023

This major version update of Teams Toolkit addresses your top feedback requests with new features and bug fixes, including a new way to customize the automation with composable actions, integrated tunneling support for debugging using Dev Tunnels, simpler project structure and template options, and much more. We previously shared these incremental changes in the prerelease version and through a series of blog posts:

- [February Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-v5-0-prerelease/): Update the fundamental new design for Teams Toolkit that allows you to use existing cloud resources, integrate Teams Toolkit with existing projects and customize Teams Toolkit to fit your needs.
- [March Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-march-2023/): Create, debug and deploy an Outlook Add-in project with Teams Toolkit.
- [April Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-april-2023/): Switch to an integrated and secure tunneling for bot and message extension apps. Introduced GitHub Codespaces for a new getting started experience.

We've listened to your feedback and included these additional new features, enhancements, and bug fixes to this release.

New features:

- Added a how-to guide with instructions for running and debugging apps on mobile clients.
- Simplified the Basic Tab project template by removing the dependency on React, single sign-on, and complicated example code. Use this template like an empty starting point for Tab apps.
- You can customize which version of Azure Functions Core Tools is used with the `devTool/install` action. If not specified, the default version used is `4.0.4670` and [supports Node.js 18](https://learn.microsoft.com/azure/azure-functions/functions-versions?tabs=v4&pivots=programming-language-typescript#languages).
- We've re-categorized the project templates to use familiar terminology that matches the documentation and platform.
  ![create-new-app](https://github.com/OfficeDev/TeamsFx/assets/11220663/fe3ac358-775d-4deb-9b1e-a9eb4d932e56)

Enhancements:

- Removed SPFx version selection when adding additional web parts.
- Updated the `Tab App with Azure Backend` sample to use an on-behalf-of flow for authentication.
- Added a warning message if you're using Node.js 14 because it's [no longer actively supported](https://nodejs.dev/en/about/releases/).

Sample additions:

- `Dice Roller in meeting`: The dice roller example is a simple app that allows multiple users to roll a dice and see the results. This sample is a great way to get started with Live Share and Fluid.
- `Set signature using Outlook add-in`: An Outlook add-in that demonstrates how to set an email signature.

Bug fixes:

- Fixed an issue with `xml2js` package versions that may cause security vulnerabilities. ([#8390](https://github.com/OfficeDev/TeamsFx/pull/8390))
- Fixed an issue where `manifest-file-path` will be asked twice even if it was specified in the parameter for `teamsfx update aad-app` command. ([#8435](https://github.com/OfficeDev/TeamsFx/pull/8435))
- Fixed an issue where the `Validate Application` continues with errors. ([#8467](https://github.com/OfficeDev/TeamsFx/pull/8467))
- Fixed an issue where `teamsfx validate` command will default to `dev` environment even for multi-environment projects in non-interactive cli mode when not specifying `--env` parameters. ([#8499](https://github.com/OfficeDev/TeamsFx/pull/8499))
- Fixed an issue where sometimes Teams Toolkit tree view will not show up if project upgrade detects error.([#8538](https://github.com/OfficeDev/TeamsFx/pull/8538))

## 4.2.5 - May 04, 2023

Incremental version for Teams Toolkit with an enhancement.

- Added a note on pre-requisite checker for usage of [NGROK](https://ngrok.com/).

## 4.2.4 - Feb 28, 2023

Incremental version for Teams Toolkit with an enhancement.

- Updated SharePoint Framework from `1.16.0` to `1.16.1`.

## 4.2.3 - Feb 17, 2023

Incremental version for Teams Toolkit with multiple bug fixes.

- Fixed an unexpected string change in the `create new app` flow.
- Fixed an issue where there's no response when clicking on the `Get Started` button.
- Fixed an issue where you might see `Something went wrong` when adding the bot app on Teams during a debug session.

## 4.2.2 - Feb 7, 2023

Incremental version for Teams Toolkit with multiple bugs fixes and enhancements.

Enhancements:

- Updated pre-requisite checker, applicable app templates and samples to support Node.js 18.
- Updated comments on Notification bot template for how to send notifications to an individual person.
- Updated TeamsFx-React SDK to support React 17.
- Updated TeamsFx SDK, relevant bot app templates and samples to use [CloudAdapter](https://learn.microsoft.com/javascript/api/botbuilder/cloudadapter).
- Updated app templates to use TeamsJS SDK v2.7.1.

Bug fixes:

- Fxied an issue where login page will pop up even after signed into Microsoft 365 account from Teams Toolkit.
- Fixed an issue where it may fail to run ngrok because of whitespaces in path.

## 4.2.0 - Dec 20, 2022

New features:

- Use the new Dashboard tab template to create a personal and collaborative canvas in Teams. Learn more about this new template in the [documentation](https://aka.ms/teamsfx-dashboard-app).

  ![image](https://user-images.githubusercontent.com/11220663/205831064-26f94d61-7bb7-4bc1-8678-c52be6cb27b3.png)

Enhancements:

- Step-by-step guidance in Visual Studio Code to assist you while creating a free Microsoft 365 testing tenant.
- Scaffolds that use SharePoint Framework (SPFx) have been updated to use [SharePoint Framework version 1.16](https://learn.microsoft.com/sharepoint/dev/spfx/release-1.16) which introduces the ability to build experiences for Outlook and Office.com (Microsoft 365 app) in addition to Teams.

## 4.1.3 - Nov 17, 2022

Enhancements:

- Bump up version of [@microsoft/teamsfx](https://www.npmjs.com/package/@microsoft/teamsfx) used in templates and samples to `2.0.0` that depends on [@microsoft/teams-js](https://www.npmjs.com/package/@microsoft/teams-js) version `2.0.0` and above. Starting from this version, it enables [Teams app to run in Outlook and Office.](https://learn.microsoft.com/microsoftteams/platform/m365-apps/overview)
- A/B testing on in-product documentation to display tutorial articles inside Visual Studio Code.

## 4.1.2 - Nov 10, 2022

Hotfix version for Teams Toolkit.

- Fixed bugs in Sample Gallery.

## 4.1.1 - Nov 02, 2022

Enhancements:

- Improved experience to obtain a Microsoft Graph client in [@microsoft/teamsfx](https://www.npmjs.com/package/@microsoft/teamsfx) with separated configration interfaces for different authentication flows.
- Included `useTeams` hook in [@microsoft/teamsfx-react](https://www.npmjs.com/package/@microsoft/teamsfx-react) package. Thanks to its original author [Wictor Wilén](https://github.com/wictorwilen) who first developed this hook in [msteams-react-base-component](https://github.com/wictorwilen/msteams-react-base-component) package.
- Upgraded [@microsoft/teamsfx](https://www.npmjs.com/package/@microsoft/teamsfx) to `2.0.0` that's compatible with [@microsoft/teamjs](https://www.npmjs.com/package/@microsoft/teams-js) `2.0.0` and above.
- Added a shortcut to debug and preview your Teams application from left side tree view under `DEVELOPMENT` section.

## 4.1.0 - Oct 17, 2022

New features:

- Use the new Workflow bot template to create sequential workflows where Adaptive Cards can be returned in response to user input. Learn more about this new template in the [documentation](https://aka.ms/teamsfx-card-action-response).
- Configure each step of the debugging experience in Teams Toolkit by customizing the `.vscode/tasks.json` file, which now [surfaces parameters for finer-tuned control](https://aka.ms/teamsfx-debug-tasks).
- Use the new Add SSO command for a simple way to [configure single sign-on for Message extension and Command bot projects](https://aka.ms/teamsfx-add-sso).
- SPFx developers can now combine web parts as a [multi-Tab Teams app](https://learn.microsoft.com/sharepoint/dev/spfx/build-for-teams-me-experience#build-a-multi-tab-personal-teams-app) using the Add Feature menu.

Enhancements:

- You can now send notifications to a specific channel or person with TeamsFx SDK. Checkout [code snippets](https://aka.ms/teamsfx-send-notification#send-notifications-to-a-specific-channel) here.
- We've changed which windows are shown by default when an app starts debugging so you'll no longer see red error messages coming from the browser that are mistaken as errors for your app.

## 4.0.6 - Sep 23, 2022

Incremental version for Teams Toolkit with multiple bugs fix, enhancements and new features.

New sample:

- Stock Update: Keep up to date with the latest stock price in Microsoft Teams

SDK:

- Simplified single sign-on implementation for message extension with TeamsFx SDK. Take a look at the [sample code](https://aka.ms/teamsfx-me-sso-sample).
- Simplified single sign-on implementation for command bot with TeamsFx SDK. Take a look at the [sample code](https://aka.ms/teamsfx-command-bot-sso).

## 4.0.5 - Aug 22, 2022

Incremental version for Teams Toolkit with multiple bugs fix, enhancements and a new feature to allow switch Microsoft 365 tenant and Azure subscription for local debugging and cloud provision.

## 4.0.4 - Aug 09, 2022

Incremental version for Teams Toolkit with multiple bugs fix, enhancements and new additions to sample application gallery.

New samples:

- Proactive Messaging: Save users' conversation reference to send proactive reminder messages using bots.
- One Productivity Hub: View calendar events, to-do tasks and files in Teams tab.

Enhancement:

- Enhanced experience of building Teams tab application with SharePoint Framework v1.15.0

## 4.0.3 - Jul 26, 2022

Incremental version for Teams Toolkit with multiple bugs fix and enhancements.

Enhancement:

- User can now switch Azure account or Azure subscription to provision cloud resource.
- Now support SPFx version to v1.15.0.

## 4.0.2 - Jul 12, 2022

Incremental version for Teams Toolkit with multiple bugs fix and enhancements.

## 4.0.1 - Jun 16, 2022

Incremental version for Teams Toolkit with multiple bugs fix and enhancements.

## 4.0.0 - May 24, 2022

Major version for Teams Toolkit with new features to support more Teams app scenario like notification bot and command bot. What's more, this version adds support to extend Teams app across Microsoft 365 platform like Office.com and Outlook.

New Features:

- User can create more business-oriented Teams app template using Teams Toolkit. For example, user can now create not only bot app but also notification bot or command bot. User can see more options are there to choose when create a new Teams app.
- User can create Teams app that can launch and preview in other Microsoft 365 platform like Office.com and Outlook. The options are offered when user create a new Teams app.
- User can incrementally add features to their Teams app using `Add features` in Teams Toolkit during the development process. For example, adding additional Teams extending capability, adding Azure resources like SQL Database or Azure Function etc., adding Single Sign on or API connections and so on.
- User can preview the Teams manifest file and only deploy the manifest file without deploy the whole project.
- User can customized Microsoft Entra manifest file.
- Add tutorials in the Teams Toolkit, user can find them by typing the command `Teams: View Guided Tutorials` in the command palette (Ctrl+Shift+P).
- A new sample which use Graph Connector get on board to the Sample Gallery. Click `View Samples` in Teams Toolkit to browse Sample Gallery.

Enhancement:

- UI improvement of `Create a new Teams app` and `Start from a sample`.
- UI improvement of the Teams Toolkit menus in the sidebar.
- Optimize and simplify the Sample apps. Improve the experience of Sample apps.
- Improved the experience of Teams Toolkit CLI tool.

## 3.8.0 - Apr 22, 2022

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

Enhancement:

- Optimize the configuration schema and manifest template of project created by Teams Toolkit.
- Support to use CodeLens to preview variables value in manifest template file.
- Optimize the In-meeting Sample App in sample gallery, shorten the time to run the sample.
- Improved "Start from a sample" UI, show more information of each sample.

## 3.7.0 - Apr 06, 2022

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

New Features:

- Provide multiple entry points of creating testing tenant/accounts to unblock user from Microsoft 365 account issues, like Microsoft 365 account does not have custom app upload permission or user does not have Microsoft 365 account at all. These entry points include an Add(+) button besides ACCOUNTS in sidebar, an new "Create an account" option in `Teams: Accounts` Command and improved Get Started page.

Enhancement:

- Improved SPFx Project scaffolding experience by using Yeoman Generator.

## 3.6.1 - Mar 23, 2022

Hotfix version for Teams Toolkit with multiple bugs fixed.

## 3.6.0 - Mar 21, 2022

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

New Features:

- Optimized Get Started page for Teams Toolkit. User can check environment prerequisites from Get started now.
- User can use Teams Toolkit to create workflow automation templates for Github, Azure DevOps and Jenkins.

Enhancement:

- Enhance TeamsFx SDK.

## 3.5.0 - Mar 07, 2022

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

New Features:

- New sample app - Teams tab app without SSO.

Enhancement:

- Teams tab app generated from "create a new Teams app" can now use graph toolkit to retrieve user data.

## 3.4.0 - Feb 21, 2022

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

Enhancement:

- Improved local debug experience, more light weighted and more graceful.

## 3.3.0 - Feb 07, 2022

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

New Features:

- "Add cloud resources" feature now supports adding multiple instances of the same cloud resource type. For example, add multiple instance of SQL DB at the same time.

Enhancement:

- Teams Tab project created by Teams Toolkit now is updated to use Auth Code Flow with PKCE for SPA authentication. You can find more details [here](https://aka.ms/teamsfx-auth-code-flow). Please be noted that Tab project created by Teams Toolkit of this version will not be supported by previous versions of Teams Toolkit.

## 3.2.0 - Jan 10, 2022

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

New Features:

- Use Service Principle to login Azure account in CICD template.
- Support building React Tab app by different environment variables for multiple environments.

Enhancement:

- Provide guidance to install development certificate on WSL. See guidance [here](https://github.com/OfficeDev/TeamsFx/blob/dev/docs/fx-core/localdebug-help.md#how-to-manually-install-the-development-certificate-for-windows-subsystem-for-linux-wsl-users)
- Support .NET SDK 6.0.
- Improve the experience to preview manifest file and update manifest file to Developer Portal.
- Improve CICD template by reducing dependency on project metadata file.

## 3.1.1 - Dec 27, 2021

This is a hotfix version.

The Azure App service is upgraded and does not support some older NodeJs versions in some regions any more. This hotfix solves the problem that Azure App service is not working in those regions which does not support older NodeJs versions.

## 3.1.0 - Dec 13, 2021

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

New Features:

- Integrate with Azure Key Vault to secure your application secrets at runtime.
- View state file and edit environment configurations from manifest with code lens.

Enhancement:

- Support Node.js 16 and NPM 7 except for SPFx based tab application or projects including Azure Functions.

## 3.0.0 - Nov 29, 2021

Major version for Teams Toolkit with new features to support cloud resources customization, multiple cloud environments, collaborations and some bug fix.

New Features:

- Adopt ARM templates to provision Azure cloud resources, support customization of cloud resources. Refer to [Provision cloud resources](https://aka.ms/provision-doc) for more information.
- Developers can create and manage multiple cloud environments with different customizations for each environment. Refer to [Manage multiple environment](https://aka.ms/multi-env-doc) for more information.
- Developers can collaborate with others on the same project. Refer to [Collaborations in Teams Toolkit](https://aka.ms/collaboration-doc) for more information.
- Support manifest customization for both local and remote environment. Refer to [Customize manifest](https://aka.ms/customize-manifest-doc) for more information.
- Provide flexibility to add cloud resources to your project using ARM template. Refer to [Add cloud resources](https://aka.ms/add-resources-doc) for more information.
- Add more Teams Sample Apps which support local run with no need to manually set up environment.

Enhancement:

- Improve UI: In sample gallery, add time and effort estimation for each sample.
- Improve UI: multiple enhancement to the Tree View. For example, provide documents links in Tree View, and enrich the tooltip descriptions.
- Reduce the required user inputs in order to create new project.
- Enhance the status and messages showed in Teams Toolkit.
- Upgrade samples to adopt new features in Teams Toolkit.

## 2.10.0 - Nov 15, 2021

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

New Features:

- Enable developers with the capability to extend Teams apps to run across Microsoft 365, get instructions from our [documentation](https://aka.ms/teamsfx-extend-m365).
- Provide Teams sample apps "Todo List (Works in Teams, Outlook and Office)" and "NPM Search Connector" which can run across Microsoft 365. Users can get an initial experience of running Teams apps in Microsoft 365.

## 2.9.0 - Nov 01, 2021

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

Preview Features:

- Enable CI/CD for multiple environments scenario.
- Insider Preview features in 2.8.0 release are still in preview. Refer to [Enable insider preview features](https://github.com/OfficeDev/TeamsFx/wiki/Enable-Preview-Features-in-Teams-Toolkit) for how to use.
- Upgrade existing projects to support preview features, refer to [Upgrade existing project to use latest features](https://github.com/OfficeDev/TeamsFx/wiki/Upgrade-project-to-use-latest-Toolkit-features) for more information.

Enhancement:

- Improve UI: more friendly user experience to create a new Teams project.
- Improve UI: add links to source code for samples.
- Support one-click deployment of SharePoint framework based Teams app.
- Integrate Adaptive Card Studio with previewing and debugging Adaptive Card in VS Code.

## 2.8.0 - Oct 18, 2021

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

Preview Features:

- Support management of multiple environments.
- Support project collaborations among multiple developers.
- Improve the experience to customize Azure resource provision using ARM(Azure Resource Manager).

To enable the preview features, refer to the [preview guidance](https://github.com/OfficeDev/TeamsFx/wiki/Enable-Preview-Features-in-Teams-Toolkit)

Enhancement:

- Improve UI: making the Tree View and Command Pallete text consistent.
- UX A/B testing:
  - Your Tree View(sidebar) may include or exclude quick start page.
  - You may or may not be invited to do local debug after create new project.

## 2.7.0 - Sep 17, 2021

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

Enhancement:

- Improved version upgrade experience by adding "What is New?" info.
- Simplified welcome view when clicking the Toolkit logo on the sidebar.

## 2.6.0 - Sep 06, 2021

Incremental version for Teams Toolkit with multiple bugs fixed and the following updates：

New Feature:

- Support projects migration from Teams Toolkit V1 to V2. If your Teams projects are created using Teams Toolkit V1, try migrate your project follow the [migration instructions](https://aka.ms/teamsfx-migrate-v1).
- Support local debug experience for Teams Tab/Bot/Messaging extension project migrated from Teams Toolkit V1.
- Check permission to turn-on Teams custom app uploading when user sign-in to Microsoft 365 account. Learn more about [custom app upload permission](https://docs.microsoft.com/en-us/microsoftteams/platform/concepts/build-and-test/prepare-your-o365-tenant#enable-custom-teams-apps-and-turn-on-custom-app-uploading).
- (Preview Feature) Support provision cloud resources using Azure Resource Manager. To enable this feature, please follow [instructions](https://github.com/OfficeDev/TeamsFx/wiki/Enable-Preview-Features-in-Teams-Toolkit).

Enhancement:

- UI Enhancement:
  - Hide Azure account login for SharePoint projects.
  - Tree View A/B testing: with non-Teams projects open, you may randomly see either one of two different Tree View layouts in the side bar.
- Optimization of created project folder structure.
- Improved getting start experience of creating new project for Bot.
- Upgrade Sample apps. Enable CI/CD workflow for Todo-List with Azure backend sample. More samples are coming, view them at [Sample GitHub open source repo](https://github.com/OfficeDev/TeamsFx-samples)

## 2.5.0 - Aug 23 2021

Incremental version for Teams Toolkit with multiple bugs fixed and the following updates：

New Feature:

- Enable create project from quick start page.
- Enable report issue from local debug pop-up error message.
- Enable CI/CD workflow with Github Actions. Check [CI/CD instructions](https://github.com/OfficeDev/TeamsFx/tree/dev/docs/cicd) to learn how to use.

Enhancement:

- Update new CLI progress bar.
- Improve some UI experience.
- Add more information in the output error message of debug.

## 2.4.1 - Aug 10 2021

Incremental version for Teams Toolkit with multiple bugs fixed and the following updates：

New Feature:

- Add extension accessiblity for the disabled.
- Add CLI command 'teamsfx preview' to preview SPFx apps.

Enhancement:

- A/B testing for Tree View design. You may randomly see either one of two different Tree View layouts in the side bar.

## 2.3.1 - July 26 2021

Incremental version for Teams Toolkit with multiple bugs fixed and the following updates：

New Feature:

- Add CLI command 'teamsfx preview' to directly preview Teams apps after scaffolding.
- For multiple developers collaborate on one project, Teams Toolkit enables developers to create their own local environment by pressing F5.
- Add encryption to secret data in .userdata file, and support view/edit secret data through VS Code UI and CLI tool.

Enhancement:

- Speed up the installation of npm dependency for debugging experience.

## 2.2.0 - July 12 2021

Incremental version for Teams Toolkit with following updates：

Added:

- UI Run button for debug and preview
- Provide 'Report Issue' button in the pop-up error message to log issues when npm install fails or system error occurs
- A/B testing:  
  Please be noted that in this release we are conducting A/B testing for 'Tree View', the left panel of Teams Toolkit. Thus you may see different layout of Tree View, that is not an issue but totally by design.

## 2.1.1 - June 30 2021

Multiple bug fixings

## 2.1.0 - June 15 2021

Incremental version for Teams Toolkit with the following updates:

Added:

- enable customer survey from toolkit
- add FAQ plus to the samples
- better local debug experience

## 2.0.1 - May 25 2021

2.0.1 is a major version upgrade for Teams Toolkit with many new improvements and supports.

Added:

- new design of UI and command palette list
- new getting started guide, samples and doc link from toolkit
- new sign-in experience for Microsoft 365 and Azure
- new interactive flow for creating new app
- add messaging extension capability to Teams app
- sample codes for in-meeting app.
- support e2e dev experience for tab app hosted by either Azure or SPFx
- support adding backend API (Azure Functions) and SQL DB to tab app
- preview support for tab app, bot app, and messaging extension
- dev environment checking and auto-setup
- cloud provision and deploy for Teams app from treeview UI and command palette
- support simplified auth code and graph client through scaffolding
- Mac/Linux support of new toolkit
- integration with GitHub Codespaces for dev/test

Enhanced:

- improved helloworld app through scaffolding for tab app, bot app, and messaging extension
- imoroved local frontend/backend debugging support for tab app, bot app, and messaging extension
- improved error messages and logging
- improved publish to teams flow

Fixed:

- cumulated bug fixes

## 1.2.3 - April 20 2021

- Add scaffold option for a Teams messaging extension with SSO (Single Sign-on)

## 1.2.2 - April 1 2021

- Increase the timout limit when creating a Microsoft Entra password for a bot registration.

## 1.2.1 - March 15 2021

- Bug fix for env/manifest file automatic replacements not happening for some scaffolds.
- Bug fix for Microsoft Entra app creation where consent should be admin and users and not just admin.

## 1.2.0 - March 2021

- Pull scaffolds from public github repository for always up to date content.
- Updated scaffold selection wizard with more details on what is available.
- More scaffolding and language options.
- Publishing package support when manifest.json is updated locally the zip and cloud configuration in App Studio is created/updated.
- New scaffolds repository https://github.com/OfficeDev/Microsoft-Teams-Samples

## 1.1.8 - 9 Dec 2020

- Microsoft Entra single sign-on bug fixes for Group tabs

## 1.1.4 - 1 Dec 2020

- Microsoft Entra single sign-on documentation updates
- Bug fixes

## 1.1.3 - 24 Nov 2020

- Microsoft Entra single sign-on scaffolding for Tab apps
- Download application publishing package from VS Code
- Bug fixes

## 1.1.1 & 1.1.2

- Bug fixes

## 1.1.0 - 27 Oct 2020

- Onboard to the new VS Code auth
- New F5
- Deprecation of .publish folder - all updates you do through App Studio tooling
- Pre 1.1.0 project upgrade to new project format. We detect if they don't have a teamsAppId in the project...and if they have a .publish folder we create an app registration for them and update the project.
- New bot creation wizard updates
- New project creation flow
- Bug fixes

## 1.0.4 - 3 Aug 2020

Publish to your org catalog from the toolkit

## 1.0.2 - 15 Jul 2020

Bug fixes

## 1.0.1 - 10 Jul 2020

Quality improvements

## 1.0.0 - 7 Jul 2020

Bug fixes

## 0.9.6 - 30 June 2020

Added

- A new bot service instance is automatically created in Azure when a bot/messaging extension project is provisioned and requires one.
- Run your project in the Teams client by hitting F5.

## 0.9.5 - 19 May 2020

Extension released in preview.# Changelog

> Note: This changelog only includes the changes for the stable versions of Microsoft 365 Agents Toolkit (evolved from Teams Toolkit). For the changelog of pre-released versions, please refer to the [Microsoft 365 Agents Toolkit Pre-release Changelog](https://github.com/OfficeDev/TeamsFx/blob/dev/packages/vscode-extension/PRERELEASE.md).

## 6.0.0 - May 19, 2025
This major version upgrade is a milestone as Teams Toolkit evolves to Microsoft 365 Agents Toolkit with a set of awesome new features to provide better development experience for agents building and a brand new icon!

### Introducing Microsoft 365 Agents Toolkit

We’re excited to announce that our product — `Microsoft 365 Agents Toolkit`(evolved from Teams Toolkit). This update reflects our broader vision and ongoing commitment to support a wide range of development scenarios across the Microsoft 365 ecosystem.

As we evolve, we’re expanding beyond Microsoft Teams development to empower developers to build agents for Microsoft 365 Copilot and applications across platforms like Microsoft Teams, Microsoft 365 Copilot, Microsoft 365 apps. This broader scope enables us to deliver a more versatile and comprehensive set of tools, templates, and resources to help you create powerful, integrated solutions.

![ATK animation](https://github.com/user-attachments/assets/96e34da7-06a5-4632-9243-db823e9edb51)

The name — Microsoft 365 Agents Toolkit - better represents the full range of capabilities we now support. We believe this change will help you more easily discover and unlock the potential of building across the Microsoft 365 platforms.

### New Features

- **Use OneDrive and SharePoint as Knowledge Sources in Declarative Agents**

[You can now enhance your declarative agents by connecting them to knowledge sources from OneDrive and SharePoint](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/knowledge-sources). The toolkit allows agents to retrieve grounded, contextually relevant information from files, folders, and sites a user has access to. To get started, open your declarative agent project and select "Add Capability" → "OneDrive and SharePoint."

<img width="882" alt="SP-capability-da" src="https://github.com/user-attachments/assets/9bed27ab-fe7f-4c7e-acb6-989b01d6137b" />

- **Leverage Copilot Connectors in Declarative Agents**

Expand your agent’s knowledge base by integrating Copilot connectors. These connectors let you ingest data from third-party data sources into Microsoft Graph, which can then be used within Microsoft 365 Copilot or through a declarative agent. You can add a Copilot connector when creating a declarative agent or use the "Copilot Connectors" template to build and extend your solution to declarative agents later.

<img width="1088" alt="copilot-connector-in-DA" src="https://github.com/user-attachments/assets/5d9a4e48-a9ba-45a4-a7a3-1797cf0fc3f7" />

- **Kiota Integration for Declarative Agents**

We’ve added [Kiota](https://aka.ms/kiota/docs) integration to streamline working with OpenAPI specifications in declarative agent projects. Developers often need to handle OpenAPI documents when defining actions, this update enables developers to search Open API description documentations and easily regenerate actions. The toolkit now uses Kiota to read, process, and generate code from OpenAPI files—making it easier and more consistent to define and consume external APIs within your declarative agents.

<img width="865" alt="image" src="https://github.com/user-attachments/assets/906dc3a3-ec83-4cb0-a73d-d1a207876a19" />

- **Build a Copilot connector**
  
You can now get started with building a [Copilot connector](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/overview-graph-connector) to bring your enterprise data to Microsoft 365 Copilot and Agents. This create new agent/app experience will help you get started by scaffolding all the code you need (creates connection via the Graph API, registers schema & maps items) to start ingesting items into the Microsoft Graph with a sample REST API datasource (GitHub issues API). Then, you can customize it to your needs and specific data sources to get more value from your enterprise data in Microsoft 365 Copilot! 

<img width="889" alt="image" src="https://github.com/user-attachments/assets/e7600b5a-0c38-4ee5-be35-15dcf7892289" />

- **Build Custom Engine Agent using Microsoft 365 Agents SDK**

We’ve introduced support for building Custom Engine Agents using the [Microsoft 365 Agents SDK](https://learn.microsoft.com/en-us/microsoft-365/agents-sdk/agents-sdk-overview?tabs=csharp). This SDK is a flexible framework that allows developers to build and deploy AI-powered agents across multiple channels — such as Microsoft 365 Copilot, Teams, and custom apps — using the AI services of their choice. It simplifies the creation of agentic patterns with built-in support for state, storage, and channel-specific behaviors.

<img width="1089" alt="CEA-Agents-SDK" src="https://github.com/user-attachments/assets/df90331d-fd85-46bc-9d9a-4a1649d6e09c" />

- **Microsoft 365 Agents Playground**
We’re excited to introduce the [Microsoft 365 Agents Playground](https://www.npmjs.com/package/@microsoft/teams-app-test-tool), a component evolved from Teams App Test Tool, which provides a web-based chat environment that simulates the behavior, look, and feel of various channels — such as Copilot and Microsoft Teams — allowing developers to test, debug, and iterate on their agent or app design without the need for complex setup.

<img width="711" alt="Agents-playground" src="https://github.com/user-attachments/assets/daf9307d-84d0-42a3-bda6-d63e801acb14" />

- **[Preview Feature] Use TypeSpec to build Declarative Agent**

To enhance the developer experience for pro-code agent builders, we see strong value in introducing the option that leverages TypeSpec for Microsoft 365 Copilot. This approach provides a type-safe development experience, reduces dependency on JSON files, improves the developer's inner-loop and offer greater flexibility in generating artifacts for your agents and actions.

### Enhancement

- **Smooth installation for Microsoft 365 Agents Playground**: The toolkit will automatically install NodeJS to avoid unnecessary errors in Microsoft 365 Agents Playground installation, for users who don't have NodeJS installed on their machine.

- **Support SharePoint Framework v1.21**: For Teams tab app using SharePoint Framework, we upgrade to support v1.21.

### Bug Fix

- Enhanced compatibility with previous version of YAML files using old names to ensure smoother migration or continued use of existing projects.
  
- Upgraded dependencies like `axios` to address security vulnerabilities.

- Clear error messages for troubleshooting: Enhanced error messages by explicitly showing YAML file names where missing or unresolved environment variables or no valid app catelog. Show clear error messages to make it easier for users to identify and resolve configuration issues.

- Enhanced logging for CDP client and telemetry for agents development activites.

## 5.14.1 - Mar 28, 2025
This patch version update of Teams Toolkit includes several incremental enhancements and bug fixes:
- Updated manifest version for Declarative Agent to v1.3
- Added a warning message for upcomong CLI breaking changes in the next version

## 5.14.0 - Mar 24, 2025
This update represents a minor version increment of the Teams Toolkit, below is a comprehensive list of new features, enhancements, and bug fixes implemented since the last stable release.

### New Features

- **Switch Tenant**: Teams Toolkit now supports switching target tenant for users with multiple tenants in their Microsoft 365 or Azure account. A "Switch Tenant" button is located next to the account information, and the currently logged-in tenant is displayed alongside the account details.

<img width="643" alt="image" src="https://github.com/user-attachments/assets/f4c541ee-f79e-44cc-8f1e-84873a785c0e" />

- **Add Capability For Declarative Agent**: With Teams Toolkit, you can now enhance your Declarative Agent by integrating Web Search capabilities. This allows your agent to access and utilize information from the web, providing more accurate and relevant responses to your customers' queries.

![image](https://github.com/user-attachments/assets/87ebc692-6985-424d-9819-3b263a7e7206)


- **Add Agent Debugging Experience**: To provide a better debugging experience for Agent developers, we have integrated the debugging experience in Microsoft 365 Copilot in-chat debugger (available in developer mode only). You can get a clear picture of what capability and action that your agent is set up with. You can easily view how your agent is executing actions and gain deeper insights into execution details, including success or failure hints for both capabilities and actions.

![image](https://github.com/user-attachments/assets/1db606aa-fbe9-4da5-a6bf-146d1d251abb)


- **Manage Authentication For Declarative Agent**: When adding actions to your Declarative Agent, you might encounter OpenAPI specifications that lack authentication configurations, even though the actual API calls require OAuth. To address this, we introduce commands that assist users to add and manage authentication for their agents. This enhancement would streamline the process and ensure that your API calls are properly authenticated, making it easier to work with your Declarative Agent.

![image](https://github.com/user-attachments/assets/23d7b4b7-962f-4948-a640-2afc0099c657)


- **Enable Adaptive Card Previewer For Declarative Agent**: We understand that designing an adaptive card for the Declarative Agent has been challenging due to compatibility issues with the Adaptive Card Previewer extension. We're excited to announce that we've now added support to preview Adaptive Card, making the process much smoother and more efficient for you. This enhancement ensures that you can seamlessly design adaptive cards without any hassle.

- **GitHub Copilot Extension Walkthrough**: To make it easier for users to get started with the GitHub Copilot Extension "@teamsapp," Teams Toolkit has added a walkthrough UI experience. This guide helps users understand how to install and use this helpful AI assistant to build Teams apps.

<img width="1306" alt="image" src="https://github.com/user-attachments/assets/0af92cf1-c784-4e5c-ac2e-9a6e07133546" />

#### Enhancements


- **Use Existing Entra ID Instead of Always Create New**: Teams Toolkit creates Entra ID during debugging. While users are easily blocked by no permission to create Entra ID in their tenant. Now we improve this process to allow users to use an existing Entra ID which can be created by tenant admin. You will need to input the ID and password to continue.

- **Input OpenAI Key to Debug**: Custom Engine Agent projects require an OpenAI key for debugging. Teams Toolkit now allows users to create these projects without inputting the OpenAI key. However, missing this value will definitely cause a failure in preview and debugging. Therefore, an input box will pop up before debug to remind users of the required value.

<img width="386" alt="image" src="https://github.com/user-attachments/assets/c197d84c-fa87-4269-bfb5-2609c6e00370" />

- **Declarative Agent API Key Authentication**: API Key Authentication in the DA project was implemented using Bearer Tokens in the past. Recently, the Teams platform has added support for developers to specify the key name in the API request header or query URL. As a result, we have updated the corresponding templates to reflect this change.
  
- **Microsoft Entra Manifest**: Teams Toolkit has updated Microsoft Entra app manifest to apply MS Graph format for better integration with platform.

- **Troubleshooting with GitHub Copilot Extension**: Teams Toolkit now improve the troubleshooting experience with GitHub Copilot extension by adding a "Resolve with @teamsapp" button, click this button will ask Teams Toolkit to open the output channel in the editor. Then the GitHub Copilot Chat will use the output log as a reference for troubleshooting requests. Consequently, @teamsapp can read the log and perform troubleshooting.

<img width="412" alt="image" src="https://github.com/user-attachments/assets/60408b17-4cb2-4e80-805f-f554eae05661" />

- **Publish Teams App**: Refine the "Publish Teams App" UI in Teams Toolkit to reduce confusion. Now there are two buttons: one for publishing the Teams app to your organization and the other for publishing your app to the Teams store. The latter will require users to go to the Teams Developer Portal to complete the publishing process.

<img width="432" alt="image" src="https://github.com/user-attachments/assets/c7acfd7c-a29b-4bda-8baa-c3ff5f5c47c9" />

- **Upgrade to Node 22**: All the app templates in Teams Toolkit now are updated to support Node 22.

- **Add streaming experience in App Test Tool** 

- **Security Enhancement**: 1.Consolidate and standardize the Tab templates for quality and security. This involves ensuring consistency in the use of tools and dependencies, such as using npm packages instead of CDNs and updating the Teams JS version. 2. Upgrade python app templates to use MSI authentication when deploying to Azure.


#### Bug Fixes

- Fixed the missing environment variable error `M365_App_ID` when debug Declarative Agent with action. [#12966](https://github.com/OfficeDev/teams-toolkit/pull/12966)

- Microsoft tenant users have issues to login Microsoft 365 account and create Entra ID app, we provide a [workaround guidance](https://stackoverflow.microsoft.com/questions/446689/446691) to help them fix the issue. [#13343](https://github.com/OfficeDev/teams-toolkit/pull/13343)

- Fixed the issue that Tab project shows blank page when remotely preview the app. [#13212](https://github.com/OfficeDev/teams-toolkit/pull/13213)

- Resolve the issue where adding a plugin results in the error message 'Cannot read properties of undefined (reading 'replace')'. [#13422](https://github.com/OfficeDev/teams-toolkit/pull/13422)

- Ensure a seamless experience by addressing the error that occurs when the plugin manifest is located in a subfolder during the zip app package action. [#13349](https://github.com/OfficeDev/teams-toolkit/pull/13349)

- Addressed the issue where the dev tunnel was not forwarding requests, causing the Bot project to be unresponsive during local debugging. This fix ensures a smoother and more reliable debugging experience. [#12730](https://github.com/OfficeDev/teams-toolkit/pull/12730)

- Updated the Welcome page of Teams Toolkit. [#12879](https://github.com/OfficeDev/teams-toolkit/pull/12879)

## 5.12.1 - Jan 23, 2025

Hotfix version.

- Fixed an issue where the API Key and Secret is not using password style input. [#13081](https://github.com/OfficeDev/teams-toolkit/pull/13081)
- Fixed an issue where creating a declartaive agent with an action using Microsoft Kiota might fail in some cases. [#13082](https://github.com/OfficeDev/teams-toolkit/pull/13082)

## 5.12.0 - Dec 17, 2024

This update represents a minor version increment of the Teams Toolkit, introducing new features and addressing user-reported bugs. These incremental enhancements were previously documented in the prerelease version and a blog post: [Teams Toolkit for Visual Studio Code update – November 2024](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-november-2024/)

Below is a comprehensive list of new features, enhancements, and bug fixes implemented since the last stable release.

### New Features

- **Added Local Authentication Support for API ME and API Plugin**: We have introduced local authentication support for application templates of API-ME and API Plugin application with Microsoft Entra and OAuth. which eliminates the anonymous setup for APIs on local environment end to end and also helps developers verify the behavior when Teams and Microsoft 365 Copilot invokes an API without proper authorization. This feature includes built-in middleware that implements the token validation and a guided code tour explains how it works.
![Local Authentication](https://github.com/user-attachments/assets/dbf7173d-d11e-4a8d-b26d-fbfb6abfa976)

- **Process Termination For Port Conflict**: Port conflict is a common pain point for developers when debugging bot applications. It happens when the processes are not fully terminated when debug session stops. Now Teams Toolkit has added additional support to help terminate those unkilled processes to release ports.
![Port Conflicts](https://github.com/user-attachments/assets/208a21d5-0232-470b-a102-620e542a20cb)

- **Integrated with Microsoft Kiota for API Plugin Generation**: Now Teams Toolkit has integrated with [Microsoft Kiota](https://learn.microsoft.com/openapi/kiota/overview) when adding API Plugins into Declarative Agent. With this integration, developers are enabled to create API Plugins by browsing public API catalogs and Microsoft Kiota is capable of handling large OpenAPI Description Document. This is an experimental feature, for early access make sure to turn on [VSCode Settings](https://code.visualstudio.com/docs/getstarted/settings#_workspace-settings) with `Enable Microsoft Kiota`.

- **Using Assistant API on Azure OpenAI Service**: We have previously announced the support for Assistant API on Azure OpenAI Services in Teams Toolkit for Python language, and now it has expanded to TypeScript and JavaScript.

- **Manifest Schema Validation Enhancement**: Added support for manifest schema validation to cover localization files and default language files.

#### Enhancements

- Updated Bot application templates from `restify` to `express` server for better support of Node.js 20.
- Updated Tab application templates from `react-scripts` to `vite` for better performance and developer experience.
- Updated application templates and pre-requisite checker for Node.js 20 support.
- Updated application templates to the latest stable [App Manifest](https://learn.microsoft.com/microsoftteams/platform/resources/schema/manifest-schema#sample-app-manifest) version v1.19.

#### Bug Fixes

- Resolved a build error caused by changes to the `clientCitation` interface. [#12884](https://github.com/OfficeDev/teams-toolkit/pull/12884)
- Addressed persistent port conflict issues encountered by some users when stopping a debug session. [#12881](https://github.com/OfficeDev/teams-toolkit/pull/12881)
- Improved default instructions for Declarative Agent to ensure better compliance. [#12880](https://github.com/OfficeDev/teams-toolkit/pull/12880)
- Resolved an issue where Teams Toolkit could fail to generate authentication actions when creating a declarative agent with an API plugin using Microsoft Kiota. [#12764](https://github.com/OfficeDev/teams-toolkit/pull/12764)
- Update `@azure/storage-blob` to avoid AbortSignal error when deploying with `azureStorage/enableStaticWebsite`. [#12583](https://github.com/OfficeDev/teams-toolkit/pull/12583)
- Upgraded `path-to-regexp` and `body-parser` to fix vulnerability issues. [#12610](https://github.com/OfficeDev/teams-toolkit/pull/12610)
- Fixed an issue where `teamsapp.yml` when adding an API Plugin to the declarative agent. [#12656](https://github.com/OfficeDev/teams-toolkit/pull/12656)

## 5.10.1 - Nov 19, 2024

This patch version update of Teams Toolkit introduces several incremental enhancements:

- **Terminology Update**: The term `Copilot Agent` has been updated to `Agent` in the user interface. [#12672](https://github.com/OfficeDev/teams-toolkit/pull/12672)
- **Debug Session Improvement**: Resolved an issue where child processes were not fully terminated when a debug session was stopped. [#12673](https://github.com/OfficeDev/teams-toolkit/pull/12673)
- **Manifest Validation Fix**: Addressed a problem where manifest validation failed with multi-line user instructions for declarative agents. [#12677](https://github.com/OfficeDev/teams-toolkit/pull/12677)
- **Schema Validation Fix**: Corrected an issue where manifest schema validation was unsuccessful for projects that included an API Plugin. [#12679](https://github.com/OfficeDev/teams-toolkit/pull/12679)

## 5.10.0 - Oct 16, 2024

This update represents a minor version increment of the Teams Toolkit, introducing new features and addressing user-reported bugs. These incremental enhancements were previously documented in the prerelease version and a series of blog posts:

- [July Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-july-2024/): You can now debug Teams apps directly in the desktop client, use managed identities for better security, and clean up development resources more easily.
- [August Prererelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-august-2024/): This update adds enhanced app validation, Python support for intelligent chatbots, and the ability to create custom copilots. It also introduces the Assistant API on Azure OpenAI Service for AI Agents.

Below is a comprehensive list of new features, enhancements, and bug fixes implemented since the last stable release.

### New Features

- **External File Support for Declarative Copilot Instructions**: Developers now have the ability to use an external file to author instructions for their declarative copilots and reference it in the manifest file. This greatly improves the authoring experience for longer instructions compared to using JSON files.
  ![External File](https://github.com/user-attachments/assets/fa13711c-fe8c-4155-bd7f-9e0a8e0ed606)

- **Plugin Integration for Declarative Copilot**: Teams Toolkit now allows developers to add a plugin as a skill to the declarative copilot. Developers can either add a new API plugin using an OpenAPI description document or reference an existing API plugin via its manifest file.
  ![Add Plugin](https://github.com/user-attachments/assets/009a63d0-8bc0-4449-8ba6-cef25779c140)

- **Enhanced App Validation**: Developers can now evaluate their app packages using the same test cases Microsoft employs during app review. The Enhanced App Validation feature in Teams Toolkit identifies any errors or warnings within your app package and provides clear guidelines for resolution. For more details on Microsoft test cases, refer to the [Teams Store validation guidelines](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/teams-store-validation-guidelines) and [Commercial marketplace certification policies](https://learn.microsoft.com/en-us/legal/marketplace/certification-policies).
  ![App Validation](https://github.com/user-attachments/assets/4c2b8c49-6a0a-4ea7-8796-a94464714463)

- **Generate an Intelligent Chatbot with Python**: Following the release of support for building [Custom Engine Copilot](https://learn.microsoft.com/microsoft-365-copilot/extensibility/overview-custom-engine-copilot) during Build 2024, which included the ability to "chat with" your own API, Teams Toolkit now extends this capability to the Python programming language.
  ![App Generator](https://github.com/user-attachments/assets/21efa344-aea5-4d44-bb78-aa8e26dc68a1)

- **Create Declarative Copilot**: Teams Toolkit now allows you to build a declarative copilot, enabling you to customize Microsoft 365 Copilot by declaring specific instructions, actions, and knowledge. Declarative copilots run on the same orchestrator, foundation models, and trusted AI services that power Microsoft Copilot. You can learn more about [declarative copilots here](https://learn.microsoft.com/microsoft-365-copilot/extensibility/overview-declarative-copilot). The toolkit supports the creation of both basic declarative copilots and those with an API plugin.
  ![Declarative Copilot](https://github.com/user-attachments/assets/37412cdd-c7e8-4e38-bd45-794997b050ec)

- **Using Assistant API on Azure OpenAI Service**: The Teams Toolkit has updated the `AI Agent` (Python) app template to support the Assistant API on Azure OpenAI Service. You can now build your own AI Agents on Microsoft 365 using Python, with the option to use either Azure OpenAI Service or OpenAI directly. Support for TypeScript and JavaScript is forthcoming.

- **Debug Apps in Teams Desktop Client**: The Teams desktop client now offers a faster and more reliable way to debug your Teams applications, with the same capabilities available in the Teams web client, such as breakpoints and hot reload. This feature is now available for Custom Engine Copilots, Bots, and Message Extensions apps.
  ![Debug in Desktop](https://github.com/OfficeDev/teams-toolkit/assets/11220663/dc85ee11-e847-40d7-bceb-b5dc3e83f040)

- **Use Managed Identity for Bot and Message Extension when deploying to Azure**: The Teams Toolkit has transitioned from client ID and secret-based identity to user-assigned managed identity for Bot and Message Extension application templates, enhancing security. [Learn more](https://learn.microsoft.com/entra/identity/managed-identities-azure-resources/overview) about the benefits of using managed identities for Azure resources.
  ![MSI](https://github.com/OfficeDev/teams-toolkit/assets/11220663/b2ffddb2-8c04-4ee4-aaaa-ae7c666af6e1)

- **Clean Up Resources Created After Development**: You can now safely clean up resources created after application development by deleting the application registration in the Teams Developer Portal and Bot Framework Portal, and removing uploaded custom apps in Microsoft 365 applications. This can be done via the `teamsapp uninstall` command, either by using the App ID in the Teams application manifest file or by specifying an environment if your project is managed by the Teams Toolkit.
  ![Uninstall](https://github.com/OfficeDev/teams-toolkit/assets/11220663/294447b7-d5f9-47cc-ab37-9235dbd5c111)

- **Integrated CodeTour Instructions for Using Graph Connector Data Source**: The `Chat With Your Data - Microsoft 365` app template in Teams Toolkit now includes interactive CodeTour instructions. By default, the app uses content uploaded to SharePoint, but with these instructions, you can easily switch to a Graph connector data source if you have external content. Learn more about using the [Graph connector](https://learn.microsoft.com/microsoft-365-copilot/extensibility/overview-graph-connector).
  ![Code Tour](https://github.com/OfficeDev/teams-toolkit/assets/11220663/be2eb3d6-0468-4316-8e6f-e8025408045a)

- **Build AI Agent With Assistant API and Python**: Previously we have included the AI Assistant Bot app template to help you get started with building a GPT-like chat bot with AI capabilities using `Teams AI Library`. Now we have added a new AI Agent app template to help you build an AI agent with Assistant API and Python. This template showcases how to build an intelligent chat bot in Teams capable of helping users accomplish a specific task using natural language right in the Teams conversations, such as solving a math problem.

### Enhancemens

- Teams Toolkit will continue to update scaffold app templates to ensure compliance with [Teams Store validation guidelines](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/prepare/teams-store-validation-guidelines). The first round of updates focuses on bot templates, including:
  - [PR#12063](https://github.com/OfficeDev/teams-toolkit/pull/12063): Updated `Basic Bot` and `Message Extension`
  - [PR#12096](https://github.com/OfficeDev/teams-toolkit/pull/12096): Updated `Chat Command`
  - [PR#12123](https://github.com/OfficeDev/teams-toolkit/pull/12123): Updated `Chat Notification Messages`
  - [PR#12119](https://github.com/OfficeDev/teams-toolkit/pull/12119): Updated `Sequential Workflow in Chat`
- Teams Toolkit now prompts users to generate an API key before debugging API ME or API Plugin with API Key authentication templates.
- Secret values have been redacted from the Visual Studio Code output channel.
- Updated application templates to use the latest [manifest schema version v1.17](https://learn.microsoft.com/microsoftteams/platform/resources/schema/manifest-schema).
- Improved the readability of error messages generated by the Teams Toolkit.

### Bug Fixes

- Upgraded the axios dependency used in Teams Toolkit to version 1.7.6 to fix a vulnerability issue. [#12306](https://github.com/OfficeDev/teams-toolkit/pull/12306)
- Changed a string for better clarity when creating an `AI Agent` without Assistant API. [#12266](https://github.com/OfficeDev/teams-toolkit/pull/12266)
- Fixed vulnerability issues in TeamsFx SDK. [#11973](https://github.com/OfficeDev/teams-toolkit/pull/11937)
- Resolved compatibility issues with `groupchat` and `groupChat` in the Teams app manifest. [#12028](https://github.com/OfficeDev/teams-toolkit/pull/12028)
- Corrected an issue where the link redirection for the lifecycle `Provision` button was incorrect. [#12120](https://github.com/OfficeDev/teams-toolkit/pull/12120)
- Fixed initialization failures of `publicClientApplication` in TeamsFx SDK. [#12159](https://github.com/OfficeDev/teams-toolkit/pull/12159)
- Addressed issues when creating SharePoint Framework-based tab apps. [#12173](https://github.com/OfficeDev/teams-toolkit/pull/12173)
- Resolved an issue where users still saw a pop-up window when logging into a Microsoft 365 account in non-interactive mode. [#11978](https://github.com/OfficeDev/teams-toolkit/pull/11978)
- Fixed an issue where importing an SPFx project failed due to case-sensitive file systems on Ubuntu. [#11972](https://github.com/OfficeDev/teams-toolkit/pull/11972)
- Addressed an issue where debugging an Outlook Add-in might fail with the error `Package is invalid`. [#11963](https://github.com/OfficeDev/teams-toolkit/pull/11963)
- Corrected unclear error messages for commands that only work for projects created by the Teams Toolkit. [#11945](https://github.com/OfficeDev/teams-toolkit/pull/11945)
- Fixed a vulnerability issue with `ws` affected by a DoS when handling a request with many HTTP headers. [#11937](https://github.com/OfficeDev/teams-toolkit/pull/11937)
- Fixed an issue where sometimes you may not be able to scroll down in Teams Toolkit CLI. [#11762](https://github.com/OfficeDev/teams-toolkit/pull/11762)
- Fixed an issue where Teams Toolkit generated Adaptive Cards may contain empty property. [#11759](https://github.com/OfficeDev/teams-toolkit/pull/11759)
- Fixed an issue where you may need to press enter twice after selecting resource group during provision using Teams Toolkit CLI. [#11724](https://github.com/OfficeDev/teams-toolkit/pull/11724)
- Fixed an issue to enable shell option in Windows platform to avoid [command injection via args parameters](https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2#command-injection-via-args-parameter-of-child_processspawn-without-shell-option-enabled-on-windows-cve-2024-27980---high). [#11699](https://github.com/OfficeDev/teams-toolkit/pull/11699)
- Fixed an issue where provision summary logs are printed twice. [#11658](https://github.com/OfficeDev/teams-toolkit/pull/11658)

## 5.8.2 - Sep 26, 2024

Hotfix version.

- Fixed an issue ([#12143](https://github.com/OfficeDev/teams-toolkit/issues/12143)) where users may encounter an error (`SPFx.LatestPackageInstallFailed`) when creating a Tab with SPFx project.
- Resolved an issue ([#12384](https://github.com/OfficeDev/teams-toolkit/issues/12384)) where users may encounter an error (`AppStudioPlugin.TeamsAppCreateConflict`) during local debugging.
- Updated TypeScript from `4.4.4` to `5.5.4` to avoid build failures for `Custom Engine Agent` templates in [#12462](https://github.com/OfficeDev/teams-toolkit/pull/12462).

## 5.8.1 - May 27, 2024

Hotfix version.

- Resolved an issue that occurred when the Teams Toolkit extension was used with VS Code versions v1.87.2 or earlier. See issue [#11679](https://github.com/OfficeDev/teams-toolkit/issues/11679) for more details.
- Fixed the launch URL issue in the API-based message extension template with Microsoft Entra authentication.
- Fixed an issue where a `Create` label is unexpectedly shown in the Create New App dialog.

## 5.8.0 - May 14, 2024

This update, marking a minor version increment of the Teams Toolkit, incorporates new features and resolves bugs based on user input. Previously, these incremental modifications were detailed in the prerelease version and a series of blog posts:

- [March Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-march-2024/): Included enhancements to the user interface and application templates for custom copilots, introducing a basic AI chatbot and AI agent, along with Python language support for constructing custom copilots using the Teams AI Library.
- [April Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-april-2024/): Introduced the ability to utilize authentication-protected APIs in API-based message extensions, debug message extensions using the Teams App Test Tool, and build custom copilots with retrieval augmented generation employing Azure AI Search, custom APIs, and Microsoft 365 data.

### New Features

- **Create API based Message Extensions using auth-protected API**: Teams Toolkit now supports two forms of API authentication protection for your API-based Message Extension app:
  ![add-auth-api-me](https://github.com/OfficeDev/TeamsFx/assets/113089977/c5faea2f-676b-4a8c-82d6-f3b037e54f0e)

  - API-Key: You can either add the API key of your existing API or, if you don't have one, Teams Toolkit will generate one to demonstrate authentication flow.
  - Microsoft Entra (Azure AD): Teams Toolkit facilitates the creation of Microsoft Entra IDs to authenticate your new API.

- **Debug Message Extensions in Teams App Test Tool**: Developers can now debug and test the message extensions in a web-based environment using the Teams App Test Tool, which emulates Microsoft Teams without requiring tunnels or a Microsoft 365 account. This version extends Teams App Test Tool support to search-based, action-based, and link-unfurling message extension apps.
  ![ME-test-tool](https://github.com/OfficeDev/TeamsFx/assets/113089977/2b55996f-87a9-4683-abaf-3089b7ea878e)

- **Create Intelligent Chatbot with RAG Capability**: The Custom Copilot with RAG capability is an AI-powered chatbot capable of understanding natural language and retrieving domain-specific data to answer questions. Teams Toolkit now supports accessing custom data in Custom Copilot apps. When creating a Custom Copilot app, developers can select 'Chat with your Data' and then choose the desired data source.
  ![access-data-custom-copilot](https://github.com/OfficeDev/TeamsFx/assets/113089977/d40cfc84-8cb8-4816-b587-668a2bcf9560)
  Four types of data sources are available:
  ![data-source-custom-copilot](https://github.com/OfficeDev/TeamsFx/assets/113089977/2d010366-96a0-4f8b-861d-28d5bb9e36b8)

  - `Customize`: Load data from a custom data source, for example, the file system or vector Database.
  - `Azure AI Search`: Load data from Azure AI Search service and use it in conversation with users.
  - `Custom API`: Invoke the API defined in the OpenAPI description document to retrieve domain data from the API service.
  - `Microsoft 365`: Query Microsoft 365 data from the Microsoft Graph Search API as a data source in the conversation.

- **Build Your Own Copilots in Teams with Teams AI Library**: Enhancements have been made to the user experience for developers to create their custom copilots, AI-powered intelligent chatbots for Teams, with the following improvements:
  ![Custom Copilots](https://github.com/OfficeDev/TeamsFx/assets/11220663/0387a2ce-ec39-4c72-aabc-1ec2b9e85d59)
  - Streamlined UX for scaffolding, including top-level entry points and easy configuration of LLM services and credentials during the scaffolding flow.
  - New application templates allowing developers to build an AI Agent from scratch.
  - Python language support for building a `Basic AI Chatbot` and `AI Agent`.

### Enhancements

- The `aadApp/create` action now supports setting `serviceManagementReference` for Entra apps, facilitating referencing application or service contact information from a Service or Asset Management database.
- The `office-addin-manifest` and `office-addin-project` have been upgraded to the latest version to enable the use of the latest version of the manifest schema when importing an existing XML-based Outlook Add-in project.
- The `@azure/identity` and `@azure/msal-node` packages have been updated to the latest version to ensure the security of the authentication process.
- The `teamsjs` dependency in `teamsfx` and `teamsfx-react` has been upgraded to the latest version to ensure compatibility with the latest TeamsJS SDK.

### Bug Fixes

- Fixed an issue in the `teamsapp` CLI, where scrolling down would result in an error when selecting an item of a large index from a list. ([#11521](https://github.com/OfficeDev/TeamsFx/pull/11521))
- Fixed a bug in API-based message extension app templates, where the launch URL pointed to the home page instead of the app installation page. ([#11461](https://github.com/OfficeDev/TeamsFx/pull/11461))
- Fixed a vulnerability issue introduced by the `axios` package. ([#11449](https://github.com/OfficeDev/TeamsFx/pull/11449))

## 5.6.0 - Mar 12, 2024

This minor version update of Teams Toolkit includes new features and bug fixes based on your feedback. The new features include Deploy Tab Apps to Static Web App, Teams Toolkit CLI v3 and many other enhancements. We previously shared these incremental changes in the prerelease version and through a blog post:

- [Janaury Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-january-2024/): Deploy Tab Apps to Static Web App, Teams Toolkit CLI v3, new Link Unfurling sample app and many other enhancements.

We've listened to your feedback and included these additional new features, enhancements, and bug fixes to this release.

New features:

- **Deploy Tab Apps to Static Web App**: Azure Static Web Apps, an automatic service for building and deploying full-stack web apps to Azure from a code repository, is now the default solution for deploying Tab-based applications in Teams Toolkit. If you prefer the old way using Azure Storage, please refer to this [sample](https://github.com/OfficeDev/TeamsFx-Samples/tree/dev/hello-world-tab-codespaces).
- **Teams Toolkit CLI ([`@microsoft/teamsapp-cli`](https://www.npmjs.com/package/@microsoft/teamsapp-cli)) `v3.0.0`**. Teams Toolkit CLI version 3 is now released in stable version. Major changes include:
  ![Teams Toolkit CLI](https://camo.githubusercontent.com/67608a468cbd406d6ff18585c8bc3b34d3d97d0a8ef525bdf516ca23fd5e32dd/68747470733a2f2f616b612e6d732f636c692d6865726f2d696d616765)
  - **New Command Signature**: Teams Toolkit CLI now starts with `teamsapp` as the root command signature for more clarity. We recommend changing your scripts to use `teamsapp` as the command prefix.
  - **New Command Structure**: Teams Toolkit CLI now has a new command structure that is more intuitive and easier to use. You can find the new command structure in the [Teams Toolkit CLI Command Reference](https://aka.ms/teamsfx-toolkit-cli).
  - **New Doctor Command**: `teamsapp doctor` command is a new command that helps diagnose and fix common issues with Teams Toolkit and Teams application development.

Enhancements:

- **Format Reddit Link into Adaptive Card Sample**: This sample application demonstrates how to format a Reddit link into an Adaptive Card in Microsoft Teams conversations.
  ![Link Unfurling Sample](https://github.com/OfficeDev/TeamsFx/assets/11220663/0d44f8c3-d02e-4912-bfa2-6ed3fdb29c1b)
- **Clean up `.deployment` Folder in between Deployments**: Teams Toolkit now cleans up the `.deployment` folder in the build directory before each deployment, addressing a [known issue](https://github.com/OfficeDev/TeamsFx/issues/10075) and reducing deployment time.
- **Optimized Dev Tunnel Expiration**: Inactive Dev Tunnel instances will now be automatically cleaned up after an hour, mitigating Dev Tunnel instance limitation errors.
- **Log Level Settings**: Added log level settings for controlling the verbosity of Teams Toolkit logs. You can find the settings in the [User and Workspace Settings](https://code.visualstudio.com/docs/getstarted/settings) under the `Teams Toolkit` section.
  ![Logs](https://github.com/OfficeDev/TeamsFx/assets/11220663/3a1fc3a0-d69b-446e-8db2-0c756a18f95e)
- **Richer Information in Sample App Details Page**: The Sample app detail page now includes additional details from the project README file, such as the project description, prerequisites, and steps to run the project.
- **Improved Troubleshooting for Multi-tenant Scenario**: Teams Toolkit now provides a [troubleshooting guide](https://aka.ms/teamsfx-multi-tenant) for scenarios where `aadApp/update` action fails with a `HostNameNotOnVerifiedDomain` error in multi-tenant setups.
- **Optimized SPFx Solution Version Handling**: Teams Toolkit now compares the SPFx solution version between global installations and the one used by Teams Toolkit when developers add additional web parts. Developers will be prompted if there's a need to install or upgrade the solution version when differences are detected.

## 5.4.1 - Feb 07, 2024

Hotfix version.

We have made UI and docs updates to multiple places according to the [latest updates to the Microsoft 365 Developer Program](https://devblogs.microsoft.com/microsoft365dev/stay-ahead-of-the-game-with-the-latest-updates-to-the-microsoft-365-developer-program/).

## 5.4.0 - Dec 18, 2023

This minor version update of Teams Toolkit includes new features and bug fixes based on your feedback. The new features include the Adaptive Card Previewer, Teams App Test Tool, new project templates for AI Assistant Bot, and a refreshed Sample Gallery. We previously shared these incremental changes in the prerelease version and through a series of blog posts:

- [October Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-update-october-2023): Search sample app, new Contoso Retail Dashboard sample app, Teams Toolkit CLI improvement.
- [November Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-november-2023): Brand-new AI Assistant Bot App template, Teams app test tool, integrated Adaptive Card Previewer, Refreshed look for Sample Gallery etc.

We've listened to your feedback and included these additional new features, enhancements, and bug fixes to this release.

New features:

- [Preview Feature] AI Assistant Bot App template using Teams AI library and the OpenAI Assistants API. This template demonstrates how to build an intelligent chatbot within Teams.
  ![AI-assistant-bot](https://github.com/OfficeDev/TeamsFx/assets/113089977/13877e7b-cffb-4717-9d1e-587478a43e5d)
- [Preview Feature] Teams App Test Tool removes the need for a lot of the setup to run and debug a Teams bot in a web-based chat environment that is similar to Teams.
  ![Teams app test tool](https://github.com/OfficeDev/TeamsFx/assets/113089977/7f6bcf56-27b3-4a7b-a160-64ab847efd92)
- [Preview Feature] Preview and edit Adaptive Cards effortlessly using the Adaptive Card Previewer now included in Teams Toolkit.
  ![Adaptive Card Previwer](https://github.com/OfficeDev/TeamsFx/assets/113089977/8062f237-d640-45b2-a7b2-81a0a4b0aa10)
- [Generally Available] Navigate quickly through samples using list or grid views. You can also search samples or filter samples by type, capability, and programming language.
  ![New sample gallery UI](https://github.com/OfficeDev/TeamsFx/assets/113089977/cbb18477-1f6d-4ab5-a947-1840d3290e40)
- [Preview Feature] Developing with Microsoft Copilot? We’ve added a helpful license check UI to ensure that your account has the necessary Microsoft Copilot licenses.
  ![Copilot license check](https://github.com/OfficeDev/TeamsFx/assets/113089977/78fa1fc5-0e19-40f0-b324-65583485f743)

Enhancement:

- New samples in the Sample Gallery:
  ![new samples](https://github.com/OfficeDev/TeamsFx/assets/113089977/2af41ec4-ee19-4b66-a58a-d2d8bdbbbd60)

  - Large Scale Notification Bot: send individual chat messages to a large number of users in a tenant
  - Graph Connector Bot: Teams command bot that queries custom data ingested into Microsoft Graph using Graph connector.
  - Contoso Retail Dashboard: demonstrates how to build a dashboard for control layouts. It runs in Teams, Outlook, and the Microsoft 365 app.
  - Teams Conversation Bot using Python: Python example for Teams Bot app.
  - Teams Messaging Extensions Search using Python: Python example for Teams Messaging Extensions app.
  - SSO Enabled Tab via APIM Proxy: Teams tab app that can display user login information with SSO.
  - Ingest Custom API Data into Microsoft 365 with Microsoft Graph Connector: simplify the process of creating a Microsoft Graph connector that ingests data from a custom API to Microsoft Graph

- Recommended Regions in Provision
  ![Provision Region](https://github.com/OfficeDev/TeamsFx/assets/113089977/97867d08-b7af-4eae-b1e7-d0102e1a1361)
- Automatic `npm install` for SPFx Tab App
  ![npm install for SPFx](https://github.com/OfficeDev/TeamsFx/assets/113089977/514d262d-9695-40dc-91aa-5c35044a319d)
- Teams Toolkit CLI Enhancement including: Commands have been reorganized into a hierarchical structure, added a teamsfx list command, improve the help command readability, outputs have been refreshed and log levels have been streamlined for clarity.
- Update Teams AI chat bot template to use latest teams-ai library.

Bug Fixes:

- Resolved an issue causing an No localized strings file found error in Visual Studio Code output. ([#10090](https://github.com/OfficeDev/TeamsFx/pull/10090))
- Fixed a flickering issue when selecting an option in Quick Pick. ([#10100](https://github.com/OfficeDev/TeamsFx/pull/10100))
- Corrected a string typo in the Create a New App dialog. ([#10197](https://github.com/OfficeDev/TeamsFx/pull/10197))
- Fixed the notification store path missing issue when using Test tool for Teams notification bot app. ([#10499](https://github.com/OfficeDev/TeamsFx/pull/10499))

## 5.2.0 - Sep 19, 2023

This minor version update of Teams Toolkit includes new features and bug fixes based on your feedback. The new features include the ability to import an existing SharePoint Framework solution, new project templates for Link Unfurling and AI Chat Bot, and more. We previously shared these incremental changes in the prerelease version and through a series of blog posts:

- [July Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-july-2023): Import an existing SharePoint Framework solution, implement link unfurling in Teams and Outlook.
- [August Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-with-new-ai-chat-bot-template/): Create an AI chat bot with the new AI Chat Bot template.

We've listened to your feedback and included these additional new features, enhancements, and bug fixes to this release.

New features:

- Import an existing SharePoint Framework solution and continue development with Teams Toolkit.
  ![SPFx Existing App](https://github.com/OfficeDev/TeamsFx/assets/11220663/3944f5c8-6c8c-4b4d-8df8-dc4f45b5967f)
- A new link unfurling project template to help you get started with displaying rich content from links in Teams messages and Outlook emails.
  ![Link Unfurling](https://github.com/OfficeDev/TeamsFx/assets/11220663/6e8b982a-0531-4ec1-8420-f6f17955ff40)
- A new AI Chat Bot project template to help you get started with building a GPT-like chat bot with AI capabilities using the [Teams AI Library](https://github.com/microsoft/teams-ai).
  ![AI Bot](https://github.com/OfficeDev/TeamsFx/assets/11220663/86a90d2a-efc3-4d8b-9e8c-5d34a1e8c081)
- The Sample Gallery has a new sample, One Productivity Hub using Graph Toolkit with SPFx, that shows you how to build a Tab for viewing your calendar events, to-do tasks, and files using Microsoft Graph Toolkit components and a SharePoint provider.
  ![SPFx Sample](https://github.com/OfficeDev/TeamsFx/assets/11220663/084ac508-49ea-4b30-854c-8b4d578ff6ee)
- Run life-cycle commands like Provision, Deploy, and Publish using new CodeLens hints added in-line to `teamsapp.yml`` when editing the file.
  ![Inline Commands](https://github.com/OfficeDev/TeamsFx/assets/11220663/f6897b26-0e3c-441c-b028-32093e8322a7)

Bug fixes:

- Fixed an issue where the `Preview` tag for the `AI Chat Bot` project template was not included in previous version. ([#9901](https://github.com/OfficeDev/TeamsFx/pull/9901))
- Fixed an issue where sometimes Teams Toolkit may fail to activate due to an unexpected package dependency on `types/keytar`. ([#9910](https://github.com/OfficeDev/TeamsFx/pull/9910))

## 5.0.1 - June 20, 2023

Incremental version for Teams Toolkit with multiple bug fixes:

- Fixed an issue where older versions of Teams Toolkit CLI and Node.js were referenced in CI/CD templates. ([#8972](https://github.com/OfficeDev/TeamsFx/pull/8972))
- Fixed an issue [#8929](https://github.com/OfficeDev/TeamsFx/issues/8929) in [`teamsApp/create`](https://github.com/OfficeDev/TeamsFx/wiki/Available-actions-in-Teams-Toolkit#teamsappcreate) and [`teamsApp/update`](https://github.com/OfficeDev/TeamsFx/wiki/Available-actions-in-Teams-Toolkit#teamsappupdate) actions where detailed error messages were not printed in output channel when Teams Toolkit failed to create or update app in Teams Developer Portal. ([#8967](https://github.com/OfficeDev/TeamsFx/pull/8967))
- Fixed an issue in [`script`](https://github.com/OfficeDev/TeamsFx/wiki/Available-actions-in-Teams-Toolkit#script) action where not all env output pairs were parsed. ([#8811](https://github.com/OfficeDev/TeamsFx/pull/8811))
- Fixed an issue in [`script`](https://github.com/OfficeDev/TeamsFx/wiki/Available-actions-in-Teams-Toolkit#script) action where charset encoding were not properly handled. ([#8769](https://github.com/OfficeDev/TeamsFx/pull/8769))
- Fixed an issue where the app might fail to start the dev tunnel for local development due to an unexpected token error. ([#8980](https://github.com/OfficeDev/TeamsFx/pull/8980))
- Fixed an issue where migration failed due to the expected path of the `.gitignore` file. ([#8912](https://github.com/OfficeDev/TeamsFx/pull/8912))
- Fixed an issue [#8853](https://github.com/OfficeDev/TeamsFx/issues/8853) in [`botAadApp/create`](https://github.com/OfficeDev/TeamsFx/wiki/Available-actions-in-Teams-Toolkit#botaadappcreate) action where no detailed errors were printed when Teams Toolkit failed to create the app in Microsoft Entra. ([#8910](https://github.com/OfficeDev/TeamsFx/pull/8910))
- Fixed an issue in [`aadApp/create`](https://github.com/OfficeDev/TeamsFx/wiki/Available-actions-in-Teams-Toolkit#aadappcreate) and [`aadApp/update`](https://github.com/OfficeDev/TeamsFx/wiki/Available-actions-in-Teams-Toolkit#aadappupdate) actions where no detailed error messages were printed when Teams Toolkit failed to create or update the app in Microsoft Entra. ([#8911](https://github.com/OfficeDev/TeamsFx/pull/8911))
- Fixed an issue where you might see multiple login prompts when Teams Toolkit failed to retrieve the token by automatically clearing the cache. ([#9026](https://github.com/OfficeDev/TeamsFx/pull/9026))

## 5.0.0 - May 16, 2023

This major version update of Teams Toolkit addresses your top feedback requests with new features and bug fixes, including a new way to customize the automation with composable actions, integrated tunneling support for debugging using Dev Tunnels, simpler project structure and template options, and much more. We previously shared these incremental changes in the prerelease version and through a series of blog posts:

- [February Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-v5-0-prerelease/): Update the fundamental new design for Teams Toolkit that allows you to use existing cloud resources, integrate Teams Toolkit with existing projects and customize Teams Toolkit to fit your needs.
- [March Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-march-2023/): Create, debug and deploy an Outlook Add-in project with Teams Toolkit.
- [April Prerelease](https://devblogs.microsoft.com/microsoft365dev/teams-toolkit-for-visual-studio-code-update-april-2023/): Switch to an integrated and secure tunneling for bot and message extension apps. Introduced GitHub Codespaces for a new getting started experience.

We've listened to your feedback and included these additional new features, enhancements, and bug fixes to this release.

New features:

- Added a how-to guide with instructions for running and debugging apps on mobile clients.
- Simplified the Basic Tab project template by removing the dependency on React, single sign-on, and complicated example code. Use this template like an empty starting point for Tab apps.
- You can customize which version of Azure Functions Core Tools is used with the `devTool/install` action. If not specified, the default version used is `4.0.4670` and [supports Node.js 18](https://learn.microsoft.com/azure/azure-functions/functions-versions?tabs=v4&pivots=programming-language-typescript#languages).
- We've re-categorized the project templates to use familiar terminology that matches the documentation and platform.
  ![create-new-app](https://github.com/OfficeDev/TeamsFx/assets/11220663/fe3ac358-775d-4deb-9b1e-a9eb4d932e56)

Enhancements:

- Removed SPFx version selection when adding additional web parts.
- Updated the `Tab App with Azure Backend` sample to use an on-behalf-of flow for authentication.
- Added a warning message if you're using Node.js 14 because it's [no longer actively supported](https://nodejs.dev/en/about/releases/).

Sample additions:

- `Dice Roller in meeting`: The dice roller example is a simple app that allows multiple users to roll a dice and see the results. This sample is a great way to get started with Live Share and Fluid.
- `Set signature using Outlook add-in`: An Outlook add-in that demonstrates how to set an email signature.

Bug fixes:

- Fixed an issue with `xml2js` package versions that may cause security vulnerabilities. ([#8390](https://github.com/OfficeDev/TeamsFx/pull/8390))
- Fixed an issue where `manifest-file-path` will be asked twice even if it was specified in the parameter for `teamsfx update aad-app` command. ([#8435](https://github.com/OfficeDev/TeamsFx/pull/8435))
- Fixed an issue where the `Validate Application` continues with errors. ([#8467](https://github.com/OfficeDev/TeamsFx/pull/8467))
- Fixed an issue where `teamsfx validate` command will default to `dev` environment even for multi-environment projects in non-interactive cli mode when not specifying `--env` parameters. ([#8499](https://github.com/OfficeDev/TeamsFx/pull/8499))
- Fixed an issue where sometimes Teams Toolkit tree view will not show up if project upgrade detects error.([#8538](https://github.com/OfficeDev/TeamsFx/pull/8538))

## 4.2.5 - May 04, 2023

Incremental version for Teams Toolkit with an enhancement.

- Added a note on pre-requisite checker for usage of [NGROK](https://ngrok.com/).

## 4.2.4 - Feb 28, 2023

Incremental version for Teams Toolkit with an enhancement.

- Updated SharePoint Framework from `1.16.0` to `1.16.1`.

## 4.2.3 - Feb 17, 2023

Incremental version for Teams Toolkit with multiple bug fixes.

- Fixed an unexpected string change in the `create new app` flow.
- Fixed an issue where there's no response when clicking on the `Get Started` button.
- Fixed an issue where you might see `Something went wrong` when adding the bot app on Teams during a debug session.

## 4.2.2 - Feb 7, 2023

Incremental version for Teams Toolkit with multiple bugs fixes and enhancements.

Enhancements:

- Updated pre-requisite checker, applicable app templates and samples to support Node.js 18.
- Updated comments on Notification bot template for how to send notifications to an individual person.
- Updated TeamsFx-React SDK to support React 17.
- Updated TeamsFx SDK, relevant bot app templates and samples to use [CloudAdapter](https://learn.microsoft.com/javascript/api/botbuilder/cloudadapter).
- Updated app templates to use TeamsJS SDK v2.7.1.

Bug fixes:

- Fxied an issue where login page will pop up even after signed into Microsoft 365 account from Teams Toolkit.
- Fixed an issue where it may fail to run ngrok because of whitespaces in path.

## 4.2.0 - Dec 20, 2022

New features:

- Use the new Dashboard tab template to create a personal and collaborative canvas in Teams. Learn more about this new template in the [documentation](https://aka.ms/teamsfx-dashboard-app).

  ![image](https://user-images.githubusercontent.com/11220663/205831064-26f94d61-7bb7-4bc1-8678-c52be6cb27b3.png)

Enhancements:

- Step-by-step guidance in Visual Studio Code to assist you while creating a free Microsoft 365 testing tenant.
- Scaffolds that use SharePoint Framework (SPFx) have been updated to use [SharePoint Framework version 1.16](https://learn.microsoft.com/sharepoint/dev/spfx/release-1.16) which introduces the ability to build experiences for Outlook and Office.com (Microsoft 365 app) in addition to Teams.

## 4.1.3 - Nov 17, 2022

Enhancements:

- Bump up version of [@microsoft/teamsfx](https://www.npmjs.com/package/@microsoft/teamsfx) used in templates and samples to `2.0.0` that depends on [@microsoft/teams-js](https://www.npmjs.com/package/@microsoft/teams-js) version `2.0.0` and above. Starting from this version, it enables [Teams app to run in Outlook and Office.](https://learn.microsoft.com/microsoftteams/platform/m365-apps/overview)
- A/B testing on in-product documentation to display tutorial articles inside Visual Studio Code.

## 4.1.2 - Nov 10, 2022

Hotfix version for Teams Toolkit.

- Fixed bugs in Sample Gallery.

## 4.1.1 - Nov 02, 2022

Enhancements:

- Improved experience to obtain a Microsoft Graph client in [@microsoft/teamsfx](https://www.npmjs.com/package/@microsoft/teamsfx) with separated configration interfaces for different authentication flows.
- Included `useTeams` hook in [@microsoft/teamsfx-react](https://www.npmjs.com/package/@microsoft/teamsfx-react) package. Thanks to its original author [Wictor Wilén](https://github.com/wictorwilen) who first developed this hook in [msteams-react-base-component](https://github.com/wictorwilen/msteams-react-base-component) package.
- Upgraded [@microsoft/teamsfx](https://www.npmjs.com/package/@microsoft/teamsfx) to `2.0.0` that's compatible with [@microsoft/teamjs](https://www.npmjs.com/package/@microsoft/teams-js) `2.0.0` and above.
- Added a shortcut to debug and preview your Teams application from left side tree view under `DEVELOPMENT` section.

## 4.1.0 - Oct 17, 2022

New features:

- Use the new Workflow bot template to create sequential workflows where Adaptive Cards can be returned in response to user input. Learn more about this new template in the [documentation](https://aka.ms/teamsfx-card-action-response).
- Configure each step of the debugging experience in Teams Toolkit by customizing the `.vscode/tasks.json` file, which now [surfaces parameters for finer-tuned control](https://aka.ms/teamsfx-debug-tasks).
- Use the new Add SSO command for a simple way to [configure single sign-on for Message extension and Command bot projects](https://aka.ms/teamsfx-add-sso).
- SPFx developers can now combine web parts as a [multi-Tab Teams app](https://learn.microsoft.com/sharepoint/dev/spfx/build-for-teams-me-experience#build-a-multi-tab-personal-teams-app) using the Add Feature menu.

Enhancements:

- You can now send notifications to a specific channel or person with TeamsFx SDK. Checkout [code snippets](https://aka.ms/teamsfx-send-notification#send-notifications-to-a-specific-channel) here.
- We've changed which windows are shown by default when an app starts debugging so you'll no longer see red error messages coming from the browser that are mistaken as errors for your app.

## 4.0.6 - Sep 23, 2022

Incremental version for Teams Toolkit with multiple bugs fix, enhancements and new features.

New sample:

- Stock Update: Keep up to date with the latest stock price in Microsoft Teams

SDK:

- Simplified single sign-on implementation for message extension with TeamsFx SDK. Take a look at the [sample code](https://aka.ms/teamsfx-me-sso-sample).
- Simplified single sign-on implementation for command bot with TeamsFx SDK. Take a look at the [sample code](https://aka.ms/teamsfx-command-bot-sso).

## 4.0.5 - Aug 22, 2022

Incremental version for Teams Toolkit with multiple bugs fix, enhancements and a new feature to allow switch Microsoft 365 tenant and Azure subscription for local debugging and cloud provision.

## 4.0.4 - Aug 09, 2022

Incremental version for Teams Toolkit with multiple bugs fix, enhancements and new additions to sample application gallery.

New samples:

- Proactive Messaging: Save users' conversation reference to send proactive reminder messages using bots.
- One Productivity Hub: View calendar events, to-do tasks and files in Teams tab.

Enhancement:

- Enhanced experience of building Teams tab application with SharePoint Framework v1.15.0

## 4.0.3 - Jul 26, 2022

Incremental version for Teams Toolkit with multiple bugs fix and enhancements.

Enhancement:

- User can now switch Azure account or Azure subscription to provision cloud resource.
- Now support SPFx version to v1.15.0.

## 4.0.2 - Jul 12, 2022

Incremental version for Teams Toolkit with multiple bugs fix and enhancements.

## 4.0.1 - Jun 16, 2022

Incremental version for Teams Toolkit with multiple bugs fix and enhancements.

## 4.0.0 - May 24, 2022

Major version for Teams Toolkit with new features to support more Teams app scenario like notification bot and command bot. What's more, this version adds support to extend Teams app across Microsoft 365 platform like Office.com and Outlook.

New Features:

- User can create more business-oriented Teams app template using Teams Toolkit. For example, user can now create not only bot app but also notification bot or command bot. User can see more options are there to choose when create a new Teams app.
- User can create Teams app that can launch and preview in other Microsoft 365 platform like Office.com and Outlook. The options are offered when user create a new Teams app.
- User can incrementally add features to their Teams app using `Add features` in Teams Toolkit during the development process. For example, adding additional Teams extending capability, adding Azure resources like SQL Database or Azure Function etc., adding Single Sign on or API connections and so on.
- User can preview the Teams manifest file and only deploy the manifest file without deploy the whole project.
- User can customized Microsoft Entra manifest file.
- Add tutorials in the Teams Toolkit, user can find them by typing the command `Teams: View Guided Tutorials` in the command palette (Ctrl+Shift+P).
- A new sample which use Graph Connector get on board to the Sample Gallery. Click `View Samples` in Teams Toolkit to browse Sample Gallery.

Enhancement:

- UI improvement of `Create a new Teams app` and `Start from a sample`.
- UI improvement of the Teams Toolkit menus in the sidebar.
- Optimize and simplify the Sample apps. Improve the experience of Sample apps.
- Improved the experience of Teams Toolkit CLI tool.

## 3.8.0 - Apr 22, 2022

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

Enhancement:

- Optimize the configuration schema and manifest template of project created by Teams Toolkit.
- Support to use CodeLens to preview variables value in manifest template file.
- Optimize the In-meeting Sample App in sample gallery, shorten the time to run the sample.
- Improved "Start from a sample" UI, show more information of each sample.

## 3.7.0 - Apr 06, 2022

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

New Features:

- Provide multiple entry points of creating testing tenant/accounts to unblock user from Microsoft 365 account issues, like Microsoft 365 account does not have custom app upload permission or user does not have Microsoft 365 account at all. These entry points include an Add(+) button besides ACCOUNTS in sidebar, an new "Create an account" option in `Teams: Accounts` Command and improved Get Started page.

Enhancement:

- Improved SPFx Project scaffolding experience by using Yeoman Generator.

## 3.6.1 - Mar 23, 2022

Hotfix version for Teams Toolkit with multiple bugs fixed.

## 3.6.0 - Mar 21, 2022

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

New Features:

- Optimized Get Started page for Teams Toolkit. User can check environment prerequisites from Get started now.
- User can use Teams Toolkit to create workflow automation templates for Github, Azure DevOps and Jenkins.

Enhancement:

- Enhance TeamsFx SDK.

## 3.5.0 - Mar 07, 2022

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

New Features:

- New sample app - Teams tab app without SSO.

Enhancement:

- Teams tab app generated from "create a new Teams app" can now use graph toolkit to retrieve user data.

## 3.4.0 - Feb 21, 2022

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

Enhancement:

- Improved local debug experience, more light weighted and more graceful.

## 3.3.0 - Feb 07, 2022

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

New Features:

- "Add cloud resources" feature now supports adding multiple instances of the same cloud resource type. For example, add multiple instance of SQL DB at the same time.

Enhancement:

- Teams Tab project created by Teams Toolkit now is updated to use Auth Code Flow with PKCE for SPA authentication. You can find more details [here](https://aka.ms/teamsfx-auth-code-flow). Please be noted that Tab project created by Teams Toolkit of this version will not be supported by previous versions of Teams Toolkit.

## 3.2.0 - Jan 10, 2022

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

New Features:

- Use Service Principle to login Azure account in CICD template.
- Support building React Tab app by different environment variables for multiple environments.

Enhancement:

- Provide guidance to install development certificate on WSL. See guidance [here](https://github.com/OfficeDev/TeamsFx/blob/dev/docs/fx-core/localdebug-help.md#how-to-manually-install-the-development-certificate-for-windows-subsystem-for-linux-wsl-users)
- Support .NET SDK 6.0.
- Improve the experience to preview manifest file and update manifest file to Developer Portal.
- Improve CICD template by reducing dependency on project metadata file.

## 3.1.1 - Dec 27, 2021

This is a hotfix version.

The Azure App service is upgraded and does not support some older NodeJs versions in some regions any more. This hotfix solves the problem that Azure App service is not working in those regions which does not support older NodeJs versions.

## 3.1.0 - Dec 13, 2021

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

New Features:

- Integrate with Azure Key Vault to secure your application secrets at runtime.
- View state file and edit environment configurations from manifest with code lens.

Enhancement:

- Support Node.js 16 and NPM 7 except for SPFx based tab application or projects including Azure Functions.

## 3.0.0 - Nov 29, 2021

Major version for Teams Toolkit with new features to support cloud resources customization, multiple cloud environments, collaborations and some bug fix.

New Features:

- Adopt ARM templates to provision Azure cloud resources, support customization of cloud resources. Refer to [Provision cloud resources](https://aka.ms/provision-doc) for more information.
- Developers can create and manage multiple cloud environments with different customizations for each environment. Refer to [Manage multiple environment](https://aka.ms/multi-env-doc) for more information.
- Developers can collaborate with others on the same project. Refer to [Collaborations in Teams Toolkit](https://aka.ms/collaboration-doc) for more information.
- Support manifest customization for both local and remote environment. Refer to [Customize manifest](https://aka.ms/customize-manifest-doc) for more information.
- Provide flexibility to add cloud resources to your project using ARM template. Refer to [Add cloud resources](https://aka.ms/add-resources-doc) for more information.
- Add more Teams Sample Apps which support local run with no need to manually set up environment.

Enhancement:

- Improve UI: In sample gallery, add time and effort estimation for each sample.
- Improve UI: multiple enhancement to the Tree View. For example, provide documents links in Tree View, and enrich the tooltip descriptions.
- Reduce the required user inputs in order to create new project.
- Enhance the status and messages showed in Teams Toolkit.
- Upgrade samples to adopt new features in Teams Toolkit.

## 2.10.0 - Nov 15, 2021

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

New Features:

- Enable developers with the capability to extend Teams apps to run across Microsoft 365, get instructions from our [documentation](https://aka.ms/teamsfx-extend-m365).
- Provide Teams sample apps "Todo List (Works in Teams, Outlook and Office)" and "NPM Search Connector" which can run across Microsoft 365. Users can get an initial experience of running Teams apps in Microsoft 365.

## 2.9.0 - Nov 01, 2021

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

Preview Features:

- Enable CI/CD for multiple environments scenario.
- Insider Preview features in 2.8.0 release are still in preview. Refer to [Enable insider preview features](https://github.com/OfficeDev/TeamsFx/wiki/Enable-Preview-Features-in-Teams-Toolkit) for how to use.
- Upgrade existing projects to support preview features, refer to [Upgrade existing project to use latest features](https://github.com/OfficeDev/TeamsFx/wiki/Upgrade-project-to-use-latest-Toolkit-features) for more information.

Enhancement:

- Improve UI: more friendly user experience to create a new Teams project.
- Improve UI: add links to source code for samples.
- Support one-click deployment of SharePoint framework based Teams app.
- Integrate Adaptive Card Studio with previewing and debugging Adaptive Card in VS Code.

## 2.8.0 - Oct 18, 2021

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

Preview Features:

- Support management of multiple environments.
- Support project collaborations among multiple developers.
- Improve the experience to customize Azure resource provision using ARM(Azure Resource Manager).

To enable the preview features, refer to the [preview guidance](https://github.com/OfficeDev/TeamsFx/wiki/Enable-Preview-Features-in-Teams-Toolkit)

Enhancement:

- Improve UI: making the Tree View and Command Pallete text consistent.
- UX A/B testing:
  - Your Tree View(sidebar) may include or exclude quick start page.
  - You may or may not be invited to do local debug after create new project.

## 2.7.0 - Sep 17, 2021

Incremental version for Teams Toolkit with multiple bugs fixes and the following updates:

Enhancement:

- Improved version upgrade experience by adding "What is New?" info.
- Simplified welcome view when clicking the Toolkit logo on the sidebar.

## 2.6.0 - Sep 06, 2021

Incremental version for Teams Toolkit with multiple bugs fixed and the following updates：

New Feature:

- Support projects migration from Teams Toolkit V1 to V2. If your Teams projects are created using Teams Toolkit V1, try migrate your project follow the [migration instructions](https://aka.ms/teamsfx-migrate-v1).
- Support local debug experience for Teams Tab/Bot/Messaging extension project migrated from Teams Toolkit V1.
- Check permission to turn-on Teams custom app uploading when user sign-in to Microsoft 365 account. Learn more about [custom app upload permission](https://docs.microsoft.com/en-us/microsoftteams/platform/concepts/build-and-test/prepare-your-o365-tenant#enable-custom-teams-apps-and-turn-on-custom-app-uploading).
- (Preview Feature) Support provision cloud resources using Azure Resource Manager. To enable this feature, please follow [instructions](https://github.com/OfficeDev/TeamsFx/wiki/Enable-Preview-Features-in-Teams-Toolkit).

Enhancement:

- UI Enhancement:
  - Hide Azure account login for SharePoint projects.
  - Tree View A/B testing: with non-Teams projects open, you may randomly see either one of two different Tree View layouts in the side bar.
- Optimization of created project folder structure.
- Improved getting start experience of creating new project for Bot.
- Upgrade Sample apps. Enable CI/CD workflow for Todo-List with Azure backend sample. More samples are coming, view them at [Sample GitHub open source repo](https://github.com/OfficeDev/TeamsFx-samples)

## 2.5.0 - Aug 23 2021

Incremental version for Teams Toolkit with multiple bugs fixed and the following updates：

New Feature:

- Enable create project from quick start page.
- Enable report issue from local debug pop-up error message.
- Enable CI/CD workflow with Github Actions. Check [CI/CD instructions](https://github.com/OfficeDev/TeamsFx/tree/dev/docs/cicd) to learn how to use.

Enhancement:

- Update new CLI progress bar.
- Improve some UI experience.
- Add more information in the output error message of debug.

## 2.4.1 - Aug 10 2021

Incremental version for Teams Toolkit with multiple bugs fixed and the following updates：

New Feature:

- Add extension accessiblity for the disabled.
- Add CLI command 'teamsfx preview' to preview SPFx apps.

Enhancement:

- A/B testing for Tree View design. You may randomly see either one of two different Tree View layouts in the side bar.

## 2.3.1 - July 26 2021

Incremental version for Teams Toolkit with multiple bugs fixed and the following updates：

New Feature:

- Add CLI command 'teamsfx preview' to directly preview Teams apps after scaffolding.
- For multiple developers collaborate on one project, Teams Toolkit enables developers to create their own local environment by pressing F5.
- Add encryption to secret data in .userdata file, and support view/edit secret data through VS Code UI and CLI tool.

Enhancement:

- Speed up the installation of npm dependency for debugging experience.

## 2.2.0 - July 12 2021

Incremental version for Teams Toolkit with following updates：

Added:

- UI Run button for debug and preview
- Provide 'Report Issue' button in the pop-up error message to log issues when npm install fails or system error occurs
- A/B testing:  
  Please be noted that in this release we are conducting A/B testing for 'Tree View', the left panel of Teams Toolkit. Thus you may see different layout of Tree View, that is not an issue but totally by design.

## 2.1.1 - June 30 2021

Multiple bug fixings

## 2.1.0 - June 15 2021

Incremental version for Teams Toolkit with the following updates:

Added:

- enable customer survey from toolkit
- add FAQ plus to the samples
- better local debug experience

## 2.0.1 - May 25 2021

2.0.1 is a major version upgrade for Teams Toolkit with many new improvements and supports.

Added:

- new design of UI and command palette list
- new getting started guide, samples and doc link from toolkit
- new sign-in experience for Microsoft 365 and Azure
- new interactive flow for creating new app
- add messaging extension capability to Teams app
- sample codes for in-meeting app.
- support e2e dev experience for tab app hosted by either Azure or SPFx
- support adding backend API (Azure Functions) and SQL DB to tab app
- preview support for tab app, bot app, and messaging extension
- dev environment checking and auto-setup
- cloud provision and deploy for Teams app from treeview UI and command palette
- support simplified auth code and graph client through scaffolding
- Mac/Linux support of new toolkit
- integration with GitHub Codespaces for dev/test

Enhanced:

- improved helloworld app through scaffolding for tab app, bot app, and messaging extension
- imoroved local frontend/backend debugging support for tab app, bot app, and messaging extension
- improved error messages and logging
- improved publish to teams flow

Fixed:

- cumulated bug fixes

## 1.2.3 - April 20 2021

- Add scaffold option for a Teams messaging extension with SSO (Single Sign-on)

## 1.2.2 - April 1 2021

- Increase the timout limit when creating a Microsoft Entra password for a bot registration.

## 1.2.1 - March 15 2021

- Bug fix for env/manifest file automatic replacements not happening for some scaffolds.
- Bug fix for Microsoft Entra app creation where consent should be admin and users and not just admin.

## 1.2.0 - March 2021

- Pull scaffolds from public github repository for always up to date content.
- Updated scaffold selection wizard with more details on what is available.
- More scaffolding and language options.
- Publishing package support when manifest.json is updated locally the zip and cloud configuration in App Studio is created/updated.
- New scaffolds repository https://github.com/OfficeDev/Microsoft-Teams-Samples

## 1.1.8 - 9 Dec 2020

- Microsoft Entra single sign-on bug fixes for Group tabs

## 1.1.4 - 1 Dec 2020

- Microsoft Entra single sign-on documentation updates
- Bug fixes

## 1.1.3 - 24 Nov 2020

- Microsoft Entra single sign-on scaffolding for Tab apps
- Download application publishing package from VS Code
- Bug fixes

## 1.1.1 & 1.1.2

- Bug fixes

## 1.1.0 - 27 Oct 2020

- Onboard to the new VS Code auth
- New F5
- Deprecation of .publish folder - all updates you do through App Studio tooling
- Pre 1.1.0 project upgrade to new project format. We detect if they don't have a teamsAppId in the project...and if they have a .publish folder we create an app registration for them and update the project.
- New bot creation wizard updates
- New project creation flow
- Bug fixes

## 1.0.4 - 3 Aug 2020

Publish to your org catalog from the toolkit

## 1.0.2 - 15 Jul 2020

Bug fixes

## 1.0.1 - 10 Jul 2020

Quality improvements

## 1.0.0 - 7 Jul 2020

Bug fixes

## 0.9.6 - 30 June 2020

Added

- A new bot service instance is automatically created in Azure when a bot/messaging extension project is provisioned and requires one.
- Run your project in the Teams client by hitting F5.

## 0.9.5 - 19 May 2020

Extension released in preview.
