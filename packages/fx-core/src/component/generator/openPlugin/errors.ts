// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

export class OpenPluginInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenPluginInputError";
  }
}
