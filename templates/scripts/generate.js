// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/*
 * Script: generate.js
 * Purpose: Run the independent template-generation scripts in parallel.
 *
 * The VSC group (fallback zips, the single v4 templates.zip, and the metadata
 * JSON) and the VS group (csharp fallback zip) read disjoint source folders and
 * write to disjoint build/ subdirectories, so there is no ordering dependency
 * between them. Running them concurrently (instead of chaining with `&&`) turns
 * the generate phase's wall time into roughly the slowest single task.
 *
 * Usage:
 *   node ./scripts/generate.js          # both groups (default)
 *   node ./scripts/generate.js --vsc    # VSC group only
 *   node ./scripts/generate.js --vs     # VS group only
 */

const { spawn } = require("node:child_process");

const GROUPS = {
  vsc: [
    "node ./scripts/generateVSCZip.js",
    "node ./scripts/generateV4Zip.js",
    "tsx ./scripts/generate-metadata.ts",
  ],
  vs: ["node ./scripts/generateVSZip.js"],
};

function runCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { stdio: "inherit", shell: true });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`"${command}" exited with code ${code}`));
      }
    });
  });
}

async function main() {
  const flags = process.argv.slice(2);
  const selected =
    flags.length === 0 ? Object.keys(GROUPS) : flags.map((flag) => flag.replace(/^--/, ""));

  const commands = [];
  for (const group of selected) {
    if (!GROUPS[group]) {
      console.error(`Unknown group "${group}". Valid groups: ${Object.keys(GROUPS).join(", ")}`);
      process.exit(1);
    }
    commands.push(...GROUPS[group]);
  }

  const results = await Promise.allSettled(commands.map(runCommand));
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure.reason.message);
    }
    process.exit(1);
  }
}

main();
