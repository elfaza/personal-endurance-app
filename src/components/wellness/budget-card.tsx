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
        aria-label="AI allowance allocated"
      />
      <div className="wellness-row helper">
        <span>
          {money(budget.usedIdr)} of {money(budget.limitIdr)} allocated ·{" "}
          {percent}%
        </span>
        <span>Resets {dateLabel(budget.resetsOn)} WIB</span>
      </div>
      <p className="helper">
        Settled estimate:{" "}
        {money(
          budget.settledIdr ?? Math.max(0, budget.usedIdr - budget.reservedIdr),
        )}
        . Held for pending or unverified requests: {money(budget.reservedIdr)}.{" "}
        This app allowance is an estimate, not an OpenAI invoice.
      </p>
      {budget.lastFailure ? (
        <details>
          <summary>Last AI request issue</summary>
          <p className="helper">{budget.lastFailure.summary}</p>
          <p className="helper">
            {budget.lastFailure.allowanceHeld
              ? "Its allowance is still held pending review."
              : "Its budget record is settled; it is not held as pending."}
          </p>
          {budget.lastFailure.reference ? (
            <p className="helper" style={{ overflowWrap: "anywhere" }}>
              Reference: {budget.lastFailure.reference}
            </p>
          ) : null}
        </details>
      ) : null}
      {budget.blocked ? (
        <p className="wellness-notice" role="status">
          AI is paused. The remaining allowance cannot cover another request, or
          usage needs review. Manual logging and saved reports remain available.
        </p>
      ) : budget.warning ? (
        <p className="wellness-notice" role="status">
          At least 80% of this month’s allowance is allocated. No automatic
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
