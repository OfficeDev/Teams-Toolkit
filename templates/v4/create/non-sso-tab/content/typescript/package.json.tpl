{
    "name": "{{SafeProjectNameLowerCase}}",
    "version": "0.1.0",
    "private": true,
    "main": "dist/index",
    "types": "dist/index",
    "files": [
        "dist",
        "README.md"
    ],
    "dependencies": {
        "@microsoft/teams-js": "^2.0.0",
        "@microsoft/teams.api": "^2.0.0",
        "@microsoft/teams.apps": "^2.0.0",
        "@microsoft/teams.cards": "^2.0.0",
        "@microsoft/teams.client": "^2.0.0",
        "@microsoft/teams.common": "^2.0.0",
        "@microsoft/teams.dev": "^2.0.0",
        "@microsoft/teams.graph": "^2.0.0",
        "@microsoft/teams.graph-endpoints": "^2.0.0",
        "react": "^19.0.0",
        "react-dom": "^19.0.0"
    },
    "devDependencies": {
        "@types/node": "^22.5.4",
        "@types/react": "^19.1.12",
        "@types/react-dom": "^19.1.9",
        "@vitejs/plugin-react": "^4.3.4",
        "dotenv": "^16.4.5",
        "env-cmd": "^11.0.0",
        "nodemon": "^3.1.4",
        "rimraf": "^6.0.1",
        "tsup": "^8.4.0",
        "typescript": "^5.4.5",
        "vite": "^6.2.0"
    },
    "scripts": {
        "dev:teamsfx": "env-cmd --silent -f .localConfigs npm run dev",
        "clean": "rimraf ./dist",
        "dev": "npm run build:frontend && nodemon",
        "build": "tsup && npm run build:frontend",
        "build:frontend": "vite build --outDir dist/client"
    }
}
