import "server-only";
import { KeelError, type KeelEvent, type RepoSource } from "./types";
import type { Emit } from "./dispatch";

/** Wraps a job in a Server-Sent Events response. Errors become `error` events, never a blank page. */
export function sseResponse(job: (emit: Emit) => Promise<void>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (e: KeelEvent) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const ping = setInterval(() => {
        if (!closed) try { controller.enqueue(enc.encode(": ping\n\n")); } catch { closed = true; }
      }, 10_000);
      try {
        await job(send);
      } catch (err) {
        const e = err as Error & { code?: string };
        console.error("[keel]", e);
        send({ type: "error", code: err instanceof KeelError ? err.code : e.code ?? "INTERNAL", message: e.message || "Unexpected error" });
      } finally {
        clearInterval(ping);
        send({ type: "done" });
        closed = true;
        try { controller.close(); } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

export function parseSource(body: unknown): RepoSource {
  const s = (body as { source?: RepoSource })?.source;
  if (!s || typeof s !== "object") throw new KeelError("BAD_REQUEST", "Missing repo source.");
  if (s.kind === "demo") return s;
  if (s.kind === "git" && typeof s.url === "string") return { kind: "git", url: s.url, ref: typeof s.ref === "string" && s.ref ? s.ref : undefined };
  if (s.kind === "zip" && typeof s.base64 === "string") return { kind: "zip", name: String(s.name || "upload.zip"), base64: s.base64 };
  throw new KeelError("BAD_REQUEST", "Unknown repo source.");
}
