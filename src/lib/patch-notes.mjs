// Pure helpers for the patch-notes collection. Plain .mjs so `node --test` exercises the exact
// code the Astro pages and feed import — the pages stay thin, the logic stays tested.
export const SITE = "https://collapsedstargames.com";

export function isPublished(entry) {
  return entry.data.draft !== true;
}

// Newest first; the same date breaks ties by id DESCENDING. The bot posts oldest first with the
// mirror-image rule (date asc, id asc), so the patch shown on top here is the last one posted.
export function publishedNewestFirst(entries) {
  return entries
    .filter(isPublished)
    .sort((a, b) => b.data.date - a.data.date || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

export function neighbors(sorted, id) {
  const i = sorted.findIndex((x) => x.id === id);
  return {
    newer: i > 0 ? sorted[i - 1] : null,
    older: i >= 0 && i < sorted.length - 1 ? sorted[i + 1] : null,
  };
}

export function patchUrl(id) {
  return `${SITE}/nopas/patch-notes/${id}/`;
}

// Frontmatter dates parse as UTC midnight; format in UTC so a viewer west of Greenwich does not
// see the day before.
export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export function displayDate(d) {
  return d.toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" });
}

export function toFeedEntry(entry) {
  return {
    id: entry.id,
    version: entry.data.version,
    title: entry.data.title,
    date: isoDate(entry.data.date),
    summary: entry.data.summary,
    url: patchUrl(entry.id),
    markdown: (entry.body ?? "").trim(),
  };
}

export function buildFeed(entries) {
  return { patches: publishedNewestFirst(entries).map(toFeedEntry) };
}
