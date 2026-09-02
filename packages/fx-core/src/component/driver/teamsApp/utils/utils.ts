// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { includes } from "lodash";
import Mustache from "mustache";
import { AppDefinition } from "../interfaces/appdefinitions/appDefinition";
import { ConfigurableTab } from "../interfaces/appdefinitions/configurableTab";
import { getEnvironmentVariables } from "../../../utils/common";
import { WrapDriverContext } from "../../util/wrapUtil";
import { FxError, Result } from "@microsoft/teamsfx-api";
import { TelemetryPropertyKey } from "./telemetry";
import { resolveManifestWithContext, ManifestType } from "../../../utils/envFunctionUtils";
import { DriverContext } from "../../interface/commonArgs";
export { RetryHandler } from "../../../../common/retryHandler";

export function getCustomizedKeys(prefix: string, manifest: any): string[] {
  let keys: string[] = [];
  for (const key in manifest) {
    if (manifest.hasOwnProperty(key)) {
      const value = manifest[key];
      if (typeof value === "object") {
        if (Array.isArray(value)) {
          value.map((item, index) => {
            keys = keys.concat(getCustomizedKeys(`${prefix}.${key}[${index}]`, item));
          });
        } else {
          keys = keys.concat(getCustomizedKeys(`${prefix}.${key}`, value));
        }
      } else if (typeof value === "string" && value.startsWith("{{config.manifest")) {
        keys.push(`${prefix}.${key}`);
      }
    }
  }
  return keys;
}

export function renderTemplate(manifestString: string, view: any): string {
  // Unesacped HTML
  Mustache.escape = (value) => value;
  manifestString = Mustache.render(manifestString, view);
  return manifestString;
}

export function isPersonalApp(appDefinition: AppDefinition): boolean {
  const restrictedEntityIds: Array<string> = [
    "conversations",
    "recent",
    "about",
    "alltabs",
    "chat",
  ];
  if (!!appDefinition.staticTabs && appDefinition.staticTabs.length > 0) {
    return (
      appDefinition.staticTabs.filter((tab) => !restrictedEntityIds.includes(tab.entityId)).length >
      0
    );
  }

  return false;
}

export function isGroupApp(appDefinition: AppDefinition): boolean {
  return (
    !!appDefinition.configurableTabs &&
    appDefinition.configurableTabs.length > 0 &&
    groupAppConfigured(appDefinition.configurableTabs[0])
  );
}

export function needTabAndBotCode(appDefinition: AppDefinition): boolean {
  return needTabCode(appDefinition) && needBotCode(appDefinition);
}

export function needTabCode(appDefinition: AppDefinition): boolean {
  return (isPersonalApp(appDefinition) || isGroupApp(appDefinition)) && !needBotCode(appDefinition);
}

export function isBot(appDefinition: AppDefinition): boolean {
  return !!appDefinition.bots && appDefinition.bots.length > 0;
}

export function containsBotBasedMessageExtension(appDefinition: AppDefinition): boolean {
  return (
    !!appDefinition.messagingExtensions &&
    appDefinition.messagingExtensions.length > 0 &&
    !!appDefinition.messagingExtensions[0].botId
  );
}
export function isBotBasedMessageExtension(appDefinition: AppDefinition): boolean {
  return containsBotBasedMessageExtension(appDefinition) && !isBot(appDefinition);
}

export function isBotAndBotBasedMessageExtension(appDefinition: AppDefinition): boolean {
  return isBot(appDefinition) && isBotBasedMessageExtension(appDefinition);
}

export function needBotCode(appDefinition: AppDefinition): boolean {
  return isBot(appDefinition) || isBotBasedMessageExtension(appDefinition);
}

function isApiBasedMessageExtension(appDefinition: AppDefinition): boolean {
  return (
    !!appDefinition.messagingExtensions &&
    appDefinition.messagingExtensions.length > 0 &&
    appDefinition.messagingExtensions[0].messagingExtensionServiceType?.toLowerCase() === "apibased"
  );
}

