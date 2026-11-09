import "server-only";
import { z } from "zod";
import { localDate } from "../dates";
import type { Snapshot, Change } from "../google-sheets/rows";
import type { Budget } from "../wellness";
import { record, change } from "./wellness-store";
import { AppError } from "./errors";
import {
  failureSchema,
  failureSummary,
  failureReference,
  type AiFailure,
} from "./ai-failure";

export const AI_MODEL = "gpt-6-luna";
// Standard rates rechecked 2026-11-09 against OpenAI's GPT-6 Luna model page.
// No tools, cache writes or premium tier; requests pin service_tier: default.
export const INPUT_RATE = 0.1,
  OUTPUT_RATE = 0.5;
export const MAX_INPUT_TOKENS = 131072,
  MAX_OUTPUT_TOKENS = 2048;
export const LIMIT_IDR = 20000;
export const monthKey = (date = new Date()) => localDate(date).slice(0, 7);
// Fixed conservative FX assumption, plus 25% buffer. Not a card FX guarantee.
export const EXCHANGE_RATE = 20000,
  MARGIN = 1.25;
export function costIdr(input: number, output: number) {
  return Math.ceil(
    ((input * INPUT_RATE + output * OUTPUT_RATE) / 1e6) *
      EXCHANGE_RATE *
      MARGIN,
  );
}
export const RESERVE_IDR = costIdr(MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS);
const ledgerSchema = z.object({
  usedIdr: z.number().int().nonnegative().max(1e9),
  paused: z.boolean().optional(),
});
function ledger(snapshot: Snapshot, month: string) {
  const row = record(snapshot, `budget:${month}`);
  const parsed = ledgerSchema.safeParse(row?.payload ?? { usedIdr: 0 });
  if (!parsed.success)
    throw new AppError(
      "AI spending records need review. No AI request was sent.",
      409,
    );
  return parsed.data;
}
export function budgetView(snapshot: Snapshot, now = new Date()): Budget {
  const month = monthKey(now),
    row = ledger(snapshot, month);
  const usedIdr = row.usedIdr;
  const held = snapshot.Meta.filter(
    (r) =>
      !r.deleted &&
      r.id.startsWith("wellness:request:") &&
      r.payload.month === month &&
      r.payload.status === "pending",
  );
  const reservedIdr = held.reduce(
    (sum, r) => sum + Number(r.payload.reservedIdr ?? 0),
    0,
  );
  const latestFailure = snapshot.Meta.filter(
    (r) =>
      !r.deleted &&
      r.id.startsWith("wellness:request:") &&
      r.payload.month === month &&
      r.payload.failure,
  )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((r) => ({
      row: r,
      failure: failureSchema.safeParse(r.payload.failure),
    }))
    .find((r) => r.failure.success);
  const [year, mon] = month.split("-").map(Number);
  const resetsOn = localDate(new Date(Date.UTC(year, mon, 1, 0)));
  return {
    month,
    usedIdr,
    reservedIdr,
    settledIdr: Math.max(0, usedIdr - reservedIdr),
    ...(latestFailure?.failure.success
      ? {
          lastFailure: {
            summary: failureSummary(latestFailure.failure.data),
            reference: failureReference(latestFailure.failure.data),
            allowanceHeld: latestFailure.row.payload.status === "pending",
          },
        }
      : {}),
    limitIdr: LIMIT_IDR,
    remainingIdr: Math.max(0, LIMIT_IDR - usedIdr),
    warning: usedIdr >= LIMIT_IDR * 0.8,
    blocked: usedIdr + RESERVE_IDR > LIMIT_IDR || row.paused === true,
    resetsOn,
    reservePerCall: RESERVE_IDR,
    exchangeRate: EXCHANGE_RATE,
  };
}
export function reservationChanges(
  snapshot: Snapshot,
  op: string,
  hash: string,
  kind: string,
  now = new Date(),
) {
  const budget = budgetView(snapshot, now);
  if (budget.blocked)
    throw new AppError(
      "AI is paused: the monthly budget cannot cover another request, or usage needs review. Manual entry and saved reports still work.",
      429,
    );
  return [
    change(snapshot, `budget:${budget.month}`, {
      usedIdr: budget.usedIdr + RESERVE_IDR,
    }),
    change(snapshot, `request:${op}`, {
      month: budget.month,
      hash,
      kind,
      status: "pending",
      reservedIdr: RESERVE_IDR,
      createdAt: now.toISOString(),
    }),
  ];
}
export function settlementChanges(
  snapshot: Snapshot,
  op: string,
  input: number,
  output: number,
  result?: object,
  failure?: AiFailure,
  pricingUnverified = false,
) {
  z.number().int().nonnegative().parse(input);
  z.number().int().nonnegative().parse(output);
  const request = record(snapshot, `request:${op}`);
  if (!request || request.payload.status !== "pending")
    throw new AppError(
      "This AI request has already been settled or is unavailable.",
      409,
    );
  const month = z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .parse(request.payload.month);
  const budget = ledger(snapshot, month);
  const overBound =
    input > MAX_INPUT_TOKENS || output > MAX_OUTPUT_TOKENS || pricingUnverified;
  const reserved = z.literal(RESERVE_IDR).parse(request.payload.reservedIdr);
  const charged = overBound
    ? reserved
    : Math.min(reserved, costIdr(input, output));
  return [
    change(snapshot, `budget:${month}`, {
      usedIdr: Math.max(0, budget.usedIdr - reserved + charged),
      paused: budget.paused === true || overBound,
    }),
    change(snapshot, `request:${op}`, {
      ...request.payload,
      status: result ? "completed" : "failed",
      input,
      output,
      chargedIdr: charged,
      pricingVerified: !pricingUnverified,
      ...(result ? { result } : {}),
      ...(failure ? { failure } : {}),
    }),
  ];
}

export function failureChanges(
  snapshot: Snapshot,
  op: string,
  failure: AiFailure,
  rejected: boolean,
): Change[] {
  const request = record(snapshot, `request:${op}`);
  if (!request || request.payload.status !== "pending")
    throw new AppError(
      "This AI request is no longer pending. Refresh before reviewing its allowance.",
      409,
    );
  const diagnostic = failureSchema.parse(failure);
  if (!rejected)
    return [
      change(snapshot, `request:${op}`, {
        ...request.payload,
        failure: diagnostic,
      }),
    ];
  const month = z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .parse(request.payload.month);
  const reserved = z.literal(RESERVE_IDR).parse(request.payload.reservedIdr);
  const budget = ledger(snapshot, month);
  if (budget.usedIdr < reserved)
    throw new AppError(
      "AI spending records need review. The allowance was not released.",
      409,
    );
  return [
    change(snapshot, `budget:${month}`, {
      ...budget,
      usedIdr: budget.usedIdr - reserved,
    }),
    change(snapshot, `request:${op}`, {
      ...request.payload,
      status: "rejected",
      chargedIdr: 0,
      failure: diagnostic,
    }),
  ];
}
