// Pure logic for gather.mjs, kept separate so it is tested without GitHub.
export const INITIAL_START = "2026-10-10T01:00:00Z"; // 8:00 PM CDT 2026-10-09: post-beta-launch

export const INTERNAL_PREFIXES = ["tests/", "docs/", "design docs/", ".claude/", ".agents/", "tools/", ".github/"];

// Reads coveredThrough from raw frontmatter text, quoted or not. Raw text, not a YAML parser: an
// unquoted timestamp is a Date to YAML, and this script only ever needs the string.
export function readCoveredThrough(text) {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const m = fm[1].match(/^coveredThrough:\s*["']?([^"'\r\n]+?)["']?\s*$/m);
  return m ? m[1] : null;
}

// Drafts count: a pending draft already covers its PRs, so the next gather must not repeat them.
export function findStart(fileTexts) {
  const times = fileTexts.map(readCoveredThrough).filter(Boolean).map((s) => Date.parse(s)).filter((n) => !Number.isNaN(n));
  return times.length ? new Date(Math.max(...times)).toISOString() : INITIAL_START;
}

export function isInternalPath(p) {
  if (INTERNAL_PREFIXES.some((pre) => p.startsWith(pre))) return true;
  return !p.includes("/") && (p.startsWith(".") || p.endsWith(".md"));
}

export function classifyPr(pr) {
  const files = pr.files ?? [];
  if (!files.length) return "player"; // unknown: show it to the drafter rather than hide it
  return files.every((f) => isInternalPath(f.path)) ? "internal" : "player";
}

export function selectPrs(prs, startIso, nowIso) {
  const start = Date.parse(startIso), now = Date.parse(nowIso);
  return prs
    .filter((p) => { const t = Date.parse(p.mergedAt); return t > start && t <= now; })
    .sort((a, b) => Date.parse(a.mergedAt) - Date.parse(b.mergedAt));
}

export function suggestedCoveredThrough(prs) {
  if (!prs.length) return null;
  return prs.reduce((max, p) => (Date.parse(p.mergedAt) > Date.parse(max) ? p.mergedAt : max), prs[0].mergedAt);
}
