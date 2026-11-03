import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { get, put } from "@vercel/blob";
import { z } from "zod";
import { AppError } from "../server/errors";

// Connection credentials only: training data remains in Google Sheets.
export const tokenStoreConfigured = () =>
  !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const record = z.object({
  version: z.literal(1),
  iv: z.string(),
  tag: z.string(),
  ciphertext: z.string(),
});
function namespace() {
  return createHash("sha256")
    .update(`${process.env.GOOGLE_CLIENT_ID}:${process.env.APP_ORIGIN}`)
    .digest("hex");
}
function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Missing encryption key");
  return Buffer.from(
    hkdfSync("sha256", secret, namespace(), "pe-google-token-v1", 32),
  );
}
export function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(namespace()));
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}
export function decryptToken(value: string) {
  const data = record.parse(JSON.parse(value));
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(data.iv, "base64"),
  );
  decipher.setAAD(Buffer.from(namespace()));
  decipher.setAuthTag(Buffer.from(data.tag, "base64"));
  const token = Buffer.concat([
    decipher.update(Buffer.from(data.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  if (!token || token.length > 16384) throw new Error("Invalid credential");
  return token;
}
function storageError() {
  return new AppError(
    "Google connection storage is unavailable. Try again later; your existing connection has not been replaced.",
    503,
  );
}
export async function readRefreshToken(): Promise<string | undefined> {
  if (tokenStoreConfigured()) {
    try {
      const result = await get(`google-oauth/${namespace()}/credential.json`, {
        access: "private",
        useCache: false,
        abortSignal: AbortSignal.timeout(20000),
      });
      if (result) {
        if (result.statusCode !== 200)
          throw new Error("Unexpected storage response");
        return decryptToken(await new Response(result.stream).text());
      }
    } catch {
      // Fail closed: never silently use an older env token on a store error.
      throw storageError();
    }
  }
  return process.env.GOOGLE_REFRESH_TOKEN || undefined;
}
export async function saveRefreshToken(token: string) {
  if (!tokenStoreConfigured() || process.env.VERCEL_BLOB_RETRIES !== "0")
    throw storageError();
  try {
    await put(
      `google-oauth/${namespace()}/credential.json`,
      encryptToken(token),
      {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 60,
        abortSignal: AbortSignal.timeout(20000),
      },
    );
  } catch {
    throw new AppError(
      "Google approved access, but saving the connection could not be confirmed. Return to Google setup to check the connection before reconnecting.",
      503,
    );
  }
}
// Create-only claims make callbacks single-use across Vercel instances.
export async function claimAuthorization(state: string) {
  if (!tokenStoreConfigured() || process.env.VERCEL_BLOB_RETRIES !== "0")
    throw storageError();
  try {
    const id = createHash("sha256").update(state).digest("hex");
    await put(`google-oauth/${namespace()}/attempts/${id}`, "used", {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "text/plain",
      cacheControlMaxAge: 60,
      abortSignal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new AppError(
      "This Google connection attempt was already used or could not be verified. Start again from Google setup.",
      409,
    );
  }
}
