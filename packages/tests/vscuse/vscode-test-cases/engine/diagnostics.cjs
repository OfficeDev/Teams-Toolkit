function createDiagnostic(code, sourcePath, yamlPath, message) {
  return { code, sourcePath, yamlPath, message };
}

module.exports = { createDiagnostic };
