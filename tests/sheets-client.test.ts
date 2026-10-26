import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SheetsClient, WRITE_LOCK_TITLE } from "@/lib/google-sheets/client";
import { SheetsRepository } from "@/lib/server/repository";
import { HEADERS } from "@/lib/google-sheets/rows";
import { datasets } from "@/lib/domain";
type Tab = { id: number; title: string; values: unknown[][] };
function fakeGoogle(initialized = false) {
  let tabs: Tab[] = [
    {
      id: 1,
      title: "Original",
      values: [
        ["Existing formula", "Formatting retained"],
        ["=SUM(1,2)", "Do not touch"],
      ],
    },
  ];
  if (initialized)
    tabs.push(
      ...datasets.map((d, i) => ({
        id: 700000 + i,
        title: `PE_${d}`,
        values: [HEADERS],
      })),
    );
  const batches: unknown[][] = [];
  let loseNextCommit = false;
  const response = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });
  const http = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).includes("oauth2")) {
      expect(
        new URLSearchParams(init?.body as URLSearchParams).get("grant_type"),
      ).toBe("refresh_token");
      return response({ access_token: "fake-google-access", expires_in: 3600 });
    }
    if (init?.method === "POST") {
      const requests = JSON.parse(String(init.body)).requests;
      batches.push(requests);
      const next = structuredClone(tabs);
      for (const r of requests) {
        if (r.addSheet) {
          const p = r.addSheet.properties;
          if (next.some((t) => t.title === p.title || t.id === p.sheetId))
            return response({}, 400);
          next.push({ id: p.sheetId, title: p.title, values: [] });
        } else if (r.deleteSheet) {
          const i = next.findIndex((t) => t.id === r.deleteSheet.sheetId);
          if (i < 0) return response({}, 400);
          next.splice(i, 1);
        } else if (r.appendCells || r.updateCells) {
          const c = r.appendCells ?? r.updateCells;
          const t = next.find((t) => t.id === (c.sheetId ?? c.start.sheetId))!;
          const values = c.rows.map(
            (row: {
              values: { userEnteredValue: { stringValue: string } }[];
            }) => row.values.map((v) => v.userEnteredValue.stringValue),
          );
          if (r.appendCells) t.values.push(...values);
          else t.values = values;
        } else throw new Error("Unexpected request");
      }
      if (
        loseNextCommit &&
        requests.some((r: { deleteSheet?: unknown }) => r.deleteSheet)
      ) {
        loseNextCommit = false;
        throw new Error("Simulated lost response before commit");
      }
      tabs = next;
      return response({ replies: [] });
    }
    const parsed = new URL(String(url));
    if (parsed.pathname.includes("values:batchGet"))
      return response({
        valueRanges: parsed.searchParams
          .getAll("ranges")
          .map((range) => ({
            values:
              tabs.find((t) => range.startsWith(`'${t.title}'!`))?.values ?? [],
          })),
      });
    if (parsed.pathname.includes("/values/")) {
      const range = decodeURIComponent(parsed.pathname.split("/values/")[1]);
      return response({
        values:
          tabs.find((t) => range.startsWith(`'${t.title}'!`))?.values ?? [],
      });
    }
    return response({
      spreadsheetId: "test-sheet",
      properties: { title: "Existing tracker" },
      sheets: tabs.map((t) => ({
        properties: { sheetId: t.id, title: t.title },
      })),
    });
  });
  return {
    http,
    batches,
    tabs: () => tabs,
    loseCommit: () => {
      loseNextCommit = true;
    },
    recover: () => {
      tabs = tabs.filter((t) => t.title !== WRITE_LOCK_TITLE);
    },
  };
}
beforeEach(() => {
  vi.stubEnv("GOOGLE_AUTH_MODE", "oauth");
  vi.stubEnv("GOOGLE_CLIENT_ID", "fake-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fake-secret");
  vi.stubEnv("GOOGLE_REFRESH_TOKEN", "fake-refresh");
  vi.stubEnv("GOOGLE_SHEETS_SPREADSHEET_ID", "test-sheet");
  vi.stubEnv("GOOGLE_SHEETS_WRITES_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());
describe("OAuth Sheets persistence and shared save fencing", () => {
  it("initializes dedicated tabs and preserves every original cell", async () => {
    const server = fakeGoogle();
    const before = structuredClone(server.tabs()[0]);
    await new SheetsClient(server.http).initialize();
    expect(server.tabs().find((t) => t.id === 1)).toEqual(before);
    expect(server.tabs().filter((t) => t.title.startsWith("PE_"))).toHaveLength(
      6,
    );
    expect(server.tabs().some((t) => t.title === WRITE_LOCK_TITLE)).toBe(false);
    const commit = server.batches.find((b) => b.length > 1)!;
    expect(commit.at(-1)).toHaveProperty("deleteSheet");
  });
  it("refuses incompatible PE columns before any sheet mutation", async () => {
    const server = fakeGoogle(true);
    server.tabs()[1].values[0] = ["wrong", "header"];
    await expect(new SheetsClient(server.http).initialize()).rejects.toThrow(
      "unexpected columns",
    );
    expect(server.batches).toHaveLength(0);
  });
  it("serializes separate clients using Google's unique lock title", async () => {
    const server = fakeGoogle();
    const one = new SheetsClient(server.http),
      two = new SheetsClient(server.http);
    let release!: () => void;
    const wait = new Promise<void>((r) => (release = r));
    let entered!: () => void;
    const acquired = new Promise<void>((r) => (entered = r));
    const first = one.withWriteLock(async (commit) => {
      entered();
      await wait;
      await commit([]);
    });
    await acquired;
    const work = vi.fn();
    await expect(two.withWriteLock(work)).rejects.toThrow("Another save");
    expect(work).not.toHaveBeenCalled();
    release();
    await first;
    await two.withWriteLock(async (commit) => commit([]));
    expect(server.tabs().some((t) => t.title === WRITE_LOCK_TITLE)).toBe(false);
  });
  it("retains a lock after an uncertain write and never retries it", async () => {
    const server = fakeGoogle();
    const client = new SheetsClient(server.http);
    server.loseCommit();
    await expect(
      client.withWriteLock(async (commit) => commit([])),
    ).rejects.toThrow("uncertain");
    expect(server.batches).toHaveLength(2);
    expect(server.tabs().some((t) => t.title === WRITE_LOCK_TITLE)).toBe(true);
    await expect(
      new SheetsClient(server.http).withWriteLock(async (commit) => commit([])),
    ).rejects.toThrow("Another save");
    expect(server.batches).toHaveLength(3);
  });
  it("fences delayed old writes after operator recovery", async () => {
    const server = fakeGoogle(true);
    const client = new SheetsClient(server.http);
    await expect(
      client.withWriteLock(async (commit) => {
        server.recover();
        await commit([
          {
            appendCells: {
              sheetId: 700000,
              rows: [
                {
                  values: [
                    { userEnteredValue: { stringValue: "must not persist" } },
                  ],
                },
              ],
              fields: "userEnteredValue",
            },
          },
        ]);
      }),
    ).rejects.toThrow("uncertain");
    expect(server.tabs().find((t) => t.id === 700000)?.values).toEqual([
      HEADERS,
    ]);
  });
  it("checks stale revisions under the shared lock, preserves idempotency, and unlocks validation failures", async () => {
    const server = fakeGoogle(true);
    const one = new SheetsRepository(new SheetsClient(server.http));
    const two = new SheetsRepository(new SheetsClient(server.http));
    const change = {
      dataset: "Goals" as const,
      id: "goal",
      expected: null,
      payload: { id: "goal", title: "First" },
    };
    const original = (await one.read()).snapshot;
    await one.commit([change], "operation-one", original);
    await two.commit([change], "operation-one", original);
    await expect(
      two.commit(
        [{ ...change, payload: { title: "Stale" } }],
        "operation-two",
        original,
      ),
    ).rejects.toThrow("changed elsewhere");
    expect((await one.read()).snapshot.Goals[0].payload.title).toBe("First");
    expect(
      server.tabs().find((t) => t.title === "PE_Goals")?.values,
    ).toHaveLength(2);
    expect(server.tabs().some((t) => t.title === WRITE_LOCK_TITLE)).toBe(false);
  });
  it("verifies read/write using only a disposable sheet, then cleans it up", async () => {
    const server = fakeGoogle();
    const before = structuredClone(server.tabs());
    expect(await new SheetsClient(server.http).verifyConnection()).toEqual({
      read: true,
      write: true,
      cleanup: true,
      originalTabsRetained: true,
    });
    expect(server.tabs()).toEqual(before);
  });
  it("refuses all mutation paths when the write flag is disabled", async () => {
    vi.stubEnv("GOOGLE_SHEETS_WRITES_ENABLED", "false");
    const server = fakeGoogle();
    const client = new SheetsClient(server.http);
    await expect(
      client.withWriteLock(async (commit) => commit([])),
    ).rejects.toThrow("writes are disabled");
    await expect(
      client.request(":batchUpdate", { method: "POST" }),
    ).rejects.toThrow("shared save lock");
    expect(server.http).not.toHaveBeenCalled();
  });
});
