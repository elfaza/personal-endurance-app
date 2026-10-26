import { NextRequest, NextResponse } from "next/server";
import { authorize, errorResponse } from "@/lib/server/auth";
import { activityDetail } from "@/lib/server/service";
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    authorize(req);
    const { id } = await context.params;
    return NextResponse.json(await activityDetail(id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
