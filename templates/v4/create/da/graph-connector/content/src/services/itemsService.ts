import { getAllItemsFromAPI } from "../custom/getAllItemsFromAPI";
import { Config } from "../models/Config";

// [Customization point]
// This is a custom implementation to get items from the API
// based on the items retrieved from the API.
// You can customize this function to fit your needs use a different API endpoint, ...
// For example, you can use a different pagination implementation to retrieve the items, etc.
/**
 * This function is used to get all items from the repository.
 * The items are filtered to exclude pull requests and only include issues.
 * The items are retrieved from the API using the getAllItemsFromAPI function.
 * @param config - The configuration object.
 * @param since - The date to filter the items. If not provided, all items will be returned.
 * @returns An async generator that yields items from the repository.
 */
export async function* getAllItems(config: Config, since?: Date) {
  for await (const item of getAllItemsFromAPI(config, since)) {
    yield item;
  }
}
