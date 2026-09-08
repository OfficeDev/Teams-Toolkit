// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { JSONSchemaType } from "ajv";
import Ajv04 from "ajv-draft-04";
import addFormats from "ajv-formats";
import Ajv2020 from "ajv/dist/2020";
import fs from "fs-extra";
import fetch from "../fetchHelper";
import path from "path";
import { SchemaFetchError } from "../SchemaFetchError";
import stripBom from "strip-bom";
import * as DeclarativeAgentManifestV1D0 from "./copilot/declarative-agent/DeclarativeAgentManifestV1D0";
import * as DeclarativeAgentManifestV1D2 from "./copilot/declarative-agent/DeclarativeAgentManifestV1D2";
import * as DeclarativeAgentManifestV1D3 from "./copilot/declarative-agent/DeclarativeAgentManifestV1D3";
import * as DeclarativeAgentManifestV1D4 from "./copilot/declarative-agent/DeclarativeAgentManifestV1D4";
import * as DeclarativeAgentManifestV1D5 from "./copilot/declarative-agent/DeclarativeAgentManifestV1D5";
import * as DeclarativeAgentManifestV1D6 from "./copilot/declarative-agent/DeclarativeAgentManifestV1D6";
import * as DeclarativeAgentManifestV1D7 from "./copilot/declarative-agent/DeclarativeAgentManifestV1D7";
import * as DeclarativeAgentManifestV1D8 from "./copilot/declarative-agent/DeclarativeAgentManifestV1D8";
import * as APIPluginManifestV2D1 from "./copilot/plugin/ApiPluginManifestV2D1";
import * as APIPluginManifestV2D2 from "./copilot/plugin/ApiPluginManifestV2D2";
import * as APIPluginManifestV2D3 from "./copilot/plugin/ApiPluginManifestV2D3";
import * as APIPluginManifestV2D4 from "./copilot/plugin/ApiPluginManifestV2D4";
import * as TeamsManifestV1D0 from "./teams/TeamsManifestV1D0";
import * as TeamsManifestV1D1 from "./teams/TeamsManifestV1D1";
import * as TeamsManifestV1D10 from "./teams/TeamsManifestV1D10";
import * as TeamsManifestV1D11 from "./teams/TeamsManifestV1D11";
import * as TeamsManifestV1D12 from "./teams/TeamsManifestV1D12";
import * as TeamsManifestV1D13 from "./teams/TeamsManifestV1D13";
import * as TeamsManifestV1D14 from "./teams/TeamsManifestV1D14";
import * as TeamsManifestV1D15 from "./teams/TeamsManifestV1D15";
import * as TeamsManifestV1D16 from "./teams/TeamsManifestV1D16";
import * as TeamsManifestV1D17 from "./teams/TeamsManifestV1D17";
import * as TeamsManifestV1D19 from "./teams/TeamsManifestV1D19";
import * as TeamsManifestV1D2 from "./teams/TeamsManifestV1D2";
import * as TeamsManifestV1D20 from "./teams/TeamsManifestV1D20";
import * as TeamsManifestV1D21 from "./teams/TeamsManifestV1D21";
import * as TeamsManifestV1D22 from "./teams/TeamsManifestV1D22";
import * as TeamsManifestV1D23 from "./teams/TeamsManifestV1D23";
import * as TeamsManifestV1D24 from "./teams/TeamsManifestV1D24";
import * as TeamsManifestV1D25 from "./teams/TeamsManifestV1D25";
import * as TeamsManifestV1D26 from "./teams/TeamsManifestV1D26";
import * as TeamsManifestV1D27 from "./teams/TeamsManifestV1D27";
import * as TeamsManifestV1D28 from "./teams/TeamsManifestV1D28";
import * as TeamsManifestV1D29 from "./teams/TeamsManifestV1D29";
import * as TeamsManifestV1D3 from "./teams/TeamsManifestV1D3";
import * as TeamsManifestV1D30 from "./teams/TeamsManifestV1D30";
import * as TeamsManifestV1D4 from "./teams/TeamsManifestV1D4";
import * as TeamsManifestV1D5 from "./teams/TeamsManifestV1D5";
import * as TeamsManifestV1D6 from "./teams/TeamsManifestV1D6";
import * as TeamsManifestV1D7 from "./teams/TeamsManifestV1D7";
import * as TeamsManifestV1D8 from "./teams/TeamsManifestV1D8";
import * as TeamsManifestV1D9 from "./teams/TeamsManifestV1D9";
import * as TeamsManifestVDevPreview from "./teams/TeamsManifestVDevPreview";
export {
  APIPluginManifestV2D1,
  APIPluginManifestV2D2,
  APIPluginManifestV2D3,
  APIPluginManifestV2D4,
  DeclarativeAgentManifestV1D0,
  DeclarativeAgentManifestV1D2,
  DeclarativeAgentManifestV1D3,
  DeclarativeAgentManifestV1D4,
  DeclarativeAgentManifestV1D5,
  DeclarativeAgentManifestV1D6,
  DeclarativeAgentManifestV1D7,
  DeclarativeAgentManifestV1D8,
  TeamsManifestV1D0,
  TeamsManifestV1D1,
  TeamsManifestV1D10,
  TeamsManifestV1D11,
  TeamsManifestV1D12,
  TeamsManifestV1D13,
  TeamsManifestV1D14,
  TeamsManifestV1D15,
  TeamsManifestV1D16,
  TeamsManifestV1D17,
  TeamsManifestV1D19,
  TeamsManifestV1D2,
  TeamsManifestV1D20,
  TeamsManifestV1D21,
  TeamsManifestV1D22,
  TeamsManifestV1D23,
  TeamsManifestV1D24,
  TeamsManifestV1D25,
  TeamsManifestV1D26,
  TeamsManifestV1D27,
  TeamsManifestV1D28,
  TeamsManifestV1D29,
  TeamsManifestV1D3,
  TeamsManifestV1D30,
  TeamsManifestV1D4,
  TeamsManifestV1D5,
  TeamsManifestV1D6,
  TeamsManifestV1D7,
  TeamsManifestV1D8,
  TeamsManifestV1D9,
  TeamsManifestVDevPreview,
};

