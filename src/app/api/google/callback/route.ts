import { NextRequest, NextResponse } from "next/server";
import {
  OAUTH_COOKIE,
  exchangeCode,
  validateState,
} from "@/lib/google-sheets/oauth";
import { credentialPage } from "@/lib/google-sheets/credential-page";
import { AppError } from "@/lib/server/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    Pragma: "no-cache",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
  let response: NextResponse;
  try {
    // The Strict app session is absent on a cross-site OAuth return. This
    // short-lived, server-signed Lax proof can only be minted after app login.
    const verifier = validateState(
      req.cookies.get(OAUTH_COOKIE)?.value,
      req.nextUrl.searchParams.get("state"),
    );
    if (req.nextUrl.searchParams.has("error"))
      throw new AppError(
        "Google authorization was cancelled. Return to Google setup to try again.",
        400,
      );
    const page = credentialPage(
      await exchangeCode(req.nextUrl.searchParams.get("code") ?? "", verifier),
    );
    response = new NextResponse(page.html, {
      headers: {
        ...headers,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${page.nonce}'; style-src 'nonce-${page.nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      },
    });
  } catch (e) {
    response = new NextResponse(
      e instanceof AppError
        ? e.message
        : "Google connection could not be completed. Return to Google setup to try again.",
      {
        status: e instanceof AppError ? e.status : 503,
        headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
      },
    );
  }
  response.cookies.set(OAUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google",
    maxAge: 0,
  });
  return response;
}
