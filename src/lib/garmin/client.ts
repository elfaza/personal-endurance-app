import "server-only";
import { z } from "zod";
import { AppError } from "../server/errors";
import { normalizeActivity } from "./normalize";
import type { Activity } from "../domain";
const BASE = "https://personal.connectapi.garmin.com";
export class GarminClient {
  private cached?: { token: string; expiresAt: number };
  private pending?: Promise<string>;
  constructor(
    private key: string,
    private http: typeof fetch = fetch,
    private clock = Date.now,
  ) {}
  async token(): Promise<string> {
    if (this.cached && this.cached.expiresAt - this.clock() > 3600_000)
      return this.cached.token;
    if (this.pending) return this.pending;
    this.pending = this.obtain();
    try {
      return await this.pending;
    } finally {
      this.pending = undefined;
    }
  }
  private async obtain() {
    if (!this.key.trim())
      throw new AppError("Garmin Personal API key is not configured.", 503);
    const response = await this.http(
      `${BASE}/personalapitoken-service/personal-api/personal-api-key/token`,
      {
        method: "POST",
        headers: { Authorization: `ApiKey ${this.key}`, Accept: "*/*" },
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      throw new AppError(
        response.status === 401 || response.status === 403
          ? "Garmin rejected the API key. Check whether it has expired or been revoked."
          : "Garmin token service is unavailable. Try again later.",
        502,
      );
    const token = (await response.text()).trim();
    try {
      const payload = z
        .object({ exp: z.number().positive() })
        .parse(
          JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()),
        );
      if (payload.exp * 1000 <= this.clock()) throw new Error("expired");
      this.cached = { token, expiresAt: payload.exp * 1000 };
    } catch {
      throw new AppError(
        "Garmin returned an invalid or expired bearer token.",
        502,
      );
    }
    return token;
  }
  async request(path: string, binary = false): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.http(`${BASE}${path}`, {
        headers: {
          Authorization: `Bearer ${await this.token()}`,
          Accept: binary
            ? "application/zip, application/octet-stream"
            : "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      });
      if (response.status === 401 && attempt === 0) {
        this.cached = undefined;
        continue;
      }
      if (!response.ok)
        throw new AppError(
          response.status === 429
            ? "Garmin’s request limit was reached. Wait before syncing again."
            : response.status === 401 || response.status === 403
              ? "Garmin authorization failed. Check your Personal API key."
              : response.status === 404
                ? "This Garmin activity or download is unavailable."
                : "Garmin is temporarily unavailable. Your saved activities are unchanged.",
          502,
        );
      return response;
    }
    throw new AppError("Garmin authorization failed.", 502);
  }
  async list(startDate: string, endDate: string): Promise<Activity[]> {
    const result = new Map<string, Activity>();
    for (let start = 0; start < 10000; start += 100) {
      const params = new URLSearchParams({
        start: String(start),
        limit: "100",
        startDate,
        endDate,
        excludeChildren: "true",
      });
      const raw = z
        .array(z.unknown())
        .parse(
          await (
            await this.request(
              `/activitylist-service/activities/search/activities?${params}`,
            )
          ).json(),
        );
      for (const item of raw) {
        const a = normalizeActivity(item);
        result.set(a.id, a);
      }
      if (raw.length < 100) return [...result.values()];
    }
    throw new AppError(
      "More than 10,000 activities in this sync window. Use a shorter date range.",
      400,
    );
  }
  async detail(id: string) {
    return normalizeActivity(
      await (await this.request(`/activity-service/activity/${id}`)).json(),
      true,
    );
  }
  async download(id: string) {
    return this.request(`/download-service/files/activity/${id}`, true);
  }
}
let singleton: GarminClient | undefined;
export function garmin() {
  return (singleton ??= new GarminClient(
    process.env.GARMIN_PERSONAL_API_KEY ?? "",
  ));
}
