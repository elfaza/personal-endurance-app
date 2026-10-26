import "server-only";
export function configuration() {
  const oauth = process.env.GOOGLE_AUTH_MODE === "oauth";
  // OAuth setup stays accessible while credentials are incomplete. Once a
  // refresh token is configured, never silently fall back to sample data.
  const mode =
    process.env.PE_DATA_MODE === "live" ||
    (oauth && !!process.env.GOOGLE_REFRESH_TOKEN)
      ? "live"
      : "demo";
  return {
    mode,
    readOnly:
      (mode === "demo" && process.env.VERCEL === "1") ||
      (mode === "live" && process.env.GOOGLE_SHEETS_WRITES_ENABLED !== "true"),
    garmin: !!process.env.GARMIN_PERSONAL_API_KEY,
    sheets: !!(
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID &&
      oauth &&
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    ),
  } as const;
}
