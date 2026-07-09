import { InvocationContext } from "@azure/functions";
import schema from "./references/schema.json";
import template from "./references/template.json";
import { Config } from "./models/Config";
import { ExternalConnectors } from "@microsoft/microsoft-graph-types";

// Developer-provided unique ID
// Must be between 3 and 32 characters in length
// Must only contain alphanumeric characters
// Cannot begin with Microsoft or some disallowed id values
// https://learn.microsoft.com/en-us/graph/api/resources/externalconnectors-externalconnection?view=graph-rest-1.0#properties
const disallowedConnectorIds = [
  "Microsoft",
  "None",
  "Directory",
  "Exchange",
  "ExchangeArchive",
  "LinkedIn",
  "Mailbox",
  "OneDriveBusiness",
  "SharePoint",
  "Teams",
  "Yammer",
  "Connectors",
  "TaskFabric",
  "PowerBI",
  "Assistant",
  "TopicEngine",
  "MSFT_All_Connectors",
];

// [Customization point]
// If you need additional logic to initialize configuration or validation, you can add them here
/**
 * Builds the configuration object based on environment variables.
 */
export function initConfig(context: InvocationContext): Config {
  const config = {
    context: context,
    clientId: process.env.AZURE_CLIENT_ID,
    connector: {
      id: `${process.env.CONNECTOR_ID}`,
      name: process.env.CONNECTOR_NAME,
      accessToken: process.env.CONNECTOR_ACCESS_TOKEN,
      description: process.env.CONNECTOR_DESCRIPTION,
      schema: schema as ExternalConnectors.Schema,
      template: template,
      repos: process.env.CONNECTOR_REPOS,
    },
  };
  validateConfig(config);
  context.log("Configuration object initialized");

  return config;
}

// [Customization point]
// If you need additional validation logic, you can add it here
/**
 * Validates the configuration object.
 * @param {Config} config - The configuration object to validate.
 */
export function validateConfig(config: Config): void {
  if (!config.clientId) {
    throw new Error("Invalid configuration: Missing clientId");
  }
  if (!config.connector.id) {
    throw new Error("Invalid configuration: Missing connector id");
  }
  if (!config.connector.name) {
    throw new Error("Invalid configuration: Missing connector name");
  }
  if (!config.connector.description) {
    throw new Error("Invalid configuration: Missing connector description");
  }
  if (!config.connector.schema) {
    throw new Error("Invalid configuration: Missing connector schema");
  }
  if (!config.connector.template) {
    throw new Error("Invalid configuration: Missing connector template");
  }
  if (!config.connector.repos) {
    throw new Error("Invalid configuration: Missing connector repos");
  }
  if (!config.connector.repos.split(",").length) {
    throw new Error("Invalid configuration: Invalid connector repos, no repos found");
  }
  if (!config.connector.repos.split(",").every((repo) => repo.trim())) {
    throw new Error("Invalid configuration: Invalid connector repos, empty repository found");
  }
  if (!config.connector.repos.split(",").every((repo) => repo.trim().length > 0)) {
    throw new Error("Invalid configuration: Invalid connector repos, empty repository found");
  }
  validateConnectorId(config.connector.id);
}

/**
 * Validates the connector ID.
 * @param {string} id - The connector ID to validate.
 * @throws {Error} If the connector ID is invalid.
 */
export function validateConnectorId(id: string): void {
  if (!id) throw new Error("Connector ID is required.");
  if (id.length < 3 || id.length > 32) {
    throw new Error("Connector ID must be between 3 and 32 characters long.");
  }
  if (!/^[a-zA-Z0-9]+$/.test(id)) {
    throw new Error("Connector ID must contain only alphanumeric characters.");
  }
  if (disallowedConnectorIds.some((item) => id.toLowerCase().startsWith(item.toLowerCase()))) {
    throw new Error(`Connector ID cannot start with: ${disallowedConnectorIds.join(", ")}.`);
  }
}