export { TeamsManifestVDevPreview as DevPreviewSchema } from "./teams/TeamsManifestVDevPreview";
export type TeamsManifest =
  | (TeamsManifestV1D0.TeamsManifestV1D0 & { manifestVersion: "1.0"; $schema?: string })
  | (TeamsManifestV1D1.TeamsManifestV1D1 & { manifestVersion: "1.1" })
  | (TeamsManifestV1D2.TeamsManifestV1D2 & { manifestVersion: "1.2" })
  | (TeamsManifestV1D3.TeamsManifestV1D3 & { manifestVersion: "1.3" })
  | (TeamsManifestV1D4.TeamsManifestV1D4 & { manifestVersion: "1.4" })
  | TeamsManifestV1D5.TeamsManifestV1D5
  | TeamsManifestV1D6.TeamsManifestV1D6
  | TeamsManifestV1D7.TeamsManifestV1D7
  | TeamsManifestV1D8.TeamsManifestV1D8
  | TeamsManifestV1D9.TeamsManifestV1D9
  | TeamsManifestV1D10.TeamsManifestV1D10
  | TeamsManifestV1D11.TeamsManifestV1D11
  | TeamsManifestV1D12.TeamsManifestV1D12
  | TeamsManifestV1D13.TeamsManifestV1D13
  | TeamsManifestV1D14.TeamsManifestV1D14
  | TeamsManifestV1D15.TeamsManifestV1D15
  | TeamsManifestV1D16.TeamsManifestV1D16
  | TeamsManifestV1D17.TeamsManifestV1D17
  | TeamsManifestV1D19.TeamsManifestV1D19
  | TeamsManifestV1D20.TeamsManifestV1D20
  | TeamsManifestV1D21.TeamsManifestV1D21
  | TeamsManifestV1D22.TeamsManifestV1D22
  | TeamsManifestV1D23.TeamsManifestV1D23
  | TeamsManifestV1D24.TeamsManifestV1D24
  | TeamsManifestV1D25.TeamsManifestV1D25
  | TeamsManifestV1D26.TeamsManifestV1D26
  | TeamsManifestV1D27.TeamsManifestV1D27
  | TeamsManifestV1D28.TeamsManifestV1D28
  | TeamsManifestV1D29.TeamsManifestV1D29
  | TeamsManifestV1D30.TeamsManifestV1D30
  | TeamsManifestVDevPreview.TeamsManifestVDevPreview;

