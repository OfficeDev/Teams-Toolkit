# yaml-language-server: $schema=https://aka.ms/m365-agents-toolkits/v1.12/yaml.schema.json
# Visit https://aka.ms/teamsfx-v5.0-guide for details on this file
# Visit https://aka.ms/teamsfx-actions for details on actions
version: v1.12

environmentFolderPath: ./env

# Triggered when 'teamsapp provision' is executed
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

  # Install all dependencies (including TypeSpec for Microsoft 365 Copilot)
  - uses: cli/runNpmCommand
    name: install dependencies
    with:
      args: install --progress=false

  # Generates a TypeSpec version of the environment variables
  - uses: cli/runNpmCommand
    name: Generate TypeSpec environment variables
    with:
      args: run generate:env -- ${{TEAMSFX_ENV}}

  # Compile typespec files and generate necessary files for agent.
  # If you want to update the outputDir, please make sure the following paths are also updated.
  # 1. File paths in tspconfig.yaml.
  # 2. manifestPath in this action. Please make sure there is manifest.json under root folder of your outputDir and set the value to the path of this manifest.json.
  # 3. manifestPath in teamsApp/zipAppPackage action. Please set the value to the same as manifestPath in this action.
  - uses: typeSpec/compile
    with:
      path: ./src/agent/main.tsp
      manifestPath: ./appPackage/manifest.json
      outputDir: ./appPackage/.generated
      typeSpecConfigPath: ./tspconfig.yaml

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

# Triggered when 'teamsapp publish' is executed
publish:
  - uses: cli/runNpmCommand
    name: install dependencies
    with:
      args: install --progress=false

  # Compile typespec files and generate necessary files for agent.
  # If you want to update the outputDir, please make sure the following paths are also updated.
  # 1. File paths in tspconfig.yaml.
  # 2. manifestPath in this action. Please make sure there is manifest.json under root folder of your outputDir and set the value to the path of this manifest.json.
  # 3. manifestPath in teamsApp/zipAppPackage action. Please set the value to the same as manifestPath in this action.
  - uses: typeSpec/compile
    with:
      path: ./src/agent/main.tsp
      manifestPath: ./appPackage/manifest.json
      outputDir: ./appPackage/.generated
      typeSpecConfigPath: ./tspconfig.yaml

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
