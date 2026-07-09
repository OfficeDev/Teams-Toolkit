// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Combined wizard node for the "Create New Agent/App" wizard.
 * Build-time: this is serialized to wizardNode.json
 * Runtime: loaded from ~/.fx/ui/wizardNode.json (cache) or bundled fallback
 *
 * Source sub-trees are defined separately for maintainability
 * but merged here into a single JSON for distribution.
 */
import { blankNode } from "./blank";
import { ceaNode } from "./cea";
import { daNode } from "./da";
import { graphConnectorNode } from "./graphConnector";
import { officeAddinNode } from "./officeAddin";
import { rootNode } from "./root";
import { tdpNode } from "./tdp";
import { teamsNode } from "./teams";

// Map node references to their actual sub-tree definitions
const nodeMap: Record<string, Record<string, unknown>> = {
  blankNode: blankNode,
  daNode: daNode,
  ceaNode: ceaNode,
  graphConnectorNode: graphConnectorNode,
  teamsNode: teamsNode,
  officeAddinNode: officeAddinNode,
};

// Deep clone a node and inline all sub-tree references
function inlineNodeRefs(source: Record<string, unknown>): Record<string, unknown> {
  const node = JSON.parse(JSON.stringify(source));
  if (node.children) {
    node.children = (node.children as any[]).map((child: any) => {
      if (child.node && nodeMap[child.node]) {
        const inlined = JSON.parse(JSON.stringify(nodeMap[child.node]));
        if (child.condition) inlined.condition = child.condition;
        return inlined;
      }
      return child;
    });
  }
  return node;
}

export const wizardNode = inlineNodeRefs(rootNode);
export const tdpWizardNode = inlineNodeRefs(tdpNode);
