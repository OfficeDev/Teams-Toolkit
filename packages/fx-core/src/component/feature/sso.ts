// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Context, err, FxError, InputsWithProjectPath, ok, Result } from "@microsoft/teamsfx-api";
import "reflect-metadata";
import { Service } from "typedi";
import { TelemetrySuccess } from "../../common/telemetry";
import { sendErrorTelemetryThenReturnError } from "../../core/telemetry";
import {
  SolutionTelemetryComponentName,
  SolutionTelemetryEvent,
  SolutionTelemetryProperty,
} from "../constants";
import { createAuthFiles } from "./createAuthFiles";

@Service("sso")
export class SSO {
  name = "sso";

  async add(context: Context, inputs: InputsWithProjectPath): Promise<Result<any, FxError>> {
    return addSsoV3(context, inputs);
  }
}

async function addSsoV3(
  context: Context,
  inputs: InputsWithProjectPath
): Promise<Result<any, FxError>> {
  context.telemetryReporter?.sendTelemetryEvent(SolutionTelemetryEvent.AddSsoStart, {
    [SolutionTelemetryProperty.Component]: SolutionTelemetryComponentName,
  });

  const res = await createAuthFiles(inputs);
  if (res.isErr()) {
    return err(
      sendErrorTelemetryThenReturnError(
        SolutionTelemetryEvent.AddSso,
        res.error,
        context.telemetryReporter
      )
    );
  }

  context.telemetryReporter?.sendTelemetryEvent(SolutionTelemetryEvent.AddSso, {
    [SolutionTelemetryProperty.Component]: SolutionTelemetryComponentName,
    [SolutionTelemetryProperty.Success]: TelemetrySuccess.Yes,
  });

  return ok(undefined);
}
