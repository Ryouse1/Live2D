import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import db from "./db.js";
import {
  createGoogleUser,
  createSession,
  createUser,
  deleteSession,
  getUserByEmail,
  getUserByGoogleId,
  sessionCookieOptions,
  verifyPassword
} from "./auth.js";
import { attachUser, AuthenticatedRequest, requireAuth, requireRole } from "./middleware.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(attachUser);

// 配信IDごとの接続管理とレート制限用のメモリストア
const streamClients = new Map<string, Set<WebSocket>>();
const lastMessageAt = new Map<string, number>();

function broadcastToStream(streamId: string, payload: unknown) {
  const clients = streamClients.get(streamId);
  if (!clients) {
    return;
  }
  const message = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

// 通常ログイン向けのユーザー登録
app.post("/api/auth/register", (req, res) => {
  const { email, password, displayName, role } = req.body as {
    email?: string;
    password?: string;
    displayName?: string;
    role?: "admin" | "streamer" | "viewer";
  };
  if (!email || !password || !displayName) {
    return res.status(400).json({ message: "Missing fields" });
  }
  if (getUserByEmail(email)) {
    return res.status(409).json({ message: "Email already registered" });
  }
  const user = createUser({ email, password, displayName, role });
  const session = createSession(user.id);
  res.cookie("session_id", session.id, sessionCookieOptions);
  return res.status(201).json({
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role
  });
});

// パスワード認証ログイン
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ message: "Missing credentials" });
  }
  const user = getUserByEmail(email);
  if (!user || !verifyPassword(user, password)) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  const session = createSession(user.id);
  res.cookie("session_id", session.id, sessionCookieOptions);
  return res.json({
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role
  });
});

app.post("/api/auth/logout", requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.sessionId) {
    deleteSession(req.sessionId);
  }
  res.clearCookie("session_id", { path: "/" });
  return res.status(204).send();
});

app.get("/api/auth/me", requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  return res.json({
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role
  });
});

// Google OAuthの開始エンドポイント
app.get("/api/auth/google/start", (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return res.status(500).json({ message: "Google OAuth not configured" });
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("prompt", "select_account");
  res.json({ url: url.toString() });
});

// Google OAuthのコールバック (認可コードを交換)
app.get("/api/auth/google/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!code || !clientId || !clientSecret || !redirectUri) {
    return res.status(400).json({ message: "Missing OAuth configuration" });
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });

  if (!tokenResponse.ok) {
    return res.status(502).json({ message: "Failed to exchange token" });
  }

  const tokenJson = (await tokenResponse.json()) as { access_token: string };
  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` }
  });

  if (!profileResponse.ok) {
    return res.status(502).json({ message: "Failed to fetch profile" });
  }

  const profile = (await profileResponse.json()) as {
    id: string;
    email: string;
    name: string;
  };

  let user = getUserByGoogleId(profile.id);
  if (!user) {
    user = createGoogleUser({
      email: profile.email,
      googleId: profile.id,
      displayName: profile.name
    });
  }
  const session = createSession(user.id);
  res.cookie("session_id", session.id, sessionCookieOptions);
  return res.json({
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role
  });
});

app.get("/api/streams", requireAuth, (_req, res) => {
  const streams = db
    .prepare(
      `SELECT streams.id, streams.title, streams.status, streams.started_at as startedAt,
        streams.stopped_at as stoppedAt, streams.stopped_reason as stoppedReason,
        users.display_name as ownerName
       FROM streams
       JOIN users ON users.id = streams.owner_id
       ORDER BY streams.started_at DESC`
    )
    .all();
  res.json({ streams });
});

// 配信開始 (配信者・管理者のみ)
app.post("/api/streams", requireRole(["streamer", "admin"]), (req: AuthenticatedRequest, res) => {
  const { title } = req.body as { title?: string };
  if (!title) {
    return res.status(400).json({ message: "Title required" });
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO streams (id, title, owner_id, status, started_at)
     VALUES (?, ?, ?, 'live', ?)`
  ).run(id, title, req.user!.id, now);
  res.status(201).json({ id, title, status: "live", startedAt: now });
});

