import { afterEach, describe, expect, it, vi } from "vitest";
import { configuration } from "@/lib/server/config";
import { getData } from "@/lib/server/service";
import { DemoRepository } from "@/lib/server/repository";
afterEach(() => vi.unstubAllEnvs());
describe("private hosted demo", () => {
  it("serves labeled read-only sample data on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("PE_DATA_MODE", "demo");
    vi.stubEnv("PE_DEMO_FILE", "hosting-test-seed.json");
    const data = await getData();
    expect(data.mode).toBe("demo");
    expect(data.configured.readOnly).toBe(true);
    expect(data.activities.every((a) => a.source === "demo")).toBe(true);
  });
  it("refuses demo writes before touching ephemeral server storage", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("PE_DATA_MODE", "demo");
    await expect(
      new DemoRepository().commit([], "test-operation"),
    ).rejects.toThrow("hosted demo is read-only");
  });
  it("preserves writable local demos and Sheets-backed live mode", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("PE_DATA_MODE", "demo");
    expect(configuration().readOnly).toBe(false);
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("PE_DATA_MODE", "live");
    vi.stubEnv("GOOGLE_SHEETS_WRITES_ENABLED", "true");
    expect(configuration().readOnly).toBe(false);
  });
});
