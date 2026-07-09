import { azureClientHelper } from "../../../src/component/utils/azureClient";
import { InvalidAzureCredentialError } from "../../../src/error";
import { MockedAzureAccountProvider } from "../../core/utils";
import { chai, vi } from "vitest";

describe("azureClient test", () => {
  const sandbox = vi;

  beforeEach(async () => {});

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("getChallengeHandler returns invalid token", async () => {
    const tokenProvider = new MockedAzureAccountProvider();
    vi.spyOn(tokenProvider, "getIdentityCredentialAsync").mockResolvedValue(undefined);

    const getTokenForChallenge = azureClientHelper.getChallengeHandler(tokenProvider);
    try {
      await getTokenForChallenge({
        wwwAuthenticate: "faked-claim",
        scopes: ["https://management.azure.com/.default"],
      });
      chai.assert.fail("Expected getTokenForChallenge to reject");
    } catch (e) {
      chai.assert.isTrue(e instanceof InvalidAzureCredentialError);
    }
  });

  it("getChallengeHandler happy pass", async () => {
    const tokenProvider = new MockedAzureAccountProvider();
    vi.spyOn(tokenProvider, "getIdentityCredentialAsync").mockResolvedValue({
      getToken: async function (scopes: string | string[]) {
        return { token: "fake-token", expiresOnTimestamp: 0 };
      },
    });

    const getTokenForChallenge = azureClientHelper.getChallengeHandler(tokenProvider);
    const token = await getTokenForChallenge({
      wwwAuthenticate: "faked-claim",
      scopes: ["https://management.azure.com/.default"],
    });
    chai.assert.equal(token, "fake-token");
  });
});
