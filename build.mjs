/**
 * build.mjs — Teacher AI Club
 * Builds the static site in /dist for Cloudflare Pages.
 *
 * TWO DATA SOURCES (auto-detected, no code change needed):
 *   A) FILE (no token, recommended for a smooth launch):
 *      Put your Airtable CSV/JSON export at  data/tools.csv  (or data/tools.json).
 *      No AIRTABLE_* variables required. The build can never fail on auth.
 *   B) API (live):
 *      Set AIRTABLE_TOKEN + AIRTABLE_BASE_ID (+ AIRTABLE_TABLE) and the build
 *      pulls straight from Airtable.
 *
 * If AIRTABLE_TOKEN is set, the API is used; otherwise the file is used.
 *
 * TWO OUTPUTS:
 *   1) dist/index.html      PUBLIC. Safe for everyone and search engines.
 *                           Every tool, but with Use Case text removed and the
 *                           link kept only on the free Starter tools.
 *   2) functions/_data/premium.js  MEMBERS ONLY. Use Case text for every tool
 *                           plus the links for the locked tools, keyed by id.
 *                           Written outside /dist so it is never served to the
 *                           browser. The gating Function imports it server-side.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

/* ---- optional local .env loader (for local API builds; needs no extra deps) ---- */
if (existsSync(".env")) {
  const env = await readFile(".env", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/* Airtable column name -> object key. Edit here if your columns are named differently. */
const FIELD = {
  id: "ID",
  toolName: "Tool Name",
  description: "Description",
  toolType: "Tool Type",
  gradeLevel: "Grade Level",
  tags: "Tags",
  url: "URL",
  useCases: ["Use Case 1", "Use Case 2", "Use Case 3"],
  free: "Free",   // checkbox: include this tool in the free Starter set
  isNew: "New",   // checkbox: show the "New this month" badge
};

const FILE_CSV = "data/tools.csv";
const FILE_JSON = "data/tools.json";

const FREE_LIMIT = 15;                          // fallback only: if no tool is marked "Free", the first 15 by sort are free
const PREMIUM_OUT = "functions/_data/premium.js"; // members-only output; MUST stay outside /dist

/* ---------- helpers ---------- */
function toArray(v) {
  if (Array.isArray(v)) return v.map(s => String(s).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  return [];
}
function cleanBaseId(v) {
  if (!v) return v;
  const m = v.match(/app[A-Za-z0-9]{10,}/);
  return m ? m[0] : v.trim().split(/[/?#]/)[0];
}
/* fallback id: turns a tool name into a clean slug if the Airtable ID is blank */
function slugify(s) {
  return String(s)
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "tool";
}
/* reads a checkbox value from either the API (true) or a CSV export ("checked"/"1"/"x") */
function toBool(v) {
  if (v === true) return true;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "checked" || s === "1" || s === "yes" || s === "x";
}

/* turns one source row ({fields:{...}}) into a rich tool object (split later) */
function mapRecord(rec) {
  const f = rec.fields || {};
  const name = (f[FIELD.toolName] || "").toString().trim();
  if (!name) return null;
  const useCases = FIELD.useCases
    .map(key => (f[key] || "").toString().trim())
    .filter(Boolean);
  // Prefer the Airtable "ID" field; fall back to a slug of the name if it is blank.
  const id = (f[FIELD.id] || "").toString().trim() || slugify(name);
  return {
    id,
    toolName: name,
    description: (f[FIELD.description] || "").toString().trim(),
    toolType: (f[FIELD.toolType] || "Other").toString().trim(),
    gradeLevel: toArray(f[FIELD.gradeLevel]),
    tags: toArray(f[FIELD.tags]),
    url: (f[FIELD.url] || "#").toString().trim(),
    useCases,                    // text — routed to the premium output only
    useCaseCount: useCases.length,
    free: toBool(f[FIELD.free]),
    isNew: toBool(f[FIELD.isNew]),
  };
}

/* ---------- source A: a committed CSV/JSON file (no token) ---------- */
function parseCSV(text) {
  const rows = []; let row = [], field = "", inQ = false;
  text = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map(h => h.trim());
  return rows
    .filter(r => r.some(c => c.trim() !== ""))
    .map(r => ({ fields: Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])) }));
}
async function loadFromFile() {
  if (existsSync(FILE_CSV)) {
    console.log(`→ Reading ${FILE_CSV}`);
    return parseCSV(await readFile(FILE_CSV, "utf8"));
  }
  if (existsSync(FILE_JSON)) {
    console.log(`→ Reading ${FILE_JSON}`);
    const arr = JSON.parse(await readFile(FILE_JSON, "utf8"));
    return arr.map(obj => ({ fields: obj }));
  }
  throw new Error(`No data source found. Add ${FILE_CSV} (or ${FILE_JSON}), or set AIRTABLE_TOKEN + AIRTABLE_BASE_ID.`);
}

/* ---------- source B: the live Airtable API ---------- */
async function loadFromAirtable() {
  const TOKEN = process.env.AIRTABLE_TOKEN;
  const BASE_ID = cleanBaseId(process.env.AIRTABLE_BASE_ID);
  const TABLE = (process.env.AIRTABLE_TABLE || "Tools").trim();
  const VIEW = (process.env.AIRTABLE_VIEW || "").trim();
  if (!BASE_ID) throw new Error("AIRTABLE_TOKEN is set but AIRTABLE_BASE_ID is missing.");
  console.log(`→ Fetching from Airtable base ${BASE_ID}, table "${TABLE}"${VIEW ? `, view "${VIEW}"` : ""}…`);
  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`;
  const records = []; let offset;
  do {
    const p = new URLSearchParams({ pageSize: "100" });
    if (VIEW) p.set("view", VIEW);
    if (offset) p.set("offset", offset);
    const res = await fetch(`${url}?${p}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) throw new Error(`Airtable ${res.status} ${res.statusText}\n${await res.text()}`);
    const data = await res.json();
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

/* ---------- build ---------- */
async function main() {
  const useApi = !!process.env.AIRTABLE_TOKEN;
  console.log(useApi ? "Source: Airtable API" : "Source: committed file");
  const rows = useApi ? await loadFromAirtable() : await loadFromFile();

  const tools = rows.map(mapRecord).filter(Boolean)
                    .sort((a, b) => a.toolName.localeCompare(b.toolName));

  // Guarantee every id is unique so the premium payload can merge cleanly by id.
  const seenIds = new Map();
  for (const t of tools) {
    const base = t.id;
    let id = base, n = 2;
    while (seenIds.has(id)) id = `${base}-${n++}`;
    if (id !== base) console.warn(`! Duplicate id "${base}" → using "${id}" for "${t.toolName}"`);
    seenIds.set(id, true);
    t.id = id;
  }

  console.log(`→ Mapped ${tools.length} tools.`);
  if (!tools.length) throw new Error("No tools found in the data source. Check the file/table is not empty.");

  // If the "Free" checkbox has not been used yet, fall back to the first 15 by sort
  // so the public site still has clickable tools during the transition.
  if (!tools.some(t => t.free)) {
    tools.forEach((t, i) => { t.free = i < FREE_LIMIT; });
    console.log(`! No "Free" tools marked in Airtable. Defaulting the first ${FREE_LIMIT} by sort to free.`);
  }
  const freeCount = tools.filter(t => t.free).length;
  console.log(`→ ${freeCount} free, ${tools.length - freeCount} premium.`);

  // PUBLIC payload: safe for everyone and search engines.
  // Use Case text is dropped everywhere; the link is kept only on free tools.
  const publicTools = tools.map(t => ({
    id: t.id,
    toolName: t.toolName,
    description: t.description,
    toolType: t.toolType,
    gradeLevel: t.gradeLevel,
    tags: t.tags,
    isNew: t.isNew,
    useCaseCount: t.useCaseCount,
    free: t.free,
    url: t.free ? t.url : "",          // locked links never enter the public page
    useCases: t.free ? t.useCases : [], // free tools show their use cases; locked stay premium
  }));

  // PREMIUM payload: members only. Use Case text for every tool, plus the link
  // for the locked tools. Keyed by id for a clean client-side merge after login.
  const premiumById = {};
  for (const t of tools) {
    premiumById[t.id] = {
      useCases: t.useCases,
      ...(t.free ? {} : { url: t.url }),
    };
  }

  // ---- write output 1: pages that contain the directory ----
  // Both the public homepage and the gated members directory render from this same
  // public payload (names, descriptions, filters, plus links/use-cases for free tools).
  const marker = /\/\*__TOOLS_START__[\s\S]*?__TOOLS_END__\*\//;
  const injection =
    `/*__TOOLS_START__  (auto-generated by build.mjs, do not edit by hand) */\n` +
    `const TOOLS = ${JSON.stringify(publicTools)};\n` +
    `/*__TOOLS_END__*/`;
  await mkdir("dist", { recursive: true });
  for (const page of ["index.html", "directory.html"]) {
    let template;
    try { template = await readFile(page, "utf8"); }
    catch { console.log(`! ${page} not found at project root, skipping.`); continue; }
    if (!marker.test(template)) throw new Error(`Missing /*__TOOLS_START__*/ … /*__TOOLS_END__*/ markers in ${page}`);
    const html = template.replace(marker, () => injection);
    await writeFile(`dist/${page}`, html);
    console.log(`✓ Wrote dist/${page} (${publicTools.length} tools, no premium data).`);
  }

  // ---- write output 2: the members-only premium data (outside /dist) ----
  await mkdir("functions/_data", { recursive: true });
  const premiumModule =
    `// auto-generated by build.mjs, do not edit by hand.\n` +
    `// Server-side only. Imported by the gating Function. Never served to the browser.\n` +
    `export default ${JSON.stringify(premiumById)};\n`;
  await writeFile(PREMIUM_OUT, premiumModule);
  console.log(`✓ Wrote ${PREMIUM_OUT} (${Object.keys(premiumById).length} tools, premium fields).`);

  // ---- copy additional static pages into the deploy folder ----
  // These are member-area pages with no tool data to inject, so they are copied as-is.
  const EXTRA_PAGES=["newsletter.html", "blog.html", "thank-you.html"];
  for (const page of EXTRA_PAGES) {
    try {
      const content = await readFile(page, "utf8");
      await writeFile(`dist/${page}`, content);
      console.log(`✓ Copied ${page} to dist/`);
    } catch {
      console.log(`! ${page} not found at project root, skipping.`);
    }
  }
}

main().catch(err => { console.error("\n✗ Build failed:\n" + err.message + "\n"); process.exit(1); });