export type TeamsManifestLatest = TeamsManifestV1D30.TeamsManifestV1D30;

export { SensitivityLabel } from "./copilot/declarative-agent/DeclarativeAgentManifestV1D7";
export { AgentSkill } from "./teams/TeamsManifestVDevPreview";

/**
 * Identifies an agent skill directory to bundle with the declarative agent.
 *
 * NOTE: `agent_skills` is a preview feature that is not yet part of a published declarative
 * agent schema version. This helper type is provided so consumers that need it (for example
 * the manifest wrapper) can add `agent_skills` as an optional property only where required.
 * It is intentionally not merged into the declarative agent manifest types.
 */
export interface AgentSkillElement {
  folder: string;
  [property: string]: any;
}

export type DeclarativeAgentManifest =
  | DeclarativeAgentManifestV1D0.DeclarativeAgentManifestV1D0
  | DeclarativeAgentManifestV1D2.DeclarativeAgentManifestV1D2
  | DeclarativeAgentManifestV1D3.DeclarativeAgentManifestV1D3
  | DeclarativeAgentManifestV1D4.DeclarativeAgentManifestV1D4
  | DeclarativeAgentManifestV1D5.DeclarativeAgentManifestV1D5
  | DeclarativeAgentManifestV1D6.DeclarativeAgentManifestV1D6
  | DeclarativeAgentManifestV1D7.DeclarativeAgentManifestV1D7
  | DeclarativeAgentManifestV1D8.DeclarativeAgentManifestV1D8;

export type DeclarativeAgentManifestLatest =
  DeclarativeAgentManifestV1D8.DeclarativeAgentManifestV1D8;

export type APIPluginManifest =
  | APIPluginManifestV2D1.APIPluginManifestV2D1
  | APIPluginManifestV2D2.APIPluginManifestV2D2
  | APIPluginManifestV2D3.APIPluginManifestV2D3
  | APIPluginManifestV2D4.APIPluginManifestV2D4;
export type APIPluginManifestLatest = APIPluginManifestV2D4.APIPluginManifestV2D4;

export type AppManifest = TeamsManifest | DeclarativeAgentManifest | APIPluginManifest;

