import { describe, expect, it, vi } from "vitest";
import { GarminClient } from "@/lib/garmin/client";
function token(exp: number) {
  return `header.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
}
describe("Garmin token lifecycle", () => {
  it("exchanges ApiKey for a raw JWT, caches it and coalesces concurrent requests", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(token(100000)));
    const client = new GarminClient("test-key", http, () => 0);
    await Promise.all([client.token(), client.token(), client.token()]);
    expect(http).toHaveBeenCalledTimes(1);
    expect(http.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: { Authorization: "ApiKey test-key" },
    });
  });
  it("reobtains tokens near expiry without a refresh-token flow", async () => {
    let now = 0;
    const http = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(token(10000)));
    const client = new GarminClient("key", http, () => now);
    await client.token();
    now = 9000 * 1000;
    await client.token();
    expect(http).toHaveBeenCalledTimes(2);
  });
  it("retries a revoked bearer once and does not expose credential errors", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(token(9999999999)))
      .mockResolvedValueOnce(
        new Response("revoked private information", { status: 401 }),
      )
      .mockResolvedValueOnce(new Response(token(9999999999)))
      .mockResolvedValueOnce(new Response("[]"));
    const client = new GarminClient("secret", http);
    expect(await client.list("2026-10-01", "2026-10-26")).toEqual([]);
    expect(http).toHaveBeenCalledTimes(4);
  });
  it("rejects revoked keys and invalid tokens safely", async () => {
    const denied = new GarminClient(
      "private",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("credential detail", { status: 403 })),
    );
    await expect(denied.token()).rejects.toThrow("Garmin rejected the API key");
    const invalid = new GarminClient(
      "private",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('{"access_token":"invented"}')),
    );
    await expect(invalid.token()).rejects.toThrow(
      "invalid or expired bearer token",
    );
  });
  it("follows pagination and deduplicates by Garmin activity ID", async () => {
    const raw = {
      activityId: 123,
      activityName: "Run",
      activityType: { typeKey: "running" },
      startTimeGMT: "2026-10-26T00:00:00",
      distance: 5000,
      duration: 2000,
    };
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(token(9999999999)))
      .mockResolvedValueOnce(new Response(JSON.stringify(Array(100).fill(raw))))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([raw, { ...raw, activityId: 124 }])),
      );
    expect(
      await new GarminClient("key", http).list("2026-10-01", "2026-10-26"),
    ).toHaveLength(2);
    expect(String(http.mock.calls[2][0])).toContain("start=100");
  });
});
