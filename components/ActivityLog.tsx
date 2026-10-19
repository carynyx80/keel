"use client";
import { useKeel } from "@/lib/client/store";
import { Spinner } from "./ui/bits";

const ROLE: Record<string, string> = { planner: "PLN", reader: "RDR", synthesizer: "SYN", verifier: "VRF" };

export default function ActivityLog() {
  const log = useKeel((s) => s.log);
  const progress = useKeel((s) => s.progress);
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dim">Agent room</h3>
        <span className="font-mono text-[10px] text-ink-faint">{log.filter((l) => l.status === "start").length} active</span>
      </div>
      {progress && <p className="mb-2 flex items-center gap-2 text-xs text-ink-dim"><Spinner /> {progress}</p>}
      <ol className="min-h-0 flex-1 space-y-1 overflow-auto pr-1 font-mono text-[11px]" aria-live="polite">
        {log.length === 0 && <li className="text-ink-faint">Agents report here as they plan, read and synthesize.</li>}
        {[...log].reverse().map((l, i) => (
          <li key={`${l.module}-${l.id}-${l.t}-${i}`} className="flex gap-2">
            <span className={l.status === "error" ? "text-alarm" : l.status === "start" ? "text-[#ffb86b]" : "text-sonar"}>
              {l.status === "start" ? "●" : l.status === "error" ? "✕" : "✓"}
            </span>
            <span className="text-ink-faint">{ROLE[l.role] ?? l.role}</span>
            <span className="min-w-0 flex-1">
              <span className="text-ink/90">{l.label}</span>
              {l.detail && <span className="block truncate text-ink-faint" title={l.detail}>{l.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
