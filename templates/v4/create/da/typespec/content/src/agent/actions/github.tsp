import "@typespec/http";
import "@microsoft/typespec-m365-copilot";
import "../env.tsp";

using TypeSpec.Http;
using TypeSpec.M365.Copilot.Actions;

@service
@server(GitHubAPI.SERVER_URL)
@actions(GitHubAPI.ACTIONS_METADATA)
namespace GitHubAPI {
  /**
   * Metadata for the GitHub API actions.
   */
  const ACTIONS_METADATA = #{
    nameForHuman: "GitHub",
    descriptionForHuman: "Search open issues on GitHub.",
    descriptionForModel: "Search open issues from GitHub repositories.",
    legalInfoUrl: "https://docs.github.com/en/site-policy/github-terms/github-terms-of-service",
    privacyPolicyUrl: "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
  };

  /**
   * The base URL for the GitHub API.
   */
  const SERVER_URL = Environment.GITHUB_API_URL;

  /**
   * Search open issues from GitHub repositories.
   * @param q The search query. Default is `repo:OfficeDev/microsoft-365-agents-toolkit is:open`.
   * @param per_page The number of results per page. Default is 5.
   */
  @route("/search/issues")
  @card(#{
    dataPath: "$.items",
    file: "adaptiveCards/searchIssues.json",
    properties: #{
      title: "$.title",
      url: "$.html_url"
    }
  })
  @get op searchIssues(
    @query q: string = "repo:OfficeDev/microsoft-365-agents-toolkit is:issue is:open",
    @query per_page: integer = 5
  ): string;
}