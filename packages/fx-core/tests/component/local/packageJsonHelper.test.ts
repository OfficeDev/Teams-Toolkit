// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs-extra";
import * as path from "path";
import { chai } from "vitest";
import {
  loadPackageJson,
  loadTeamsFxDevScript,
} from "../../../src/component/local/packageJsonHelper";

describe("packageJsonHelper", () => {
  const testFolder = path.resolve(__dirname, "data");

  describe("loadPackageJson()", () => {
    beforeEach(() => {
      fs.ensureDirSync(testFolder);
      fs.emptyDirSync(testFolder);
    });

    it("happy path", async () => {
      const content = `\
        {\n\
          "name": "test",\n\
          "version": "1.0.0",\n\
          "scripts": {\n\
            "build": "tsc --build"\n\
          }\n\
        }`;
      const packageJsonPath = path.join(testFolder, "package.json");
      await fs.writeFile(packageJsonPath, content);

      const packageJson = await loadPackageJson(packageJsonPath);
      chai.assert.isDefined(packageJson);
      chai.assert.equal(packageJson!.name, "test");
      chai.assert.equal(packageJson!.version, "1.0.0");
      chai.assert.deepEqual(packageJson!.scripts, { build: "tsc --build" });
    });

    it("file not found", async () => {
      const packageJsonPath = path.join(testFolder, "package.json");
      await fs.remove(packageJsonPath);

      const packageJson = await loadPackageJson(packageJsonPath);
      chai.assert.isUndefined(packageJson);
    });

    it("bad format", async () => {
      const content = `\
        {\n\
          "name": "test",,,,\n\
        }`;
      const packageJsonPath = path.join(testFolder, "package.json");
      await fs.writeFile(packageJsonPath, content);

      const packageJson = await loadPackageJson(packageJsonPath);
      chai.assert.isUndefined(packageJson);
    });
  });

  describe("loadTeamsFxDevScript()", () => {
    beforeEach(() => {
      fs.ensureDirSync(testFolder);
      fs.emptyDirSync(testFolder);
    });

    it("happy path", async () => {
      const content = `\
        {\n\
          "name": "test",\n\
          "version": "1.0.0",\n\
          "scripts": {\n\
            "dev:teamsfx": "npm run dev",\n\
            "dev": "npx func start"\n\
          }\n\
        }`;
      const packageJsonPath = path.join(testFolder, "package.json");
      await fs.writeFile(packageJsonPath, content);

      const devScript = await loadTeamsFxDevScript(testFolder);
      chai.assert.isDefined(devScript);
      chai.assert.equal(devScript, "npm run dev");
    });

    it("file not found", async () => {
      const packageJsonPath = path.join(testFolder, "package.json");
      await fs.remove(packageJsonPath);

      const devScript = await loadTeamsFxDevScript(testFolder);
      chai.assert.isUndefined(devScript);
    });

    it("bad format", async () => {
      const content = `\
        {\n\
          "name": "test",,,,\n\
        }`;
      const packageJsonPath = path.join(testFolder, "package.json");
      await fs.writeFile(packageJsonPath, content);

      const devScript = await loadTeamsFxDevScript(testFolder);
      chai.assert.isUndefined(devScript);
    });

    it("no scripts", async () => {
      const content = `\
        {\n\
          "name": "test",\n\
          "version": "1.0.0"\n\
        }`;
      const packageJsonPath = path.join(testFolder, "package.json");
      await fs.writeFile(packageJsonPath, content);

      const devScript = await loadTeamsFxDevScript(testFolder);
      chai.assert.isUndefined(devScript);
    });

    it("no dev:teamsfx", async () => {
      const content = `\
        {\n\
          "name": "test",\n\
          "version": "1.0.0",\n\
          "scripts": {\n\
            "dev": "npx func start -- Y"\n\
          }\n\
        }`;
      const packageJsonPath = path.join(testFolder, "package.json");
      await fs.writeFile(packageJsonPath, content);

      const devScript = await loadTeamsFxDevScript(testFolder);
      chai.assert.isUndefined(devScript);
    });

    it("custom dev:teamsfx", async () => {
      const content = `\
        {\n\
          "name": "test",\n\
          "version": "1.0.0",\n\
          "scripts": {\n\
            "dev:teamsfx": "npx func start --X",\n\
            "dev": "npx func start -- Y"\n\
          }\n\
        }`;
      const packageJsonPath = path.join(testFolder, "package.json");
      await fs.writeFile(packageJsonPath, content);

      const devScript = await loadTeamsFxDevScript(testFolder);
      chai.assert.isDefined(devScript);
      chai.assert.equal(devScript, "npx func start --X");
    });
  });
});
