# Blank App

This is a blank Microsoft 365 app project created with Microsoft 365 Agents Toolkit.

## Get Started

This project contains the minimal structure for a Microsoft 365 app:

| File/Folder | Contents |
| - | - |
| `appPackage/manifest.json` | Teams app manifest — defines your app's metadata, icons, and capabilities. |
| `appPackage/color.png` | Color icon for your app (192x192). |
| `appPackage/outline.png` | Outline icon for your app (32x32). |
| `m365agents.yml` | Main project file — defines lifecycle tasks like provision and publish. |
| `m365agents.local.yml` | Overrides for local development. |

## Build Your App

This blank project is a starting point. Add capabilities by editing `manifest.json`:

- **Add a Bot** — define a `bots` section in the manifest
- **Add a Tab** — define a `staticTabs` or `configurableTabs` section
- **Add a Message Extension** — define a `composeExtensions` section
- **Add a Declarative Agent** — define a `copilotAgents.declarativeAgents` section

## Provision and Preview

1. Press `F5` or run `Provision` from the command palette to register your app
2. Launch `Preview in Copilot (Edge)` or `Preview in Copilot (Chrome)` to open your app in Microsoft 365 Copilot

## Learn More

- [Microsoft 365 Agents Toolkit documentation](https://learn.microsoft.com/microsoftteams/platform/toolkit/teams-toolkit-fundamentals)
- [Teams app manifest reference](https://learn.microsoft.com/microsoftteams/platform/resources/schema/manifest-schema)
