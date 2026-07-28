const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { renderComponent } = require("./render-component.cjs");

const componentRoot = path.join(__dirname, "..", "components");

test("renders typed component parameters as valid JSON", () => {
  const result = renderComponent({
    componentRoot,
    relativePath: "quick-input/single-select.json.tpl",
    values: {
      instanceSuffix: "case_1",
      optionLabel: 'Option "one"',
      questionTitle: "Question\none",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value[2].parameters.text, 'Option "one"');
  assert.match(result.value[0].description, /Question\none/);
  assert.equal(
    new Set(result.value.map((step) => step.step_id)).size,
    result.value.length,
  );
});

test("rejects invalid suffixes and incomplete parameter sets", () => {
  const invalidSuffix = renderComponent({
    componentRoot,
    relativePath: "browser/assert-ready.json.tpl",
    values: { instanceSuffix: "Bad suffix", readySubject: "target" },
  });
  assert.equal(invalidSuffix.ok, false);
  assert.equal(invalidSuffix.diagnostics[0].code, "VCB_COMPONENT_SUFFIX");

  const missingParameter = renderComponent({
    componentRoot,
    relativePath: "browser/assert-ready.json.tpl",
    values: { instanceSuffix: "case_1" },
  });
  assert.equal(missingParameter.ok, false);
  assert.equal(missingParameter.diagnostics[0].code, "VCB_COMPONENT_PARAMETER");

  const extraParameter = renderComponent({
    componentRoot,
    relativePath: "browser/assert-ready.json.tpl",
    values: {
      instanceSuffix: "case_1",
      readySubject: "target",
      extra: "value",
    },
  });
  assert.equal(extraParameter.ok, false);
  assert.equal(extraParameter.diagnostics[0].code, "VCB_COMPONENT_PARAMETER");
});

test("rejects unknown placeholder kinds", (context) => {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "vscuse-component-"),
  );
  context.after(() =>
    fs.rmSync(temporaryRoot, { force: true, recursive: true }),
  );
  fs.writeFileSync(
    path.join(temporaryRoot, "unknown.json.tpl"),
    `${JSON.stringify({
      component: { parameters: ["instanceSuffix"] },
      steps: [
        {
          step_id: "step_{{text:instanceSuffix}}",
          description: "{{unknown:value}}",
        },
      ],
    })}\n`,
  );

  const result = renderComponent({
    componentRoot: temporaryRoot,
    relativePath: "unknown.json.tpl",
    values: { instanceSuffix: "case_1" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_COMPONENT_PLACEHOLDER");
});
