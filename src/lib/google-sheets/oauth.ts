import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { equal, authConfigured, validSession } from "../server/auth";
import { AppError } from "../server/errors";

export const OAUTH_COOKIE = "pe_google_state";
export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
export const oauthConfigured = () =>
  !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const oauthReady = () =>
  process.env.GOOGLE_AUTH_MODE === "oauth" &&
  oauthConfigured() &&
  !!process.env.GOOGLE_REFRESH_TOKEN;

export function appOrigin() {
  try {
    const url = new URL(process.env.APP_ORIGIN ?? "");
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        ))
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new AppError(
      "Set APP_ORIGIN to the exact HTTPS address of this app.",
      503,
    );
  }
}
export const googleCallbackUrl = () => `${appOrigin()}/api/google/callback`;
export function googleClient() {
  if (!oauthConfigured())
    throw new AppError(
      "Save GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel, then redeploy before connecting Google.",
      409,
    );
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: googleCallbackUrl(),
  });
}
function proof(value: string) {
  if (!authConfigured())
    throw new AppError(
      "Configure app authentication before connecting Google.",
      503,
    );
  return createHmac(
    "sha256",
    `${process.env.SESSION_SECRET}:${process.env.APP_PASSWORD}`,
  )
    .update(`personal-endurance-oauth:${value}`)
    .digest("base64url");
}
// Only a signed nonce is sent in the HttpOnly cookie. The PKCE verifier is
// derived on the server and never placed in a cookie, URL, log or storage.
export function beginAuthorization(session: string | undefined) {
  if (process.env.GOOGLE_AUTH_MODE !== "oauth" || !validSession(session))
    throw new AppError("Sign in before connecting Google.", 401);
  const state = randomBytes(32).toString("base64url");
  const stamp = `${Date.now()}.${state}`;
  const verifier = proof(`pkce:${stamp}`);
  const url = googleClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [SHEETS_SCOPE],
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: CodeChallengeMethod.S256,
  });
  return { url, cookie: `${stamp}.${proof(stamp)}` };
}
export function validateState(
  cookie: string | undefined,
  state: string | null,
  now = Date.now(),
) {
  if (!cookie || cookie.length > 256 || !state || state.length > 100)
    throw new AppError(
      "Google connection expired or could not be verified. Start again from Google setup.",
      400,
    );
  const [createdAt, nonce, mac, extra] = cookie.split(".");
  const stamp = `${createdAt}.${nonce}`;
  if (
    extra ||
    !mac ||
    !/^\d+$/.test(createdAt) ||
    !equal(nonce, state) ||
    !equal(mac, proof(stamp)) ||
    now - Number(createdAt) > 600000 ||
    Number(createdAt) > now + 60000
  )
    throw new AppError(
      "Google connection expired or could not be verified. Start again from Google setup.",
      400,
    );
  return proof(`pkce:${stamp}`);
}
export async function exchangeCode(code: string, verifier: string) {
  if (!code || code.length > 4096)
    throw new AppError(
      "Google did not provide a valid authorization code.",
      400,
    );
  try {
    const { tokens } = await googleClient().getToken({
      code,
      codeVerifier: verifier,
      redirect_uri: googleCallbackUrl(),
    });
    if (
      !tokens.refresh_token ||
      !tokens.scope?.split(" ").includes(SHEETS_SCOPE)
    )
      throw new AppError(
        "Google did not return offline editing access. Connect again and approve Google Sheets access.",
        400,
      );
    return tokens.refresh_token;
  } catch (e) {
    if (e instanceof AppError) throw e;
    // Never surface Google's error objects: they can contain request credentials.
    throw new AppError(
      "Google could not complete authorization. Check the OAuth client and exact redirect URI, then connect again.",
      400,
    );
  }
}
export const tokenResponse = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});
