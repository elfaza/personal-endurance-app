"use client";
import { Wallet, ShieldCheck } from "lucide-react";
import { money, type Budget } from "@/lib/wellness";
import { dateLabel } from "@/lib/dates";

export function BudgetCard({
  budget,
  compact = false,
}: {
  budget: Budget;
  compact?: boolean;
}) {
  const percent = Math.min(
    100,
    Math.round((budget.usedIdr / budget.limitIdr) * 100),
  );
  return (
    <section
      className={`wellness-budget ${budget.warning || budget.blocked ? "budget-warning" : ""}`}
      aria-label="Monthly AI budget"
    >
      <div className="wellness-row">
        <span className="wellness-label">
          <Wallet size={17} /> AI budget · {budget.month}
        </span>
        <strong>{money(budget.remainingIdr)} left</strong>
      </div>
      <progress
        max={budget.limitIdr}
        value={Math.min(budget.usedIdr, budget.limitIdr)}
        aria-label="AI budget used"
      />
      <div className="wellness-row helper">
        <span>
          {money(budget.usedIdr)} of {money(budget.limitIdr)} · {percent}%
        </span>
        <span>Resets {dateLabel(budget.resetsOn)} WIB</span>
      </div>
      {budget.reservedIdr > 0 ? (
        <p className="helper">
          Includes {money(budget.reservedIdr)} reserved for pending or
          unverified requests.
        </p>
      ) : null}
      {budget.blocked ? (
        <p className="wellness-notice" role="status">
          AI is paused. The remaining allowance cannot cover another request, or
          usage needs review. Manual logging and saved reports remain available.
        </p>
      ) : budget.warning ? (
        <p className="wellness-notice" role="status">
          You’ve used at least 80% of this month’s allowance. No automatic
          top-up.
        </p>
      ) : null}
      {!compact ? (
        <p className="helper">
          <ShieldCheck size={14} className="inline-icon" /> Each request
          reserves up to {money(budget.reservePerCall)} before it starts.
          Unverified requests keep that allowance. Estimates use Rp
          {budget.exchangeRate.toLocaleString("id-ID")}/USD plus a 25% buffer;
          provider taxes, price changes, other apps and card exchange rates are
          outside this app’s limit.
        </p>
      ) : null}
    </section>
  );
}
