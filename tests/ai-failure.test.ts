import { describe, expect, it } from "vitest";
import { providerFailure, failureReference } from "@/lib/server/ai-failure";

describe("private AI diagnostics", () => {
  it("drops raw messages, unknown codes, and malformed request identifiers", async () => {
    const error = await providerFailure(
      Response.json(
        {
          error: {
            type: "invalid_request_error",
            code: "sk-fake-private-key",
            message: "photo and private prompt",
          },
        },
        { status: 400, headers: { "x-request-id": "sk-fake-private-key" } },
      ),
    );
    expect(error.rejected).toBe(true);
    expect(error.failure.code).toBeUndefined();
    expect(error.failure.requestId).toBeUndefined();
    expect(JSON.stringify(error)).not.toMatch(/sk-fake|private prompt|photo/);
    expect(failureReference(error.failure)).toBe("OpenAI HTTP 400");
  });
  it("does not release allowance for missing or oversized provider error bodies", async () => {
    for (const response of [
      new Response("", { status: 401 }),
      Response.json(
        {
          error: {
            type: "invalid_request_error",
            code: "invalid_api_key",
            message: "x".repeat(20000),
          },
        },
        { status: 401 },
      ),
    ]) {
      const error = await providerFailure(response);
      expect(error.rejected).toBe(false);
      expect(error.failure.kind).toBe("authentication");
    }
  });
  it("never considers a server error a definitive rejection even if its body resembles one", async () => {
    const error = await providerFailure(
      Response.json(
        { error: { type: "invalid_request_error", code: "model_not_found" } },
        { status: 503 },
      ),
    );
    expect(error.rejected).toBe(false);
  });
});
