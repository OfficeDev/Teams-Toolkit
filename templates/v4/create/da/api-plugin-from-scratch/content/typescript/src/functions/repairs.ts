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

app.http("repairs", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: repairs,
});
