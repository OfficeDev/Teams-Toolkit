// Please don't edit. This file is copied from packages/failpoint-ts/src
// We don't want failpoint-ts to be a package.json dependency.
// We tried to soft link the code, and it works well on linux. However, soft-linked git files don't naturally work on Windows.

import { Value } from "./marker";

export const ENV_VAR_NAME = "TEAMSFX_FAILPOINTS";

/**
 * Checks whether a failpoint is activated.
 *
 * @param failpointName
 * @returns failpoint value if the failpoint identifed by failpointName is activated.
 *          Returns undefined otherwise.
 */
export function evaluate(failpointName: string): Value | undefined {
  const env = process.env[ENV_VAR_NAME];
  if (!env) {
    return undefined;
  }

  if (FAILPOINT_VALUE_CACHE.has(failpointName)) {
    return FAILPOINT_VALUE_CACHE.get(failpointName);
  }

  const vars = env.split(";");

  const found = vars.find((v) => v.startsWith(failpointName));
  if (!found) {
    return undefined;
  }

  const value: Value | undefined = parseValue(failpointName, found);
  FAILPOINT_VALUE_CACHE.set(failpointName, value);
  return value;
}

const FAILPOINT_VALUE_CACHE: Map<string, Value | undefined> = new Map();

export function clearFailpointCache() {
  FAILPOINT_VALUE_CACHE.clear();
}

// The value will be in form FAILPOINT_NAME=1|true|false|"string" or simply FAILPOINT_NAME,
// which is equivalent to FAILPOINT_NAME=true
function parseValue(name: string, term: string): Value | undefined {
  if (name === term) {
    return { kind: "boolean", value: true };
  }

  const prefix = `${name}=`;

  if (!term.startsWith(prefix) || term.length <= prefix.length) {
    throw new Error(`invalid syntax(${term}) for failpoint ${name}`);
  }

  const value = term.substring(prefix.length);
  // We just need look ahead once to determine whether the value is a number, a boolean or a string.
  if (/^-?\d*$/.test(value)) {
    const result = parseInt(value);
    if (isNaN(result)) {
      throw new Error(`invalid syntax(${term}) for failpoint ${name}. Not a number.`);
    }
    return { kind: "number", value: result };
  } else if (value[0] == "\"" && value.length >= 2 && value[value.length - 1] == "\"") {
    return { kind: "string", value: value.substring(1, value.length - 1) };
  } else if (value === "true" || value === "false") {
    const result: boolean = value === "true";
    return { kind: "boolean", value: result };
  } else {
    throw new Error(`invalid syntax(${term}) for failpoint ${name}`);
  }
}
