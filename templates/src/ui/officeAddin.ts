// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Office Add-in sub-tree for the wizard.
 * Serialized to officeAddinNode.json at build time.
 */
export const officeAddinNode = {
  data: {
    name: "capabilities",
    title: "template.createProjectQuestion.projectType.officeAddin.title",
    type: "singleSelect",
    placeholder: "template.createCapabilityQuestion.placeholder",
    options: [
      {
        id: "wxp-json-taskpane",
        label: "template.newTaskpaneAddin.label",
        detail: "template.newTaskpaneAddin.detail",
        data: "office-addin-wxpo-taskpane",
      },
      {
        id: "wxp-json-cf-shortcut",
        label: "template.newCFShortcut.label",
        detail: "template.newCFShortcut.detail",
        data: "office-addin-excel-cfshortcut",
        featureFlag: "TEAMSFX_CF_SHORTCUT_METAOS",
      },
      {
        id: "wxp-json-excel-cf",
        label: "template.newExcelCustomFunctions.label",
        detail: "template.newExcelCustomFunctions.detail",
        data: "office-addin-excel-customfunctions",
      },
      {
        id: "wxp-json-sso-naa",
        label: "template.newSsoNaa.label",
        detail: "template.newSsoNaa.detail",
        data: "office-addin-sso-naa",
      },
      {
        id: "office-addin-import",
        label: "template.importOfficeAddin.label",
        detail: "template.importAddin.detail",
        data: "office-addin-config",
      },
    ],
  },
  children: [
    {
      condition: { equals: "wxp-json-taskpane" },
      node: "officeAddinHostsNode",
    },
    {
      condition: { equals: "wxp-json-sso-naa" },
      node: "officeAddinNaaHostNode",
    },
    {
      condition: { equals: "office-addin-import" },
      node: "officeAddinImportNode",
    },
  ],
};
