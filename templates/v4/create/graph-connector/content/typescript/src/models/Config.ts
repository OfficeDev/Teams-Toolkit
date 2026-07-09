import { InvocationContext } from "@azure/functions";
import { ExternalConnectors } from "@microsoft/microsoft-graph-types";

// [Customization point]
// If you need additional properties in the configuration object, you can add them here
/**
 * Represents the configuration object for the connector.
 */
export interface Config {
  context: InvocationContext;
  clientId: string;
  connector: {
    accessToken: string;
    id: string;
    name: string;
    description: string;
    schema: ExternalConnectors.Schema;
    template: any;
    repos: string; // Comma separated list of repositories for sample purpose
  };
}
