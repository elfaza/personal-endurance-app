"use client";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CalendarClock,
  Check,
  Copy,
  Link2,
  SkipForward,
  Trash2,
} from "lucide-react";
import {
  workoutInput,
  workoutTypes,
  statuses,
  activityIdsForLink,
  activityFitsWorkout,
  expectedActivityCount,
  type Workout,
  type WorkoutInput,
} from "@/lib/domain";
import { localDate } from "@/lib/dates";
import { useTraining, useEditingDisabled } from "../providers";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { WorkoutJournal } from "./workout-journal";
type EditorProps = {
  open: boolean;
  onClose: () => void;
  workout?: Workout;
  date?: string;
  duplicate?: boolean;
};
export function WorkoutEditor(props: EditorProps) {
  return props.open ? (
    <EditorForm
      key={`${props.workout?.id ?? props.date ?? "new"}-${props.duplicate}`}
      {...props}
    />
  ) : null;
}
function EditorForm({ onClose, workout: w, date, duplicate }: EditorProps) {
  const { data, save, notify, offline } = useTraining();
  const editingDisabled = useEditingDisabled();
  const existing = w && !duplicate;
  const [tab, setTab] = useState("workout");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newWorkoutId] = useState(() => crypto.randomUUID());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newDate, setNewDate] = useState(w?.date ?? localDate());
  const [newTime, setNewTime] = useState(w?.time ?? "");
  const multipleActivities = !!w && expectedActivityCount(w) === 2;
  const activityNoun = w?.type === "Bike-to-Work" ? "rides" : "activities";
  const [activityId, setActivityId] = useState(
    multipleActivities ? "" : (w?.linkedActivityId ?? ""),
  );
  const form = useForm<z.input<typeof workoutInput>, unknown, WorkoutInput>({
    resolver: zodResolver(workoutInput),
    defaultValues: {
      date: date ?? w?.date ?? localDate(),
      time: w?.time ?? "06:00",
      type: w?.type ?? "Easy Run",
      title: duplicate ? `${w?.title} (copy)` : (w?.title ?? ""),
      description: w?.description ?? "",
      goal: w?.goal ?? "",
      durationText: w?.durationText ?? "",
      distanceKm: w?.distanceKm ?? null,
      durationMin: w?.durationMin ?? null,
      targetPace: w?.targetPace ?? "",
      hrZone: w?.hrZone ?? null,
      rpe: w?.rpe ?? null,
      status: duplicate ? "Planned" : (w?.status ?? "Planned"),
      optional: w?.optional ?? false,
      commuteLegs: w?.commuteLegs ?? 1,
      commuteReturnTime: w?.commuteReturnTime ?? "",
      activityCount: w?.activityCount ?? 1,
      allowMixedSports: w?.allowMixedSports ?? false,
      notes: duplicate ? "" : (w?.notes ?? ""),
    },
  });
  const watchedStatus = useWatch({ control: form.control, name: "status" });
  const watchedType = useWatch({ control: form.control, name: "type" });
  const watchedLegs = useWatch({ control: form.control, name: "commuteLegs" });
  const watchedActivityCount = useWatch({
    control: form.control,
    name: "activityCount",
  });
  async function perform(
    body: unknown,
    message: string,
    optimistic?: (d: NonNullable<typeof data>) => NonNullable<typeof data>,
  ) {
    setBusy(true);
    setError("");
    try {
      await save(body, optimistic);
      notify(message);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const submit = form.handleSubmit((values) =>
    perform(
      existing
        ? {
            action: "update",
            id: w.id,
            revision: w.revision,
            workout: {
              ...values,
              status: w.linkedActivityId ? w.status : values.status,
            },
          }
        : { action: "create", id: newWorkoutId, workout: values },
      existing ? "Workout updated" : "Workout added",
      existing
        ? (d) => ({
            ...d,
            workouts: d.workouts.map((x) =>
              x.id === w.id ? { ...x, ...values } : x,
            ),
          })
        : undefined,
    ),
  );
  function status(status: Workout["status"]) {
    if (!w) return;
    void perform(
      {
        action: "update",
        id: w.id,
        revision: w.revision,
        workout: { ...w, status },
      },
      status === "Skipped"
        ? "Workout skipped. Future targets remain unchanged."
        : "Completion saved with your manual confirmation.",
    );
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={
        existing
          ? "Your training session"
          : duplicate
            ? "Duplicate workout"
            : "Plan a session"
      }
      description={
        existing
          ? `${w.type} · ${w.date} · ${w.status}`
          : "Make room for movement. All targets are optional."
      }
    >
      <div className="dialog-body">
        {existing ? (
          <div
            className="editor-tabs"
            role="tablist"
            aria-label="Workout options"
          >
            {[
              ["workout", "Workout"],
              ["reschedule", "Reschedule"],
              ["link", "Activity"],
              ["journal", "Journal"],
            ].map(([value, label]) => (
              <button
                role="tab"
                aria-selected={tab === value}
                key={value}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="form-error">
            {error}
          </div>
        ) : null}
        <fieldset
          disabled={busy || editingDisabled}
          className="editor-fieldset"
        >
          {tab === "workout" ? (
            <form onSubmit={submit} className="form-grid">
              <label className="full">
                Session title
                <input
                  {...form.register("title")}
                  placeholder="e.g. Morning easy run"
                />
                {form.formState.errors.title ? (
                  <span className="field-error">
                    {form.formState.errors.title.message}
                  </span>
                ) : null}
              </label>
              <label>
                Workout type
                <select {...form.register("type")}>
                  {workoutTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input
                  type="date"
                  {...form.register("date")}
                  readOnly={!!existing}
                />
              </label>
              <label>
                Start time <span className="muted">optional</span>
                <input type="time" {...form.register("time")} />
              </label>
              {watchedType === "Bike-to-Work" ? (
                <>
                  <label>
                    Commute plan
                    <select
                      {...form.register("commuteLegs", { setValueAs: Number })}
                    >
                      <option value={1}>One ride</option>
                      <option value={2}>To work + return ride</option>
                    </select>
                  </label>
                  {watchedLegs === 2 ? (
                    <label>
                      Return ride start <span className="muted">optional</span>
                      <input
                        type="time"
                        {...form.register("commuteReturnTime")}
                      />
                    </label>
                  ) : null}
                  <p className="helper full">
                    A timed commute can match a unique Garmin ride without a
                    distance target. Two-ride plans stay partially completed
                    after the first ride. Set a return start time to match the
                    second ride automatically.
                  </p>
                </>
              ) : null}
              {watchedType !== "Bike-to-Work" && watchedType !== "Rest Day" ? (
                <>
                  <label>
                    Recorded activities expected
                    <select
                      {...form.register("activityCount", {
                        setValueAs: Number,
                      })}
                    >
                      <option value={1}>One activity</option>
                      <option value={2}>Two activities</option>
                    </select>
                  </label>
                  {watchedActivityCount === 2 ? (
                    <label className="check-label">
                      <input
                        type="checkbox"
                        {...form.register("allowMixedSports")}
                      />
                      Allow different sports on the same date
                    </label>
                  ) : null}
                </>
              ) : null}
              <label>
                Status
                <select
                  {...form.register("status")}
                  disabled={
                    !existing ||
                    !!w?.linkedActivityId ||
                    w?.status === "Rescheduled"
                  }
                >
                  {statuses
                    .filter(
                      (s) => s !== "Rescheduled" || w?.status === "Rescheduled",
                    )
                    .map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                </select>
              </label>
              <label>
                Target distance · km
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1000"
                  {...form.register("distanceKm", {
                    setValueAs: (v) =>
                      v === "" || v == null ? null : Number(v),
                  })}
                  placeholder="—"
                />
              </label>
              <label>
                Target duration · min
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="1440"
                  {...form.register("durationMin", {
                    setValueAs: (v) =>
                      v === "" || v == null ? null : Number(v),
                  })}
                  placeholder="—"
                />
              </label>
              <label>
                Target pace · min/km
                <input
                  {...form.register("targetPace")}
                  placeholder="e.g. 7:00–7:30"
                />
              </label>
              <label className="full">
                Duration range / detail · min
                <input
                  {...form.register("durationText")}
                  placeholder="e.g. 40–55; used when no numeric duration is set"
                />
              </label>
              <label>
                Target HR zone
                <select
                  {...form.register("hrZone", {
                    setValueAs: (v) =>
                      v === "" || v == null ? null : Number(v),
                  })}
                >
                  <option value="">No target</option>
                  {[1, 2, 3, 4, 5].map((x) => (
                    <option key={x} value={x}>
                      Zone {x}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Target RPE · 1–10
                <input
                  type="number"
                  min="1"
                  max="10"
                  {...form.register("rpe", {
                    setValueAs: (v) =>
                      v === "" || v == null ? null : Number(v),
                  })}
                />
              </label>
              <label className="check-label">
                <input type="checkbox" {...form.register("optional")} />
                Optional / tentative session
              </label>
              <label className="full">
                Session description
                <textarea {...form.register("description")} rows={2} />
              </label>
              <label className="full">
                Personal notes
                <textarea {...form.register("notes")} rows={2} />
              </label>
              <label className="full">
                Session goal
                <textarea {...form.register("goal")} rows={2} />
              </label>
              {existing &&
              ["Completed", "Partially Completed"].includes(
                watchedStatus ?? "",
              ) &&
              !w.linkedActivityId ? (
                <p className="helper full">
                  Saving confirms that you completed this training. Planned
                  distance stays a target; no Garmin metrics will be created.
                </p>
              ) : null}
              {Object.keys(form.formState.errors).length ? (
                <p className="field-error full">
                  Check the highlighted fields, dates and target ranges before
                  saving.
                </p>
              ) : null}
              <div className="form-actions full">
                {existing && w.status === "Planned" && !w.linkedActivityId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={16} />
                    Delete
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  type="submit"
                  disabled={busy || w?.status === "Rescheduled"}
                >
                  {busy ? "Saving…" : existing ? "Save changes" : "Add workout"}
                </Button>
              </div>
              {confirmDelete ? (
                <div className="confirm-box full">
                  <p>
                    Delete this planned workout? It will be hidden from your
                    calendar; its revision history is retained.
                  </p>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() =>
                      void perform(
                        { action: "delete", id: w!.id, revision: w!.revision },
                        "Planned workout deleted",
                      )
                    }
                  >
                    Delete workout
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Keep workout
                  </Button>
                </div>
              ) : null}
            </form>
          ) : null}
          {tab === "reschedule" && w ? (
            <div className="form-grid">
              <p className="helper full">
                Move this session without losing its original date. The original
                entry stays in your history as Rescheduled.
              </p>
              <label>
                New date
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </label>
              <label>
                Start time
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                />
              </label>
              <Button
                className="full"
                disabled={w.status !== "Planned" || !!w.linkedActivityId}
                onClick={() =>
                  void perform(
                    {
                      action: "reschedule",
                      id: w.id,
                      revision: w.revision,
                      date: newDate,
                      time: newTime,
                    },
                    "Workout moved. Original schedule retained.",
                  )
                }
              >
                <CalendarClock size={17} />
                Reschedule session
              </Button>
            </div>
          ) : null}
          {tab === "link" && w ? (
            <div className="form-grid">
              {w.recordedResult &&
              Object.values(w.recordedResult).some((v) => v != null) ? (
                <div className="full">
                  <strong>Recorded in Training Plan</strong>
                  <p className="helper">
                    {w.recordedResult.distanceKm ?? "—"} km ·{" "}
                    {w.recordedResult.durationMin?.toFixed(1) ?? "—"} min · HR{" "}
                    {w.recordedResult.avgHr ?? "—"} /{" "}
                    {w.recordedResult.maxHr ?? "—"}. These are source results,
                    separate from the workout targets.
                  </p>
                </div>
              ) : null}
              <p className="helper full">
                Link a recorded activity from the same date and sport. Recorded
                Garmin metrics stay read-only. A manual link confirms a recorded
                ride even when targets differ. A round trip needs both rides to
                be completed.
              </p>
              {multipleActivities && w.linkedActivityIds?.length ? (
                <div className="full">
                  <strong>
                    {w.linkedActivityIds.length} of 2 {activityNoun} completed
                  </strong>
                  {w.linkedActivityIds.map((id) => (
                    <p className="helper" key={id}>
                      {data?.activities.find((a) => a.id === id)?.title ?? id}
                    </p>
                  ))}
                  <Button
                    variant="outline"
                    onClick={() =>
                      void perform(
                        {
                          action: "link",
                          id: w.id,
                          revision: w.revision,
                          activityId: null,
                          activityIds: [],
                        },
                        "Activities unlinked; plan restored",
                      )
                    }
                  >
                    Unlink all {activityNoun}
                  </Button>
                </div>
              ) : null}
              <label className="full">
                Recorded activity
                <select
                  value={activityId}
                  onChange={(e) => setActivityId(e.target.value)}
                >
                  <option value="">
                    {multipleActivities
                      ? "Choose an activity to add"
                      : "No linked activity"}
                  </option>
                  {data?.activities
                    .filter(
                      (a) =>
                        a.source !== "sheet" &&
                        activityFitsWorkout(w, a) &&
                        !data.links.some(
                          (l) =>
                            activityIdsForLink(l).includes(a.id) &&
                            l.workoutId !== w.id,
                        ) &&
                        (!multipleActivities ||
                          !w.linkedActivityIds?.includes(a.id)),
                    )
                    .toSorted((a, b) => b.date.localeCompare(a.date))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.date} · {a.title} · {a.distanceKm?.toFixed(1) ?? "—"}{" "}
                        km
                      </option>
                    ))}
                </select>
              </label>
              <Button
                className="full"
                disabled={
                  multipleActivities &&
                  (!activityId || (w.linkedActivityIds?.length ?? 0) >= 2)
                }
                onClick={() =>
                  void perform(
                    {
                      action: "link",
                      id: w.id,
                      revision: w.revision,
                      activityId: activityId || null,
                      activityIds: multipleActivities
                        ? [
                            ...new Set(
                              [
                                ...(w.linkedActivityIds ?? []),
                                activityId,
                              ].filter(Boolean),
                            ),
                          ]
                        : undefined,
                    },
                    activityId
                      ? "Recorded activity linked"
                      : "Activity unlinked; plan restored",
                  )
                }
              >
                <Link2 size={16} />
                Save activity link
              </Button>
            </div>
          ) : null}
          {tab === "journal" && w ? (
            <WorkoutJournal
              workout={w}
              onSave={(body) => void perform(body, "Training journal saved")}
            />
          ) : null}
          {existing &&
          tab === "workout" &&
          w.status === "Planned" &&
          !w.linkedActivityId ? (
            <div className="quick-actions">
              <span>QUICK ACTIONS</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => status("Completed")}
              >
                <Check size={14} />I completed this
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => status("Skipped")}
              >
                <SkipForward size={14} />
                Skip session
              </Button>
            </div>
          ) : null}
          {existing && tab === "workout" ? (
            <div className="duplicate-action">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const values = form.getValues();
                  void perform(
                    {
                      action: "create",
                      id: crypto.randomUUID(),
                      workout: { ...values, status: "Planned" },
                    },
                    "Workout duplicated as a new plan",
                  );
                }}
              >
                <Copy size={14} />
                Duplicate this workout
              </Button>
            </div>
          ) : null}
        </fieldset>
        {offline ? (
          <p className="helper">
            You’re offline. Editing is unavailable until you reconnect.
          </p>
        ) : null}
        {data?.configured.readOnly ? (
          <p className="helper">
            This hosted preview is read-only. Configure Google Sheets and switch
            to live mode to save training across your devices.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
