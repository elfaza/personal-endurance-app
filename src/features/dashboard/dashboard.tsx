"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bike,
  CalendarDays,
  Check,
  Footprints,
  Heart,
  Plus,
  Timer,
  TrendingUp,
} from "lucide-react";
import { useTraining, useEditingDisabled } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { DateFilter, initialRange } from "@/components/date-filter";
import { GoalCard } from "@/components/goal-card";
import { WorkoutEditor } from "@/components/training/workout-editor";
import { SportIcon, WorkoutCard } from "@/components/training/workout-card";
import {
  addDays,
  dateLabel,
  duration,
  localDate,
  pace,
  weekStart,
} from "@/lib/dates";
import { summarize, weeklySeries } from "@/lib/calculations";
import type { Workout } from "@/lib/domain";
const TrainingChart = dynamic(
  () =>
    import("@/components/charts/training-chart").then((m) => m.TrainingChart),
  { ssr: false, loading: () => <div className="training-chart skeleton" /> },
);
export function Dashboard() {
  const { data } = useTraining();
  const editingDisabled = useEditingDisabled();
  const [range, setRange] = useState(initialRange);
  const [selected, setSelected] = useState<Workout>();
  const [editor, setEditor] = useState(false);
  const [chart, setChart] = useState<"distance" | "pace" | "heart">("distance");
  if (!data) return null;
  const today = localDate();
  const monday = weekStart(today);
  const metrics = summarize(data, range.start, range.end);
  const previousEnd = addDays(range.start, -1);
  const days =
    Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86400000) +
    1;
  const previous = summarize(data, addDays(range.start, -days), previousEnd);
  const filtered = {
    ...data,
    activities: data.activities.filter(
      (a) => a.date >= range.start && a.date <= range.end,
    ),
    workouts: data.workouts.filter(
      (w) => w.date >= range.start && w.date <= range.end,
    ),
  };
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
  const upcoming = data.workouts
    .filter(
      (w) => w.date >= today && w.status === "Planned" && w.type !== "Rest Day",
    )
    .toSorted((a, b) =>
      `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`),
    );
  const next = upcoming[0];
  const recent = data.activities
    .toSorted((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 3);
  const consistencyPlans = data.workouts.filter(
    (w) =>
      w.date >= monday &&
      w.date <= addDays(monday, 6) &&
      !w.optional &&
      w.type !== "Rest Day" &&
      w.status !== "Rescheduled",
  );
  function edit(w?: Workout) {
    setSelected(w);
    setEditor(true);
  }
  const change = (current: number, prior: number) =>
    prior > 0
      ? `${Math.round(((current - prior) / prior) * 100) > 0 ? "+" : ""}${Math.round(((current - prior) / prior) * 100)}% vs prior period`
      : "Your training, in motion";
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR PERSONAL TRAINING SPACE</div>
          <h1>
            Let’s keep moving<span className="accent">.</span>
          </h1>
          <p>A little consistency today. A stronger tomorrow.</p>
        </div>
        <Button onClick={() => edit()} disabled={editingDisabled}>
          <Plus size={17} />
          Plan a workout
        </Button>
      </div>
      <section className="dashboard-hero">
        <div className="hero-copy">
          <span className="hero-tag">
            <span /> THE JOURNEY TO 21.1
          </span>
          <h2>
            Built one day
            <br />
            at a time.
          </h2>
          <p>
            Every easy mile. Every ride to work.
            <br />
            They’re all part of your next starting line.
          </p>
          <Link href="/calendar">
            Make today count <ArrowUpRight size={17} />
          </Link>
          <div className="hero-mark">
            01 <span>CONSISTENCY OVER PERFECTION</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <svg viewBox="0 0 560 310" fill="none">
            {Array.from({ length: 11 }, (_, i) => (
              <path
                key={i}
                d={`M${-30 + i * 6} ${280 - i * 5} C ${100 + i * 9} ${305 - i * 17}, ${150 + i * 2} ${10 + i * 13}, ${300 + i * 6} ${54 + i * 8} S ${430 + i * 7} ${290 - i * 5}, ${600 + i * 4} ${20 + i * 6}`}
                stroke="currentColor"
                strokeWidth={i === 5 ? 2 : 1}
                opacity={i === 5 ? 0.9 : 0.2 + i * 0.025}
              />
            ))}
            <circle cx="282" cy="109" r="6" fill="currentColor" />
            <circle
              cx="282"
              cy="109"
              r="18"
              stroke="currentColor"
              strokeOpacity=".4"
            />
          </svg>
          <span>FIND YOUR OWN PACE</span>
        </div>
        <div className="today-card">
          <span className="eyebrow">
            <CalendarDays size={13} />
            {next?.date === today ? "ON YOUR PLAN TODAY" : "UP NEXT"}
          </span>
          {next ? (
            <>
              <div className="today-card-type">
                <SportIcon type={next.type} size={24} />
                <span>{next.type}</span>
              </div>
              <h3>
                {next.distanceKm ?? next.durationMin ?? "Open"}
                <span>
                  {next.distanceKm
                    ? "km"
                    : next.durationMin
                      ? "min"
                      : "session"}
                </span>
              </h3>
              <p>
                {dateLabel(next.date, {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                })}
                {next.time ? ` · ${next.time}` : ""}
              </p>
              <button onClick={() => edit(next)}>
                View session <ArrowRight size={16} />
              </button>
            </>
          ) : (
            <>
              <h3>
                Room to
                <br />
                recharge.
              </h3>
              <p>No upcoming session. Your next step is yours.</p>
              <button onClick={() => edit()}>
                Plan a session <Plus size={16} />
              </button>
            </>
          )}
        </div>
      </section>
      <div className="section-heading">
        <h2>Your training, at a glance</h2>
        <DateFilter value={range} onChange={setRange} />
      </div>
      <div className="metrics-grid">
        <Metric
          icon={<Footprints size={19} />}
          label="RUNNING DISTANCE"
          value={metrics.runningKm.toFixed(1)}
          unit="km"
          note={change(metrics.runningKm, previous.runningKm)}
          color="lime"
        />
        <Metric
          icon={<Bike size={19} />}
          label="CYCLING DISTANCE"
          value={metrics.cyclingKm.toFixed(1)}
          unit="km"
          note={change(metrics.cyclingKm, previous.cyclingKm)}
          color="purple"
        />
        <Metric
          icon={<Check size={19} />}
          label="WORKOUTS COMPLETED"
          value={String(metrics.completed).padStart(2, "0")}
          unit={`/ ${metrics.planned}`}
          note="Confirmed or linked to an activity"
          color="peach"
        />
        <Metric
          icon={<TrendingUp size={19} />}
          label="TRAINING CONSISTENCY"
          value={
            metrics.consistency == null ? "—" : String(metrics.consistency)
          }
          unit={metrics.consistency == null ? "" : "%"}
          note="Completed ÷ required scheduled sessions"
          color="blue"
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel volume-panel">
          <div className="section-title">
            <div>
              <span className="eyebrow">THE BIGGER PICTURE</span>
              <h2>Training rhythm</h2>
            </div>
            <div className="segmented small">
              {(
                [
                  ["distance", "Distance"],
                  ["pace", "Pace"],
                  ["heart", "Heart rate"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  className={chart === v ? "active" : ""}
                  onClick={() => setChart(v)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="chart-summary">
            <strong>
              {chart === "distance"
                ? (metrics.runningKm + metrics.cyclingKm).toFixed(1)
                : chart === "pace"
                  ? pace(metrics.pace)
                  : (metrics.avgHr ?? "—")}
              <span>
                {chart === "distance"
                  ? "km covered"
                  : chart === "pace"
                    ? "/km average"
                    : "bpm average"}
              </span>
            </strong>
            <span className="muted">
              {dateLabel(range.start)} — {dateLabel(range.end)}
            </span>
          </div>
          <TrainingChart series={series} metric={chart} />
          <div className="chart-legend">
            {chart === "distance" ? (
              <>
                <span>
                  <i className="dot lime" />
                  Running
                </span>
                <span>
                  <i className="dot purple" />
                  Cycling
                </span>
                <span>
                  <i className="dash" />
                  Planned total
                </span>
              </>
            ) : (
              <span>
                {chart === "pace"
                  ? "Total running duration ÷ total running distance"
                  : "Duration-weighted average recorded heart rate"}
              </span>
            )}
          </div>
        </section>
        <GoalCard goal={data.goals[0]} />
      </div>
      <div className="section-heading">
        <div>
          <h2>This week’s intention</h2>
          <p>
            {dateLabel(monday)} — {dateLabel(addDays(monday, 6))} ·{" "}
            {consistencyPlans.filter((w) => w.status === "Completed").length} of{" "}
            {consistencyPlans.length} required sessions completed
          </p>
        </div>
        <Link className="text-link" href="/calendar">
          Open calendar <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className="week-strip">
        {Array.from({ length: 7 }, (_, i) => {
          const date = addDays(monday, i);
          const workouts = data.workouts.filter(
            (w) => w.date === date && w.status !== "Rescheduled",
          );
          const rest =
            workouts.length > 0 && workouts.every((w) => w.type === "Rest Day");
          return (
            <button
              key={date}
              className={`week-day ${date === today ? "is-today" : ""}`}
              onClick={() =>
                edit(workouts.find((w) => w.type !== "Rest Day") ?? workouts[0])
              }
            >
              <span>
                {dateLabel(date, { weekday: "short" })}
                {date === today ? <i /> : null}
              </span>
              <strong>{date.slice(-2)}</strong>
              <div
                className={`day-mark ${rest ? "rest" : workouts.some((w) => w.status === "Completed") ? "done" : ""}`}
              >
                {workouts.some((w) => w.status === "Completed") ? (
                  <Check size={17} />
                ) : workouts[0] ? (
                  <SportIcon type={workouts[0].type} size={17} />
                ) : (
                  <Plus size={16} />
                )}
              </div>
              <small>
                {rest
                  ? "Rest day"
                  : workouts.length
                    ? workouts[0].type
                    : "Unplanned"}
                {workouts.length > 1 ? ` +${workouts.length - 1}` : ""}
              </small>
            </button>
          );
        })}
      </div>
      <div className="dashboard-grid bottom-grid">
        <section>
          <div className="section-heading">
            <h2>Coming up next</h2>
            <span className="muted">Make it your own</span>
          </div>
          <div className="upcoming-grid">
            {upcoming.slice(0, 2).map((w) => (
              <WorkoutCard key={w.id} workout={w} onClick={() => edit(w)} />
            ))}
            {!upcoming.length ? (
              <div className="empty-state">
                <CalendarDays size={28} />
                <h3>A fresh page in your training</h3>
                <p>Add a session or build your usual week in the calendar.</p>
                <Button variant="outline" onClick={() => edit()}>
                  Plan a workout
                </Button>
              </div>
            ) : null}
          </div>
        </section>
        <section>
          <div className="section-heading">
            <h2>Recent efforts</h2>
            <Link className="text-link" href="/activities">
              View all <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="panel recent-list">
            {recent.length ? (
              recent.map((a) => (
                <Link key={a.id} href={`/activities/${a.id}`}>
                  <span
                    className={`sport-icon ${a.type === "cycling" ? "purple" : "lime"}`}
                  >
                    <SportIcon type={a.type} />
                  </span>
                  <div>
                    <strong>{a.title}</strong>
                    <span>
                      {dateLabel(a.date)} · {duration(a.durationSec)}
                    </span>
                  </div>
                  <div className="recent-distance">
                    <strong>
                      {a.distanceKm?.toFixed(1) ?? "—"}
                      <small> km</small>
                    </strong>
                    <ArrowUpRight size={15} />
                  </div>
                </Link>
              ))
            ) : (
              <div className="empty-state">
                <Footprints size={26} />
                <p>Your synced activities will appear here.</p>
              </div>
            )}
          </div>
        </section>
      </div>
      <div className="mini-metrics">
        <span>
          <Timer size={16} />
          {pace(metrics.pace)} <small>/km average running pace</small>
        </span>
        <span>
          <Heart size={16} />
          {metrics.avgHr ?? "—"}{" "}
          <small>bpm average · {metrics.maxHr ?? "—"} max</small>
        </span>
        <span>
          <ArrowDownRight size={16} />
          {metrics.longestRun.toFixed(1)}{" "}
          <small>km longest run in this period</small>
        </span>
      </div>
      <WorkoutEditor
        open={editor}
        onClose={() => setEditor(false)}
        workout={selected}
      />
    </>
  );
}
function Metric({
  icon,
  label,
  value,
  unit,
  note,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  note: string;
  color: string;
}) {
  return (
    <section className="panel metric-card">
      <div className="metric-label">
        <span>{label}</span>
        <span className={`metric-icon ${color}`}>{icon}</span>
      </div>
      <div className="metric-value">
        {value}
        <span>{unit}</span>
      </div>
      <div className="metric-note">{note}</div>
    </section>
  );
}
