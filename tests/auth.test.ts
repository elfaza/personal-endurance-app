import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  authorize,
  assertOrigin,
  makeSession,
  validSession,
} from "@/lib/server/auth";
afterEach(() => vi.unstubAllEnvs());
describe("single-user access control", () => {
  it("recognizes localhost Host when Next uses its bind address internally", () => {
    vi.stubEnv("PE_DATA_MODE", "demo");
    vi.stubEnv("APP_PASSWORD", "");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(() =>
      authorize(
        new NextRequest("http://0.0.0.0:3000/api/data", {
          headers: { host: "localhost:3000" },
        }),
      ),
    ).not.toThrow();
  });
  it("fails closed in live mode without credentials", () => {
    vi.stubEnv("PE_DATA_MODE", "live");
    vi.stubEnv("APP_PASSWORD", "");
    vi.stubEnv("SESSION_SECRET", "");
    expect(() =>
      authorize(new NextRequest("http://localhost:3000/api/data")),
    ).toThrow("Set APP_PASSWORD");
  });
  it("requires a valid session on data endpoints", () => {
    vi.stubEnv("APP_PASSWORD", "a-long-private-password");
    vi.stubEnv("SESSION_SECRET", "a-very-long-random-session-secret-123");
    expect(() =>
      authorize(new NextRequest("http://localhost:3000/api/data")),
    ).toThrow("Sign in");
    const session = makeSession();
    expect(() =>
      authorize(
        new NextRequest("http://localhost:3000/api/data", {
          headers: { cookie: `pe_session=${session}` },
        }),
      ),
    ).not.toThrow();
  });
  it("rejects tampering and invalidates cookies after password rotation", () => {
    vi.stubEnv("APP_PASSWORD", "a-long-private-password");
    vi.stubEnv("SESSION_SECRET", "a-very-long-random-session-secret-123");
    const session = makeSession();
    expect(validSession(session)).toBe(true);
    expect(validSession(`${session}tampered`)).toBe(false);
    vi.stubEnv("APP_PASSWORD", "a-new-long-private-password");
    expect(validSession(session)).toBe(false);
  });
  it("rejects cross-origin mutations and missing origins", () => {
    vi.stubEnv("APP_URL", "https://training.example.com");
    expect(() =>
      assertOrigin(
        new NextRequest("https://training.example.com/api/training", {
          method: "POST",
          headers: { origin: "https://hostile.example" },
        }),
      ),
    ).toThrow("origin");
    expect(() =>
      assertOrigin(
        new NextRequest("https://training.example.com/api/training", {
          method: "POST",
        }),
      ),
    ).toThrow("origin");
    expect(() =>
      assertOrigin(
        new NextRequest("https://training.example.com/api/training", {
          method: "POST",
          headers: { origin: "https://training.example.com" },
        }),
      ),
    ).not.toThrow();
  });
});