type Converters = {
  [key: string]: [(json: string) => any, (manifest: any) => string];
};
const TeamsManifestConverterMap: Converters = {
  "1.1": [
    TeamsManifestV1D1.Convert.toTeamsManifestV1D1,
    TeamsManifestV1D1.Convert.teamsManifestV1D1ToJson,
  ],
  "1.2": [
    TeamsManifestV1D2.Convert.toTeamsManifestV1D2,
    TeamsManifestV1D2.Convert.teamsManifestV1D2ToJson,
  ],
  "1.3": [
    TeamsManifestV1D3.Convert.toTeamsManifestV1D3,
    TeamsManifestV1D3.Convert.teamsManifestV1D3ToJson,
  ],
  "1.4": [
    TeamsManifestV1D4.Convert.toTeamsManifestV1D4,
    TeamsManifestV1D4.Convert.teamsManifestV1D4ToJson,
  ],
  "1.5": [
    TeamsManifestV1D5.Convert.toTeamsManifestV1D5,
    TeamsManifestV1D5.Convert.teamsManifestV1D5ToJson,
  ],
  "1.6": [
    TeamsManifestV1D6.Convert.toTeamsManifestV1D6,
    TeamsManifestV1D6.Convert.teamsManifestV1D6ToJson,
  ],
  "1.7": [
    TeamsManifestV1D7.Convert.toTeamsManifestV1D7,
    TeamsManifestV1D7.Convert.teamsManifestV1D7ToJson,
  ],
  "1.8": [
    TeamsManifestV1D8.Convert.toTeamsManifestV1D8,
    TeamsManifestV1D8.Convert.teamsManifestV1D8ToJson,
  ],
  "1.9": [
    TeamsManifestV1D9.Convert.toTeamsManifestV1D9,
    TeamsManifestV1D9.Convert.teamsManifestV1D9ToJson,
  ],
  "1.10": [
    TeamsManifestV1D10.Convert.toTeamsManifestV1D10,
    TeamsManifestV1D10.Convert.teamsManifestV1D10ToJson,
  ],
  "1.11": [
    TeamsManifestV1D11.Convert.toTeamsManifestV1D11,
    TeamsManifestV1D11.Convert.teamsManifestV1D11ToJson,
  ],
  "1.12": [
    TeamsManifestV1D12.Convert.toTeamsManifestV1D12,
    TeamsManifestV1D12.Convert.teamsManifestV1D12ToJson,
  ],
  "1.13": [
    TeamsManifestV1D13.Convert.toTeamsManifestV1D13,
    TeamsManifestV1D13.Convert.teamsManifestV1D13ToJson,
  ],
  "1.14": [
    TeamsManifestV1D14.Convert.toTeamsManifestV1D14,
    TeamsManifestV1D14.Convert.teamsManifestV1D14ToJson,
  ],
  "1.15": [
    TeamsManifestV1D15.Convert.toTeamsManifestV1D15,
    TeamsManifestV1D15.Convert.teamsManifestV1D15ToJson,
  ],
  "1.16": [
    TeamsManifestV1D16.Convert.toTeamsManifestV1D16,
    TeamsManifestV1D16.Convert.teamsManifestV1D16ToJson,
  ],
  "1.17": [
    TeamsManifestV1D17.Convert.toTeamsManifestV1D17,
    TeamsManifestV1D17.Convert.teamsManifestV1D17ToJson,
  ],
  "1.19": [
    TeamsManifestV1D19.Convert.toTeamsManifestV1D19,
    TeamsManifestV1D19.Convert.teamsManifestV1D19ToJson,
  ],
  "1.20": [
    TeamsManifestV1D20.Convert.toTeamsManifestV1D20,
    TeamsManifestV1D20.Convert.teamsManifestV1D20ToJson,
  ],
  "1.21": [
    TeamsManifestV1D21.Convert.toTeamsManifestV1D21,
    TeamsManifestV1D21.Convert.teamsManifestV1D21ToJson,
  ],
  "1.22": [
    TeamsManifestV1D22.Convert.toTeamsManifestV1D22,
    TeamsManifestV1D22.Convert.teamsManifestV1D22ToJson,
  ],
  "1.23": [
    TeamsManifestV1D23.Convert.toTeamsManifestV1D23,
    TeamsManifestV1D23.Convert.teamsManifestV1D23ToJson,
  ],
  "1.24": [
    TeamsManifestV1D24.Convert.toTeamsManifestV1D24,
    TeamsManifestV1D24.Convert.teamsManifestV1D24ToJson,
  ],
  "1.25": [
    TeamsManifestV1D25.Convert.toTeamsManifestV1D25,
    TeamsManifestV1D25.Convert.teamsManifestV1D25ToJson,
  ],
  "1.26": [
    TeamsManifestV1D26.Convert.toTeamsManifestV1D26,
    TeamsManifestV1D26.Convert.teamsManifestV1D26ToJson,
  ],
  "1.27": [
    TeamsManifestV1D27.Convert.toTeamsManifestV1D27,
    TeamsManifestV1D27.Convert.teamsManifestV1D27ToJson,
  ],
  "1.28": [
    TeamsManifestV1D28.Convert.toTeamsManifestV1D28,
    TeamsManifestV1D28.Convert.teamsManifestV1D28ToJson,
  ],
  "1.29": [
    TeamsManifestV1D29.Convert.toTeamsManifestV1D29,
    TeamsManifestV1D29.Convert.teamsManifestV1D29ToJson,
  ],
  "1.30": [
    TeamsManifestV1D30.Convert.toTeamsManifestV1D30,
    TeamsManifestV1D30.Convert.teamsManifestV1D30ToJson,
  ],
  devPreview: [
    TeamsManifestVDevPreview.Convert.toTeamsManifestVDevPreview,
    TeamsManifestVDevPreview.Convert.teamsManifestVDevPreviewToJson,
  ],
};
const daConverterMap: Converters = {
  "v1.0": [
    DeclarativeAgentManifestV1D0.Convert.toDeclarativeAgentManifestV1D0,
    DeclarativeAgentManifestV1D0.Convert.declarativeAgentManifestV1D0ToJson,
  ],
  "v1.2": [
    DeclarativeAgentManifestV1D2.Convert.toDeclarativeAgentManifestV1D2,
    DeclarativeAgentManifestV1D2.Convert.declarativeAgentManifestV1D2ToJson,
  ],
  "v1.3": [
    DeclarativeAgentManifestV1D3.Convert.toDeclarativeAgentManifestV1D3,
    DeclarativeAgentManifestV1D3.Convert.declarativeAgentManifestV1D3ToJson,
  ],
  "v1.4": [
    DeclarativeAgentManifestV1D4.Convert.toDeclarativeAgentManifestV1D4,
    DeclarativeAgentManifestV1D4.Convert.declarativeAgentManifestV1D4ToJson,
  ],
  "v1.5": [
    DeclarativeAgentManifestV1D5.Convert.toDeclarativeAgentManifestV1D5,
    DeclarativeAgentManifestV1D5.Convert.declarativeAgentManifestV1D5ToJson,
  ],
  "v1.6": [
    DeclarativeAgentManifestV1D6.Convert.toDeclarativeAgentManifestV1D6,
    DeclarativeAgentManifestV1D6.Convert.declarativeAgentManifestV1D6ToJson,
  ],
  "v1.7": [
    DeclarativeAgentManifestV1D7.Convert.toDeclarativeAgentManifestV1D7,
    DeclarativeAgentManifestV1D7.Convert.declarativeAgentManifestV1D7ToJson,
  ],
  "v1.8": [
    DeclarativeAgentManifestV1D8.Convert.toDeclarativeAgentManifestV1D8,
    DeclarativeAgentManifestV1D8.Convert.declarativeAgentManifestV1D8ToJson,
  ],
};
const ApiPluginConverterMap: Converters = {
  "v2.1": [
    APIPluginManifestV2D1.Convert.toAPIPluginManifestV2D1,
    APIPluginManifestV2D1.Convert.aPIPluginManifestV2D1ToJson,
  ],
  "v2.2": [
    APIPluginManifestV2D2.Convert.toAPIPluginManifestV2D2,
    APIPluginManifestV2D2.Convert.aPIPluginManifestV2D2ToJson,
  ],
  "v2.3": [
    APIPluginManifestV2D3.Convert.toAPIPluginManifestV2D3,
    APIPluginManifestV2D3.Convert.aPIPluginManifestV2D3ToJson,
  ],
  "v2.4": [
    APIPluginManifestV2D4.Convert.toAPIPluginManifestV2D4,
    APIPluginManifestV2D4.Convert.aPIPluginManifestV2D4ToJson,
  ],
};

