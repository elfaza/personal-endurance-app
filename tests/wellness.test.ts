import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import type { Repository } from "@/lib/server/repository";
import { DemoRepository } from "@/lib/server/repository";
import type { Snapshot, Change, Stored } from "@/lib/google-sheets/rows";
import { assertExpected, fingerprint } from "@/lib/google-sheets/rows";
import {
  saveWellness,
  readMealPhoto,
  personalData,
  record,
  change,
  photoInput,
} from "@/lib/server/wellness-store";
import { generateWellness, getWellness } from "@/lib/server/wellness-ai";
import {
  budgetView,
  RESERVE_IDR,
  MAX_INPUT_TOKENS,
  reservationChanges,
  settlementChanges,
  monthKey,
  costIdr,
} from "@/lib/server/ai-budget";
import { mealTotals, trainingOutlook, ageOn } from "@/lib/wellness";
import { referenceItem } from "@/lib/nutrition";
import { demoData } from "@/lib/demo";
import { localDate } from "@/lib/dates";
import { NextRequest } from "next/server";
import {
  GET as wellnessGet,
  POST as wellnessPost,
} from "@/app/api/wellness/route";
import { POST as aiPost } from "@/app/api/wellness/ai/route";
import { GET as photoGet } from "@/app/api/wellness/photo/[id]/route";

