const { createHash } = require("node:crypto");

const { expandCaseBundle } = require("./expand-case-bundle.cjs");
const { parseCaseBundle } = require("./parse-case-bundle.cjs");
const { preflightOutputPaths } = require("./preflight-output-paths.cjs");

const executionContext = {
  delay_between_steps: 1,
  stop_on_error: true,
  precondition_wait_timeout: 30,
  precondition_retry_interval: 1,
};

function createPlanId(sourcePath, caseId) {
  const suffix = createHash("sha256")
    .update(`${sourcePath}\0${caseId}`)
    .digest("hex")
    .slice(0, 12);
  return `plan_${suffix}`;
}

function composeCase({ compileStep, expandedCase, sourcePath }) {
  const steps = [];
  for (const step of expandedCase.steps) {
    const result = compileStep({
      caseId: expandedCase.caseId,
      definition: step.definition,
      featureFlags: expandedCase.featureFlags,
      occurrence: step.occurrence,
      stepName: step.stepName,
    });
    if (!result.ok) {
      return result;
    }
    steps.push(...structuredClone(result.value));
  }

  const tags = [
    `case_id:${expandedCase.caseId}`,
    `scenario_id:${expandedCase.scenarioId}`,
    `template_id:${expandedCase.templateId}`,
    `gate:${expandedCase.gate}`,
    ...expandedCase.featureFlags.map(
      (featureFlag) => `feature_flag:${featureFlag}`,
    ),
  ];
  return {
    ok: true,
    value: {
      caseId: expandedCase.caseId,
      fileName: expandedCase.fileName,
      gate: expandedCase.gate,
      scenarioId: expandedCase.scenarioId,
      templateId: expandedCase.templateId,
      plan: {
        plan_metadata: {
          version: "1.1",
          plan_id: createPlanId(sourcePath, expandedCase.caseId),
          execution_context: { ...executionContext },
          total_steps: steps.length,
          name: expandedCase.caseId,
          description: {
            owner: "",
            workitem: expandedCase.scenarioId,
            other: "",
          },
          execution_order: steps.map(({ step_id }) => step_id),
          tags,
        },
        steps,
        screenshots: {},
      },
    },
  };
}

function compileCaseBundle({ compileStep, sourcePath, sourceText }) {
  const parsed = parseCaseBundle({ sourcePath, sourceText });
  if (!parsed.ok) {
    return parsed;
  }

  const expanded = expandCaseBundle({ bundle: parsed.value, sourcePath });
  if (!expanded.ok) {
    return expanded;
  }

  const preflight = preflightOutputPaths({
    expandedCases: expanded.value,
    sourcePath,
  });
  if (!preflight.ok) {
    return preflight;
  }

  const value = [];
  for (const expandedCase of preflight.value) {
    const result = composeCase({ compileStep, expandedCase, sourcePath });
    if (!result.ok) {
      return result;
    }
    value.push(result.value);
  }
  return { ok: true, value };
}

module.exports = { compileCaseBundle };
