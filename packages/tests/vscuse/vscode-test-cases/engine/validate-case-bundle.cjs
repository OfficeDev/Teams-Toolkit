const { createDiagnostic } = require("./diagnostics.cjs");

const allowedCaseFields = new Set(["id", "scenarioId", "steps", "gate"]);
const allowedGates = new Set(["pr", "scheduled", "manual"]);
const allowedRootFields = new Set([
  "version",
  "featureFlags",
  "cases",
  "steps",
]);
const allowedStepFields = new Set(["type", "with"]);
const allowedStepTypes = new Set([
  "scaffold",
  "login",
  "provision",
  "deploy",
  "pythonEnvironment",
  "localEnvironment",
  "target",
  "open",
  "checks",
]);
const featureFlagPattern = /^[A-Z_][A-Z0-9_]*=(?:true|false)$/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addUnknownFieldDiagnostics({
  allowedFields,
  diagnostics,
  sourcePath,
  value,
  yamlPath,
}) {
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) {
      diagnostics.push(
        createDiagnostic(
          "VCB_FIELD_UNKNOWN",
          sourcePath,
          `${yamlPath}.${field}`,
          "The case bundle contains an unsupported field.",
        ),
      );
    }
  }
}

function validateCaseBundle({ bundle, sourcePath }) {
  const diagnostics = [];
  if (!isRecord(bundle)) {
    return {
      ok: false,
      diagnostics: [
        createDiagnostic(
          "VCB_ROOT_INVALID",
          sourcePath,
          "$",
          "The case bundle root must be a map.",
        ),
      ],
    };
  }

  addUnknownFieldDiagnostics({
    allowedFields: allowedRootFields,
    diagnostics,
    sourcePath,
    value: bundle,
    yamlPath: "$",
  });
  if (bundle.version !== 1) {
    diagnostics.push(
      createDiagnostic(
        "VCB_VERSION_UNSUPPORTED",
        sourcePath,
        "$.version",
        "The case bundle version is not supported.",
      ),
    );
  }
  if (
    bundle.featureFlags !== undefined &&
    (!Array.isArray(bundle.featureFlags) ||
      bundle.featureFlags.length === 0 ||
      bundle.featureFlags.some(
        (featureFlag) =>
          typeof featureFlag !== "string" ||
          !featureFlagPattern.test(featureFlag),
      ) ||
      new Set(bundle.featureFlags).size !== bundle.featureFlags.length)
  ) {
    diagnostics.push(
      createDiagnostic(
        "VCB_FEATURE_FLAGS_INVALID",
        sourcePath,
        "$.featureFlags",
        "Feature flags must be unique NAME=true or NAME=false entries.",
      ),
    );
  }

  if (!Array.isArray(bundle.cases) || bundle.cases.length === 0) {
    diagnostics.push(
      createDiagnostic(
        "VCB_CASES_REQUIRED",
        sourcePath,
        "$.cases",
        "The case bundle must define at least one case.",
      ),
    );
  } else {
    const caseIds = new Set();
    bundle.cases.forEach((caseDefinition, caseIndex) => {
      const yamlPath = `$.cases[${caseIndex}]`;
      if (!isRecord(caseDefinition)) {
        diagnostics.push(
          createDiagnostic(
            "VCB_CASE_INVALID",
            sourcePath,
            yamlPath,
            "Each case must be a map.",
          ),
        );
        return;
      }
      addUnknownFieldDiagnostics({
        allowedFields: allowedCaseFields,
        diagnostics,
        sourcePath,
        value: caseDefinition,
        yamlPath,
      });
      if (
        typeof caseDefinition.id !== "string" ||
        caseDefinition.id.length === 0
      ) {
        diagnostics.push(
          createDiagnostic(
            "VCB_CASE_ID_REQUIRED",
            sourcePath,
            `${yamlPath}.id`,
            "Each case must have a non-empty ID.",
          ),
        );
      } else if (caseIds.has(caseDefinition.id)) {
        diagnostics.push(
          createDiagnostic(
            "VCB_CASE_ID_DUPLICATE",
            sourcePath,
            `${yamlPath}.id`,
            "Case IDs must be unique within one source.",
          ),
        );
      } else {
        caseIds.add(caseDefinition.id);
      }
      if (
        typeof caseDefinition.scenarioId !== "string" ||
        caseDefinition.scenarioId.length === 0
      ) {
        diagnostics.push(
          createDiagnostic(
            "VCB_SCENARIO_ID_REQUIRED",
            sourcePath,
            `${yamlPath}.scenarioId`,
            "Each case must have a non-empty scenario ID.",
          ),
        );
      }
      if (
        !Array.isArray(caseDefinition.steps) ||
        caseDefinition.steps.length === 0 ||
        caseDefinition.steps.some((stepName) => typeof stepName !== "string")
      ) {
        diagnostics.push(
          createDiagnostic(
            "VCB_CASE_STEPS_REQUIRED",
            sourcePath,
            `${yamlPath}.steps`,
            "Each case must contain an ordered list of step references.",
          ),
        );
      }
      if (
        caseDefinition.gate !== undefined &&
        !allowedGates.has(caseDefinition.gate)
      ) {
        diagnostics.push(
          createDiagnostic(
            "VCB_GATE_UNSUPPORTED",
            sourcePath,
            `${yamlPath}.gate`,
            "The case gate is not supported.",
          ),
        );
      }
    });
  }

  if (!isRecord(bundle.steps) || Object.keys(bundle.steps).length === 0) {
    diagnostics.push(
      createDiagnostic(
        "VCB_STEPS_REQUIRED",
        sourcePath,
        "$.steps",
        "The case bundle must define at least one semantic step.",
      ),
    );
  } else {
    for (const [stepName, definition] of Object.entries(bundle.steps)) {
      const yamlPath = `$.steps.${stepName}`;
      if (!isRecord(definition)) {
        diagnostics.push(
          createDiagnostic(
            "VCB_STEP_INVALID",
            sourcePath,
            yamlPath,
            "Each semantic step must be a map.",
          ),
        );
        continue;
      }
      addUnknownFieldDiagnostics({
        allowedFields: allowedStepFields,
        diagnostics,
        sourcePath,
        value: definition,
        yamlPath,
      });
      if (!allowedStepTypes.has(definition.type)) {
        diagnostics.push(
          createDiagnostic(
            "VCB_STEP_TYPE_UNSUPPORTED",
            sourcePath,
            `${yamlPath}.type`,
            "The semantic step type is not supported.",
          ),
        );
      }
      if (definition.type === "scaffold") {
        if (
          !isRecord(definition.with) ||
          typeof definition.with.template !== "string" ||
          definition.with.template.length === 0 ||
          !Array.isArray(definition.with.answers)
        ) {
          diagnostics.push(
            createDiagnostic(
              "VCB_SCAFFOLD_INPUT_INVALID",
              sourcePath,
              `${yamlPath}.with`,
              "A scaffold step requires a template and ordered answers.",
            ),
          );
        }
      }
    }
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }
  return { ok: true, value: bundle };
}

module.exports = { validateCaseBundle };
