"use client";
import { Flag, Pencil, Plus, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import type { Goal } from "@/lib/domain";
import { useTraining, useEditingDisabled } from "./providers";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { localDate } from "@/lib/dates";
export function GoalCard({
  goal,
  compact = false,
}: {
  goal?: Goal;
  compact?: boolean;
}) {
  const { data, save, notify } = useTraining();
  const editingDisabled = useEditingDisabled();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const longest = Math.max(
    0,
    ...(data?.activities
      .filter((a) => a.type === "running")
      .map((a) => a.distanceKm ?? 0) ?? []),
  );
  const percent = goal
    ? Math.min(100, Math.round((longest / goal.distanceKm) * 100))
    : 0;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await save({
        action: "goal",
        id: goal?.id ?? crypto.randomUUID(),
        revision: goal?.revision ?? null,
        goal: {
          title: f.get("title"),
          distanceKm: Number(f.get("distanceKm")),
          targetMonth: f.get("targetMonth"),
          date: f.get("date") || null,
          targetTimeMin: f.get("targetTimeMin")
            ? Number(f.get("targetTimeMin"))
            : null,
          notes: f.get("notes") ?? "",
          priority: f.get("priority") ?? "other",
        },
      });
      notify("Training goal saved");
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className={`panel goal-card ${compact ? "goal-compact" : ""}`}>
        <div className="section-title">
          <span className="eyebrow">
            <Flag size={14} /> THE NEXT CHAPTER
          </span>
          <button
            aria-label={goal ? "Edit race goal" : "Add race goal"}
            className="icon-button"
            onClick={() => setOpen(true)}
            disabled={editingDisabled}
          >
            {goal ? <Pencil size={15} /> : <Plus size={17} />}
          </button>
        </div>
        <h3>{goal?.title ?? "Something to run toward"}</h3>
        {goal?.priority && goal.priority !== "other" ? (
          <span className="helper">
            {goal.priority === "backup"
              ? "Backup goal"
              : "Primary goal · conditional"}
          </span>
        ) : null}
        <div className="goal-distance">
          {goal?.distanceKm ?? 21.1}
          <span>km</span>
        </div>
        <p>
          {goal
            ? goal.date
              ? `${goal.date} · ${Math.ceil((Date.parse(`${goal.date}T00:00:00+07:00`) - Date.parse(`${localDate()}T00:00:00+07:00`)) / 86400000)} days to go`
              : `${new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(`${goal.targetMonth}-01T12:00:00+07:00`))} · flexible target`
            : "Add a race, a distance, or a new adventure."}
        </p>
        {goal?.notes ? <p className="helper">{goal.notes}</p> : null}
        {goal ? (
          <>
            <div className="goal-progress-text">
              <span>Longest run</span>
              <strong>
                {longest.toFixed(1)} <span>/ {goal.distanceKm} km</span>
              </strong>
            </div>
            <div className="progress-track">
              <div style={{ width: `${percent}%` }} />
            </div>
            <p className="goal-footnote">
              Distance milestone only. Race readiness depends on your training
              history and how you feel.
            </p>
          </>
        ) : (
          <Button variant="outline" onClick={() => setOpen(true)}>
            Set a goal <ArrowUpRight size={15} />
          </Button>
        )}
      </section>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={goal ? "Edit your goal" : "Your next starting line"}
      >
        <form className="dialog-body form-grid" onSubmit={submit}>
          {error ? (
            <p className="form-error full" role="alert">
              {error}
            </p>
          ) : null}
          <label className="full">
            Goal name
            <input
              name="title"
              required
              maxLength={120}
              defaultValue={goal?.title ?? "My first half marathon"}
            />
          </label>
          <label>
            Race distance · km
            <input
              name="distanceKm"
              type="number"
              step="0.1"
              min="0.1"
              max="1000"
              required
              defaultValue={goal?.distanceKm ?? 21.1}
            />
          </label>
          <label>
            Preferred month
            <input
              name="targetMonth"
              type="month"
              required
              defaultValue={goal?.targetMonth ?? "2027-01"}
            />
          </label>
          <label>
            Exact date · optional
            <input name="date" type="date" defaultValue={goal?.date ?? ""} />
          </label>
          <label>
            Target time · minutes
            <input
              name="targetTimeMin"
              type="number"
              min="1"
              defaultValue={goal?.targetTimeMin ?? ""}
            />
          </label>
          <label>
            Goal priority
            <select name="priority" defaultValue={goal?.priority ?? "other"}>
              <option value="primary">Primary</option>
              <option value="backup">Backup</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="full">
            Conditions / notes
            <textarea
              name="notes"
              maxLength={2000}
              defaultValue={goal?.notes ?? ""}
            />
          </label>
          <Button className="full" disabled={busy || editingDisabled}>
            {busy ? "Saving…" : "Save goal"}
          </Button>
        </form>
      </Dialog>
    </>
  );
}
