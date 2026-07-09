{
  "name": "{{SafeProjectNameLowerCase}}",
  "version": "1.0.0",
  "description": "## Build a basic declarative copilot",
  "module": "esnext",
  "main": "dist/src/functions/*.js",
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "clean": "rimraf dist",
    "prestart": "npm run clean && npm run build",
    "start": "func start",
    "test": "echo \"No tests yet...\"",
    "storage": "azurite --silent --location ./_storage_emulator --debug ./_storage_emulator/debug.log",
    "prettier:check": "prettier --check \"./src/**/*.{ts,json}\"",
    "prettier:write": "prettier --write \"./src/**/*.{ts,json}\"",
    "notify:admin-consent": "node ./scripts/admin-consent.js"
  },
  "author": "",
  "license": "ISC",
  "dependencies": {
    "@azure/functions": "^4.5.0",
    "@azure/identity": "^4.13.0",
    "@microsoft/microsoft-graph-client": "^3.0.7",
    "dotenv": "^16.4.5",
    "gray-matter": "^4.0.3",
    "remove-markdown": "^0.5.2",
    "fs-extra": "^11.2.0"
  },
  "devDependencies": {
    "@microsoft/microsoft-graph-client": "^3.0.6",
    "@microsoft/microsoft-graph-types": "^2.40.0",
    "@types/node": "^22.0.0",
    "azure-functions-core-tools": "^4.10.0",
    "azurite": "^3.35.0",
    "minimist": "^1.2.8",
    "rimraf": "^5.0.0",
    "ts-node": "^10.9.2",
    "typescript": "5.2.2"
  }
}
