// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { vi, type Mocked, type MockInstance } from "vitest";

const valueRestorers: Array<() => void> = [];
const originalUseFakeTimers = vi.useFakeTimers.bind(vi);
const originalSpyOn = vi.spyOn.bind(vi);
const callPlans = new WeakMap<
  MockInstance,
  {
    index: number;
    originalImplementation?: (...args: unknown[]) => unknown;
    actions: Map<
      number,
      {
        type: "return" | "resolve" | "reject" | "throw" | "implementation";
        value: unknown;
      }
    >;
  }
>();
const argPlans = new WeakMap<
  MockInstance,
  Array<{
    expected: unknown[];
    action: {
      type: "return" | "resolve" | "reject" | "throw" | "implementation";
      value: unknown;
    };
  }>
>();

declare module "vitest" {
  interface MockInstance<T extends (...args: any[]) => any = (...args: any[]) => any> {
    readonly called: boolean;
    readonly calledOnce: boolean;
    readonly calledOnceWith: (...expected: unknown[]) => boolean;
    readonly calledOnceWithExactly: (...expected: unknown[]) => boolean;
    readonly calledTwice: boolean;
    readonly calledThrice: boolean;
    readonly callCount: number;
    readonly notCalled: boolean;
    readonly args: Parameters<T>[];
    readonly firstCall: { args: Parameters<T>; returnValue: ReturnType<T> | undefined };
    readonly lastCall: { args: Parameters<T>; returnValue: ReturnType<T> | undefined };
    getCall(index: number): { args: Parameters<T> };
    getCalls(): Array<{ args: Parameters<T> }>;
    calledWith(...expected: unknown[]): boolean;
    calledWithExactly(...expected: Parameters<T>): boolean;
    calledWithMatch(...expected: unknown[]): boolean;
    withArgs(...expected: unknown[]): {
      mockReturnValue(value: unknown): MockInstance<T>;
      mockResolvedValue(value: unknown): MockInstance<T>;
      mockRejectedValue(value: unknown): MockInstance<T>;
      mockImplementation(impl: (...args: unknown[]) => unknown): MockInstance<T>;
      returns(value: unknown): MockInstance<T>;
      resolves(value: unknown): MockInstance<T>;
      rejects(value: unknown): MockInstance<T>;
      throws(error: unknown): MockInstance<T>;
    };
    onCall(index: number): {
      mockReturnValue(value: unknown): MockInstance<T>;
      mockResolvedValue(value: unknown): MockInstance<T>;
      mockRejectedValue(value: unknown): MockInstance<T>;
      mockImplementation(impl: (...args: unknown[]) => unknown): MockInstance<T>;
      returns(value: unknown): MockInstance<T>;
      resolves(value: unknown): MockInstance<T>;
      rejects(value: unknown): MockInstance<T>;
      throws(error: unknown): MockInstance<T>;
    };
    onFirstCall(): ReturnType<MockInstance<T>["onCall"]>;
    onSecondCall(): ReturnType<MockInstance<T>["onCall"]>;
    onThirdCall(): ReturnType<MockInstance<T>["onCall"]>;
    reset(): MockInstance<T>;
    throws(error: unknown): MockInstance<T>;
    yields(...values: unknown[]): MockInstance<T>;
    restore(): void;
  }
}

function asMockInstance(value: unknown): MockInstance {
  return value as MockInstance;
}

function getCalls(mock: unknown): unknown[][] {
  const instance = asMockInstance(mock);
  return instance.mock?.calls ?? [];
}

function getResults(mock: unknown): unknown[] {
  const instance = asMockInstance(mock);
  return instance.mock?.results?.map((result) => result.value) ?? [];
}

function toCallRecord<T extends (...args: any[]) => any>(
  mock: unknown,
  index: number
): { args: Parameters<T>; returnValue: ReturnType<T> | undefined } {
  const calls = getCalls(mock);
  const results = getResults(mock);
  return {
    args: (calls[index] ?? []) as Parameters<T>,
    returnValue: results[index] as ReturnType<T> | undefined,
  };
}

function matchesExpected(actual: unknown, expected: unknown): boolean {
  if (
    expected &&
    typeof expected === "object" &&
    "asymmetricMatch" in expected &&
    typeof (expected as { asymmetricMatch?: unknown }).asymmetricMatch === "function"
  ) {
    return (expected as { asymmetricMatch: (value: unknown) => boolean }).asymmetricMatch(actual);
  }

  if (typeof expected === "function") {
    try {
      return Boolean((expected as (value: unknown) => unknown)(actual));
    } catch {
      return false;
    }
  }

  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, index) => matchesExpected((actual as unknown[])[index], item))
    );
  }

  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object") {
      return false;
    }

    return Object.entries(expected).every(([key, value]) =>
      matchesExpected((actual as Record<string, unknown>)[key], value)
    );
  }

  return Object.is(actual, expected);
}

