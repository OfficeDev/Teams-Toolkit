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

  # Set TAB_DOMAIN and TAB_ENDPOINT for local launch
  - uses: script
    with:
      run:
        echo "::set-teamsfx-env TAB_DOMAIN=localhost";
        echo "::set-teamsfx-env TAB_ENDPOINT=https://localhost:3978";

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

  # Apply the app manifest to an existing app in Developer Portal.
  # Will use the app id in manifest file to determine which app to update.
  - uses: teamsApp/update
    with:
      # Relative path to this file. This is the path for built zip file.
      appPackagePath: ./appPackage/build/appPackage.${{TEAMSFX_ENV}}.zip
  

deploy:
  # Install development tool(s)
  - uses: devTool/install
    with:
      devCert:
        trust: true
    # Write the information of installed development tool(s) into environment
    # file for the specified environment variable(s).
    writeToEnvironmentFile:
      sslCertFile: SSL_CRT_FILE
      sslKeyFile: SSL_KEY_FILE

  # Run npm command
  - uses: cli/runNpmCommand
    name: install dependencies
    with:
      args: install

  # Generate runtime environment variables
  - uses: file/createOrUpdateEnvironmentFile
    with:
      target: ./.localConfigs
      envs:
        PORT: 3978
        SSL_CRT_FILE: ${{SSL_CRT_FILE}}
        SSL_KEY_FILE: ${{SSL_KEY_FILE}}
