/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

/* global Office PowerPoint console */

/**
 * Shows a notification when the add-in command is executed.
 * @param event
 */
export async function insertTextInPowerPoint(event: Office.AddinCommands.Event) {
  try {
    await PowerPoint.run(async (context) => {
      const slide = context.presentation.getSelectedSlides().getItemAt(0);
      const textBox = slide.shapes.addTextBox("Hello World");
      textBox.fill.setSolidColor("white");
      textBox.lineFormat.color = "black";
      textBox.lineFormat.weight = 1;
      textBox.lineFormat.dashStyle = PowerPoint.ShapeLineDashStyle.solid;
      await context.sync();
    });
  } catch (error) {
    console.log("Error: " + error);
  }

  // Be sure to indicate when the add-in command function is complete
  event.completed();
}
