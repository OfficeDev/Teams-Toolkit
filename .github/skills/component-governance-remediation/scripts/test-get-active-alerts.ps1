$ErrorActionPreference = "Stop"

$fixturePath = Join-Path $PSScriptRoot "..\evals\fixtures\alerts-response.json"
$scriptPath = Join-Path $PSScriptRoot "get-active-alerts.ps1"
$outputPath = Join-Path ([System.IO.Path]::GetTempPath()) "component-governance-skill-test.json"

try {
  & $scriptPath `
    -InputPath $fixturePath `
    -GovernedRepositoryId 233426 `
    -Branch "dev" `
    -SnapshotTypeId 38309165 `
    -OutputPath $outputPath

  $report = Get-Content -Raw $outputPath | ConvertFrom-Json

  if ($report.summary.total -ne 1) {
    throw "Expected one active alert for the requested snapshot."
  }

  if ($report.summary.high -ne 1 -or $report.summary.medium -ne 0 -or $report.summary.low -ne 0) {
    throw "Unexpected severity summary."
  }

  if ($report.alerts[0].id -ne 101) {
    throw "The script included an alert outside the active snapshot state."
  }

  $nonIgnoredOutputPath = Join-Path $PSScriptRoot "component-governance-test-output.json"
  try {
    & $scriptPath `
      -InputPath $fixturePath `
      -GovernedRepositoryId 233426 `
      -Branch "dev" `
      -SnapshotTypeId 38309165 `
      -OutputPath $nonIgnoredOutputPath

    throw "Expected the script to reject a non-ignored repository output path."
  }
  catch {
    if ($_.Exception.Message -notlike "Refusing to write a Component Governance report to a non-ignored repository path:*") {
      throw
    }
  }
  finally {
    Remove-Item $nonIgnoredOutputPath -ErrorAction SilentlyContinue
  }

  Write-Output "PASS: active snapshot filtering"
  Write-Output "PASS: non-ignored repository output rejected"
}
finally {
  Remove-Item $outputPath -ErrorAction SilentlyContinue
}