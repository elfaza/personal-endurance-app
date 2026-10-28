import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/lib/server/auth";
import { saveWellness, wellnessBody } from "@/lib/server/wellness-store";
import { getWellness } from "@/lib/server/wellness-ai";

export const dynamic = "force-dynamic";
export const GET = api(async () => NextResponse.json(await getWellness()));
export const POST = api(async (req) => {
  const op = z.string().uuid().parse(req.headers.get("idempotency-key"));
  return NextResponse.json(await saveWellness(await wellnessBody(req), op));
});
