{
    "name": "{{SafeProjectNameLowerCase}}",
    "version": "1.0.0",
    "description": "Microsoft 365 Agents Toolkit echo bot sample",
    "author": "Microsoft",
    "license": "MIT",
    "main": "dist/index",
    "types": "dist/index",
    "files": [
        "dist",
        "README.md"
    ],
    "scripts": {
        "dev:teamsfx": "env-cmd --silent -f .localConfigs npm run dev",
        "dev:teamsfx:playground": "env-cmd --silent -f .localConfigs.playground npm run dev",
        "dev:teamsfx:launch-playground": "env-cmd --silent -f env/.env.playground agentsplayground start",
        "dev": "npx nodemon -w \"./src/**\" -e ts --exec \"node --inspect=9239 -r ts-node/register ./src/index.ts\"",
        "clean": "npx rimraf ./dist",
        "build": "npx tsup",
        "start": "node .",
        "generate-mock": "npx ts-node src/mock/processMessageContent.ts"
    },
    "repository": {
        "type": "git",
        "url": "https://github.com"
    },
    "dependencies": {
        "@azure/identity": "^4.12.0",
        "@microsoft/teams.ai": "2.0.12",
        "@microsoft/teams.api": "2.0.12",
        "@microsoft/teams.apps": "2.0.12",
        "@microsoft/teams.cards": "2.0.12",
        "@microsoft/teams.common": "2.0.12",
        "@microsoft/teams.dev": "2.0.12",
        "@microsoft/teams.graph": "2.0.12",
        "@microsoft/teams.openai": "2.0.12",
        "@types/better-sqlite3": "^7.6.12",
        "better-sqlite3": "^11.9.0",
        "mssql": "^11.0.1",
        "node-html-markdown": "^1.3.0",
        "winston": "^3.17.0",
        "chrono-node": "^2.7.0"
    },
    "devDependencies": {
        "@types/mssql": "^9.1.8",
        "@types/node": "^22.5.4",
        "@types/ws": "^8.18.1",
        "dotenv": "^16.4.5",
        "env-cmd": "latest",
        "nodemon": "^3.1.4",
        "rimraf": "^6.0.1",
        "ts-morph": "^26.0.0",
        "ts-node": "^10.9.2",
        "tsup": "^8.4.0",
        "typescript": "^5.8.3"
    }
}
