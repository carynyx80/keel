"use client";
import { useKeel } from "@/lib/client/store";
import { Spinner } from "./ui/bits";

const CALL: Record<string, string> = { planner: "NAV", reader: "DIVER", synthesizer: "CHART", verifier: "AUDIT" };

function callSign(role: string, id: string) {
  const n = id.match(/(\d+)$/)?.[1];
  return `${CALL[role] ?? role.toUpperCase()}${n ? "-" + n.padStart(2, "0") : ""}`;
}

/** Crew radio log: every agent transmission, newest first. */
export default function ActivityLog() {
  const log = useKeel((s) => s.log);
  const progress = useKeel((s) => s.progress);
  const out = log.filter((l) => l.status === "start").length;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between font-mono text-[10px] text-ink-faint">
        <span>{out ? <span className="text-amber">{out} crew below</span> : "all crew aboard"}</span>
        <span>{log.length} tx</span>
      </div>
      {progress && <p className="mb-2 flex items-center gap-2 font-mono text-[11px] text-ink-dim"><Spinner /> {progress}</p>}
      <ol className="min-h-0 flex-1 space-y-2 overflow-auto pr-1 font-mono text-[11px]" aria-live="polite">
        {log.length === 0 && <li className="leading-relaxed text-ink-faint">Channel quiet. When a station runs, its navigator, divers and chart-maker report here as they work.</li>}
        {[...log].reverse().map((l, i) => (
          <li key={`${l.module}-${l.id}-${l.t}-${i}`} className="animate-rise">
            <div className="flex items-center gap-2">
              <span className={`lamp ${l.status === "error" ? "text-alarm" : l.status === "start" ? "animate-blink text-amber" : "text-sonar"}`} />
              <span className={l.status === "start" ? "text-amber" : l.status === "error" ? "text-alarm" : "text-sonar"}>{callSign(l.role, l.id)}</span>
              <span className="text-ink-faint">{new Date(l.t).toISOString().slice(11, 19)}</span>
            </div>
            <div className="ml-3.5 border-l pl-2.5 text-ink/85" style={{ borderColor: "var(--line)" }}>
              {l.label.replace(/^[A-Za-z]+( \d+)?: /, "")}
              {l.detail && <span className="mt-0.5 block line-clamp-2 text-ink-faint" title={l.detail}>{l.detail}</span>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
