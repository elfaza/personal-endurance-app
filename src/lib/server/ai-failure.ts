import "server-only";
import { z } from "zod";
import { AppError } from "./errors";

export const failureSchema = z.object({
  kind: z.enum([
    "authentication",
    "permission",
    "model",
    "invalid_request",
    "credits",
    "rate_limit",
    "provider",
    "connection",
    "invalid_response",
  ]),
  at: z.string().datetime(),
  httpStatus: z.number().int().min(100).max(599).optional(),
  code: z
    .enum([
      "invalid_api_key",
      "model_not_found",
      "invalid_json_schema",
      "unsupported_parameter",
      "unsupported_value",
      "rate_limit_exceeded",
      "slow_down",
      "insufficient_quota",
      "credit_balance_exhausted",
      "organization_usage_limit_exceeded",
      "billing_hard_limit_reached",
    ])
    .optional(),
  requestId: z
    .string()
    .regex(/^req_[A-Za-z0-9_-]{1,100}$/)
    .optional(),
});
export type AiFailure = z.infer<typeof failureSchema>;
const messages: Record<AiFailure["kind"], string> = {
  authentication:
    "OpenAI rejected the API key. Check the server's OpenAI API key configuration.",
  permission:
    "The OpenAI project does not have permission for this request. Check project and model access.",
  model:
    "The configured AI model is unavailable to this OpenAI project. Check model access before trying again.",
  invalid_request:
    "OpenAI rejected the request format or parameters. The app configuration needs review.",
  credits:
    "The OpenAI project has reached its credit or usage limit. Check its API billing and limits.",
  rate_limit:
    "OpenAI is temporarily rate limiting AI requests. Wait before starting another request.",
  provider:
    "The AI service could not finish this request. Its processing outcome is unverified.",
  connection:
    "The AI connection timed out or was interrupted. The processing outcome is unverified.",
  invalid_response: "The AI response could not be validated.",
};
export function failureSummary(failure: AiFailure) {
  return messages[failure.kind];
}
export function failureReference(failure: AiFailure) {
  return [
    failure.httpStatus ? `OpenAI HTTP ${failure.httpStatus}` : "",
    failure.code,
    failure.requestId,
  ]
    .filter(Boolean)
    .join(" · ");
}
export function requestId(value: string | null) {
  return value && /^req_[A-Za-z0-9_-]{1,100}$/.test(value) ? value : undefined;
}
export class AiProviderError extends AppError {
  constructor(
    public failure: AiFailure,
    public rejected: boolean,
  ) {
    super(failureSummary(failure), 502);
  }
}
// Read a bounded error body and retain only allowlisted fields. Provider messages
// may echo API keys, prompts or photos; never store or return those messages.
export async function providerFailure(res: Response): Promise<AiProviderError> {
  let raw: unknown;
  try {
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let size = 0,
      text = "";
    if (reader) {
      try {
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          size += item.value.byteLength;
          if (size > 16384) throw new Error("Oversized error body");
          text += decoder.decode(item.value, { stream: true });
        }
        text += decoder.decode();
        raw = JSON.parse(text);
      } finally {
        await reader.cancel().catch(() => {});
      }
    }
  } catch {
    /* An unverifiable response keeps its full reservation. */
  }
  const parsed = z
    .object({
      error: z.object({
        type: z.string(),
        code: z.string().nullable().optional(),
      }),
      usage: z.unknown().optional(),
      output: z.unknown().optional(),
    })
    .safeParse(raw);
  const code = parsed.success
    ? failureSchema.shape.code.safeParse(parsed.data.error.code)
    : undefined;
  const knownCode = code?.success ? code.data : undefined;
  const types = [
    "invalid_request_error",
    "authentication_error",
    "permission_error",
    "not_found_error",
    "rate_limit_error",
    "insufficient_quota",
  ];
  const rejected =
    parsed.success &&
    types.includes(parsed.data.error.type) &&
    [400, 401, 403, 404, 422, 429].includes(res.status) &&
    parsed.data.usage == null &&
    parsed.data.output == null &&
    (res.status !== 429 ||
      [
        "rate_limit_exceeded",
        "slow_down",
        "insufficient_quota",
        "credit_balance_exhausted",
        "organization_usage_limit_exceeded",
        "billing_hard_limit_reached",
      ].includes(knownCode ?? "") ||
      (parsed.data.error.code == null &&
        ["rate_limit_error", "insufficient_quota"].includes(
          parsed.data.error.type,
        )));
  const kind: AiFailure["kind"] =
    res.status >= 500
      ? "provider"
      : res.status === 401
        ? "authentication"
        : res.status === 403
          ? "permission"
          : res.status === 404 || knownCode === "model_not_found"
            ? "model"
            : [
                  "insufficient_quota",
                  "credit_balance_exhausted",
                  "organization_usage_limit_exceeded",
                  "billing_hard_limit_reached",
                ].includes(knownCode ?? "") ||
                (parsed.success &&
                  parsed.data.error.type === "insufficient_quota")
              ? "credits"
              : res.status === 429
                ? "rate_limit"
                : [400, 422].includes(res.status)
                  ? "invalid_request"
                  : "provider";
  return new AiProviderError(
    {
      kind,
      at: new Date().toISOString(),
      httpStatus: res.status,
      ...(knownCode ? { code: knownCode } : {}),
      requestId: requestId(res.headers.get("x-request-id")),
    },
    rejected,
  );
}
