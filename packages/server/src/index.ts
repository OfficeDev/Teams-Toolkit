// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { createMessageConnection } from "vscode-jsonrpc/node";
import validator from "validator";
import WebSocket from "ws";

/**
 * solved by https://github.com/vercel/pkg/issues/420#issuecomment-652925540
 */
require("../standalone-patch");
import ServerConnection from "./serverConnection";

const port = Number(process.argv.slice(2)[0]) || 7920;
const wss = new WebSocket.Server({
  host: "127.0.0.1",
  port,
  verifyClient: ({ origin }: { origin?: string }) => origin === undefined,
});

wss.on("connection", function cb(ws) {
  const wsStream = WebSocket.createWebSocketStream(ws, { encoding: "utf8" });
  const connection = new ServerConnection(createMessageConnection(wsStream, wsStream));
  ws.on("message", (ms) => {
    console.log(`recv:${validator.escape(ms.toString())}`);
  });
  connection.listen();
});

let timeout: NodeJS.Timeout | undefined = undefined;

const interval = setInterval(() => {
  if (wss.clients.size === 0) {
    if (timeout === undefined) {
      timeout = setTimeout(() => wss.close(), 3 * 60 * 1000); // 3 minutes
    }
  } else {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  }
}, 5000);

wss.on("close", function close() {
  clearInterval(interval);
  console.log(`The server has been closed`);
});

console.log(`The server has started at ws://localhost:${port}`);
