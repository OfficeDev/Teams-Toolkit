{
    "name": "{{SafeProjectNameLowerCase}}",
    "version": "1.0.0",
    "msteams": {
        "teamsAppId": null
    },
    "description": "Microsoft 365 Agents Toolkit AI Chat Agent Sample with Microsoft Teams SDK",
    "engines": {
        "node": "22"
    },
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
        "@azure/identity": "^4.11.1",
        "@microsoft/teams.apps": "^2.0.0",
        "@microsoft/teams.ai": "^2.0.0",
        "@microsoft/teams.openai": "^2.0.0",
        "@microsoft/teams.common": "^2.0.0",
        "fs-extra": "^11.2.0",
        "js-yaml": "^4.1.0",
        "adaptivecards-templating": "^2.3.1",
        "adaptivecards": "^3.0.5",
        "openapi-client-axios": "^7.4.0"
    },
    "devDependencies": {
        "env-cmd": "^10.1.0",
        "nodemon": "^3.1.7"
    }
}