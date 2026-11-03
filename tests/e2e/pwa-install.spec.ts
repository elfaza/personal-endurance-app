import { test, expect } from "@playwright/test";

test("production-style protected manifest includes credentials and is readable by Chrome", async ({
  page,
  context,
}) => {
  // Model Vercel's cookie gate without an actual Vercel session. A missing
  // crossorigin=use-credentials causes Blink to omit this session cookie.
  await context.addCookies([
    {
      name: "pwa-test-session",
      value: "signed-in",
      url: "http://127.0.0.1:3108",
    },
  ]);
  let authorizedManifestFetches = 0;
  await page.route("**/manifest.webmanifest", async (route) => {
    const cookies = (await route.request().allHeaders()).cookie ?? "";
    if (!cookies.includes("pwa-test-session=signed-in"))
      return route.fulfill({ status: 401, body: "Authentication required" });
    authorizedManifestFetches++;
    return route.continue();
  });
  await page.goto("/dashboard");
  const link = page.locator('link[rel="manifest"]');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute("crossorigin", "use-credentials");
  const devtools = await context.newCDPSession(page);
  const manifest = await devtools.send("Page.getAppManifest");
  expect(manifest.errors).toEqual([]);
  expect(JSON.parse(manifest.data!).name).toBe("Personal Endurance");
  expect(authorizedManifestFetches).toBeGreaterThan(0);
  for (const icon of JSON.parse(manifest.data!).icons) {
    const response = await page.request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
    const bytes = await response.body();
    const width = bytes.readUInt32BE(16),
      height = bytes.readUInt32BE(20);
    expect(`${width}x${height}`).toBe(icon.sizes);
  }
  await page.evaluate(() => navigator.serviceWorker.ready);
});
