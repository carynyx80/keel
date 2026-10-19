"use client";
import { useState, type ReactNode } from "react";

export function Button({ children, variant = "ghost", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  return (
    <button {...p} className={`btn ${variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : "btn-ghost"} ${className}`}>
      {children}
    </button>
  );
}

/** Instrument frame with corner brackets, a station code and a title strip. */
export function Hud({ title, code, right, children, className = "", bodyClass = "p-4", solid = false }: { title?: ReactNode; code?: string; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; solid?: boolean }) {
  return (
    <section className={`hud ${solid ? "hud-solid" : ""} ${className}`}>
      {(title || code) && (
        <header className="hud-head">
          <div className="flex min-w-0 items-center gap-2.5">
            {code && <span className="hud-code">{code}</span>}
            {title && <h3 className="hud-title truncate">{title}</h3>}
          </div>
          {right}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

/** Kept for existing call sites. */
export const Panel = ({ title, right, children, className = "" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) => (
  <Hud title={title} right={right} className={className}>{children}</Hud>
);

export function Tabs({ tabs, children }: { tabs: string[]; children: (active: number) => ReactNode }) {
  const [a, setA] = useState(0);
  return (
    <div>
      <div role="tablist" className="mb-4 flex flex-wrap border-b" style={{ borderColor: "var(--line)" }}>
        {tabs.map((t, i) => (
          <button
            key={t}
            role="tab"
            aria-selected={a === i}
            onClick={() => setA(i)}
            className={`relative -mb-px px-3 py-2 font-hud text-[11px] font-semibold uppercase tracking-[0.18em] transition ${a === i ? "text-sonar" : "text-ink-faint hover:text-ink"}`}
          >
            {t}
            <span className={`absolute inset-x-2 bottom-0 h-[2px] ${a === i ? "bg-sonar shadow-[0_0_10px_#35f2c2]" : "bg-transparent"}`} />
          </button>
        ))}
      </div>
      <div className="animate-rise">{children(a)}</div>
    </div>
  );
}

export function ErrorBox({ code, message }: { code: string; message: string }) {
  return (
    <div role="alert" className="relative border border-alarm/40 bg-alarm/[0.07] p-3 pl-4 text-sm">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-alarm shadow-[0_0_12px_#ff5a4f]" />
      <div className="mb-1 flex items-center gap-2 font-hud text-[10px] font-semibold uppercase tracking-[0.22em] text-alarm">
        <span className="lamp animate-blink" /> Alert · {code.replace(/_/g, " ")}
      </div>
      <p className="text-ink/90">{message}</p>
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button className="!px-2.5 !py-1 !text-[10px]" onClick={() => navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1200); })}>
      {ok ? "Copied ✓" : label}
    </Button>
  );
}

export function DownloadButton({ text, filename, label = "Download" }: { text: string; filename: string; label?: string }) {
  return (
    <Button
      className="!px-2.5 !py-1 !text-[10px]"
      onClick={() => {
        const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
        const a = Object.assign(document.createElement("a"), { href: url, download: filename });
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      ↓ {label}
    </Button>
  );
}

export function Spinner() {
  return (
    <span className="relative inline-flex h-3 w-3 items-center justify-center" aria-hidden>
      <span className="absolute h-3 w-3 rounded-full border border-sonar/30" />
      <span className="absolute h-3 w-3 animate-sweep rounded-full border-t border-sonar motion-reduce:animate-none" />
    </span>
  );
}

export function CiteChip({ path, line, endLine, valid = true, onClick }: { path: string; line: number; endLine?: number; valid?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`cite ${valid ? "" : "cite-bad"}`} title={valid ? "Open in viewer" : "Citation points outside the file"}>
      {path}:{line}{endLine && endLine !== line ? `-${endLine}` : ""}
    </button>
  );
}

/** Small labelled numeric readout used in the telemetry strip. */
export function Readout({ label, value, unit, tone = "ink" }: { label: string; value: ReactNode; unit?: string; tone?: "ink" | "sonar" | "amber" | "alarm" }) {
  const c = tone === "sonar" ? "text-sonar" : tone === "amber" ? "text-amber" : tone === "alarm" ? "text-alarm" : "text-ink";
  return (
    <div className="flex min-w-0 flex-col">
      <span className="label">{label}</span>
      <span className={`readout text-[15px] leading-tight ${c}`}>
        {value}
        {unit && <span className="ml-1 text-[10px] text-ink-faint">{unit}</span>}
      </span>
    </div>
  );
}
