import { NextResponse } from "next/server";
import { z } from "zod";
import { api, jsonBody, errorResponse, equal } from "@/lib/server/auth";
import { syncGarmin } from "@/lib/server/service";
import { dateSchema } from "@/lib/domain";
import { AppError } from "@/lib/server/errors";
const input = z.object({
  start: dateSchema.optional(),
  end: dateSchema.optional(),
});
export const POST = api(async (req) =>
  NextResponse.json(await syncGarmin(input.parse(await jsonBody(req)))),
);
// Optional scheduler endpoint: bearer secret is separate from the browser session.
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (
      !secret ||
      secret.length < 32 ||
      !equal(req.headers.get("authorization") ?? "", `Bearer ${secret}`)
    )
      throw new AppError("Unauthorized scheduler request.", 401);
    return NextResponse.json(await syncGarmin(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
