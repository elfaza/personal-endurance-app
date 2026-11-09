import { test, expect } from "@playwright/test";

test("AI rejection keeps the saved report, displays safe diagnostics and refreshes the released allowance", async ({
  page,
}) => {
  let calls = 0,
    rejected = false;
  await page.route("**/api/wellness", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.aiAvailable = true;
    data.aiReason = null;
    data.review = {
      summary: "Previously saved training review.",
      insights: [],
      limitations: [],
      model: "gpt-6-luna",
      generatedAt: "2026-11-01T00:00:00Z",
      inputHash: "older-input",
    };
    data.budget = {
      ...data.budget,
      usedIdr: 0,
      reservedIdr: 0,
      settledIdr: 0,
      remainingIdr: 20000,
      blocked: false,
      warning: false,
      ...(rejected
        ? {
            lastFailure: {
              summary:
                "OpenAI rejected the API key. Check the server's OpenAI API key configuration.",
              reference:
                "OpenAI HTTP 401 · invalid_api_key · req_browser_fixture",
              allowanceHeld: false,
            },
          }
        : {}),
    };
    return route.fulfill({ json: data });
  });
  await page.route("**/api/wellness/ai", (route) => {
    calls++;
    rejected = true;
    return route.fulfill({
      status: 502,
      json: {
        error:
          "OpenAI rejected the API key. Rejected before generation. Its reserved allowance was released. No automatic retry was made. Reference: OpenAI HTTP 401 · req_browser_fixture.",
      },
    });
  });
  await page.goto("/dashboard");
  const outlook = page.getByRole("region", {
    name: "Training outlook",
    exact: true,
  });
  await expect(
    outlook.getByText("Previously saved training review.", { exact: true }),
  ).toBeVisible();
  await outlook.getByRole("button", { name: "Update AI review" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Agree & generate review" })
    .click();
  await expect(outlook.getByRole("alert")).toContainText(
    "reserved allowance was released",
  );
  await expect(
    outlook.getByText("Previously saved training review.", { exact: true }),
  ).toBeVisible();
  const budget = outlook.getByRole("region", { name: "Monthly AI budget" });
  await expect(budget).toContainText("Settled estimate:");
  await expect(budget).toContainText(
    "Held for pending or unverified requests:",
  );
  await budget.getByText("Last AI request issue", { exact: true }).click();
  await expect(budget).toContainText("req_browser_fixture");
  expect(calls).toBe(1);
  await page.reload();
  await expect(
    outlook.getByText("Previously saved training review.", { exact: true }),
  ).toBeVisible();
  await budget.getByText("Last AI request issue", { exact: true }).click();
  await expect(budget).toContainText("req_browser_fixture");
  expect(calls).toBe(1);
});

test("the app's AI budget limit does not start a Google Sheets cooldown", async ({
  page,
}) => {
  let reads = 0;
  await page.route("**/api/wellness", async (route) => {
    reads++;
    const response = await route.fetch();
    const data = await response.json();
    data.aiAvailable = true;
    data.aiReason = null;
    data.review = null;
    data.budget.blocked = false;
    return route.fulfill({ json: data });
  });
  await page.route("**/api/wellness/ai", (route) =>
    route.fulfill({
      status: 429,
      json: {
        error: "AI is paused: the monthly budget cannot cover another request.",
      },
    }),
  );
  await page.goto("/dashboard");
  const outlook = page.getByRole("region", {
    name: "Training outlook",
    exact: true,
  });
  await outlook.getByRole("button", { name: "Generate AI review" }).click();
  const before = reads;
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Agree & generate review" })
    .click();
  await expect(outlook.getByRole("alert")).toContainText("monthly budget");
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(page.locator(".error-state")).toHaveCount(0);
});
