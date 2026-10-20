"use client";
import { useRef, useState } from "react";
import { loadSource, runModule } from "@/lib/client/actions";
import { kc, useKeelcode } from "@/lib/client/store";
import { Button, Spinner } from "./ui/bits";

const MAX_ZIP = 3 * 1024 * 1024;

export default function SourceBar() {
  const ingesting = useKeelcode((s) => s.ingesting);
  const label = useKeelcode((s) => s.sourceLabel);
  const summary = useKeelcode((s) => s.summary);
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const demo = async () => {
    setErr("");
    kc.set({ active: "cartograph" });
    if ((await loadSource({ kind: "demo" }, "harbor-api (demo)")) && kc.get().hasApiKey) runModule("cartograph");
  };
  const clone = () => {
    setErr("");
    const u = url.trim();
    if (!/^https:\/\//.test(u)) return setErr("Enter a public https:// Git URL");
    const [repo, ref] = u.split("#");
    loadSource({ kind: "git", url: repo, ref }, repo.replace(/^https:\/\/(www\.)?/, ""));
  };
  const upload = async (f: File) => {
    setErr("");
    if (!/\.zip$/i.test(f.name)) return setErr("Upload a .zip archive");
    if (f.size > MAX_ZIP) return setErr(`Zip is ${(f.size / 1e6).toFixed(1)} MB — limit is 3 MB. Remove node_modules/build output first.`);
    const buf = new Uint8Array(await f.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    loadSource({ kind: "zip", name: f.name, base64: btoa(bin) }, f.name);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={demo} disabled={ingesting}>
          {ingesting && label.includes("demo") ? <Spinner /> : "▶"} Demo vessel
        </Button>
        <form className="order-last flex w-full min-w-0 items-center gap-2 sm:order-none sm:w-auto sm:flex-1" onSubmit={(e) => { e.preventDefault(); clone(); }}>
          <label className="sr-only" htmlFor="git-url">Public Git URL</label>
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-sonar/60">GIT›</span>
            <input id="git-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo  (#branch)" className="field w-full !pl-11" />
          </div>
          <Button type="submit" disabled={ingesting || !url}>Dive</Button>
        </form>
        <Button onClick={() => fileInput.current?.click()} disabled={ingesting}>↑ Zip</Button>
        <input ref={fileInput} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      {err && <p className="font-mono text-[11px] text-alarm">⚠ {err}</p>}
      {summary && (
        <p className="truncate font-mono text-[10.5px] text-ink-faint">
          <span className="text-sonar">◆ {summary.name}</span> · {summary.fileCount} files · {summary.totalLines.toLocaleString()} lines ·{" "}
          {Object.entries(summary.languages).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([l]) => l).join(" / ")}
          {summary.truncated && <span className="text-amber"> · truncated to fit serverless limits</span>}
        </p>
      )}
    </div>
  );
}
