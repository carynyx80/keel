"use client";
import { useEffect, useState } from "react";

const LINES = [
  "KEEL/OS v1.0 — subsurface code recon",
  "pressure hull ............ SEALED",
  "sonar array .............. ONLINE",
  "agent crew bay ........... 4 BERTHS READY",
  "model uplink ............. CHECKING",
  "ballast .................. TRIM NEUTRAL",
  "ready to dive.",
];

/** One-time boot sequence per browser session. Skippable; skipped entirely for reduced motion. */
export default function BootSequence() {
  const [shown, setShown] = useState(0);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem("keel.booted") === "1"; } catch {}
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (seen || reduced) return;
    setOpen(true);
    let i = 0;
    const t = setInterval(() => {
      i++;
      setShown(i);
      if (i >= LINES.length) {
        clearInterval(t);
        setTimeout(close, 650);
      }
    }, 230);
    return () => clearInterval(t);
  }, []);

  function close() {
    try { sessionStorage.setItem("keel.booted", "1"); } catch {}
    setLeaving(true);
    setTimeout(() => setOpen(false), 450);
  }

  if (!open) return null;
  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center bg-abyss transition-opacity duration-500 ${leaving ? "opacity-0" : "opacity-100"}`}
      onClick={close}
      role="presentation"
    >
      <div className="w-[min(520px,90vw)] font-mono text-[12px] leading-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="relative flex h-10 w-10 items-center justify-center">
            <span className="absolute inset-0 rounded-full border border-sonar/30" />
            <span className="absolute inset-0 animate-sweep rounded-full" style={{ background: "conic-gradient(from 0deg, rgba(53,242,194,.55), transparent 25%)" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-sonar shadow-[0_0_10px_#35f2c2]" />
          </span>
          <span className="font-hud text-xl font-bold tracking-[0.45em] text-ink">KEEL</span>
        </div>
        {LINES.slice(0, shown).map((l, i) => (
          <div key={i} className={`animate-rise ${i === LINES.length - 1 ? "text-sonar" : "text-ink-dim"}`}>
            <span className="text-sonar/60">›</span> {l}
          </div>
        ))}
        <div className="mt-5 h-[2px] w-full bg-sonar/10">
          <div className="h-full bg-sonar shadow-[0_0_10px_#35f2c2] transition-all duration-200" style={{ width: `${(shown / LINES.length) * 100}%` }} />
        </div>
        <p className="mt-3 text-[10px] uppercase tracking-[0.3em] text-ink-faint">click to skip</p>
      </div>
    </div>
  );
}
