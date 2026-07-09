import { ExternalConnectors } from "@microsoft/microsoft-graph-types";
import { getClient } from "./graphClient";
import { Config } from "./models/Config";
import { getAllItems } from "./services/itemsService";
import { getExternalItemFromItem } from "./custom/getExternalItemFromItem";

const client = getClient();

/**
 * Loads the content into the Graph API.
 * @param config - The configuration object.
 * @param doc - The document to load.
 * @returns A promise that resolves when the content has been loaded.
 */
async function loadContent(config: Config, item: ExternalConnectors.ExternalItem): Promise<void> {
  const itemId = item.id;

  // Remove the ID from the item to avoid conflicts
  delete item.id;

  try {
    const url = `/external/connections/${config.connector.id}/items/${itemId}`;

    config.context.log(`PUT ${url}`);
    config.context.log(JSON.stringify(item, null, 4));

    await client.api(url).header("content-type", "application/json").put(item);
  } catch (e) {
    config.context.error(`Failed to load ${itemId}: ${e.message}`);
    if (e.body) {
      config.context.error(`${JSON.parse(e.body, null)?.innerError?.message ?? ""}`);
    }
    return;
  }
}

/**
 * Ensures that the content is ingested into the Graph API.
 * @param config - The configuration object.
 */
export async function ingestContent(config: Config, since?: Date): Promise<void> {
  // Get all items from the API asynchronously using the generator function
  // this is a custom implementation to get items from the API
  for await (const item of getAllItems(config, since)) {
    const transformedItem = getExternalItemFromItem(item);

    // Copilot connector API, load content item by item
    // this is a custom implementation to load the content into the Graph API
    // you can customize this function to fit your needs
    // if you want to load the content in bulk, you can accumulate several items
    // and use the batch API
    // https://learn.microsoft.com/en-us/graph/json-batching?tabs=http
    await loadContent(config, transformedItem);
  }
}
