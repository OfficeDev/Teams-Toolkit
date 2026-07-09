# yaml-language-server: $schema=https://aka.ms/m365-agents-toolkits/v1.11/yaml.schema.json
# Visit https://aka.ms/teamsfx-v5.0-guide for details on this file
# Visit https://aka.ms/teamsfx-actions for details on actions
version: v1.11

deploy:
  # Install development tool(s)
  - uses: devTool/install
    with:
      testTool:
        version: ~0.2.1
        symlinkDir: ./devTools/playground
      nodejs:
        symlinkDir: ./devTools/nodejs

  # Generate runtime environment variables
  - uses: file/createOrUpdateEnvironmentFile
    with:
      target: ./.env
      envs:
        PORT: 3978

        CLIENT_ID: ""
        CLIENT_SECRET: ""
