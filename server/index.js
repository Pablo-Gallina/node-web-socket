import express from "express";
import logger from "morgan";

import { Server } from "socket.io";
import { createServer } from "http";

import dotenv from "dotenv";
import { createClient } from "@libsql/client";
dotenv.config();

const port = 3000;

const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: false,
  },
});

const db = createClient({
  url: process.env.LIBSQL_DB_URL,
  authToken: process.env.LIBSQL_DB_AUTH_TOKEN,
});

await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

io.on("connection", (socket) => {
  console.log("a user connected");

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });

  socket.on("chat message", async (msg) => {
    let result;

    try {
      result = await db.execute({
        sql: "INSERT INTO messages (content) VALUES (:content)",
        args: { content: msg },
      });

      console.log(result);
    } catch (error) {
      console.error("Error inserting message:", error);
      return;
    }

    io.emit("chat message", msg, result.lastInsertRowid.toString());
  });
});

app.use(logger("dev"));

app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/client/index.html");
});

server.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
