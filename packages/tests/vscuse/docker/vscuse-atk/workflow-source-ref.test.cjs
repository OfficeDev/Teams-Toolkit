const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { parse } = require("yaml");

const workflowPath = path.resolve(
  __dirname,
  "../../../../../.github/workflows/vscuse-atk-docker-build.yml",
);

test("VCB-103: image build checks out the requested source ref", () => {
  const workflow = parse(fs.readFileSync(workflowPath, "utf8"));
  const checkoutStep = workflow.jobs["build-and-push"].steps.find(
    (step) => step.name === "Checkout repo",
  );

  assert.ok(checkoutStep);
  assert.equal(
    checkoutStep.with?.ref,
    "${{ github.event.inputs.source_ref || github.ref }}",
  );
});
