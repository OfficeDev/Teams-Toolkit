{
    "name": "{{SafeProjectNameLowerCase}}",
    "version": "1.0.0",
    "msteams": {
        "teamsAppId": null
    },
    "description": "Basic Custome Engine Agent with Microsoft 365 Agents SDK",
    "author": "Microsoft",
    "license": "MIT",
    "main": "./lib/src/index.js",
    "scripts": {
        "dev:teamsfx": "env-cmd --silent -f .localConfigs npm run dev",
        "dev:teamsfx:playground": "env-cmd --silent -f .localConfigs.playground npm run dev",
        "dev:teamsfx:launch-playground": "env-cmd --silent -f env/.env.playground agentsplayground start",
        "dev": "nodemon --exec node --inspect=9239 --signal SIGINT -r ts-node/register ./src/index.ts",
        "build": "tsc --build",
        "start": "node ./lib/src/index.js",
        "test": "echo \"Error: no test specified\" && exit 1",
        "watch": "nodemon --exec \"npm run start\""
    },
    "repository": {
        "type": "git",
        "url": "https://github.com"
    },
    "dependencies": {
        "@azure/identity": "^4.8.0",
        "@azure/openai": "^2.0.0",
        "@microsoft/agents-hosting-express": "^1.0.0",
        "openai": "^4.94.0"
    },
    "devDependencies": {
        "@types/express": "^5.0.0",
        "@types/node": "^22.0.0",
        "env-cmd": "^10.1.0",
        "nodemon": "^3.1.10",
        "shx": "^0.4.0",
        "ts-node": "^10.9.2",
        "typescript": "^5.8.3"
    }
}