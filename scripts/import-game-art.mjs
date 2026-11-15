// One-off art import for the NOPAS universe-of-games pages. Re-run with:
//   node scripts/import-game-art.mjs
// Not part of `npm run build`.
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
  [() => fromShots('pants-rush-1.png'), 'pants-rush/commander-deploy.png', { left: 0, top: 340, width: 1185, height: 585 }],
];

for (const [load, rel, crop] of jobs) {
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
  const outW = crop ? (crop.width ?? meta.width - (crop.left ?? 0)) : meta.width;
  if (outW > MAX_W) img = img.resize({ width: MAX_W });
  const dest = `${OUT}/${rel}`;
  mkdirSync(dirname(dest), { recursive: true });
  const info = await img.png().toFile(dest);
  console.log(`${rel}  ${info.width}x${info.height}  (source ${meta.width}x${meta.height})`);
}
