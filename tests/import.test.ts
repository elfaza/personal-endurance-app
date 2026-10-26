import { describe, expect, it } from "vitest";
import { mapLegacyRows } from "@/lib/google-sheets/import";
const values = [
  ["My ID", "Day", "Sport", "Session", "Km", "State"],
  ["abc-123", "2026-10-26", "Easy Run", "Morning easy run", "5", "Planned"],
];
const mapping = {
  id: "My ID",
  date: "Day",
  type: "Sport",
  title: "Session",
  distanceKm: "Km",
  status: "State",
};
describe("explicit existing-sheet mapping", () => {
  it("requires a stable ID and explicit required column mappings", () => {
    expect(() => mapLegacyRows(values, {}, "sheet:tab")).toThrow(
      "Map a source column",
    );
  });
  it("normalizes numeric metric targets and uses stable source IDs", () => {
    const a = mapLegacyRows(values, mapping, "sheet:tab");
    const b = mapLegacyRows([values[0], values[1]], mapping, "sheet:tab");
    expect(a.rows[0].workout.distanceKm).toBe(5);
    expect(a.rows[0].id).toBe(b.rows[0].id);
  });
  it("refuses duplicate IDs and ambiguous headers before any write", () => {
    expect(() =>
      mapLegacyRows([...values, values[1]], mapping, "sheet"),
    ).toThrow("duplicated");
    expect(() =>
      mapLegacyRows([[...values[0], "My ID"], values[1]], mapping, "sheet"),
    ).toThrow("exactly once");
  });
  it("detects external source edits between preview and import", () => {
    const a = mapLegacyRows(values, mapping, "s");
    const b = mapLegacyRows(
      [values[0], [...values[1].slice(0, 4), "6", "Planned"]],
      mapping,
      "s",
    );
    expect(a.sourceHash).not.toBe(b.sourceHash);
    expect(() =>
      mapLegacyRows(
        [values[0], ["abc", "26/10/2026", "Easy Run", "Run", "5", "Planned"]],
        mapping,
        "s",
      ),
    ).toThrow("ISO dates");
  });
});
