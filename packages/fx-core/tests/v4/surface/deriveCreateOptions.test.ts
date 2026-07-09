// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CLICommandOption } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import path from "path";
import { deriveCreateOptions } from "../../../src/v4/surface/deriveCreateOptions";
import { assert } from "vitest";

/**
 * Tests for docs/03-specs/operations/scaffolding/derive-cli-options.md.
 * The floor is built from loose templates/v4 source so the real selector and
 * migrated v4 packages drive the derived CLI surface.
 */

const TEMPLATES_V4_DIR = path.resolve(__dirname, "../../../../../templates/v4");

let cachedFloor: Buffer | undefined;

function buildFloor(): Buffer {
  if (cachedFloor !== undefined) {
    return Buffer.from(cachedFloor);
  }
  const zip = new AdmZip();
  zip.addLocalFolder(TEMPLATES_V4_DIR, "v4");
  cachedFloor = zip.toBuffer();
  return Buffer.from(cachedFloor);
}

function buildSyntheticDuplicateFloor(): Buffer {
  const zip = new AdmZip();
  zip.addFile(
    "v4/create/selector.json",
    Buffer.from(
      JSON.stringify({
        questions: [{ name: "projectType", staticOptions: [{ id: "test", label: "Test" }] }],
        routes: [],
      })
    )
  );
  zip.addFile(
    "v4/create/one/questions.json",
    Buffer.from(
      JSON.stringify({
        questions: [
          {
            name: "authType",
            type: "singleSelect",
            title: "Authentication",
            staticOptions: [{ id: "oauth", label: "OAuth" }],
          },
        ],
      })
    )
  );
  zip.addFile(
    "v4/create/two/questions.json",
    Buffer.from(
      JSON.stringify({
        questions: [
          {
            name: "authType",
            type: "singleSelect",
            title: "Authentication",
            staticOptions: [{ id: "entra-sso", label: "Entra SSO" }],
          },
        ],
      })
    )
  );
  return zip.toBuffer();
}

function optionByName(options: CLICommandOption[], name: string): CLICommandOption | undefined {
  return options.find((option) => option.name === name);
}

function choicesOf(option: CLICommandOption | undefined): string[] {
  if (option === undefined || option.type === "boolean") {
    return [];
  }
  return option.choices ?? [];
}

function defaultOf(option: CLICommandOption | undefined): string | undefined {
  return option?.type === "string" ? option.default : undefined;
}

function skipValidationOf(option: CLICommandOption | undefined): boolean | undefined {
  return option !== undefined && option.type !== "boolean" ? option.skipValidation : undefined;
}

const GENERIC_OPTIONS: CLICommandOption[] = [
  {
    name: "app-name",
    type: "string",
    shortName: "n",
    description: "Application Name",
  },
  {
    name: "folder",
    type: "string",
    shortName: "f",
    description: "Directory where the project folder will be created in.",
    default: "./",
  },
  {
    name: "programming-language",
    questionName: "language",
    type: "string",
    shortName: "l",
    description: "Programming Language",
  },
];

describe("deriveCreateOptions", () => {
  it("DCO-01: derives Q1 selector dimensions as kebab flags with neutral question names", () => {
    const res = deriveCreateOptions(buildFloor(), GENERIC_OPTIONS);

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      const projectType = optionByName(res.value, "project-type");
      assert.equal(projectType?.questionName, "projectType");
      assert.equal(projectType?.type, "string");
      assert.isFalse(projectType?.required);
      assert.isTrue(choicesOf(projectType).includes("copilot-agent-type"));

      const daTemplate = optionByName(res.value, "da-template");
      assert.equal(daTemplate?.questionName, "daTemplate");
      assert.isTrue(choicesOf(daTemplate).includes("add-action"));
    }
  });

  it("DCO-02/DCO-07: derives migrated v4 Q2 questions, preserving dynamic-provider semantics", () => {
    const res = deriveCreateOptions(buildFloor(), GENERIC_OPTIONS);

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      const mcpServerType = optionByName(res.value, "mcp-server-type");
      assert.equal(mcpServerType?.questionName, "mcpServerType");
      assert.equal(mcpServerType?.type, "string");
      assert.equal(defaultOf(mcpServerType), "remote");
      assert.isTrue(skipValidationOf(mcpServerType));
      assert.isEmpty(choicesOf(mcpServerType));

      const mcpServerUrl = optionByName(res.value, "mcp-server-url");
      assert.equal(mcpServerUrl?.questionName, "mcpServerUrl");
      assert.equal(mcpServerUrl?.type, "string");

      const authType = optionByName(res.value, "auth-type");
      assert.equal(authType?.questionName, "authType");
      assert.includeMembers(choicesOf(authType), ["oauth", "oauth-dynamic", "entra-sso", "none"]);
    }
  });

  it("DCO-03/DCO-06: appends generic Q3 options and maps multi-select questions to array options", () => {
    const res = deriveCreateOptions(buildFloor(), GENERIC_OPTIONS);

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(optionByName(res.value, "app-name")?.shortName, "n");
      assert.equal(optionByName(res.value, "folder")?.shortName, "f");
      assert.equal(optionByName(res.value, "programming-language")?.shortName, "l");

      const apiOperations = optionByName(res.value, "api-operations");
      assert.equal(apiOperations?.questionName, "apiOperations");
      assert.equal(apiOperations?.type, "array");
      assert.isTrue(skipValidationOf(apiOperations));

      const openApiSpecType = optionByName(res.value, "open-api-spec-type");
      assert.includeMembers(choicesOf(openApiSpecType), ["enter-url", "open-file", "search-api"]);

      const apiSpecLocation = optionByName(res.value, "api-spec-location");
      assert.equal(apiSpecLocation?.shortName, "a");
    }
  });

  it("DCO-08: deriving options is deterministic for the same floor and generic set", () => {
    const one = deriveCreateOptions(buildFloor(), GENERIC_OPTIONS);
    const two = deriveCreateOptions(buildFloor(), GENERIC_OPTIONS);

    assert.isTrue(one.isOk());
    assert.isTrue(two.isOk());
    if (one.isOk() && two.isOk()) {
      assert.deepEqual(one.value, two.value);
    }
  });

  it("DCO-04: merges duplicate Q2 questions by unioning static choices", () => {
    const res = deriveCreateOptions(buildSyntheticDuplicateFloor(), []);

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      const authType = optionByName(res.value, "auth-type");
      assert.equal(authType?.questionName, "authType");
      assert.sameMembers(choicesOf(authType), ["oauth", "entra-sso"]);
    }
  });

  it("DCO-10/DCO-11: covers real selector and migrated package questions without static required flags", () => {
    const res = deriveCreateOptions(buildFloor(), GENERIC_OPTIONS);

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      for (const name of [
        "project-type",
        "da-template",
        "action-source",
        "api-auth",
        "mcp-server-type",
        "mcp-server-url",
        "auth-type",
        "api-spec-location",
        "api-operations",
        "app-name",
        "folder",
        "programming-language",
      ]) {
        assert.isDefined(optionByName(res.value, name), name);
      }
      for (const option of res.value) {
        assert.notEqual(option.required, true, option.name);
      }
    }
  });
});
