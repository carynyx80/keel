"use client";
import { useEffect, useRef, useState } from "react";
import { keel, pulse, useKeel } from "@/lib/client/store";
import { fetchFile, openFile } from "@/lib/client/actions";
import { Spinner } from "./ui/bits";

export default function CodeViewer() {
  const viewer = useKeel((s) => s.viewer);
  const [file, setFile] = useState<Awaited<ReturnType<typeof fetchFile>> | null>(null);
  const [err, setErr] = useState("");
  const hl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewer) return;
    setErr("");
    if (file?.path !== viewer.path) setFile(null);
    pulse([viewer.path], "cite");
    fetchFile(viewer.path).then(setFile).catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer?.path]);

  useEffect(() => {
    hl.current?.scrollIntoView({ block: "center" });
  }, [file, viewer?.line]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && keel.set({ viewer: null });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!viewer) return null;
  const start = viewer.line ?? 0;
  const end = viewer.endLine ?? start;
  const lines = file?.content.split("\n") ?? [];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-hull-950/60 p-0 backdrop-blur-sm md:items-center md:p-6" onClick={() => keel.set({ viewer: null })}>
      <div role="dialog" aria-label={`Source of ${viewer.path}`} className="glass-strong flex max-h-[85vh] w-full max-w-4xl flex-col rounded-t-xl md:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
          <div className="min-w-0">
            <div className="truncate font-mono text-sm text-ink">{viewer.path}{start ? <span className="text-sonar">:{start}{end > start ? `-${end}` : ""}</span> : null}</div>
            {file && (
              <div className="truncate text-[11px] text-ink-faint">
                {file.lang} · {lines.length} lines
                {file.imports.length > 0 && <> · imports {file.imports.map((p) => <button key={p} className="ml-1 underline-offset-2 hover:text-sonar hover:underline" onClick={() => openFile(p)}>{p.split("/").pop()}</button>)}</>}
              </div>
            )}
          </div>
          <button className="rounded px-2 py-1 text-ink-dim hover:text-ink" onClick={() => keel.set({ viewer: null })} aria-label="Close">✕</button>
        </header>
        <div className="overflow-auto py-2 font-mono text-[12px] leading-5">
          {err && <p className="px-4 text-alarm">{err}</p>}
          {!file && !err && <p className="flex items-center gap-2 px-4 text-ink-faint"><Spinner /> Loading…</p>}
          {lines.map((l, i) => {
            const n = i + 1;
            const on = start > 0 && n >= start && n <= end;
            return (
              <div key={n} ref={n === start ? hl : undefined} className={`flex ${on ? "bg-sonar/10" : ""}`}>
                <span className={`w-12 shrink-0 select-none pr-3 text-right ${on ? "text-sonar" : "text-ink-faint/60"}`}>{n}</span>
                <pre className="whitespace-pre-wrap break-all pr-4 text-ink/90">{l || " "}</pre>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