const file = ".data/wellness-unit.json";
// Structural JPEG fixture for storage and dimension validation; browser tests
// generate a real decodable image through canvas.
const jpeg = Buffer.from([
  255, 216, 255, 192, 0, 17, 8, 0, 1, 0, 1, 3, 1, 17, 0, 2, 17, 1, 3, 17, 1,
  255, 217,
]);
const photo = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
const review = {
  summary: "Volume tercatat tersedia, tetapi RPE belum lengkap.",
  insights: [
    {
      observation: "Bandingkan sesi yang serupa.",
      evidence: "Gunakan jumlah sesi dan durasi yang tercatat.",
    },
  ],
  limitations: ["Tidak memprediksi waktu lomba."],
};
const meal = () => ({
  date: localDate(),
  title: "Lunch",
  kind: "Lunch",
  notes: "Sauce separately",
  items: [referenceItem("rice", 200)!],
});
let demo: DemoRepository;
class MemoryRepository implements Repository {
  constructor(public snapshot: Snapshot) {}
  async read() {
    return { snapshot: structuredClone(this.snapshot), initialized: true };
  }
  async commit(changes: Change[], op: string) {
    if (this.snapshot.Meta.some((r) => r.id === `op:${op}`)) return;
    for (const c of changes)
      assertExpected(
        this.snapshot[c.dataset].find((r) => r.id === c.id),
        c.expected,
      );
    for (const c of [
      ...changes,
      { dataset: "Meta" as const, id: `op:${op}`, payload: {}, expected: null },
    ]) {
      const row: Stored = {
        id: c.id,
        revision: randomUUID(),
        parent: "",
        updatedAt: new Date().toISOString(),
        deleted: "deleted" in c && c.deleted === true,
        payload: c.payload,
        operationId: op,
        fingerprint: fingerprint([op, c.id, JSON.stringify(c.payload)]),
      };
      this.snapshot[c.dataset] = [
        ...this.snapshot[c.dataset].filter((r) => r.id !== c.id),
        row,
      ];
    }
  }
}
beforeEach(async () => {
  vi.stubEnv("PE_DATA_MODE", "demo");
  vi.stubEnv("PE_DEMO_FILE", "wellness-unit.json");
  vi.stubEnv("GOOGLE_REFRESH_TOKEN", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("GOOGLE_SHEETS_WRITES_ENABLED", "true");
  vi.stubEnv("OPENAI_API_KEY", "test-key-never-sent-to-a-real-provider");
  await rm(file, { force: true });
  demo = new DemoRepository();
});
afterEach(async () => {
  await rm(file, { force: true });
  vi.unstubAllEnvs();
});
async function liveMemory() {
  const initial = (await demo.read()).snapshot;
  vi.stubEnv("PE_DATA_MODE", "live");
  return new MemoryRepository(initial);
}
function provider(
  value: object,
  usage = { input_tokens: 1000, output_tokens: 300 },
  overrides = {},
) {
  return vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      model: "gpt-6-luna",
      status: "completed",
      usage,
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(value) }],
        },
      ],
      ...overrides,
    }),
  );
}
describe("private personal and meal persistence", () => {
  it("persists profile and dated weight revisions without changing training", async () => {
    const before = (await demo.read()).snapshot.Workouts;
    await saveWellness(
      {
        action: "profile",
        revision: null,
        profile: {
          birthDate: "1996-10-29",
          heightCm: 175,
          experience: "regular",
          goal: "Consistent training",
        },
      },
      randomUUID(),
      demo,
    );
    await saveWellness(
      {
        action: "weight",
        revision: null,
        weight: { date: localDate(), kg: 70 },
      },
      randomUUID(),
      demo,
    );
    let saved = personalData((await new DemoRepository().read()).snapshot);
    expect(saved.profile?.heightCm).toBe(175);
    await saveWellness(
      {
        action: "weight",
        revision: saved.weights[0].revision,
        weight: { date: localDate(), kg: 71 },
      },
      randomUUID(),
      demo,
    );
    saved = personalData((await demo.read()).snapshot);
    expect(saved.weights).toHaveLength(1);
    expect(saved.weights[0].kg).toBe(71);
    expect((await demo.read()).snapshot.Workouts).toEqual(before);
    await expect(
      saveWellness(
        { action: "profile", revision: "stale", profile: saved.profile },
        randomUUID(),
        demo,
      ),
    ).rejects.toThrow("changed elsewhere");
  });
  it("can remove and re-add a weight on the same date while preserving repository history", async () => {
    await saveWellness(
      {
        action: "weight",
        revision: null,
        weight: { date: localDate(), kg: 70 },
      },
      randomUUID(),
      demo,
    );
    const w = personalData((await demo.read()).snapshot).weights[0];
    await saveWellness(
      { action: "delete-weight", revision: w.revision, date: w.date },
      randomUUID(),
      demo,
    );
    await saveWellness(
      { action: "weight", revision: null, weight: { date: w.date, kg: 69 } },
      randomUUID(),
      demo,
    );
    expect(personalData((await demo.read()).snapshot).weights[0].kg).toBe(69);
  });
  it("saves a meal and compressed photo atomically, supports retry/edit/removal, excludes raw photos from responses", async () => {
    const id = randomUUID(),
      op = randomUUID(),
      command = { action: "meal", id, revision: null, meal: meal(), photo };
    await saveWellness(command, op, demo);
    await saveWellness(command, op, demo);
    let saved = await getWellness(new DemoRepository());
    expect(saved.meals).toHaveLength(1);
    expect(saved.meals[0].hasPhoto).toBe(true);
    expect(JSON.stringify(saved)).not.toContain(jpeg.toString("base64"));
    expect(await readMealPhoto(id, new DemoRepository())).toEqual(jpeg);
    await saveWellness(
      {
        action: "meal",
        id,
        revision: saved.meals[0].revision,
        meal: { ...meal(), title: "Updated lunch" },
      },
      randomUUID(),
      demo,
    );
    saved = await getWellness(demo);
    expect(saved.meals[0].hasPhoto).toBe(true);
    await saveWellness(
      { action: "delete-meal", id, revision: saved.meals[0].revision },
      randomUUID(),
      demo,
    );
    await expect(readMealPhoto(id, demo)).rejects.toThrow("no saved photo");
    expect((await getWellness(demo)).meals).toHaveLength(0);
  });
  it("rejects oversized dimensions and non-JPEG content before storing anything", async () => {
    const wide = Buffer.from(jpeg);
    wide.writeUInt16BE(641, 9);
    expect(
      photoInput.safeParse(`data:image/jpeg;base64,${wide.toString("base64")}`)
        .success,
    ).toBe(false);
    expect(photoInput.safeParse("wrong-format").success).toBe(false);
    await expect(
      saveWellness(
        {
          action: "meal",
          id: randomUUID(),
          revision: null,
          meal: meal(),
          photo: "data:image/jpeg;base64,AAAA",
        },
        randomUUID(),
        demo,
      ),
    ).rejects.toThrow();
    expect(personalData((await demo.read()).snapshot).meals).toHaveLength(0);
  });
});
describe("cost guard and AI boundary", () => {
  it("protects profile, meal, photo and AI routes before reading private data or calling providers", async () => {
    vi.stubEnv("APP_PASSWORD", "test-private-password-long");
    vi.stubEnv("SESSION_SECRET", "test-session-secret-long-enough-123456789");
    for (const [handler, method, url] of [
      [wellnessGet, "GET", "/api/wellness"],
      [wellnessPost, "POST", "/api/wellness"],
      [aiPost, "POST", "/api/wellness/ai"],
      [photoGet, "GET", `/api/wellness/photo/${randomUUID()}`],
    ] as const) {
      const response = await handler(
        new NextRequest(`http://localhost:3107${url}`, { method }),
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Sign in to continue." });
    }
  });
  it("does not call a paid model in demo, missing-key or read-only mode", async () => {
    const send = provider(review);
    await expect(
      generateWellness(
        { kind: "review", consent: true },
        randomUUID(),
        demo,
        send,
      ),
    ).rejects.toThrow("Demo mode");
    const repo = await liveMemory();
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(
      generateWellness(
        { kind: "review", consent: true },
        randomUUID(),
        repo,
        send,
      ),
    ).rejects.toThrow("not connected");
    vi.stubEnv("OPENAI_API_KEY", "test");
    vi.stubEnv("GOOGLE_SHEETS_WRITES_ENABLED", "false");
    await expect(
      generateWellness(
        { kind: "review", consent: true },
        randomUUID(),
        repo,
        send,
      ),
    ).rejects.toThrow("writable");
    expect(send).not.toHaveBeenCalled();
  });
  it("settles verified usage, caches unchanged reviews and never bills the same operation twice", async () => {
    const repo = await liveMemory(),
      send = provider(review),
      op = randomUUID();
    await generateWellness({ kind: "review", consent: true }, op, repo, send);
    await generateWellness({ kind: "review", consent: true }, op, repo, send);
    await generateWellness(
      { kind: "review", consent: true },
      randomUUID(),
      repo,
      send,
    );
    expect(send).toHaveBeenCalledTimes(1);
    const view = await getWellness(repo);
    expect(view.budget.usedIdr).toBe(costIdr(1000, 300));
    expect(view.budget.reservedIdr).toBe(0);
    expect(view.review?.summary).toBe(review.summary);
    const body = JSON.parse(send.mock.calls[0][1]!.body as string);
    expect(body.store).toBe(false);
    expect(body.tools).toBeUndefined();
    expect(body.model).toBe("gpt-6-luna");
    expect(body.text.format.strict).toBe(true);
    expect(body.max_output_tokens).toBe(2048);
  });
  it("persists reservation before contacting provider and rejects concurrent overspend", async () => {
    const repo = await liveMemory();
    await repo.commit(
      [
        change(repo.snapshot, `budget:${monthKey()}`, {
          usedIdr: 20000 - RESERVE_IDR,
        }),
      ],
      randomUUID(),
    );
    let release!: (response: Response) => void;
    const send = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = generateWellness(
      { kind: "review", consent: true },
      randomUUID(),
      repo,
      send,
    );
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(budgetView(repo.snapshot).usedIdr).toBe(20000);
    await expect(
      generateWellness(
        { kind: "review", consent: true },
        randomUUID(),
        repo,
        send,
      ),
    ).rejects.toThrow("monthly budget");
    release(await provider(review)("https://example.invalid"));
    await pending;
    expect(send).toHaveBeenCalledTimes(1);
    expect(budgetView(repo.snapshot).usedIdr).toBeLessThan(20000);
  });
  it("retains full allowance after timeout and refuses duplicate uncertain requests", async () => {
    const repo = await liveMemory(),
      op = randomUUID(),
      send = vi.fn<typeof fetch>().mockRejectedValue(new Error("timeout"));
    await expect(
      generateWellness({ kind: "review", consent: true }, op, repo, send),
    ).rejects.toThrow("No automatic retry");
    expect(budgetView(repo.snapshot).usedIdr).toBe(RESERVE_IDR);
    expect(budgetView(repo.snapshot).reservedIdr).toBe(RESERVE_IDR);
    await expect(
      generateWellness({ kind: "review", consent: true }, op, repo, send),
    ).rejects.toThrow("already submitted");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("uses Jakarta month boundaries and settles old requests against their original month", async () => {
    const repo = await liveMemory(),
      op = randomUUID();
    const before = new Date("2026-10-31T16:59:00Z"),
      after = new Date("2026-10-31T17:01:00Z");
    await repo.commit(
      reservationChanges(repo.snapshot, op, "hash", "review", before),
      randomUUID(),
    );
    expect(budgetView(repo.snapshot, before).usedIdr).toBe(RESERVE_IDR);
    expect(budgetView(repo.snapshot, after).usedIdr).toBe(0);
    expect(budgetView(repo.snapshot, before).resetsOn).toBe("2026-11-01");
    await repo.commit(
      settlementChanges(repo.snapshot, op, 1000, 300, review),
      randomUUID(),
    );
    expect(budgetView(repo.snapshot, before).usedIdr).toBe(costIdr(1000, 300));
    expect(budgetView(repo.snapshot, after).usedIdr).toBe(0);
  });
  it("fails closed on damaged spending records", async () => {
    const repo = await liveMemory(),
      send = provider(review);
    await repo.commit(
      [change(repo.snapshot, `budget:${monthKey()}`, { usedIdr: "broken" })],
      randomUUID(),
    );
    await expect(
      generateWellness(
        { kind: "review", consent: true },
        randomUUID(),
        repo,
        send,
      ),
    ).rejects.toThrow("need review");
    expect(send).not.toHaveBeenCalled();
  });
  it("pauses on above-bound usage or an unexpected model without releasing the allowance", async () => {
    for (const response of [
      provider(review, {
        input_tokens: MAX_INPUT_TOKENS + 1,
        output_tokens: 300,
      }),
      provider(review, undefined, { model: "unexpected-expensive-model" }),
    ]) {
      const repo = await liveMemory();
      await expect(
        generateWellness(
          { kind: "review", consent: true },
          randomUUID(),
          repo,
          response,
        ),
      ).rejects.toThrow();
      expect(budgetView(repo.snapshot).usedIdr).toBe(RESERVE_IDR);
      expect(budgetView(repo.snapshot).blocked).toBe(true);
    }
  });
  it("calculates matched food from references, returns an unsaved draft, and validates ranges", async () => {
    const repo = await liveMemory();
    const send = provider({
      items: [
        {
          name: "Rice",
          grams: 200,
          referenceId: "rice",
          kcalLow: 1,
          kcalHigh: 2,
          protein: 1,
          carbs: 1,
          fat: 1,
        },
      ],
      uncertainty: "Oil and portion uncertain.",
    });
    const response = await generateWellness(
      { kind: "food", photo, notes: "Plain rice", consent: true },
      randomUUID(),
      repo,
      send,
    );
    expect(response.result).toMatchObject({
      items: [referenceItem("rice", 200)!],
    });
    expect(personalData(repo.snapshot).meals).toHaveLength(0);
    const bad = provider({
      items: [
        {
          name: "Unknown",
          grams: 200,
          referenceId: null,
          kcalLow: 900,
          kcalHigh: 200,
          protein: 1,
          carbs: 1,
          fat: 1,
        },
      ],
      uncertainty: "Unknown",
    });
    await expect(
      generateWellness(
        { kind: "food", photo, notes: "", consent: true },
        randomUUID(),
        repo,
        bad,
      ),
    ).rejects.toThrow("usable result");
    expect(record(repo.snapshot, "review")).toBeUndefined();
  });
});
describe("explainable calculations", () => {
  it("keeps future and duplicate activities out of actuals, separates sports and leaves missing RPE unknown", () => {
    const data = demoData("2026-10-28"),
      template = data.activities[0];
    data.activities = [
      {
        ...template,
        id: "run",
        date: "2026-10-28",
        type: "running",
        distanceKm: 5,
        durationSec: 1800,
      },
      {
        ...template,
        id: "run",
        date: "2026-10-28",
        type: "running",
        distanceKm: 5,
        durationSec: 1800,
      },
      {
        ...template,
        id: "ride",
        date: "2026-10-27",
        type: "cycling",
        distanceKm: 20,
        durationSec: 3600,
      },
      {
        ...template,
        id: "future",
        date: "2026-10-29",
        type: "running",
        distanceKm: 99,
      },
    ];
    data.feedback = [];
    data.links = [];
    data.workouts = [];
    const outlook = trainingOutlook(data, "2026-10-28");
    expect(outlook.sessions).toBe(2);
    expect(outlook.minutes).toBe(90);
    expect(outlook.load).toBeNull();
    expect(outlook.loadCoverage).toBe(0);
    expect(outlook.forecasts.map((f) => f.recordedKm)).toEqual([5, 20]);
    expect(outlook.fatigue).toBeNull();
  });
  it("calculates age at the birthday and sums logged nutrition ranges", () => {
    expect(ageOn("1996-10-29", "2026-10-28")).toBe(29);
    expect(ageOn("1996-10-29", "2026-10-29")).toBe(30);
    const totals = mealTotals([
      referenceItem("rice", 200)!,
      referenceItem("egg", 50)!,
    ]);
    expect(totals.low).toBe(270);
    expect(totals.high).toBe(405);
    expect(totals.carbs).toBeCloseTo(57);
  });
});
