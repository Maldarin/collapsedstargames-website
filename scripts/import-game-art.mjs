// One-off art import for the NOPAS universe-of-games pages. Re-run with:
//   node scripts/import-game-art.mjs                      (every job)
//   node scripts/import-game-art.mjs pants-rush/commander-deploy.png   (just the named outputs)
// Not part of `npm run build`.
// Privacy: `blur` rects (in cropped-image pixels) paint out in-world name tags, so a re-run
// can never bring a username back. Check every output by eye at full size.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const GAME_REPO = 'D:/Projects/not-my-pants-alien-scum';
const SHOTS = 'D:/NOPAS/website-update';
const OUT = resolve('src/assets');
const MAX_W = 2400;

const fromGame = (p) =>
  execFileSync('git', ['-C', GAME_REPO, 'show', `origin/main:${p}`], {
    encoding: 'buffer',
    maxBuffer: 256 * 1024 * 1024,
  });
const fromShots = (f) => readFileSync(`${SHOTS}/${f}`);

const jobs = [
  [() => fromGame('assets/lobby-polish/Steal-a-Minion-Title.png'), 'steal-a-minion/title.png'],
  [() => fromGame('assets/nab/graphics/updf-know-your-minions.png'), 'steal-a-minion/know-your-minions.png'],
  [() => fromGame('assets/lobby-polish/Pants-Factory-Manager-Title.png'), 'brand/pants-factory-manager-title.png'],
  [() => fromGame('art/pants-rush-ui-20261107/commander.png'), 'pants-rush/commander.png'],
  [() => fromGame('art/pants-rush-ui-20261107/overlord.png'), 'pants-rush/overlord.png'],
  [() => fromGame('art/pants-rush-ui-20261107/minion.png'), 'pants-rush/minion.png'],
  [() => fromShots('steal-a-minion-1.png'), 'steal-a-minion/rift-yard.png', { left: 100, top: 0, width: 1050, height: 932 }],
  [() => fromShots('steal-a-minion-2.png'), 'steal-a-minion/research-arena.png', { top: 150 }],
  [() => fromShots('pants-rush-2.png'), 'pants-rush/hallway.png'],
  // The blur covers a player name tag floating beside the mech (~x450-480, y340-357).
  [() => fromShots('pants-rush-1.png'), 'pants-rush/commander-deploy.png', { left: 0, top: 340, width: 1185, height: 585 },
    { blur: [{ left: 436, top: 326, width: 68, height: 44 }] }],
];

// Heavy blur over each rect so no text survives, feathered into the surrounding pixels
// (a padded patch with a soft-edged alpha mask) so it doesn't read as a pasted box.
async function blurRects(img, rects) {
  const base = await img.png().toBuffer();
  const { width: W, height: H } = await sharp(base).metadata();
  const PAD = 12;
  const patches = await Promise.all(rects.map(async (r) => {
    const left = Math.max(0, r.left - PAD), top = Math.max(0, r.top - PAD);
    const width = Math.min(W, r.left + r.width + PAD) - left, height = Math.min(H, r.top + r.height + PAD) - top;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#000"/><rect x="${r.left - left}" y="${r.top - top}" width="${r.width}" height="${r.height}" rx="10" fill="#fff"/></svg>`;
    const mask = await sharp(Buffer.from(svg)).blur(4).extractChannel(0).png().toBuffer();
    // Separate pipelines: sharp runs joinChannel before blur within a single pipeline.
    const blurred = await sharp(base).extract({ left, top, width, height }).removeAlpha().blur(12).png().toBuffer();
    return { input: await sharp(blurred).joinChannel(mask).png().toBuffer(), left, top };
  }));
  return sharp(base).composite(patches);
}

const only = process.argv.slice(2);
for (const [load, rel, crop, opts = {}] of jobs) {
  if (only.length && !only.includes(rel)) continue;
  const buf = load();
  let img = sharp(buf);
  const meta = await img.metadata();
  if (crop) {
    const c = {
      left: crop.left ?? 0,
      top: crop.top ?? 0,
      width: crop.width ?? meta.width - (crop.left ?? 0),
      height: crop.height ?? meta.height - (crop.top ?? 0),
    };
    img = img.extract(c);
  }
  if (opts.blur) img = await blurRects(img, opts.blur);
  const outW = crop ? (crop.width ?? meta.width - (crop.left ?? 0)) : meta.width;
  if (outW > MAX_W) img = img.resize({ width: MAX_W });
  const dest = `${OUT}/${rel}`;
  mkdirSync(dirname(dest), { recursive: true });
  const info = await img.png().toFile(dest);
  console.log(`${rel}  ${info.width}x${info.height}  (source ${meta.width}x${meta.height})`);
}
