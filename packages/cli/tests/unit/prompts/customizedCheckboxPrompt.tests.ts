// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { render } from "@inquirer/testing";
import figures from "figures";
import { checkbox } from "../../../src/prompts/customizedCheckboxPrompt";
import { expect } from "../utils";

const choices = [
  { id: "id1", title: "title 1", detail: "detail 1" },
  { id: "id2", title: "title 2", detail: "detail 2" },
  { id: "id3", title: "title 3", detail: "detail 3" },
  { id: "id4", title: "title 4", detail: "detail 4" },
  { id: "id5", title: "title 5", detail: "detail 5" },
  { id: "id6", title: "title 6", detail: "detail 6" },
  { id: "id7", title: "title 7", detail: "detail 7" },
  { id: "id8", title: "title 8", detail: "detail 8" },
  { id: "id9", title: "title 9", detail: "detail 9" },
  { id: "id10", title: "title 10", detail: "detail 10" },
  { id: "id11", title: "title 11", detail: "detail 11" },
  { id: "id12", title: "title 12", detail: "detail 12" },
];

const getCheckbox = (checked: boolean) => {
  if (process.platform === "win32") return checked ? "[X]" : "[ ]";
  return checked ? figures.checkboxOn : figures.checkboxOff;
};

const trimOutput = (output: string) =>
  output
    .trim()
    .split("\n")
    .map((line) => line.trim().replace("[ ]", getCheckbox(false)).replace("[X]", getCheckbox(true)))
    .join("\n");

