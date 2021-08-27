// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ErrorType, BaseError } from './baseError'
import { Suggestions } from './enums/suggestions'
import { ErrorNames } from './enums/errorNames'

export class InternalError extends BaseError {
  constructor(message: string) {
    super(ErrorType.System, ErrorNames.InternalError, message, [
      Suggestions.RerunWorkflow,
      Suggestions.CreateAnIssue
    ])
  }
}
