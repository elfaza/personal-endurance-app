import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { NextRequest } from "next/server";
import { makeSession } from "@/lib/server/auth";
import {
  beginAuthorization,
  googleCallbackUrl,
  validateState,
  SHEETS_SCOPE,
  OAUTH_COOKIE,
} from "@/lib/google-sheets/oauth";
import { POST as start } from "@/app/api/google/route";
import { GET as callback } from "@/app/api/google/callback/route";
beforeEach(() => {
  vi.stubEnv("APP_PASSWORD", "fake-private-app-password");
  vi.stubEnv("SESSION_SECRET", "fake-session-secret-at-least-32-characters");
  vi.stubEnv("APP_ORIGIN", "https://training.example.com");
  vi.stubEnv("GOOGLE_AUTH_MODE", "oauth");
  vi.stubEnv("GOOGLE_CLIENT_ID", "fake-google-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fake-google-secret");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("private direct OAuth setup", () => {
  it("requests offline editing access with state and S256 PKCE; verifier stays server-side", () => {
    const begun = beginAuthorization(makeSession());
    const url = new URL(begun.url);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toBe(SHEETS_SCOPE);
    expect(url.searchParams.get("redirect_uri")).toBe(googleCallbackUrl());
    const verifier = validateState(begun.cookie, url.searchParams.get("state"));
    expect(url.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(verifier).digest("base64url"),
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(begun.cookie).not.toContain(verifier);
    expect(begun.url).not.toContain("fake-google-secret");
  });
  it("rejects forged state, expired attempts, missing cookies and password rotation", () => {
    const begun = beginAuthorization(makeSession());
    const state = new URL(begun.url).searchParams.get("state");
    expect(() => validateState(begun.cookie, "forged")).toThrow("verified");
    expect(() =>
      validateState(begun.cookie, state, Date.now() + 660000),
    ).toThrow("expired");
    expect(() => validateState(undefined, state)).toThrow("verified");
    vi.stubEnv("APP_PASSWORD", "rotated-private-app-password");
    expect(() => validateState(begun.cookie, state)).toThrow("verified");
  });
  it("protects OAuth initiation and rejects cross-origin POSTs", async () => {
    const url = "https://training.example.com/api/google";
    expect(
      (
        await start(
          new NextRequest(url, {
            method: "POST",
            headers: { origin: "https://training.example.com" },
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await start(
          new NextRequest(url, {
            method: "POST",
            headers: {
              origin: "https://hostile.invalid",
              cookie: `pe_session=${makeSession()}`,
            },
          }),
        )
      ).status,
    ).toBe(403);
    const response = await start(
      new NextRequest(url, {
        method: "POST",
        headers: {
          origin: "https://training.example.com",
          cookie: `pe_session=${makeSession()}`,
        },
      }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/);
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=lax/);
  });
  it("validates callback before exchange and returns a no-store masked token page only on a valid proof", async () => {
    const exchange = vi
      .spyOn(OAuth2Client.prototype, "getToken")
      .mockResolvedValue({
        tokens: {
          refresh_token: "fake-refresh-only-for-test",
          scope: SHEETS_SCOPE,
        },
        res: null,
      } as never); // getToken has a callback overload; this test uses its Promise overload.
    const denied = await callback(
      new NextRequest(
        "https://training.example.com/api/google/callback?code=fake-code&state=forged",
      ),
    );
    expect(denied.status).toBe(400);
    expect(exchange).not.toHaveBeenCalled();
    const begun = beginAuthorization(makeSession());
    const state = new URL(begun.url).searchParams.get("state");
    const response = await callback(
      new NextRequest(
        `https://training.example.com/api/google/callback?code=fake-code&state=${state}`,
        { headers: { cookie: `${OAUTH_COOKIE}=${begun.cookie}` } },
      ),
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('type="password"');
    expect(html).toContain("fake-refresh-only-for-test");
    expect(html).not.toMatch(/localStorage|sessionStorage|console\./);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(exchange).toHaveBeenCalledTimes(1);
  });
});
