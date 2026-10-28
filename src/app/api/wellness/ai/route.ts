import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/lib/server/auth";
import { generateWellness } from "@/lib/server/wellness-ai";
import { wellnessBody } from "@/lib/server/wellness-store";
export const maxDuration = 60;
export const POST = api(async (req) =>
  NextResponse.json(
    await generateWellness(
      await wellnessBody(req),
      z.string().uuid().parse(req.headers.get("idempotency-key")),
    ),
  ),
);
