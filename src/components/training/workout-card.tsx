"use client";
import {
  ArrowUpRight,
  Bike,
  Check,
  Coffee,
  Footprints,
  Timer,
} from "lucide-react";
import { expectedActivityCount, type Workout } from "@/lib/domain";
import { dateLabel } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
export function SportIcon({
  type,
  size = 20,
}: {
  type: string;
  size?: number;
}) {
  return /Cycl|Bike|cycling/.test(type) ? (
    <Bike size={size} />
  ) : type === "Rest Day" ? (
    <Coffee size={size} />
  ) : (
    <Footprints size={size} />
  );
}
export function WorkoutCard({
  workout: w,
  onClick,
  compact = false,
}: {
  workout: Workout;
  onClick: () => void;
  compact?: boolean;
}) {
  const cycling = /Cycl|Bike/.test(w.type);
  const rest = w.type === "Rest Day";
  return (
    <button
      className={`workout-card ${compact ? "compact" : ""} ${cycling ? "cycling" : rest ? "rest" : "running"} ${w.status === "Rescheduled" ? "rescheduled" : ""}`}
      onClick={onClick}
    >
      <div className="workout-top">
        <span className="sport-icon">
          <SportIcon type={w.type} size={compact ? 16 : 20} />
        </span>
        <span
          className={`status-badge status-${w.status.toLowerCase().replaceAll(" ", "-")}`}
        >
          {w.status === "Completed" ? <Check size={11} /> : null}
          {w.status}
        </span>
      </div>
      <span className="workout-type">
        {w.type}
        {w.optional ? " · Optional" : ""}
      </span>
      <strong>{w.title}</strong>
      {expectedActivityCount(w) === 2 &&
      (w.linkedActivityIds?.length ?? 0) > 0 ? (
        <span className="commute-progress">
          {w.linkedActivityIds?.length} of 2{" "}
          {w.type === "Bike-to-Work" ? "rides" : "activities"} completed
        </span>
      ) : null}
      <div className="workout-meta">
        {!rest ? (
          <>
            <span>
              {w.distanceKm != null ? (
                <>
                  <b>{formatNumber(w.distanceKm, 2)}</b> km
                </>
              ) : w.durationMin ? (
                `${formatNumber(w.durationMin, 1)} min`
              ) : w.durationText ? (
                `${w.durationText} min`
              ) : (
                "Open target"
              )}
            </span>
            {w.time ? (
              <span>
                <Timer size={12} />
                {w.time}
              </span>
            ) : null}
          </>
        ) : (
          <span>Recover for what’s next</span>
        )}
      </div>
      {!compact ? (
        <div className="workout-bottom">
          <span>
            {dateLabel(w.date, {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </span>
          <ArrowUpRight size={16} />
        </div>
      ) : null}
    </button>
  );
}
