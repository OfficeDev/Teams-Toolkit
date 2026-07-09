/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

/* global Office Word console */

/**
 * Insert a blue paragraph in word when the add-in command is executed.
 * @param event
 */
export async function insertBlueParagraphInWord(event: Office.AddinCommands.Event) {
  try {
    await Word.run(async (context) => {
      const paragraph = context.document.body.insertParagraph(
        "Hello World",
        Word.InsertLocation.end
      );
      paragraph.font.color = "blue";
      await context.sync();
    });
  } catch (error) {
    // Note: In a production add-in, notify the user through your add-in's UI.
    console.error(error);
  }

  // Be sure to indicate when the add-in command function is complete
  event.completed();
}
