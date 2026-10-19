"use client";
import { useEffect, useRef } from "react";
import { scope } from "@/lib/client/scope";
import { useKeel } from "@/lib/client/store";
import { stageOffsetX } from "../scene/layout";

/** Reticle, bearing tape and depth gauge drawn over the 3D stage. Reads camera telemetry via rAF. */
export default function StageOverlay() {
  const hasRepo = useKeel((s) => !!s.summary);
  const tape = useRef<HTMLDivElement>(null);
  const brg = useRef<HTMLSpanElement>(null);
  const rng = useRef<HTMLSpanElement>(null);
  const pitch = useRef<HTMLSpanElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const w = window.innerWidth;
      const dx = stageOffsetX(w, hasRepo);
      if (wrap.current) wrap.current.style.transform = `translateX(${-dx}px)`;
      document.documentElement.style.setProperty("--stage-dx", `${dx}px`);
      if (tape.current) tape.current.style.transform = `translateX(${180 - (scope.bearing + 360) * 4}px)`;
      if (brg.current) brg.current.textContent = String(Math.round(scope.bearing)).padStart(3, "0");
      if (rng.current) rng.current.textContent = scope.range.toFixed(0);
      if (pitch.current) pitch.current.textContent = (scope.pitch >= 0 ? "+" : "") + scope.pitch.toFixed(0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hasRepo]);

  const ticks = Array.from({ length: 145 }, (_, i) => i * 10 - 360);
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] hidden md:block" aria-hidden>
      <div ref={wrap} className="absolute inset-0">
        {/* Reticle */}
        <svg className="absolute left-1/2 top-1/2 h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 opacity-[0.22]" viewBox="0 0 220 220">
          <circle cx="110" cy="110" r="100" fill="none" stroke="#35f2c2" strokeDasharray="2 6" />
          <circle cx="110" cy="110" r="60" fill="none" stroke="#35f2c2" strokeOpacity=".5" />
          <path d="M110 0v28M110 192v28M0 110h28M192 110h28" stroke="#35f2c2" />
          <path d="M104 110h12M110 104v12" stroke="#35f2c2" />
        </svg>
        {/* Bearing tape */}
        <div className="absolute left-1/2 top-[132px] w-[360px] -translate-x-1/2 overflow-hidden" style={{ maskImage: "linear-gradient(90deg, transparent, #000 25%, #000 75%, transparent)" }}>
          <div ref={tape} className="relative flex h-6 w-[5800px]">
            {ticks.map((d) => (
              <div key={d} className="relative w-[40px] shrink-0">
                <div className={`absolute left-0 top-0 w-px bg-sonar/50 ${d % 30 === 0 ? "h-3" : "h-1.5"}`} />
                {d % 30 === 0 && <span className="absolute left-1 top-2.5 font-mono text-[8px] text-sonar/60">{String(((d % 360) + 360) % 360).padStart(3, "0")}</span>}
              </div>
            ))}
          </div>
          <div className="absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-amber shadow-[0_0_6px_#ffb547]" />
        </div>
        <div className="absolute left-1/2 top-[160px] -translate-x-1/2 font-mono text-[10px] tracking-[0.2em] text-sonar/70">
          BRG <span ref={brg} className="text-ink">000</span>° · ELV <span ref={pitch} className="text-ink">+0</span>° · RNG <span ref={rng} className="text-ink">0</span>
        </div>
      </div>
    </div>
  );
}
