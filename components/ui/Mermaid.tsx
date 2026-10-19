"use client";
import { useEffect, useId, useState } from "react";

let ready: Promise<typeof import("mermaid").default> | null = null;
function load() {
  ready ??= import("mermaid").then((m) => {
    m.default.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: {
        darkMode: true,
        background: "transparent",
        primaryColor: "#0a1824",
        primaryBorderColor: "#35f2c2",
        primaryTextColor: "#d7f2ea",
        lineColor: "#2b8f78",
        secondaryColor: "#061019",
        tertiaryColor: "#03080d",
        fontFamily: "IBM Plex Mono, ui-monospace, monospace",
        fontSize: "12px",
      },
    });
    return m.default;
  });
  return ready;
}

export default function Mermaid({ code }: { code: string }) {
  const id = useId().replace(/[^\w]/g, "");
  const [svg, setSvg] = useState<string>("");
  const [err, setErr] = useState<string>("");
  useEffect(() => {
    let alive = true;
    setErr("");
    load()
      .then((m) => m.render(`mmd${id}${Math.random().toString(36).slice(2, 7)}`, code))
      .then((r) => alive && setSvg(r.svg))
      .catch((e) => alive && setErr(String(e?.message || e)));
    return () => { alive = false; };
  }, [code, id]);
  if (err)
    return (
      <div className="border border-alarm/30 bg-alarm/5 p-3 text-xs">
        <p className="mb-2 text-alarm">Diagram didn&apos;t parse — showing the Mermaid source instead.</p>
        <pre className="overflow-auto text-ink-dim">{code}</pre>
      </div>
    );
  return <div className="mermaid-box overflow-auto border border-sonar/10 bg-abyss/40 p-3" dangerouslySetInnerHTML={{ __html: svg || '<p class="text-ink-faint text-xs">Rendering diagram…</p>' }} />;
}
