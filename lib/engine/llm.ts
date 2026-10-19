import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { KeelError } from "./types";

export const MODEL = process.env.KEEL_MODEL || "claude-opus-5-5";
type Effort = "low" | "medium" | "high";

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY)
    throw new KeelError("NO_API_KEY", "The server has no ANTHROPIC_API_KEY configured. Add it to .env.local (local) or the Vercel project's Environment Variables, then redeploy. Ingest and the 3D map still work without it.", 503);
  return (client ??= new Anthropic({ maxRetries: 2, timeout: 240_000 }));
}

export function hasApiKey() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Server-side refusal fallback: if a safety classifier declines, the API re-routes the
// same request to a fallback model inside the call. Dropped automatically if the account rejects it.
let fallbacksSupported = true;

interface CallOpts {
  system: string;
  user: string;
  effort?: Effort;
  maxTokens?: number;
  schema?: Record<string, unknown>;
  onText?: (delta: string) => void;
}

async function call(opts: CallOpts): Promise<string> {
  const c = getClient();
  const params = {
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    messages: [{ role: "user" as const, content: opts.user }],
    output_config: {
      effort: opts.effort ?? "low",
      ...(opts.schema ? { format: { type: "json_schema" as const, schema: opts.schema } } : {}),
    },
  };
  try {
    const stream = fallbacksSupported
      ? c.beta.messages.stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : c.beta.messages.stream(params);
    if (opts.onText) stream.on("text", (d) => opts.onText!(d));
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal")
      throw new KeelError("REFUSAL", "The model declined this request (safety classifier). Try rephrasing or a different repo slice.", 422);
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    if (msg.stop_reason === "max_tokens" && opts.schema)
      throw new KeelError("TRUNCATED", "The model's output hit the token limit before finishing. Try a smaller scope.", 502);
    return text;
  } catch (e) {
    if (e instanceof KeelError) throw e;
    if (e instanceof Anthropic.BadRequestError && fallbacksSupported && /fallback|beta/i.test(e.message)) {
      fallbacksSupported = false;
      return call(opts);
    }
    if (e instanceof Anthropic.AuthenticationError) throw new KeelError("BAD_API_KEY", "Anthropic rejected the API key (401). Check ANTHROPIC_API_KEY.", 503);
    if (e instanceof Anthropic.PermissionDeniedError) throw new KeelError("API_FORBIDDEN", `The API key can't use ${MODEL}. Set KEEL_MODEL to a model your key can access.`, 503);
    if (e instanceof Anthropic.RateLimitError) throw new KeelError("RATE_LIMITED", "Anthropic rate limit hit. Wait a minute and retry.", 429);
    if (e instanceof Anthropic.APIConnectionError) throw new KeelError("API_UNREACHABLE", "Couldn't reach the Anthropic API.", 502);
    if (e instanceof Anthropic.APIError) throw new KeelError("API_ERROR", `Anthropic API error ${e.status ?? ""}: ${e.message}`, 502);
    throw e;
  }
}

export async function callText(opts: Omit<CallOpts, "schema">) {
  return call(opts);
}

export async function callJSON<T>(opts: CallOpts & { schema: Record<string, unknown> }): Promise<T> {
  const text = await call(opts);
  try {
    return JSON.parse(text) as T;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new KeelError("BAD_MODEL_OUTPUT", "The model returned malformed JSON.", 502);
  }
}

// ---- tiny JSON-schema builders (structured outputs need closed objects with all keys required) ----
export const S = {
  str: (description?: string) => ({ type: "string", ...(description ? { description } : {}) }),
  int: (description?: string) => ({ type: "integer", ...(description ? { description } : {}) }),
  num: () => ({ type: "number" }),
  bool: () => ({ type: "boolean" }),
  enumOf: (values: string[]) => ({ type: "string", enum: values }),
  arr: (items: object) => ({ type: "array", items }),
  obj: (properties: Record<string, object>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false }),
};
