// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Blank App sub-tree for the wizard.
 * Auto-skips the single option and maps directly to the blank-app template.
 */
export const blankNode = {
  data: {
    title: "template.createProjectQuestion.projectType.blankApp.title",
    name: "capabilities",
    type: "singleSelect",
    skipSingleOption: true,
    options: [
      {
        id: "blank-app",
        label: "template.createProjectQuestion.projectType.blankApp.label",
        detail: "template.createProjectQuestion.projectType.blankApp.detail",
        data: "blank-app",
      },
    ],
  },
};
