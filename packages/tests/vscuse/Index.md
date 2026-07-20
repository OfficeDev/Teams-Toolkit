# VscUse Test Cases Index

This document indexes all available VscUse (VS Code UI automation) test plans under `vscode-test-cases/plans/`.

> **PR-triggered test runs:** Add label `atk-vsuse-test` to a PR. GitHub Copilot will auto-select relevant plans based on the PR title, description, and changed files, then run the full pipeline (VSIX build -> Docker image -> UI tests). If the PR changes a test plan file under `vscode-test-cases/plans/`, that plan is automatically selected and run as an **impacted** case. See [`.github/workflows/pr-vscuse-test.yml`](../../.github/workflows/pr-vscuse-test.yml).

---

## Keyword to Category Quick Reference

| PR touches...                                              | Category                                               |
|------------------------------------------------------------|--------------------------------------------------------|
| Declarative Agent, DA, plugin, MCP, TypeSpec, Copilot ext | [DA (Declarative Agent)](#da-declarative-agent)        |
| Custom Engine, LLM bot, AI bot                             | [Basic Custom Engine Agent](#basic-custom-engine-agent)|
| General Teams agent templates                              | [General Teams Agent](#general-teams-agent)            |
| AI search, custom API, knowledge/RAG                       | [Teams Agent With Data](#teams-agent-with-data)        |
| Collaborator, multi-user agent                             | [Teams Collaborator Agent](#teams-collaborator-agent)  |
| Weather bot, playground sample                             | [Weather Agent](#weather-agent)                        |
| Simple bot, echo bot, notification bot                     | [Simple Bot](#simple-bot)                              |
| Message extension, search/action command                   | [Message Extension](#message-extension)                |
| Tab, React, SPFx, frontend                                 | [Tab](#tab)                                            |
| Sample gallery, CoffeeAgent, Data Analyst, ProxyAgent      | [Sample](#sample)                                      |
| VS Code UI, treeview, command palette, publish, provision  | [Feature](#feature)                                    |
| Template README                                            | [Template Verification](#template-verification)        |

---

## DA (Declarative Agent)

**Keywords:** declarative agent, DA, Copilot extension, plugin, MCP, TypeSpec, OpenAPI, OAuth, API Key, Entra, knowledge, action

| Test Plan | Auth / Scenario |
|-----------|-----------------|
| `DA_No_Action_Local_Debug` | No action — local |
| `DA_No_Action_Remote_Debug` | No action — remote |
| `DA_No_Action_Add_Action` | Add action to no-action DA |
| `DA_No_Action_Add_Knowledge_Onedrive` | OneDrive knowledge |
| `DA_No_Action_Web_Search` | Web search |
| `DA_None_js_Local_Debug` | None auth JS local |
| `DA_None_js_Remote_Debug` | None auth JS remote |
| `DA_None_ts_Local_Debug` | None auth TS local |
| `DA_None_ts_Remote_Debug` | None auth TS remote |
| `DA_Api_Key_js_Local_Debug` | API Key JS local |
| `DA_Api_Key_js_Remote_Debug` | API Key JS remote |
| `DA_Api_Key_ts_Local_Debug` | API Key TS local |
| `DA_Api_Key_ts_Remote_Debug` | API Key TS remote |
| `DA_Oauth_js_Local_Debug` | OAuth JS local |
| `DA_Oauth_js_Remote_Debug` | OAuth JS remote |
| `DA_Oauth_ts_Local_Debug` | OAuth TS local |
| `DA_Oauth_ts_Remote_Debug` | OAuth TS remote |
| `DA_Microsoft_Entra_js_Local_Debug` | Entra SSO JS local |
| `DA_Microsoft_Entra_js_Remote_Debug` | Entra SSO JS remote |
| `DA_Microsoft_Entra_ts_Local_Debug` | Entra SSO TS local |
| `DA_Microsoft_Entra_ts_Remote_Debug` | Entra SSO TS remote |
| `DA_MCP_None_Remote` | MCP None auth remote |
| `DA_MCP_Entra_SSO_Remote` | MCP Entra SSO remote |
| `DA_MCP_Oauth_Remote` | MCP OAuth remote |
| `DA_Add_Action_Import_Existing_API` | Import existing API |
| `DA_Add_Action_Import_Existing_API_Basic_No_Auth` | Import API (No Auth) |
| `DA_Add_Action_Import_Existing_API_Basic_API_Key` | Import API (API Key) |
| `DA_Add_Action_Import_Existing_API_Basic_OAuth` | Import API (OAuth) |
| `DA_Add_Action_Import_Existing_API_Bearer_token` | Import API (Bearer) |
| `DA_AddCapability_CopilotConnector` | Add Copilot Connector |
| `DA_Regenrate_Action` | Regenerate action |
| `DA_Error_Message_of_Legacy_Projects` | Legacy project errors |
| `DA_With_EK_Happy_Path` | External knowledge |
| `DA_Typespec_No_Action` | TypeSpec no action |
| `DA_Typespec_With_Action` | TypeSpec with action |
| `DA_Typespec_Oauth_With_Reference_Id` | TypeSpec OAuth + ref ID |
| `DA_Typespec_Oauth_Without_Reference_Id` | TypeSpec OAuth no ref ID |

---

## Basic Custom Engine Agent

**Keywords:** custom engine, LLM bot, AI bot, Azure OpenAI, OpenAI, Copilot chat, playground

| Test Plan | Lang | Provider | Mode |
|-----------|------|----------|------|
| `Basic_Custom_Engine_Azure_OpenAI_js_Local_Debug` | JS | Azure OpenAI | Local |
| `Basic_Custom_Engine_Azure_OpenAI_js_remote_debug` | JS | Azure OpenAI | Remote |
| `Basic_Custom_Engine_Azure_OpenAI_js_playground` | JS | Azure OpenAI | Playground |
| `Basic_Custom_Engine_Azure_OpenAI_js_Copilot_Local_Debug` | JS | Azure OpenAI | Copilot local |
| `Basic_Custom_Engine_Azure_OpenAI_js_Copilot_Remote_Debug` | JS | Azure OpenAI | Copilot remote |
| `Basic_Custom_Engine_Azure_OpenAI_ts_Local_Debug` | TS | Azure OpenAI | Local |
| `Basic_Custom_Engine_Azure_OpenAI_ts_remote_debug` | TS | Azure OpenAI | Remote |
| `Basic_Custom_Engine_Azure_OpenAI_ts_playground` | TS | Azure OpenAI | Playground |
| `Basic_Custom_Engine_Azure_OpenAI_ts_Copilot_Local_Debug` | TS | Azure OpenAI | Copilot local |
| `Basic_Custom_Engine_Azure_OpenAI_ts_Copilot_Remote_Debug` | TS | Azure OpenAI | Copilot remote |
| `Basic_Custom_Engine_Azure_OpenAI_py_playground` | Py | Azure OpenAI | Playground |
| `Basic_Custom_Engine_Agent_Azure_OpenAI_py_Local_Debug` | Py | Azure OpenAI | Local |
| `Basic_Custom_Engine_Agent_Azure_OpenAI_py_Remote_Debug` | Py | Azure OpenAI | Remote |
| `Basic_Custom_Engine_OpenAI_js_Local_Debug` | JS | OpenAI | Local |
| `Basic_Custom_Engine_OpenAI_js_Remote_Debug` | JS | OpenAI | Remote |
| `Basic_Custom_Engine_OpenAI_js_playground` | JS | OpenAI | Playground |
| `Basic_Custom_Engine_OpenAI_js_Copilot_Local_Debug` | JS | OpenAI | Copilot local |
| `Basic_Custom_Engine_OpenAI_js_Copilot_Remote_Debug` | JS | OpenAI | Copilot remote |
| `Basic_Custom_Engine_OpenAI_ts_Local_Debug` | TS | OpenAI | Local |
| `Basic_Custom_Engine_OpenAI_ts_Remote_Debug` | TS | OpenAI | Remote |
| `Basic_Custom_Engine_OpenAI_ts_playground` | TS | OpenAI | Playground |
| `Basic_Custom_Engine_OpenAI_ts_Copilot_Local_Debug` | TS | OpenAI | Copilot local |
| `Basic_Custom_Engine_OpenAI_ts_Copilot_Remote_Debug` | TS | OpenAI | Copilot remote |

---

## General Teams Agent

**Keywords:** Teams agent, general agent

| Test Plan | Lang | Provider | Mode |
|-----------|------|----------|------|
| `General_Teams_Agent_Azure_OpenAI_js_Local_Debug` | JS | Azure OpenAI | Local |
| `General_Teams_Agent_Azure_OpenAI_js_Remote_Debug` | JS | Azure OpenAI | Remote |
| `General_Teams_Agent_Azure_OpenAI_js_playground` | JS | Azure OpenAI | Playground |
| `General_Teams_Agent_Azure_OpenAI_js_Copilot_Local_Debug` | JS | Azure OpenAI | Copilot local |
| `General_Teams_Agent_Azure_OpenAI_js_Copilot_Remote_Debug` | JS | Azure OpenAI | Copilot remote |
| `General_Teams_Agent_Azure_OpenAI_py_Local_Debug` | Py | Azure OpenAI | Local |
| `General_Teams_Agent_Azure_OpenAI_py_Remote_Debug` | Py | Azure OpenAI | Remote |
| `General_Teams_Agent_Azure_OpenAI_py_playground` | Py | Azure OpenAI | Playground |
| `General_Teams_Agent_Azure_OpenAI_py_Copilot_Local_Debug` | Py | Azure OpenAI | Copilot local |
| `General_Teams_Agent_Azure_OpenAI_py_Copilot_Remote_Debug` | Py | Azure OpenAI | Copilot remote |
| `General_Teams_Agent_Azure_OpenAI_ts_Local_Debug` | TS | Azure OpenAI | Local |
| `General_Teams_Agent_Azure_OpenAI_ts_Remote_Debug` | TS | Azure OpenAI | Remote |
| `General_Teams_Agent_Azure_OpenAI_ts_playground` | TS | Azure OpenAI | Playground |
| `General_Teams_Agent_Azure_OpenAI_ts_Copilot_Local_Debug` | TS | Azure OpenAI | Copilot local |
| `General_Teams_Agent_Azure_OpenAI_ts_Copilot_Remote_Debug` | TS | Azure OpenAI | Copilot remote |
| `General_Teams_Agent_OpenAI_js_Local_Debug` | JS | OpenAI | Local |
| `General_Teams_Agent_OpenAI_js_Remote_Debug` | JS | OpenAI | Remote |
| `General_Teams_Agent_OpenAI_py_Local_Debug` | Py | OpenAI | Local |
| `General_Teams_Agent_OpenAI_py_Remote_Debug` | Py | OpenAI | Remote |
| `General_Teams_Agent_OpenAI_ts_Local_Debug` | TS | OpenAI | Local |
| `General_Teams_Agent_OpenAI_ts_Remote_Debug` | TS | OpenAI | Remote |

---

## Teams Agent With Data

**Keywords:** AI search, custom API, knowledge, RAG, data

### AI Search (15 plans)
`Teams_Agent_With_Data_AI_Search_{Azure_OpenAI|OpenAI}_{js|ts|py}_{Local_Debug|Remote_Debug|Playground_Debug}`

### Custom API (15 plans)
`Teams_Agent_With_Data_Custom_API_{Azure_OpenAI|OpenAI}_{js|ts|py}_{Local_Debug|Remote_Debug|PlayGround}`

### Customize (27 plans)
`Teams_Agent_With_Data_Customize_{Azure_OpenAI|OpenAI}_{js|ts|py}_{Local_Debug|Remote_Debug|Playground_Debug|Copilot_Local_Debug|Copilot_Remote_Debug}`

---

## Teams Collaborator Agent

**Keywords:** collaborator, multi-user, team collaboration

| Test Plan | Mode |
|-----------|------|
| `Teams_Collaborator_Agent_local_debug` | Local |
| `Teams_Collaborator_Agent_remote_debug` | Remote |
| `Teams_Collaborator_Agent_debug_in_playground` | Playground |

---

## Weather Agent

**Keywords:** weather, OpenAI, Azure OpenAI, sample, Copilot

| Test Plan | Lang | Mode |
|-----------|------|------|
| `Weather_Agent_js_Local_Debug` | JS | Local |
| `Weather_Agent_js_remote_debug` | JS | Remote |
| `Weather_Agent_js_local_copilot` | JS | Copilot local |
| `Weather_Agent_js_remote_copilot` | JS | Copilot remote |
| `Weather_Agent_ts_Local_Debug` | TS | Local |
| `Weather_Agent_ts_remote_debug` | TS | Remote |
| `Weather_Agent_ts_local_copilot` | TS | Copilot local |
| `Weather_Agent_ts_remote_copilot` | TS | Copilot remote |
| `Weather_Agent_OpenAI_js_Local_Debug` | JS | OpenAI local |
| `Weather_Agent_OpenAI_js_Remote_Debug` | JS | OpenAI remote |
| `Weather_Agent_OpenAI_js_playground` | JS | OpenAI playground |
| `Weather_Agent_OpenAI_js_Copilot_Local_Debug` | JS | OpenAI Copilot local |
| `Weather_Agent_OpenAI_js_Copilot_Remote_Debug` | JS | OpenAI Copilot remote |
| `Weather_Agent_OpenAI_ts_Local_Debug` | TS | OpenAI local |
| `Weather_Agent_OpenAI_ts_Remote_Debug` | TS | OpenAI remote |
| `Weather_Agent_OpenAI_ts_playground` | TS | OpenAI playground |
| `Weather_Agent_OpenAI_ts_Copilot_Local_Debug` | TS | OpenAI Copilot local |
| `Weather_Agent_OpenAI_ts_Copilot_Remote_Debug` | TS | OpenAI Copilot remote |
| `Weather_Agent_Azure_OpenAI_js_playground` | JS | Azure OpenAI playground |
| `Weather_Agent_Azure_OpenAI_ts_playground` | TS | Azure OpenAI playground |

---

## Simple Bot

**Keywords:** simple bot, echo bot, notification

| Test Plan | Lang | Mode |
|-----------|------|------|
| `Simple_Bot_js_Local_Debug` | JS | Local |
| `Simple_Bot_js_Remote_Debug` | JS | Remote |
| `Simple_Bot_js_playground` | JS | Playground |
| `Simple_Bot_ts_Local_Debug` | TS | Local |
| `Simple_Bot_ts_Remote_Debug` | TS | Remote |
| `Simple_Bot_ts_playground` | TS | Playground |
| `Simple_bot_py_local_debug` | Py | Local |
| `Simple_bot_py_remote_debug` | Py | Remote |
| `Simple_Bot_py_playground` | Py | Playground |

---

## Message Extension

**Keywords:** message extension, search, action command, compose extension

| Test Plan | Lang | Mode |
|-----------|------|------|
| `Message_Extension_ts_Local_Debug` | TS | Local |
| `Message_Extension_ts_Playground_Debug` | TS | Playground |
| `Message_extension_ts_remote_debug` | TS | Remote |
| `Message_Extension_py_Local_Debug` | Py | Local |
| `Message_Extension_py_Remote_Debug` | Py | Remote |
| `Message_Extension_py_Playground_Debug` | Py | Playground |

---

## Tab

**Keywords:** tab, React, SPFx, frontend, static tab

| Test Plan | Description |
|-----------|-------------|
| `Basic_Tab_Local_Debug` | Basic Tab local |
| `Basic_Tab_Remote_Debug` | Basic Tab remote |
| `Tab_Local_Debug_Env_Local_Creation` | Tab local env creation |
| `Tab_With_Upgraded_Manifest_Remote_Debug` | Tab upgraded manifest remote |

---

## Sample

**Keywords:** sample, gallery, CoffeeAgent, Data Analyst, ProxyAgent, SSO, Bot SSO, Meeting

| Test Plan | Description |
|-----------|-------------|
| `Sample_CoffeeAgent_Local` | CoffeeAgent local |
| `Sample_CoffeeAgent_Remote` | CoffeeAgent remote |
| `Sample_CoffeeAgent_Local_playground` | CoffeeAgent local playground |
| `Sample_Data_Analyst_Agent_Local_Debug` | Data Analyst Agent local |
| `Sample_Data_Analyst_Agent_Remote_Debug` | Data Analyst Agent remote |
| `Sample_Data_Analyst_Agent_Playground_Debug` | Data Analyst Agent playground |
| `Sample_Da_Ristorante_Api_Local_Debug` | Da Ristorante API local |
| `Sample_Da_Ristorante_Api_Remote_Debug` | Da Ristorante API remote |
| `Sample_ProxyAgent_NodeJS_Local_Debug` | ProxyAgent NodeJS local |
| `Sample_ProxyAgent_NodeJS_Remote_Debug` | ProxyAgent NodeJS remote |
| `Sample_Copilot_Connection_Local_Debug` | Copilot Connection local |
| `Sample_Copilot_Connection_Remote_Debug` | Copilot Connection remote |
| `Sample_Bot_Sso_Local_Debug` | Bot SSO local |
| `Sample_Bot_Sso_Remote_Debug` | Bot SSO remote |
| `Sample_Adaptive_Card_Notification_Local_Debug` | Adaptive Card Notification local |
| `Sample_Adaptive_Card_Notification_Remote_Debug` | Adaptive Card Notification remote |
| `Sample_Stocks_Update_Notification_Bot_Local_Debug` | Stocks Update Notification local |
| `Sample_Stocks_Update_Notification_Bot_Remote_Debug` | Stocks Update Notification remote |
| `Sample_Large_Notification_Bot_Remote_Debug_Only` | Large Notification Bot remote |
| `Sample_Hello_World_Meeting_Local_Debug` | Hello World Meeting local |
| `Sample_Hello_World_Meeting_Remote_Debug` | Hello World Meeting remote |
| `Sample_Dice_Roller_in_meeting_Local_Debug` | Dice Roller in Meeting local |
| `Sample_Dice_Roller_in_meeting_Remote_Debug` | Dice Roller in Meeting remote |
| `Sample_Tab_And_Outlook_Addin_Local_Debug` | Tab + Outlook Add-in local |
| `Sample_Tab_And_Outlook_Addin_Remote_Debug` | Tab + Outlook Add-in remote |
| `Sample_Tab_With_Azure_Backend_Local_Debug` | Tab + Azure Backend local |
| `Sample_Tab_With_Azure_Backend_Remote_Debug` | Tab + Azure Backend remote |
| `Sample_SSO_Enabled_Tab_via_APIM_Proxy_Local_Debug` | SSO Tab via APIM Proxy local |
| `Sample_SSO_Enabled_Tab_via_APIM_Proxy_Remote_Debug` | SSO Tab via APIM Proxy remote |
| `Sample_Teams_Center_Dashboard_Local_Debug` | Teams Center Dashboard local |
| `Sample_Teams_Center_Dashboard_Remote_Debug` | Teams Center Dashboard remote |
| `Sample_One_Productivity_Hub_using_Toolkit_Local_Debug` | One Productivity Hub local |
| `Sample_One_Productivity_Hub_using_Toolkit_Remote_Debug` | One Productivity Hub remote |
| `Sample_Reddit_Link_Unfurling_Local_Debug` | Reddit Link Unfurling local |
| `Sample_Reddit_Link_Unfurling_Remotel_Debug` | Reddit Link Unfurling remote |
| `Sample_Share_Now_Local_Debug` | Share Now local |
| `Sample_Msgext_Search_Python_Local_Debug` | Msgext Search Python local |
| `Sample_Contact_Exporter_Local_Debug` | Contact Exporter local |
| `Sample_Contact_Exporter_Remote_Debug` | Contact Exporter remote |
| `Sample_Graph_RSC_Helper_Debug_in_Group_Chat` | Graph RSC Helper group chat |
| `Sample_Graph_RSC_Helper_Debug_in_Team_Channel` | Graph RSC Helper team channel |
| `Sample_Teams_Conversation_Bot_using_Python_Only_Remote` | Teams Conversation Bot Python remote |
| `Sample_APIM_GenAI_Gateway_Remote_Debug` | APIM GenAI Gateway remote |

---

## Feature

**Keywords:** VS Code UI, treeview, command palette, publish, provision, deploy, AAD, TDP, manifest, codelens, sign in

### DA Features (23 plans)
All plans starting with `Feature_DA_` or `Feature__DA_` or `Feature_Check_DA_`.

### Bot / Debug Features
`Feature_Simple_Bot_*`, `Feature_LocalDebug_*`, `Feature_Bot_Collaboration_*`, `Feature__Debug_*`

### AI Key Features
`Feature_AI_Key_Verification`, `Feature_LocalDebug_AI_Search_*`, `Feature_LocalDebug_Custom_API_*`

### Provision / Deploy Features
`Feature_Provision_*`, `Feature_Deploy_*`, `Feature_Arm_*`, `Feature_Del_Resource_Group_*`, `Feature_Set_Sub_Id_*`, `Feature_Prompt_Use_*`

### Publish Features
`Feature_Publish_*`, `Feature_Open_DeveloperPortal_*`, `Featrue_Open_DeveloperPortal_*`

### Manifest / Validation Features
`Feature_Validate_*`, `Feature_Zip_*`, `Feature_AppYmlFile_*`, `Feature_intelli_sense_*`

### Account / Sign-in Features
`Feature_Sign_*`, `Feature_Check_copilot_*`, `Feature__Test_*AAD`

### TDP Features
`Feature_Add_*_From_TDP`

### UI / UX Features
`Feature_UI_*`, `Feature_Command_Palette_*`, `Feature_ATK_*`, `Feature_Adapt_*`, `Feature_Document_*`, `Feature_Redirect_*`, `Feature__Recommend_*`, `Feature__Show_*`, `Feature_Report_*`, `Feature_Sample_UI`, `Feature_Newproject_*`

### Tab Features
`Feature_Tab_Collaboration_*`, `Feature_Basic_Tab_Instant_Tab_*`

### Message Extension Features
`Feature_Message_Extension_*`, `Feature_Modify_Playground_*`

---

## Template Verification

| Test Plan | Description |
|-----------|-------------|
| `Template_And_Sample_Readme_Verification` | Verify README in all templates and samples |

---

## Smoke Test Cases

Minimal set used as fallback when AI selection fails (`smoking-test-cases.json`):

- `Basic_Custom_Engine_Azure_OpenAI_ts_Copilot_Remote_Debug`
- `General_Teams_Agent_OpenAI_py_Remote_Debug`
- `Message_extension_ts_remote_debug`
- `DA_Oauth_js_Remote_Debug`
- `Teams_Agent_With_Data_AI_Search_Azure_OpenAI_ts_Remote_Debug`

---

## Running Tests Manually

Trigger [`uitest-vscuse-template`](../../.github/workflows/ui-test-vscuse-template.yml) via `workflow_dispatch`:

| Input | Description | Default |
|-------|-------------|---------|
| `test_plan` | Comma-separated plan names | _(all DA/bot plans)_ |
| `image_tag` | Docker image tag | `latest` |
| `vscuse_version` | VSCUSE Python package version | `latest` |
| `max_retries` | Retry attempts (1-20) | `7` |

**Docker image:** `ghcr.io/officedev/vscuse-atk-vscodejobs:<tag>`
