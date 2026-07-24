{{#HostWord}}import { insertBlueParagraphInWord } from "./word";
{{/HostWord}}{{#HostExcel}}import { setRangeColorInExcel } from "./excel";
{{/HostExcel}}{{#HostPowerPoint}}import { insertTextInPowerPoint } from "./powerpoint";
{{/HostPowerPoint}}{{#HostOutlook}}import { setNotificationInOutlook } from "./outlook";
{{/HostOutlook}}
/* global Office */

// Register the add-in commands with the Office host application.
Office.onReady(async (info) => {
  switch (info.host) {
    {{#HostWord}}case Office.HostType.Word:
      Office.actions.associate("action", insertBlueParagraphInWord);
      break;
    {{/HostWord}}{{#HostExcel}}case Office.HostType.Excel:
      Office.actions.associate("action", setRangeColorInExcel);
      break;
    {{/HostExcel}}{{#HostPowerPoint}}case Office.HostType.PowerPoint:
      Office.actions.associate("action", insertTextInPowerPoint);
      break;
    {{/HostPowerPoint}}{{#HostOutlook}}case Office.HostType.Outlook:
      Office.actions.associate("action", setNotificationInOutlook);
      break;
    {{/HostOutlook}}default: {
      throw new Error(`${info.host} not supported.`);
    }
  }
});
