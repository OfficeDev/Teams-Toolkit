const fs = require("node:fs");
const path = require("node:path");

const anyPlaceholderPattern =
  /(?<!\$)\{\{([A-Za-z][A-Za-z0-9_]*):([A-Za-z][A-Za-z0-9_]*)\}\}/g;
const placeholderPattern = /\{\{(text|json):([A-Za-z][A-Za-z0-9_]*)\}\}/g;
const instanceSuffixPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function fail(code, message) {
  return { ok: false, diagnostics: [{ code, message }] };
}

function renderComponent({ componentRoot, relativePath, values }) {
  let source;
  try {
    source = fs.readFileSync(path.join(componentRoot, relativePath), "utf8");
  } catch {
    return fail(
      "VCB_COMPONENT_READ",
      `Unable to read component '${relativePath}'.`,
    );
  }

  if (source.includes("\r")) {
    return fail(
      "VCB_COMPONENT_FORMAT",
      `Component '${relativePath}' must use LF line endings.`,
    );
  }
  const unsupportedPlaceholder = [
    ...source.matchAll(anyPlaceholderPattern),
  ].find((match) => match[1] !== "text" && match[1] !== "json");
  if (unsupportedPlaceholder !== undefined) {
    return fail(
      "VCB_COMPONENT_PLACEHOLDER",
      `Component '${relativePath}' contains an unsupported placeholder kind.`,
    );
  }
  if (!instanceSuffixPattern.test(values.instanceSuffix ?? "")) {
    return fail("VCB_COMPONENT_SUFFIX", "Component instanceSuffix is invalid.");
  }

  const placeholders = [...source.matchAll(placeholderPattern)];
  const usedParameters = new Set(placeholders.map((match) => match[2]));
  let rendered = source;
  for (const [placeholder, kind, name] of placeholders) {
    if (!(name in values)) {
      return fail(
        "VCB_COMPONENT_PARAMETER",
        `Component '${relativePath}' is missing parameter '${name}'.`,
      );
    }
    if (kind === "text" && typeof values[name] !== "string") {
      return fail(
        "VCB_COMPONENT_PARAMETER",
        `Component '${relativePath}' text parameter '${name}' must be a string.`,
      );
    }
    const replacement =
      kind === "json"
        ? JSON.stringify(values[name])
        : JSON.stringify(values[name]).slice(1, -1);
    rendered = rendered.replaceAll(placeholder, replacement);
  }

  let document;
  try {
    document = JSON.parse(rendered);
  } catch {
    return fail(
      "VCB_COMPONENT_JSON",
      `Component '${relativePath}' did not render valid JSON.`,
    );
  }

  const declaredParameters = document.component?.parameters;
  if (!Array.isArray(declaredParameters)) {
    return fail(
      "VCB_COMPONENT_FORMAT",
      `Component '${relativePath}' must declare parameters.`,
    );
  }
  const suppliedParameters = Object.keys(values);
  const sorted = (items) => [...items].sort();
  if (
    JSON.stringify(sorted(declaredParameters)) !==
      JSON.stringify(sorted(usedParameters)) ||
    JSON.stringify(sorted(declaredParameters)) !==
      JSON.stringify(sorted(suppliedParameters))
  ) {
    return fail(
      "VCB_COMPONENT_PARAMETER",
      `Component '${relativePath}' parameters must be declared, used, and supplied exactly.`,
    );
  }

  if (!Array.isArray(document.steps)) {
    return fail(
      "VCB_COMPONENT_FORMAT",
      `Component '${relativePath}' must contain steps.`,
    );
  }
  const stepIds = document.steps.map((step) => step.step_id);
  if (
    stepIds.some((stepId) => typeof stepId !== "string") ||
    new Set(stepIds).size !== stepIds.length
  ) {
    return fail(
      "VCB_COMPONENT_STEP_ID",
      `Component '${relativePath}' rendered invalid or duplicate step IDs.`,
    );
  }

  return { ok: true, value: document.steps };
}

module.exports = { renderComponent };
