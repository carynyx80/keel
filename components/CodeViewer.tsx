"use client";
import { useEffect, useRef, useState } from "react";
import { kc, pulse, useKeelcode } from "@/lib/client/store";
import { fetchFile, openFile } from "@/lib/client/actions";
import { Spinner } from "./ui/bits";
import { KeelcodeMark } from "./brand/Logo";

/** Inspection port: the source of a contact, with the cited lines lit. */
export default function CodeViewer() {
  const viewer = useKeelcode((s) => s.viewer);
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") kc.set({ viewer: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!viewer) return null;
  const start = viewer.line ?? 0;
  const end = viewer.endLine ?? start;
  const lines = file?.content.split("\n") ?? [];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-abyss/70 p-0 backdrop-blur-[2px] md:items-center md:p-8" onClick={() => kc.set({ viewer: null })}>
      <div role="dialog" aria-label={`Source of ${viewer.path}`} className="hud hud-solid flex max-h-[86vh] w-full max-w-4xl animate-rise flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="hud-head !py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <KeelcodeMark size={16} /><span className="hud-code">INSPECT</span>
              <span className="truncate font-mono text-[13px] text-ink">{viewer.path}</span>
              {start ? <span className="font-mono text-[13px] text-sonar">:{start}{end > start ? `-${end}` : ""}</span> : null}
            </div>
            {file && (
              <div className="mt-0.5 truncate font-mono text-[10.5px] text-ink-faint">
                {file.lang} · {lines.length} lines
                {file.imports.length > 0 && <> · links → {file.imports.map((p) => <button key={p} className="ml-1.5 text-sonar/80 underline-offset-2 hover:text-sonar hover:underline" onClick={() => openFile(p)}>{p.split("/").pop()}</button>)}</>}
              </div>
            )}
          </div>
          <button className="px-2 py-1 font-mono text-ink-dim hover:text-ink" onClick={() => kc.set({ viewer: null })} aria-label="Close">ESC ✕</button>
        </header>
        <div className="overflow-auto py-2 font-mono text-[12px] leading-5">
          {err && <p className="px-4 text-alarm">⚠ {err}</p>}
          {!file && !err && <p className="flex items-center gap-2 px-4 text-ink-faint"><KeelcodeMark size={18} ping /> Retrieving from the hull…</p>}
          {lines.map((l, i) => {
            const n = i + 1;
            const on = start > 0 && n >= start && n <= end;
            return (
              <div key={n} ref={n === start ? hl : undefined} className={`relative flex ${on ? "bg-sonar/[0.09]" : ""}`}>
                {on && <span className="absolute inset-y-0 left-0 w-[2px] bg-sonar shadow-[0_0_8px_#35f2c2]" />}
                <span className={`w-14 shrink-0 select-none pr-4 text-right ${on ? "text-sonar" : "text-ink-faint/60"}`}>{n}</span>
                <pre className="whitespace-pre-wrap break-all pr-4 text-ink/90">{l || " "}</pre>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
