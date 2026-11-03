import { pwaManifest } from "@/lib/pwa-manifest";

export const dynamic = "force-static";
export function GET() {
  return Response.json(pwaManifest(), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
