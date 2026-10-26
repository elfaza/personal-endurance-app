import { describe, expect, it } from "vitest";
import { assertExpected, HEADERS, mapRows } from "@/lib/google-sheets/rows";
const row = (revision: string, parent = "", notes = "hello") => [
  "w1",
  revision,
  parent,
  "2026-10-26T00:00:00Z",
  "false",
  JSON.stringify({ title: "Easy run", notes }),
  `op-${revision}`,
];
describe("Google Sheets adapter and revisions", () => {
  it("maps IDs, preserves notes and resolves chains independent of row ordering", () => {
    const r = mapRows([HEADERS, row("v2", "v1", "new"), row("v1")]);
    expect(r).toHaveLength(1);
    expect(r[0].revision).toBe("v2");
    expect(r[0].payload.notes).toBe("new");
  });
  it("recognizes external cell edits as a new optimistic revision", () => {
    const a = mapRows([HEADERS, row("v1")])[0],
      b = mapRows([HEADERS, row("v1", "", "external")])[0];
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(() => assertExpected(b, a.fingerprint)).toThrow("changed elsewhere");
  });
  it("retains concurrent branches and fails without silently selecting one", () =>
    expect(() =>
      mapRows([HEADERS, row("v1"), row("v2", "v1"), row("v3", "v1")]),
    ).toThrow("Concurrent changes"));
  it("collapses exact retries and rejects malformed schema", () => {
    expect(mapRows([HEADERS, row("v1"), row("v1")])).toHaveLength(1);
    expect(() => mapRows([["date", "name"], row("v1")])).toThrow(
      "unexpected columns",
    );
    expect(() => mapRows([HEADERS, ["bad"]])).toThrow("invalid row");
  });
  it("refuses missing history and stale creates", () => {
    expect(() => mapRows([HEADERS, row("v2", "missing")])).toThrow(
      "Missing revision",
    );
    expect(() =>
      assertExpected(mapRows([HEADERS, row("v1")])[0], null),
    ).toThrow("changed elsewhere");
  });
});
