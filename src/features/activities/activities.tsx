"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Footprints, Search } from "lucide-react";
import { useTraining } from "@/components/providers";
import { SportIcon } from "@/components/training/workout-card";
import { dateLabel, duration, pace } from "@/lib/dates";
export function Activities() {
  const { data } = useTraining();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  if (!data) return null;
  const commuteIds = new Set(
    data.links
      .filter(
        (l) =>
          data.workouts.find((w) => w.id === l.workoutId)?.type ===
          "Bike-to-Work",
      )
      .map((l) => l.activityId),
  );
  const activities = data.activities
    .filter(
      (a) =>
        a.title.toLowerCase().includes(search.toLowerCase()) &&
        (type === "all" || type === "commute"
          ? type === "all" || commuteIds.has(a.id)
          : a.type === type) &&
        (!start || a.date >= start) &&
        (!end || a.date <= end) &&
        (!min || (a.distanceKm != null && a.distanceKm >= Number(min))) &&
        (!max || (a.distanceKm != null && a.distanceKm <= Number(max))),
    )
    .toSorted((a, b) => b.startedAt.localeCompare(a.startedAt));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EVERY EFFORT HAS A STORY</div>
          <h1>
            Your activities<span className="accent">.</span>
          </h1>
          <p>Runs, rides, and the miles in between. Recorded by you.</p>
        </div>
        <span className="count-pill">{activities.length} activities</span>
      </div>
      <div className="activity-filters panel">
        <div className="search-input">
          <Search size={17} />
          <input
            type="search"
            aria-label="Search activities"
            placeholder="Search your activities…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label>
          Sport
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All activities</option>
            <option value="running">Running</option>
            <option value="cycling">Cycling</option>
            <option value="commute">Bike-to-Work (linked)</option>
            <option value="walking">Walking</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          From
          <input
            aria-label="Activity start date"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            aria-label="Activity end date"
            type="date"
            value={end}
            min={start}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <label>
          Min km
          <input
            type="number"
            min="0"
            step=".1"
            placeholder="Any"
            value={min}
            onChange={(e) => setMin(e.target.value)}
          />
        </label>
        <label>
          Max km
          <input
            type="number"
            min="0"
            step=".1"
            placeholder="Any"
            value={max}
            onChange={(e) => setMax(e.target.value)}
          />
        </label>
      </div>
      <div className="activity-table panel">
        <div className="activity-table-head">
          <span>ACTIVITY</span>
          <span>DISTANCE</span>
          <span>TIME</span>
          <span>PACE / SPEED</span>
          <span>AVG HR</span>
          <span />
        </div>
        {activities.map((a) => (
          <Link
            href={`/activities/${a.id}`}
            className="activity-row"
            key={a.id}
          >
            <div className="activity-title">
              <span
                className={`sport-icon ${a.type === "cycling" ? "purple" : "lime"}`}
              >
                <SportIcon type={a.type} />
              </span>
              <div>
                <strong>{a.title}</strong>
                <span>
                  {dateLabel(a.date, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}{" "}
                  · {a.rawType.replaceAll("_", " ")}
                  {data.links.some((l) => l.activityId === a.id)
                    ? " · Linked"
                    : ""}
                </span>
              </div>
            </div>
            <span className="activity-distance">
              {a.distanceKm?.toFixed(2) ?? "—"}
              <small> km</small>
            </span>
            <span>{duration(a.durationSec)}</span>
            <span>
              {a.type === "running"
                ? `${pace(a.paceSecKm)} /km`
                : a.distanceKm != null && a.durationSec
                  ? `${(a.distanceKm / (a.durationSec / 3600)).toFixed(1)} km/h`
                  : "—"}
            </span>
            <span>
              {a.avgHr ?? "—"}
              <small> bpm</small>
            </span>
            <ArrowUpRight size={17} />
          </Link>
        ))}
        {!activities.length ? (
          <div className="empty-state">
            <Footprints size={32} />
            <h3>No activities here yet</h3>
            <p>
              Try another filter or sync Garmin after your next session uploads
              to Connect.
            </p>
          </div>
        ) : null}
      </div>
      <p className="helper">
        Garmin activities are read-only. Bike-to-work classification comes from
        your linked training plan. Missing measurements are shown as —.
      </p>
    </>
  );
}
