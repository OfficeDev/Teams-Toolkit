// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FeatureFlagName, isFeatureFlagEnabled } from "../common/featureFlags";
import { DevPortalClient, devPortalClient } from "./devPortalClient";
import { TeamsDevPortalClient, legacyTeamsDevPortalClient } from "./teamsDevPortalClient";

const unsupportedNewApi = (): never => {
  throw new Error("The operation requires the new Developer Portal APIs.");
};
const facadeTarget = Object.create(TeamsDevPortalClient.prototype) as DevPortalClient;
Object.defineProperties(facadeTarget, {
  createApp: { configurable: true, writable: true, value: unsupportedNewApi },
  updateApp: { configurable: true, writable: true, value: unsupportedNewApi },
});
const concreteDescriptors = new Map<
  PropertyKey,
  [PropertyDescriptor | undefined, PropertyDescriptor | undefined]
>();

export function isUsingNewDeveloperPortalApis(): boolean {
  return isFeatureFlagEnabled(FeatureFlagName.NewDeveloperPortalApis);
}

export function getActiveTeamsDevPortalClient(): TeamsDevPortalClient | DevPortalClient {
  return isUsingNewDeveloperPortalApis() ? devPortalClient : legacyTeamsDevPortalClient;
}

export const teamsDevPortalClient = new Proxy(facadeTarget, {
  get(target, property, receiver) {
    if (Object.prototype.hasOwnProperty.call(target, property)) {
      const ownValue = Reflect.get(target, property, receiver);
      if (ownValue !== unsupportedNewApi) return ownValue;
    }
    const activeClient = getActiveTeamsDevPortalClient();
    const value = Reflect.get(activeClient, property, activeClient);
    if (value === undefined && Reflect.get(target, property, receiver) === unsupportedNewApi) {
      return unsupportedNewApi;
    }
    return typeof value === "function" ? value.bind(activeClient) : value;
  },
  set(target, property, value, receiver) {
    if (
      Object.prototype.hasOwnProperty.call(target, property) ||
      typeof Reflect.get(getActiveTeamsDevPortalClient(), property) === "function"
    ) {
      return Reflect.set(target, property, value, receiver);
    }
    return Reflect.set(getActiveTeamsDevPortalClient(), property, value);
  },
  defineProperty(target, property, descriptor) {
    if (!concreteDescriptors.has(property)) {
      concreteDescriptors.set(property, [
        Object.getOwnPropertyDescriptor(legacyTeamsDevPortalClient, property),
        Object.getOwnPropertyDescriptor(devPortalClient, property),
      ]);
    }
    Object.defineProperty(legacyTeamsDevPortalClient, property, descriptor);
    Object.defineProperty(devPortalClient, property, descriptor);
    return Reflect.defineProperty(target, property, descriptor);
  },
  deleteProperty(target, property) {
    const descriptors = concreteDescriptors.get(property);
    if (descriptors) {
      const clients = [legacyTeamsDevPortalClient, devPortalClient];
      descriptors.forEach((descriptor, index) => {
        const client = clients[index];
        if (descriptor) {
          Object.defineProperty(client, property, descriptor);
        } else {
          Reflect.deleteProperty(client, property);
        }
      });
      concreteDescriptors.delete(property);
    }
    return Reflect.deleteProperty(target, property);
  },
});
