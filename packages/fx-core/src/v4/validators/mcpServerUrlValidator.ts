// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Validator } from "../collectInputs/collectInputs";
import { validateMCPServerUrl } from "../../question/scaffold/vsc/teamsProjectTypeNode";

/**
 * ADR-0020: reject an MCP server URL that cannot be one — no scheme, or a 404 from the probe.
 *
 * Delegates to the same check the shipped question tree runs so both engines refuse exactly the
 * same URLs; a second copy of the rule here would let the two drift apart silently.
 */
export const mcpServerUrlValidator: Validator = (value: string): Promise<string | undefined> =>
  validateMCPServerUrl(value);
