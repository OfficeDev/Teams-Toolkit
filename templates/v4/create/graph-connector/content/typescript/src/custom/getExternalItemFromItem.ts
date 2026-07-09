import { Item } from "../models/Item";
import { ExternalConnectors } from "@microsoft/microsoft-graph-types";
import { getAclFromITem } from "./getAclFromItem";

// [Customization point]
// If there is additional logic to transform the item, you can add it here
// This function is used to transform the item into a format that can be ingested by the Graph API.
// The item is transformed into an ExternalItem object that can be ingested by the Graph API.
// The ExternalItem object is used to represent the item in the Graph API.
// See the Graph API documentation to understand the structure of the ExternalItem object and how to convert the item into it.
// https://learn.microsoft.com/en-us/graph/api/resources/connectors-api-overview?view=graph-rest-1.0
// https://learn.microsoft.com/en-us/graph/api/externalconnectors-externalconnection-put-items?view=graph-rest-1.0

/**
 * @param item - The item to transform.
 * @returns
 */
export function getExternalItemFromItem(item: Item): ExternalConnectors.ExternalItem {
  return {
    id: item.id,
    properties: {
      lastModified: item.lastModified,
      "title@odata.type": "String",
      title: item.title,
      "abstract@odata.type": "String",
      abstract: item.abstract,
      assignedTo: item.assignedTo,
      issueNumber: item.issueNumber.toString(),
      state: item.state,
      author: item.author,
      url: item.url,
      owner: item.owner,
      repo: item.repo,
    },
    content: {
      value: item.content,
      type: "text",
    },
    acl: getAclFromITem(item),
  } as ExternalConnectors.ExternalItem;
}
