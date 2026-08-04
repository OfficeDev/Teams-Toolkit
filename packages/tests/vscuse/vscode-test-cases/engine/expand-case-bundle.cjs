const { createDiagnostic } = require("./diagnostics.cjs");

function expandCaseBundle({ bundle, sourcePath }) {
  const diagnostics = [];
  const expandedCases = [];
  let sourceTemplate;

  for (const [stepName, definition] of Object.entries(bundle.steps)) {
    if (definition.type !== "scaffold") {
      continue;
    }
    if (sourceTemplate === undefined) {
      sourceTemplate = definition.with.template;
    } else if (definition.with.template !== sourceTemplate) {
      diagnostics.push(
        createDiagnostic(
          "VCB_SOURCE_TEMPLATE_CONFLICT",
          sourcePath,
          `$.steps.${stepName}.with.template`,
          "All scaffold definitions in one source must name one template.",
        ),
      );
    }
  }

  for (const [caseIndex, caseDefinition] of bundle.cases.entries()) {
    const steps = [];
    for (const [stepIndex, stepName] of caseDefinition.steps.entries()) {
      if (!Object.hasOwn(bundle.steps, stepName)) {
        diagnostics.push(
          createDiagnostic(
            "VCB_STEP_REFERENCE_UNKNOWN",
            sourcePath,
            `$.cases[${caseIndex}].steps[${stepIndex}]`,
            "The referenced step is not defined.",
          ),
        );
        continue;
      }
      const definition = bundle.steps[stepName];
      steps.push({
        definition: structuredClone(definition),
        occurrence: stepIndex + 1,
        stepName,
      });
    }

    const scaffolds = steps.filter(
      ({ definition }) => definition.type === "scaffold",
    );
    if (scaffolds.length !== 1) {
      diagnostics.push(
        createDiagnostic(
          "VCB_CASE_SCAFFOLD_COUNT",
          sourcePath,
          `$.cases[${caseIndex}].steps`,
          "Each case must reference exactly one scaffold step.",
        ),
      );
    }
    expandedCases.push({
      caseId: caseDefinition.id,
      featureFlags: structuredClone([
        ...(bundle.featureFlags ?? []),
        ...(caseDefinition.featureFlags ?? []),
      ]),
      gate: caseDefinition.gate ?? "pr",
      scenarioId: caseDefinition.scenarioId,
      steps,
      templateId: scaffolds[0]?.definition.with.template,
    });
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }
  return { ok: true, value: expandedCases };
}

module.exports = { expandCaseBundle };