export class TeamsManifestConverter {
  static jsonToManifest(json: string): TeamsManifest {
    const parsed = JSON.parse(json);
    const manifestVersion = parsed.manifestVersion as string;
    const converters =
      TeamsManifestConverterMap[manifestVersion as keyof typeof TeamsManifestConverterMap];
    if (!converters) {
      return parsed as TeamsManifest;
    }
    return converters[0](json) as TeamsManifest;
  }
  static manifestToJson(manifest: TeamsManifest): string {
    const manifestVersion = manifest.manifestVersion as string;
    const converters =
      TeamsManifestConverterMap[manifestVersion as keyof typeof TeamsManifestConverterMap];
    if (!converters) {
      return JSON.stringify(manifest);
    }
    return converters[1](manifest as any);
  }
}

export class DeclarativeAgentManifestConverter {
  static jsonToManifest(json: string): DeclarativeAgentManifest {
    const parsed = JSON.parse(json);
    const version = parsed.version as string;
    const converters = daConverterMap[version as keyof typeof daConverterMap];
    if (!converters) {
      return parsed as DeclarativeAgentManifest;
    }
    return converters[0](json);
  }
  static manifestToJson(manifest: DeclarativeAgentManifest): string {
    const version = manifest.version as string;
    const converters = daConverterMap[version as keyof typeof daConverterMap];
    if (!converters) {
      return JSON.stringify(manifest, undefined, 4);
    }
    return converters[1](manifest);
  }
}

