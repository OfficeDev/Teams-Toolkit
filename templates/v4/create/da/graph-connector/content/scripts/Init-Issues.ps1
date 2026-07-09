# Get the content of the file init.json and convert it to a PowerShell object

Push-Location -Path $PSScriptRoot
$InitializationData = Get-Content -Path issues.json | ConvertFrom-Json

$Users = $InitializationData.users
$Repos = $InitializationData.repos
$Issues = $InitializationData.issues

$Issues | ForEach-Object {
    $Assignees = @()
    $Repo = (Get-Random -InputObject $Repos -Count 1)

    # Create an issue for each item in the JSON file
    $AssigneesCount = Get-Random -Minimum 0 -Maximum ($Users.Length + 1)

    if($AssigneesCount) {
        $Assignees = (Get-Random -InputObject $Users -Count $AssigneesCount) | ForEach-Object { $Assignees += $_.username }
    }

    Start-Sleep -Seconds 5 #Avoiding "GraphQL: was submitted too quickly (createIssue)"
    gh issue create --repo $Repo.name --title $_.Title --body $_.Description --assignee ($Assignees -Join ',')
}

Pop-Location