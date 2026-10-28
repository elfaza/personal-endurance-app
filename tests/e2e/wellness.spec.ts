import { test, expect } from "@playwright/test";

test("profile and dated weight persist through reload and edits", async ({
  page,
}) => {
  await page.goto("/settings");
  const profile = page.getByRole("region", {
    name: "Personal profile",
    exact: true,
  });
  await profile
    .getByRole("button", { name: /Set up profile|Edit profile/ })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Birth date").fill("1996-10-29");
  await dialog.getByLabel("Height (cm)", { exact: true }).fill("175");
  await dialog.getByLabel("Training experience").selectOption("regular");
  await dialog
    .getByLabel("Your main focus")
    .fill("Build a sustainable running routine");
  await dialog
    .getByRole("button", { name: "Save profile", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(profile).toContainText("175 cm");
  await expect(profile).toContainText("Build a sustainable running routine");
  const history = page.getByRole("region", { name: "Weight history" });
  await history.getByRole("button", { name: "Log weight" }).click();
  await dialog.getByLabel("Measurement date").fill("2024-04-17");
  await dialog.getByLabel("Weight (kg)", { exact: true }).fill("70.5");
  await dialog
    .getByRole("button", { name: "Save weight", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await history
    .getByRole("button", { name: "Edit weight for 2024-04-17" })
    .click();
  await expect(dialog.getByLabel("Weight (kg)", { exact: true })).toHaveValue(
    "70.5",
  );
  await dialog.getByLabel("Weight (kg)", { exact: true }).fill("70.2");
  await dialog
    .getByRole("button", { name: "Save weight", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(history).toContainText("70.2 kg");
  await page.screenshot({
    path: ".local/wellness-settings-desktop.png",
    fullPage: true,
  });
});

test("manual food and its real compressed photo persist; portion edits scale estimates and deletion protects photos", async ({
  page,
}) => {
  const name = `Lunch QA ${Date.now()}`;
  await page.goto("/food");
  await page.getByRole("button", { name: "Add meal", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Meal name", { exact: true }).fill(name);
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 600;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#e9b76e";
    ctx.fillRect(0, 0, 900, 600);
    ctx.fillStyle = "#f5eee0";
    ctx.beginPath();
    ctx.arc(450, 300, 220, 0, Math.PI * 2);
    ctx.fill();
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await dialog.getByLabel("Choose meal photo", { exact: true }).setInputFiles({
    name: "meal.png",
    mimeType: "image/png",
    buffer: Buffer.from(encoded, "base64"),
  });
  await expect(dialog.getByAltText("Meal photo preview")).toHaveAttribute(
    "src",
    /^data:image\/jpeg/,
  );
  await dialog
    .getByRole("combobox", {
      name: "Use a reference food (optional)",
      exact: true,
    })
    .selectOption("rice");
  await dialog.getByLabel("Portion (g)", { exact: true }).fill("");
  await dialog.getByLabel("Portion (g)", { exact: true }).fill("200");
  await expect(dialog.locator(".meal-draft-total")).toContainText(
    "208–312 kcal",
  );
  await dialog
    .getByRole("button", { name: "Save confirmed meal", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  const entry = page
    .locator("article.food-meal")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(entry).toContainText("208–312 kcal");
  const image = entry.getByRole("img", { name: `Saved photo of ${name}` });
  await expect(image).toBeVisible();
  const src = (await image.getAttribute("src"))!;
  const response = await page.request.get(src);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("image/jpeg");
  expect(response.headers()["cache-control"]).toContain("no-store");
  await entry.getByRole("button", { name: "Edit meal" }).click();
  await dialog.getByLabel("Portion (g)", { exact: true }).fill("100");
  await expect(dialog.locator(".meal-draft-total")).toContainText(
    "104–156 kcal",
  );
  await dialog
    .getByRole("button", { name: "Save confirmed meal", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(entry).toContainText("104–156 kcal");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: ".local/wellness-food-desktop.png",
    fullPage: true,
  });
  await entry.getByRole("button", { name: `Delete ${name}` }).click();
  await dialog
    .getByRole("button", { name: "Remove meal", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(entry).toHaveCount(0);
  expect((await page.request.get(src)).status()).toBe(404);
});

test("AI photo output stays a draft and a failed save preserves corrections", async ({
  page,
}) => {
  await page.route("**/api/wellness", async (route) => {
    if (route.request().method() === "POST")
      return route.fulfill({
        status: 409,
        json: { error: "Changed elsewhere. Your draft is still available." },
      });
    const response = await route.fetch();
    const data = await response.json();
    data.aiAvailable = true;
    data.aiReason = null;
    return route.fulfill({ json: data });
  });
  let analyses = 0;
  await page.route("**/api/wellness/ai", async (route) => {
    analyses++;
    expect(route.request().postDataJSON().consent).toBe(true);
    return route.fulfill({
      json: {
        result: {
          items: [
            {
              name: "Fried rice",
              grams: 200,
              kcalLow: 300,
              kcalHigh: 500,
              protein: 10,
              carbs: 50,
              fat: 15,
              basis: "ai-estimate",
            },
          ],
          uncertainty: "Oil and portion are uncertain.",
        },
      },
    });
  });
  await page.goto("/food");
  await page.getByRole("button", { name: "Add meal", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const encoded = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 20;
    c.height = 20;
    return c.toDataURL("image/png").split(",")[1];
  });
  await dialog.getByLabel("Choose meal photo", { exact: true }).setInputFiles({
    name: "rice.png",
    mimeType: "image/png",
    buffer: Buffer.from(encoded, "base64"),
  });
  await expect(dialog.getByAltText("Meal photo preview")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Analyze photo", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Analyze photo", exact: true })
    .click();
  await expect(dialog.getByLabel("Food name", { exact: true })).toHaveValue(
    "Fried rice",
  );
  expect(analyses).toBe(1);
  await dialog.getByLabel("Meal name", { exact: true }).fill("Corrected meal");
  await dialog.getByLabel("Calories upper (kcal)", { exact: true }).fill("550");
  await dialog
    .getByRole("button", { name: "Save confirmed meal", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Your draft is still available",
  );
  await expect(
    dialog.getByLabel("Calories upper (kcal)", { exact: true }),
  ).toHaveValue("550");
  await expect(dialog.getByLabel("Meal name", { exact: true })).toHaveValue(
    "Corrected meal",
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("outlook, budget and mobile food navigation stay readable in both themes without paid calls", async ({
  page,
}) => {
  let paidCalls = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/wellness/ai")) paidCalls++;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  const outlook = page.getByRole("region", {
    name: "Training outlook",
    exact: true,
  });
  await expect(outlook).toBeVisible();
  await expect(
    outlook.getByRole("button", { name: "Generate AI review" }),
  ).toBeDisabled();
  await expect(outlook).toContainText("Demo mode never makes paid AI calls");
  await expect(
    outlook.getByRole("region", { name: "Monthly AI budget" }),
  ).toContainText("20.000");
  await expect(
    outlook.getByRole("link", { name: "Explore training analytics" }),
  ).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
      localStorage.setItem("pe.theme", t);
    }, theme);
    await page.screenshot({
      path: `.local/wellness-outlook-mobile-${theme}.png`,
      fullPage: true,
    });
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name: "Food", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your food journal." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Add meal", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Meal name", { exact: true })).toBeVisible();
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `.local/wellness-meal-mobile-${theme}.png`,
      fullPage: false,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add meal", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name: "Home", exact: true })
      .click();
  }
  expect(paidCalls).toBe(0);
});
