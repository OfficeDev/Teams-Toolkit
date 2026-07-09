// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ExpressionRuntimePort } from "../expression/evaluateExpression";
import { PipelineRuntimePort } from "../pipeline/runScaffoldPipeline";
import { createExpressionPort } from "./whitelist";
import { FileSink, buildPipelinePort } from "./runtimeRegistry";

/** Pure in-memory scaffold runtime. See ADR-0018. */

/** A composed in-memory runtime: the pipeline port, its backing file map, and the shared expr port. */
export interface InMemoryRuntime {
  /** The pipeline executor's port, backed by the shared file map. */
  port: PipelineRuntimePort;
  /** The shared render + write file map (`path → bytes`); the read face reads back from it. */
  files: Map<string, Buffer>;
  /** The pure expression port (whitelist + flags), reused for `{expr}` render-var derivation. */
  exprPort: ExpressionRuntimePort;
}

/** Build an in-memory runtime. */
export function createInMemoryRuntime(flagReader?: (name: string) => boolean): InMemoryRuntime {
  const files = new Map<string, Buffer>();
  const exprPort = createExpressionPort(flagReader);
  const sink: FileSink = {
    write: (path: string, data: Buffer): void => {
      files.set(path, data);
    },
    read: (path: string): Buffer | undefined => files.get(path),
  };
  const port = buildPipelinePort(exprPort, sink);
  return { port, files, exprPort };
}
