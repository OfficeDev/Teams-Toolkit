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

test("VCB-104: image metadata and verification use the checked-out source", () => {
  const workflow = parse(fs.readFileSync(workflowPath, "utf8"));
  const steps = workflow.jobs["build-and-push"].steps;
  const sourceStep = steps.find((step) => step.name === "Resolve image source");
  const metadataStep = steps.find((step) => step.name === "Extract metadata");
  const buildStep = steps.find(
    (step) => step.name === "Build and push Docker image",
  );
  const verifyStep = steps.find(
    (step) => step.name === "Verify published image",
  );

  assert.ok(sourceStep);
  assert.equal(
    sourceStep.env.REQUESTED_SOURCE_REF,
    "${{ github.event.inputs.source_ref || github.ref_name }}",
  );
  assert.match(sourceStep.run, /git rev-parse HEAD/);
  assert.match(sourceStep.run, /source_ref=.*GITHUB_OUTPUT/);
  assert.match(sourceStep.run, /source_sha=.*GITHUB_OUTPUT/);
  assert.match(sourceStep.run, /source_sha_short=.*GITHUB_OUTPUT/);

  assert.ok(metadataStep);
  assert.match(
    metadataStep.with.tags,
    /type=raw,value=\$\{\{ steps\.source\.outputs\.source_ref \}\}/,
  );
  assert.match(
    metadataStep.with.tags,
    /type=raw,value=\$\{\{ steps\.source\.outputs\.source_ref \}\}-\$\{\{ steps\.source\.outputs\.source_sha_short \}\}/,
  );
  assert.match(
    metadataStep.with.labels,
    /org\.opencontainers\.image\.revision=\$\{\{ steps\.source\.outputs\.source_sha \}\}/,
  );

  assert.ok(buildStep);
  assert.equal(buildStep.id, "build");
  assert.ok(verifyStep);
  assert.match(verifyStep.run, /steps\.build\.outputs\.digest/);
  assert.match(verifyStep.run, /org\.opencontainers\.image\.revision/);
  assert.match(verifyStep.run, /vscuse-atk-entrypoint\.sh/);
  assert.match(verifyStep.run, /sync-vscode-feature-flags\.cjs/);
});
