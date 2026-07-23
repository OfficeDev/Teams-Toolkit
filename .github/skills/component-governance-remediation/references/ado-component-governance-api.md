# Azure DevOps Component Governance API

## Authentication

Use the existing Azure CLI identity and the Azure DevOps resource ID:

```text
499b84ac-1321-427f-aa17-267ca6975798
```

Pass it to `az rest --resource`. This obtains an Azure DevOps access token without exposing the token to the agent or terminal output.

## Resource-Area Discovery

Component Governance uses an organization-specific resource-area host. Discover it instead of hardcoding the normal `dev.azure.com` host:

```powershell
az rest `
  --resource 499b84ac-1321-427f-aa17-267ca6975798 `
  --method get `
  --url "https://dev.azure.com/<organization>/_apis/resourceAreas?api-version=7.1-preview.1" `
  --output json
```

Select the entry named `ComponentGovernance` and use its `locationUrl`. For the `devdiv` organization during the verified workflow, this was `https://devdiv.governance.visualstudio.com/`.

## Verified Routes

All routes below use `api-version=7.2-preview.1`:

```text
GET <locationUrl>/<project>/_apis/ComponentGovernance/GovernedRepositories/<governedRepositoryId>

GET <locationUrl>/<project>/_apis/ComponentGovernance/GovernedRepositories/<governedRepositoryId>/Branches/<branch>/Alerts

GET <locationUrl>/<project>/_apis/ComponentGovernance/GovernedRepositories/<governedRepositoryId>/Branches/<branch>/AlertSummary

GET <locationUrl>/<project>/_apis/ComponentGovernance/GovernedRepositories/<governedRepositoryId>/Alerts/Counts

GET <locationUrl>/<project>/_apis/ComponentGovernance/GovernedRepositories/<governedRepositoryId>/Alerts/<alertId>
```

These are preview/internal service routes discovered through Azure DevOps Location metadata. Rediscover the resource area and route definitions if the service changes; do not silently guess a replacement route.

## Response Shape

The branch Alerts response stores records under the top-level `value` property. It can contain hundreds of historical active and fixed records. The page's active report is the intersection of:

```text
record.alertState == active
AND exists record.stateDetails where
  state.alertState == active
  AND state.snapshotTypeId == URL.typeId
```

Useful fields include:

```text
id
type
severity
title
component.displayName
component.displayVersion
actionItems
discoveredDate
stateDetails
resources
sources
additionalProperties
```

## Troubleshooting

| Symptom | Meaning | Action |
|---|---|---|
| Browser redirects to sign-in | Browser session lacks DevDiv authentication | Use authenticated `az rest` instead. |
| `az devops invoke` chooses the wrong `Alerts` route | The area contains ambiguous resource names | Call the exact discovered URL with `az rest`. |
| API rejects version `7.2` | Component Governance route requires preview API | Use `7.2-preview.1`. |
| Query returns no alerts | The collection is `value`, not `alerts`, or the snapshot predicate is wrong | Parse JSON locally and inspect `stateDetails`. |
| Alert count changes during work | CG ingested a new finding | Re-fetch and compare IDs before completion. |
| Fixed source still appears active | CG has not completed its next scan | Report local lock evidence separately from server state. |

Do not use an unverified PATCH route for dismissals. Read the alert guidance and use the authenticated UI unless a current write route has been independently verified.