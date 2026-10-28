"use client";
import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import {
  ArrowLeft,
  Download,
  Heart,
  Link2,
  Mountain,
  NotebookPen,
  Timer,
} from "lucide-react";
import type { Activity, Workout } from "@/lib/domain";
import {
  activityIdsForLink,
  expectedActivityCount,
  activityFitsWorkout,
  sport,
} from "@/lib/domain";
import {
  request,
  useTraining,
  useEditingDisabled,
} from "@/components/providers";
import { Button } from "@/components/ui/button";
import { SportIcon } from "@/components/training/workout-card";
import { WorkoutEditor } from "@/components/training/workout-editor";
import { dateLabel, duration, pace } from "@/lib/dates";
import { feedbackForActivity } from "@/lib/measurements";
export function ActivityDetail({ id }: { id: string }) {
  const { data, offline, save, notify } = useTraining();
  const editingDisabled = useEditingDisabled();
  const cached = data?.activities.find((a) => a.id === id);
  const [editor, setEditor] = useState<Workout>();
  const [linkId, setLinkId] = useState("");
  const [linking, setLinking] = useState(false);
  const {
    data: detail,
    error,
    isLoading,
  } = useSWR<Activity>(
    cached && cached.source !== "sheet" && !offline
      ? `/api/activities/${id}`
      : null,
    (url) => request<Activity>(url),
    { revalidateOnFocus: false, errorRetryCount: 1 },
  );
  const a = detail ?? cached;
  if (!data) return null;
  if (!a)
    return (
      <div className="empty-state">
        <h1>Activity not found</h1>
        <Link href="/activities">Back to activity history</Link>
      </div>
    );
  const link = data.links.find((l) => activityIdsForLink(l).includes(id));
  const workout = data.workouts.find(
    (w) => w.id === (a.sourceWorkoutId ?? link?.workoutId),
  );
  const comparableTargets =
    !workout?.allowMixedSports || sport(workout.type) === a.type;
  const feedback = a.sourceWorkoutId
    ? data.feedback.find(
        (f) => f.workoutId === a.sourceWorkoutId && f.scope !== "activity",
      )
    : feedbackForActivity(data, id);
  async function linkActivity() {
    const w = data!.workouts.find((w) => w.id === linkId);
    if (!w) return;
    setLinking(true);
    try {
      await save({
        action: "link",
        id: w.id,
        revision: w.revision,
        activityId: id,
      });
      notify("Activity linked to your training plan");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setLinking(false);
    }
  }
  return (
    <>
      <Link href="/activities" className="back-link">
        <ArrowLeft size={15} />
        All activities
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {a.source === "sheet"
              ? "GOOGLE SHEETS · MANUAL RESULT"
              : a.source === "demo"
                ? "DEMO ACTIVITY"
                : "GARMIN CONNECT"}{" "}
            · {a.rawType.replaceAll("_", " ")}
          </div>
          <h1>
            {a.title}
            <span className="accent">.</span>
          </h1>
          <p>
            {dateLabel(a.date, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            ·{" "}
            {a.timeKnown === false
              ? "Time not recorded"
              : new Intl.DateTimeFormat("en-GB", {
                  timeZone: "Asia/Jakarta",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(a.startedAt))}{" "}
            {a.timeKnown === false ? "" : "WIB"}
          </p>
        </div>
        {data.mode === "live" && a.source === "garmin" ? (
          <Button asChild variant="outline">
            <a href={`/api/activities/${id}/download`}>
              <Download size={16} />
              Original activity ZIP
            </a>
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="form-error">
          {error.message} Showing the last synchronized summary.
        </p>
      ) : null}
      {isLoading ? (
        <p className="helper">Fetching available details from Garmin…</p>
      ) : null}
      <div className="detail-metrics">
        {[
          {
            icon: <SportIcon type={a.type} />,
            label: "DISTANCE",
            value: a.distanceKm?.toFixed(2) ?? "—",
            unit: "km",
          },
          {
            icon: <Timer size={20} />,
            label: "DURATION",
            value: duration(a.durationSec),
            unit: "",
          },
          {
            icon: <Heart size={20} />,
            label: "AVG / MAX HEART RATE",
            value: `${a.avgHr ?? "—"} / ${a.maxHr ?? "—"}`,
            unit: "bpm",
          },
          {
            icon: <Mountain size={20} />,
            label: "ELEVATION GAIN",
            value: String(a.elevationM ?? "—"),
            unit: "m",
          },
        ].map((m) => (
          <div className="panel metric-card" key={m.label}>
            <div className="metric-label">
              <span>{m.label}</span>
              {m.icon}
            </div>
            <div className="metric-value">
              {m.value}
              <span>{m.unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="detail-grid">
        <section className="panel padded">
          <div className="section-title">
            <div>
              <span className="eyebrow">RECORDED EFFORT</span>
              <h2>Session details</h2>
            </div>
          </div>
          <dl className="detail-list">
            <div>
              <dt>{a.type === "running" ? "Average pace" : "Average speed"}</dt>
              <dd>
                {a.type === "running"
                  ? `${pace(a.paceSecKm)} /km`
                  : a.durationSec && a.distanceKm
                    ? `${((a.distanceKm / a.durationSec) * 3600).toFixed(1)} km/h`
                    : "—"}
              </dd>
            </div>
            <div>
              <dt>Moving time</dt>
              <dd>{duration(a.movingSec)}</dd>
            </div>
            <div>
              <dt>Personal RPE</dt>
              <dd>{feedback?.rpe ? `${feedback.rpe} / 10` : "Not recorded"}</dd>
            </div>
            <div>
              <dt>Activity ID</dt>
              <dd>{a.id}</dd>
            </div>
          </dl>
          <p className="helper">
            {feedback?.scope === "activity"
              ? "RPE from this activity’s journal."
              : "RPE from the shared training-session journal, when available."}
            {a.source === "sheet"
              ? " Measurements were entered in Training Plan; they are not Garmin recordings."
              : ""}
          </p>
          <h3 className="subheading">Available split summaries</h3>
          {a.splits.length ? (
            <div className="split-table">
              <div>
                <span>Split</span>
                <span>Distance</span>
                <span>Duration</span>
                <span>Avg HR</span>
              </div>
              {a.splits.map((s, i) => (
                <div key={i}>
                  <span>{s.index}</span>
                  <span>{s.distanceKm.toFixed(2)} km</span>
                  <span>{duration(s.durationSec)}</span>
                  <span>{s.avgHr ?? "—"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="helper">
              No split summaries were supplied for this activity.
            </p>
          )}
          <h3 className="subheading">Heart rate zones</h3>
          {a.hrZones.length ? (
            <div className="zone-list">
              {a.hrZones.map((z) => (
                <div key={z.zone}>
                  <span>Zone {z.zone}</span>
                  <div className="progress-track">
                    <div
                      style={{
                        width: `${Math.min(100, (z.seconds / Math.max(1, a.durationSec ?? z.seconds)) * 100)}%`,
                      }}
                    />
                  </div>
                  <strong>{duration(z.seconds)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="helper">
              Heart rate zone durations are not available for this activity.
            </p>
          )}
        </section>
        <div>
          <section className="panel padded">
            <span className="eyebrow">
              <Link2 size={14} /> THE PLAN & THE EFFORT
            </span>
            <h2>{workout ? workout.title : "Connect the dots"}</h2>
            {workout ? (
              <>
                {(workout.linkedActivityIds?.length ?? 0) > 1 ? (
                  <div className="helper">
                    <strong>Linked activities</strong>
                    {workout.linkedActivityIds?.map((activityId) => (
                      <p key={activityId}>
                        <Link href={`/activities/${activityId}`}>
                          {data.activities.find(
                            (record) => record.id === activityId,
                          )?.title ?? activityId}
                        </Link>
                      </p>
                    ))}
                    <p>Measurements below describe this recorded activity.</p>
                  </div>
                ) : null}
                <div className="comparison">
                  <span>Distance</span>
                  <span>
                    Planned{" "}
                    <strong>
                      {comparableTargets ? (workout.distanceKm ?? "—") : "—"} km
                    </strong>
                  </span>
                  <span>
                    Actual <strong>{a.distanceKm?.toFixed(2) ?? "—"} km</strong>
                  </span>
                </div>
                <div className="comparison">
                  <span>Duration</span>
                  <span>
                    Planned{" "}
                    <strong>
                      {comparableTargets ? (workout.durationMin ?? "—") : "—"}{" "}
                      min
                    </strong>
                  </span>
                  <span>
                    Actual <strong>{duration(a.durationSec)}</strong>
                  </span>
                </div>
                {comparableTargets &&
                workout.distanceKm != null &&
                a.distanceKm != null ? (
                  <p className="helper">
                    {a.distanceKm - workout.distanceKm >= 0 ? "+" : ""}
                    {(a.distanceKm - workout.distanceKm).toFixed(2)} km compared
                    with the planned target.
                  </p>
                ) : null}
                <Button variant="outline" onClick={() => setEditor(workout)}>
                  Edit plan or unlink activity
                </Button>
              </>
            ) : (
              <>
                <p className="helper">
                  Link this effort to a planned session to compare your targets
                  with what happened.
                </p>
                <label>
                  Planned workout
                  <select
                    value={linkId}
                    onChange={(e) => setLinkId(e.target.value)}
                  >
                    <option value="">Choose a session</option>
                    {data.workouts
                      .filter(
                        (w) =>
                          activityFitsWorkout(w, a) &&
                          (!w.linkedActivityId ||
                            (expectedActivityCount(w) === 2 &&
                              (w.linkedActivityIds?.length ?? 0) < 2)) &&
                          w.status !== "Rescheduled" &&
                          w.status !== "Skipped" &&
                          w.type !== "Rest Day",
                      )
                      .toSorted((a, b) => b.date.localeCompare(a.date))
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.date} · {w.title}
                        </option>
                      ))}
                  </select>
                </label>
                <Button
                  disabled={!linkId || editingDisabled || linking}
                  onClick={() => void linkActivity()}
                >
                  <Link2 size={15} />
                  {linking ? "Linking…" : "Link recorded activity"}
                </Button>
              </>
            )}
          </section>
          <section className="panel padded journal-preview">
            <span className="eyebrow">
              <NotebookPen size={14} /> YOUR FIELD NOTES
            </span>
            <h2>How it felt</h2>
            <p>
              {feedback?.notes ||
                "No notes yet. A few words after training can tell you as much as the numbers."}
            </p>
            {workout ? (
              <Button variant="ghost" onClick={() => setEditor(workout)}>
                Open workout journal
              </Button>
            ) : (
              <p className="helper">
                Link a planned session to add a workout journal.
              </p>
            )}
          </section>
        </div>
      </div>
      {editor ? (
        <WorkoutEditor
          open
          onClose={() => setEditor(undefined)}
          workout={editor}
        />
      ) : null}
    </>
  );
}
