import { Activity, AppData, Goal, Workout, WorkoutInput } from "./domain";
import { addDays, localDate, weekStart } from "./dates";
export function demoData(today = localDate()): AppData {
  const monday = weekStart(today);
  const workouts: Workout[] = [];
  const activities: Activity[] = [];
  const schedule: [number, WorkoutInput["type"], number | null, number][] = [
    [0, "Easy Run", 5, 38],
    [1, "Bike-to-Work", 12.4, 42],
    [2, "Interval Run", 6, 42],
    [3, "Bike-to-Work", 12.4, 42],
    [4, "Long Run", 10, 76],
    [5, "Rest Day", null, 0],
    [6, "Rest Day", null, 0],
  ];
  for (let week = -7; week <= 1; week++) {
    schedule.forEach(([day, type, km, min]) => {
      const date = addDays(monday, week * 7 + day);
      const past = date < today;
      const skipped = past && day === 3;
      const distanceKm =
        km == null
          ? null
          : type === "Long Run"
            ? Math.max(6, 10 + week * 0.5)
            : km;
      const id = `demo-w-${week + 7}-${day}`;
      workouts.push({
        id,
        revision: "seed",
        createdAt: `${date}T00:00:00Z`,
        date,
        time: "06:00",
        type,
        title:
          type === "Long Run"
            ? "Go a little further"
            : type === "Easy Run"
              ? "Easy miles, clear mind"
              : type === "Interval Run"
                ? "Find your rhythm"
                : type === "Bike-to-Work"
                  ? "The morning commute"
                  : "Rest & recharge",
        description:
          type === "Long Run"
            ? "Comfortable, conversational effort. Take a walk break whenever you need it."
            : "Stay comfortable and listen to how you feel.",
        distanceKm,
        durationMin: min || null,
        targetPace: "",
        hrZone: type.includes("Run") ? 2 : null,
        rpe: null,
        optional: day === 3,
        status:
          past && type !== "Rest Day"
            ? skipped
              ? "Skipped"
              : "Completed"
            : "Planned",
        notes: "",
        completionSource:
          past && !skipped && type !== "Rest Day" ? "garmin" : undefined,
      });
      if (past && !skipped && type !== "Rest Day") {
        const dist = (distanceKm ?? 0) + (week % 3) * 0.12;
        const sec =
          type === "Long Run"
            ? dist * (440 - week * 2)
            : type.includes("Run")
              ? dist * (425 - week * 3)
              : min * 60;
        const aid = `demo-a-${week + 7}-${day}`;
        workouts[workouts.length - 1].linkedActivityId = aid;
        activities.push({
          id: aid,
          title:
            type === "Bike-to-Work"
              ? "Morning ride to work"
              : type === "Long Run"
                ? "Friday long run"
                : type === "Interval Run"
                  ? "Midweek intervals"
                  : "Morning easy run",
          date,
          startedAt: `${date}T06:02:00+07:00`,
          type: type.includes("Run") ? "running" : "cycling",
          rawType: type.includes("Run") ? "running" : "cycling",
          distanceKm: dist,
          durationSec: Math.round(sec),
          movingSec: Math.round(sec - 40),
          avgHr: type === "Bike-to-Work" ? 126 : 142 + (week % 4),
          maxHr: 165,
          elevationM: 24 + day * 3,
          paceSecKm: type.includes("Run") ? sec / dist : null,
          splits: type.includes("Run")
            ? Array.from({ length: Math.floor(dist) }, (_, i) => ({
                index: i + 1,
                distanceKm: 1,
                durationSec: Math.round(sec / dist + i * 2),
                avgHr: 140 + i,
              }))
            : [],
          hrZones: [],
          source: "demo",
        });
      }
    });
  }
  const goal: Goal = {
    id: "half-marathon",
    revision: "seed",
    title: "My first half marathon",
    distanceKm: 21.1,
    targetMonth: "2027-01",
    date: null,
    targetTimeMin: null,
  };
  return {
    mode: "demo",
    workouts,
    activities,
    feedback: [],
    goals: [goal],
    links: workouts
      .filter((w) => w.linkedActivityId)
      .map((w) => ({
        id: w.id,
        revision: "seed",
        workoutId: w.id,
        activityId: w.linkedActivityId!,
      })),
    sync: { lastSuccess: null, count: 0, error: null },
    configured: { garmin: false, sheets: false, initialized: true },
  };
}
