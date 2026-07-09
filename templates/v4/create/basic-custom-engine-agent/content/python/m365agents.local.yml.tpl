# yaml-language-server: $schema=https://aka.ms/m365-agents-toolkits/v1.11/yaml.schema.json
# Visit https://aka.ms/teamsfx-v5.0-guide for details on this file
# Visit https://aka.ms/teamsfx-actions for details on actions
version: v1.11

provision:
  # Creates an app
  - uses: teamsApp/create
    with:
      # app name
      name: {{appName}}${{APP_NAME_SUFFIX}}
    # Write the information of created resources into environment file for
    # the specified environment variable(s).
    writeToEnvironmentFile: 
      teamsAppId: TEAMS_APP_ID

  # Create or reuse an existing Microsoft Entra application for bot.
  - uses: aadApp/create
    with:
      # The Microsoft Entra application's display name
      name: {{appName}}${{APP_NAME_SUFFIX}}
      generateClientSecret: true
      generateServicePrincipal: true
      signInAudience: AzureADMultipleOrgs
    writeToEnvironmentFile:
      # The Microsoft Entra application's client id created for bot.
      clientId: BOT_ID
      # The Microsoft Entra application's client secret created for bot.
      clientSecret: SECRET_BOT_PASSWORD
      # The Microsoft Entra application's object id created for bot.
      objectId: BOT_OBJECT_ID

  # Create or update the bot registration on dev.botframework.com
  - uses: botFramework/create
    with:
      botId: ${{BOT_ID}}
      name: {{appName}}
      messagingEndpoint: ${{BOT_ENDPOINT}}/api/messages
      description: ""
      channels:
        - name: msteams

  {{^CEAEnabled}}
  {{/CEAEnabled}}

  # Build app package with latest env value
  - uses: teamsApp/zipAppPackage
    with:
      # Path to manifest template
      manifestPath: ./appPackage/manifest.json
      outputZipPath: ./appPackage/build/appPackage.${{TEAMSFX_ENV}}.zip
      outputFolder: ./appPackage/build

  # Validate app package using validation rules
  - uses: teamsApp/validateAppPackage
    with:
      # Relative path to this file. This is the path for built zip file.
      appPackagePath: ./appPackage/build/appPackage.${{TEAMSFX_ENV}}.zip

  # Apply the app manifest to an existing app in
  # Developer Portal.
  # Will use the app id in manifest file to determine which app to update.
  - uses: teamsApp/update
    with:
      # Relative path to this file. This is the path for built zip file.
      appPackagePath: ./appPackage/build/appPackage.${{TEAMSFX_ENV}}.zip

  {{#CEAEnabled}}
  - uses: teamsApp/extendToM365
    with:
      # Relative path to the build app package.
      appPackagePath: ./appPackage/build/appPackage.${{TEAMSFX_ENV}}.zip
    # Write the information of created resources into environment file for
    # the specified environment variable(s).
    writeToEnvironmentFile:
      titleId: M365_TITLE_ID
      appId: M365_APP_ID
  {{/CEAEnabled}}

deploy:
  # Generate runtime environment variables
  - uses: file/createOrUpdateEnvironmentFile
    with:
      target: ./.env
      envs:
        BOT_ID: ${{BOT_ID}}
        BOT_PASSWORD: ${{SECRET_BOT_PASSWORD}}
        CONNECTIONS__SERVICE_CONNECTION__SETTINGS__CLIENTID: ${{BOT_ID}}
        CONNECTIONS__SERVICE_CONNECTION__SETTINGS__CLIENTSECRET: ${{SECRET_BOT_PASSWORD}}
        CONNECTIONS__SERVICE_CONNECTION__SETTINGS__TENANTID: ${{TEAMS_APP_TENANT_ID}}
        {{#useOpenAI}}
        OPENAI_API_KEY: ${{SECRET_OPENAI_API_KEY}}
        {{/useOpenAI}}
        {{#useAzureOpenAI}}
        AZURE_OPENAI_API_KEY: ${{SECRET_AZURE_OPENAI_API_KEY}}
        AZURE_OPENAI_DEPLOYMENT_NAME: ${{AZURE_OPENAI_DEPLOYMENT_NAME}}
        AZURE_OPENAI_ENDPOINT: ${{AZURE_OPENAI_ENDPOINT}}
        {{/useAzureOpenAI}}
