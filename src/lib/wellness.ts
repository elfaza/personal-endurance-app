import { z } from "zod";
import { localDate, addDays, weekStart } from "./dates";
import type { AppData } from "./domain";
import { trainingLoads } from "./measurements";

const pastDate = z.iso
  .date()
  .refine((v) => v <= localDate(), "Choose today or an earlier date.");
export const profileInput = z.object({
  birthDate: pastDate.nullable(),
  heightCm: z.number().min(50).max(250).nullable(),
  goal: z.string().trim().max(500),
  experience: z.enum(["new", "regular", "experienced"]),
});
export type Profile = z.infer<typeof profileInput> & { revision: string };
export const weightInput = z.object({
  date: pastDate,
  kg: z.number().min(20).max(400),
});
export type Weight = z.infer<typeof weightInput> & { revision: string };
export const foodItemInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    grams: z.number().positive().max(5000),
    kcalLow: z.number().min(0).max(20000),
    kcalHigh: z.number().min(0).max(20000),
    protein: z.number().min(0).max(1000),
    carbs: z.number().min(0).max(1000),
    fat: z.number().min(0).max(1000),
    basis: z.enum(["manual", "reference", "ai-estimate"]),
  })
  .refine(
    (v) => v.kcalLow <= v.kcalHigh,
    "The upper calorie estimate must be at least the lower estimate.",
  );
export type FoodItem = z.infer<typeof foodItemInput>;
export const mealInput = z.object({
  date: pastDate,
  title: z.string().trim().min(1).max(120),
  kind: z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]),
  items: z.array(foodItemInput).min(1).max(12),
  notes: z.string().max(1000),
});
export type MealInput = z.infer<typeof mealInput>;
export type Meal = MealInput & {
  id: string;
  revision: string;
  hasPhoto: boolean;
  updatedAt: string;
};
export const reviewInput = z.object({
  summary: z.string().min(1).max(1800),
  insights: z
    .array(
      z.object({
        observation: z.string().max(600),
        evidence: z.string().max(600),
      }),
    )
    .max(4),
  limitations: z.array(z.string().max(500)).max(5),
});
export type Review = z.infer<typeof reviewInput> & {
  generatedAt: string;
  inputHash: string;
  model: string;
};
export type Budget = {
  month: string;
  usedIdr: number;
  reservedIdr: number;
  limitIdr: number;
  remainingIdr: number;
  warning: boolean;
  blocked: boolean;
  resetsOn: string;
  reservePerCall: number;
  exchangeRate: number;
};
export type WellnessData = {
  profile: Profile | null;
  weights: Weight[];
  meals: Meal[];
  review: Review | null;
  budget: Budget;
  aiAvailable: boolean;
  aiReason: string | null;
  inputHash: string;
  outlook: ReturnType<typeof trainingOutlook>;
};
export const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
export function ageOn(birthDate: string, date = localDate()) {
  const years = Number(date.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return years - (date.slice(5) < birthDate.slice(5) ? 1 : 0);
}
export function mealTotals(items: FoodItem[]) {
  return items.reduce(
    (s, i) => ({
      low: s.low + i.kcalLow,
      high: s.high + i.kcalHigh,
      protein: s.protein + i.protein,
      carbs: s.carbs + i.carbs,
      fat: s.fat + i.fat,
    }),
    { low: 0, high: 0, protein: 0, carbs: 0, fat: 0 },
  );
}
export function trainingOutlook(data: AppData, today = localDate()) {
  const start = addDays(today, -6),
    previousStart = addDays(today, -13),
    previousEnd = addDays(today, -7);
  const actuals = [
    ...new Map(
      data.activities.filter((a) => a.date <= today).map((a) => [a.id, a]),
    ).values(),
  ];
  const current = actuals.filter((a) => a.date >= start);
  const previous = actuals.filter(
    (a) => a.date >= previousStart && a.date <= previousEnd,
  );
  const eligible = data.workouts.filter(
    (w) =>
      w.date >= start &&
      w.date <= today &&
      !w.optional &&
      !["Rest Day"].includes(w.type) &&
      w.status !== "Rescheduled",
  );
  const completed = eligible.filter((w) => w.status === "Completed").length;
  const loads = trainingLoads({ ...data, activities: current });
  const recentFeedback = data.feedback.filter(
    (f) => f.date >= start && f.date <= today,
  );
  const avg = (field: "fatigue" | "soreness" | "sleepQuality") => {
    const values = recentFeedback.flatMap((f) =>
      f[field] == null ? [] : [f[field]!],
    );
    return values.length
      ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) /
          10
      : null;
  };
  const month = today.slice(0, 7);
  const monthEnd = new Date(
    Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0),
  )
    .toISOString()
    .slice(0, 10);
  const forecasts = (["running", "cycling"] as const).map((sport) => {
    const recorded = actuals.filter(
      (a) => a.type === sport && a.date.startsWith(month),
    );
    const known = recorded.filter((a) => a.distanceKm != null);
    const km = known.reduce((s, a) => s + a.distanceKm!, 0);
    const remaining = data.workouts.filter(
      (w) =>
        w.date > today &&
        w.date <= monthEnd &&
        ["Planned", "Partially Completed"].includes(w.status) &&
        (sport === "running" ? /Run/.test(w.type) : /Cycl|Bike/.test(w.type)),
    );
    const plannedKm = remaining.reduce((s, w) => s + (w.distanceKm ?? 0), 0);
    return {
      sport,
      recordedKm: km,
      plannedKm,
      ifPlanCompletedKm: km + plannedKm,
      missingActualDistance: recorded.length - known.length,
      missingTargets: remaining.filter((w) => w.distanceKm == null).length,
      remainingSessions: remaining.length,
    };
  });
  const minutes = (items: typeof actuals) =>
    items.reduce((s, a) => s + (a.durationSec ?? 0) / 60, 0);
  const recent28 = actuals.filter((a) => a.date >= addDays(today, -27));
  const weeks = Array.from({ length: 4 }, (_, i) => {
    const monday = addDays(weekStart(today), -7 * i);
    return {
      start: monday,
      sessions: recent28.filter(
        (a) => a.date >= monday && a.date <= addDays(monday, 6),
      ).length,
    };
  }).reverse();
  const goals = data.goals.map((g) => {
    const runs = recent28.filter(
      (a) => a.type === "running" && a.distanceKm != null,
    );
    return {
      title: g.title,
      distanceKm: g.distanceKm,
      targetMonth: g.targetMonth,
      date: g.date,
      longestRecentRunKm: runs.length
        ? Math.max(...runs.map((a) => a.distanceKm!))
        : null,
    };
  });
  return {
    today,
    start,
    previousStart,
    previousEnd,
    sessions: current.length,
    previousSessions: previous.length,
    minutes: minutes(current),
    previousMinutes: minutes(previous),
    missingDuration: current.filter((a) => a.durationSec == null).length,
    completed,
    required: eligible.length,
    load: loads.length ? loads.reduce((s, l) => s + l.load, 0) : null,
    loadCoverage: loads.length,
    fatigue: avg("fatigue"),
    soreness: avg("soreness"),
    sleepQuality: avg("sleepQuality"),
    weeks,
    forecasts,
    goals,
  };
}
