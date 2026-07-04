// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

import { AsyncLocalStorage } from "async_hooks";
import * as uuid from "uuid";

const asyncLocalStorage = new AsyncLocalStorage<string>();

export class Correlator {
  /**
   * Sets the ambient correlation id for the current async context. A valid UUID
   * `id` is adopted as-is — the seam that lets an external caller (e.g. the wiqd
   * CLI) thread its own correlation id in; absent/malformed values mint a fresh
   * UUID so the id is always well-formed.
   */
  static setId(id?: string): string {
    const newId = id && uuid.validate(id) ? id : uuid.v4();
    asyncLocalStorage.enterWith(newId);
    return newId;
  }
  static run<T extends unknown[], R>(work: (...args: [...T]) => R, ...args: [...T]): R {
    const id = asyncLocalStorage.getStore() || uuid.v4();
    return asyncLocalStorage.run<R>(id, () => work(...args));
  }

  static runWithId<T extends unknown[], R>(
    id: string,
    work: (...args: [...T]) => R,
    ...args: [...T]
  ): R {
    id = id ? id : uuid.v4();
    return asyncLocalStorage.run<R>(id, () => work(...args));
  }

  static getId(): string {
    const store = asyncLocalStorage.getStore();
    return store ?? "";
  }
}
