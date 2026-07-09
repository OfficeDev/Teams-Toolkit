// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { chai } from "vitest";
import {
  toTitleCaseFromKebab,
  truncateAtWordBoundary,
} from "../../../../src/component/generator/openPlugin/textUtils";

describe("openPlugin.textUtils", () => {
  describe("truncateAtWordBoundary", () => {
    it("returns text unchanged when within length", () => {
      chai.expect(truncateAtWordBoundary("short", 10)).to.equal("short");
    });

    it("cuts on whitespace when boundary lands at a space", () => {
      // length 12 -> char at idx 12 is ' '
      chai.expect(truncateAtWordBoundary("the quick brown fox", 9)).to.equal("the quick");
    });

    it("backs up to the last space when mid-word and past 50% mark", () => {
      // "the quick brown fox" length 19, maxLength 13 -> truncated "the quick bro"
      // last space is at index 9 (which is > 6.5)
      chai.expect(truncateAtWordBoundary("the quick brown fox", 13)).to.equal("the quick");
    });

    it("falls back to hard cut when no usable boundary", () => {
      // single long word with no space within first 50% of cut
      chai.expect(truncateAtWordBoundary("aaaaaaaabcdefghij", 6)).to.equal("aaaaaa");
    });

    it("returns empty for falsy input", () => {
      chai.expect(truncateAtWordBoundary(undefined, 5)).to.equal("");
      chai.expect(truncateAtWordBoundary("", 5)).to.equal("");
    });
  });

  describe("toTitleCaseFromKebab", () => {
    it("title-cases each segment", () => {
      chai.expect(toTitleCaseFromKebab("code-review")).to.equal("Code Review");
    });

    it("handles single word", () => {
      chai.expect(toTitleCaseFromKebab("hello")).to.equal("Hello");
    });

    it("collapses empty segments from stray dashes", () => {
      chai.expect(toTitleCaseFromKebab("a--b")).to.equal("A B");
    });

    it("returns empty for empty input", () => {
      chai.expect(toTitleCaseFromKebab("")).to.equal("");
      chai.expect(toTitleCaseFromKebab(undefined)).to.equal("");
    });
  });
});
