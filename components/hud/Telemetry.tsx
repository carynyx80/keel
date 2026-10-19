"use client";
import { useEffect, useState } from "react";
import { useKeel } from "@/lib/client/store";
import { Readout } from "../ui/bits";

function useClock() {
  const [t, setT] = useState("--:--:--");
  useEffect(() => {
    const tick = () => setT(new Date().toISOString().slice(11, 19));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);
  return t;
}

/** Live readouts derived from the indexed repo and the crew's state. */
export default function Telemetry() {
  const graph = useKeel((s) => s.graph);
  const summary = useKeel((s) => s.summary);
  const log = useKeel((s) => s.log);
  const hasKey = useKeel((s) => s.hasApiKey);
  const model = useKeel((s) => s.model);
  const clock = useClock();
  const crew = log.filter((l) => l.status === "start").length;
  return (
    <div className="flex items-end gap-5">
      <Readout label="Compartments" value={graph?.modules.length ?? "—"} />
      <Readout label="Contacts" value={summary?.fileCount ?? "—"} />
      <Readout label="Conduits" value={graph?.edges.length ?? "—"} />
      <Readout label="Hull" value={summary ? summary.totalLines.toLocaleString() : "—"} unit="ln" />
      <Readout label="Crew out" value={crew} tone={crew ? "amber" : "ink"} />
      <div className="flex flex-col">
        <span className="label">Uplink</span>
        <span className="flex items-center gap-1.5 font-mono text-[11px]">
          <span className={`lamp ${hasKey ? "text-sonar" : hasKey === false ? "animate-blink text-alarm" : "text-ink-faint"}`} />
          <span className={hasKey ? "text-ink" : "text-ink-faint"}>{hasKey ? model || "online" : hasKey === false ? "no key" : "…"}</span>
        </span>
      </div>
      <Readout label="UTC" value={clock} tone="sonar" />
    </div>
  );
}
