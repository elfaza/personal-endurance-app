import { NextResponse } from "next/server";
import { z } from "zod";
import { api, jsonBody } from "@/lib/server/auth";
import { mutate } from "@/lib/server/service";
export const POST = api(async (req) => {
  const op = z.string().uuid().parse(req.headers.get("idempotency-key"));
  return NextResponse.json(await mutate(await jsonBody(req), op));
});