app.post(
  // 配信停止 (配信者本人 or 管理者のみ)
  "/api/streams/:id/stop",
  requireRole(["streamer", "admin"]),
  (req: AuthenticatedRequest, res) => {
    const streamId = req.params.id;
    const { reason } = req.body as { reason?: string };
    const stream = db
      .prepare("SELECT * FROM streams WHERE id = ?")
      .get(streamId) as
      | { id: string; owner_id: string; status: string }
      | undefined;

    if (!stream) {
      return res.status(404).json({ message: "Stream not found" });
    }

    const isOwner = stream.owner_id === req.user!.id;
    if (req.user!.role !== "admin" && !isOwner) {
      return res.status(403).json({ message: "Not allowed to stop this stream" });
    }

    const now = new Date().toISOString();
    const stoppedReason = reason ?? "配信者により停止されました";
    db.prepare(
      `UPDATE streams
       SET status = 'stopped', stopped_at = ?, stopped_reason = ?
       WHERE id = ?`
    ).run(now, stoppedReason, streamId);

    broadcastToStream(streamId, {
      type: "stream_stopped",
      reason: stoppedReason
    });

    const clients = streamClients.get(streamId);
    if (clients) {
      for (const ws of clients) {
        ws.close(1000, "Stream stopped");
      }
      streamClients.delete(streamId);
    }

    return res.json({ id: streamId, status: "stopped", stoppedReason });
  }
);

app.get("/api/streams/:id/chat", requireAuth, (req, res) => {
  const streamId = req.params.id;
  const messages = db
    .prepare(
      `SELECT chat_messages.id, chat_messages.content, chat_messages.created_at as createdAt,
        users.display_name as author
       FROM chat_messages
       JOIN users ON users.id = chat_messages.user_id
       WHERE chat_messages.stream_id = ?
       ORDER BY chat_messages.created_at DESC
       LIMIT 50`
    )
    .all(streamId);
  res.json({ messages: messages.reverse() });
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "", `http://${req.headers.host}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "", `http://${req.headers.host}`);
  const streamId = url.searchParams.get("streamId");
  const cookieHeader = req.headers.cookie ?? "";
  const parsed = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((pair) => pair.length === 2)
  );
  const sessionId = parsed.session_id;
  if (!sessionId || !streamId) {
    ws.close(1008, "Unauthorized");
    return;
  }
  const session = db
    .prepare("SELECT user_id as userId, expires_at as expiresAt FROM sessions WHERE id = ?")
    .get(sessionId) as { userId: string; expiresAt: string } | undefined;

  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    ws.close(1008, "Session expired");
    return;
  }

  const user = db
    .prepare("SELECT id, display_name as displayName FROM users WHERE id = ?")
    .get(session.userId) as { id: string; displayName: string } | undefined;

  if (!user) {
    ws.close(1008, "User not found");
    return;
  }

  const clients = streamClients.get(streamId) ?? new Set<WebSocket>();
  clients.add(ws);
  streamClients.set(streamId, clients);

  ws.on("message", (data) => {
    const messageText = data.toString();
    const now = Date.now();
    const last = lastMessageAt.get(user.id) ?? 0;
    if (now - last < 1000) {
      ws.send(JSON.stringify({ type: "rate_limited", message: "1秒に1回まで" }));
      return;
    }
    lastMessageAt.set(user.id, now);

    const content = messageText.trim();
    if (!content) {
      return;
    }

    const messageId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO chat_messages (id, stream_id, user_id, content, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(messageId, streamId, user.id, content, createdAt);

    broadcastToStream(streamId, {
      type: "chat_message",
      id: messageId,
      author: user.displayName,
      content,
      createdAt
    });
  });

  ws.on("close", () => {
    const set = streamClients.get(streamId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        streamClients.delete(streamId);
      }
    }
  });
});

const port = Number(process.env.PORT ?? 4000);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API server running on http://localhost:${port}`);
});