describe("checkbox prompt", () => {
  it("use arrow keys to select an option", async () => {
    const { answer, events, getScreen } = await render(checkbox, {
      message: "Select a string",
      choices: choices,
    });

    expect(getScreen()).equal(
      trimOutput(`
        ? Select a string (Press <space> to select, <a> to toggle all, <i> to invert
        selection, and <enter> to proceed)
        [ ] title 1 detail 1
        [ ] title 2 detail 2
        [ ] title 3 detail 3
        [ ] title 4 detail 4
        [ ] title 5 detail 5
        [ ] title 6 detail 6
        [ ] title 7 detail 7
        (Use arrow keys to reveal more choices)`)
    );

    events.keypress("down");
    events.keypress("space");
    events.keypress("down");
    events.keypress("space");

    expect(getScreen()).equal(
      trimOutput(`
        ? Select a string
        [ ] title 1 detail 1
        [X] title 2 detail 2
        [X] title 3 detail 3
        [ ] title 4 detail 4
        [ ] title 5 detail 5
        [ ] title 6 detail 6
        [ ] title 7 detail 7
        (Use arrow keys to reveal more choices)`)
    );

    events.keypress("enter");
    await Promise.resolve();
    expect(getScreen()).equal("? Select a string title 2, title 3");

    expect(await answer).to.deep.equal(["id2", "id3"]);
  });

  it("use number key to select an option", async () => {
    const { answer, events, getScreen } = await render(checkbox, {
      message: "Select a string",
      choices: choices,
    });

    events.keypress("4");
    expect(getScreen()).equal(
      trimOutput(`
        ? Select a string (Press <space> to select, <a> to toggle all, <i> to invert
        selection, and <enter> to proceed)
        [ ] title 1 detail 1
        [ ] title 2 detail 2
        [ ] title 3 detail 3
        [X] title 4 detail 4
        [ ] title 5 detail 5
        [ ] title 6 detail 6
        [ ] title 7 detail 7
        (Use arrow keys to reveal more choices)`)
    );

    events.keypress("enter");
    await Promise.resolve();
    expect(getScreen()).equal("? Select a string title 4");

    expect(await answer).to.be.deep.equal(["id4"]);
  });

  it("allow setting a smaller page size", async () => {
    const { answer, events, getScreen } = await render(checkbox, {
      message: "Select a string",
      choices: choices,
      pageSize: 2,
    });

    expect(getScreen()).equal(
      trimOutput(`
        ? Select a string (Press <space> to select, <a> to toggle all, <i> to invert
        selection, and <enter> to proceed)
        [ ] title 1 detail 1
        [ ] title 2 detail 2
        (Use arrow keys to reveal more choices)`)
    );

    events.keypress("enter");
    expect(await answer).to.be.deep.equal([]);
  });

  it("allow setting a bigger page size", async () => {
    const { answer, events, getScreen } = await render(checkbox, {
      message: "Select a string",
      choices: choices,
      pageSize: 10,
    });

    expect(getScreen()).equal(
      trimOutput(`
        ? Select a string (Press <space> to select, <a> to toggle all, <i> to invert
        selection, and <enter> to proceed)
        [ ] title 1  detail 1
        [ ] title 2  detail 2
        [ ] title 3  detail 3
        [ ] title 4  detail 4
        [ ] title 5  detail 5
        [ ] title 6  detail 6
        [ ] title 7  detail 7
        [ ] title 8  detail 8
        [ ] title 9  detail 9
        [ ] title 10 detail 10
        (Use arrow keys to reveal more choices)`)
    );

    events.keypress("enter");
    expect(await answer).to.be.deep.equal([]);
  });

  it("cycles through options", async () => {
    const { answer, events, getScreen } = await render(checkbox, {
      message: "Select a string",
      choices: choices,
      pageSize: 2,
      loop: true,
    });

    expect(getScreen()).equal(
      trimOutput(`
        ? Select a string (Press <space> to select, <a> to toggle all, <i> to invert
        selection, and <enter> to proceed)
        [ ] title 1 detail 1
        [ ] title 2 detail 2
        (Use arrow keys to reveal more choices)`)
    );

    events.keypress("up");
    events.keypress("space");
    events.keypress("up");
    events.keypress("space");

    expect(getScreen()).equal(
      trimOutput(`
        ? Select a string
        [ ] title 10 detail 10
        [X] title 11 detail 11
        (Use arrow keys to reveal more choices)`)
    );

    events.keypress("enter");
    expect(await answer).to.be.deep.equal(["id11", "id12"]);
  });

  it("allow select all", async () => {
    const { answer, events, getScreen } = await render(checkbox, {
      message: "Select a string",
      choices: choices,
    });

    events.keypress("a");
    expect(getScreen()).equal(
      trimOutput(`
        ? Select a string (Press <space> to select, <a> to toggle all, <i> to invert
        selection, and <enter> to proceed)
        [X] title 1 detail 1
        [X] title 2 detail 2
        [X] title 3 detail 3
        [X] title 4 detail 4
        [X] title 5 detail 5
        [X] title 6 detail 6
        [X] title 7 detail 7
        (Use arrow keys to reveal more choices)`)
    );

    events.keypress("a");
    events.keypress("i");
    expect(getScreen()).equal(
      trimOutput(`
        ? Select a string (Press <space> to select, <a> to toggle all, <i> to invert
        selection, and <enter> to proceed)
        [X] title 1 detail 1
        [X] title 2 detail 2
        [X] title 3 detail 3
        [X] title 4 detail 4
        [X] title 5 detail 5
        [X] title 6 detail 6
        [X] title 7 detail 7
        (Use arrow keys to reveal more choices)`)
    );

    events.keypress("a");
    events.keypress("enter");
    expect(await answer).to.be.deep.equal([]);
  });

  it("allow deselect all", async () => {
    const { answer, events, getScreen } = await render(checkbox, {
      message: "Select a string",
      choices: choices,
    });

    events.keypress("4");
    expect(getScreen()).equal(
      trimOutput(`
        ? Select a string (Press <space> to select, <a> to toggle all, <i> to invert
        selection, and <enter> to proceed)
        [ ] title 1 detail 1
        [ ] title 2 detail 2
        [ ] title 3 detail 3
        [X] title 4 detail 4
        [ ] title 5 detail 5
        [ ] title 6 detail 6
        [ ] title 7 detail 7
        (Use arrow keys to reveal more choices)`)
    );

    events.keypress("a");
    events.keypress("a");
    events.keypress("enter");
    expect(await answer).to.be.deep.equal([]);
  });

  it("allow disabling help tip", async () => {
    const { answer, events, getScreen } = await render(checkbox, {
      message: "Select a string",
      choices: choices,
      instructions: false,
    });

    expect(getScreen()).equal(
      trimOutput(`
        ? Select a string
        [ ] title 1 detail 1
        [ ] title 2 detail 2
        [ ] title 3 detail 3
        [ ] title 4 detail 4
        [ ] title 5 detail 5
        [ ] title 6 detail 6
        [ ] title 7 detail 7
        (Use arrow keys to reveal more choices)`)
    );

    events.keypress("enter");
    await Promise.resolve();
    expect(getScreen()).equal("? Select a string");

    expect(await answer).to.be.deep.equal([]);
  });

  it("allow customizing help tip", async () => {
    const { answer, events, getScreen } = await render(checkbox, {
      message: "Select a string",
      choices: choices,
      instructions:
        " (Pulse <space> para seleccionar, <a> para alternar todos, <i> para invertir selección, y <enter> para continuar)",
    });

    expect(getScreen()).equal(
      trimOutput(`
        ? Select a string (Pulse <space> para seleccionar, <a> para alternar todos, <i>
        para invertir selección, y <enter> para continuar)
        [ ] title 1 detail 1
        [ ] title 2 detail 2
        [ ] title 3 detail 3
        [ ] title 4 detail 4
        [ ] title 5 detail 5
        [ ] title 6 detail 6
        [ ] title 7 detail 7
        (Use arrow keys to reveal more choices)`)
    );

    events.keypress("enter");
    await Promise.resolve();
    expect(getScreen()).equal("? Select a string");

    expect(await answer).to.be.deep.equal([]);
  });

  it("fail on validate values", async () => {
    let validationAttempts = 0;
    const { answer, events, getScreen } = await render(checkbox, {
      message: "Select a string",
      choices: choices,
      validateValues: (values) => {
        validationAttempts++;
        return validationAttempts === 1 ? "invalid selections" : undefined;
      },
    });

    expect(getScreen()).equal(
      trimOutput(`
        ? Select a string (Press <space> to select, <a> to toggle all, <i> to invert
        selection, and <enter> to proceed)
        [ ] title 1 detail 1
        [ ] title 2 detail 2
        [ ] title 3 detail 3
        [ ] title 4 detail 4
        [ ] title 5 detail 5
        [ ] title 6 detail 6
        [ ] title 7 detail 7
        (Use arrow keys to reveal more choices)`)
    );

    events.keypress("enter");
    await Promise.resolve();
    expect(getScreen()).equal(
      trimOutput(`
        ? Select a string (Press <space> to select, <a> to toggle all, <i> to invert
        selection, and <enter> to proceed)
        [ ] title 1 detail 1
        [ ] title 2 detail 2
        [ ] title 3 detail 3
        [ ] title 4 detail 4
        [ ] title 5 detail 5
        [ ] title 6 detail 6
        [ ] title 7 detail 7
        (Use arrow keys to reveal more choices)
        > invalid selections`)
    );

    events.keypress("enter");
    expect(await answer).to.deep.equal([]);
  });
});
