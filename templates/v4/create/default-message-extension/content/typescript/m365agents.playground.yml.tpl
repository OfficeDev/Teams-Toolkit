# yaml-language-server: $schema=https://aka.ms/m365-agents-toolkits/v1.11/yaml.schema.json
# Visit https://aka.ms/teamsfx-v5.0-guide for details on this file
# Visit https://aka.ms/teamsfx-actions for details on actions
version: v1.11

environmentFolderPath: ./env

deploy:
  # Install development tool(s)
  - uses: devTool/install
    with:
      testTool:
        version: ~0.2.7
        symlinkDir: ./devTools/playground

  # Run npm command
  - uses: cli/runNpmCommand
    with:
      args: install

  - uses: file/createOrUpdateEnvironmentFile
    with:
      target: ./.localConfigs.playground
      envs:
        PORT: 3978
