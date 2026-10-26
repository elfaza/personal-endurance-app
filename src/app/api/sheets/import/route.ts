import { NextResponse } from "next/server";
import { z } from "zod";
import { api, jsonBody } from "@/lib/server/auth";
import { configuration } from "@/lib/server/config";
import { sheets } from "@/lib/google-sheets/client";
import { importRequest, mapLegacyRows } from "@/lib/google-sheets/import";
import { repository, withLock } from "@/lib/server/repository";
import { AppError } from "@/lib/server/errors";
export const POST = api(async (req) => {
  if (configuration().mode !== "live")
    throw new AppError("Import is available in live mode after Sheets setup.");
  const body = importRequest.parse(await jsonBody(req));
  return withLock(async () => {
    const info = await sheets.inspect();
    if (!info.sheets.some((s) => s.properties.title === body.tab))
      throw new AppError("Source worksheet not found.", 404);
    const result = z
      .object({ values: z.array(z.array(z.unknown())).optional() })
      .parse(
        await sheets.request(
          `/values/${encodeURIComponent(`'${body.tab.replaceAll("'", "''")}'!A1:AZ2001`)}?valueRenderOption=FORMATTED_VALUE`,
        ),
      );
    if ((result.values?.length ?? 0) > 2000)
      throw new AppError(
        "Import supports up to 1,999 workout rows at a time. Use a dedicated smaller source worksheet.",
      );
    const mapped = mapLegacyRows(
      result.values ?? [],
      body.mapping,
      `${info.spreadsheetId}:${body.tab}`,
    );
    const repo = repository();
    const { snapshot, initialized } = await repo.read();
    if (!initialized)
      throw new AppError("Create PE worksheets before importing.", 409);
    const fresh = mapped.rows.filter(
      (r) => !snapshot.Workouts.some((w) => w.id === r.id),
    );
    if (body.preview)
      return NextResponse.json({
        sourceHash: mapped.sourceHash,
        total: mapped.rows.length,
        existing: mapped.rows.length - fresh.length,
        preview: fresh.map((r) => r.workout),
      });
    if (body.sourceHash !== mapped.sourceHash)
      throw new AppError(
        "Source data or mapping changed after preview. Preview it again before importing.",
        409,
      );
    const op = z.string().uuid().parse(req.headers.get("idempotency-key"));
    await repo.commit(
      fresh.map((r) => ({
        dataset: "Workouts",
        id: r.id,
        expected: null,
        payload: {
          ...r.workout,
          createdAt: new Date().toISOString(),
          completionSource: ["Completed", "Partially Completed"].includes(
            r.workout.status,
          )
            ? "manual"
            : undefined,
        },
      })),
      op,
      snapshot,
    );
    return NextResponse.json({ count: fresh.length });
  });
});
