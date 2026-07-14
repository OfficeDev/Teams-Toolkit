[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ReportPath,

  [ValidatePattern("^[a-z0-9]{3,24}$")]
  [string]$StorageAccount = "storproxystvoazuxhhvtgiq",

  [string]$ProxyBaseUrl = "https://storproxy-app-voazuxhhvtgiq.azurewebsites.net"
)

$ErrorActionPreference = "Stop"

$report = Get-Item -LiteralPath $ReportPath
if ($report.PSIsContainer -or $report.Extension -ne ".html") {
  throw "ReportPath must point to a vscuse HTML report: $ReportPath"
}

$reportId = [guid]::NewGuid().ToString()
$stagingDirectory = Join-Path ([IO.Path]::GetTempPath()) "vscuse-report-$reportId"
$indexPath = Join-Path $stagingDirectory "index.html"

try {
  New-Item -ItemType Directory -Path $stagingDirectory | Out-Null
  Copy-Item -LiteralPath $report.FullName -Destination $indexPath

  $az = Get-Command az -ErrorAction SilentlyContinue
  if ($az) {
    & $az.Source account show --output none 2>$null
    if ($LASTEXITCODE -ne 0) {
      throw "Azure CLI is not signed in. Run 'az login' with an identity that can upload to '$StorageAccount'."
    }

    & $az.Source storage blob upload `
      --account-name $StorageAccount `
      --auth-mode login `
      --container-name "content" `
      --name "$reportId/index.html" `
      --file $indexPath `
      --content-type "text/html" `
      --overwrite `
      --output none

    if ($LASTEXITCODE -ne 0) {
      throw "Failed to upload '$($report.FullName)' to storage account '$StorageAccount'."
    }
  }
  else {
    $azAccounts = Get-Module -ListAvailable Az.Accounts | Select-Object -First 1
    if (-not $azAccounts) {
      throw "Azure CLI or the Az.Accounts PowerShell module is required to publish vscuse reports."
    }

    Import-Module Az.Accounts -ErrorAction Stop
    $context = Get-AzContext -ErrorAction SilentlyContinue
    if (-not $context) {
      throw "Azure PowerShell is not signed in. Run 'Connect-AzAccount' with an identity that can upload to '$StorageAccount'."
    }

    $tokenResult = Get-AzAccessToken -ResourceUrl "https://storage.azure.com/" -ErrorAction Stop
    if ($tokenResult.Token -is [Security.SecureString]) {
      $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($tokenResult.Token)
      try {
        $accessToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
      }
      finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
      }
    }
    elseif ($tokenResult.Token -is [string]) {
      $accessToken = $tokenResult.Token
    }
    else {
      throw "Az.Accounts returned an unsupported access token type."
    }

    $blobUrl = "https://$StorageAccount.blob.core.windows.net/content/$reportId/index.html"
    $headers = @{
      Authorization = "Bearer $accessToken"
      "x-ms-blob-type" = "BlockBlob"
      "x-ms-date" = [DateTime]::UtcNow.ToString("R")
      "x-ms-version" = "2023-11-03"
    }

    try {
      Invoke-WebRequest `
        -Uri $blobUrl `
        -Method Put `
        -Headers $headers `
        -InFile $indexPath `
        -ContentType "text/html" `
        -UseBasicParsing | Out-Null
    }
    catch {
      $statusCode = $_.Exception.Response.StatusCode
      if ($statusCode -ne [Net.HttpStatusCode]::Forbidden) {
        throw
      }
      throw "The signed-in identity cannot upload blobs to '$StorageAccount'. Grant it Storage Blob Data Contributor at the storage account scope."
    }
    finally {
      $accessToken = $null
      $headers = $null
      $tokenResult = $null
    }
  }

  Write-Output "$($ProxyBaseUrl.TrimEnd('/'))/$reportId/index.html"
}
finally {
  Remove-Item -LiteralPath $stagingDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
