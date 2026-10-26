import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertOrigin,
  authConfigured,
  COOKIE,
  equal,
  errorResponse,
  jsonBody,
  makeSession,
} from "@/lib/server/auth";
import { AppError } from "@/lib/server/errors";
// One-user app: global throttle avoids trusting spoofable forwarding headers.
let failures = 0;
let windowStart = 0;
export async function POST(req: NextRequest) {
  try {
    assertOrigin(req);
    if (!authConfigured())
      throw new AppError(
        "Configure APP_PASSWORD (16+ characters) and SESSION_SECRET (32+ characters) in the server environment.",
        503,
      );
    if (Date.now() - windowStart > 15 * 60_000) {
      windowStart = Date.now();
      failures = 0;
    }
    if (failures >= 10)
      throw new AppError(
        "Too many sign-in attempts. Try again in 15 minutes.",
        429,
      );
    const { password } = z
      .object({ password: z.string().max(1024) })
      .parse(await jsonBody(req));
    if (!equal(password, process.env.APP_PASSWORD!)) {
      failures++;
      throw new AppError("That password is incorrect.", 401);
    }
    failures = 0;
    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE, makeSession(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 24 * 3600,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(req: NextRequest) {
  try {
    assertOrigin(req);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set("pe_google_state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/google",
      maxAge: 0,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (e) {
    return errorResponse(e);
  }
}
