import Link from "next/link";
import { KeelcodeMark, Wordmark } from "@/components/brand/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <KeelcodeMark size={88} ping className="drop-shadow-[0_0_20px_rgba(53,242,194,.55)]" />
      <Wordmark height={22} />
      <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-amber">◇ Contact lost · 404 ◇</p>
      <p className="max-w-sm text-sm text-ink-dim">Nothing on sonar at these coordinates.</p>
      <Link href="/" className="btn btn-primary">▲ Surface to the bridge</Link>
    </main>
  );
}
