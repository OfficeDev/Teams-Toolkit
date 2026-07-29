[CmdletBinding(DefaultParameterSetName = "Live")]
param(
  [Parameter(Mandatory, ParameterSetName = "Live")]
  [uri] $ReportUrl,

  [Parameter(Mandatory, ParameterSetName = "Fixture")]
  [string] $InputPath,

  [Parameter(Mandatory, ParameterSetName = "Fixture")]
  [long] $GovernedRepositoryId,

  [Parameter(ParameterSetName = "Live")]
  [Parameter(Mandatory, ParameterSetName = "Fixture")]
  [string] $Branch,

  [Parameter(Mandatory, ParameterSetName = "Fixture")]
  [long] $SnapshotTypeId,

  [string] $OutputPath
)

$ErrorActionPreference = "Stop"
$adoResource = "499b84ac-1321-427f-aa17-267ca6975798"

function Invoke-AdoRest {
  param([Parameter(Mandatory)][string] $Url)

  $json = & az rest `
    --resource $adoResource `
    --method get `
    --url $Url `
    --only-show-errors `
    --output json

  if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI failed to read Component Governance data from $Url"
  }

  return ($json -join [Environment]::NewLine) | ConvertFrom-Json
}

function Get-QueryParameters {
  param([Parameter(Mandatory)][uri] $Uri)

  $parameters = @{}
  foreach ($pair in ($Uri.Query.TrimStart("?") -split "&")) {
    if ([string]::IsNullOrWhiteSpace($pair)) {
      continue
    }

    $parts = $pair -split "=", 2
    $key = [uri]::UnescapeDataString($parts[0])
    $value = if ($parts.Count -eq 2) { [uri]::UnescapeDataString($parts[1]) } else { "" }
    $parameters[$key] = $value
  }

  return $parameters
}

function Get-SeverityCount {
  param(
    [Parameter(Mandatory)][hashtable] $Counts,
    [Parameter(Mandatory)][string] $Severity
  )

  if ($Counts.ContainsKey($Severity)) {
    return [int] $Counts[$Severity]
  }

  return 0
}

$organization = "fixture"
$project = "fixture"
$source = $InputPath

if ($PSCmdlet.ParameterSetName -eq "Live") {
  $segments = @($ReportUrl.AbsolutePath.Trim("/") -split "/")
  if ($ReportUrl.Host -ne "dev.azure.com" -or $segments.Count -lt 4 -or $segments[2] -ne "_componentGovernance") {
    throw "Expected a Component Governance URL in the form https://dev.azure.com/<org>/<project>/_componentGovernance/<id>?typeId=<id>."
  }

  $organization = [uri]::UnescapeDataString($segments[0])
  $project = [uri]::UnescapeDataString($segments[1])
  if (-not [long]::TryParse($segments[3], [ref] $GovernedRepositoryId)) {
    throw "The Component Governance URL does not contain a valid governed repository ID."
  }

  $query = Get-QueryParameters -Uri $ReportUrl
  if (-not $query.ContainsKey("typeId") -or -not [long]::TryParse($query["typeId"], [ref] $SnapshotTypeId)) {
    throw "The Component Governance URL does not contain a valid typeId."
  }

  $locationResponse = Invoke-AdoRest -Url "https://dev.azure.com/$organization/_apis/resourceAreas?api-version=7.1-preview.1"
  $resourceArea = $locationResponse.value | Where-Object { $_.name -eq "ComponentGovernance" } | Select-Object -First 1
  if ($null -eq $resourceArea -or [string]::IsNullOrWhiteSpace($resourceArea.locationUrl)) {
    throw "Azure DevOps did not return the ComponentGovernance resource area."
  }

  $serviceUrl = $resourceArea.locationUrl.TrimEnd("/")
  $projectSegment = [uri]::EscapeDataString($project)
  $repositoryUrl = "$serviceUrl/$projectSegment/_apis/ComponentGovernance/GovernedRepositories/$GovernedRepositoryId"

  if ([string]::IsNullOrWhiteSpace($Branch)) {
    $metadata = Invoke-AdoRest -Url "${repositoryUrl}?api-version=7.2-preview.1"
    $branchCandidates = @(
      @(
        $metadata.defaultBranchMoniker,
        $metadata.defaultBranch,
        $metadata.defaultBranchName,
        $metadata.repository.defaultBranch,
        $metadata.repository.defaultBranchName
      ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )

    if ($branchCandidates.Count -eq 0) {
      throw "The governed repository metadata did not identify a default branch. Pass -Branch explicitly."
    }

    $Branch = ([string] $branchCandidates[0]) -replace "^refs/heads/", ""
  }

  $branchSegment = [uri]::EscapeDataString($Branch)
  $response = Invoke-AdoRest -Url "${repositoryUrl}/Branches/$branchSegment/Alerts?api-version=7.2-preview.1"
  $source = $ReportUrl.ToString()
}
else {
  $response = Get-Content -Raw $InputPath | ConvertFrom-Json
}

if ($null -eq $response.value) {
  throw "The Component Governance response does not contain the expected value collection."
}

$activeAlerts = @(
  $response.value | Where-Object {
    $_.alertState -eq "active" -and
    @(
      $_.stateDetails | Where-Object {
        $_.alertState -eq "active" -and $_.snapshotTypeId -eq $SnapshotTypeId
      }
    ).Count -gt 0
  }
)

$severityCounts = @{}
$activeAlerts | Group-Object { ([string] $_.severity).ToLowerInvariant() } | ForEach-Object {
  $severityCounts[$_.Name] = $_.Count
}

$report = [ordered]@{
  source = $source
  retrievedDate = [DateTime]::UtcNow.ToString("yyyy-MM-dd")
  organization = $organization
  project = $project
  governedRepositoryId = $GovernedRepositoryId
  branch = $Branch
  snapshotTypeId = $SnapshotTypeId
  filters = [ordered]@{
    alertState = "active"
    stateDetailsAlertState = "active"
  }
  summary = [ordered]@{
    total = $activeAlerts.Count
    critical = Get-SeverityCount -Counts $severityCounts -Severity "critical"
    high = Get-SeverityCount -Counts $severityCounts -Severity "high"
    medium = Get-SeverityCount -Counts $severityCounts -Severity "medium"
    low = Get-SeverityCount -Counts $severityCounts -Severity "low"
    other = Get-SeverityCount -Counts $severityCounts -Severity "other"
  }
  alerts = @($activeAlerts | Sort-Object severity, { $_.component.displayName }, title)
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\..\.."))
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $repoRoot "results\component-governance-$GovernedRepositoryId-active-alerts-full.json"
}
elseif (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath = Join-Path $PWD $OutputPath
}

$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$repoPrefix = $repoRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if ($OutputPath.StartsWith($repoPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  $relativeOutputPath = [System.IO.Path]::GetRelativePath($repoRoot, $OutputPath)
  & git -C $repoRoot check-ignore --no-index --quiet -- $relativeOutputPath
  if ($LASTEXITCODE -ne 0) {
    throw "Refusing to write a Component Governance report to a non-ignored repository path: $relativeOutputPath"
  }
}

$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$json = $report | ConvertTo-Json -Depth 100
[System.IO.File]::WriteAllText($OutputPath, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))

[pscustomobject]@{
  OutputPath = $OutputPath
  AlertCount = $activeAlerts.Count
  Critical = $report.summary.critical
  High = $report.summary.high
  Medium = $report.summary.medium
  Low = $report.summary.low
  Other = $report.summary.other
}