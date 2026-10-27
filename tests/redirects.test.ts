import { afterEach, describe, expect, it, vi } from "vitest";
import config from "../next.config";
afterEach(() => vi.unstubAllEnvs());
describe("public aliases use the configured authentication origin", () => {
  it("redirects the shorter host before login without redirecting the canonical host", async () => {
    vi.stubEnv(
      "APP_ORIGIN",
      "https://personal-endurance-app-elfazas-projects.vercel.app",
    );
    const rules = await config.redirects!();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual({
      source: "/:path*",
      has: [{ type: "host", value: "personal-endurance-app\\.vercel\\.app" }],
      destination:
        "https://personal-endurance-app-elfazas-projects.vercel.app/:path*",
      permanent: false,
    });
    const pattern = new RegExp(`^${rules[0].has![0].value}$`);
    expect(pattern.test("personal-endurance-app.vercel.app")).toBe(true);
    expect(pattern.test("personal-endurance-appXvercelXapp")).toBe(false);
  });
  it("follows a change to the canonical alias without a redirect loop", async () => {
    vi.stubEnv("APP_ORIGIN", "https://personal-endurance-app.vercel.app/");
    const rules = await config.redirects!();
    expect(rules).toHaveLength(1);
    expect(rules[0].destination).toBe(
      "https://personal-endurance-app.vercel.app/:path*",
    );
    expect(rules[0].has![0].value).toBe(
      "personal-endurance-app-elfazas-projects\\.vercel\\.app",
    );
  });
  it("does not redirect local development or incomplete configuration", async () => {
    for (const origin of [
      "",
      "http://localhost:3107",
      "https://training.example.com/settings",
      "https://training.example.com?next=elsewhere",
      "https://user:password@training.example.com",
    ]) {
      vi.stubEnv("APP_ORIGIN", origin);
      expect(await config.redirects!()).toEqual([]);
    }
  });
});
