// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// eslint-disable-next-line no-shadow
export enum ErrorType {
  User,
  System
}

export class BaseError extends Error {
  name: string
  details: string
  suggestions: string[]
  errorType: ErrorType
  innerError?: Error
  showHelpLink: boolean

  constructor(
    type: ErrorType,
    name: string,
    details: string,
    suggestions: string[],
    innerError?: Error,
    showHelpLink = false
  ) {
    super(details)
    this.name = name
    this.details = details
    this.suggestions = suggestions
    this.errorType = type
    this.innerError = innerError
    this.showHelpLink = showHelpLink
    Object.setPrototypeOf(this, BaseError.prototype)
  }

  toString(): string {
    return `${this.message} Suggestions: ${this.suggestions.join('\n')}`
  }
}