export class ApiPluginManifestConverter {
  static jsonToManifest(json: string): APIPluginManifest {
    const parsed = JSON.parse(json);
    const schema_version = parsed.schema_version as string;
    const converters = ApiPluginConverterMap[schema_version as keyof typeof ApiPluginConverterMap];
    if (!converters) {
      return parsed as APIPluginManifest;
    }
    return converters[0](json);
  }
  static manifestToJson(manifest: APIPluginManifest): string {
    const schema_version = manifest.schema_version as string;
    const converters = ApiPluginConverterMap[schema_version as keyof typeof ApiPluginConverterMap];
    if (!converters) {
      return JSON.stringify(manifest);
    }
    return converters[1](manifest);
  }
}

export class AppManifestUtils {
  private static getLocalSchemaSuffix(schemaUrl: string): string | undefined {
    try {
      const parsedUrl = new URL(schemaUrl);
      if (parsedUrl.hostname === "developer.microsoft.com") {
        const localizedPathMatch = parsedUrl.pathname.match(
          /^\/[a-z]{2}(?:-[a-z]{2})?(\/json-schemas\/.*)$/i
        );
        schemaUrl = `${parsedUrl.origin}${localizedPathMatch?.[1] ?? parsedUrl.pathname}`;
      }
    } catch {
      // Ignore invalid URL input and fall back to remote fetch.
    }

    if (
      schemaUrl.startsWith("https://developer.microsoft.com/json-schemas/teams") ||
      schemaUrl.startsWith(
        "https://developer.microsoft.com/json-schemas/copilot/declarative-agent"
      ) ||
      schemaUrl.startsWith("https://developer.microsoft.com/json-schemas/copilot/plugin")
    ) {
      return schemaUrl.substring("https://developer.microsoft.com/".length);
    }

    return undefined;
  }

  /**
   * Fetch the schema from the manifest object, load from local if the schema is in the package
   * @param manifest
   * @returns manifest schema object
   */
  private static getLocalSchemaCandidates(suffix: string): string[] {
    const candidates: string[] = [];
    // 1. Relative to __dirname (works in both source and bundled exe snapshot)
    candidates.push(path.join(__dirname, "..", suffix));
    // 2. Relative to the running executable (pkg exe layout)
    if (process.execPath) {
      candidates.push(path.join(path.dirname(process.execPath), suffix));
    }
    // 3. Relative to cwd
    candidates.push(path.join(process.cwd(), suffix));
    return candidates;
  }

