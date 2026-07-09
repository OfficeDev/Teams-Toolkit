import { CLICommand, ok } from "@microsoft/teamsfx-api";
import { cloneDeep } from "lodash";
import { helper } from "../../src/commands/helper";
import { getCreateCommand } from "../../src/commands/models/create";
import { createSampleCommand } from "../../src/commands/models/createSample";
import * as listTemplatesModule from "../../src/commands/models/listTemplates";
import { rootCommand } from "../../src/commands/models/root";
import { envAddCommand } from "../../src/commands/models/envAdd";
import { assert, vi } from "vitest";

describe("CLI helper", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("formatOptionName", async () => {
    it("should display required when require is true, displayRequired is true, withRequired is true", async () => {
      helper.displayRequired = true;
      const result = helper.formatOptionName({
        type: "string",
        description: "test",
        shortName: "a",
        required: true,
        name: "test-option-name",
      });
      assert.equal(result, "--test-option-name -a  [Required]");
    });
    it("should not display required when require is false, displayRequired is true, withRequired is true", async () => {
      helper.displayRequired = true;
      const result = helper.formatOptionName({
        type: "string",
        description: "test",
        shortName: "a",
        required: false,
        name: "test-option-name",
      });
      assert.equal(result, "--test-option-name -a");
    });
    it("should not display required when require is true, displayRequired is true, withRequired is false", async () => {
      helper.displayRequired = true;
      const result = helper.formatOptionName(
        {
          type: "string",
          description: "test",
          shortName: "a",
          required: true,
          name: "test-option-name",
        },
        false
      );
      assert.equal(result, "--test-option-name -a");
    });
    it("should not display required when require is true, displayRequired is false, withRequired is true", async () => {
      helper.displayRequired = false;
      const result = helper.formatOptionName(
        {
          type: "string",
          description: "test",
          shortName: "a",
          required: true,
          name: "test-option-name",
        },
        true
      );
      assert.equal(result, "--test-option-name -a");
    });
    it("should display required with indent when require is true, displayRequired is true, withRequired is true, insertIndent is true", async () => {
      helper.displayRequired = true;
      helper.termWidth = 40;
      const result = helper.formatOptionName(
        {
          type: "string",
          description: "test",
          shortName: "a",
          required: true,
          name: "test-option-name",
        },
        true,
        true
      );
      assert.equal(result, "--test-option-name -a         [Required]");
    });
  });

  describe("formatArgumentName", async () => {
    it("should display required argument", async () => {
      const result = helper.formatArgumentName({
        type: "string",
        description: "test",
        required: true,
        name: "test-argument-name",
      });
      assert.equal(result, "<test-argument-name>");
    });
    it("should display none-required argument", async () => {
      const result = helper.formatArgumentName({
        type: "string",
        description: "test",
        required: false,
        name: "test-argument-name",
      });
      assert.equal(result, "[test-argument-name]");
    });
  });

  describe("formatCommandName", async () => {
    it("should display required argument", async () => {
      const result = helper.formatCommandName({
        name: "test",
        fullName: "test",
        description: "test",
        options: [
          { type: "string", name: "test-option-name", description: "test option", required: true },
        ],
        arguments: [
          {
            type: "string",
            name: "test-argument-name",
            description: "test argument",
            required: true,
          },
        ],
        handler: async () => ok(undefined),
      });
      assert.equal(result, "test [options] <test-argument-name>");
    });
  });
  describe("formatSubCommandName", async () => {
    it("should display required argument", async () => {
      const result = helper.formatSubCommandName({
        name: "test",
        fullName: "test",
        description: "test",
        options: [
          { type: "string", name: "test-option-name", description: "test option", required: true },
        ],
        arguments: [
          {
            type: "string",
            name: "test-argument-name",
            description: "test argument",
            required: true,
          },
        ],
        handler: async () => ok(undefined),
      });
      assert.equal(result, "test [options] <test-argument-name>");
    });
  });
  describe("computePadWidth", async () => {
    it("happy path", async () => {
      const command: CLICommand = {
        name: "test",
        fullName: "test",
        description: "test",
        options: [
          { type: "string", name: "test-option-name", description: "test option", required: true },
        ],
        arguments: [
          {
            type: "string",
            name: "test-argument-name",
            description: "test argument",
            required: true,
          },
        ],
        handler: async () => ok(undefined),
      };
      const result = helper.computePadWidth(command, command);
      assert.equal(result, 30);
    });
  });

  describe("prettifyReturnLine", async () => {
    it("happy path 1", async () => {
      const res = helper.prettifyReturnLine(
        `--capability -c        [Required]  Specifies the app feature. Allowed value: ["bot", "notification", "command-bot", etc.]. Use 'help --list-capabilities' to see all available options.`,
        159,
        35,
        40
      );
      assert.equal(
        res,
        `--capability -c        [Required]  Specifies the app feature. Allowed value: ["bot", "notification", "command-bot", etc.]. Use 'help --list-capabilities' to\n                                   see all available options.`
      );
    });

    it("happy path 2", async () => {
      const res = helper.prettifyReturnLine(
        `--capability -c        [Required]  Specifies the app feature. Allowed value: ["bot", "notification", "command-bot", etc.]. Use 'help --list-capabilities' to see all available options.`,
        60,
        35,
        40
      );
      assert.equal(
        res,
        `--capability -c        [Required]  Specifies the app feature. Allowed value: ["bot", "notification", "command-bot", etc.]. Use 'help --list-capabilities' to see all available options.`
      );
    });
  });

  describe("formatItem", async () => {
    it("happy path", async () => {
      (helper as any).termWidth = 40;
      const res = helper.formatItem(
        "--capability -c        [Required]",
        `Specifies the app feature. Allowed value: ["bot", "notification", "command-bot", etc.]. Use 'help --list-capabilities' to see all available options.`
      );
      assert.equal(
        res,
        `--capability -c        [Required]         Specifies the app feature. Allowed value: ["bot", "notification", "command-bot", etc.]. Use 'help --list-capabilities' to see all available options.`
      );
    });
    it("happy path 2", async () => {
      const res = helper.formatItem("--capability -c        [Required]", "");
      assert.equal(res, "--capability -c        [Required]");
    });
  });

  describe("formatAllowedValue", async () => {
    it("happy path", async () => {
      const res = helper.formatAllowedValue(["a", "b", "c", "d"]);
      assert.equal(res, `Allowed value: ["a", "b", "c", etc.].`);
    });
  });

  describe("formatArgumentDescription", async () => {
    it("happy path", async () => {
      const res = helper.formatArgumentDescription({
        type: "string",
        name: "test",
        description: "Description.",
        default: "a",
        choices: ["a", "b", "c", "d"],
        choiceListCommand: "list",
      });
      assert.equal(
        res,
        `Description. Allowed value: ["a", "b", "c", etc.]. Default value: "a". Use 'list' to see all available options.`
      );
    });
  });
  describe("formatOptionDescription", async () => {
    it("happy path", async () => {
      const res = helper.formatOptionDescription({
        type: "string",
        name: "test",
        description: "Description.",
        default: "a",
        choices: ["a", "b", "c", "d"],
        choiceListCommand: "list",
      });
      assert.equal(
        res,
        `Description. Allowed value: ["a", "b", "c", etc.]. Default value: "a". Use 'list' to see all available options.`
      );
    });
  });
  describe("formatHelp", async () => {
    it("happy path for 'new -h'", async () => {
      vi.spyOn(listTemplatesModule, "listAllTemplates").mockReturnValue([
        {
          name: "bot",
          alias: "bot",
          displayName: "Bot",
          description: "A bot",
          language: "typescript",
        },
      ]);
      const rcommand = cloneDeep(rootCommand);
      rcommand.header = "Header:";
      rcommand.footer = "Footer:";
      rcommand.sortOptions = true;
      const res = helper.formatHelp(getCreateCommand(), rcommand);
      assert.include(res, "Header:");
      assert.include(res, "Footer:");
      assert.include(res, "Usage:");
      assert.include(res, "Options:");
      assert.include(res, "Global Options:");
      assert.include(res, "Commands:");
      assert.include(res, "Examples:");
    });
    it("happy path for 'new sample -h'", async () => {
      const command = createSampleCommand;
      const res = helper.formatHelp(command, rootCommand);
      assert.include(res, "<sample-name>");
    });
    it("happy path for 'env add -h'", async () => {
      const command = envAddCommand;
      const res = helper.formatHelp(command, rootCommand);
      assert.include(res, "Run the command in interactive mode. Default value: false.");
    });
  });
});
