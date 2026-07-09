// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs";
import * as path from "path";
import { assert } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../../../..");
const TEMPLATES_V4_ROOT = path.join(REPO_ROOT, "templates/v4");

function listFiles(root: string, matches: (name: string) => boolean): string[] {
  const result: string[] = [];
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, name);
      if (fs.statSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else if (matches(name)) {
        result.push(fullPath);
      }
    }
  };
  walk(root);
  return result.sort();
}

function localSchemaReferences(filePath: string): string[] {
  const text = fs.readFileSync(filePath, "utf8");
  const refs: string[] = [];
  for (const match of text.matchAll(/"\$schema"\s*:\s*"([^"]+)"/g)) {
    const ref = match[1];
    if (ref.startsWith(".")) {
      refs.push(ref);
    }
  }
  return refs;
}

describe("v4 schema references", () => {
  it("every local $schema reference resolves to an existing schema file", () => {
    const schemaReferenceFiles = listFiles(
      TEMPLATES_V4_ROOT,
      (name) => name.endsWith(".json") || name.endsWith(".json.tpl") || name.endsWith(".tour")
    );

    for (const filePath of schemaReferenceFiles) {
      for (const schemaRef of localSchemaReferences(filePath)) {
        const schemaPath = schemaRef.split("#")[0];
        const resolved = path.resolve(path.dirname(filePath), schemaPath);
        assert.isTrue(
          fs.existsSync(resolved),
          `${path.relative(REPO_ROOT, filePath).replace(/\\/g, "/")} $schema '${schemaRef}' must resolve to an existing file`
        );
      }
    }
  });
});
