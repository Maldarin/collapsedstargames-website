import { test } from "node:test";
import assert from "node:assert/strict";
import { GAMES, SPOTLIGHT_ID, spotlightGame, gridGames, EXTRAS, COMING_SOON } from "./games.mjs";

const allStrings = () => {
  const out = [];
  const walk = (v) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk([GAMES, EXTRAS, COMING_SOON]);
  return out;
};

test("GAMES ids are exactly steal-a-minion, pants-rush, match, survivors, bowling", () => {
  assert.deepEqual(GAMES.map((g) => g.id), ["steal-a-minion", "pants-rush", "match", "survivors", "bowling"]);
});

test("ids and hrefs are unique", () => {
  assert.equal(new Set(GAMES.map((g) => g.id)).size, GAMES.length);
  assert.equal(new Set(GAMES.map((g) => g.href)).size, GAMES.length);
});

test("hrefs", () => {
  const h = Object.fromEntries(GAMES.map((g) => [g.id, g.href]));
  assert.deepEqual(h, {
    "steal-a-minion": "/nopas/steal-a-minion/",
    "pants-rush": "/nopas/pants-rush/",
    match: "/nopas/#match",
    survivors: "/nopas/survivors/",
    bowling: "/nopas/bowling/",
  });
});

test("spotlight is steal-a-minion and the grid is the rest in order", () => {
  assert.equal(SPOTLIGHT_ID, "steal-a-minion");
  assert.equal(spotlightGame().id, "steal-a-minion");
  assert.deepEqual(gridGames().map((g) => g.id), ["pants-rush", "match", "survivors", "bowling"]);
});

test("every game has the full shape", () => {
  for (const g of GAMES) {
    for (const k of ["id", "name", "href", "tag", "blurb", "color", "status", "navLabel"]) {
      assert.equal(typeof g[k], "string", `${g.id}.${k}`);
      assert.ok(g[k].length > 0, `${g.id}.${k}`);
    }
    assert.equal(typeof g.isNew, "boolean");
    assert.equal(g.status, "Open Beta");
    assert.match(g.color, /^#[0-9a-f]{6}$/i);
  }
  assert.equal(GAMES.find((g) => g.id === "match").navLabel, "Invasion");
});

test("isNew is true only for steal-a-minion and pants-rush", () => {
  assert.deepEqual(GAMES.filter((g) => g.isNew).map((g) => g.id), ["steal-a-minion", "pants-rush"]);
});

test("COMING_SOON line", () => {
  assert.equal(COMING_SOON.line, "Pants Factory Manager is coming soon. Build pants. Build an empire!");
});

test("EXTRAS are Arcade and AFK Lounge", () => {
  assert.deepEqual(EXTRAS.map((e) => e.name), ["Arcade", "AFK Lounge"]);
});

test("no copy names a game count", () => {
  for (const s of allStrings()) assert.doesNotMatch(s, /\b(three|five|3|5) (ways|modes|games)\b|all three/i, s);
});

test("no banned phrases", () => {
  for (const s of allStrings()) {
    assert.doesNotMatch(s, /player battle|stakes|\/sec|friday|weekly|badge|shrinkinator|ballooninator|next map/i, s);
    assert.doesNotMatch(s, /\bSAM\b|\bPFM\b|NMPA_/, s);
  }
});