  static async fetchSchema(schemaUrl: string): Promise<JSONSchemaType<AppManifest>> {
    const suffix = this.getLocalSchemaSuffix(schemaUrl);
    if (suffix) {
      for (const schemaFile of this.getLocalSchemaCandidates(suffix)) {
        if (await fs.pathExists(schemaFile)) {
          const raw = await fs.readFile(schemaFile, "utf8");
          const cleanedText = raw.replace(/\\a/g, "\\u0007").replace(/\\v/g, "\\u000b");
          return JSON.parse(cleanedText) as JSONSchemaType<AppManifest>;
        }
      }
    }
    let result: JSONSchemaType<AppManifest>;
    try {
      const res = await fetch(schemaUrl);
      const text = await res.text();
      const cleanedText = text.replace(/\\a/g, "\\u0007").replace(/\\v/g, "\\u000b");
      result = JSON.parse(cleanedText) as JSONSchemaType<AppManifest>;
    } catch (e: unknown) {
      throw new SchemaFetchError(schemaUrl, e);
    }
    return result;
  }
  static async validateAgainstSchema(
    manifest: AppManifest,
    schema?: JSONSchemaType<AppManifest>
  ): Promise<string[]> {
    if (!schema) {
      const schemaUrl = manifest.$schema;
      if (!schemaUrl) {
        throw new Error("Manifest does not have a $schema property");
      }
      schema = await this.fetchSchema(schemaUrl);
    }
    let validate;
    if (schema.$schema?.includes("2020-12")) {
      const ajv = new Ajv2020({
        //formats: { uri: true, email: true },
        allErrors: true,
        strictTypes: false,
      });
      addFormats(ajv, ["uri", "email", "regex"]);
      validate = ajv.compile(schema);
    } else {
      const ajv = new Ajv04({
        allErrors: true,
        strictTypes: false,
      });
      addFormats(ajv, ["uri", "email", "regex"]);
      validate = ajv.compile(schema);
    }
    // The generated converters (jsonToManifest) populate every declared
    // optional property with `undefined`, even when it is absent from the
    // source JSON. Such keys have no JSON representation and are dropped when
    // the manifest is serialized to disk, but they remain as own enumerable
    // keys on the in-memory object. AJV counts them via Object.keys(), which
    // produces spurious "must NOT have additional properties" errors against
    // schema branches that use `additionalProperties: false` (for example a
    // ribbon group under a built-in tab reporting phantom `builtInGroupId` /
    // `overriddenByRibbonApi`). Validate a JSON round-tripped copy so the
    // object matches what is actually persisted and sent for validation.
    const manifestToValidate: unknown = JSON.parse(JSON.stringify(manifest));
    const valid = validate(manifestToValidate);
    if (!valid && validate.errors) {
      return validate.errors.map(
        (error) =>
          `${error.instancePath} ${error.message || ""}. Details: ${
            error.params ? JSON.stringify(error.params) : ""
          }`
      );
    } else {
      return [];
    }
  }

  /**
   * Read Teams manifest from file with basic type check
   *
   * @param filePath - Teams manifest file path.
   * @throws Will propagate any error thrown by the fs-extra#readFile or type assert failure.
   *
   * @returns The manifest Object
   */
  static async readTeamsManifest(filePath: string): Promise<TeamsManifest> {
    const jsonString = await fs.readFile(filePath, "utf8");
    // Strip BOM to handle UTF-8 BOM encoded files
    const cleanContent = stripBom(jsonString);
    const manifest = TeamsManifestConverter.jsonToManifest(cleanContent);
    return manifest;
  }

  /**
   * Read declarative agent manifest from file with schema validation
   *
   * @param filePath - Teams manifest file path.
   * @throws Will propagate any error thrown by the fs-extra#readFile or type check failure.
   *
   * @returns The manifest Object and schema validation results
   */
  static async readAndValidateTeamsManifest(filePath: string): Promise<[TeamsManifest, string[]]> {
    const manifest = await this.readTeamsManifest(filePath);
    const validateRes = await this.validateAgainstSchema(manifest);
    return [manifest, validateRes];
  }

