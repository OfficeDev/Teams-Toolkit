// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError } from "@microsoft/teamsfx-api";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { Result, err } from "neverthrow";

export type TempDirectoryPhase = "allocate" | "operate" | "cleanup";

export interface TempDirectoryPort {
  create(prefix: string): Promise<string>;
  remove(directory: string): Promise<void>;
}

const nodeTempDirectoryPort: TempDirectoryPort = {
  create: (prefix) => fs.mkdtemp(path.join(os.tmpdir(), prefix)),
  remove: (directory) => fs.remove(directory),
};

/** Run one operation in a disposable directory without allowing filesystem failures to escape Result. */
export async function withTempDirectory<T>(
  prefix: string,
  errorFactory: (phase: TempDirectoryPhase, error: unknown) => FxError,
  operation: (directory: string) => Promise<Result<T, FxError>>,
  port: TempDirectoryPort = nodeTempDirectoryPort
): Promise<Result<T, FxError>> {
  let directory: string;
  try {
    directory = await port.create(prefix);
  } catch (error) {
    return err(errorFactory("allocate", error));
  }

  let outcome: Result<T, FxError>;
  try {
    outcome = await operation(directory);
  } catch (error) {
    outcome = err(errorFactory("operate", error));
  }

  try {
    await port.remove(directory);
  } catch (error) {
    if (outcome.isOk()) {
      return err(errorFactory("cleanup", error));
    }
  }
  return outcome;
}
