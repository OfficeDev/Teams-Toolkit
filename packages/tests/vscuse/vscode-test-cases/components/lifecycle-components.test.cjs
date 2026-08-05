const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const componentRoot = __dirname;
const substitutions = {
  accountName: "${{env:M365_ACCOUNT_NAME}}",
  accountPassword: "${{secret:M365_ACCOUNT_PASSWORD}}",
  actionLabel: 'Provision "now"',
  commandTitle: "Debug: Select and Start Debugging",
  convergedSubject: "the Microsoft Teams conversation is open",
  destination: "chat",
  dialogTitle: "Confirm provisioning\nfor dev",
  inputValue: "test value",
  instanceSuffix: "lifecycle_1",
  notificationText: 'stage completed "successfully"\nwith details',
  optionLabel: "Deploy",
  questionTitle: "Deploy resources in dev?",
  readySubject: "the selected target is visible",
  retryTimeout: "900",
};

function render(relativePath, overrides = {}) {
  const values = { ...substitutions, ...overrides };
  const source = fs.readFileSync(
    path.join(componentRoot, relativePath),
    "utf8",
  );
  assert.equal(source.includes("\r"), false, `${relativePath} must use LF`);
  assert.equal(
    /source_[^"\s]*/.test(source),
    false,
    `${relativePath} must not use source_* tags`,
  );
  const usedParameters = new Set(
    [...source.matchAll(/\{\{(?:text|json):([A-Za-z][A-Za-z0-9_]*)\}\}/g)].map(
      (match) => match[1],
    ),
  );

  const rendered = source
    .replace(/\{\{text:([A-Za-z][A-Za-z0-9_]*)\}\}/g, (_, name) => {
      assert.ok(
        name in values,
        `${relativePath} uses unknown text parameter ${name}`,
      );
      return JSON.stringify(values[name]).slice(1, -1);
    })
    .replace(/\{\{json:([A-Za-z][A-Za-z0-9_]*)\}\}/g, (_, name) => {
      assert.ok(
        name in values,
        `${relativePath} uses unknown JSON parameter ${name}`,
      );
      return JSON.stringify(values[name]);
    });

  const component = JSON.parse(rendered);
  assert.deepEqual(
    [...component.component.parameters].sort(),
    [...usedParameters].sort(),
    `${relativePath} must declare exactly its used parameters`,
  );
  const ids = component.steps.map((step) => step.step_id);
  assert.equal(
    new Set(ids).size,
    ids.length,
    `${relativePath} must render unique IDs`,
  );
  component.steps.forEach((step, index) => {
    assert.deepEqual(step.depends_on, index === 0 ? [] : [ids[index - 1]]);
  });
  return component;
}

test("initialization accepts a ready workbench without a specific editor", () => {
  const initialization = render(
    "initialization/close-welcome-overlay.json.tpl",
  );

  assert.equal(initialization.component.id, "closeWelcomeOverlay");
  assert.match(initialization.steps.at(-1).description, /workbench is ready/);
  assert.doesNotMatch(
    initialization.steps.at(-1).description,
    /Welcome editor/,
  );
});

test("quick-input assertions match prompt titles", () => {
  for (const relativePath of [
    "quick-input/single-select.json.tpl",
    "quick-input/text.json.tpl",
  ]) {
    const quickInput = render(relativePath);
    assert.match(quickInput.steps[0].description, /prompt titled/);
    assert.doesNotMatch(quickInput.steps[0].description, /the question/);
  }
});

test("plain text input submits immediately after typing", () => {
  const textInput = render("quick-input/text.json.tpl");

  assert.deepEqual(
    textInput.steps.map((step) => step.tool),
    ["", "type_text", "key_press"],
  );
  assert.equal(textInput.steps.at(-1).parameters.key, "enter");
  assert.doesNotMatch(
    textInput.steps.map((step) => step.description).join("\n"),
    /without exposing its content/,
  );
});

test("VCB-47: Microsoft 365 sign-in verifies the account in the ACCOUNTS section", () => {
  for (const relativePath of [
    "authentication/m365/sign-in.json.tpl",
    "authentication/m365/sign-in-from-account-picker.json.tpl",
  ]) {
    const signIn = render(relativePath);
    const closeBrowser = signIn.steps.at(-2);
    const assertReady = signIn.steps.at(-1);

    assert.equal(closeBrowser.tool, "click");
    assert.equal(assertReady.tool, "");
    assert.match(assertReady.step_id, /_assertReady_/);
    assert.equal(assertReady.depends_on[0], closeBrowser.step_id);
    assert.match(assertReady.description, /M365_ACCOUNT_NAME/);
    assert.match(assertReady.description, /the "ACCOUNTS" section lists/);
    assert.match(assertReady.description, /trailing ellipsis\.$/);
  }
});

test("VCB-62: account readiness waits out the toolkit's Signing in state", () => {
  for (const relativePath of [
    "authentication/azure/sign-in.json.tpl",
    "authentication/m365/sign-in.json.tpl",
    "authentication/m365/sign-in-from-account-picker.json.tpl",
  ]) {
    const assertReady = render(relativePath).steps.at(-1);

    assert.equal(assertReady.tags.includes("readiness:account-visible"), true);
    assert.equal(assertReady.tags.includes("step_retry_timeout: 180"), true);
  }
});

test("VCB-63: Copilot conversation clicks resolve their target by OCR", () => {
  for (const [relativePath, control] of [
    ["browser/copilot/allow-action.json.tpl", '"Allow" button'],
    ["browser/copilot/send-message.json.tpl", '"Message" input box'],
  ]) {
    const click = render(relativePath, {
      message: "List all repairs",
    }).steps.find((step) => step.tool === "click");

    assert.equal(click.description.includes(control), true);
    assert.equal(click.tags.includes("ocr:true"), true);
    assert.deepEqual(click.preconditions, []);
  }
});

test("VCB-49: Ctrl+W is gated on the Welcome tab being the active editor", () => {
  const close = render("initialization/close-get-started-editor.json.tpl");
  const [assertActive, closeEditor, assertClosed] = close.steps;

  assert.equal(assertActive.agent, "assertion");
  assert.match(
    assertActive.description,
    /the editor tab labeled Welcome showing the Build a Declarative Agent walkthrough is the active editor tab/,
  );
  assert.equal(closeEditor.parameters.keys, "ctrl+w");
  assert.match(assertClosed.description, /no editor tab is open/);
});

test("VCB-50: the multi-select component selects by control, not by position", () => {
  const multiSelect = render("quick-input/multi-select.json.tpl");
  const [, , focusSelectAll, selectAll] = multiSelect.steps;
  const confirm = multiSelect.steps.at(-1);

  assert.equal(multiSelect.steps.length, 6);
  assert.equal(focusSelectAll.parameters.keys, "shift+tab");
  assert.equal(selectAll.parameters.key, "space");
  assert.equal(confirm.parameters.key, "enter");

  // The prompt lists whatever the resource behind the earlier answers exposes,
  // so the component may neither type a filter, nor step the list, nor name a
  // count.
  for (const step of multiSelect.steps) {
    assert.notEqual(step.tool, "type_text");
    assert.notEqual(step.parameters.key, "down");
    assert.equal(/\bSelected\b/.test(step.description), false);
  }
});

test("VCB-58: the multi-select component asserts no checked state", () => {
  const multiSelect = render("quick-input/multi-select.json.tpl");

  // The prompt draws its placeholder on the input-box row and the select-all
  // checkbox beside it, so a reader of the screen cannot tell that row from an
  // option row.
  for (const step of multiSelect.steps) {
    if (step.agent !== "assertion") continue;
    assert.equal(/checked/.test(step.description), false);
    assert.equal(/every option/.test(step.description), false);
  }
});

test("VCB-81: the multi-select option wait identifies option rows without using position or count", () => {
  const multiSelect = render("quick-input/multi-select.json.tpl");
  const assertOptionsLoaded = multiSelect.steps[1];

  assert.match(
    assertOptionsLoaded.description,
    /option row with a text label beside a square selection control/,
  );
  assert.match(assertOptionsLoaded.description, /selection-count badge/);
  assert.equal(/input box/.test(assertOptionsLoaded.description), false);
  assert.equal(/\b[0-9]+\b/.test(assertOptionsLoaded.description), false);
});

test("VCB-60: the confirmation component gates on no image hash", () => {
  const dialog = render("dialog/click-primary-action.json.tpl");

  // The dialog renders over whatever the scaffolded template left on screen,
  // and that background differs per template, so the confirmation is gated by
  // its assertion alone.
  for (const step of dialog.steps) {
    assert.deepEqual(step.preconditions, []);
  }
});

test("VCB-56: the multi-select component confirms from the input box", () => {
  const multiSelect = render("quick-input/multi-select.json.tpl");
  const [, , focusSelectAll, , restoreFocus] = multiSelect.steps;
  const confirm = multiSelect.steps.at(-1);

  // Enter does not confirm the prompt while the select-all checkbox holds
  // focus, so the detour that reached that checkbox is closed before Enter.
  assert.equal(focusSelectAll.parameters.keys, "shift+tab");
  assert.equal(restoreFocus.parameters.keys, "tab");
  assert.equal(confirm.parameters.key, "enter");
  assert.equal(
    multiSelect.steps.indexOf(restoreFocus) <
      multiSelect.steps.indexOf(confirm),
    true,
  );
});

test("VCB-55: option components wait for the prompt to load its options", () => {
  for (const relativePath of [
    "quick-input/single-select.json.tpl",
    "quick-input/multi-select.json.tpl",
  ]) {
    const quickInput = render(relativePath);
    const assertOptionsLoaded = quickInput.steps[1];

    assert.equal(assertOptionsLoaded.agent, "assertion");
    assert.match(
      assertOptionsLoaded.description,
      /has finished loading and lists at least one selectable option/,
    );
    assert.equal(
      assertOptionsLoaded.tags.includes("step_retry_timeout: 120"),
      true,
    );

    // VCB-81: a reader that placed the loaded option above the input box read
    // the earlier `below its input box` claim as false.
    assert.equal(/input box/.test(assertOptionsLoaded.description), false);

    // The title assertion alone passes while the prompt still reads
    // "Loading options...", so the first keystroke must depend on this step.
    assert.deepEqual(quickInput.steps[2].depends_on, [
      assertOptionsLoaded.step_id,
    ]);
  }
});

test("VCB-48: Command Palette assertions name the > in the input box", () => {
  const command = render("command-palette/execute-command.json.tpl");
  const [, assertPalette, , assertCommand] = command.steps;

  assert.equal(assertPalette.agent, "assertion");
  assert.match(assertPalette.description, /a > character in its input box/);
  assert.equal(assertCommand.agent, "assertion");
  assert.match(assertCommand.description, />Debug: Select and Start Debugging/);
});

test("VCB-52: the command assertion names the highlight, not a count or a position", () => {
  const command = render("command-palette/execute-command.json.tpl");
  const assertCommand = command.steps[3];

  assert.match(
    assertCommand.description,
    /the highlighted command listed under it is titled Debug: Select and Start Debugging/,
  );
  assert.equal(/exactly one/.test(assertCommand.description), false);
  assert.equal(/first|second/.test(assertCommand.description), false);
});

test("lifecycle recipes have reusable confirmation and notification primitives", () => {
  const dialog = render("dialog/click-primary-action.json.tpl");
  assert.equal(dialog.component.id, "clickPrimaryAction");
  assert.deepEqual(
    dialog.steps.map((step) => step.tool),
    ["", "key_press"],
  );
  assert.equal(dialog.steps[1].parameters.key, "enter");
  assert.deepEqual(dialog.steps[1].preconditions, []);

  const notification = render("notifications/assert-contains.json.tpl");
  assert.equal(notification.component.id, "assertContains");
  assert.equal(notification.steps.length, 1);
  assert.match(notification.steps[0].description, /stage completed/);
  assert.ok(notification.steps[0].tags.includes("step_retry_timeout: 900"));
});

test("target primitives expose F1, profile selection, and browser readiness behavior", () => {
  const launchProfile = "Microsoft 365 Agents Toolkit";
  const command = render("command-palette/execute-command.json.tpl");
  const profile = render("quick-input/filter-option.json.tpl", {
    optionLabel: launchProfile,
  });
  const readiness = render("browser/assert-ready.json.tpl");

  assert.equal(command.component.id, "executeCommand");
  assert.equal(command.steps[0].parameters.key, "f1");
  assert.equal(command.steps.at(-1).parameters.key, "enter");
  assert.equal(profile.component.id, "filterOption");
  assert.deepEqual(
    profile.steps.map((step) => step.tool),
    ["type_text", "", "key_press"],
  );
  assert.equal(profile.steps[0].parameters.text, launchProfile);
  assert.doesNotMatch(
    profile.steps.map((step) => step.description).join("\n"),
    /prompt titled/,
  );
  assert.equal(profile.steps.at(-1).parameters.key, "enter");
  assert.equal(readiness.component.id, "assertReady");
  assert.equal(readiness.steps.length, 1);
  assert.equal(readiness.steps[0].agent, "assertion");
  assert.match(readiness.steps[0].description, /selected target is visible/);
});

test("VCB-82: the Teams app details assertions name no button caption", () => {
  const component = render("browser/teams/add-and-open-app.json.tpl");

  assert.equal(component.component.id, "addAndOpenApp");
  const [assertPopup, , assertDialog] = component.steps;
  // Teams captions the popup's primary action `Add` for an account that has
  // not installed the app and `Open` for one that has, and titles the dialog
  // that follows accordingly.
  for (const step of [assertPopup, assertDialog]) {
    assert.equal(/\bAdd\b|Added successfully/.test(step.description), false);
  }
  assert.match(assertPopup.description, /primary action button/);
  assert.match(assertDialog.description, /Open button/);
});

test("VCB-83: the Teams app details clicks resolve their target with OCR", () => {
  const component = render("browser/teams/add-and-open-app.json.tpl");

  const clicks = component.steps.filter((step) => step.tool === "click");
  assert.equal(clicks.length, 2);
  for (const click of clicks) {
    assert.equal(click.tags.includes("ocr:true"), true);
    assert.deepEqual(click.preconditions, []);
  }
  assert.match(clicks[0].description, /"Add" or "Open"/);
  assert.match(clicks[1].description, /"Added successfully!" or "Let's go"/);
});
