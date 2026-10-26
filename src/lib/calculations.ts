import { Activity, AppData, Workout, sport } from "./domain";
import { addDays, weekStart } from "./dates";

export function summarize(
  data: Pick<AppData, "activities" | "workouts">,
  start: string,
  end: string,
) {
  const acts = data.activities.filter((a) => a.date >= start && a.date <= end);
  const plans = data.workouts.filter(
    (w) =>
      w.date >= start &&
      w.date <= end &&
      w.status !== "Rescheduled" &&
      w.type !== "Rest Day",
  );
  const required = plans.filter((w) => !w.optional);
  const completed = plans.filter((w) => w.status === "Completed").length;
  const runs = acts.filter((a) => a.type === "running");
  const bikes = acts.filter((a) => a.type === "cycling");
  const sum = (list: Activity[], key: "distanceKm" | "durationSec") =>
    list.reduce((s, a) => s + (a[key] ?? 0), 0);
  const timedRuns = runs.filter(
    (a) => a.distanceKm != null && a.distanceKm > 0 && a.durationSec != null,
  );
  const hr = acts.filter(
    (a) => a.avgHr != null && a.durationSec != null && a.durationSec > 0,
  );
  const hrDuration = sum(hr, "durationSec");
  const distance = sum(timedRuns, "distanceKm");
  return {
    runningKm: sum(runs, "distanceKm"),
    cyclingKm: sum(bikes, "distanceKm"),
    completed,
    planned: plans.length,
    consistency: required.length
      ? Math.round(
          (required.filter((w) => w.status === "Completed").length /
            required.length) *
            100,
        )
      : null,
    pace: distance > 0 ? sum(timedRuns, "durationSec") / distance : null,
    avgHr: hrDuration
      ? Math.round(
          hr.reduce((s, a) => s + a.avgHr! * a.durationSec!, 0) / hrDuration,
        )
      : null,
    maxHr: acts.some((a) => a.maxHr != null)
      ? Math.max(...acts.flatMap((a) => (a.maxHr == null ? [] : [a.maxHr])))
      : null,
    longestRun: runs.length
      ? Math.max(...runs.map((a) => a.distanceKm ?? 0))
      : 0,
    totalMin: sum(acts, "durationSec") / 60,
    cyclingMin: sum(bikes, "durationSec") / 60,
    plannedKm: plans.reduce((s, w) => s + (w.distanceKm ?? 0), 0),
    plannedRunKm: plans
      .filter((w) => sport(w.type) === "running")
      .reduce((s, w) => s + (w.distanceKm ?? 0), 0),
    actualKm: sum(acts, "distanceKm"),
    count: acts.length,
  };
}
export function weeklySeries(
  data: Pick<AppData, "activities" | "workouts">,
  end: string,
  weeks = 8,
) {
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(weekStart(end), -(weeks - 1 - i) * 7);
    return { date: start, ...summarize(data, start, addDays(start, 6)) };
  });
}
// Only an unambiguous one-to-one match with a measured target can complete a plan.
export function findMatches(workouts: Workout[], activities: Activity[]) {
  const candidates = new Map<string, string[]>();
  for (const w of workouts.filter(
    (w) => w.status === "Planned" && !w.linkedActivityId,
  )) {
    const ids = activities
      .filter((a) => {
        if (a.date !== w.date || a.type !== sport(w.type) || a.type === "other")
          return false;
        if (
          w.time &&
          Math.abs(
            new Date(a.startedAt).getTime() -
              new Date(`${w.date}T${w.time}:00+07:00`).getTime(),
          ) >
            90 * 60000
        )
          return false;
        if (w.distanceKm && a.distanceKm)
          return Math.abs(a.distanceKm - w.distanceKm) / w.distanceKm <= 0.25;
        if (w.durationMin && a.durationSec)
          return (
            Math.abs(a.durationSec / 60 - w.durationMin) / w.durationMin <= 0.25
          );
        return false;
      })
      .map((a) => a.id);
    candidates.set(w.id, ids);
  }
  return [...candidates].flatMap(([workoutId, ids]) =>
    ids.length === 1 &&
    [...candidates.values()].filter((x) => x.includes(ids[0])).length === 1
      ? [{ workoutId, activityId: ids[0] }]
      : [],
  );
}
