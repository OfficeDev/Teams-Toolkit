// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import { Result, err } from "neverthrow";
import { Answers, CallerFloor } from "../model/dataModel";
import { ScaffoldOutcome, TargetDir } from "../pipeline/runScaffoldPipeline";
import { loadPackageDir } from "../distribution/packageDir";
import { createRealRuntime } from "./realRuntime";
import { scaffold } from "./scaffold";

const SOURCE = "Scaffold";

function scaffoldFrontDoorError(error: unknown): SystemError {
  if (error instanceof SystemError) {
    return error;
  }
  return new SystemError({
    source: SOURCE,
    name: "ScaffoldFromPackageDirFailed",
    message: "Failed to scaffold from the template package directory.",
  });
}

/** Product front door for scaffolding an on-disk declarative package. */
export async function scaffoldFromPackageDir(
  packageDir: string,
  answers: Answers,
  callerFloor: CallerFloor,
  targetDir: TargetDir,
  flagReader?: (name: string) => boolean
): Promise<Result<ScaffoldOutcome, FxError>> {
  const loaded = loadPackageDir(packageDir);
  if (loaded.isErr()) {
    return err(loaded.error);
  }
  try {
    const runtime = createRealRuntime(targetDir.path, flagReader);
    return await scaffold(
      {
        descriptor: loaded.value.descriptor,
        pipeline: loaded.value.pipeline,
        content: loaded.value.content,
        answers,
        callerFloor,
        targetDir,
      },
      runtime
    );
  } catch (error) {
    return err(scaffoldFrontDoorError(error));
  }
}
