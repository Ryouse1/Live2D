import crypto from "crypto";
import bcrypt from "bcrypt";
import db from "./db.js";

export type UserRole = "admin" | "streamer" | "viewer";

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string | null;
  google_id: string | null;
  display_name: string;
  role: UserRole;
  created_at: string;
}

// セッション有効期限 (12時間)
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

// CookieはセッションIDのみを保持 (HttpOnly, Secure, SameSite=Strict)
export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  maxAge: SESSION_TTL_MS / 1000,
  path: "/"
};

export function createUser(params: {
  email: string;
  password: string;
  displayName: string;
  role?: UserRole;
}): UserRecord {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const password_hash = bcrypt.hashSync(params.password, 12);
  const role = params.role ?? "viewer";

  db.prepare(
    `INSERT INTO users (id, email, password_hash, google_id, display_name, role, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?)`
  ).run(id, params.email, password_hash, params.displayName, role, now);

  return getUserById(id);
}

export function createGoogleUser(params: {
  email: string;
  googleId: string;
  displayName: string;
}): UserRecord {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  db.prepare(
    `INSERT INTO users (id, email, password_hash, google_id, display_name, role, created_at)
     VALUES (?, ?, NULL, ?, ?, 'viewer', ?)`
  ).run(id, params.email, params.googleId, params.displayName, now);

  return getUserById(id);
}

export function verifyPassword(user: UserRecord, password: string): boolean {
  if (!user.password_hash) {
    return false;
  }
  return bcrypt.compareSync(password, user.password_hash);
}

export function getUserByEmail(email: string): UserRecord | null {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  return row ? (row as UserRecord) : null;
}

export function getUserByGoogleId(googleId: string): UserRecord | null {
  const row = db.prepare("SELECT * FROM users WHERE google_id = ?").get(googleId);
  return row ? (row as UserRecord) : null;
}

export function getUserById(id: string): UserRecord {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!row) {
    throw new Error("User not found");
  }
  return row as UserRecord;
}

export function createSession(userId: string): { id: string; expiresAt: Date } {
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  db.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at)
     VALUES (?, ?, ?, ?)`
  ).run(id, userId, now.toISOString(), expiresAt.toISOString());

  return { id, expiresAt };
}

export function deleteSession(sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export function getSession(sessionId: string): { id: string; userId: string; expiresAt: string } | null {
  const row = db
    .prepare("SELECT id, user_id as userId, expires_at as expiresAt FROM sessions WHERE id = ?")
    .get(sessionId);
  return row ? (row as { id: string; userId: string; expiresAt: string }) : null;
}

export function pruneExpiredSessions(): void {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
}
