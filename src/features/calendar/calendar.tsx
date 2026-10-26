"use client";
import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  Plus,
} from "lucide-react";
import type { Workout } from "@/lib/domain";
import { addDays, dateLabel, localDate, weekStart } from "@/lib/dates";
import { useTraining, useEditingDisabled } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { WorkoutEditor } from "@/components/training/workout-editor";
import { WorkoutCard } from "@/components/training/workout-card";
export function TrainingCalendar() {
  const { data, save, notify } = useTraining();
  const editingDisabled = useEditingDisabled();
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(localDate);
  const [showHistory, setShowHistory] = useState(false);
  const [selected, setSelected] = useState<Workout>();
  const [date, setDate] = useState("");
  const [editor, setEditor] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const start =
    view === "week" ? weekStart(anchor) : weekStart(`${anchor.slice(0, 7)}-01`);
  const dates = Array.from({ length: view === "week" ? 7 : 42 }, (_, i) =>
    addDays(start, i),
  );
  function move(direction: number) {
    if (view === "week") setAnchor(addDays(anchor, direction * 7));
    else {
      const d = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + direction);
      setAnchor(d.toISOString().slice(0, 10));
    }
  }
  function edit(w?: Workout, date?: string) {
    setSelected(w);
    setDate(date ?? w?.date ?? anchor);
    setEditor(true);
  }
  async function template() {
    setBusy(true);
    try {
      await save({ action: "week-template", start: weekStart(anchor) });
      notify(
        "Your usual week is ready. Existing training days were preserved; targets are yours to set.",
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE SPACE FOR PROGRESS</div>
          <h1>
            Your training calendar<span className="accent">.</span>
          </h1>
          <p>
            A flexible plan for real life. Move sessions, take a rest, keep
            going.
          </p>
        </div>
        <Button
          disabled={editingDisabled}
          onClick={() => edit(undefined, localDate())}
        >
          <Plus size={17} />
          Plan a workout
        </Button>
      </div>
      <div className="calendar-toolbar">
        <div className="calendar-date-nav">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous period"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next period"
            onClick={() => move(1)}
          >
            <ChevronRight size={18} />
          </Button>
          <h2>
            {view === "month"
              ? dateLabel(anchor, { month: "long", year: "numeric" })
              : `${dateLabel(start)} — ${dateLabel(addDays(start, 6), { day: "numeric", month: "short", year: "numeric" })}`}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAnchor(localDate())}
          >
            Today
          </Button>
        </div>
        <label className="calendar-jump">
          Go to date
          <input
            type="date"
            aria-label="Go to date"
            value={anchor}
            onChange={(e) => {
              if (e.target.value) setAnchor(e.target.value);
            }}
          />
        </label>
        <div className="segmented">
          <button
            className={view === "week" ? "active" : ""}
            onClick={() => setView("week")}
          >
            Week
          </button>
          <button
            className={view === "month" ? "active" : ""}
            onClick={() => setView("month")}
          >
            Month
          </button>
        </div>
      </div>
      <div className="calendar-options">
        <div>
          <span>
            <i className="dot lime" />
            Running
          </span>
          <span>
            <i className="dot purple" />
            Cycling
          </span>
          <span>
            <i className="dot gray" />
            Rest / other
          </span>
        </div>
        <label>
          <input
            type="checkbox"
            checked={showHistory}
            onChange={(e) => setShowHistory(e.target.checked)}
          />
          Show rescheduled history
        </label>
      </div>
      <section
        className={`calendar-grid ${view}`}
        aria-label={`${view} training calendar`}
      >
        {dates.map((d) => {
          const workouts = data.workouts
            .filter(
              (w) =>
                w.date === d && (showHistory || w.status !== "Rescheduled"),
            )
            .toSorted((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
          return (
            <div
              className={`calendar-cell ${d === localDate() ? "is-today" : ""} ${view === "month" && !d.startsWith(anchor.slice(0, 7)) ? "other-month" : ""}`}
              key={d}
            >
              <div className="calendar-cell-head">
                <div>
                  <span>{dateLabel(d, { weekday: "short" })}</span>
                  <strong>{d.slice(-2)}</strong>
                </div>
                <button
                  aria-label={`Add workout on ${d}`}
                  disabled={editingDisabled}
                  onClick={() => edit(undefined, d)}
                >
                  <Plus size={16} />
                </button>
              </div>
              <div className="calendar-workouts">
                {workouts.map((w) => (
                  <WorkoutCard
                    key={w.id}
                    compact
                    workout={w}
                    onClick={() => edit(w)}
                  />
                ))}
                {!workouts.length ? (
                  <button
                    className="empty-day"
                    onClick={() => edit(undefined, d)}
                    disabled={editingDisabled}
                  >
                    <Plus size={15} />
                    <span>Plan something</span>
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </section>
      <div className="calendar-hint panel">
        <div>
          <CalendarDays size={24} />
          <div>
            <strong>A week that works for you</strong>
            <p>
              Easy Monday · bike Tuesday · intervals Wednesday · optional bike
              Thursday · long run Friday · weekend rest. Targets stay editable.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => void template()}
          disabled={editingDisabled || busy}
        >
          <CopyPlus size={16} />
          {busy ? "Adding…" : "Add usual week"}
        </Button>
      </div>
      <WorkoutEditor
        open={editor}
        onClose={() => setEditor(false)}
        workout={selected}
        date={date}
      />
    </>
  );
}
