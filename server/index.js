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
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user TEXT NOT NULL
  );
`);

io.on("connection", async (socket) => {
  console.log("a user connected");

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });

  socket.on("chat message", async (msg) => {
    let result;
    const username = socket.handshake.auth.username || "Anonymous";

    try {
      result = await db.execute({
        sql: "INSERT INTO messages (content, user) VALUES (:msg, :username)",
        args: { msg, username },
      });
    } catch (error) {
      console.error("Error inserting message:", error);
      return;
    }

    const timestampResult = await db.execute({
      sql: "SELECT CAST(timestamp AS TEXT) as timestamp FROM messages WHERE id = ?",
      args: [result.lastInsertRowid],
    });
    const [{ timestamp }] = timestampResult.rows;

    io.emit(
      "chat message",
      msg,
      result.lastInsertRowid.toString(),
      username,
      timestamp
    );
  });

  if (!socket.recovered) {
    try {
      const messages = await db.execute({
        sql: "SELECT id, content, user, CAST(timestamp AS TEXT) as timestamp FROM messages WHERE id > ?",
        args: [socket.handshake.auth.serverOffset ?? 0],
      });

      messages.rows.forEach(({ id, content, user: username, timestamp }) => {
        socket.emit(
          "chat message",
          content,
          id.toString(),
          username,
          timestamp
        );
      });
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  }
});

app.use(logger("dev"));

app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/client/index.html");
});

server.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
