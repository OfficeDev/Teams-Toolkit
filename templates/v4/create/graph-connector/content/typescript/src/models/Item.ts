// [Customization point]
// If you need additional properties in the item object, you can add them here
/**
 * Represents an item in the repository.
 * This is an internal representation of the item before translated
 * into a Graph API item for further ingestion to the Graph API.
 */
export interface Item {
  id: string;
  issueNumber: string;
  owner: string;
  repo: string;
  assignedTo: string;
  state: string;
  lastModified: string;
  title: string;
  abstract: string;
  author: string;
  content: string;
  url: string;
}
