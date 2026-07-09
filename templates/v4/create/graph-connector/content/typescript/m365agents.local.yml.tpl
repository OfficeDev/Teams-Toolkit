# yaml-language-server: $schema=https://aka.ms/m365-agents-toolkits/v1.11/yaml.schema.json
# Visit https://aka.ms/teamsfx-v5.0-guide for details on this file
# Visit https://aka.ms/teamsfx-actions for details on actions
version: v1.11

environmentFolderPath: ./env

# Triggered when 'teamsapp provision' is executed
provision:
  - uses: aadApp/create
    with:
      name: {{appName}}-${{TEAMSFX_ENV}}
      generateClientSecret: true
      signInAudience: AzureADMultipleOrgs
    writeToEnvironmentFile:
      clientId: AAD_APP_CLIENT_ID
      clientSecret: SECRET_AAD_APP_CLIENT_SECRET
      objectId: AAD_APP_OBJECT_ID
      tenantId: AAD_APP_TENANT_ID
      authority: AAD_APP_OAUTH_AUTHORITY
      authorityHost: AAD_APP_OAUTH_AUTHORITY_HOST

  - uses: aadApp/update
    with:
      manifestPath: ./aad.manifest.json
      outputFilePath: ./appPackage/build/aad.manifest.${{TEAMSFX_ENV}}.json

  - uses: file/createOrUpdateJsonFile
    with:
      target: ./local.settings.json
      appsettings:
        IsEncrypted: false
        Values:
          FUNCTIONS_WORKER_RUNTIME: node
          AzureWebJobsStorage: UseDevelopmentStorage=true
          AzureWebJobsFeatureFlags: EnableWorkerIndexing
          TEAMSFX_ENV: ${{TEAMSFX_ENV}}
          AZURE_TOKEN_CREDENTIALS: ${{AZURE_TOKEN_CREDENTIALS}}
          AZURE_CLIENT_ID: ${{AAD_APP_CLIENT_ID}}
          AZURE_CLIENT_SECRET: ${{SECRET_AAD_APP_CLIENT_SECRET}}
          AZURE_TENANT_ID: ${{AAD_APP_TENANT_ID}}
          CONNECTOR_ID: ${{CONNECTOR_ID}}
          CONNECTOR_NAME: ${{CONNECTOR_NAME}}
          CONNECTOR_DESCRIPTION: ${{CONNECTOR_DESCRIPTION}}
          CONNECTOR_REPOS: ${{CONNECTOR_REPOS}}
          # Uncomment this line to use GitHub Personal Access Token for authentication
          # CONNECTOR_ACCESS_TOKEN: ${{SECRET_CONNECTOR_ACCESS_TOKEN}}

{{#DeclarativeCopilot}}

# Triggered when 'teamsapp deploy' is executed
deploy:
  # Creates a Teams app
  - uses: teamsApp/create
    with:
      # Teams app name
      name: {{appName}}${{APP_NAME_SUFFIX}}
    # Write the information of created resources into environment file for
    # the specified environment variable(s).
    writeToEnvironmentFile:
      teamsAppId: TEAMS_APP_ID

  # Build Teams app package with latest env value
  - uses: teamsApp/zipAppPackage
    with:
      # Path to manifest template
      manifestPath: ./appPackage/manifest.json
      outputZipPath: ./appPackage/build/appPackage.${{TEAMSFX_ENV}}.zip
      outputFolder: ./appPackage/build
  # Apply the Teams app manifest to an existing Teams app in
  # Teams Developer Portal.
  # Will use the app id in manifest file to determine which Teams app to update.
  - uses: teamsApp/update
    with:
      # Relative path to this file. This is the path for built zip file.
      appPackagePath: ./appPackage/build/appPackage.${{TEAMSFX_ENV}}.zip
  # Extend your Teams app to Outlook and the Microsoft 365 app
  - uses: teamsApp/extendToM365
    with:
      # Relative path to the build app package.
      appPackagePath: ./appPackage/build/appPackage.${{TEAMSFX_ENV}}.zip
    # Write the information of created resources into environment file for
    # the specified environment variable(s).
    writeToEnvironmentFile:
      titleId: M365_TITLE_ID
      appId: M365_APP_ID
{{/DeclarativeCopilot}}
