"use client";
import { useState } from "react";
import { NotebookPen } from "lucide-react";
import type { Feedback, Workout } from "@/lib/domain";
import { useTraining } from "../providers";
import { Button } from "../ui/button";

export function WorkoutJournal({
  workout: w,
  onSave,
}: {
  workout: Workout;
  onSave: (body: unknown) => void;
}) {
  const { data } = useTraining();
  const linked =
    data?.activities.filter((a) => w.linkedActivityIds?.includes(a.id)) ?? [];
  const first = data?.feedback.find((f) => f.workoutId === w.id);
  const [target, setTarget] = useState(
    first?.scope === "activity" ? (first.activityId ?? "") : "",
  );
  const record = data?.feedback.find(
    (f) =>
      f.workoutId === w.id &&
      (target
        ? f.scope === "activity" && f.activityId === target
        : f.scope !== "activity"),
  );
  return (
    <div className="form-grid">
      <label className="full">
        Journal for
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Whole training session</option>
          {linked.map((a) => (
            <option key={a.id} value={a.id}>
              {new Intl.DateTimeFormat("en-GB", {
                timeZone: "Asia/Jakarta",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(a.startedAt))}{" "}
              · {a.title}
            </option>
          ))}
        </select>
      </label>
      <p className="helper full">
        {target
          ? "This journal describes only the selected activity."
          : "A shared session RPE applies to its linked activities. An individual activity journal takes precedence."}{" "}
        RPE is your own effort rating: 1 is very easy; 10 is maximum effort.
      </p>
      <JournalFields
        key={target || "session"}
        record={record}
        workout={w}
        target={target}
        onSave={onSave}
      />
    </div>
  );
}
function JournalFields({
  record,
  workout: w,
  target,
  onSave,
}: {
  record?: Feedback;
  workout: Workout;
  target: string;
  onSave: (body: unknown) => void;
}) {
  const [base] = useState(record);
  const [journal, setJournal] = useState({
    rpe: record?.rpe ?? null,
    energy: record?.energy ?? null,
    fatigue: record?.fatigue ?? null,
    soreness: record?.soreness ?? null,
    sleepQuality: record?.sleepQuality ?? null,
    notes: record?.notes ?? "",
    skippedReason: record?.skippedReason ?? "",
  });
  return (
    <>
      {(
        [
          ["rpe", "Session RPE", 10],
          ["energy", "Energy", 5],
          ["fatigue", "Fatigue", 5],
          ["soreness", "Soreness", 5],
          ["sleepQuality", "Sleep quality", 5],
        ] as const
      ).map(([key, label, max]) => (
        <label key={key}>
          {target && key === "rpe" ? "Activity RPE" : label} · 1–{max}
          <select
            value={journal[key] ?? ""}
            onChange={(e) =>
              setJournal({
                ...journal,
                [key]: e.target.value ? Number(e.target.value) : null,
              })
            }
          >
            <option value="">Not recorded</option>
            {Array.from({ length: max }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label className="full">
        How did it feel?
        <textarea
          rows={3}
          value={journal.notes}
          onChange={(e) => setJournal({ ...journal, notes: e.target.value })}
        />
      </label>
      <label className="full">
        Reason for skipped training
        <input
          value={journal.skippedReason}
          onChange={(e) =>
            setJournal({ ...journal, skippedReason: e.target.value })
          }
        />
      </label>
      <Button
        className="full"
        onClick={() =>
          onSave({
            action: "feedback",
            id:
              base?.id ??
              (target ? `activity-journal-${target}` : `journal-${w.id}`),
            revision: base?.revision ?? null,
            feedback: {
              ...journal,
              workoutId: w.id,
              ...(target ? { activityId: target } : {}),
              scope: target ? "activity" : "session",
              date: w.date,
            },
          })
        }
      >
        <NotebookPen size={16} />
        Save journal
      </Button>
    </>
  );
}
