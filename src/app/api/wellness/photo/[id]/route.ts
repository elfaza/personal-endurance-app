import { api } from "@/lib/server/auth";
import { readMealPhoto } from "@/lib/server/wellness-store";
export const GET = api(async (req) => {
  const id = req.nextUrl.pathname.split("/").at(-1)!;
  const image = await readMealPhoto(id);
  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/jpeg",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": 'inline; filename="meal.jpg"',
    },
  });
});
