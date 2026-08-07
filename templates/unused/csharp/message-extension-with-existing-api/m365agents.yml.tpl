# yaml-language-server: $schema=https://aka.ms/m365-agents-toolkits/v1.9/yaml.schema.json
# Visit https://aka.ms/teamsfx-v5.0-guide for details on this file
# Visit https://aka.ms/teamsfx-actions for details on actions
version: v1.11

environmentFolderPath: ./env

# Triggered when 'teamsapp provision' is executed
provision:
  # Creates a Teams app
  - uses: teamsApp/create
    with:
      # Teams app name
      name: {{appName}}${{APP_NAME_SUFFIX}}
    # Write the information of created resources into environment file for
    # the specified environment variable(s).
    writeToEnvironmentFile:
      teamsAppId: TEAMS_APP_ID

{{#ApiKey}}
  # Register API KEY
  - uses: apiKey/register
    with:
      # Name of the API Key
      name: {{ApiSpecAuthName}}
      # Teams app ID
      appId: ${{TEAMS_APP_ID}}
      # Path to OpenAPI description document
      apiSpecPath: {{{ApiSpecPath}}}
    # Write the registration information of API Key into environment file for
    # the specified environment variable(s).
    writeToEnvironmentFile:
      registrationId: {{ApiSpecAuthRegistrationIdEnvName}}
{{/ApiKey}}
{{#OAuth}}
  - uses: oauth/register
    with:
      name: {{ApiSpecAuthName}}
      flow: authorizationCode
      # Teams app ID
      appId: ${{TEAMS_APP_ID}}
      # Path to OpenAPI description document
      apiSpecPath: {{{ApiSpecPath}}}
      # Use below property to change token exchange behaviour, BasicAuthorizationHeader: token exchange is done via HTTP headers. PostRequestBody: token exchange is done via request body
      # tokenExchangeMethodType: BasicAuthorizationHeader
      # Uncomment below property to use proof key for code exchange (PKCE)
      # isPKCEEnabled: true
    writeToEnvironmentFile:
      configurationId: {{ApiSpecAuthRegistrationIdEnvName}}
{{/OAuth}}

  # Validate using manifest schema
  - uses: teamsApp/validateManifest
    with:
      # Path to manifest template
      manifestPath: ./appPackage/manifest.json

  # Build Teams app package with latest env value
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

  # Apply the Teams app manifest to an existing Teams app in
  # Developer Portal.
  # Will use the app id in manifest file to determine which Teams app to update.
  - uses: teamsApp/update
    with:
      # Relative path to this file. This is the path for built zip file.
      appPackagePath: ./appPackage/build/appPackage.${{TEAMSFX_ENV}}.zip

  # Extend your Teams app to Outlook and the Microsoft 365 app
  - uses: teamsApp/extendToM365
    with:
      scope: ${{AGENT_SCOPE}}
      # Relative path to the build app package.
      appPackagePath: ./appPackage/build/appPackage.${{TEAMSFX_ENV}}.zip
    # Write the information of created resources into environment file for
    # the specified environment variable(s).
    writeToEnvironmentFile:
      titleId: M365_TITLE_ID
      appId: M365_APP_ID
