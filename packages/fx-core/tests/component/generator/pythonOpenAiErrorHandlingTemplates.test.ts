// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs";
import * as path from "path";
import { assert } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../../../..");

function readTemplate(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

describe("Python OpenAI error handling templates", () => {
  it("wraps custom api prompt.send in a catch that prevents a 500 response", () => {
    const app = readTemplate(
      "templates/vsc/python/teams-agent-with-data-custom-api-v2/src/app.py.tpl"
    );

    assert.match(
      app,
      /try:\s+chat_result = await prompt\.send\([\s\S]+except Exception as e:\s+print\(f"Error sending chat prompt: \{e\}"\)\s+await ctx\.send\(MessageActivityInput\(text="An error occurred while processing your request\."\)\)\s+return/
    );
  });

  it("wraps Azure AI Search data fetch and prompt.send in the same catch block", () => {
    const app = readTemplate(
      "templates/vsc/python/custom-copilot-rag-azure-ai-search/src/app.py.tpl"
    );

    assert.match(
      app,
      /try:\s+data_context = await azure_ai_search\.render_data\(input\)[\s\S]+chat_result = await chat_prompt\.send\([\s\S]+except Exception as e:\s+print\(f"Error sending chat prompt: \{e\}"\)\s+await ctx\.send\(MessageActivityInput\(text="An error occurred while processing your request\."\)\)\s+return/
    );
  });
});
