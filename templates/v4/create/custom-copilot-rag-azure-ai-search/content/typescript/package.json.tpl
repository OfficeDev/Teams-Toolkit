{
    "name": "{{SafeProjectNameLowerCase}}",
    "version": "1.0.0",
    "msteams": {
        "teamsAppId": null
    },
    "description": "Microsoft 365 Agents Toolkit RAG Bot Sample with Azure AI Search and Microsoft Teams SDK",
    "engines": {
        "node": "22"
    },
    "author": "Microsoft",
    "license": "MIT",
    "main": "./lib/src/index.js",
    "scripts": {
        "dev:teamsfx": "env-cmd --silent -f .localConfigs npm run dev",
        "dev:teamsfx:playground": "env-cmd --silent -f .localConfigs.playground npm run dev",
        "dev:teamsfx:launch-playground": "env-cmd --silent -f env/.env.playground agentsplayground start",
        "dev": "nodemon --exec node --inspect=9239 --signal SIGINT -r ts-node/register ./src/index.ts",
        "build": "tsc --build && shx cp -r ./src/app/instructions.txt ./lib/src/app",
        "start": "node ./lib/src/index.js",
        "test": "echo \"Error: no test specified\" && exit 1",
        "watch": "nodemon --exec \"npm run start\"",
        "indexer:create": "npm run build && shx cp -r ./src/indexers/data ./lib/src/indexers && env-cmd --silent -f env/.env.playground.user node ./lib/src/indexers/setup.js",
        "indexer:delete": "npm run build && env-cmd --silent -f env/.env.playground.user node ./lib/src/indexers/delete.js"
    },
    "repository": {
        "type": "git",
        "url": "https://github.com"
    },
    "dependencies": {
        "@azure/identity": "^4.11.1",
        "@azure/search-documents": "^12.0.0",
        "@microsoft/teams.apps": "^2.0.0",
        "@microsoft/teams.ai": "^2.0.0",
        "@microsoft/teams.openai": "^2.0.0",
        "@microsoft/teams.common": "^2.0.0"
    },
    "devDependencies": {
        "@types/node": "^22.0.0",
        "env-cmd": "^10.1.0",
        "ts-node": "^10.4.0",
        "typescript": "~5.8.3",
        "nodemon": "^3.1.7",
        "shx": "^0.4.0"
    }
}