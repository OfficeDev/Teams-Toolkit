// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Validator } from "../collectInputs/collectInputs";

export const uriValidator: Validator = (value: string): string | undefined => {
  try {
    new URL(value);
    return undefined;
  } catch {
    return "must be a valid URI";
  }
};

export const graphConnectorNameValidator: Validator = (value: string): string | undefined => {
  return value.trim().length > 0 ? undefined : "must not be empty";
};

export const graphConnectorConnectionIdValidator: Validator = (
  value: string
): string | undefined => {
  const trimmed = value.trim();
  if (trimmed.length < 3) {
    return "must be at least 3 characters";
  }
  if (trimmed.length > 32) {
    return "must be at most 32 characters";
  }
  if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
    return "must contain only alphanumeric characters";
  }
  const reservedPrefixes = [
    "Microsoft",
    "None",
    "Directory",
    "Exchange",
    "ExchangeArchive",
    "LinkedIn",
    "Mailbox",
    "OneDriveBusiness",
    "SharePoint",
    "Teams",
    "Yammer",
    "Connectors",
    "TaskFabric",
    "PowerBI",
    "Assistant",
    "TopicEngine",
    "MSFT_All_Connectors",
  ];
  const matchedPrefix = reservedPrefixes.find((prefix) =>
    trimmed.toLowerCase().startsWith(prefix.toLowerCase())
  );
  return matchedPrefix === undefined ? undefined : `must not begin with '${matchedPrefix}'`;
};

export function createDefaultCreateInputValidators(): Record<string, Validator> {
  return {
    uri: uriValidator,
    graphConnectorName: graphConnectorNameValidator,
    graphConnectorConnectionId: graphConnectorConnectionIdValidator,
  };
}
