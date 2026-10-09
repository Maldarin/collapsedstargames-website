import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { buildFeed } from "../../../lib/patch-notes.mjs";

// Read by the Discord bot every 5 minutes. Published patches only, newest first.
export const prerender = true;

export const GET: APIRoute = async () => {
  const entries = await getCollection("patchNotes");
  return new Response(JSON.stringify(buildFeed(entries), null, 1), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
