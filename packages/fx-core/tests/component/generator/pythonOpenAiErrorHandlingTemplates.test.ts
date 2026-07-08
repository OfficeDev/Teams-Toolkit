// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "../../../../..");

function readTemplate(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function assertContainsInOrder(text: string, parts: string[]): void {
  let previousIndex = -1;

  for (const part of parts) {
    const currentIndex = text.indexOf(part, previousIndex + 1);
    assert.isAtLeast(currentIndex, 0, `expected template to include '${part}'`);
    assert.isAbove(
      currentIndex,
      previousIndex,
      `expected '${part}' to appear after the prior step`
    );
    previousIndex = currentIndex;
  }
}

describe("Python OpenAI error handling templates", () => {
  it("wraps custom api prompt.send in a catch that prevents a 500 response", () => {
    const app = readTemplate(
      "templates/vsc/python/teams-agent-with-data-custom-api-v2/src/app.py.tpl"
    );

    assert.include(app, "from openai import OpenAIError");
    assertContainsInOrder(app, [
      "try:",
      "chat_result = await prompt.send(",
      "except OpenAIError as e:",
      'print(f"Error sending chat prompt: {e}")',
      'await ctx.send(MessageActivityInput(text="An error occurred while processing your request."))',
      "return",
    ]);
  });

  it("wraps Azure AI Search data fetch and prompt.send in the same catch block", () => {
    const app = readTemplate(
      "templates/vsc/python/custom-copilot-rag-azure-ai-search/src/app.py.tpl"
    );

    assert.include(app, "from openai import OpenAIError");
    assertContainsInOrder(app, [
      "try:",
      "data_context = await azure_ai_search.render_data(input)",
      "chat_result = await chat_prompt.send(",
      "except OpenAIError as e:",
      'print(f"Error sending chat prompt: {e}")',
      'await ctx.send(MessageActivityInput(text="An error occurred while processing your request."))',
      "return",
    ]);
  });
});
