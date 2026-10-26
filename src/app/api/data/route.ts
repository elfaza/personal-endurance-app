import { NextResponse } from "next/server";
import { api } from "@/lib/server/auth";
import { getData } from "@/lib/server/service";
export const dynamic = "force-dynamic";
export const GET = api(async () => NextResponse.json(await getData()));
