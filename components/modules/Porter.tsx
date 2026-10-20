"use client";
import { useEffect, useMemo, useState } from "react";
import { runModule, openFile } from "@/lib/client/actions";
import { useKeelcode } from "@/lib/client/store";
import type { CaseResult, PorterResult } from "@/lib/modules/porter";
import Markdown from "../ui/Markdown";
import { CopyButton, DownloadButton, Tabs } from "../ui/bits";
import { RunBar, useRun } from "./common";

const TARGETS: [string, string][] = [["typescript", "TypeScript (executed)"], ["javascript", "JavaScript ESM (executed)"], ["python", "Python (model-traced)"], ["go", "Go (model-traced)"], ["rust", "Rust (model-traced)"]];
const fmt = (o: CaseResult["original"]) => (!o ? "—" : o.ok ? JSON.stringify(o.value) : `throws ${o.error}`);

function Gauge({ value, tone }: { value: number; tone: string }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0" aria-label={`${Math.round(value * 100)} percent equivalent`}>
      <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(110,255,214,.12)" strokeWidth="5" />
      <circle cx="36" cy="36" r={r} fill="none" stroke={tone} strokeWidth="5" strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 36 36)" style={{ filter: `drop-shadow(0 0 6px ${tone})`, transition: "stroke-dasharray .8s ease" }} />
      {Array.from({ length: 24 }, (_, i) => (
        <line key={i} x1="36" y1="4" x2="36" y2={i % 6 ? "6" : "8"} stroke="rgba(110,255,214,.35)" transform={`rotate(${i * 15} 36 36)`} />
      ))}
      <text x="36" y="40" textAnchor="middle" className="fill-ink font-mono" fontSize="14">{Math.round(value * 100)}%</text>
    </svg>
  );
}

export default function Porter() {
  const run = useRun("porter");
  const files = useKeelcode((s) => s.files);
  const candidates = useMemo(() => files.filter((f) => /Script|Python|Go|Ruby|Java|Rust|Kotlin|PHP/.test(f.lang) && !/(^|\/)(test|tests|__tests__)\/|\.(test|spec)\./.test(f.path) && f.lines <= 600), [files]);
  const [path, setPath] = useState("");
  const [target, setTarget] = useState("typescript");
  useEffect(() => {
    if (!candidates.some((c) => c.path === path)) setPath(candidates.find((c) => /pricing|util|lib/.test(c.path))?.path ?? candidates[0]?.path ?? "");
  }, [candidates, path]);

  const r = run.result as PorterResult | undefined;
  const cases = (r?.equivalence.cases ?? run.partials.case ?? []) as CaseResult[];
  const code = r?.code ?? (run.partials.code?.[0] as { code: string } | undefined)?.code;
  const contract = (run.partials.contract?.[0] as { behavior: string } | undefined)?.behavior;

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-dim">Recovers a module&apos;s contract from source + tests, re-implements it in another language, then checks both against the same cases.</p>
      <RunBar m="porter" label="Port module" onRun={() => runModule("porter", { path, target })} disabled={!path}>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-ink-faint">Module
          <select value={path} onChange={(e) => setPath(e.target.value)} className="field">
            {candidates.map((c) => <option key={c.path} value={c.path}>{c.path} ({c.lines})</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-ink-faint">Target
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="field">
            {TARGETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </RunBar>

      {r && (
        <div className={`flex items-center gap-4 border p-3 ${r.equivalence.score === 1 ? "border-sonar/40 bg-sonar/5" : "border-amber/40 bg-amber/5"}`}>
          <Gauge value={r.equivalence.score} tone={r.equivalence.score === 1 ? "#35f2c2" : "#ffb547"} />
          <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="font-hud text-sm font-semibold uppercase tracking-[0.14em] text-ink">Equivalence <span className="font-mono text-xs normal-case tracking-normal text-ink-dim">{r.equivalence.passed}/{r.equivalence.total} contract cases</span></div>
            <span className={`px-2 py-0.5 font-hud text-[10px] font-semibold uppercase tracking-[0.18em] tracking-wider ${r.equivalence.method === "executed" ? "bg-sonar/15 text-sonar" : "bg-amber/15 text-amber"}`}>{r.equivalence.method}</span>
          </div>
          <p className="mt-1 text-xs text-ink-dim">{r.equivalence.methodNote}</p>
          {r.testsUsed.length > 0 && <p className="mt-1 text-xs text-ink-faint">Contract seeded from: {r.testsUsed.map((t) => <button key={t} className="cite ml-1" onClick={() => openFile(t)}>{t}</button>)}</p>}
          </div>
        </div>
      )}

      {contract && !r && <details className="text-xs text-ink-dim"><summary className="cursor-pointer text-ink-faint">Recovered contract</summary><div className="mt-2"><Markdown text={contract} /></div></details>}

      {(cases.length > 0 || code) && (
        <Tabs tabs={["Cases", "Ported code", "Diff", "Notes"]}>
          {(t) =>
            t === 0 ? (
              <div className="overflow-auto">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="text-ink-faint"><tr><th className="py-1 pr-2"></th><th className="pr-2">call</th><th className="pr-2">original</th><th>port</th></tr></thead>
                  <tbody>
                    {cases.map((c, i) => (
                      <tr key={i} className="border-t border-sonar/10 align-top" title={c.description}>
                        <td className={`py-1 pr-2 ${c.pass ? "text-sonar" : "text-alarm"}`}>{c.pass ? "✓" : "✕"}</td>
                        <td className="max-w-[180px] break-all pr-2 text-ink/90">{c.fn}({c.args.map((a) => JSON.stringify(a)).join(", ")})</td>
                        <td className="max-w-[160px] break-all pr-2 text-ink-dim">{fmt(c.original)}</td>
                        <td className="max-w-[160px] break-all text-ink-dim">{fmt(c.ported)}{c.note ? <span className="block text-ink-faint">{c.note}</span> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {run.running && <p className="mt-2 text-xs text-ink-faint">Running cases…</p>}
              </div>
            ) : t === 1 ? (
              code ? (
                <div>
                  {r && <div className="mb-2 flex items-center gap-2"><span className="font-mono text-xs text-sonar">{r.targetPath}</span><CopyButton text={code} /><DownloadButton text={code} filename={r.targetPath.split("/").pop()!} /></div>}
                  <pre className="max-h-[50vh] overflow-auto border border-sonar/10 bg-abyss/70 p-3 font-mono text-[11px] leading-5 text-ink/90">{code}</pre>
                </div>
              ) : <p className="text-xs text-ink-faint">Porting…</p>
            ) : t === 2 ? (
              r ? (
                <pre className="max-h-[50vh] overflow-auto border border-sonar/10 bg-abyss/70 p-3 font-mono text-[11px] leading-5">
                  {r.diff.map((d, i) => <div key={i} className={d.op === "+" ? "bg-sonar/10 text-sonar" : d.op === "-" ? "bg-alarm/10 text-alarm" : "text-ink-faint"}>{d.op} {d.text}</div>)}
                </pre>
              ) : <p className="text-xs text-ink-faint">Diff appears when the port finishes.</p>
            ) : r ? <Markdown text={`${r.notes}\n\n**Recovered contract**\n\n${r.behavior}`} /> : <p className="text-xs text-ink-faint">Notes appear when the port finishes.</p>
          }
        </Tabs>
      )}
    </div>
  );
}
