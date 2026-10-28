import { NextResponse } from "next/server";
import { api } from "@/lib/server/auth";
import { reconcileTracker } from "@/lib/server/service";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = api(async () =>
  NextResponse.json(await reconcileTracker()),
);
