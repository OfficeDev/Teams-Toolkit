// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { blankTemplates } from "./blank";
import { customEngineAgentTemplates } from "./customEngineAgent";
import { declarativeAgentTemplates } from "./declarativeAgent";
import { graphConnectorTemplates } from "./graphConnector";
import { Template } from "./interface";
import { foundryAgentTemplate, specialTemplates } from "./special";
import {
  chatWithYourDataTemplates,
  collaboratorAgentTemplates,
  generalTeamsAgentTemplates,
  teamsAgentsAndAppsTemplates,
  teamsOtherTemplates,
} from "./teams";
import { vsOnlyTemplates } from "./vs";
import { wxpTemplates } from "./wxp";

export const allTemplates: Template[] = [
  ...declarativeAgentTemplates,
  ...customEngineAgentTemplates,
  ...graphConnectorTemplates,
  ...teamsAgentsAndAppsTemplates,
  ...blankTemplates,
  ...wxpTemplates,
  ...specialTemplates,
  ...vsOnlyTemplates,
  foundryAgentTemplate,
];

export const defaultGeneratorTemplates: Template[] = [
  ...customEngineAgentTemplates,
  ...generalTeamsAgentTemplates,
  ...chatWithYourDataTemplates,
  ...collaboratorAgentTemplates,
  ...teamsOtherTemplates,
  ...blankTemplates,
  ...vsOnlyTemplates,
  ...graphConnectorTemplates,
  foundryAgentTemplate,
];
