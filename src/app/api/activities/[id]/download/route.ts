import { NextRequest } from "next/server";
import { authorize, errorResponse } from "@/lib/server/auth";
import { configuration } from "@/lib/server/config";
import { garmin } from "@/lib/garmin/client";
import { AppError } from "@/lib/server/errors";
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    authorize(req);
    const { id } = await context.params;
    if (configuration().mode !== "live" || !/^\d+$/.test(id))
      throw new AppError(
        "Original files are available only for live Garmin activities.",
        404,
      );
    const response = await garmin().download(id);
    return new Response(response.body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="activity-${id}.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
