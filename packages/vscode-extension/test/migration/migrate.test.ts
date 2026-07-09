import { assert } from "vitest";
import path from "path";
import fs from "fs-extra";
import transformJs from "../../src/migration/migrationTool/replaceSDK";
import transformTs from "../../src/migration/migrationTool/ts/replaceTsSDK";

const testUtils = require("jscodeshift/dist/testUtils");
const jsTestList: Set<string> = new Set<string>();
const tsTestList: Set<string> = new Set<string>();

const jsFixtureDir = path.join(__dirname, "data", "js");
getTestName(jsFixtureDir, jsFixtureDir, jsTestList);
const tsFixtureDir = path.join(__dirname, "data", "ts");
getTestName(tsFixtureDir, tsFixtureDir, tsTestList);
//const tsTestList = new Array(...tsTestList1).slice(0, 2);
//tsTestList.add("interface\\import-single-export\\ts-type-reference\\replace-taskInfo");

describe("Migrate", async () => {
  jsTestList.forEach((testName) => {
    it(`JS Migrate ${testName}`, async () => {
      const fixtureDir = path.join(__dirname, "data", "js");
      const inputPath = path.join(fixtureDir, testName + ".input.js");
      const source = fs.readFileSync(inputPath, "utf8");
      const expectedOutput = fs.readFileSync(
        path.join(fixtureDir, testName + ".output.js"),
        "utf8"
      );

      const output = testUtils.applyTransform(
        transformJs,
        { lineTerminator: "\n" },
        {
          path: inputPath,
          source,
        },
        { parser: "js" }
      );
      assert.equal(output, normalizeLineEnds(expectedOutput).trimEnd());
    });
  });

  // TODO: Add more ts test case
  tsTestList.forEach((testName) => {
    it(`TS Migrate ${testName}`, function () {
      const fixtureDir = path.join(__dirname, "data", "ts");
      const inputPath = path.join(fixtureDir, testName + ".input.ts");
      const source = fs.readFileSync(inputPath, "utf8");
      const expectedOutput = fs.readFileSync(
        path.join(fixtureDir, testName + ".output.ts"),
        "utf8"
      );

      const output = testUtils.applyTransform(
        transformTs,
        { lineTerminator: "\n" },
        {
          path: inputPath,
          source,
        },
        { parser: "tsx" }
      );
      assert.equal(output, normalizeLineEnds(expectedOutput).trimEnd());
    });
  });
});

function normalizeLineEnds(s: string) {
  return s.split("\r\n").join("\n");
}

function getTestName(baseDirPath: string, currentFilePath: string, testCases: Set<string>) {
  const stat = fs.statSync(currentFilePath);
  if (stat.isDirectory()) {
    const names = fs.readdirSync(currentFilePath);
    for (const name of names) {
      if (name === "unsupported") {
        continue;
      }
      const filePath = path.join(currentFilePath, name);
      getTestName(baseDirPath, filePath, testCases);
    }
  } else if (stat.isFile()) {
    const fileName = path.basename(currentFilePath);
    const relativePath = path.relative(baseDirPath, currentFilePath);
    if (fileName.endsWith(".input.ts") || fileName.endsWith(".input.js")) {
      const testBaseName = relativePath.substr(0, relativePath.length - 9);
      testCases.add(testBaseName);
    } else if (fileName.endsWith(".input.jsx") || fileName.endsWith(".input.tsx")) {
      const testBaseName = relativePath.substr(0, relativePath.length - 10);
      testCases.add(testBaseName);
    }
  }
}
