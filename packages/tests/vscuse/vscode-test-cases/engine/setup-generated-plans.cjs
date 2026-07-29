const defaultFileSystem = require("node:fs/promises");
const path = require("node:path");

const { compileCaseBundle } = require("./compile-case-bundle.cjs");
const { loadCaseSources } = require("./load-case-sources.cjs");
const { createSemanticStepCompiler } = require("./semantic-step-compiler.cjs");
const { writeGeneratedPlans } = require("./write-generated-plans.cjs");

async function setupGeneratedPlans({
  casesDirectory = path.join(__dirname, "..", "cases"),
  compileStep,
  fileSystem = defaultFileSystem,
  onDiff,
  output = process.stdout,
  plansDirectory = path.join(__dirname, "..", "plans"),
  sources,
} = {}) {
  let resolvedSources = sources;
  if (resolvedSources === undefined) {
    const loaded = await loadCaseSources({ casesDirectory, fileSystem });
    if (!loaded.ok) {
      return loaded;
    }
    resolvedSources = loaded.value;
  }
  const resolvedCompileStep = compileStep ?? createSemanticStepCompiler();

  const diagnostics = [];
  const planDescriptors = [];
  for (const source of resolvedSources) {
    const result = compileCaseBundle({
      compileStep: resolvedCompileStep,
      sourcePath: source.sourcePath,
      sourceText: source.sourceText,
    });
    if (result.ok) {
      planDescriptors.push(...result.value);
    } else {
      diagnostics.push(...result.diagnostics);
    }
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  const reportDiff =
    onDiff ??
    ((diff) =>
      output.write(diff === "" ? "No generated plan changes.\n" : diff));

  return writeGeneratedPlans({
    fileSystem,
    onDiff: reportDiff,
    planDescriptors,
    plansDirectory,
  });
}

module.exports = { setupGeneratedPlans };
