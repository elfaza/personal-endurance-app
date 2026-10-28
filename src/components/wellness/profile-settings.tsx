"use client";
import { useState, type FormEvent } from "react";
import { UserRound, Scale, Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import { useWellness } from "./use-wellness";
import { BudgetCard } from "./budget-card";
import { request, useTraining } from "../providers";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import {
  profileInput,
  weightInput,
  ageOn,
  type Profile,
  type Weight,
} from "@/lib/wellness";
import { dateLabel, localDate } from "@/lib/dates";

export function ProfileSettings() {
  const { data, error, mutate, disabled } = useWellness();
  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState<Weight | null | undefined>(undefined);
  if (!data)
    return (
      <section className="panel padded">
        <h2>Personal profile</h2>
        <p role={error ? "alert" : "status"}>
          {error?.message ?? "Loading your profile…"}
        </p>
        {error ? (
          <Button variant="outline" onClick={() => void mutate()}>
            Try again
          </Button>
        ) : null}
      </section>
    );
  const p = data.profile,
    latest = data.weights[0];
  return (
    <>
      <section
        className="panel padded"
        id="personal-profile"
        aria-label="Personal profile"
      >
        <div className="wellness-row">
          <span className="eyebrow">
            <UserRound size={15} className="inline-icon" /> YOUR PERSONAL
            CONTEXT
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            disabled={disabled}
          >
            <Pencil size={15} />
            {p ? "Edit profile" : "Set up profile"}
          </Button>
        </div>
        <h2>Personal profile</h2>
        <p className="helper">
          A little context for your training review. You choose what to share.
        </p>
        <dl className="wellness-profile-facts">
          <div>
            <dt>Age</dt>
            <dd>
              {p?.birthDate ? `${ageOn(p.birthDate)} years` : "Not added"}
            </dd>
          </div>
          <div>
            <dt>Height</dt>
            <dd>{p?.heightCm ? `${p.heightCm} cm` : "Not added"}</dd>
          </div>
          <div>
            <dt>Latest weight</dt>
            <dd>{latest ? `${latest.kg} kg` : "Not added"}</dd>
          </div>
          <div>
            <dt>Experience</dt>
            <dd>
              {p
                ? {
                    new: "Getting started",
                    regular: "Training regularly",
                    experienced: "Experienced",
                  }[p.experience]
                : "Not added"}
            </dd>
          </div>
        </dl>
        {p?.goal ? (
          <p className="wellness-goal">
            <strong>Your focus</strong>
            <br />
            {p.goal}
          </p>
        ) : null}
        <p className="helper">
          Workload comes from recorded training and journal RPE. Age, height and
          weight add context; they do not create a readiness score or a calorie
          target.
        </p>
      </section>
      <section className="panel padded" aria-label="Weight history">
        <div className="wellness-row">
          <div>
            <span className="eyebrow">
              <Scale size={15} className="inline-icon" /> YOUR OWN TIMELINE
            </span>
            <h2>Weight history</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeight(null)}
            disabled={disabled}
          >
            <Plus size={15} />
            Log weight
          </Button>
        </div>
        <p className="helper">
          One measurement per date. Updating it keeps the previous revision in
          your Sheet.
        </p>
        {data.weights.length ? (
          <div className="wellness-history">
            {data.weights.map((w) => (
              <div className="wellness-row" key={w.date}>
                <span>
                  {dateLabel(w.date, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <strong>{w.kg} kg</strong>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setWeight(w)}
                  disabled={disabled}
                  aria-label={`Edit weight for ${w.date}`}
                >
                  <Pencil size={16} />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="wellness-empty-small">
            No measurements yet. Start whenever you’re ready.
          </div>
        )}
      </section>
      <section
        className="panel padded"
        id="ai-settings"
        aria-label="AI connection and spending"
      >
        <span className="eyebrow">
          <Sparkles size={15} className="inline-icon" /> YOU CONTROL THE SPEND
        </span>
        <h2>AI insights & budget</h2>
        <p className="helper">
          OpenAI Luna · analysis runs only when you request it.
        </p>
        <BudgetCard budget={data.budget} />
        {data.aiReason ? (
          <p className="wellness-notice">{data.aiReason}</p>
        ) : (
          <p className="helper">
            AI is connected. You’ll confirm before sharing a photo or training
            summary.
          </p>
        )}
        <p className="helper">
          Photos are compressed previews stored privately in your existing
          Sheet. No extra storage service. Your profile, food journal and photos
          are excluded from offline browser snapshots.
        </p>
      </section>
      {editing ? (
        <ProfileEditor
          profile={p}
          disabled={disabled}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            await mutate();
            setEditing(false);
          }}
        />
      ) : null}
      {weight !== undefined ? (
        <WeightEditor
          weight={weight}
          weights={data.weights}
          disabled={disabled}
          onClose={() => setWeight(undefined)}
          onSaved={async () => {
            await mutate();
            setWeight(undefined);
          }}
        />
      ) : null}
    </>
  );
}
function ProfileEditor({
  profile,
  disabled,
  onClose,
  onSaved,
}: {
  profile: Profile | null;
  disabled: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { notify } = useTraining();
  const [birthDate, setBirthDate] = useState(profile?.birthDate ?? ""),
    [height, setHeight] = useState(profile?.heightCm?.toString() ?? ""),
    [goal, setGoal] = useState(profile?.goal ?? ""),
    [experience, setExperience] = useState(profile?.experience ?? "new");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = profileInput.safeParse({
      birthDate: birthDate || null,
      heightCm: height ? Number(height) : null,
      goal,
      experience,
    });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request("/api/wellness", {
        action: "profile",
        revision: profile?.revision ?? null,
        profile: result.data,
      });
      await onSaved();
      notify("Personal profile saved");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title="Your personal profile"
      description="Optional context for your training review. Saved privately in your Sheet."
    >
      <form className="wellness-form" onSubmit={(e) => void submit(e)}>
        <div className="wellness-fields">
          <label>
            Birth date
            <input
              type="date"
              value={birthDate}
              max={localDate()}
              min="1900-01-01"
              onChange={(e) => setBirthDate(e.target.value)}
            />
            <small>Age updates automatically.</small>
          </label>
          <label>
            Height (cm)
            <input
              type="number"
              min="50"
              max="250"
              step="0.1"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          </label>
        </div>
        <label>
          Training experience
          <select
            value={experience}
            onChange={(e) => setExperience(e.target.value as typeof experience)}
          >
            <option value="new">Getting started</option>
            <option value="regular">Training regularly</option>
            <option value="experienced">Experienced</option>
          </select>
        </label>
        <label>
          Your main focus
          <textarea
            maxLength={500}
            rows={3}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="For example, build a consistent running routine."
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="wellness-actions">
          <Button
            variant="outline"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button disabled={busy || disabled} type="submit">
            {busy ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
function WeightEditor({
  weight,
  weights,
  disabled,
  onClose,
  onSaved,
}: {
  weight: Weight | null;
  weights: Weight[];
  disabled: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { notify } = useTraining();
  const [date, setDate] = useState(weight?.date ?? localDate()),
    [kg, setKg] = useState(weight?.kg.toString() ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false);
  const existing = weights.find((w) => w.date === date);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = weightInput.safeParse({ date, kg: Number(kg) });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    await save({
      action: "weight",
      revision: existing?.revision ?? null,
      weight: parsed.data,
    });
  }
  async function save(command: object) {
    setBusy(true);
    setError("");
    try {
      await request("/api/wellness", command);
      await onSaved();
      notify("Weight history updated");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={weight ? "Edit weight" : "Log weight"}
      description="A dated measurement, without a target or judgement."
    >
      <form className="wellness-form" onSubmit={(e) => void submit(e)}>
        <div className="wellness-fields">
          <label>
            Measurement date
            <input
              type="date"
              required
              max={localDate()}
              value={date}
              disabled={!!weight}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Weight (kg)
            <input
              type="number"
              required
              min="20"
              max="400"
              step="0.1"
              value={kg}
              onChange={(e) => setKg(e.target.value)}
            />
          </label>
        </div>
        {existing && !weight ? (
          <p className="wellness-notice">
            There’s already a measurement on this date. Saving will update it.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
        {confirmDelete ? (
          <div className="wellness-notice">
            <p>
              Remove this measurement from your history? Its old revision
              remains in the Sheet.
            </p>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || disabled}
              onClick={() =>
                void save({
                  action: "delete-weight",
                  date,
                  revision: weight!.revision,
                })
              }
            >
              Confirm removal
            </Button>
          </div>
        ) : null}
        <div className="wellness-actions">
          {weight && !confirmDelete ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy || disabled}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={16} />
              Remove
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy || disabled}>
            {busy ? "Saving…" : "Save weight"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
