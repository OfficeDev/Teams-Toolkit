import * as fs from "fs-extra";
const lastCrawlFilePath = "./tmp/lastCrawl.json";

// [Customization point]: For simple scenarios purposes, we are using a local file to store the last crawl date.
// In a production environment, you might want to use a more robust solution like Azure Blob Storage, Cosmos DB or any other storage solution.
/**
 * Save the last crawl date to a file
 * @param {Date} lastCrawl - The last crawl date
 * @returns {Promise<void>}
 */
export async function saveLastCrawl(lastCrawl: Date): Promise<void> {
  try {
    await fs.outputFile(lastCrawlFilePath, JSON.stringify(lastCrawl));
  } catch (error) {
    console.error("Error saving last crawl date", error);
  }
}

// [Customization point]: For simple scenarios purposes, we are using a local file to store the last crawl date.
// In a production environment, you might want to use a more robust solution like Azure Blob Storage, Cosmos DB or any other storage solution.
/**
 * Gets the last crawl date to a file
 * @returns {Promise<Date>} The last crawl date
 */
export async function getLastCrawl(): Promise<Date | undefined> {
  try {
    const content = await fs.readFile(lastCrawlFilePath, "utf-8");
    return new Date(JSON.parse(content));
  } catch (error) {
    return undefined;
  }
}
