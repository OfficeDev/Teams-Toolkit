// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { parseAuthor } from "../../../../src/component/generator/openPlugin/authorParser";
import { chai } from "vitest";

describe("openPlugin.parseAuthor", () => {
  it("returns empty for null / undefined", () => {
    chai.expect(parseAuthor(undefined)).to.deep.equal({});
    chai.expect(parseAuthor(null)).to.deep.equal({});
  });

  it("parses 'Name <email> (url)' form", () => {
    chai.expect(parseAuthor("Jane Doe <jane@example.com> (https://example.com)")).to.deep.equal({
      name: "Jane Doe",
      email: "jane@example.com",
      url: "https://example.com",
    });
  });

  it("parses 'Name <email>' form", () => {
    chai.expect(parseAuthor("Jane Doe <jane@example.com>")).to.deep.equal({
      name: "Jane Doe",
      email: "jane@example.com",
    });
  });

  it("parses 'Name (url)' form", () => {
    chai.expect(parseAuthor("Jane Doe (https://example.com)")).to.deep.equal({
      name: "Jane Doe",
      url: "https://example.com",
    });
  });

  it("parses bare name", () => {
    chai.expect(parseAuthor("Jane Doe")).to.deep.equal({ name: "Jane Doe" });
  });

  it("parses object form", () => {
    chai
      .expect(parseAuthor({ name: "Jane", email: "jane@example.com", url: "https://example.com" }))
      .to.deep.equal({
        name: "Jane",
        email: "jane@example.com",
        url: "https://example.com",
      });
  });

  it("ignores non-string fields on object form", () => {
    chai.expect(parseAuthor({ name: 42 as unknown as string })).to.deep.equal({});
  });
});
