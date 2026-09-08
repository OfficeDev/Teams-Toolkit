// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Error thrown when a manifest schema cannot be fetched or parsed from its URL.
 *
 * @remarks
 * The originating error (network failure, `response.text()` rejection, JSON
 * parse error, etc.) is preserved on {@link SchemaFetchError.cause} so callers
 * can branch on the failure type instead of matching against the message string.
 * The message keeps the historical `Failed to get manifest at url ... due to: ...`
 * shape for backward compatibility.
 */
export class SchemaFetchError extends Error {
  /** The schema URL that failed to load. */
  public readonly schemaUrl: string;

  constructor(schemaUrl: string, cause?: unknown) {
    const reason = cause instanceof Error ? cause.message : "unknown error";
    super(`Failed to get manifest at url ${schemaUrl} due to: ${reason}`, { cause });
    this.name = "SchemaFetchError";
    this.schemaUrl = schemaUrl;
  }
}
