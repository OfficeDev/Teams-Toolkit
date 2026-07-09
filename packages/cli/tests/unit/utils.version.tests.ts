// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import { expect } from "./utils";
import { vi } from "vitest";
const sandbox = vi;

beforeEach(() => {
  vi.spyOn(fs, "readJsonSync").mockReturnValue({ version: "2.0.0" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("getVersion", async () => {
  const utils = require("../../src/utils");
  utils.version = undefined;
  const version = utils.getVersion();
  expect(version).equals("2.0.0");
});
