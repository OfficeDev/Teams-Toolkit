// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ExpressionRuntimePort } from "../expression/evaluateExpression";
import { PipelineRuntimePort } from "../pipeline/runScaffoldPipeline";
import { Warning } from "@microsoft/teamsfx-api";
import { dotenvUtil } from "../../component/utils/envUtil";
import { ok } from "neverthrow";
import { createExpressionPort } from "./whitelist";
import { FileSink, StepRegistry, buildPipelinePort } from "./runtimeRegistry";

/** Pure in-memory scaffold runtime. See ADR-0018. */

/** A composed in-memory runtime: the pipeline port, its backing file map, and the shared expr port. */
export interface InMemoryRuntime {
  /** The pipeline executor's port, backed by the shared file map. */
  port: PipelineRuntimePort;
  /** The shared render + write file map (`path → bytes`); the read face reads back from it. */
  files: Map<string, Buffer>;
  /** Plaintext secret values, isolated from the ordinary file map by environment name. */
  secretEnvironmentVariables: Map<string, Map<string, string>>;
  /** Warnings emitted by post-render steps, in emission order. */
  warnings: Warning[];
  /** The pure expression port (whitelist + flags), reused for `{expr}` render-var derivation. */
  exprPort: ExpressionRuntimePort;
}

/** Build an in-memory runtime. */
export function createInMemoryRuntime(
  flagReader?: (name: string) => boolean,
  stepRegistry?: StepRegistry
): InMemoryRuntime {
  const files = new Map<string, Buffer>();
  const secretEnvironmentVariables = new Map<string, Map<string, string>>();
  const warnings: Warning[] = [];
  const exprPort = createExpressionPort(flagReader);
  const sink: FileSink = {
    write: (path: string, data: Buffer): void => {
      files.set(path, data);
    },
    read: (path: string): Buffer | undefined => files.get(path),
  };
  const port = buildPipelinePort(
    exprPort,
    sink,
    (environment, values) => {
      const environmentPath = `env/.env.${environment}`;
      const parsed = dotenvUtil.deserialize(files.get(environmentPath) ?? Buffer.from("", "utf8"));
      const secrets = secretEnvironmentVariables.get(environment) ?? new Map<string, string>();
      for (const [name, value] of Object.entries(values)) {
        if (name.startsWith("SECRET_")) {
          secrets.set(name, value);
        } else {
          parsed.obj[name] = value;
        }
      }
      parsed.obj.TEAMSFX_ENV = environment;
      files.set(environmentPath, Buffer.from(dotenvUtil.serialize(parsed), "utf8"));
      secretEnvironmentVariables.set(environment, secrets);
      return Promise.resolve(ok(undefined));
    },
    stepRegistry,
    (warning: Warning): void => {
      warnings.push(warning);
    }
  );
  return { port, files, secretEnvironmentVariables, warnings, exprPort };
}
