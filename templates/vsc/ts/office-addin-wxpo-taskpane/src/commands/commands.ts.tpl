{{#word}}import { insertBlueParagraphInWord } from "./word";
{{/word}}{{#excel}}import { setRangeColorInExcel } from "./excel";
{{/excel}}{{#powerpoint}}import { insertTextInPowerPoint } from "./powerpoint";
{{/powerpoint}}{{#outlook}}import { setNotificationInOutlook } from "./outlook";
{{/outlook}}

/* global Office */

// Register the add-in commands with the Office host application.
Office.onReady(async (info) => {
  switch (info.host) {
{{#word}}    case Office.HostType.Word:
      Office.actions.associate("action", insertBlueParagraphInWord);
      break;
{{/word}}{{#excel}}    case Office.HostType.Excel:
      Office.actions.associate("action", setRangeColorInExcel);
      break;
{{/excel}}{{#powerpoint}}    case Office.HostType.PowerPoint:
      Office.actions.associate("action", insertTextInPowerPoint);
      break;
{{/powerpoint}}{{#outlook}}    case Office.HostType.Outlook:
      Office.actions.associate("action", setNotificationInOutlook);
      break;
{{/outlook}}    default: {
      throw new Error(`${info.host} not supported.`);
    }
  }
});
