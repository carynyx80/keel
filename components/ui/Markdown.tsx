"use client";
import { useMemo } from "react";
import { Marked } from "marked";
import { openFile } from "@/lib/client/actions";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Model output is untrusted: raw HTML is escaped, links are limited to http(s)/relative and citation anchors.
const md = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html(token) {
      return esc(token.text);
    },
    link(token) {
      const text = this.parser.parseInline(token.tokens);
      const href = token.href || "";
      const cite = href.match(/^#cite:(.+):(\d+):(\d*)$/);
      if (cite) return `<button type="button" class="cite" data-path="${esc(cite[1])}" data-line="${cite[2]}" data-end="${cite[3]}">${text}</button>`;
      if (!/^(https?:|\/|#|\.)/i.test(href)) return text;
      return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    image(token) {
      return esc(token.text || "");
    },
  },
});

const CITE = /\[\[([^\]\s:]+):(\d+)(?:-(\d+))?\]\]/g;

export function linkifyCitations(text: string) {
  return text.replace(CITE, (_, p, a, b) => `[${p}:${a}${b ? `-${b}` : ""}](#cite:${p}:${a}:${b ?? ""})`);
}

export default function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const html = useMemo(() => md.parse(linkifyCitations(text), { async: false }) as string, [text]);
  return (
    <div
      className={`prose-keelcode ${className}`}
      onClick={(e) => {
        const el = (e.target as HTMLElement).closest("button.cite") as HTMLElement | null;
        if (!el) return;
        openFile(el.dataset.path!, Number(el.dataset.line), el.dataset.end ? Number(el.dataset.end) : undefined);
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