export function containsUnsupportedFeature(appDefinition: AppDefinition): boolean {
  const hasScene = appDefinition?.meetingExtensionDefinition?.scenes?.length;
  const hasConnector = !!appDefinition?.connectors?.length;
  const hasActivies = appDefinition?.activities?.activityTypes?.length;

  return (
    !!hasScene ||
    !!hasConnector ||
    !!hasActivies ||
    hasMeetingExtension(appDefinition) ||
    isApiBasedMessageExtension(appDefinition)
  );
}

export function getFeaturesFromAppDefinition(appDefinition: AppDefinition): string[] {
  const features = [];
  const personalTab = "personal-tab";
  const groupTab = "group-tab";
  const bot = "bot";
  const messageExtension = "messaging-extension";

  if (isPersonalApp(appDefinition)) {
    features.push(personalTab);
  }

  if (isGroupApp(appDefinition)) {
    features.push(groupTab);
  }

  if (isBot(appDefinition)) {
    features.push(bot);
  }

  if (containsBotBasedMessageExtension(appDefinition)) {
    features.push(messageExtension);
  }

  return features;
}

export function hasMeetingExtension(appDefinition: AppDefinition): boolean {
  return (
    !!appDefinition.configurableTabs &&
    appDefinition.configurableTabs.length > 0 &&
    meetingExtensionConfigured(appDefinition.configurableTabs[0])
  );
}

const groupAppConfigured = (tab: ConfigurableTab) => {
  const validGroupAppContext =
    includes(tab.context, MeetingsContext.ChannelTab) ||
    includes(tab.context, MeetingsContext.PrivateChatTab);

  const validGroupAppScope =
    (!!tab.scopes && includeGroupChatScope(tab.scopes)) || includeTeamScope(tab.scopes);

  return validGroupAppScope && validGroupAppContext;
};

const meetingExtensionConfigured = (tab: ConfigurableTab) => {
  const validMeetingContext =
    includes(tab.context, MeetingsContext.SidePanel) ||
    includes(tab.context, MeetingsContext.DetailsTab) ||
    includes(tab.context, MeetingsContext.ChatTab);

  const validMeetingScope = !!tab.scopes && includeGroupChatScope(tab.scopes);

  return validMeetingScope && validMeetingContext;
};

const includeTeamScope = (scopes: string[]): boolean => {
  return !!scopes.find((scope) => scope.toLowerCase() === CommandScope.Team.toLowerCase());
};

const includeGroupChatScope = (scopes: string[]): boolean => {
  return !!scopes.find((scope) => scope.toLowerCase() === CommandScope.GroupChat.toLowerCase());
};

export enum CommandScope {
  Team = "team",
  Personal = "personal",
  GroupChat = "groupChat",
}

export enum MeetingsContext {
  ChannelTab = "channelTab",
  PrivateChatTab = "privateChatTab",
  SidePanel = "meetingSidePanel",
  ShareToStage = "meetingStage",
  DetailsTab = "meetingDetailsTab",
  ChatTab = "meetingChatTab",
}

export function normalizePath(path: string, useForwardSlash: boolean): string {
  return useForwardSlash ? path.replace(/\\/g, "/") : path;
}

export async function getResolvedManifest(
  content: string,
  path: string,
  manifestType: ManifestType,
  ctx: DriverContext
): Promise<Result<string, FxError>> {
  const vars = getEnvironmentVariables(content);
  let telemetryKey;
  switch (manifestType) {
    case ManifestType.ApiSpec:
      telemetryKey = TelemetryPropertyKey.customizedOpenAPIKeys;
      break;
    case ManifestType.PluginManifest:
      telemetryKey = TelemetryPropertyKey.customizedAIPluginKeys;
      break;
    case ManifestType.DeclarativeCopilotManifest:
      telemetryKey = TelemetryPropertyKey.customizedCopilotGptKeys;
      break;
    default:
      telemetryKey = TelemetryPropertyKey.customizedKeys;
      break;
  }

  if (ctx instanceof WrapDriverContext) {
    ctx.addTelemetryProperties({
      [telemetryKey]: vars.join(";"),
    });
  }

  return resolveManifestWithContext(content, ctx, manifestType, path);
}
