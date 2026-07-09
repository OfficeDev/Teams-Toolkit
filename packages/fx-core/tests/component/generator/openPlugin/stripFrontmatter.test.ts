// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { stripDisallowedFrontmatter } from "../../../../src/component/generator/openPlugin/importer";
import { chai } from "vitest";

describe("stripDisallowedFrontmatter", () => {
  it("removes Claude-specific keys and preserves allowed ones + body", () => {
    const src = `---
name: memory-management
description: A skill.
user-invocable: false
argument-hint: "[--flag]"
---

# Body

Hello.
`;
    const { content, removedKeys } = stripDisallowedFrontmatter(src);
    chai.expect(removedKeys).to.deep.equal(["user-invocable", "argument-hint"]);
    chai.expect(content).to.include("name: memory-management");
    chai.expect(content).to.include("description: A skill.");
    chai.expect(content).to.not.include("user-invocable");
    chai.expect(content).to.not.include("argument-hint");
    chai.expect(content).to.include("# Body");
    chai.expect(content).to.include("Hello.");
  });

  it("returns input unchanged when there is no frontmatter", () => {
    const src = "# Just markdown\n\nNo frontmatter here.\n";
    const { content, removedKeys } = stripDisallowedFrontmatter(src);
    chai.expect(removedKeys).to.deep.equal([]);
    chai.expect(content).to.equal(src);
  });

  it("returns input unchanged when every key is allowed", () => {
    const src = `---
name: ok
description: ok
---
body
`;
    const { content, removedKeys } = stripDisallowedFrontmatter(src);
    chai.expect(removedKeys).to.deep.equal([]);
    chai.expect(content).to.equal(src);
  });

  it("preserves nested objects under an allowed key (metadata)", () => {
    const src = `---
name: ok
metadata:
  version: 1
  tags:
    - a
    - b
forbidden: drop
---
body
`;
    const { content, removedKeys } = stripDisallowedFrontmatter(src);
    chai.expect(removedKeys).to.deep.equal(["forbidden"]);
    chai.expect(content).to.include("metadata:");
    chai.expect(content).to.include("version: 1");
    chai.expect(content).to.include("- a");
    chai.expect(content).to.not.include("forbidden");
  });
});