  /**
   * Read declarative agent manifest from file with basic type check
   *
   * @param filePath - Declarative agent manifest file path.
   * @throws Will propagate any error thrown by the fs-extra#readFile or type assert failure.
   *
   * @returns The manifest Object
   */
  static async readDeclarativeAgentManifest(filePath: string): Promise<DeclarativeAgentManifest> {
    const jsonString = await fs.readFile(filePath, "utf8");
    // Strip BOM to handle UTF-8 BOM encoded files
    const cleanContent = stripBom(jsonString);
    const manifest = DeclarativeAgentManifestConverter.jsonToManifest(cleanContent);
    return manifest;
  }

  /**
   * Read declarative agent manifest from file with schema validation
   *
   * @param filePath - Declarative agent manifest file path.
   * @throws Will propagate any error thrown by the fs-extra#readFile or type check failure.
   *
   * @returns The manifest Object and schema validation results
   */
  static async readAndValidateDeclarativeAgentManifest(
    filePath: string
  ): Promise<[DeclarativeAgentManifest, string[]]> {
    const manifest = await this.readDeclarativeAgentManifest(filePath);
    const validateRes = await this.validateAgainstSchema(manifest);
    return [manifest, validateRes];
  }

  /**
   * Read API plugin manifest from file with basic type check
   *
   * @param filePath - API plugin manifest file path.
   * @throws Will propagate any error thrown by the fs-extra#readFile or type assert failure.
   *
   * @returns The manifest Object
   */
  static async readApiPluginManifest(filePath: string): Promise<APIPluginManifest> {
    const jsonString = await fs.readFile(filePath, "utf8");
    // Strip BOM to handle UTF-8 BOM encoded files
    const cleanContent = stripBom(jsonString);
    const manifest = ApiPluginManifestConverter.jsonToManifest(cleanContent);
    return manifest;
  }

  /**
   * Read API plugin manifest from file with schema validation
   *
   * @param filePath - API plugin manifest file path.
   * @throws Will propagate any error thrown by the fs-extra#readFile or type check failure.
   *
   * @returns The manifest Object and schema validation results
   */
  static async readAndValidateApiPluginManifest(
    filePath: string
  ): Promise<[APIPluginManifest, string[]]> {
    const manifest = await this.readApiPluginManifest(filePath);
    const validateRes = await this.validateAgainstSchema(manifest);
    return [manifest, validateRes];
  }

  /**
   * Writes the Teams manifest object to the given file with basic type check.
   *
   * @param path - The manifest file path.
   * @param manifest - Manifest object to be saved
   * @throws Will propagate any error thrown by the fs-extra#writeFile.
   *
   */
  static async writeTeamsManifest(filePath: string, manifest: TeamsManifest): Promise<void> {
    const jsonString = TeamsManifestConverter.manifestToJson(manifest);
    return fs.writeFile(filePath, jsonString, "utf8");
  }

  /**
   * Writes the declarative agent manifest object to the given file with basic type check.
   *
   * @param path - The manifest file path.
   * @param manifest - Manifest object to be saved
   * @throws Will propagate any error thrown by the fs-extra#writeFile.
   *
   */
  static async writeDeclarativeAgentManifest(
    filePath: string,
    manifest: DeclarativeAgentManifest
  ): Promise<void> {
    const jsonString = DeclarativeAgentManifestConverter.manifestToJson(manifest);
    return fs.writeFile(filePath, jsonString, "utf8");
  }

  /**
   * Writes the declarative agent manifest object to the given file with basic type check.
   *
   * @param path - The manifest file path.
   * @param manifest - Manifest object to be saved
   * @throws Will propagate any error thrown by the fs-extra#writeFile.
   *
   */
  static async writeApiPluginManifest(
    filePath: string,
    manifest: APIPluginManifest
  ): Promise<void> {
    const jsonString = ApiPluginManifestConverter.manifestToJson(manifest);
    return fs.writeFile(filePath, jsonString, "utf8");
  }
}
