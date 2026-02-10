import { describe, expect, it } from "vitest";

// SQLiteをメモリに切り替えてから読み込む
process.env.SQLITE_PATH = ":memory:";

const auth = await import("../src/auth.js");

describe("session", () => {
  it("creates a session id", () => {
    const user = auth.createUser({
      email: "test@example.com",
      password: "password",
      displayName: "Tester"
    });
    const session = auth.createSession(user.id);
    expect(session.id).toBeTruthy();
  });
});
