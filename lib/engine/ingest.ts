import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import JSZip from "jszip";
import { DEMO_FILES, DEMO_REPO_NAME } from "@/lib/demo/bundle.generated";
import { KeelcodeError, type RepoSource } from "./types";

// Honest limits for serverless: small/medium repos only.
export const LIMITS = {
  zipBytes: 3 * 1024 * 1024, // compressed upload (Vercel request bodies cap at 4.5 MB, base64 adds 33%)
  unpackedBytes: 40 * 1024 * 1024, // total checkout size
  maxFiles: 600, // files kept for indexing
  maxFileBytes: 200 * 1024, // single source file
  maxIndexedBytes: 4 * 1024 * 1024, // total text indexed
  cloneTimeoutMs: 45_000,
};

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", "vendor", "target", "__pycache__", ".venv", "venv",
  "coverage", ".turbo", ".cache", "bin", "obj", ".idea", ".vscode",
]);
const SKIP_FILES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|go\.sum|composer\.lock)$|\.min\.(js|css)$|\.map$/;
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|kt|rs|php|cs|c|h|cpp|hpp|swift|scala|sql|graphql|proto|ya?ml|json|toml|md|txt|sh|html|css|scss|vue|svelte|ex|exs|lua|dart|tf|ini|env\.example)$/i;
const TEXT_NAMES = /(^|\/)(Dockerfile|Makefile|Procfile|Gemfile|Rakefile|\.gitignore)$/;

export interface RawRepo {
  repoId: string;
  name: string;
  files: Map<string, string>;
  skipped: number;
  truncated: boolean;
}

export function sourceKey(source: RepoSource): string {
  const h = createHash("sha256");
  if (source.kind === "demo") h.update("demo:" + JSON.stringify(Object.keys(DEMO_FILES)) + Object.values(DEMO_FILES).join("").length);
  else if (source.kind === "git") h.update("git:" + normalizeGitUrl(source.url) + "#" + (source.ref ?? ""));
  else h.update("zip:" + source.base64);
  return h.digest("hex").slice(0, 16);
}

function normalizeGitUrl(url: string) {
  return url.trim().replace(/\/+$/, "").replace(/\.git$/, "");
}

function keep(p: string): boolean {
  const parts = p.split("/");
  if (parts.some((s) => SKIP_DIRS.has(s))) return false;
  if (SKIP_FILES.test(p)) return false;
  return TEXT_EXT.test(p) || TEXT_NAMES.test(p);
}

function looksBinary(s: string) {
  return s.slice(0, 2000).includes("\u0000");
}

/** Applies the file/byte caps and returns the kept text files. */
function collect(entries: Iterable<[string, string]>): { files: Map<string, string>; skipped: number; truncated: boolean } {
  const files = new Map<string, string>();
  let skipped = 0;
  let total = 0;
  let truncated = false;
  // Prefer source over docs/config when we have to truncate.
  const sorted = [...entries].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
  for (const [p, content] of sorted) {
    if (!keep(p) || content.length > LIMITS.maxFileBytes || looksBinary(content)) {
      skipped++;
      continue;
    }
    if (files.size >= LIMITS.maxFiles || total + content.length > LIMITS.maxIndexedBytes) {
      truncated = true;
      skipped++;
      continue;
    }
    total += content.length;
    files.set(p, content);
  }
  return { files, skipped, truncated };
}

