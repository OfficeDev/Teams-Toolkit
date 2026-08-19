const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { parse } = require("yaml");

const workflowsDirectory = path.resolve(
  __dirname,
  "../../../../../.github/workflows",
);

function readWorkflow(fileName) {
  return parse(
    fs.readFileSync(path.join(workflowsDirectory, fileName), "utf8"),
  );
}

test("VTR-01: template workflow excludes separately scheduled plans", () => {
  const workflow = readWorkflow("ui-test-vscuse-template.yml");

  assert.equal(
    workflow.jobs.run.with.plan_find_args,
    '-name "*.json" ! -name "Feature_*" ! -name "Sample_*" ! -name "Regular_*"',
  );
});

test("VTR-02: regular workflow supports manual and weekly runs", () => {
  const workflow = readWorkflow("ui-test-vscuse-regular.yml");

  assert.ok(workflow.on.workflow_dispatch);
  assert.deepEqual(workflow.on.schedule, [{ cron: "0 2 * * 1" }]);
});

test("VTR-03: regular workflow selects Regular plans through the shared workflow", () => {
  const workflow = readWorkflow("ui-test-vscuse-regular.yml");

  assert.equal(
    workflow.jobs.run.uses,
    "./.github/workflows/ui-test-vscuse-common.yml",
  );
  assert.equal(workflow.jobs.run.with.plan_find_args, '-name "Regular_*.json"');
  assert.equal(
    workflow.jobs.run.with.schedule_trigger,
    "${{ github.event_name == 'schedule' || github.event.inputs.schedule_trigger == 'true' }}",
  );
  assert.equal(workflow.jobs.run.with.email_subject_suffix, "[Regular]");
});
