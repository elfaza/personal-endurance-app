"use client";
import { CalendarDays } from "lucide-react";
import { addDays, localDate, weekStart } from "@/lib/dates";
export type DateRange = { preset: string; start: string; end: string };
export function initialRange(): DateRange {
  const start = weekStart(localDate());
  return { preset: "week", start, end: addDays(start, 6) };
}
export function DateFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  function preset(preset: string) {
    const today = localDate();
    const start = weekStart(today);
    onChange({
      preset,
      start:
        preset === "week"
          ? start
          : preset === "4weeks"
            ? addDays(start, -21)
            : preset === "3months"
              ? addDays(today, -89)
              : value.start,
      end: preset === "week" ? addDays(start, 6) : today,
    });
  }
  return (
    <div className="date-filter">
      <CalendarDays size={15} />
      <select
        aria-label="Time range"
        value={value.preset}
        onChange={(e) => preset(e.target.value)}
      >
        <option value="week">This week</option>
        <option value="4weeks">Last 4 weeks</option>
        <option value="3months">Last 3 months</option>
        <option value="custom">Custom range</option>
      </select>
      {value.preset === "custom" ? (
        <div className="custom-dates">
          <input
            aria-label="Start date"
            type="date"
            value={value.start}
            max={value.end}
            onChange={(e) => {
              if (e.target.value && e.target.value <= value.end)
                onChange({ ...value, start: e.target.value });
            }}
          />
          <span>—</span>
          <input
            aria-label="End date"
            type="date"
            value={value.end}
            min={value.start}
            onChange={(e) => {
              if (e.target.value && e.target.value >= value.start)
                onChange({ ...value, end: e.target.value });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
