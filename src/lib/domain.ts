import { z } from "zod";

export const workoutTypes = [
  "Easy Run",
  "Recovery Run",
  "Interval Run",
  "Tempo Run",
  "Long Run",
  "Cycling",
  "Bike-to-Work",
  "Strength Training",
  "Cross Training",
  "Rest Day",
  "Custom Workout",
] as const;
export const statuses = [
  "Planned",
  "Completed",
  "Partially Completed",
  "Skipped",
  "Rescheduled",
] as const;
export const dateSchema = z.iso.date();
export const workoutInput = z.object({
  date: dateSchema,
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional()
    .or(z.literal("")),
  type: z.enum(workoutTypes),
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000).default(""),
  goal: z.string().max(2000).optional(),
  durationText: z.string().max(300).optional(),
  distanceKm: z.number().min(0).max(1000).nullable().default(null),
  durationMin: z.number().min(0).max(1440).nullable().default(null),
  targetPace: z.string().max(30).default(""),
  hrZone: z.number().int().min(1).max(5).nullable().default(null),
  rpe: z.number().int().min(1).max(10).nullable().default(null),
  status: z.enum(statuses).default("Planned"),
  optional: z.boolean().default(false),
  commuteLegs: z.union([z.literal(1), z.literal(2)]).optional(),
  activityCount: z.union([z.literal(1), z.literal(2)]).optional(),
  allowMixedSports: z.boolean().optional(),
  commuteReturnTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional()
    .or(z.literal("")),
  notes: z.string().max(4000).default(""),
});
export type WorkoutInput = z.infer<typeof workoutInput>;
export type Workout = WorkoutInput & {
  id: string;
  revision: string;
  createdAt: string;
  rescheduledFrom?: string;
  rescheduledTo?: string;
  linkedActivityId?: string;
  linkedActivityIds?: string[];
  completionSource?: "manual" | "garmin";
};
export const feedbackInput = z.object({
  workoutId: z.string().max(100).optional(),
  activityId: z.string().max(100).optional(),
  date: dateSchema,
  rpe: z.number().int().min(1).max(10).nullable(),
  energy: z.number().int().min(1).max(5).nullable(),
  fatigue: z.number().int().min(1).max(5).nullable(),
  soreness: z.number().int().min(1).max(5).nullable(),
  sleepQuality: z.number().int().min(1).max(5).nullable(),
  notes: z.string().max(4000),
  skippedReason: z.string().max(1000).default(""),
});
export type Feedback = z.infer<typeof feedbackInput> & {
  id: string;
  revision: string;
};
export interface Activity {
  id: string;
  title: string;
  date: string;
  startedAt: string;
  type: "running" | "cycling" | "walking" | "other";
  rawType: string;
  distanceKm: number | null;
  durationSec: number | null;
  movingSec: number | null;
  avgHr: number | null;
  maxHr: number | null;
  elevationM: number | null;
  paceSecKm: number | null;
  splits: {
    index: number;
    distanceKm: number;
    durationSec: number;
    avgHr: number | null;
  }[];
  hrZones: { zone: number; seconds: number }[];
  source: "garmin" | "demo";
}
export const goalInput = z.object({
  title: z.string().trim().min(1).max(120),
  distanceKm: z.number().positive().max(1000),
  targetMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  date: dateSchema.nullable(),
  targetTimeMin: z.number().positive().nullable(),
});
export type Goal = z.infer<typeof goalInput> & { id: string; revision: string };
export interface ActivityLink {
  id: string;
  workoutId: string;
  activityId: string;
  activityIds?: string[];
  revision: string;
}
export function activityIdsForLink(
  link: Pick<ActivityLink, "activityId" | "activityIds">,
) {
  return link.activityIds ?? [link.activityId];
}
export function expectedActivityCount(
  w: Pick<Workout, "type" | "commuteLegs" | "activityCount">,
) {
  return w.type === "Bike-to-Work"
    ? (w.commuteLegs ?? 1)
    : (w.activityCount ?? 1);
}
export function activityFitsWorkout(
  w: Pick<Workout, "date" | "type" | "allowMixedSports">,
  a: Pick<Activity, "date" | "type">,
) {
  return (
    a.date === w.date &&
    (w.type === "Bike-to-Work"
      ? a.type === "cycling"
      : w.allowMixedSports ||
        sport(w.type) === "other" ||
        sport(w.type) === a.type)
  );
}
export interface SyncState {
  lastSuccess: string | null;
  count: number;
  error: string | null;
}
export interface AppData {
  mode: "demo" | "live";
  workouts: Workout[];
  activities: Activity[];
  feedback: Feedback[];
  goals: Goal[];
  links: ActivityLink[];
  sync: SyncState;
  configured: {
    garmin: boolean;
    sheets: boolean;
    initialized: boolean;
    readOnly?: boolean;
    planSource?: "training-plan" | "pe-workouts";
  };
}
export type Dataset =
  "Workouts" | "Feedback" | "Goals" | "ActivityLinks" | "Activities" | "Meta";
export const datasets: Dataset[] = [
  "Workouts",
  "Feedback",
  "Goals",
  "ActivityLinks",
  "Activities",
  "Meta",
];
export function sport(type: string): Activity["type"] {
  if (/Run/.test(type)) return "running";
  if (/Cycl|Bike/.test(type)) return "cycling";
  return "other";
}
