# yaml-language-server: $schema=https://aka.ms/m365-agents-toolkits/v1.12/yaml.schema.json
# Visit https://aka.ms/teamsfx-v5.0-guide for details on this file
# Visit https://aka.ms/teamsfx-actions for details on actions
version: v1.12

environmentFolderPath: ./env

# Triggered when 'teamsapp provision' is executed
provision:
  # Creates a new Microsoft Entra app to authenticate users if
  # the environment variable that stores clientId is empty
  - uses: aadApp/create
    with:
      # Note: when you run aadApp/update, the Microsoft Entra app name will be updated
      # based on the definition in manifest. If you don't want to change the
      # name, make sure the name in Microsoft Entra manifest is the same with the name
      # defined here.
      name: {{appName}}-aad
      # If the value is false, the action will not generate client secret for you
{{#MicrosoftEntra}}
      generateClientSecret: false
{{/MicrosoftEntra}}
{{^MicrosoftEntra}}
      generateClientSecret: true
{{/MicrosoftEntra}}
      # Authenticate users with a Microsoft work or school account in your
      # organization's Microsoft Entra tenant (for example, single tenant).
      signInAudience: AzureADMyOrg
    # Write the information of created resources into environment file for the
    # specified environment variable(s).
    writeToEnvironmentFile:
      clientId: AAD_APP_CLIENT_ID
      # Environment variable that starts with `SECRET_` will be stored to the
      # .env.{envName}.user environment file
{{^MicrosoftEntra}}
      clientSecret: SECRET_AAD_APP_CLIENT_SECRET
{{/MicrosoftEntra}}
      objectId: AAD_APP_OBJECT_ID
      tenantId: AAD_APP_TENANT_ID
      authority: AAD_APP_OAUTH_AUTHORITY
      authorityHost: AAD_APP_OAUTH_AUTHORITY_HOST

  # Creates an app
  - uses: teamsApp/create
    with:
      # app name
      name: {{appName}}${{APP_NAME_SUFFIX}}
    # Write the information of created resources into environment file for
    # the specified environment variable(s).
    writeToEnvironmentFile:
      teamsAppId: TEAMS_APP_ID

  - uses: arm/deploy # Deploy given ARM templates parallelly.
    with:
      # AZURE_SUBSCRIPTION_ID is a built-in environment variable,
      # if its value is empty, TeamsFx will prompt you to select a subscription.
      # Referencing other environment variables with empty values
      # will skip the subscription selection prompt.
      subscriptionId: ${{AZURE_SUBSCRIPTION_ID}}
      # AZURE_RESOURCE_GROUP_NAME is a built-in environment variable,
      # if its value is empty, TeamsFx will prompt you to select or create one
      # resource group.
      # Referencing other environment variables with empty values
      # will skip the resource group selection prompt.
      resourceGroupName: ${{AZURE_RESOURCE_GROUP_NAME}}
      templates:
        - path: ./infra/azure.bicep # Relative path to this file
          # Relative path to this yaml file.
          # Placeholders will be replaced with corresponding environment
          # variable before ARM deployment.
          parameters: ./infra/azure.parameters.json
          # Required when deploying ARM template
          deploymentName: Create-resources-for-api-plugin
      # Microsoft 365 Agents Toolkit will download this bicep CLI version from github for you,
      # will use bicep CLI in PATH if you remove this config.
      bicepCliVersion: v0.9.1

  - uses: oauth/register
    with:
{{#MicrosoftEntra}}
      name: aadAuthCode
      flow: authorizationCode
      appId: ${{TEAMS_APP_ID}}
      clientId: ${{AAD_APP_CLIENT_ID}}
      # Path to OpenAPI description document
      apiSpecPath: ./appPackage/apiSpecificationFile/repair.yml
      # Use below property to change token exchange behaviour, BasicAuthorizationHeader: token exchange is done via HTTP headers. PostRequestBody: token exchange is done via request body
      # tokenExchangeMethodType: BasicAuthorizationHeader
      identityProvider: MicrosoftEntra
    writeToEnvironmentFile:
      configurationId: AADAUTHCODE_CONFIGURATION_ID
      applicationIdUri: AADAUTHCODE_APPLICATION_ID_URI
{{/MicrosoftEntra}}
{{^MicrosoftEntra}}
      name: oAuth2AuthCode
      flow: authorizationCode
      appId: ${{TEAMS_APP_ID}}
      clientId: ${{AAD_APP_CLIENT_ID}}
      clientSecret: ${{SECRET_AAD_APP_CLIENT_SECRET}}
      # Path to OpenAPI description document
      apiSpecPath: ./appPackage/apiSpecificationFile/repair.yml
      # Use below property to change token exchange behaviour, BasicAuthorizationHeader: token exchange is done via HTTP headers. PostRequestBody: token exchange is done via request body
      # tokenExchangeMethodType: BasicAuthorizationHeader
    writeToEnvironmentFile:
      configurationId: OAUTH2AUTHCODE_CONFIGURATION_ID
{{/MicrosoftEntra}}

  # Apply the Microsoft Entra manifest to an existing Microsoft Entra app. Will use the object id in
  # manifest file to determine which Microsoft Entra app to update.
  - uses: aadApp/update
    with:
      # Relative path to this file. Environment variables in manifest will
      # be replaced before apply to Microsoft Entra app
      manifestPath: ./aad.manifest.json
      outputFilePath: ./build/aad.manifest.${{TEAMSFX_ENV}}.json

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

  # Extend your app to Outlook and the Microsoft 365 app
  - uses: copilotAgent/publish
    with:
      # Relative path to the build app package.
      appPackagePath: ./appPackage/build/appPackage.${{TEAMSFX_ENV}}.zip
      scope: ${{AGENT_SCOPE}}
    # Write the information of created resources into environment file for
    # the specified environment variable(s).
    writeToEnvironmentFile:
      titleId: M365_TITLE_ID
      appId: M365_APP_ID
      shareLink: SHARE_LINK

# Triggered when 'teamsapp deploy' is executed
deploy:
  # Run npm command
  - uses: cli/runNpmCommand
    name: install dependencies
    with:
      args: install

  # Deploy your application to Azure Functions using the zip deploy feature.
  # For additional details, see at https://aka.ms/zip-deploy-to-azure-functions
  - uses: azureFunctions/zipDeploy
    with:
      # deploy base folder
      artifactFolder: .
      # Ignore file location, leave blank will ignore nothing
      ignoreFile: .funcignore
      # The resource id of the cloud resource to be deployed to.
      # This key will be generated by arm/deploy action automatically.
      # You can replace it with your existing Azure Resource id
      # or add it to your environment variable file.
      resourceId: ${{API_FUNCTION_RESOURCE_ID}}

# Triggered when 'teamsapp publish' is executed
publish:
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
  # Publish the agent to tenant app catalog
  - uses: copilotAgent/publish
    with:
      appPackagePath: ./appPackage/build/appPackage.${{TEAMSFX_ENV}}.zip
      scope: tenant
    # Write the information of created resources into environment file for
    # the specified environment variable(s).
    writeToEnvironmentFile:
      titleId: M365_PUBLISHED_TITLE_ID
      appId: M365_PUBLISHED_APP_ID
