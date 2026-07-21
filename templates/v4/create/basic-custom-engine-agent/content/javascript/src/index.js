require("./proxy");
const { startServer } = require("@microsoft/agents-hosting-express");
const { agentApp } = require("./agent");
startServer(agentApp);
