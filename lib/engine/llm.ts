import "server-only";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { KeelcodeError } from "./types";

/**
 * Model provider. OpenAI is the default; set OPENAI_API_KEY.
 * If only ANTHROPIC_API_KEY is set, the same agents run on Claude instead.
 */
export const PROVIDER: "openai" | "anthropic" | null = process.env.OPENAI_API_KEY
  ? "openai"
  : process.env.ANTHROPIC_API_KEY
    ? "anthropic"
    : null;

export const MODEL =
  PROVIDER === "anthropic"
    ? (process.env.KEELCODE_MODEL || process.env.KEEL_MODEL) || "claude-opus-5-5"
    : process.env.OPENAI_MODEL || (process.env.KEELCODE_MODEL || process.env.KEEL_MODEL) || "gpt-5.5";

type Effort = "low" | "medium" | "high";

export const NO_KEY_MESSAGE =
  "The server has no OPENAI_API_KEY configured. Add it to .env.local (local) or the Vercel project's Environment Variables, then redeploy. Ingest and the 3D map still work without it.";

export function hasApiKey() {
  return PROVIDER !== null;
}

interface CallOpts {
  system: string;
  user: string;
  effort?: Effort;
  maxTokens?: number;
  schema?: Record<string, unknown>;
  onText?: (delta: string) => void;
}

// ---------------- OpenAI ----------------
let openai: OpenAI | null = null;

async function callOpenAI(opts: CallOpts): Promise<string> {
  const c = (openai ??= new OpenAI({ maxRetries: 2, timeout: 240_000 }));
  try {
    const stream = await c.chat.completions.create({
      model: MODEL,
      stream: true,
      reasoning_effort: opts.effort ?? "low",
      max_completion_tokens: (opts.maxTokens ?? 16000) + 16000, // headroom for hidden reasoning tokens
      messages: [
        { role: "developer", content: opts.system },
        { role: "user", content: opts.user },
      ],
      ...(opts.schema
        ? { response_format: { type: "json_schema" as const, json_schema: { name: "keel_output", strict: true, schema: opts.schema } } }
        : {}),
    });
    let text = "";
    let refusal = "";
    let finish: string | null = null;
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      const d = choice.delta?.content;
      if (d) {
        text += d;
        opts.onText?.(d);
      }
      if (choice.delta?.refusal) refusal += choice.delta.refusal;
      if (choice.finish_reason) finish = choice.finish_reason;
    }
    if (refusal || finish === "content_filter")
      throw new KeelcodeError("REFUSAL", "The model declined this request. Try rephrasing or a different repo slice.", 422);
    if (finish === "length" && opts.schema)
      throw new KeelcodeError("TRUNCATED", "The model's output hit the token limit before finishing. Try a smaller scope.", 502);
    return text;
  } catch (e) {
    if (e instanceof KeelcodeError) throw e;
    if (e instanceof OpenAI.AuthenticationError) throw new KeelcodeError("BAD_API_KEY", "OpenAI rejected the API key (401). Check OPENAI_API_KEY.", 503);
    if (e instanceof OpenAI.PermissionDeniedError || e instanceof OpenAI.NotFoundError)
      throw new KeelcodeError("API_FORBIDDEN", `Your OpenAI key can't use model "${MODEL}". Set OPENAI_MODEL to a model your key can access.`, 503);
    if (e instanceof OpenAI.RateLimitError) throw new KeelcodeError("RATE_LIMITED", "OpenAI rate limit or quota hit. Check billing/limits, then retry.", 429);
    if (e instanceof OpenAI.BadRequestError) throw new KeelcodeError("API_ERROR", `OpenAI rejected the request: ${e.message}`, 502);
    if (e instanceof OpenAI.APIConnectionError) throw new KeelcodeError("API_UNREACHABLE", "Couldn't reach the OpenAI API.", 502);
    if (e instanceof OpenAI.APIError) throw new KeelcodeError("API_ERROR", `OpenAI API error ${e.status ?? ""}: ${e.message}`, 502);
    throw e;
  }
}

// ---------------- Anthropic (fallback provider) ----------------
let anthropic: Anthropic | null = null;
let fallbacksSupported = true;

async function callAnthropic(opts: CallOpts): Promise<string> {
  const c = (anthropic ??= new Anthropic({ maxRetries: 2, timeout: 240_000 }));
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
    if (msg.stop_reason === "refusal") throw new KeelcodeError("REFUSAL", "The model declined this request. Try rephrasing or a different repo slice.", 422);
    if (msg.stop_reason === "max_tokens" && opts.schema) throw new KeelcodeError("TRUNCATED", "The model's output hit the token limit before finishing. Try a smaller scope.", 502);
    return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  } catch (e) {
    if (e instanceof KeelcodeError) throw e;
    if (e instanceof Anthropic.BadRequestError && fallbacksSupported && /fallback|beta/i.test(e.message)) {
      fallbacksSupported = false;
      return callAnthropic(opts);
    }
    if (e instanceof Anthropic.AuthenticationError) throw new KeelcodeError("BAD_API_KEY", "Anthropic rejected the API key (401). Check ANTHROPIC_API_KEY.", 503);
    if (e instanceof Anthropic.PermissionDeniedError) throw new KeelcodeError("API_FORBIDDEN", `The API key can't use ${MODEL}. Set KEELCODE_MODEL to a model your key can access.`, 503);
    if (e instanceof Anthropic.RateLimitError) throw new KeelcodeError("RATE_LIMITED", "Anthropic rate limit hit. Wait a minute and retry.", 429);
    if (e instanceof Anthropic.APIConnectionError) throw new KeelcodeError("API_UNREACHABLE", "Couldn't reach the Anthropic API.", 502);
    if (e instanceof Anthropic.APIError) throw new KeelcodeError("API_ERROR", `Anthropic API error ${e.status ?? ""}: ${e.message}`, 502);
    throw e;
  }
}

async function call(opts: CallOpts): Promise<string> {
  if (PROVIDER === "openai") return callOpenAI(opts);
  if (PROVIDER === "anthropic") return callAnthropic(opts);
  throw new KeelcodeError("NO_API_KEY", NO_KEY_MESSAGE, 503);
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
    throw new KeelcodeError("BAD_MODEL_OUTPUT", "The model returned malformed JSON.", 502);
  }
}

// ---- tiny JSON-schema builders (strict structured outputs need closed objects with all keys required) ----
export const S = {
  str: (description?: string) => ({ type: "string", ...(description ? { description } : {}) }),
  int: (description?: string) => ({ type: "integer", ...(description ? { description } : {}) }),
  num: () => ({ type: "number" }),
  bool: () => ({ type: "boolean" }),
  enumOf: (values: string[]) => ({ type: "string", enum: values }),
  arr: (items: object) => ({ type: "array", items }),
  obj: (properties: Record<string, object>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false }),
};