function ensureMockCompat(): void {
  const prototype = Function.prototype as Record<string, unknown>;
  const defineMethod = (name: string, value: (...args: unknown[]) => unknown) => {
    Object.defineProperty(prototype, name, {
      configurable: true,
      writable: true,
      value,
    });
  };

  if (!Object.getOwnPropertyDescriptor(prototype, "called")) {
    Object.defineProperty(prototype, "called", {
      configurable: true,
      get(this: unknown) {
        return getCalls(this).length > 0;
      },
    });
  }

  if (!Object.getOwnPropertyDescriptor(prototype, "calledOnce")) {
    Object.defineProperty(prototype, "calledOnce", {
      configurable: true,
      get(this: unknown) {
        return getCalls(this).length === 1;
      },
    });
  }

  if (!Object.getOwnPropertyDescriptor(prototype, "calledTwice")) {
    Object.defineProperty(prototype, "calledTwice", {
      configurable: true,
      get(this: unknown) {
        return getCalls(this).length === 2;
      },
    });
  }

  if (!Object.getOwnPropertyDescriptor(prototype, "calledThrice")) {
    Object.defineProperty(prototype, "calledThrice", {
      configurable: true,
      get(this: unknown) {
        return getCalls(this).length === 3;
      },
    });
  }

  if (!Object.getOwnPropertyDescriptor(prototype, "callCount")) {
    Object.defineProperty(prototype, "callCount", {
      configurable: true,
      get(this: unknown) {
        return getCalls(this).length;
      },
    });
  }

  if (!Object.getOwnPropertyDescriptor(prototype, "notCalled")) {
    Object.defineProperty(prototype, "notCalled", {
      configurable: true,
      get(this: unknown) {
        return getCalls(this).length === 0;
      },
    });
  }

  if (!Object.getOwnPropertyDescriptor(prototype, "args")) {
    Object.defineProperty(prototype, "args", {
      configurable: true,
      get(this: unknown) {
        return getCalls(this);
      },
    });
  }

  if (!Object.getOwnPropertyDescriptor(prototype, "calledOnceWith")) {
    Object.defineProperty(prototype, "calledOnceWith", {
      configurable: true,
      get(this: unknown) {
        return (...expected: unknown[]) =>
          getCalls(this).length === 1 &&
          expected.every((value, index) => matchesExpected(getCalls(this)[0]?.[index], value));
      },
    });
  }

  if (!Object.getOwnPropertyDescriptor(prototype, "calledOnceWithExactly")) {
    Object.defineProperty(prototype, "calledOnceWithExactly", {
      configurable: true,
      get(this: unknown) {
        return (...expected: unknown[]) =>
          getCalls(this).length === 1 &&
          getCalls(this)[0]?.length === expected.length &&
          expected.every((value, index) => matchesExpected(getCalls(this)[0]?.[index], value));
      },
    });
  }

  if (!Object.getOwnPropertyDescriptor(prototype, "firstCall")) {
    Object.defineProperty(prototype, "firstCall", {
      configurable: true,
      get(this: unknown) {
        return toCallRecord(this, 0);
      },
    });
  }

  if (!Object.getOwnPropertyDescriptor(prototype, "lastCall")) {
    Object.defineProperty(prototype, "lastCall", {
      configurable: true,
      get(this: unknown) {
        const calls = getCalls(this);
        return toCallRecord(this, Math.max(calls.length - 1, 0));
      },
    });
  }

  if (typeof prototype.getCall !== "function") {
    defineMethod("getCall", function (this: unknown, index: number) {
      return toCallRecord(this, index);
    });
  }

  if (typeof prototype.getCalls !== "function") {
    defineMethod("getCalls", function (this: unknown) {
      return getCalls(this).map((_, index) => toCallRecord(this, index));
    });
  }

  if (typeof prototype.calledWith !== "function") {
    defineMethod("calledWith", function (this: unknown, ...expected: unknown[]) {
      return getCalls(this).some(
        (args) =>
          args.length >= expected.length &&
          expected.every((value, index) => matchesExpected(args[index], value))
      );
    });
  }

  if (typeof prototype.calledWithExactly !== "function") {
    defineMethod("calledWithExactly", function (this: unknown, ...expected: unknown[]) {
      return getCalls(this).some(
        (args) =>
          args.length === expected.length &&
          expected.every((value, index) => matchesExpected(args[index], value))
      );
    });
  }

  if (typeof prototype.calledWithMatch !== "function") {
    defineMethod("calledWithMatch", function (this: unknown, ...expected: unknown[]) {
      return getCalls(this).some(
        (args) =>
          args.length >= expected.length &&
          expected.every((value, index) => matchesExpected(args[index], value))
      );
    });
  }

  function ensureOnCallPlan(instance: MockInstance) {
    let plan = callPlans.get(instance);
    if (!plan) {
      plan = {
        index: 0,
        originalImplementation: instance.getMockImplementation(),
        actions: new Map(),
      };
      callPlans.set(instance, plan);
      instance.mockImplementation((...args: unknown[]) => {
        const conditionalActions = argPlans.get(instance) ?? [];
        const conditionalAction = conditionalActions.find((item) =>
          item.expected.every((value, index) => matchesExpected(args[index], value))
        );
        if (conditionalAction) {
          switch (conditionalAction.action.type) {
            case "return":
              return conditionalAction.action.value;
            case "resolve":
              return Promise.resolve(conditionalAction.action.value);
            case "reject":
              return Promise.reject(conditionalAction.action.value);
            case "throw":
              throw conditionalAction.action.value;
            case "implementation":
              return (conditionalAction.action.value as (...callArgs: unknown[]) => unknown)(
                ...args
              );
            default:
              return undefined;
          }
        }

        const action = plan.actions.get(plan.index++);
        if (!action) {
          return plan.originalImplementation?.(...args);
        }

        switch (action.type) {
          case "return":
            return action.value;
          case "resolve":
            return Promise.resolve(action.value);
          case "reject":
            return Promise.reject(action.value);
          case "throw":
            throw action.value;
          case "implementation":
            return (action.value as (...callArgs: unknown[]) => unknown)(...args);
          default:
            return undefined;
        }
      });
    }

    return plan;
  }

  if (typeof prototype.onCall !== "function") {
    defineMethod("onCall", function (this: unknown, index: number) {
      const instance = asMockInstance(this);
      const plan = ensureOnCallPlan(instance);
      const setAction = (
        type: "return" | "resolve" | "reject" | "throw" | "implementation",
        value: unknown
      ) => {
        plan.actions.set(index, { type, value });
        return instance;
      };

      return {
        mockReturnValue: (value: unknown) => setAction("return", value),
        mockResolvedValue: (value: unknown) => setAction("resolve", value),
        mockRejectedValue: (value: unknown) => setAction("reject", value),
        mockImplementation: (impl: (...args: unknown[]) => unknown) =>
          setAction("implementation", impl),
        returns: (value: unknown) => setAction("return", value),
        resolves: (value: unknown) => setAction("resolve", value),
        rejects: (value: unknown) => setAction("reject", value),
        throws: (error: unknown) => setAction("throw", error),
      };
    });
  }

  if (typeof prototype.onFirstCall !== "function") {
    defineMethod("onFirstCall", function (this: unknown) {
      return asMockInstance(this).onCall(0);
    });
  }

  if (typeof prototype.onSecondCall !== "function") {
    defineMethod("onSecondCall", function (this: unknown) {
      return asMockInstance(this).onCall(1);
    });
  }

  if (typeof prototype.onThirdCall !== "function") {
    defineMethod("onThirdCall", function (this: unknown) {
      return asMockInstance(this).onCall(2);
    });
  }

  if (typeof prototype.withArgs !== "function") {
    defineMethod("withArgs", function (this: unknown, ...expected: unknown[]) {
      const instance = asMockInstance(this);
      ensureOnCallPlan(instance);
      const registrations = argPlans.get(instance) ?? [];
      argPlans.set(instance, registrations);
      const setAction = (
        type: "return" | "resolve" | "reject" | "throw" | "implementation",
        value: unknown
      ) => {
        registrations.push({ expected, action: { type, value } });
        return instance;
      };

      return {
        mockReturnValue: (value: unknown) => setAction("return", value),
        mockResolvedValue: (value: unknown) => setAction("resolve", value),
        mockRejectedValue: (value: unknown) => setAction("reject", value),
        mockImplementation: (impl: (...args: unknown[]) => unknown) =>
          setAction("implementation", impl),
        returns: (value: unknown) => setAction("return", value),
        resolves: (value: unknown) => setAction("resolve", value),
        rejects: (value: unknown) => setAction("reject", value),
        throws: (error: unknown) => setAction("throw", error),
      };
    });
  }

  if (typeof prototype.reset !== "function") {
    defineMethod("reset", function (this: unknown) {
      asMockInstance(this).mockClear();
      return asMockInstance(this);
    });
  }

  if (typeof prototype.yields !== "function") {
    defineMethod("yields", function (this: unknown, ...values: unknown[]) {
      const instance = asMockInstance(this);
      instance.mockImplementation((...args: unknown[]) => {
        const callback = [...args].reverse().find((arg) => typeof arg === "function");
        if (callback) {
          return (callback as (...callbackArgs: unknown[]) => unknown)(...values);
        }
        return undefined;
      });
      return instance;
    });
  }

  if (typeof prototype.throws !== "function") {
    defineMethod("throws", function (this: unknown, error: unknown) {
      const instance = asMockInstance(this);
      instance.mockImplementation(() => {
        throw error;
      });
      return instance;
    });
  }

  if (typeof prototype.restore !== "function") {
    defineMethod("restore", function (this: unknown) {
      const instance = asMockInstance(this);
      if (typeof instance.mockRestore === "function") {
        instance.mockRestore();
        return;
      }
      instance.mockReset();
    });
  }
}

