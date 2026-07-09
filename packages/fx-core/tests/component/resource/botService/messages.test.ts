// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Ivan Jobs <ruhe@microsoft.com>
 */
import { getDefaultString, getLocalizedString } from "../../../../src/common/localizeUtils";
import { Messages } from "../../../../src/component/resource/botService/messages";
import { chai } from "vitest";
describe("Test Messages", () => {
  it("SomethingIsMissing", () => {
    const sth = "sth";
    const messages = Messages.SomethingIsMissing(sth);
    chai.expect(messages[0]).to.be.equals(getDefaultString("plugins.bot.SomethingIsMissing", sth));
    chai
      .expect(messages[1])
      .to.be.equals(getLocalizedString("plugins.bot.SomethingIsMissing", sth));
  });

  it("FailToProvisionSomeResource", () => {
    const resource = "webapp";
    const messages = Messages.FailToProvisionSomeResource(resource);
    chai
      .expect(messages[0])
      .to.be.equals(getDefaultString("plugins.bot.FailedToProvision", resource));
    chai
      .expect(messages[1])
      .to.be.equals(getLocalizedString("plugins.bot.FailedToProvision", resource));
  });

  it("FailToUpdateConfigs", () => {
    const sth = "sth";
    const messages = Messages.FailToUpdateConfigs(sth);
    chai
      .expect(messages[0])
      .to.be.equals(getDefaultString("plugins.bot.FailedToUpdateConfigs", sth));
    chai
      .expect(messages[1])
      .to.be.equals(getLocalizedString("plugins.bot.FailedToUpdateConfigs", sth));
  });

  it("BotResourceExist", () => {
    const place = "place";
    const message = Messages.BotResourceExist(place);
    chai.expect(message).to.be.equals(getLocalizedString("plugins.bot.BotResourceExists", place));
  });
});
