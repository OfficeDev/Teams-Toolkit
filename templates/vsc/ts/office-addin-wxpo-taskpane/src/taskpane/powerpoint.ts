/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

/* global document, Office, PowerPoint */

Office.onReady((info) => {
  if (info.host === Office.HostType.PowerPoint) {
    document.getElementById("sideload-msg").style.display = "none";
    document.getElementById("app-body").style.display = "flex";
    document.getElementById("run").onclick = runPowerPoint;
  }
});

export async function runPowerPoint() {
  /**
   * Insert your PowerPoint code here
   */
  await PowerPoint.run(async (context: PowerPoint.RequestContext) => {
    const shapes: PowerPoint.ShapeCollection = context.presentation.slides.getItemAt(0).shapes;
    const shapeOptions: PowerPoint.ShapeAddOptions = {
      left: 100,
      top: 300,
      height: 300,
      width: 450,
    };
    const textbox: PowerPoint.Shape = shapes.addTextBox("Hello World!", shapeOptions);
    textbox.name = "GreetingTextbox";
    await context.sync();
  });
}
