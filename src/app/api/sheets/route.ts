import { NextResponse } from "next/server";
import { api } from "@/lib/server/auth";
import { sheets } from "@/lib/google-sheets/client";
import { configuration } from "@/lib/server/config";
import { withLock } from "@/lib/server/repository";
import { AppError } from "@/lib/server/errors";
export const GET = api(async () => {
  if (configuration().mode !== "live")
    throw new AppError("Switch to live mode to inspect a private spreadsheet.");
  if (!configuration().sheets)
    throw new AppError(
      "Add Google Sheets credentials to the server environment first.",
      503,
    );
  const info = await sheets.inspect();
  const samples = await Promise.all(
    info.sheets.map(async (s) => ({
      title: s.properties.title,
      header:
        (
          await sheets.request(
            `/values/${encodeURIComponent(`'${s.properties.title.replaceAll("'", "''")}'!A1:AZ1`)}`,
          )
        ).values?.[0] ?? [],
    })),
  );
  return NextResponse.json({ title: info.properties.title, tabs: samples });
});
export const POST = api(async () => {
  if (configuration().mode !== "live")
    throw new AppError(
      "Switch PE_DATA_MODE to live before initializing Sheets.",
    );
  await withLock(() => sheets.initialize());
  return NextResponse.json({ ok: true });
});
