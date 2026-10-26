import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";
import { configuration } from "./config";
export const COOKIE = "pe_session";
function secret() {
  return process.env.SESSION_SECRET ?? "";
}
export function authConfigured() {
  return (process.env.APP_PASSWORD?.length ?? 0) >= 16 && secret().length >= 32;
}
export function equal(a: string, b: string) {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
function signature(value: string) {
  return createHmac(
    "sha256",
    `${secret()}:${createHash("sha256")
      .update(process.env.APP_PASSWORD ?? "")
      .digest("hex")}`,
  )
    .update(value)
    .digest("base64url");
}
export function makeSession() {
  const expires = String(Date.now() + 7 * 24 * 3600_000);
  return `${expires}.${signature(expires)}`;
}
export function validSession(token: string | undefined) {
  if (!authConfigured() || !token) return false;
  const [expires, mac] = token.split(".");
  return (
    !!mac &&
    /^\d+$/.test(expires) &&
    Number(expires) > Date.now() &&
    equal(mac, signature(expires))
  );
}
export async function signedIn() {
  return validSession((await cookies()).get(COOKIE)?.value);
}
export function authRequired() {
  return (
    authConfigured() ||
    process.env.NODE_ENV === "production" ||
    configuration().mode === "live"
  );
}
function requestOrigin(req: NextRequest) {
  return req.headers.get("host")
    ? `${req.nextUrl.protocol}//${req.headers.get("host")}`
    : req.nextUrl.origin;
}
export function assertOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const configuredOrigin = process.env.APP_ORIGIN ?? process.env.APP_URL;
  const expected = configuredOrigin
    ? new URL(configuredOrigin).origin
    : requestOrigin(req);
  if (!origin || origin !== expected)
    throw new AppError("Request origin did not match this application.", 403);
}
export function authorize(req: NextRequest) {
  if (authRequired()) {
    if (!authConfigured())
      throw new AppError(
        "Set APP_PASSWORD (16+ characters) and SESSION_SECRET (32+ characters) before using live mode or a production server.",
        503,
      );
    if (!validSession(req.cookies.get(COOKIE)?.value))
      throw new AppError("Sign in to continue.", 401);
  } else if (
    !["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(requestOrigin(req)).hostname,
    )
  )
    throw new AppError(
      "Set an app password and session secret before accessing this app over the network.",
      403,
    );
  if (!["GET", "HEAD"].includes(req.method)) assertOrigin(req);
}
export function api(handler: (req: NextRequest) => Promise<Response>) {
  return async (req: NextRequest) => {
    try {
      authorize(req);
      const response = await handler(req);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  };
}
export function errorResponse(error: unknown) {
  const status =
    error instanceof AppError
      ? error.status
      : error instanceof ZodError
        ? 400
        : 500;
  const message =
    error instanceof AppError
      ? error.message
      : error instanceof ZodError
        ? "Some values are invalid. Check dates, numbers and required fields."
        : "The request could not be completed. Your saved data has been preserved.";
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export async function jsonBody(req: NextRequest) {
  if (Number(req.headers.get("content-length") ?? 0) > 64000)
    throw new AppError("Request is too large.", 413);
  const body = await req.text();
  if (body.length > 64000) throw new AppError("Request is too large.", 413);
  try {
    return JSON.parse(body);
  } catch {
    throw new AppError("Request must contain valid JSON.");
  }
}
