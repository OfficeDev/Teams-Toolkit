const defaultFileSystem = require("node:fs/promises");
const path = require("node:path");

const { createDiagnostic } = require("./diagnostics.cjs");

function compareFileNames(left, right) {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

async function loadCaseSources({
  casesDirectory,
  fileSystem = defaultFileSystem,
}) {
  try {
    const entries = await fileSystem.readdir(casesDirectory, {
      withFileTypes: true,
    });
    const fileNames = entries
      .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort(compareFileNames);
    const value = [];
    for (const fileName of fileNames) {
      value.push({
        sourcePath: `cases/${fileName}`,
        sourceText: await fileSystem.readFile(
          path.join(casesDirectory, fileName),
          "utf8",
        ),
      });
    }
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      diagnostics: [
        createDiagnostic(
          "VCB_SOURCE_IO",
          casesDirectory,
          "$",
          "Case bundle sources could not be read.",
        ),
      ],
    };
  }
}

module.exports = { loadCaseSources };
