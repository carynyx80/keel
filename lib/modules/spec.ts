import "server-only";
import { load as loadYaml } from "js-yaml";
import { callJSON, S } from "@/lib/engine/llm";
import { findingsText, plan, read, type Emit } from "@/lib/engine/dispatch";
import { fileTree, type RepoIndex } from "@/lib/engine/indexer";
import type { Citation } from "@/lib/engine/types";

interface Entity { name: string; fields: { name: string; type: string; key: "pk" | "fk" | "none"; references: string; note: string }[] }

export interface SpecResult {
  openapiYaml: string;
  openapiValid: boolean;
  openapiIssues: string[];
  endpointCount: number;
  entities: Entity[];
  relations: { from: string; to: string; cardinality: "one-to-one" | "one-to-many" | "many-to-many"; label: string }[];
  erMermaid: string;
  rules: { id: string; rule: string; category: string; citation: Citation }[];
}

const safe = (s: string) => s.replace(/[^\w]/g, "_") || "x";

function erDiagram(entities: Entity[], relations: SpecResult["relations"]) {
  const card = { "one-to-one": "||--||", "one-to-many": "||--o{", "many-to-many": "}o--o{" } as const;
  const lines = ["erDiagram"];
  for (const e of entities) {
    lines.push(`  ${safe(e.name)} {`);
    for (const f of e.fields) lines.push(`    ${safe(f.type.split(/[<\[ |]/)[0] || "string")} ${safe(f.name)}${f.key !== "none" ? " " + f.key.toUpperCase() : ""}`);
    lines.push("  }");
  }
  const names = new Set(entities.map((e) => safe(e.name)));
  for (const r of relations) {
    if (!names.has(safe(r.from)) || !names.has(safe(r.to))) continue;
    lines.push(`  ${safe(r.from)} ${card[r.cardinality] ?? "||--o{"} ${safe(r.to)} : "${(r.label || "relates").replace(/"/g, "'")}"`);
  }
  return lines.join("\n");
}

function checkOpenApi(text: string): { valid: boolean; issues: string[]; endpoints: number } {
  const issues: string[] = [];
  let doc: unknown;
  try {
    doc = loadYaml(text);
  } catch (e) {
    return { valid: false, issues: [`YAML parse error: ${(e as Error).message}`], endpoints: 0 };
  }
  const d = doc as { openapi?: string; info?: { title?: string; version?: string }; paths?: Record<string, Record<string, unknown>> };
  if (!d || typeof d !== "object") return { valid: false, issues: ["Document is not an object"], endpoints: 0 };
  if (!/^3\./.test(String(d.openapi ?? ""))) issues.push("`openapi` must be a 3.x version string");
  if (!d.info?.title || !d.info?.version) issues.push("`info.title` and `info.version` are required");
  if (!d.paths || typeof d.paths !== "object") issues.push("`paths` is missing");
  let endpoints = 0;
  for (const [p, ops] of Object.entries(d.paths ?? {})) {
    if (!p.startsWith("/")) issues.push(`path "${p}" must start with /`);
    for (const [m, op] of Object.entries(ops ?? {})) {
      if (!["get", "post", "put", "patch", "delete", "head", "options", "parameters", "summary", "description"].includes(m)) issues.push(`${p}: unknown key "${m}"`);
      else if (!["parameters", "summary", "description"].includes(m)) {
        endpoints++;
        if (!(op as { responses?: unknown })?.responses) issues.push(`${m.toUpperCase()} ${p}: missing responses`);
      }
    }
  }
  return { valid: issues.length === 0, issues, endpoints };
}

export async function runSpec(index: RepoIndex, emit: Emit): Promise<SpecResult> {
  const task = "Reconstruct the missing design doc: every HTTP endpoint (method, path, auth, params, request body, responses and error codes), the data model (entities, fields, keys, relations), and the business rules (validation, limits, pricing, permissions, state transitions).";
  const routes = index.symbols.filter((s) => s.kind === "route").map((s) => `${s.name} @ ${s.path}:${s.line}`);
  const slices = await plan(index, task, emit, {
    maxSlices: 8,
    retrievalQuery: "route router get post put delete handler request response status schema model validate entity table column rule fee permission",
    guidance: `Detected route registrations:\n${routes.join("\n") || "(none detected by regex — look for routers/controllers)"}\nCover route handlers, models/schemas, validation, and business logic.`,
  });
  const findings = await read(index, slices, task, emit, {
    instructions: "List endpoints (with status codes and error codes thrown), entities with fields/types/keys, and every business rule with its exact line.",
  });

  emit({ type: "agent", id: "synth", role: "synthesizer", status: "start", label: "Synthesizer: OpenAPI + data model + rules" });
  type Out = { openapiYaml: string; entities: Entity[]; relations: SpecResult["relations"]; rules: { rule: string; category: string; path: string; line: number }[] };
  const out = await callJSON<Out>({
    system: "You are the synthesizer. You turn reader findings into a precise, recovered specification. Never invent endpoints, fields or rules that the findings don't support; mark uncertain items in descriptions.",
    user: `REPO: ${index.name}\nFILE TREE:\n${fileTree(index, 200)}\n\nDETECTED ROUTES:\n${routes.join("\n") || "none"}\n\nREADER FINDINGS:\n${findingsText(findings)}\n\nProduce:\n- openapiYaml: a complete OpenAPI 3.1 document in YAML (info, servers optional, securitySchemes if auth exists, paths with parameters/requestBody/responses incl. error responses, components.schemas for entities).\n- entities and relations for an ER diagram (key: pk|fk|none, references: "Entity.field" or "").\n- rules: each business rule as one sentence with category (validation|pricing|authorization|lifecycle|limits|other) and the exact path+line that enforces it.`,
    effort: "medium",
    maxTokens: 20000,
    schema: S.obj({
      openapiYaml: S.str(),
      entities: S.arr(S.obj({ name: S.str(), fields: S.arr(S.obj({ name: S.str(), type: S.str(), key: S.enumOf(["pk", "fk", "none"]), references: S.str(), note: S.str() })) })),
      relations: S.arr(S.obj({ from: S.str(), to: S.str(), cardinality: S.enumOf(["one-to-one", "one-to-many", "many-to-many"]), label: S.str() })),
      rules: S.arr(S.obj({ rule: S.str(), category: S.str(), path: S.str(), line: S.int() })),
    }),
  });
  const openapiYaml = out.openapiYaml.replace(/^```(ya?ml)?\s*|```\s*$/g, "");
  const check = checkOpenApi(openapiYaml);
  emit({ type: "agent", id: "synth", role: "synthesizer", status: "done", label: `Synthesizer: ${check.endpoints} endpoints, ${out.entities.length} entities, ${out.rules.length} rules` });
  const rules = out.rules.map((r, i) => {
    const f = index.files.get(r.path);
    return { id: `R${i + 1}`, rule: r.rule, category: r.category, citation: { path: r.path, line: r.line, valid: !!f && r.line >= 1 && r.line <= f.lines } };
  });
  emit({ type: "focus", paths: [...new Set(rules.filter((r) => r.citation.valid).map((r) => r.citation.path))] });
  return {
    openapiYaml,
    openapiValid: check.valid,
    openapiIssues: check.issues,
    endpointCount: check.endpoints,
    entities: out.entities,
    relations: out.relations,
    erMermaid: erDiagram(out.entities, out.relations),
    rules,
  };
}
