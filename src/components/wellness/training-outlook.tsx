"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Sparkles,
  Activity,
  CalendarRange,
  Info,
} from "lucide-react";
import { useWellness } from "./use-wellness";
import { BudgetCard } from "./budget-card";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { request, useTraining } from "../providers";
import { money } from "@/lib/wellness";
import { dateLabel } from "@/lib/dates";

export function TrainingOutlook() {
  const { data, error, mutate, disabled } = useWellness();
  const { notify } = useTraining();
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  async function generate() {
    setConsent(false);
    setBusy(true);
    setFailure("");
    try {
      await request("/api/wellness/ai", { kind: "review", consent: true });
      await mutate();
      notify("Training review ready");
    } catch (e) {
      setFailure((e as Error).message);
      await mutate();
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section className="panel padded outlook-panel">
        <h2>Training outlook</h2>
        <p className="helper" role={error ? "alert" : "status"}>
          {error?.message ?? "Gathering your training context…"}
        </p>
        {error ? (
          <Button variant="outline" onClick={() => void mutate()}>
            Try again
          </Button>
        ) : null}
      </section>
    );
  const o = data.outlook,
    review = data.review,
    stale = !!review && review.inputHash !== data.inputHash;
  const delta = o.previousMinutes
    ? ((o.minutes - o.previousMinutes) / o.previousMinutes) * 100
    : null;
  return (
    <section
      className="panel padded outlook-panel"
      aria-label="Training outlook"
    >
      <div className="wellness-section-heading">
        <div>
          <span className="eyebrow">
            <Activity size={15} className="inline-icon" /> THE STORY BEHIND YOUR
            SESSIONS
          </span>
          <h2>Training outlook</h2>
          <p className="helper">
            Your last 7 days · {dateLabel(o.start)}–{dateLabel(o.today)} ·
            recorded data
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setConsent(true)}
          disabled={
            disabled ||
            !data.aiAvailable ||
            data.budget.blocked ||
            busy ||
            (!!review && !stale)
          }
        >
          <Sparkles size={16} />
          {busy
            ? "Reviewing…"
            : review && !stale
              ? "Review up to date"
              : review
                ? "Update AI review"
                : "Generate AI review"}
        </Button>
      </div>
      <div className="outlook-metrics">
        <div>
          <span>Recorded sessions</span>
          <strong>
            {o.sessions}
            <small> vs {o.previousSessions}</small>
          </strong>
          <p>Previous 7 days</p>
        </div>
        <div>
          <span>Recorded time</span>
          <strong>
            {Math.round(o.minutes)}
            <small> min</small>
          </strong>
          <p>
            {delta == null
              ? "No previous duration baseline"
              : `${delta >= 0 ? "+" : ""}${Math.round(delta)}% vs previous 7 days`}
            {o.missingDuration
              ? ` · ${o.missingDuration} missing duration`
              : ""}
          </p>
        </div>
        <div>
          <span>Required sessions done</span>
          <strong>
            {o.completed}
            <small> / {o.required}</small>
          </strong>
          <p>Due in this period · optional excluded</p>
        </div>
        <div>
          <span>Session-RPE load</span>
          <strong>
            {o.load == null ? "—" : Math.round(o.load)}
            <small>{o.load == null ? "" : " AU"}</small>
          </strong>
          <p>
            Duration × journal RPE · {o.loadCoverage}/{o.sessions} sessions
            measured
          </p>
        </div>
      </div>
      <div className="outlook-columns">
        <div className="outlook-forecast">
          <h3>
            <CalendarRange size={18} /> If your remaining plan happens
          </h3>
          <p className="helper">
            This month’s recorded distance + future distance targets. A schedule
            scenario, not a fitness prediction.
          </p>
          {o.forecasts.map((f) => (
            <div className="outlook-sport" key={f.sport}>
              <div className="wellness-row">
                <span>{f.sport === "running" ? "Running" : "Cycling"}</span>
                <strong>{f.ifPlanCompletedKm.toFixed(1)} km</strong>
              </div>
              <p>
                {f.recordedKm.toFixed(1)} recorded + {f.plannedKm.toFixed(1)}{" "}
                planned
              </p>
              {f.missingTargets || f.missingActualDistance ? (
                <p className="helper">
                  Incomplete: {f.missingTargets} future sessions without
                  distance targets; {f.missingActualDistance} recorded
                  activities without distance.
                </p>
              ) : !f.remainingSessions ? (
                <p className="helper">
                  No remaining sessions planned this month.
                </p>
              ) : null}
            </div>
          ))}
        </div>
        <div>
          <h3>Context & consistency</h3>
          <div className="outlook-weeks" aria-label="Sessions by calendar week">
            {o.weeks.map((w) => (
              <div key={w.start}>
                <span>{dateLabel(w.start)}</span>
                <div className="outlook-week-bar">
                  <span
                    style={{ width: `${Math.min(100, w.sessions * 10)}%` }}
                  />
                </div>
                <strong>{w.sessions}</strong>
              </div>
            ))}
          </div>
          <p className="helper">
            Sessions per calendar week. Current week is incomplete.
          </p>
          <p className="helper">
            Journal averages (1–5): fatigue {o.fatigue ?? "—"}, soreness{" "}
            {o.soreness ?? "—"}, sleep quality {o.sleepQuality ?? "—"}. Missing
            responses stay unknown.
          </p>
          {!data.profile ? (
            <Link className="text-link" href="/settings#personal-profile">
              Add your personal context <ArrowRight size={15} />
            </Link>
          ) : null}
          <Link className="text-link" href="/analytics">
            Explore training analytics <ArrowRight size={15} />
          </Link>
        </div>
      </div>
      {o.goals.length ? (
        <details className="outlook-evidence">
          <summary>Goal outlook · recorded evidence</summary>
          {o.goals.map((g, index) => (
            <p key={`${g.title}-${index}`}>
              <strong>{g.title}</strong> · {g.distanceKm} km · {g.targetMonth}
              <br />
              <span className="helper">
                Longest recorded run in the last 28 days:{" "}
                {g.longestRecentRunKm == null
                  ? "not available"
                  : `${g.longestRecentRunKm.toFixed(1)} km`}
                . A distance milestone does not establish race readiness or
                finish time.
              </span>
            </p>
          ))}
        </details>
      ) : null}
      {review ? (
        <div className="outlook-review">
          <div className="wellness-row">
            <span className="wellness-label">
              <Sparkles size={17} /> Your AI review
            </span>
            <span className={`wellness-tag ${stale ? "tag-warning" : ""}`}>
              {stale ? "New data · update available" : "Matches current data"}
            </span>
          </div>
          <p className="helper">
            {new Intl.DateTimeFormat("en-GB", {
              timeZone: "Asia/Jakarta",
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(review.generatedAt))}{" "}
            WIB · {review.model}
          </p>
          <p className="outlook-summary">{review.summary}</p>
          {review.insights.map((i, index) => (
            <div className="outlook-insight" key={index}>
              <strong>{i.observation}</strong>
              <p className="helper">Basis: {i.evidence}</p>
            </div>
          ))}
          {review.limitations.length ? (
            <details>
              <summary>Assumptions & missing data</summary>
              <ul>
                {review.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <p className="helper">
            AI interpretation can be wrong. Check it against the recorded
            figures above.
          </p>
        </div>
      ) : (
        <div className="outlook-empty">
          <Sparkles size={22} />
          <div>
            <strong>A clearer picture, when you need it.</strong>
            <p className="helper">
              Generate a review to connect your progress, goals and logged
              context. Opening this page never spends AI credit.
            </p>
          </div>
        </div>
      )}
      {failure ? (
        <p className="form-error" role="alert">
          {failure}
        </p>
      ) : null}
      {data.aiReason ? (
        <p className="helper">
          <Info size={15} className="inline-icon" />
          {data.aiReason}
        </p>
      ) : null}
      <BudgetCard budget={data.budget} compact />
      <Dialog
        open={consent}
        onOpenChange={setConsent}
        title="Generate your training review?"
        description="You control what gets sent and when."
      >
        <div className="wellness-form">
          <p>
            This sends your calculated training summary, goals, optional
            age/height, recent weight history and logged food totals to OpenAI.
            Your birth date and food photos are excluded from this review.
          </p>
          <p className="helper">
            Up to {money(data.budget.reservePerCall)} is reserved first. Actual
            verified usage replaces the reservation. The app stops new requests
            when the monthly allowance is insufficient. OpenAI’s data-processing
            policies apply.
          </p>
          <div className="wellness-actions">
            <Button variant="outline" onClick={() => setConsent(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                disabled || !data.aiAvailable || data.budget.blocked || busy
              }
              onClick={() => void generate()}
            >
              Agree & generate review
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
