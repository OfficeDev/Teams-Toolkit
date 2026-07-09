// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Aocheng Wang <aochengwang@microsoft.com>
 */

import { LogProvider } from "@microsoft/teamsfx-api";
import { CoreDepsLoggerAdapter } from "../../../src/component/deps-checker/coreDepsLoggerAdapter";
import { chai, vi } from "vitest";

describe("CoreDepsLoggerAdapter", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("append", () => {
    // Arrange
    let text = "";
    const stub = vi.fn().mockImplementation((_level, _text: string) => (text = _text));
    const logProvider = { log: stub } as any as LogProvider;

    // Act
    const adapter = new CoreDepsLoggerAdapter(logProvider);
    adapter.append("test");

    // Assert
    chai.assert.match(text, /test/);
  });

  it("appendLine", () => {
    // Arrange
    let text = "";
    const stub = vi.fn().mockImplementation((_level, _text: string) => (text = _text));
    const logProvider = { log: stub } as any as LogProvider;

    // Act
    const adapter = new CoreDepsLoggerAdapter(logProvider);
    adapter.appendLine("test");

    // Assert
    chai.assert.match(text, /test/);
  });

  it("error", () => {
    // Arrange
    let text = "";
    const stub = vi.fn().mockImplementation((_text: string) => (text = _text));
    const logProvider = { error: stub } as any as LogProvider;

    // Act
    const adapter = new CoreDepsLoggerAdapter(logProvider);
    adapter.error("test");

    // Assert
    chai.assert.match(text, /test/);
  });

  it("info", () => {
    // Arrange
    let text = "";
    const stub = vi.fn().mockImplementation((_text: string) => (text = _text));
    const logProvider = { info: stub } as any as LogProvider;

    // Act
    const adapter = new CoreDepsLoggerAdapter(logProvider);
    adapter.info("test");

    // Assert
    chai.assert.match(text, /test/);
  });

  it("warning", () => {
    // Arrange
    let text = "";
    const stub = vi.fn().mockImplementation((_text: string) => (text = _text));
    const logProvider = { warning: stub } as any as LogProvider;

    // Act
    const adapter = new CoreDepsLoggerAdapter(logProvider);
    adapter.warning("test");

    // Assert
    chai.assert.match(text, /test/);
  });

  it("debug", () => {
    // Arrange
    let text = "";
    const stub = vi.fn().mockImplementation((_text: string) => (text = _text));
    const logProvider = { error: stub } as any as LogProvider;

    // Act
    const adapter = new CoreDepsLoggerAdapter(logProvider);
    adapter.debug("error");
    adapter.printDetailLog();

    // Assert
    chai.assert.match(text, /error/);
  });
});
