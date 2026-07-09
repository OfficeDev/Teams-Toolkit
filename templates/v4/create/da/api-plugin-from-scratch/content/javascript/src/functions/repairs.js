/* This code sample provides a starter kit to implement server side logic for your App in TypeScript,
 * refer to https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference for
 * complete Azure Functions developer guide.
 */
const { app } = require("@azure/functions");
/**
 * This function handles the HTTP request and returns the repair information.
 *
 * @param req - The HTTP request.
 * @param context - The Azure Functions context object.
 * @returns A promise that resolves with the HTTP response containing the repair information.
 */
async function repairs(req, context) {
  context.log("HTTP trigger function processed a request.");

  // Get the repair records from the data.json file.
  const repairRecords = require("../repairsData.json");

  // Initialize response.
  const res = {
    status: 200,
    jsonBody: {
      results: repairRecords,
    },
  };

  // Get the assignedTo query parameter.
  const assignedTo = req.query.get("assignedTo");

  // If the assignedTo query parameter is not provided, return all repair records.
  if (!assignedTo) {
    return res;
  }

  // Filter the repair records by the assignedTo query parameter.
  const repairs = repairRecords.filter((item) => {
    const query = assignedTo.trim().toLowerCase();
    const fullName = item.assignedTo.toLowerCase();
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
