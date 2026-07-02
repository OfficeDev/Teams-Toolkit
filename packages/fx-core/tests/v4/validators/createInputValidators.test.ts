// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { assert } from "vitest";
import { createDefaultCreateInputValidators } from "../../../src/v4/validators/createInputValidators";

describe("create input validators (collect-inputs INV-3b)", () => {
  it("CCI-04/18/19: default create validator registry exposes stable validator ids", async () => {
    const validators = createDefaultCreateInputValidators();

    assert.sameMembers(Object.keys(validators), [
      "uri",
      "graphConnectorName",
      "graphConnectorConnectionId",
    ]);
    assert.isUndefined(await validators.uri("https://example.com/mcp", {}));
    assert.equal(await validators.uri("not a uri", {}), "must be a valid URI");
    assert.equal(await validators.graphConnectorName("   ", {}), "must not be empty");
    assert.equal(
      await validators.graphConnectorConnectionId("MicrosoftGraph", {}),
      "must not begin with 'Microsoft'"
    );
  });
});
