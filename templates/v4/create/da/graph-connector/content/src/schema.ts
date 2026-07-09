import { delay } from "./utils";
import { getClient } from "./graphClient";
import { Config } from "./models/Config";

const retryInterval = 15_000; // 15 seconds
const client = getClient();

/**
 * Creates a schema for the connection in Microsoft Graph.
 * @param config - The configuration object.
 * @param id - The ID of the connection.
 * @param schema - The schema to create.
 */
async function createSchema(config: Config) {
  try {
    config.context.log(
      `Creating schema for connection ${config.connector.id}. This should take under 10 minutes...`
    );

    await client
      .api(`/external/connections/${config.connector.id}/schema`)
      .header("content-type", "application/json")
      .post({
        baseType: "microsoft.graph.externalItem",
        properties: config.connector.schema,
      });

    config.context.log(`Schema for connection ${config.connector.id} was created`);
  } catch (e) {
    config.context.error(e);
  }
}

/**
 * Retrieves the schema for the connection from Microsoft Graph.
 * @param config - The configuration object.
 */
async function getSchema(config: Config): Promise<any> {
  await client.api(`/external/connections/${config.connector.id}/schema`).get();
}

/**
 * Checks if the schema for the connection exists.
 * @param config - The configuration object.
 * @returns True if the schema exists, false otherwise.
 */
export async function schemaExists(config: Config): Promise<any> {
  try {
    await getSchema(config);
    return true;
  } catch (e) {
    config.context.error(`Can't find the schema for connection ${config.connector.id}: ${e}`);
    return false;
  }
}

/**
 * Ensures that the schema exists in Microsoft Graph.
 * @param config - The configuration object.
 */
export async function ensureSchema(config: Config): Promise<void> {
  try {
    // Try to get the schema
    await getSchema(config);
  } catch (e) {
    if (e.statusCode === 404) {
      // If the schema does not exist, create it
      await createSchema(config);
    } else {
      // If the error is not 404, retry
      await delay(retryInterval);
      ensureSchema(config);
    }
  }
}
