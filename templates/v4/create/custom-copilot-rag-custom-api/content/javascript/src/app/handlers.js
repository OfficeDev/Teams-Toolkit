const path = require("path");
const yaml = require("js-yaml");
const { OpenAPIClientAxios } = require("openapi-client-axios");
const fs = require("fs-extra");
const { generateAdaptiveCard, addAuthConfig } = require("./utility");

const specPath = path.join(
  __dirname,
  "../../appPackage/apiSpecificationFile/{{OPENAPI_SPEC_PATH}}"
);
const specContent = yaml.load(fs.readFileSync(specPath, "utf8"));
const api = new OpenAPIClientAxios({ definition: specContent });
api.init();

// Replace with function handler code
