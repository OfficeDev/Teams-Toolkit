// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * @author Siglud <siglud@gmail.com>
 */
import { BaseComponentInnerError } from "../../../src/component/error/componentError";
import { SystemError, UserError } from "@microsoft/teamsfx-api";
import { chai } from "vitest";

describe("BaseComponentInnerError", () => {
  describe("constructor", () => {
    it("should create a new BaseComponentInnerError with the correct properties", () => {
      const source = "test";
      const errorType = "UserError";
      const name = "TestError";
      const messageKey = "test.message";
      const messageParams = ["param1", "param2"];
      const suggestionKey = ["test.suggestion"];
      const detail = "Test error detail.";
      const helpLink = "https://example.com/help";
      const innerError = new Error("Inner error message.");
      const error = new BaseComponentInnerError(
        source,
        errorType,
        name,
        messageKey,
        messageParams,
        suggestionKey,
        detail,
        helpLink,
        innerError
      );
      chai.expect(error).to.be.instanceOf(Error);
      chai.expect(error).to.be.instanceOf(BaseComponentInnerError);
      chai.expect(error.source).to.equal(source);
      chai.expect(error.errorType).to.equal(errorType);
      chai.expect(error.name).to.equal(name);
      chai.expect(error.innerError).to.equal(innerError);
    });

    it("should create a new BaseComponentInnerError with the correct properties when messageKey is not provided", () => {
      const source = "test";
      const errorType = "UserError";
      const name = "TestError";
      const suggestionKey = ["test.suggestion"];
      const detail = "Test error detail.";
      const helpLink = "https://example.com/help";
      const error = new BaseComponentInnerError(
        source,
        errorType,
        name,
        undefined,
        undefined,
        suggestionKey,
        detail,
        helpLink,
        undefined
      );
      chai.expect(error).to.be.instanceOf(Error);
      chai.expect(error).to.be.instanceOf(BaseComponentInnerError);
      chai.expect(error.source).to.equal(source);
      chai.expect(error.errorType).to.equal(errorType);
      chai.expect(error.name).to.equal(name);
      chai.expect(error.displayMessage).to.equal("");
      chai.expect(error.suggestionKey).to.deep.equal(suggestionKey);
      chai.expect(error.detail).to.equal(detail);
      chai.expect(error.helpLink).to.equal(helpLink);
      chai.expect(error.innerError).to.equal(undefined);
    });

    it("should create a new BaseComponentInnerError with the correct properties when suggestionKey is not provided", () => {
      const source = "test";
      const errorType = "UserError";
      const name = "TestError";
      const messageKey = "test.message";
      const messageParams = ["param1", "param2"];
      const detail = "Test error detail.";
      const helpLink = "https://example.com/help";
      const innerError = new Error("Inner error message.");
      const error = new BaseComponentInnerError(
        source,
        errorType,
        name,
        messageKey,
        messageParams,
        undefined,
        detail,
        helpLink,
        innerError
      );
      chai.expect(error).to.be.instanceOf(Error);
      chai.expect(error).to.be.instanceOf(BaseComponentInnerError);
      chai.expect(error.source).to.equal(source);
      chai.expect(error.errorType).to.equal(errorType);
      chai.expect(error.name).to.equal(name);
      chai.expect(error.suggestionKey).to.be.undefined;
      chai.expect(error.detail).to.equal(detail);
      chai.expect(error.helpLink).to.equal(helpLink);
      chai.expect(error.innerError).to.equal(innerError);
    });

    it("should create a new BaseComponentInnerError with the correct properties when detail is not provided", () => {
      const source = "test";
      const errorType = "UserError";
      const name = "TestError";
      const messageKey = "test.message";
      const messageParams = ["param1", "param2"];
      const suggestionKey = ["test.suggestion"];
      const helpLink = "https://example.com/help";
      const innerError = new Error("Inner error message.");
      const error = new BaseComponentInnerError(
        source,
        errorType,
        name,
        messageKey,
        messageParams,
        suggestionKey,
        undefined,
        helpLink,
        innerError
      );
      chai.expect(error).to.be.instanceOf(Error);
      chai.expect(error).to.be.instanceOf(BaseComponentInnerError);
      chai.expect(error.source).to.equal(source);
      chai.expect(error.errorType).to.equal(errorType);
      chai.expect(error.name).to.equal(name);
      chai.expect(error.message).to.equal("");
      chai.expect(error.suggestionKey).to.deep.equal(suggestionKey);
      chai.expect(error.detail).to.be.undefined;
      chai.expect(error.helpLink).to.equal(helpLink);
      chai.expect(error.innerError).to.equal(innerError);
    });

    it("should create a new BaseComponentInnerError with the correct properties when innerError is not provided", () => {
      const source = "test";
      const errorType = "UserError";
      const name = "TestError";
      const messageKey = "test.message";
      const messageParams = ["param1", "param2"];
      const suggestionKey = ["test.suggestion"];
      const detail = "Test error detail.";
      const helpLink = "https://example.com/help";
      const error = new BaseComponentInnerError(
        source,
        errorType,
        name,
        messageKey,
        messageParams,
        suggestionKey,
        detail,
        helpLink
      );
      chai.expect(error).to.be.instanceOf(Error);
      chai.expect(error).to.be.instanceOf(BaseComponentInnerError);
      chai.expect(error.source).to.equal(source);
      chai.expect(error.errorType).to.equal(errorType);
      chai.expect(error.name).to.equal(name);
      chai.expect(error.suggestionKey).to.deep.equal(suggestionKey);
      chai.expect(error.detail).to.equal(detail);
      chai.expect(error.helpLink).to.equal(helpLink);
      chai.expect(error.innerError).to.be.undefined;
    });
  });

  describe("toFxError", () => {
    it("should return a new UserError with the correct properties when errorType is UserError", () => {
      const source = "test";
      const errorType = "UserError";
      const name = "TestError";
      const messageKey = "test.message";
      const messageParams = ["param1", "param2"];
      const suggestionKey = ["test.suggestion"];
      const detail = "Test error detail.";
      const helpLink = "https://example.com/help";
      const innerError = new Error("Inner error message.");
      const error = new BaseComponentInnerError(
        source,
        errorType,
        name,
        messageKey,
        messageParams,
        suggestionKey,
        detail,
        helpLink,
        innerError
      );
      const fxError = error.toFxError();
      chai.expect(fxError).to.be.instanceOf(Error);
      chai.expect(fxError).to.be.instanceOf(UserError);
      chai.expect(fxError.source).to.equal(source);
      chai.expect(fxError.name).to.equal(name);
      chai.expect(fxError.message).to.equal("Inner error message.");
    });

    it("should return a new SystemError with the correct properties when errorType is SystemError", () => {
      const source = "test";
      const errorType = "SystemError";
      const name = "TestError";
      const messageKey = "test.message";
      const messageParams = ["param1", "param2"];
      const suggestionKey = ["test.suggestion"];
      const detail = "Test error detail.";
      const helpLink = "https://example.com/help";
      const error = new BaseComponentInnerError(
        source,
        errorType,
        name,
        messageKey,
        messageParams,
        suggestionKey,
        detail,
        helpLink,
        undefined
      );
      const fxError = error.toFxError();
      chai.expect(fxError).to.be.instanceOf(Error);
      chai.expect(fxError).to.be.instanceOf(SystemError);
      chai.expect(fxError.source).to.equal(source);
      chai.expect(fxError.name).to.equal(name);
      chai.expect(fxError.innerError).to.equal(error);
    });
  });

  it("unknown error type should throw", () => {
    const error = BaseComponentInnerError.unknownError("test", "unknownErrorType");
    chai.expect(error).to.be.instanceOf(BaseComponentInnerError);
    chai.expect(error.source).to.equal("test");
    chai.expect(error.errorType).to.equal("SystemError");
    chai.expect(error.name).to.equal("UnhandledError");
    chai.expect(error.innerError).to.be.undefined;
  });
});