export function createMock<T extends object>(): Mocked<T> {
  const values = new Map<PropertyKey, unknown>();

  return new Proxy({} as T, {
    get: (_target, property) => {
      if (!values.has(property)) {
        values.set(property, vi.fn());
      }
      return values.get(property);
    },
    set: (_target, property, value) => {
      values.set(property, value);
      return true;
    },
  }) as Mocked<T>;
}

export function mockValue<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K]
): void {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);

  valueRestorers.push(() => {
    if (descriptor) {
      Object.defineProperty(target, key, descriptor);
    } else {
      delete target[key];
    }
  });

  Object.defineProperty(target, key, {
    configurable: true,
    writable: true,
    value,
  });
}

export function restoreMockValues(): void {
  while (valueRestorers.length > 0) {
    const restore = valueRestorers.pop();
    restore?.();
  }
}

export function installVitestMockCompat(): void {
  ensureMockCompat();
  const createValueStub = (target: Record<PropertyKey, unknown>, key: PropertyKey) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    const setValue = (newValue: unknown) => {
      mockValue(target, key as never, newValue as never);
      return stub;
    };
    const stub = {
      value: (newValue: unknown) => setValue(newValue),
      mockReturnValue: (newValue: unknown) => setValue(newValue),
      mockResolvedValue: (newValue: unknown) => setValue(newValue),
      mockRejectedValue: (newValue: unknown) => setValue(Promise.reject(newValue)),
      mockImplementation: (impl: (...args: unknown[]) => unknown) => setValue(impl),
      returns: (newValue: unknown) => setValue(newValue),
      resolves: (newValue: unknown) => setValue(newValue),
      rejects: (newValue: unknown) => setValue(Promise.reject(newValue)),
      throws: (error: unknown) =>
        setValue(() => {
          throw error;
        }),
      get: (getter: () => unknown) => {
        valueRestorers.push(() => {
          if (descriptor) {
            Object.defineProperty(target, key, descriptor);
          } else {
            delete target[key];
          }
        });
        Object.defineProperty(target, key, {
          configurable: true,
          get: getter,
          set: descriptor?.set,
        });
        return stub;
      },
      set: (setter: (value: unknown) => void) => {
        valueRestorers.push(() => {
          if (descriptor) {
            Object.defineProperty(target, key, descriptor);
          } else {
            delete target[key];
          }
        });
        Object.defineProperty(target, key, {
          configurable: true,
          get: descriptor?.get,
          set: setter,
        });
        return stub;
      },
    };
    return stub;
  };
  (vi.spyOn as unknown as (...args: unknown[]) => unknown) = (
    target: Record<PropertyKey, unknown> | null | undefined,
    key: PropertyKey,
    accessType?: "get" | "set"
  ) => {
    if (!target) {
      return vi.fn();
    }

    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    const currentValue = target[key];
    const isCallable = typeof currentValue === "function";
    const hasAccessor = Boolean(descriptor?.get || descriptor?.set);

    if (accessType || isCallable || hasAccessor) {
      try {
        return originalSpyOn(target as never, key as never, accessType as never);
      } catch (error) {
        if (!accessType) {
          return createValueStub(target, key);
        }

        throw error;
      }
    }

    return createValueStub(target, key);
  };
  (vi.useFakeTimers as unknown as (...args: unknown[]) => unknown) = (...args: unknown[]) => {
    originalUseFakeTimers(...args);
    return {
      Date,
      tick: (ms: number) => {
        vi.advanceTimersByTime(ms);
      },
      tickAsync: async (ms: number) => {
        await vi.advanceTimersByTimeAsync(ms);
      },
      restore: () => {
        vi.useRealTimers();
      },
    };
  };
}
