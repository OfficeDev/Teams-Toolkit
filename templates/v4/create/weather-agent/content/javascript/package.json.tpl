{
    "name": "{{SafeProjectNameLowerCase}}",
    "version": "1.0.0",
    "msteams": {
        "teamsAppId": null
    },
    "description": "Weather Agent with Microsoft 365 Agents SDK and LangChain",
    "author": "Microsoft",
    "license": "MIT",
    "main": "./src/index.js",
    "scripts": {
        "dev:teamsfx": "env-cmd --silent -f .localConfigs npm run dev",
        "dev:teamsfx:playground": "env-cmd --silent -f .localConfigs.playground npm run dev",
        "dev:teamsfx:launch-playground": "env-cmd --silent -f env/.env.playground agentsplayground start",
        "dev": "nodemon --inspect=9239 --signal SIGINT ./src/index.js",
        "start": "node ./src/index.js",
        "test": "echo \"Error: no test specified\" && exit 1",
        "watch": "nodemon --exec \"npm run start\""
    },
    "repository": {
        "type": "git",
        "url": "https://github.com"
    },
    "dependencies": {
        "@azure/openai": "^2.0.0",
        "@langchain/langgraph": "^0.2.66",
        "@langchain/openai": "^0.5.6",
        "@microsoft/agents-hosting-express": "^1.0.0"
    },
    "devDependencies": {
        "env-cmd": "^10.1.0",
        "nodemon": "^3.1.10",
        "shx": "^0.4.0"
    },
    "overrides": {
        "**": {
            "zod": "3.25.67"
        }
    }
}
