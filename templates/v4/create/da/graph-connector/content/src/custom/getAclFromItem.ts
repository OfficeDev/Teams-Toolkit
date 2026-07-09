import { Item } from "../models/Item";
import { ExternalConnectors } from "@microsoft/microsoft-graph-types";

// [Customization point]
// If you need additional logic to set the ACL for the item, you can add it here
// Currently, the ACL is set to "everyone" for all items, so public access is granted.
// This function is used to set the ACL for each item
// in the Graph API. The ACL is used to control access to the item.
// For example, you can use a different ACL for different items, etc.
// You could find more information about configuring the ACL in the following link:
// https://learn.microsoft.com/en-us/graph/connecting-external-content-manage-items#access-control-list
export function getAclFromITem(item: Item): ExternalConnectors.Acl[] {
  return [
    {
      accessType: "grant",
      type: "everyone",
      value: "everyone",
    },
  ];
}
