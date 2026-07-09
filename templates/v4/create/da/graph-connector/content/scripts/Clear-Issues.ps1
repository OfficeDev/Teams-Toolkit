# Get the content of the file init.json and convert it to a PowerShell object

$InitializationData = Get-Content -Path issues.json | ConvertFrom-Json
$Repos = $InitializationData.repos

$Repos | ForEach-Object {
    $Repo = $_
    $Issues = gh issue list --repo $_.name --limit 100 --json number,body,title | ConvertFrom-Json
    $Issues | ForEach-Object {
        gh issue delete $_.number --repo $Repo.name --yes
    }
}