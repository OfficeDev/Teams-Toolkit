const { parseDocument } = require("yaml");

const { createDiagnostic } = require("./diagnostics.cjs");
const { validateCaseBundle } = require("./validate-case-bundle.cjs");

function parseCaseBundle({ sourcePath, sourceText }) {
  let document;
  try {
    document = parseDocument(sourceText, {
      prettyErrors: false,
      strict: true,
      uniqueKeys: true,
    });
  } catch {
    return {
      ok: false,
      diagnostics: [
        createDiagnostic(
          "VCB_YAML_PARSE",
          sourcePath,
          "$",
          "The case bundle is not valid YAML.",
        ),
      ],
    };
  }

  if (document.errors.length > 0) {
    return {
      ok: false,
      diagnostics: [
        createDiagnostic(
          "VCB_YAML_PARSE",
          sourcePath,
          "$",
          "The case bundle is not valid YAML.",
        ),
      ],
    };
  }

  let bundle;
  try {
    bundle = document.toJS({ maxAliasCount: 100 });
  } catch {
    return {
      ok: false,
      diagnostics: [
        createDiagnostic(
          "VCB_YAML_UNSAFE",
          sourcePath,
          "$",
          "The case bundle cannot be safely materialized.",
        ),
      ],
    };
  }

  return validateCaseBundle({ bundle, sourcePath });
}

module.exports = { parseCaseBundle };
