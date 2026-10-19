"use client";
import { useState, type ReactNode } from "react";

export function Button({ children, variant = "ghost", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const v =
    variant === "primary"
      ? "bg-sonar text-hull-950 hover:bg-sonar-glow disabled:bg-sonar/30 disabled:text-hull-950/60"
      : variant === "danger"
        ? "border border-alarm/40 text-alarm hover:bg-alarm/10"
        : "border border-white/10 text-ink hover:border-sonar/50 hover:text-sonar disabled:opacity-40";
  return (
    <button {...p} className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sonar/70 disabled:cursor-not-allowed ${v} ${className}`}>
      {children}
    </button>
  );
}

export function Panel({ title, right, children, className = "" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`glass rounded-xl ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-2.5">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dim">{title}</h3>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Tabs({ tabs, children }: { tabs: string[]; children: (active: number) => ReactNode }) {
  const [a, setA] = useState(0);
  return (
    <div>
      <div role="tablist" className="mb-3 flex flex-wrap gap-1">
        {tabs.map((t, i) => (
          <button key={t} role="tab" aria-selected={a === i} onClick={() => setA(i)} className={`rounded px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${a === i ? "bg-sonar/15 text-sonar" : "text-ink-faint hover:text-ink"}`}>
            {t}
          </button>
        ))}
      </div>
      {children(a)}
    </div>
  );
}

export function ErrorBox({ code, message }: { code: string; message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-alarm/40 bg-alarm/10 p-3 text-sm">
      <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-alarm">{code.replace(/_/g, " ")}</div>
      <p className="text-ink">{message}</p>
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button
      className="!px-2 !py-1 text-xs"
      onClick={() => navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1200); })}
    >
      {ok ? "Copied" : label}
    </Button>
  );
}

export function DownloadButton({ text, filename, label = "Download" }: { text: string; filename: string; label?: string }) {
  return (
    <Button
      className="!px-2 !py-1 text-xs"
      onClick={() => {
        const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
        const a = Object.assign(document.createElement("a"), { href: url, download: filename });
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      {label}
    </Button>
  );
}

export function Spinner() {
  return <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-sonar/30 border-t-sonar motion-reduce:animate-none" aria-hidden />;
}

export function CiteChip({ path, line, endLine, valid = true, onClick }: { path: string; line: number; endLine?: number; valid?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`cite ${valid ? "" : "cite-bad"}`} title={valid ? "Open in viewer" : "Citation points outside the file"}>
      {path}:{line}{endLine && endLine !== line ? `-${endLine}` : ""}
    </button>
  );
}
