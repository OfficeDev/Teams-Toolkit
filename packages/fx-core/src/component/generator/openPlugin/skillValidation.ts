// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import yaml from "js-yaml";
import { isRecord } from "./validation";

const SKILL_FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKILL_NAME_MAX_LENGTH = 64;
const SKILL_DESCRIPTION_MAX_LENGTH = 1024;
const SKILL_COMPATIBILITY_MAX_LENGTH = 500;

export async function getAgentSkillValidationError(
  skillName: string,
  skillMdPath: string
): Promise<string | undefined> {
  if (skillName.length > SKILL_NAME_MAX_LENGTH || !SKILL_NAME_RE.test(skillName)) {
    return "folder name must contain only lowercase letters, numbers, and single hyphens";
  }

  const source = await fs.readFile(skillMdPath, "utf8");
  const match = SKILL_FRONTMATTER_RE.exec(source);
  if (!match) return "SKILL.md must begin with YAML frontmatter";

  let frontmatter: unknown;
  try {
    frontmatter = yaml.load(match[1]);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `SKILL.md frontmatter is not valid YAML: ${detail}`;
  }
  if (!isRecord(frontmatter)) return "SKILL.md frontmatter must be a YAML mapping";

  if (frontmatter.name !== skillName) {
    return `frontmatter name must exactly match the parent folder '${skillName}'`;
  }
  if (
    typeof frontmatter.description !== "string" ||
    frontmatter.description.length < 1 ||
    frontmatter.description.length > SKILL_DESCRIPTION_MAX_LENGTH
  ) {
    return `frontmatter description must contain 1-${SKILL_DESCRIPTION_MAX_LENGTH} characters`;
  }
  if (
    frontmatter.license !== undefined &&
    (typeof frontmatter.license !== "string" || frontmatter.license.length < 1)
  ) {
    return "frontmatter license must be a non-empty string";
  }
  if (
    frontmatter.compatibility !== undefined &&
    (typeof frontmatter.compatibility !== "string" ||
      frontmatter.compatibility.length < 1 ||
      frontmatter.compatibility.length > SKILL_COMPATIBILITY_MAX_LENGTH)
  ) {
    return `frontmatter compatibility must contain 1-${SKILL_COMPATIBILITY_MAX_LENGTH} characters`;
  }
  if (frontmatter.metadata !== undefined && !hasStringValues(frontmatter.metadata)) {
    return "frontmatter metadata must map string keys to string values";
  }
  if (
    frontmatter["allowed-tools"] !== undefined &&
    typeof frontmatter["allowed-tools"] !== "string"
  ) {
    return "frontmatter allowed-tools must be a string";
  }
  return undefined;
}

function hasStringValues(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}
