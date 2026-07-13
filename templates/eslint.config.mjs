import shared from "../packages/eslint-plugin-teamsfx/config/shared.mjs";

export default [
  {
    ignores: [
      "**/*.css",
      "vsc/ts/office-addin-wxpo-taskpane/**",
      "vsc/ts/office-addin-outlook-taskpane/**",
      "vsc/ts/office-addin-excel-cfshortcut/**",
      "vsc/ts/office-addin-excel-customfunctions/**",
      "vsc/ts/office-addin-sso-naa/**",
    ],
  },
  ...shared,
];
