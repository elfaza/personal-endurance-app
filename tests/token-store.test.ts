import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { get, put } from "@vercel/blob";
import {
  encryptToken,
  decryptToken,
  readRefreshToken,
  saveRefreshToken,
} from "@/lib/google-sheets/token-store";
import { SheetsClient } from "@/lib/google-sheets/client";
vi.mock("@vercel/blob", () => ({ get: vi.fn(), put: vi.fn() }));
beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "fake-session-secret-at-least-32-characters");
  vi.stubEnv("APP_ORIGIN", "https://training.example.com");
  vi.stubEnv("GOOGLE_AUTH_MODE", "oauth");
  vi.stubEnv("GOOGLE_CLIENT_ID", "fake-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fake-client-secret");
  vi.stubEnv("GOOGLE_SHEETS_SPREADSHEET_ID", "fake-sheet");
  vi.stubEnv("GOOGLE_REFRESH_TOKEN", "fake-old-env-token");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "fake-private-store-token");
  vi.stubEnv("VERCEL_BLOB_RETRIES", "0");
  vi.mocked(get).mockReset().mockResolvedValue(null);
  vi.mocked(put)
    .mockReset()
    .mockResolvedValue({} as never);
});
afterEach(() => vi.unstubAllEnvs());
function stored(value: string) {
  vi.mocked(get).mockImplementation(
    async () =>
      ({ statusCode: 200, stream: new Response(value).body! }) as never,
  );
}
describe("encrypted Google connection", () => {
  it("encrypts with unique IVs and authenticates content, origin, client and encryption key", () => {
    const a = encryptToken("fake-refresh-token");
    const b = encryptToken("fake-refresh-token");
    expect(a).not.toEqual(b);
    expect(a).not.toContain("fake-refresh-token");
    expect(decryptToken(a)).toBe("fake-refresh-token");
    const broken = JSON.parse(a);
    broken.tag = Buffer.alloc(16).toString("base64");
    expect(() => decryptToken(JSON.stringify(broken))).toThrow();
    vi.stubEnv("APP_ORIGIN", "https://other.example.com");
    expect(() => decryptToken(a)).toThrow();
    vi.stubEnv("APP_ORIGIN", "https://training.example.com");
    vi.stubEnv("GOOGLE_CLIENT_ID", "another-client");
    expect(() => decryptToken(a)).toThrow();
    vi.stubEnv("GOOGLE_CLIENT_ID", "fake-client");
    vi.stubEnv("SESSION_SECRET", "rotated-secret-at-least-32-characters");
    expect(() => decryptToken(a)).toThrow();
  });
  it("prefers the saved connection, bypasses cached reads, and uses legacy env only if no record exists", async () => {
    expect(await readRefreshToken()).toBe("fake-old-env-token");
    stored(encryptToken("fake-saved-token"));
    expect(await readRefreshToken()).toBe("fake-saved-token");
    expect(get).toHaveBeenLastCalledWith(
      expect.stringMatching(/credential.json$/),
      expect.objectContaining({ access: "private", useCache: false }),
    );
    vi.stubEnv("GOOGLE_REFRESH_TOKEN", "");
    expect(await readRefreshToken()).toBe("fake-saved-token");
  });
  it("fails closed on storage/decryption errors without leaking secrets or falling back", async () => {
    vi.mocked(get).mockRejectedValueOnce(
      new Error("sensitive-provider-error fake-secret"),
    );
    await expect(readRefreshToken()).rejects.toThrow("storage is unavailable");
    stored("bad ciphertext fake-secret");
    await expect(readRefreshToken()).rejects.toThrow("storage is unavailable");
  });
  it("does not retry an uncertain save, and refuses writes unless SDK retries are disabled", async () => {
    vi.mocked(put).mockRejectedValueOnce(new Error("fake-provider-secret"));
    await expect(saveRefreshToken("fake-new-token")).rejects.toThrow(
      "could not be confirmed",
    );
    expect(put).toHaveBeenCalledTimes(1);
    expect(vi.mocked(put).mock.calls[0][1]).not.toContain("fake-new-token");
    vi.stubEnv("VERCEL_BLOB_RETRIES", "10");
    await expect(saveRefreshToken("fake-new-token")).rejects.toThrow(
      "storage is unavailable",
    );
    expect(put).toHaveBeenCalledTimes(1);
  });
  it("existing and fresh app instances use a reconnected token immediately without redeployment", async () => {
    stored(encryptToken("fake-first-token"));
    const refreshes: string[] = [];
    const http = vi.fn(
      async (url: string | URL | Request, options?: RequestInit) => {
        if (String(url).includes("oauth2.googleapis.com")) {
          const token = (options?.body as URLSearchParams).get(
            "refresh_token",
          )!;
          refreshes.push(token);
          return Response.json({
            access_token: `access-${token}`,
            expires_in: 3600,
          });
        }
        return Response.json({ ok: true });
      },
    );
    const client = new SheetsClient(http as typeof fetch);
    await client.request();
    await client.request();
    expect(refreshes).toEqual(["fake-first-token"]);
    stored(encryptToken("fake-reconnected-token"));
    await client.request();
    await new SheetsClient(http as typeof fetch).request();
    expect(refreshes).toEqual([
      "fake-first-token",
      "fake-reconnected-token",
      "fake-reconnected-token",
    ]);
  });
});
