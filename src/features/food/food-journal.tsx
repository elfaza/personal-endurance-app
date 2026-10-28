"use client";
import Image from "next/image";
import Link from "next/link";
import { useState, useRef, type FormEvent } from "react";
import {
  Camera,
  Plus,
  Pencil,
  Trash2,
  Utensils,
  Sparkles,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { useWellness } from "@/components/wellness/use-wellness";
import { BudgetCard } from "@/components/wellness/budget-card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { request, useTraining } from "@/components/providers";
import { compressMealPhoto } from "@/lib/meal-photo";
import { foodReferences, referenceItem } from "@/lib/nutrition";
import {
  mealInput,
  mealTotals,
  money,
  type Meal,
  type MealInput,
  type FoodItem,
  type WellnessData,
} from "@/lib/wellness";
import { localDate, addDays, dateLabel } from "@/lib/dates";
import type { PhotoResult } from "@/lib/server/wellness-ai";

const blankItem = (): FoodItem => ({
  name: "",
  grams: 100,
  kcalLow: 0,
  kcalHigh: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  basis: "manual",
});
export function FoodJournal() {
  const { data, error, mutate, disabled, offline } = useWellness();
  const { notify } = useTraining();
  const [date, setDate] = useState(localDate),
    [editor, setEditor] = useState<Meal | null | undefined>(undefined),
    [deleting, setDeleting] = useState<Meal | null>(null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setFailure("");
    try {
      await request("/api/wellness", {
        action: "delete-meal",
        id: deleting.id,
        revision: deleting.revision,
      });
      await mutate();
      setDeleting(null);
      notify("Meal removed from your journal");
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section className="panel padded">
        <h1>Food journal</h1>
        <p role={error ? "alert" : "status"}>
          {error?.message ?? "Loading your food journal…"}
        </p>
        {error ? (
          <Button variant="outline" onClick={() => void mutate()}>
            Try again
          </Button>
        ) : null}
      </section>
    );
  const meals = data.meals.filter((m) => m.date === date),
    totals = mealTotals(meals.flatMap((m) => m.items));
  const week = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A LITTLE MORE CONTEXT FOR YOUR TRAINING</div>
          <h1>
            Your food journal<span className="accent">.</span>
          </h1>
          <p>Capture a meal, check the estimate, make it yours.</p>
        </div>
        <Button disabled={disabled} onClick={() => setEditor(null)}>
          <Plus size={17} />
          Add meal
        </Button>
      </div>
      <div className="food-layout">
        <div>
          <section
            className="panel padded food-day"
            aria-label="Logged food for selected date"
          >
            <div className="wellness-row">
              <div className="food-date-controls">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Previous food day"
                  onClick={() => setDate(addDays(date, -1))}
                >
                  <ArrowLeft size={18} />
                </Button>
                <label className="food-date-label">
                  Journal date
                  <input
                    aria-label="Journal date"
                    type="date"
                    max={localDate()}
                    value={date}
                    onChange={(e) => {
                      if (e.target.value && e.target.value <= localDate())
                        setDate(e.target.value);
                    }}
                  />
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Next food day"
                  disabled={date >= localDate()}
                  onClick={() => setDate(addDays(date, 1))}
                >
                  <ArrowRight size={18} />
                </Button>
              </div>
              <span className="wellness-tag">{meals.length} meals logged</span>
            </div>
            <div className="food-energy">
              <span>Logged energy · estimate</span>
              <strong>
                {Math.round(totals.low).toLocaleString()}–
                {Math.round(totals.high).toLocaleString()} <small>kcal</small>
              </strong>
            </div>
            <div className="food-macros">
              <div>
                <span>Protein</span>
                <strong>{Math.round(totals.protein)} g</strong>
              </div>
              <div>
                <span>Carbohydrates</span>
                <strong>{Math.round(totals.carbs)} g</strong>
              </div>
              <div>
                <span>Fat</span>
                <strong>{Math.round(totals.fat)} g</strong>
              </div>
            </div>
            <p className="helper">
              Totals include only the food you logged. They are not an intake
              target or calories remaining, and do not subtract Garmin exercise
              calories.
            </p>
          </section>
          <div className="food-meal-list">
            {meals.length ? (
              meals.map((meal) => {
                const total = mealTotals(meal.items);
                return (
                  <article className="panel food-meal" key={meal.id}>
                    {meal.hasPhoto ? (
                      <Link
                        href={`/api/wellness/photo/${meal.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="food-photo-link"
                        aria-label={`Open saved photo of ${meal.title}`}
                      >
                        <Image
                          src={`/api/wellness/photo/${meal.id}?v=${meal.revision}`}
                          alt={`Saved photo of ${meal.title}`}
                          width={160}
                          height={160}
                          unoptimized
                        />
                      </Link>
                    ) : (
                      <div className="food-no-photo">
                        <Utensils size={27} />
                      </div>
                    )}
                    <div className="food-meal-content">
                      <span className="eyebrow">{meal.kind}</span>
                      <h2>{meal.title}</h2>
                      <strong>
                        {Math.round(total.low)}–{Math.round(total.high)} kcal
                      </strong>
                      <p className="helper">
                        {meal.items
                          .map((i) => `${i.name} (${i.grams} g)`)
                          .join(" · ")}
                      </p>
                      <p className="helper">
                        Protein {Math.round(total.protein)} g · Carbs{" "}
                        {Math.round(total.carbs)} g · Fat{" "}
                        {Math.round(total.fat)} g
                      </p>
                      {meal.notes ? (
                        <p className="food-notes">{meal.notes}</p>
                      ) : null}
                      <span className="wellness-tag">
                        {meal.items.some((i) => i.basis === "ai-estimate")
                          ? "Photo estimate · reviewed"
                          : meal.items.some((i) => i.basis === "reference")
                            ? "Includes reference estimates"
                            : "Manual entry"}
                      </span>
                      <div className="wellness-actions">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={disabled}
                          onClick={() => setEditor(meal)}
                        >
                          <Pencil size={15} />
                          Edit meal
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={disabled}
                          onClick={() => {
                            setFailure("");
                            setDeleting(meal);
                          }}
                          aria-label={`Delete ${meal.title}`}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <section className="panel padded food-empty">
                <Utensils size={38} strokeWidth={1.3} />
                <h2>A fresh page for your food.</h2>
                <p>
                  No meals logged for {dateLabel(date)}. Start with a photo or
                  enter the details yourself.
                </p>
                <Button disabled={disabled} onClick={() => setEditor(null)}>
                  <Plus size={16} />
                  Log your first meal
                </Button>
              </section>
            )}
          </div>
        </div>
        <aside className="food-aside">
          <section className="panel padded">
            <span className="eyebrow">YOUR LOGGING RHYTHM</span>
            <h2>The last 7 days</h2>
            <div className="food-week">
              {week.map((day) => {
                const daily = data.meals.filter((m) => m.date === day);
                return (
                  <button
                    key={day}
                    onClick={() => setDate(day)}
                    aria-label={`View food on ${day}`}
                    className={day === date ? "selected" : ""}
                  >
                    <span>{dateLabel(day, { weekday: "short" })}</span>
                    <strong>{day.slice(-2)}</strong>
                    <small>
                      {daily.length ? `${daily.length} logged` : "No log"}
                    </small>
                  </button>
                );
              })}
            </div>
            <p className="helper">Gaps mean unlogged food, not zero intake.</p>
          </section>
          <section className="panel padded">
            <span className="eyebrow">
              <Camera size={15} className="inline-icon" /> PHOTO TO JOURNAL
            </span>
            <h2>You get the final say.</h2>
            <ol className="food-steps">
              <li>Choose a photo or enter food manually.</li>
              <li>Check the food, portions and calorie range.</li>
              <li>Save when it looks right to you.</li>
            </ol>
            <p className="helper">
              A photo can’t show every ingredient or measure hidden oil.
              Estimates always need your review.
            </p>
            <p className="helper">
              Saved photos are compressed previews in your existing Google
              Sheet. Original photo quality is reduced. No extra storage
              service.
            </p>
          </section>
          <section className="panel padded">
            <BudgetCard budget={data.budget} compact />
            {data.aiReason ? <p className="helper">{data.aiReason}</p> : null}
            <Link className="text-link" href="/settings#ai-settings">
              AI settings & details <ArrowRight size={15} />
            </Link>
          </section>
        </aside>
      </div>
      {offline ? (
        <p className="wellness-notice">
          You’re offline. Reconnect to load or change the food journal.
        </p>
      ) : null}
      {editor !== undefined ? (
        <MealEditor
          key={editor?.id ?? `new-${date}`}
          meal={editor}
          date={date}
          wellness={data}
          disabled={disabled}
          onClose={() => setEditor(undefined)}
          onRefresh={() => mutate()}
          onSaved={async () => {
            await mutate();
            setEditor(undefined);
            notify("Meal saved to your journal");
          }}
        />
      ) : null}
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
        title="Remove this meal?"
        description="The meal and its photo will disappear from your journal. Append-only history remains in your Sheet."
      >
        <div className="wellness-form">
          <p>{deleting?.title}</p>
          {failure ? (
            <p className="form-error" role="alert">
              {failure}
            </p>
          ) : null}
          <div className="wellness-actions">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Keep meal
            </Button>
            <Button
              variant="destructive"
              disabled={busy || disabled}
              onClick={() => void remove()}
            >
              {busy ? "Removing…" : "Remove meal"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
function MealEditor({
  meal,
  date,
  wellness,
  disabled,
  onClose,
  onSaved,
  onRefresh,
}: {
  meal: Meal | null;
  date: string;
  wellness: WellnessData;
  disabled: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onRefresh: () => Promise<unknown>;
}) {
  const [id] = useState(() => meal?.id ?? crypto.randomUUID());
  const [draft, setDraft] = useState<MealInput>(() =>
    meal
      ? { ...meal, items: meal.items.map((i) => ({ ...i })) }
      : { date, title: "", kind: "Lunch", items: [blankItem()], notes: "" },
  );
  const [photo, setPhoto] = useState<string>(),
    [removePhoto, setRemovePhoto] = useState(false),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [preparing, setPreparing] = useState(false),
    [analyzing, setAnalyzing] = useState(false),
    [error, setError] = useState(""),
    [uncertainty, setUncertainty] = useState("");
  const working = busy || preparing || analyzing;
  const photoSrc =
    photo ??
    (meal?.hasPhoto && !removePhoto
      ? `/api/wellness/photo/${meal.id}?v=${meal.revision}`
      : undefined);
  function update(index: number, patch: Partial<FoodItem>) {
    setDraft((d) => ({
      ...d,
      items: d.items.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    }));
  }
  async function choose(file: File) {
    setPreparing(true);
    setError("");
    try {
      setPhoto(await compressMealPhoto(file));
      setRemovePhoto(false);
      setConsent(false);
      setUncertainty("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreparing(false);
    }
  }
  async function analyze() {
    if (!photo || !consent) return;
    setAnalyzing(true);
    setError("");
    try {
      const response = await request<{ result: PhotoResult }>(
        "/api/wellness/ai",
        {
          kind: "food",
          photo,
          notes: draft.notes.slice(0, 500),
          consent: true,
        },
      );
      setUncertainty(response.result.uncertainty);
      if (response.result.items.length)
        setDraft((d) => ({
          ...d,
          items: response.result.items,
          notes: [d.notes, response.result.uncertainty]
            .filter(Boolean)
            .join("\n")
            .slice(0, 1000),
        }));
      else
        setError(
          "No food could be identified. Try a clearer photo, or keep entering the meal manually.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalyzing(false);
      await onRefresh();
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = mealInput.safeParse(draft);
    if (!result.success) {
      setError(
        `${result.error.issues[0].path.join(" · ")}: ${result.error.issues[0].message}`,
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request("/api/wellness", {
        action: "meal",
        id,
        revision: meal?.revision ?? null,
        meal: result.data,
        photo,
        removePhoto,
      });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const totals = mealTotals(draft.items);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !working) onClose();
      }}
      title={meal ? "Review your meal" : "Add a meal"}
      description="Photo or manual entry → check the details → save. Nothing is logged until you confirm."
    >
      <form
        className="wellness-form meal-editor"
        onSubmit={(e) => void submit(e)}
      >
        <fieldset disabled={working || disabled} className="wellness-fieldset">
          <div className="wellness-fields">
            <label>
              Meal date
              <input
                type="date"
                required
                max={localDate()}
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
            <label>
              Meal type
              <select
                value={draft.kind}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    kind: e.target.value as MealInput["kind"],
                  })
                }
              >
                {["Breakfast", "Lunch", "Dinner", "Snack"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Meal name
            <input
              required
              maxLength={120}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="For example, lunch after a run"
            />
          </label>
          <div className="meal-photo-area">
            {photoSrc ? (
              <Image
                className="meal-photo-preview"
                src={photoSrc}
                alt="Meal photo preview"
                width={640}
                height={420}
                unoptimized
              />
            ) : (
              <div className="meal-photo-placeholder">
                <Camera size={30} />
                <strong>A photo is optional.</strong>
                <span>Manual entry is always available.</span>
              </div>
            )}
            <label className="meal-photo-picker">
              {photoSrc ? "Replace meal photo" : "Choose meal photo"}
              <input
                aria-label="Choose meal photo"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void choose(f);
                  e.target.value = "";
                }}
              />
            </label>
            {photoSrc ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPhoto(undefined);
                  setRemovePhoto(true);
                  setConsent(false);
                }}
              >
                Remove photo
              </Button>
            ) : null}
            <p className="helper">
              Saved as a private preview up to 640px / 48 KB in your Sheet.
              Cancelling discards the draft.
            </p>
          </div>
          <label>
            Ingredients, portions or cooking notes
            <textarea
              maxLength={1000}
              rows={2}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="For example, half a plate of rice, fried chicken, sauce on the side."
            />
          </label>
          {photo ? (
            <div className="meal-ai-action">
              <label className="wellness-checkbox">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  Allow OpenAI to analyze this compressed photo and up to 500
                  characters of these notes. Processing policies apply; the
                  estimate needs my review.
                </span>
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={
                  !consent || !wellness.aiAvailable || wellness.budget.blocked
                }
                onClick={() => void analyze()}
              >
                <Sparkles size={16} />
                Analyze photo
              </Button>
              <p className="helper">
                Reserves up to {money(wellness.budget.reservePerCall)} from your
                monthly allowance. Analysis replaces the food components below.
              </p>
              {wellness.aiReason ? (
                <p className="helper">{wellness.aiReason}</p>
              ) : null}
              {wellness.budget.blocked ? (
                <p className="wellness-notice">
                  AI is paused for this month. You can still save the photo and
                  enter food manually.
                </p>
              ) : null}
            </div>
          ) : null}
          {uncertainty ? (
            <p className="wellness-notice" role="status">
              {uncertainty}
            </p>
          ) : null}
          <div className="wellness-row">
            <h3>Review food & portions</h3>
            <span className="wellness-tag">
              {draft.items.length}/12 components
            </span>
          </div>
          <p className="helper">
            Nutrition values are for the whole component. Changing grams scales
            its values; you can correct every estimate.
          </p>
          {draft.items.map((item, index) => (
            <FoodItemEditor
              key={index}
              item={item}
              index={index}
              onChange={(patch) => update(index, patch)}
              onRemove={() =>
                setDraft((d) => ({
                  ...d,
                  items: d.items.filter((_, i) => i !== index),
                }))
              }
            />
          ))}
          <Button
            variant="outline"
            type="button"
            disabled={draft.items.length >= 12}
            onClick={() =>
              setDraft({ ...draft, items: [...draft.items, blankItem()] })
            }
          >
            <Plus size={16} />
            Add food component
          </Button>
          <div className="meal-draft-total">
            <span>Reviewed meal estimate</span>
            <strong>
              {Math.round(totals.low)}–{Math.round(totals.high)} kcal
            </strong>
            <small>
              Protein {Math.round(totals.protein)} g · Carbs{" "}
              {Math.round(totals.carbs)} g · Fat {Math.round(totals.fat)} g
            </small>
          </div>
        </fieldset>
        {working ? (
          <p role="status" className="helper">
            {preparing
              ? "Preparing a compressed photo…"
              : analyzing
                ? "Analyzing your photo. Your meal is not saved yet…"
                : "Saving your confirmed meal…"}
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="wellness-actions">
          <Button
            type="button"
            variant="outline"
            disabled={working}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={working || disabled || !draft.items.length}
          >
            {busy ? "Saving…" : "Save confirmed meal"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
function FoodItemEditor({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: FoodItem;
  index: number;
  onChange: (patch: Partial<FoodItem>) => void;
  onRemove: () => void;
}) {
  const portionBase = useRef(item);
  function grams(value: number) {
    const base = portionBase.current;
    if (value <= 0) {
      onChange({ grams: value });
      return;
    }
    const factor = base.grams > 0 ? value / base.grams : 1;
    onChange({
      grams: value,
      kcalLow: Math.round(base.kcalLow * factor),
      kcalHigh: Math.round(base.kcalHigh * factor),
      protein: Math.round(base.protein * factor * 10) / 10,
      carbs: Math.round(base.carbs * factor * 10) / 10,
      fat: Math.round(base.fat * factor * 10) / 10,
    });
  }
  return (
    <fieldset className="food-component">
      <legend>Food component {index + 1}</legend>
      <div className="wellness-row">
        <span className="wellness-tag">
          {item.basis === "reference"
            ? "Reference estimate ±20%"
            : item.basis === "ai-estimate"
              ? "AI estimate · check carefully"
              : "Manually entered"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          aria-label={`Remove food component ${index + 1}`}
        >
          <Trash2 size={16} />
        </Button>
      </div>
      <label>
        Use a reference food (optional)
        <select
          value=""
          onChange={(e) => {
            const reference = referenceItem(e.target.value, item.grams || 100);
            if (reference) onChange(reference);
          }}
        >
          <option value="">Choose a plain food reference…</option>
          {foodReferences.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <div className="wellness-fields">
        <label>
          Food name
          <input
            required
            maxLength={100}
            value={item.name}
            onChange={(e) =>
              onChange({ name: e.target.value, basis: "manual" })
            }
          />
        </label>
        <label>
          Portion (g)
          <input
            type="number"
            required
            min="0.1"
            max="5000"
            step="0.1"
            value={item.grams}
            onFocus={() => {
              portionBase.current = { ...item };
            }}
            onChange={(e) => grams(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="wellness-fields">
        <label>
          Calories lower (kcal)
          <input
            type="number"
            required
            min="0"
            max="20000"
            value={item.kcalLow}
            onChange={(e) =>
              onChange({ kcalLow: Number(e.target.value), basis: "manual" })
            }
          />
        </label>
        <label>
          Calories upper (kcal)
          <input
            type="number"
            required
            min={item.kcalLow}
            max="20000"
            value={item.kcalHigh}
            onChange={(e) =>
              onChange({ kcalHigh: Number(e.target.value), basis: "manual" })
            }
          />
        </label>
      </div>
      <div className="wellness-fields three">
        {(["protein", "carbs", "fat"] as const).map((field) => (
          <label key={field}>
            {field === "protein"
              ? "Protein"
              : field === "carbs"
                ? "Carbohydrates"
                : "Fat"}{" "}
            (g)
            <input
              type="number"
              required
              min="0"
              max="1000"
              step="0.1"
              value={item[field]}
              onChange={(e) =>
                onChange({ [field]: Number(e.target.value), basis: "manual" })
              }
            />
          </label>
        ))}
      </div>
      {item.basis === "reference" ? (
        <p className="helper">
          Rounded USDA reference values for this plain food. Added oil, sauces
          and cooking differences need separate components; ±20% is a display
          assumption, not a measured confidence interval.
        </p>
      ) : null}
    </fieldset>
  );
}
