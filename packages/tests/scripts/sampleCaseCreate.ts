import fs from "fs-extra";
import path from "path";
import { TemplateProjectFolder } from "../src/utils/constants";
const pvtFile = path.join(__dirname, "./pvt.json");
const sampleFile = path.join(__dirname, "../", "samples-config-v3.json");
const samplesData = fs.readJSONSync(sampleFile).samples;

const windows_22 = [
  "sample-outlook-signature",
  "sample-food-catalog",
  "sample-query-org",
  "sample-assistant-dashboard",
];
const ubuntu_22 = [
  "sample-todo-list-sql",
  "sample-hello-world-tab-docker",
  "sample-todo-list-with-m365",
  "sample-dice-roller",
  "sample-todo-list-with-spfx",
  "sample-spfx-productivity-dashboard",
  "sample-react-retail-dashboard",
  "sample-proactive-message",
  // "sample-share-now", //share now sql resource will casue security issue temporarily disabled
];

const sampleRecord: any = {
  [TemplateProjectFolder.HelloWorldTabBackEnd]:
    "sample-hello-world-tab-with-backend",
  [TemplateProjectFolder.ContactExporter]: "sample-contact-exporter",
  [TemplateProjectFolder.HelloWorldBotSSO]: "sample-bot-sso",
  [TemplateProjectFolder.TodoListSpfx]: "sample-todo-list-with-spfx",
  [TemplateProjectFolder.MyFirstMeeting]: "sample-hello-world-meeting",
  [TemplateProjectFolder.TodoListM365]: "sample-todo-list-with-m365",
  [TemplateProjectFolder.NpmSearch]: "sample-npm-search",
  [TemplateProjectFolder.AdaptiveCard]: "sample-adaptive-card",
  [TemplateProjectFolder.StockUpdate]: "sample-stock-update",
  [TemplateProjectFolder.QueryOrg]: "sample-query-org",
  [TemplateProjectFolder.Dashboard]: "sample-dashboard",
  [TemplateProjectFolder.CopilotConnector]: "sample-copilot-connector",
  [TemplateProjectFolder.OneProductivityHub]: "sample-one-productivity-hub",
  [TemplateProjectFolder.TodoListBackend]: "sample-todo-list-sql",
  [TemplateProjectFolder.ShareNow]: "sample-share-now",
  [TemplateProjectFolder.OutlookTab]: "sample-hello-world-tab-outlook",
  [TemplateProjectFolder.AssistDashboard]: "sample-assistant-dashboard",
  [TemplateProjectFolder.DiceRoller]: "sample-dice-roller",
  [TemplateProjectFolder.SpfxProductivity]:
    "sample-spfx-productivity-dashboard",
  [TemplateProjectFolder.RetailDashboard]: "sample-react-retail-dashboard",
  [TemplateProjectFolder.TabSSOApimProxy]: "sample-sso-tab-via-apim-proxy",
  [TemplateProjectFolder.LargeScaleBot]: "sample-large-scale-notification",
  [TemplateProjectFolder.CopilotConnectorBot]: "sample-copilot-connector-bot",
  [TemplateProjectFolder.BotSSODocker]: "sample-bot-sso-docker",
  [TemplateProjectFolder.HelloWorldTabDocker]: "sample-hello-world-tab-docker",
  "outlook-add-in-set-signature": "sample-outlook-signature",
  "reddit-link-unfurling": "sample-reddit-link",
  "teams-chef-bot": "sample-chef-bot",
  [TemplateProjectFolder.ProactiveMessaging]: "sample-proactive-message",
  "gc-nodejs-typescript-food-catalog": "sample-food-catalog",
  "bot-conversation-python": "",
  "msgext-search-python": "",
  "graph-rsc-helper": "",
  "hello-world-office-addin": "",
  "nodejs-typescript-policies": "",
  "da-ristorante-api": "",
};

function main() {
  const pvtData = fs.readJSONSync(pvtFile);
  const samplesOnGallery = samplesData.map((sample: any) => sample.id);
  console.log("samplesOnGallery", samplesOnGallery);
  for (const sample of samplesOnGallery) {
    if (sampleRecord[sample]) {
      if (windows_22.includes(sampleRecord[sample])) {
        try {
          pvtData["windows-latest"]["node-22"].push(sampleRecord[sample]);
          console.log(
            `add sample ${sampleRecord[sample]} to windows-latest node-22`,
          );
        } catch (error) {
          console.log("there is no windows-latest node-22 in pvt.json", error);
        }
      } else if (ubuntu_22.includes(sampleRecord[sample])) {
        try {
          pvtData["ubuntu-latest"]["node-22"].push(sampleRecord[sample]);
          console.log(
            `add sample ${sampleRecord[sample]} to ubuntu-latest node-22`,
          );
        } catch (error) {
          console.log("there is no ubuntu-latest node-22 in pvt.json", error);
        }
      }
    }
  }
  fs.writeJSONSync(pvtFile, pvtData, { spaces: 2 });
}

main();
