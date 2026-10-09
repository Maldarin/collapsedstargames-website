import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

// One markdown file per patch. The file name (without .md) is the patch id; the Discord bot
// remembers ids, so a published file must never be renamed. PATCH_NOTES_DIR lets the e2e script
// build against fixtures instead of real patches.
const patchNotes = defineCollection({
  loader: glob({ pattern: "*.md", base: process.env.PATCH_NOTES_DIR ?? "./src/content/patch-notes" }),
  schema: z.object({
    version: z.string().min(1),
    title: z.string().min(1),
    date: z.coerce.date(),
    summary: z.string().min(1),
    prs: z.array(z.number().int().positive()),
    // coerce: an unquoted YAML timestamp arrives as a Date, a quoted one as a string. Both are valid.
    coveredThrough: z.coerce.date(),
    draft: z.boolean().optional(),
  }),
});

export const collections = { patchNotes };
