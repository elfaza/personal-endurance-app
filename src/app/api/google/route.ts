import { NextResponse } from "next/server";
import { api, COOKIE } from "@/lib/server/auth";
import { beginAuthorization, OAUTH_COOKIE } from "@/lib/google-sheets/oauth";
export const runtime = "nodejs";
export const POST = api(async (req) => {
  const started = beginAuthorization(req.cookies.get(COOKIE)?.value);
  const response = NextResponse.redirect(started.url, 303);
  response.cookies.set(OAUTH_COOKIE, started.cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
});
