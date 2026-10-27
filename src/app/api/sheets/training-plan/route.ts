import { NextResponse } from "next/server";
import { api } from "@/lib/server/auth";
import { sheets } from "@/lib/google-sheets/client";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = api(async () => {
  await sheets.enableTrainingPlan();
  return NextResponse.json({ ok: true });
});
