/* This code sample provides a starter kit to implement server side logic for your App in TypeScript,
 * refer to https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference for complete Azure Functions
 * developer guide.
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import repairRecords from "../repairsData.json";

/**
 * This function handles the HTTP request and returns the repair information.
 *
 * @param {HttpRequest} req - The HTTP request.
 * @param {InvocationContext} context - The Azure Functions context object.
 * @returns {Promise<Response>} - A promise that resolves with the HTTP response containing the repair information.
 */
export async function repairs(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("HTTP trigger function processed a request.");

  // Check if the request is authorized.
  if (!isApiKeyValid(req)) {
    // Return 401 Unauthorized response.
    return {
      status: 401,
    };
  }

  // Initialize response.
  const res: HttpResponseInit = {
    status: 200,
    jsonBody: {
      results: repairRecords,
    },
  };

  // Get the assignedTo query parameter.
  const assignedTo = req.query.get("assignedTo");

  // If the assignedTo query parameter is not provided, return the response.
  if (!assignedTo) {
    return res;
  }

  // Filter the repair information by the assignedTo query parameter.
  const repairs = repairRecords.filter((item) => {
    const fullName = item.assignedTo.toLowerCase();
    const query = assignedTo.trim().toLowerCase();
    const [firstName, lastName] = fullName.split(" ");
    return fullName === query || firstName === query || lastName === query;
  });

  // Return filtered repair records, or an empty array if no records were found.
  res.jsonBody.results = repairs ?? [];
  return res;
}

/**
 * The reason for this implementation is that Azure Function Core Tools does not support authentication when running locally.
 * This template is designed to demonstrate and facilitate local debugging of authentication functionalities in the API-based
 * message extension. Therefore, this approach was taken. If you prefer to leverage the Azure Functions' built-in API key
 * authentication, please refer to https://aka.ms/functionkey for guidance.
 * @param {HttpRequest} req - The HTTP request.
 * @returns {boolean} - True if the request is authorized, false otherwise.
 */
function isApiKeyValid(req: HttpRequest): boolean {
  const apiKey = req.headers.get("X-API-Key")?.trim();
  return apiKey === process.env.API_KEY;
}

app.http("repairs", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: repairs,
});