function rank(p: string) {
  if (/\.(md|txt|json|ya?ml|toml|ini)$/i.test(p)) return 1;
  if (/(^|\/)(test|tests|__tests__|spec)\//.test(p)) return 2;
  return 0;
}

export async function ingest(source: RepoSource, onProgress: (msg: string) => void): Promise<RawRepo> {
  const repoId = sourceKey(source);
  if (source.kind === "demo") {
    onProgress("Loading bundled demo repo (harbor-api)…");
    const { files, skipped, truncated } = collect(Object.entries(DEMO_FILES));
    return { repoId, name: DEMO_REPO_NAME, files, skipped, truncated };
  }
  if (source.kind === "zip") return ingestZip(repoId, source, onProgress);
  return ingestGit(repoId, source, onProgress);
}

async function ingestZip(repoId: string, source: Extract<RepoSource, { kind: "zip" }>, onProgress: (m: string) => void): Promise<RawRepo> {
  const buf = Buffer.from(source.base64, "base64");
  if (buf.length > LIMITS.zipBytes)
    throw new KeelcodeError("REPO_TOO_LARGE", `Zip is ${(buf.length / 1e6).toFixed(1)} MB; the limit is ${LIMITS.zipBytes / 1e6} MB. Strip node_modules/build output or upload a sub-folder.`, 413);
  onProgress(`Unpacking ${source.name} (${(buf.length / 1024).toFixed(0)} KB)…`);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new KeelcodeError("BAD_ZIP", "That file isn't a readable zip archive.");
  }
  const entries: [string, string][] = [];
  let unpacked = 0;
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  // Strip a single shared top-level folder (GitHub "Download ZIP" style).
  const tops = new Set(names.map((n) => n.split("/")[0]));
  const strip = tops.size === 1 && names.every((n) => n.includes("/")) ? [...tops][0] + "/" : "";
  for (const n of names) {
    const rel = n.slice(strip.length);
    if (n.startsWith("__MACOSX/") || !keep(rel)) continue;
    const content = await zip.files[n].async("string");
    unpacked += content.length;
    if (unpacked > LIMITS.unpackedBytes) throw new KeelcodeError("REPO_TOO_LARGE", "Archive expands past 40 MB of text — too large for a serverless run.", 413);
    entries.push([rel, content]);
  }
  const { files, skipped, truncated } = collect(entries);
  if (files.size === 0) throw new KeelcodeError("EMPTY_REPO", "No readable source files found in the archive.");
  return { repoId, name: source.name.replace(/\.zip$/i, ""), files, skipped: skipped + (names.length - entries.length), truncated };
}

async function ingestGit(repoId: string, source: Extract<RepoSource, { kind: "git" }>, onProgress: (m: string) => void): Promise<RawRepo> {
  const url = normalizeGitUrl(source.url);
  if (!/^https:\/\/[\w.-]+\/[\w.~-]+\/[\w.~-]+$/.test(url) && !/^https:\/\/[\w.-]+\/[\w.~/-]+$/.test(url))
    throw new KeelcodeError("BAD_URL", "Use a public HTTPS Git URL, e.g. https://github.com/owner/repo");
  const dir = path.join(os.tmpdir(), "keel", repoId);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  onProgress(`Cloning ${url} (shallow)…`);

  let lastPhase = "";
  const clone = git.clone({
    fs,
    http,
    dir,
    url: url + ".git",
    ref: source.ref || undefined,
    singleBranch: true,
    depth: 1,
    noTags: true,
    onProgress: (p) => {
      if (p.phase !== lastPhase) {
        lastPhase = p.phase;
        onProgress(`git: ${p.phase}…`);
      }
    },
  });
  const timeout = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new KeelcodeError("CLONE_TIMEOUT", `Clone took longer than ${LIMITS.cloneTimeoutMs / 1000}s. The repo is probably too large for a serverless run; upload a zip of the folder you care about instead.`, 504)), LIMITS.cloneTimeoutMs)
  );
  try {
    await Promise.race([clone, timeout]);
  } catch (e) {
    if (e instanceof KeelcodeError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/401|403|auth/i.test(msg)) throw new KeelcodeError("CLONE_FAILED", "Clone was refused — the repo is private or the URL is wrong. Keelcode only clones public repos; upload a zip for private code.", 400);
    if (/404|not found/i.test(msg)) throw new KeelcodeError("CLONE_FAILED", "Repository not found. Check the URL (and branch, if you set one).", 404);
    throw new KeelcodeError("CLONE_FAILED", `Clone failed: ${msg}`, 502);
  }

  onProgress("Reading checkout…");
  const entries: [string, string][] = [];
  let bytes = 0;
  async function walk(abs: string, rel: string) {
    for (const ent of await readdir(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name)) await walk(path.join(abs, ent.name), r);
      } else if (ent.isFile() && keep(r)) {
        const s = await stat(path.join(abs, ent.name));
        bytes += s.size;
        if (bytes > LIMITS.unpackedBytes) throw new KeelcodeError("REPO_TOO_LARGE", "Repository source exceeds 40 MB — too large for a serverless run. Upload a zip of a sub-folder instead.", 413);
        if (s.size <= LIMITS.maxFileBytes) entries.push([r, await readFile(path.join(abs, ent.name), "utf8")]);
      }
    }
  }
  await walk(dir, "");
  rm(dir, { recursive: true, force: true }).catch(() => {});
  const { files, skipped, truncated } = collect(entries);
  if (files.size === 0) throw new KeelcodeError("EMPTY_REPO", "No readable source files found in that repository.");
  return { repoId, name: url.split("/").slice(-1)[0], files, skipped, truncated };
}
