"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Bike, CircleHelp, Footprints, Heart, Timer } from "lucide-react";
import { useTraining } from "@/components/providers";
import { DateFilter, initialRange } from "@/components/date-filter";
import { GoalCard } from "@/components/goal-card";
import { addDays, duration, localDate, pace, weekStart } from "@/lib/dates";
import { summarize, weeklySeries } from "@/lib/calculations";
import { trainingLoads } from "@/lib/measurements";
import { activityIdsForLink } from "@/lib/domain";
const TrainingChart = dynamic(
  () =>
    import("@/components/charts/training-chart").then((m) => m.TrainingChart),
  { ssr: false, loading: () => <div className="training-chart skeleton" /> },
);
export function Analytics() {
  const { data } = useTraining();
  const [range, setRange] = useState(initialRange);
  if (!data) return null;
  const filtered = {
    ...data,
    activities: data.activities.filter(
      (a) => a.date >= range.start && a.date <= range.end,
    ),
    workouts: data.workouts.filter(
      (w) => w.date >= range.start && w.date <= range.end,
    ),
  };
  const m = summarize(data, range.start, range.end);
  const days = Math.max(
    1,
    Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86400000) +
      1,
  );
  const series =
    days <= 7
      ? Array.from({ length: 7 }, (_, i) => ({
          date: addDays(range.start, i),
          ...summarize(
            filtered,
            addDays(range.start, i),
            addDays(range.start, i),
          ),
        }))
      : weeklySeries(
          filtered,
          range.end,
          Math.min(54, Math.ceil(days / 7) + 1),
        );
  const loadSessions = trainingLoads({
    ...data,
    activities: filtered.activities,
  });
  const load = loadSessions.reduce((s, a) => s + a.load, 0);
  const month = localDate().slice(0, 7);
  const monthly = summarize(data, `${month}-01`, `${month}-31`);
  const commutes = data.links.filter(
    (l) =>
      filtered.activities.some((a) => activityIdsForLink(l).includes(a.id)) &&
      data.workouts.some(
        (w) => w.id === l.workoutId && w.type === "Bike-to-Work",
      ),
  ).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">UNDERSTAND YOUR OWN PROGRESS</div>
          <h1>
            The longer view<span className="accent">.</span>
          </h1>
          <p>
            Real efforts. Transparent numbers. Your progress, in perspective.
          </p>
        </div>
        <DateFilter value={range} onChange={setRange} />
      </div>
      <div className="metrics-grid">
        {[
          {
            label: "RUNNING",
            value: `${m.runningKm.toFixed(1)} km`,
            icon: <Footprints size={18} />,
            note: `${monthly.runningKm.toFixed(1)} km this calendar month`,
          },
          {
            label: "CYCLING",
            value: `${m.cyclingKm.toFixed(1)} km`,
            icon: <Bike size={18} />,
            note: `${monthly.cyclingKm.toFixed(1)} km this calendar month`,
          },
          {
            label: "TIME IN MOTION",
            value: duration(m.totalMin * 60),
            icon: <Timer size={18} />,
            note: `${duration(m.cyclingMin * 60)} on the bike · ${commutes} commutes`,
          },
          {
            label: "RUNNING PACE",
            value: pace(m.pace),
            icon: <Heart size={18} />,
            note: "Total timed running duration ÷ distance",
          },
        ].map((x) => (
          <div className="panel metric-card" key={x.label}>
            <div className="metric-label">
              <span>{x.label}</span>
              {x.icon}
            </div>
            <div className="metric-value compact-value">{x.value}</div>
            <div className="metric-note">{x.note}</div>
          </div>
        ))}
      </div>
      <div className="analytics-charts">
        {(
          [
            {
              metric: "distance",
              title: "Distance, week by week",
              text: "Running and cycling volume, alongside planned distance.",
            },
            {
              metric: "pace",
              title: "Finding your pace",
              text: "Distance-weighted running pace. Gaps mean no recorded runs.",
            },
            {
              metric: "volume",
              title: "Time invested",
              text: "Total recorded activity duration in minutes, including cycling.",
            },
            {
              metric: "consistency",
              title: "Showing up for yourself",
              text: "Completed required sessions ÷ scheduled required sessions × 100.",
            },
            {
              metric: "heart",
              title: "Heart rate over time",
              text: "Duration-weighted average of activities with heart rate data.",
            },
          ] as const
        ).map((c) => (
          <section className="panel padded" key={c.metric}>
            <h2>{c.title}</h2>
            <p className="helper">{c.text}</p>
            <TrainingChart series={series} metric={c.metric} />
          </section>
        ))}
        <section className="panel padded load-card">
          <span className="eyebrow">
            <CircleHelp size={14} /> A SIMPLE VIEW OF EFFORT
          </span>
          <h2>Session training load</h2>
          <div className="load-value">
            {loadSessions.length ? Math.round(load) : "—"}
            <span>arbitrary units</span>
          </div>
          <p>
            Session RPE × recorded duration in minutes, summed across sessions
            with both values.
          </p>
          <div className="load-formula">
            RPE <span>×</span> DURATION <span>=</span> SESSION LOAD
          </div>
          <p className="helper">
            {loadSessions.length} of {filtered.activities.length} recorded
            activities have enough data. Cycling contributes{" "}
            {Math.round(
              loadSessions
                .filter((a) => a.type === "cycling")
                .reduce((s, a) => s + a.load, 0),
            )}{" "}
            units. Missing RPE is excluded. A shared session RPE applies to each
            linked activity unless an activity has its own journal.
          </p>
          <p className="helper">
            This is your session-RPE estimate. It is not Garmin’s proprietary
            training load. No recovery or readiness score is inferred from
            missing health data.
          </p>
        </section>
      </div>
      <div className="goals-heading section-heading">
        <div>
          <h2>Your next starting lines</h2>
          <p>Distance milestones, with room for life.</p>
        </div>
      </div>
      <div className="goals-grid">
        {data.goals.map((g) => (
          <GoalCard key={g.id} goal={g} compact />
        ))}
        <GoalCard compact />
      </div>
      <p className="helper">
        Week starts Monday ({weekStart(localDate())}); dates use Asia/Jakarta.
        Targets are never increased automatically after missed sessions.
      </p>
    </>
  );
}
