// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author yefuwang@microsoft.com
 */

import { err, FxError, LogProvider, ok, Result } from "@microsoft/teamsfx-api";
import _, { camelCase } from "lodash";
import { Container } from "typedi";
import { setErrorContext } from "../../common/globalVars";
import { MissingEnvironmentVariablesError, UserCancelError } from "../../error";
import { InvalidYmlActionNameError } from "../../error/yml";
import { AzureEnvironmentVariables, OpenAIEnvironmentVariables } from "../constants";
import { DriverContext } from "../driver/interface/commonArgs";
import { StepDriver } from "../driver/interface/stepDriver";
import { envUtil } from "../utils/envUtil";
import { TeamsFxTelemetryReporter } from "../utils/teamsFxTelemetryReporter";
import { component, lifecycleExecutionEvent, SummaryConstant, TelemetryProperty } from "./constant";
import {
  DriverDefinition,
  DriverInstance,
  ExecutionResult,
  ILifecycle,
  LifecycleName,
  ResolvedPlaceholders,
  UnresolvedPlaceholders,
} from "./interface";

function resolveDriverDef(
  def: DriverDefinition,
  resolved: ResolvedPlaceholders,
  unresolved: UnresolvedPlaceholders
): void {
  const args = def.with as Record<string, unknown>;
  for (const k in args) {
    const val = args[k];
    args[k] = resolve(val, resolved, unresolved);
  }
  if (def.env) {
    for (const k in def.env) {
      const val = def.env[k];
      def.env[k] = resolveString(val, resolved, unresolved);
    }
  }
}

// Replace placeholders in the driver definitions' `with` field inplace
// and returns resolved and unresolved placeholders
function resolvePlaceHolders(
  defs: DriverDefinition[]
): [ResolvedPlaceholders, UnresolvedPlaceholders] {
  const resolvedVars: string[] = [];
  const unresolvedVars: string[] = [];
  for (const def of defs) {
    resolveDriverDef(def, resolvedVars, unresolvedVars);
  }
  return [resolvedVars, unresolvedVars];
}

export function resolve(
  input: unknown,
  resolved: ResolvedPlaceholders,
  unresolved: UnresolvedPlaceholders
): unknown {
  if (input === undefined || input === null) {
    return input;
  } else if (typeof input === "string") {
    return resolveString(input, resolved, unresolved);
  } else if (Array.isArray(input)) {
    const newArray: unknown[] = [];
    for (const e of input) {
      newArray.push(resolve(e, resolved, unresolved));
    }
    return newArray;
  } else if (input !== null && typeof input === "object") {
    const newObj = _.cloneDeep(input) as Record<string, unknown>;
    Object.keys(newObj).forEach((key) => {
      newObj[key] = resolve(newObj[key], resolved, unresolved);
    });
    return newObj;
  } else {
    return input;
  }
}

