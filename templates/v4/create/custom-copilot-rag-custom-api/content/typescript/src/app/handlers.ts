import * as path from "path";
import yaml from "js-yaml";
import { OpenAPIClientAxios, Document } from "openapi-client-axios";
import * as fs from "fs-extra";
import { generateAdaptiveCard, addAuthConfig } from "./utility";

const specPath = path.join(
  __dirname,
  "../../appPackage/apiSpecificationFile/{{OPENAPI_SPEC_PATH}}"
);
const specContent = yaml.load(fs.readFileSync(specPath, "utf8")) as Document;
const api = new OpenAPIClientAxios({ definition: specContent });
api.init();

// Replace with function handler code
