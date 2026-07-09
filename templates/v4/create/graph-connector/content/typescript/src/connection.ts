import { delay } from "./utils";
import { getClient } from "./graphClient";
import { ExternalConnectors } from "@microsoft/microsoft-graph-types";
import { Config } from "./models/Config";
import { getAllItems } from "./services/itemsService";
import { schemaExists } from "./schema";

const timeout = 600_000; // 10 minutes
const retryInterval = 15_000; // 15 seconds
let consentRequested = false;
let client = getClient();

/**
 * Creates a connection in Microsoft Graph.
 * @param config - The configuration object.
 */
async function createConnection(config: Config) {
  config.context.log(`Creating connection ${config.connector.id}.`);

  await client.api("/external/connections").post({
    id: config.connector.id,
    name: config.connector.name,
    description: config.connector.description,
  });

  config.context.log(`Connection ${config.connector.id} was created`);
}

/**
 * Updates a connection in Microsoft Graph.
 * @param config - The configuration object.
 */
export async function setSearchSettings(config: Config) {
  const connection = await getConnection(config);

  if (!connection.searchSettings) {
    const url = `/external/connections/${config.connector.id}`;
    const body = {
      searchSettings: {
        searchResultTemplates: [
          {
            id: "display",
            layout: config.connector.template,
            priority: 1,
          },
        ],
      },
    };
    config.context.log(`PATCH ${url}`);
    config.context.log(JSON.stringify(body, null, 4));

    await client.api(`/external/connections/${config.connector.id}`).patch(body);
  }
}

/**
 * Retrieves a connection from Microsoft Graph.
 * @param config - The configuration object.
 * @returns The connection object.
 */
async function getConnection(config: Config): Promise<ExternalConnectors.ExternalConnection> {
  return await client.api(`/external/connections/${config.connector.id}`).get();
}

/**
 * Check if the connection exists.
 * @param config - The configuration object.
 * @returns A boolean indicating if the connection exists.
 */
export async function connectionExists(config: Config): Promise<boolean> {
  try {
    await getConnection(config);
    return true;
  } catch (e) {
    config.context.warn(`Can't find the connection ${config.connector.id}: ${e}`);
    return false;
  }
}

/**
 * Ensures that the connection exists in Microsoft Graph.
 * @returns A boolean indicating if the connection was successfully created or already exists.
 */
export async function ensureConnection(config: Config, initialTimestamp: number): Promise<boolean> {
  try {
    // If time elapsed is less than 10 minutes, try again
    if (Date.now() - initialTimestamp <= timeout) {
      // We need to re-initialize the client because of granting the admin consent
      client = getClient();
      await getConnection(config);
      config.context.log(`Connection ${config.connector.id} already exists`);
      return true;
    } else {
      config.context.error(
        `Could not create connection ${config.connector.id} in under 10 minutes`
      );
    }
  } catch (e) {
    // The connection does not exist, so we need to create it
    if (e.statusCode === 404) {
      await createConnection(config);
      return true;
      // The authentication is failing, so we need to re-initialize the client as the developer is about grant tenant-wide admin consent
    } else if (
      e.statusCode === 401 ||
      e.statusCode === 403 ||
      (e.statusCode === -1 && e.code === "AuthenticationRequiredError")
    ) {
      if (!consentRequested) {
        config.context.warn(
          `\nYou need to grant tenant-wide admin consent to the application in Entra ID\nUse this link to provide the consent\nhttps://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/${config.clientId}/isMSAApp~/false`
        );
        consentRequested = true;
      }

      await delay(retryInterval);
      return await ensureConnection(config, initialTimestamp);
    } else {
      config.context.error(e);
    }

    return false;
  }
}

/**
 * Checks if the connection is ready.
 * @param config - The configuration object.
 * @returns A boolean indicating if the connection is ready.
 */
export async function isConnectionReady(config: Config): Promise<boolean> {
  try {
    client = getClient();
    const connection = await getConnection(config);
    if (connection.state && connection.state !== "ready") {
      config.context.log(`Connection ${config.connector.id} is not ready`);
      return false;
    }
    config.context.log(`Connection ${config.connector.id} is ready`);

    const schemaIsDeployed = await schemaExists(config);
    if (!schemaIsDeployed) {
      config.context.log(`Schema is not deployed`);
      return false;
    }

    return true;
  } catch (e) {
    config.context.error(`Error checking connection ${config.connector.id}: ${e}`);
    return false;
  }
}

/**
 * Clears all items from the connection.
 * @returns A boolean indicating if the connection was successfully created or already exists.
 */
export async function clearConnectionItems(config: Config): Promise<boolean> {
  try {
    client = getClient();
    const connection = await getConnection(config);

    if (connection) {
      config.context.log(`Clearing all items from connection ${config.connector.id}`);
      const items = await getAllItems(config, undefined);
      config.context.log(JSON.stringify(items, null, 4));
      return true;
    }

    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Ensures that the connection exists in Microsoft Graph.
 * @returns A boolean indicating if the connection was successfully created or already exists.
 */
export async function deleteConnection(config: Config, initialTimestamp: number): Promise<boolean> {
  try {
    if (Date.now() - initialTimestamp <= timeout) {
      client = getClient();
      const connection = await getConnection(config);

      if (connection) {
        config.context.log(`Deleting connection ${config.connector.id}`);
        await client.api(`/external/connections/${config.connector.id}`).delete();
        config.context.log(`Connection ${config.connector.id} was deleted`);
        return true;
      }

      return false;
    } else {
      config.context.error(
        `Could not delete connection ${config.connector.id} in under 10 minutes`
      );
    }
  } catch (e) {
    // The connection does not exist, so we need to create it
    if (e.statusCode === 404) {
      config.context.warn(`Connection ${config.connector.id} does not exist`);
      return true;
      // The authentication is failing, so we need to re-initialize the client as the developer is about grant tenant-wide admin consent
    } else if (
      e.statusCode === 401 ||
      e.statusCode === 403 ||
      (e.statusCode === -1 && e.code === "AuthenticationRequiredError")
    ) {
      if (!consentRequested) {
        config.context.warn(
          `\nYou need to grant tenant-wide admin consent to the application in Entra ID\nUse this link to provide the consent\nhttps://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/${config.clientId}/isMSAApp~/false`
        );
        consentRequested = true;
      }

      await delay(retryInterval);
      return await deleteConnection(config, initialTimestamp);
    } else {
      config.context.error(e);
    }

    return false;
  }
}