export const allowedEmptyKeys = ["APP_NAME_SUFFIX"];
export function resolveString(
  val: string,
  resolved: ResolvedPlaceholders,
  unresolved: UnresolvedPlaceholders
): string {
  const placeHolderReg = /\${{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}/g;
  let matches = placeHolderReg.exec(val);
  let newVal = val;
  while (matches != null) {
    const envVar = matches[1];
    const envVal = process.env[envVar];
    if (allowedEmptyKeys.includes(envVar)) {
      if (envVal === undefined || envVal === null) {
        unresolved.push(envVar);
      } else {
        resolved.push(envVar);
        newVal = newVal.replace(matches[0], envVal);
      }
    } else if (
      OpenAIEnvironmentVariables.hasOwnProperty(envVar) ||
      AzureEnvironmentVariables.hasOwnProperty(envVar)
    ) {
      if (envVal) {
        resolved.push(envVar);
        newVal = newVal.replace(matches[0], envVal);
      }
    } else {
      if (!envVal) {
        unresolved.push(envVar);
      } else {
        resolved.push(envVar);
        newVal = newVal.replace(matches[0], envVal);
      }
    }
    matches = placeHolderReg.exec(val);
  }
  return newVal;
}

export class Lifecycle implements ILifecycle {
  version: string;
  name: LifecycleName;
  driverDefs: DriverDefinition[];
  constructor(name: LifecycleName, driverDefs: DriverDefinition[], version: string) {
    this.driverDefs = driverDefs;
    this.name = name;
    this.version = version;
  }

  resolvePlaceholders(): UnresolvedPlaceholders {
    const result = resolvePlaceHolders(this.driverDefs);
    return result[1];
  }

  private static stringifyOutput(output: Map<string, string>): string {
    const obj: Record<string, string> = {};

    for (const [k, v] of output) {
      if (k.startsWith("SECRET_")) {
        obj[k] = "******";
      } else {
        obj[k] = v;
      }
    }

    return JSON.stringify(obj);
  }

  async execute(ctx: DriverContext): Promise<ExecutionResult> {
    const actions = JSON.stringify(
      this.driverDefs.map((def) => camelCase(this.stringifyDriverDef(def)))
    );
    const telemetryReporter = ctx.telemetryReporter
      ? new TeamsFxTelemetryReporter(ctx.telemetryReporter, {
          componentName: component,
        })
      : undefined;
    telemetryReporter?.sendStartEvent({
      eventName: lifecycleExecutionEvent,
      properties: {
        [TelemetryProperty.Lifecycle]: this.name,
        [TelemetryProperty.Actions]: actions,
      },
    });
    ctx.logProvider.info(`Executing lifecycle ${this.name}`);
    const resolved: ResolvedPlaceholders = [];
    const unresolved: UnresolvedPlaceholders = [];
    const { result, summaries } = await this.executeImpl(ctx, resolved, unresolved);
    let e: FxError | undefined;
    let failedAction: string | undefined;

    if (result.isOk()) {
      ctx.logProvider.info(
        `Finished Executing lifecycle ${this.name}. Result: ${Lifecycle.stringifyOutput(
          result.value
        )}`
      );
    } else {
      if (result.error.kind === "Failure") {
        e = result.error.error;
        ctx.logProvider.error(`Failed to Execute lifecycle ${this.name}. ${e.name}:${e.message}`);
      } else if (result.error.kind === "PartialSuccess") {
        failedAction = this.stringifyDriverDef(result.error.reason.failedDriver);
        const output = Lifecycle.stringifyOutput(result.error.env);
        if (result.error.reason.kind === "DriverError") {
          e = result.error.reason.error;
          ctx.logProvider.error(
            `Failed to Execute lifecycle ${this.name} due to failed action: ${failedAction}. ${e.name}:${e.message}. Env output: ${output}`
          );
        } else if (result.error.reason.kind === "UnresolvedPlaceholders") {
          // This error is just for telemetry because sendEndEvent() needs an error as parameter.
          e = new MissingEnvironmentVariablesError(
            component,
            result.error.reason.unresolvedPlaceHolders.join(",")
          );
          ctx.logProvider.error(
            `Failed to Execute lifecycle ${
              this.name
            } because there are unresolved placeholders ${JSON.stringify(
              unresolved
            )} for action: ${failedAction}. Env output: ${output}`
          );
        }
      }
    }

    telemetryReporter?.sendEndEvent(
      {
        eventName: lifecycleExecutionEvent,
        properties: {
          [TelemetryProperty.Lifecycle]: this.name,
          [TelemetryProperty.Actions]: actions,
          [TelemetryProperty.ResolvedPlaceholders]: JSON.stringify(resolved),
          [TelemetryProperty.UnresolvedPlaceholders]: JSON.stringify(unresolved),
          [TelemetryProperty.FailedAction]: camelCase(failedAction) ?? "",
        },
      },
      e
    );

    return { result, summaries };
  }

  async executeImpl(
    ctx: DriverContext,
    resolved: ResolvedPlaceholders,
    unresolved: ResolvedPlaceholders
  ): Promise<ExecutionResult> {
    const maybeDrivers = this.resolveDriverInstances(ctx.logProvider);
    if (maybeDrivers.isErr()) {
      return { result: err({ kind: "Failure", error: maybeDrivers.error }), summaries: [] };
    }
    const drivers = maybeDrivers.value;
    const envOutput = new Map<string, string>();
    const summaries: string[][] = [];
    for (const driver of drivers) {
      if (ctx.signal?.aborted) {
        return {
          result: err({ kind: "Failure", error: new UserCancelError(this.name) }),
          summaries,
        };
      }
      ctx.logProvider.verbose(
        `Executing action ${this.stringifyDriverDef(driver)} in lifecycle ${this.name}`
      );
      if (driver.instance.progressTitle) {
        await ctx.progressBar?.next(driver.instance.progressTitle);
      }
      resolveDriverDef(driver, resolved, unresolved);
      if (unresolved.length > 0) {
        ctx.logProvider.warning(
          `Unresolved placeholders(${unresolved.join(
            ","
          )}) found for Action ${this.stringifyDriverDef(driver)} in lifecycle ${this.name}`
        );
        summaries.push([
          `${SummaryConstant.Failed} Unresolved placeholders: ${unresolved.join(",")}`,
        ]);
        return {
          result: err({
            kind: "PartialSuccess",
            env: envOutput,
            reason: {
              kind: "UnresolvedPlaceholders",
              failedDriver: driver,
              unresolvedPlaceHolders: unresolved,
            },
          }),
          summaries,
        };
      }

      if (driver.env) {
        for (const [envVar, value] of Object.entries(driver.env)) {
          process.env[envVar] = value;
        }
      }

      setErrorContext({ component: camelCase(driver.uses), method: "execute" }); // set driver name as component name for telemetry
      const r = await driver.instance.execute(
        driver.with,
        ctx,
        driver.writeToEnvironmentFile
          ? new Map(Object.entries(driver.writeToEnvironmentFile))
          : undefined,
        this.version,
        driver.name
      );
      if (ctx.signal?.aborted) {
        return {
          result: err({ kind: "Failure", error: new UserCancelError(this.name) }),
          summaries,
        };
      }
      const result = r.result;
      const summary = r.summaries.map((s) => `${SummaryConstant.Succeeded} ${s}`);
      summaries.push(summary);
      if (result.isErr()) {
        summary.push(`${SummaryConstant.Failed} ${result.error.message}`);
        return {
          result: err({
            kind: "PartialSuccess",
            env: envOutput,
            reason: {
              kind: "DriverError",
              failedDriver: driver,
              error: result.error,
            },
          }),
          summaries,
        };
      }

      for (const [envVar, value] of result.value) {
        envOutput.set(envVar, value);
        process.env[envVar] = value;
      }
      // Flush accumulated env output to disk after each driver so that subsequent actions
      // (e.g. cli/runNpmCommand) that read the .env file directly can see up-to-date values.
      if (result.value.size > 0 && ctx.projectPath && process.env.TEAMSFX_ENV) {
        const writeRes = await envUtil.writeEnv(
          ctx.projectPath,
          process.env.TEAMSFX_ENV,
          envUtil.map2object(envOutput)
        );
        if (writeRes.isErr()) {
          ctx.logProvider.warning(
            `Failed to flush env output to disk after action ${this.stringifyDriverDef(driver)}: ${writeRes.error?.message ?? String(writeRes.error)}`
          );
        }
      }
      ctx.logProvider.verbose(
        `Action ${this.stringifyDriverDef(driver)} in lifecycle ${
          this.name
        } succeeded with output ${Lifecycle.stringifyOutput(result.value)}`
      );
    }

    return { result: ok(envOutput), summaries };
  }

  private stringifyDriverDef(def: DriverDefinition): string {
    if (def.name) {
      return JSON.stringify({ name: def.name, uses: def.uses });
    }
    return def.uses;
  }

  public resolveDriverInstances(log: LogProvider): Result<DriverInstance[], FxError> {
    void log.debug(`Trying to resolve actions for lifecycle ${this.name}`);
    const drivers: DriverInstance[] = [];
    for (const def of this.driverDefs) {
      if (!Container.has(def.uses)) {
        return err(new InvalidYmlActionNameError(def.uses));
      }
      const driver = Container.get<StepDriver>(def.uses);
      drivers.push({ instance: driver, ...def });
      void log.debug(`Action ${this.stringifyDriverDef(def)} found for lifecycle ${this.name}`);
    }
    return ok(drivers);
  }
}
