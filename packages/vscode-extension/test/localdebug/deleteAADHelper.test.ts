import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from "vscode";
import fs from "fs-extra";
import { deleteAad } from "../../src/debug/deleteAadHelper";
import * as globalVariables from "../../src/globalVariables";
import M365TokenInstance from "../../src/commonlib/m365Login";
import { ok } from "@microsoft/teamsfx-api";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import axios from "axios";

describe("delete aad helper", () => {
  describe("delete aad", () => {
    it("file does not exist", async () => {
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      const res = await deleteAad();
      assert.isTrue(res);
    });

    it("no aad id", async () => {
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("{}");
      const res = await deleteAad();
      assert.isTrue(res);
    });

    it("normal test account", async () => {
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("BOT_ID=botId\n");
      vi.spyOn(M365TokenInstance, "getCachedAccountInfo").mockReturnValue({
        username: "test.email.com",
        homeAccountId: "homeAccountId",
        environment: "test",
        tenantId: "tenantId",
        localAccountId: "localAccountId",
      });
      vi.spyOn(M365TokenInstance, "getAccessToken").mockResolvedValue(
        ok(
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwidW5pcXVlX25hbWUiOiJKb2huIERvZSIsImlhdCI6MTUxNjIzOTAyMn0.Y7_rghuQEaTILkMN_421Cut4myfHIhk3hpvHVbpOvnQ"
        )
      );
      const res = await deleteAad();
      assert.isTrue(res);
    });

    it("no telemetry handler", async () => {
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("BOT_ID=botId\n");
      vi.spyOn(M365TokenInstance, "getCachedAccountInfo").mockReturnValue({
        upn: "test.email.com",
      });
      vi.spyOn(M365TokenInstance, "getAccessToken").mockResolvedValue(
        ok(
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwidW5pcXVlX25hbWUiOiJ0ZXN0QG1pY3Jvc29mdC5jb20iLCJpYXQiOjE1MTYyMzkwMjJ9.Rejz-cPndtObAYVa3k3Q7BaltQGXY8KRDxRYKyUoHDw"
        )
      );
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent").throws(new Error("test error"));
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      const res = await deleteAad();
      assert.isFalse(res);
    });

    it("happy path for bot id", async () => {
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("BOT_ID=botId\n");
      vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
      vi.spyOn(M365TokenInstance, "getCachedAccountInfo").mockResolvedValue({
        upn: "test.email.com",
      });
      vi.spyOn(M365TokenInstance, "getAccessToken").mockResolvedValue(
        ok(
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwidW5pcXVlX25hbWUiOiJ0ZXN0QG1pY3Jvc29mdC5jb20iLCJpYXQiOjE1MTYyMzkwMjJ9.Rejz-cPndtObAYVa3k3Q7BaltQGXY8KRDxRYKyUoHDw"
        )
      );
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent").mockImplementation(() => {});
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent").mockImplementation(() => {});
      const fakeAxiosInstance = axios.create();
      vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
      vi.spyOn(fakeAxiosInstance, "delete").mockResolvedValue({ data: { status: 204 } });
      const res = await deleteAad();
      assert.isTrue(res);
    });

    it("happy path for sso id", async () => {
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("AAD_APP_CLIENT_ID=clientId\n");
      vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
      vi.spyOn(M365TokenInstance, "getCachedAccountInfo").mockReturnValue({
        upn: "test.email.com",
      });
      vi.spyOn(M365TokenInstance, "getAccessToken").mockResolvedValue(
        ok(
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwidW5pcXVlX25hbWUiOiJ0ZXN0QG1pY3Jvc29mdC5jb20iLCJpYXQiOjE1MTYyMzkwMjJ9.Rejz-cPndtObAYVa3k3Q7BaltQGXY8KRDxRYKyUoHDw"
        )
      );
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent").mockImplementation(() => {});
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent").mockImplementation(() => {});
      const fakeAxiosInstance = axios.create();
      vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
      vi.spyOn(fakeAxiosInstance, "delete").mockResolvedValue({ data: { status: 204 } });
      const res = await deleteAad();
      assert.isTrue(res);
    });

    it("happy path for bot id and sso id", async () => {
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("BOT_ID=botId\nAAD_APP_CLIENT_ID=clientId\n");
      vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
      vi.spyOn(M365TokenInstance, "getCachedAccountInfo").mockReturnValue({
        upn: "test.email.com",
      });
      vi.spyOn(M365TokenInstance, "getAccessToken").mockResolvedValue(
        ok(
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwidW5pcXVlX25hbWUiOiJ0ZXN0QG1pY3Jvc29mdC5jb20iLCJpYXQiOjE1MTYyMzkwMjJ9.Rejz-cPndtObAYVa3k3Q7BaltQGXY8KRDxRYKyUoHDw"
        )
      );
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent").mockImplementation(() => {});
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent").mockImplementation(() => {});
      const fakeAxiosInstance = axios.create();
      vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
      vi.spyOn(fakeAxiosInstance, "delete").mockResolvedValue({ data: { status: 204 } });
      const res = await deleteAad();
      assert.isTrue(res);
    });

    it("axios handler error", async () => {
      mockValue(globalVariables, "workspaceUri", vscode.Uri.file("path"));
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("BOT_ID=botId\n");
      vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
      vi.spyOn(M365TokenInstance, "getCachedAccountInfo").mockReturnValue({
        upn: "test.email.com",
      });
      vi.spyOn(M365TokenInstance, "getAccessToken").mockResolvedValue(
        ok(
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwidW5pcXVlX25hbWUiOiJ0ZXN0QG1pY3Jvc29mdC5jb20iLCJpYXQiOjE1MTYyMzkwMjJ9.Rejz-cPndtObAYVa3k3Q7BaltQGXY8KRDxRYKyUoHDw"
        )
      );
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent").mockImplementation(() => {});
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent").mockImplementation(() => {});
      const fakeAxiosInstance = axios.create();
      vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
      vi.spyOn(fakeAxiosInstance, "delete").mockRejectedValue(new Error("error"));
      const res = await deleteAad();
      assert.isTrue(res);
    });
  });
});
