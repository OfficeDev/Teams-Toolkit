// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

"use strict";

export class vscMockTelemetryReporter {
  public sendTelemetryEvent(): void {
    // Noop.
  }

  public sendTelemetryErrorEvent(): void {
    // Noop.
  }

  public sendTelemetryException(): void {
    // Noop.
  }

  public async dispose(): Promise<void> {
    // Noop.
  }
}
