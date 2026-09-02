const { createDiagnostic } = require("./diagnostics.cjs");

function normalizeFileSegment(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function preflightOutputPaths({ expandedCases, sourcePath }) {
  const diagnostics = [];
  const fileNames = new Set();
  const value = [];

  expandedCases.forEach((expandedCase, caseIndex) => {
    const caseSegment = normalizeFileSegment(expandedCase.caseId);
    const templateSegment = normalizeFileSegment(expandedCase.templateId);
    if (caseSegment.length === 0 || templateSegment.length === 0) {
      diagnostics.push(
        createDiagnostic(
          "VCB_OUTPUT_PATH_INVALID",
          sourcePath,
          `$.cases[${caseIndex}].id`,
          "The generated output path is invalid.",
        ),
      );
      return;
    }

    const fileName = caseSegment.startsWith("feature-")
      ? `${caseSegment}.json`
      : `${templateSegment}--${caseSegment}.json`;
    if (fileNames.has(fileName)) {
      diagnostics.push(
        createDiagnostic(
          "VCB_OUTPUT_PATH_COLLISION",
          sourcePath,
          `$.cases[${caseIndex}].id`,
          "Generated output paths must be unique.",
        ),
      );
      return;
    }
    fileNames.add(fileName);
    value.push({ ...expandedCase, fileName });
  });

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }
  return { ok: true, value };
}

module.exports = { preflightOutputPaths };
