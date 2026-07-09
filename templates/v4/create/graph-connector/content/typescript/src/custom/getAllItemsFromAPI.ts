import { Config } from "../models/Config";
import { Item } from "../models/Item";

/**
 * Fetches issues from the GitHub API.
 * @param config - The configuration object.
 * @param fetchUrl - The URL to fetch issues from.
 * @param repo - The repository name in the format 'owner/repo'.
 * @returns A promise that resolves to the response.
 */
async function fetchIssues(config: Config, fetchUrl: string, repo: string): Promise<Response> {
  // Use the access token from the config if available
  // to authenticate the request to the GitHub API if using a private repo
  // or to avoid rate limiting
  const headers: HeadersInit = {};
  if (config.connector.accessToken) {
    headers["Authorization"] = `Bearer ${config.connector.accessToken}`;
  }
  const response = await fetch(fetchUrl, {
    headers,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch items in repo ${repo}: ${response.statusText}`);
  }
  return response;
}

/**
 * Gets the URL for the next page of results from the response headers.
 * Parse the link header to find the next page URL.
 * @see https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api?apiVersion=2022-11-28#using-link-headers
 * @param response - The response object from the fetch request.
 * @returns The URL for the next page of results, or null if there are no more pages.
 */
function getNextPageUrl(response: Response): string | null {
  const linkHeader = response.headers.get("link");
  if (!linkHeader) {
    return null;
  }
  const links = linkHeader.split(", ");
  for (const link of links) {
    const match = link.match(/<([^>]+)>; rel="next"/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

async function mapItemsFromResponse(response: Response): Promise<Item[]> {
  const issues: any[] = await response.json();

  const filteredIssues = issues.filter((issue) => !issue.pull_request);
  const mappedItems = filteredIssues.map<Item>((issue) => {
    return {
      id: issue.id,
      issueNumber: issue.number as string,
      owner: issue.repository_url.split("/").slice(-2)[0],
      repo: issue.repository_url.split("/").slice(-1)[0],
      assignedTo: issue.assignees?.map((assignee) => assignee.login).join(", "),
      state: issue.state,
      lastModified: new Date(issue.updated_at).toISOString().slice(0, -5) + "Z",
      title: issue.title,
      abstract: issue.body,
      author: issue.user.login,
      content: `${issue.title} - ${issue.body}`,
      url: issue.html_url,
    };
  });
  return mappedItems;
}

// [Customization point]
// If you need additional logic to get all items from the repository, you can add it here
// This function is used to get all items from the repository.
// The items are filtered to exclude pull requests and only include issues.
// See github API documentation for more details:
// https://docs.github.com/en/rest/reference
// The documentation for the issues endpoint is here:
// https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28#list-repository-issues
/**
 * Get all items for all repositories sequentially, yielding data as soon as it's available.
 * @param config - The configuration object containing connector details (e.g., access token, repos).
 * @param pageSize - Number of items per page. Defaults to 100.
 * @param since - Optional date to filter issues updated after this date.
 */
export async function* getAllItemsFromAPI(
  config: Config,
  since?: Date,
  pageSize = 100
): AsyncGenerator<Item> {
  const repos = config.connector.repos.split(",");
  for (const repo of repos) {
    config.context.log(`Fetching issues from repo: ${repo}`);

    // Url to fetch issues for the first page
    let fetchPageUrl = `https://api.github.com/repos/${repo}/issues?state=all&per_page=${pageSize}${
      since ? `&since=${since.toISOString()}` : ""
    }`;
    while (fetchPageUrl) {
      const response = await fetchIssues(config, fetchPageUrl, repo);
      const issues = await mapItemsFromResponse(response);
      for (const item of issues) {
        yield item;
      }

      // If there are no more pages, null is returned to break the loop
      fetchPageUrl = getNextPageUrl(response);
    }
  }
}
