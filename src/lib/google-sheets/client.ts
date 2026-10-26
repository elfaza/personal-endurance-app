import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { datasets, type Dataset } from "../domain";
import { HEADERS, mapRows, type Snapshot } from "./rows";
import { AppError } from "../server/errors";
import { oauthReady, tokenResponse } from "./oauth";
export const WRITE_LOCK_TITLE = "PE_Write_Lock";
export type SheetCommit = (requests: unknown[]) => Promise<void>;
const sheetSchema = z.object({
  spreadsheetId: z.string(),
  properties: z.object({ title: z.string() }),
  sheets: z.array(
    z.object({
      properties: z.object({ sheetId: z.number(), title: z.string() }),
    }),
  ),
});
export type SheetInventory = z.infer<typeof sheetSchema>;
export class SheetsClient {
  private token?: { value: string; expiry: number };
  private pending?: Promise<string>;
  constructor(private http: typeof fetch = fetch) {}
  private async auth(): Promise<string> {
    if (this.token && this.token.expiry > Date.now() + 60000)
      return this.token.value;
    if (this.pending) return this.pending;
    this.pending = this.obtain();
    try {
      return await this.pending;
    } finally {
      this.pending = undefined;
    }
  }
  private async obtain() {
    if (!oauthReady())
      throw new AppError(
        "Complete Google OAuth setup and save GOOGLE_REFRESH_TOKEN in Vercel first.",
        503,
      );
    const response = await this.http("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new AppError(
        "Google authorization failed. Reconnect Google from Settings, save the new refresh token, and redeploy.",
        502,
      );
    const body = tokenResponse.parse(await response.json());
    this.token = {
      value: body.access_token,
      expiry: Date.now() + body.expires_in * 1000,
    };
    return body.access_token;
  }
  async request(path = "", init: RequestInit = {}) {
    if (init.method && init.method !== "GET")
      throw new AppError("Sheets mutations require the shared save lock.", 403);
    return this.send(path, init);
  }
  private async send(path: string, init: RequestInit = {}) {
    const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!id || !/^[\w-]+$/.test(id))
      throw new AppError("Configure a valid Google spreadsheet ID.", 503);
    const response = await this.http(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${await this.auth()}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) {
      if (response.status === 401) this.token = undefined;
      throw new AppError(
        response.status === 403
          ? "Your Google account needs Editor access to this spreadsheet. Enable Google Sheets API and reconnect with editing access."
          : response.status === 429
            ? "Google Sheets is rate limiting requests. No write retry was attempted. Refresh before trying again."
            : "Google Sheets request failed. No automatic write retry was attempted; refresh before retrying.",
        502,
      );
    }
    return response.json();
  }
  private async batch(requests: unknown[]) {
    // Native fetch never retries a write, including on 401, 429 or timeout.
    return this.send(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
  }
  async withWriteLock<T>(
    work: (commit: SheetCommit) => Promise<T>,
  ): Promise<T> {
    if (process.env.GOOGLE_SHEETS_WRITES_ENABLED !== "true")
      throw new AppError(
        "Google Sheets writes are disabled. Set GOOGLE_SHEETS_WRITES_ENABLED=true and redeploy.",
        403,
      );
    const sheetId = randomInt(1, 2147483647);
    try {
      // Google enforces unique worksheet titles, serializing all app instances.
      // No lease expiry or automatic lock stealing: delayed saves must be fenced.
      await this.batch([
        {
          addSheet: {
            properties: {
              sheetId,
              title: WRITE_LOCK_TITLE,
              hidden: true,
              gridProperties: { rowCount: 1, columnCount: 1 },
            },
          },
        },
      ]);
    } catch {
      throw new AppError(
        "Another save is running or needs review, or Google editing access is missing. Refresh first. If PE_Write_Lock remains, request recovery; do not delete it while a save may be running.",
        409,
      );
    }
    let submitted = false;
    try {
      return await work(async (requests) => {
        if (submitted)
          throw new AppError("A save may only be submitted once.", 409);
        submitted = true;
        try {
          // Exact lock ID is a fence. If recovered manually, an old batch fails
          // in full; it cannot commit after a newer lock has been acquired.
          await this.batch([...requests, { deleteSheet: { sheetId } }]);
        } catch {
          throw new AppError(
            "The save result is uncertain. No automatic retry was attempted. Refresh to see whether it saved. Further saves may be blocked until PE_Write_Lock is reviewed.",
            503,
          );
        }
      });
    } finally {
      // A validation failure sent no content write. Once submitted, only the
      // atomic commit may unlock, even when its response was lost.
      if (!submitted) {
        try {
          await this.batch([{ deleteSheet: { sheetId } }]);
        } catch {
          throw new AppError(
            "The save did not submit content, but its lock cleanup is uncertain. Request PE_Write_Lock recovery before editing again.",
            503,
          );
        }
      }
    }
  }
  async inspect(): Promise<SheetInventory> {
    return sheetSchema.parse(
      await this.request(
        "?fields=spreadsheetId,properties(title),sheets(properties(sheetId,title))",
      ),
    );
  }
  async read(
    inventory?: SheetInventory,
  ): Promise<{ snapshot: Snapshot; initialized: boolean }> {
    const info = inventory ?? (await this.inspect());
    const present = datasets.filter((d) =>
      info.sheets.some((s) => s.properties.title === `PE_${d}`),
    );
    const snapshot: Snapshot = {
      Workouts: [],
      Feedback: [],
      Goals: [],
      ActivityLinks: [],
      Activities: [],
      Meta: [],
    };
    if (!present.length) return { snapshot, initialized: false };
    const params = new URLSearchParams();
    present.forEach((d) => params.append("ranges", `'PE_${d}'!A:G`));
    const result = z
      .object({
        valueRanges: z.array(
          z.object({ values: z.array(z.array(z.unknown())).optional() }),
        ),
      })
      .parse(await this.request(`/values:batchGet?${params}`));
    present.forEach(
      (d, i) => (snapshot[d] = mapRows(result.valueRanges[i]?.values)),
    );
    return { snapshot, initialized: present.length === datasets.length };
  }
  async initialize() {
    await this.read(); // Refuse unexpected existing PE schemas before any write.
    return this.withWriteLock(async (commit) => {
      const info = await this.inspect();
      await this.read(info); // inspect/validate existing PE data before any mutation
      const requests: unknown[] = [];
      for (const [i, d] of datasets.entries()) {
        if (info.sheets.some((s) => s.properties.title === `PE_${d}`)) continue;
        const used = new Set(info.sheets.map((s) => s.properties.sheetId));
        let sheetId = 700000 + i;
        while (used.has(sheetId)) sheetId += 100;
        requests.push(
          {
            addSheet: {
              properties: {
                sheetId,
                title: `PE_${d}`,
                gridProperties: { frozenRowCount: 1 },
              },
            },
          },
          {
            appendCells: {
              sheetId,
              rows: [
                {
                  values: HEADERS.map((v) => ({
                    userEnteredValue: { stringValue: v },
                  })),
                },
              ],
              fields: "userEnteredValue",
            },
          },
        );
      }
      if (requests.length) await commit(requests);
    });
  }
  async append(
    rows: { dataset: Dataset; values: string[] }[],
    commit: SheetCommit,
  ) {
    if (!rows.length) return;
    const info = await this.inspect();
    const requests = rows.map((r) => {
      const sheet = info.sheets.find(
        (s) => s.properties.title === `PE_${r.dataset}`,
      );
      if (!sheet)
        throw new AppError(
          "Initialize PE worksheets in Settings before editing.",
          409,
        );
      return {
        appendCells: {
          sheetId: sheet.properties.sheetId,
          rows: [
            {
              values: r.values.map((v) => ({
                userEnteredValue: { stringValue: v },
              })),
            },
          ],
          fields: "userEnteredValue",
        },
      };
    });
    // One atomic Sheets request for workout + link + reschedule history changes.
    await commit(requests);
  }
  async verifyConnection() {
    // Only a new disposable tab receives the test value. Existing cells,
    // formulas, formats, and tabs are never included in these write requests.
    const before = await this.inspect();
    const title = `PE_Verify_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    const sheetId = randomInt(1, 2147483647);
    const marker = `connection-check-${randomUUID()}`;
    return this.withWriteLock(async (commit) => {
      await commit([
        {
          addSheet: {
            properties: {
              sheetId,
              title,
              hidden: true,
              gridProperties: { rowCount: 1, columnCount: 1 },
            },
          },
        },
        {
          updateCells: {
            start: { sheetId, rowIndex: 0, columnIndex: 0 },
            rows: [{ values: [{ userEnteredValue: { stringValue: marker } }] }],
            fields: "userEnteredValue",
          },
        },
      ]);
      const result = await this.request(
        `/values/${encodeURIComponent(`'${title}'!A1`)}?valueRenderOption=UNFORMATTED_VALUE`,
      );
      if (result.values?.[0]?.[0] !== marker)
        throw new AppError(
          "Verification value did not match. The disposable verification tab was retained for review.",
          503,
        );
      // A second fenced save cleans up only the exact tab ID we created.
      await this.withWriteLock(async (cleanup) => {
        const now = await this.inspect();
        if (
          !now.sheets.some(
            (s) =>
              s.properties.sheetId === sheetId && s.properties.title === title,
          )
        )
          throw new AppError(
            "Verification worksheet changed. Cleanup stopped for review.",
            409,
          );
        await cleanup([{ deleteSheet: { sheetId } }]);
      });
      const after = await this.inspect();
      if (
        !before.sheets.every((s) =>
          after.sheets.some(
            (a) =>
              a.properties.sheetId === s.properties.sheetId &&
              a.properties.title === s.properties.title,
          ),
        )
      )
        throw new AppError(
          "Worksheet inventory changed during verification. Review external edits.",
          409,
        );
      return {
        read: true,
        write: true,
        cleanup: true,
        originalTabsRetained: true,
      };
    });
  }
}
export const sheets = new SheetsClient();
