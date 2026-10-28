import {
  activityIdsForLink,
  sport,
  type Activity,
  type AppData,
  type Workout,
  type ActivityLink,
} from "./domain";

export function feedbackForActivity(
  data: Pick<AppData, "feedback" | "links" | "workouts">,
  id: string,
) {
  const direct = data.feedback.find(
    (f) => f.scope === "activity" && f.activityId === id,
  );
  if (direct) return direct;
  const link = data.links.find((l) => activityIdsForLink(l).includes(id));
  if (!link)
    return data.feedback.find((f) => !f.workoutId && f.activityId === id);
  return data.feedback.find(
    (f) => f.scope !== "activity" && f.workoutId === link.workoutId,
  );
}

export function trainingLoads(
  data: Pick<AppData, "activities" | "feedback" | "links" | "workouts">,
) {
  return data.activities.flatMap((a) => {
    const feedback = a.sourceWorkoutId
      ? data.feedback.find(
          (f) => f.workoutId === a.sourceWorkoutId && f.scope !== "activity",
        )
      : feedbackForActivity(data, a.id);
    return feedback?.rpe != null && a.durationSec != null
      ? [{ id: a.id, type: a.type, load: (feedback.rpe * a.durationSec) / 60 }]
      : [];
  });
}

export function manualActivities(
  workouts: Workout[],
  activities: Activity[],
  links: ActivityLink[],
): Activity[] {
  return workouts.flatMap((w) => {
    const r = w.recordedResult;
    if (
      !r ||
      !["Completed", "Partially Completed"].includes(w.status) ||
      ![r.distanceKm, r.durationMin].some((v) => v != null && v > 0) ||
      links.some((l) => l.workoutId === w.id)
    )
      return [];
    // An unlinked recorded effort matching the source results is already counted.
    if (
      activities.some(
        (a) =>
          a.date === w.date &&
          a.type === sport(w.type) &&
          ((r.distanceKm != null &&
            a.distanceKm != null &&
            Math.abs(r.distanceKm - a.distanceKm) < 0.05) ||
            (r.durationMin != null &&
              a.durationSec != null &&
              Math.abs(r.durationMin - a.durationSec / 60) < 1)),
      )
    )
      return [];
    return [
      {
        id: `sheet-${w.id}`,
        title: w.title,
        date: w.date,
        // Internal day ordering only; never present this as a recorded start time.
        startedAt: `${w.date}T00:00:00+07:00`,
        timeKnown: false,
        type: sport(w.type),
        rawType: "manual result",
        distanceKm: r.distanceKm,
        durationSec: r.durationMin == null ? null : r.durationMin * 60,
        movingSec: null,
        avgHr: r.avgHr,
        maxHr: r.maxHr,
        elevationM: null,
        paceSecKm:
          r.distanceKm && r.durationMin != null
            ? (r.durationMin * 60) / r.distanceKm
            : null,
        splits: [],
        hrZones: [],
        source: "sheet",
        sourceWorkoutId: w.id,
      },
    ];
  });
}
