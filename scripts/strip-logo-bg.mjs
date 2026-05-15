/**
 * Strip the off-white background from CSG-Logo.png and produce a true PNG-32
 * with alpha. Approach:
 *
 *   - Classify pixels by RGB distance from a sampled background color:
 *       pure-bg (distance ≤ TOLERANCE)
 *       fringe  (TOLERANCE < distance ≤ FEATHER_RADIUS) — anti-aliased edge
 *       fg     (distance > FEATHER_RADIUS) — keep fully opaque
 *
 *   - Pass 1 (corner-rooted BFS): mark the outer background region (the
 *     puddle reachable from the four corners through pure-bg pixels). The
 *     flood expands FROM pure-bg pixels INTO pure-bg + fringe neighbors,
 *     but a fringe pixel is terminal — it cannot spread further. This way
 *     we capture exactly one fringe layer at the foreground boundary.
 *
 *   - Pass 2 (enclosed pockets): same logic, but for small near-bg regions
 *     that are not corner-connected (letter holes — the inside of O, A, P,
 *     D, S, etc.). Only zero-out if the component doesn't touch the image
 *     edge.
 *
 *   - Pass 3 (alpha): for every pixel marked as part of the bg region,
 *     compute alpha as a smooth function of color distance — pure bg → 0,
 *     fringe → graduated, foreground → 255. This kills the white halos
 *     that show up around dark wordmark letters when you only zero-out by
 *     a hard color match.
 *
 * Usage: node scripts/strip-logo-bg.mjs
 */
import sharp from "sharp";

const INPUT = "src/assets/brand/CSG-Logo.png";
const OUTPUT = "src/assets/brand/CSG-Logo_clean.png";

const BG_COLOR = [246, 247, 248];
const TOLERANCE = 28;
const FEATHER_RADIUS = 90;

function colorDist(r, g, b) {
    const dr = r - BG_COLOR[0];
    const dg = g - BG_COLOR[1];
    const db = b - BG_COLOR[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

function classify(r, g, b) {
    const d = colorDist(r, g, b);
    if (d <= TOLERANCE) return 0; // pure-bg
    if (d <= FEATHER_RADIUS) return 1; // fringe
    return 2; // fg
}

function featheredAlpha(r, g, b) {
    const d = colorDist(r, g, b);
    if (d <= TOLERANCE) return 0;
    if (d >= FEATHER_RADIUS) return 255;
    return Math.round(((d - TOLERANCE) / (FEATHER_RADIUS - TOLERANCE)) * 255);
}

async function main() {
    const { data, info } = await sharp(INPUT).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    if (channels !== 4) throw new Error(`expected 4 channels, got ${channels}`);

    const pixels = new Uint8ClampedArray(data);
    const total = width * height;

    // visited: 0 unseen, 1 seen
    // bgMask: 0 not bg-region, 1 bg-region (gets alpha treatment in pass 3)
    const visited = new Uint8Array(total);
    const bgMask = new Uint8Array(total);

    // Pre-compute classification for every pixel so we don't recompute in BFS
    const cls = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
        const p = i * 4;
        cls[i] = classify(pixels[p], pixels[p + 1], pixels[p + 2]);
    }

    // ============================================================
    // Pass 1 — corner-rooted BFS
    // Expansion rule: a pure-bg pixel spreads to pure-bg + fringe neighbors;
    // a fringe pixel does not spread further (it's terminal in the puddle).
    // ============================================================
    const queue = new Int32Array(total);
    let qHead = 0;
    let qTail = 0;

    function seedCorner(x, y) {
        const idx = y * width + x;
        if (visited[idx]) return;
        if (cls[idx] !== 0) {
            visited[idx] = 1;
            return;
        }
        visited[idx] = 1;
        bgMask[idx] = 1;
        queue[qTail++] = idx;
    }
    seedCorner(0, 0);
    seedCorner(width - 1, 0);
    seedCorner(0, height - 1);
    seedCorner(width - 1, height - 1);

    function expand(idx) {
        const x = idx % width;
        const y = (idx - x) / width;
        const neighbors = [
            x + 1 < width ? idx + 1 : -1,
            x - 1 >= 0 ? idx - 1 : -1,
            y + 1 < height ? idx + width : -1,
            y - 1 >= 0 ? idx - width : -1,
        ];
        for (const n of neighbors) {
            if (n < 0 || visited[n]) continue;
            const c = cls[n];
            if (c === 2) {
                visited[n] = 1;
                continue;
            }
            visited[n] = 1;
            bgMask[n] = 1;
            // Only pure-bg (c=0) spreads further; fringe (c=1) is terminal.
            if (c === 0) queue[qTail++] = n;
        }
    }

    let pass1Count = 0;
    while (qHead < qTail) {
        expand(queue[qHead++]);
        pass1Count++;
    }
    console.log(`Pass 1 (corner-rooted): ${pass1Count.toLocaleString()} pure-bg pixels seeded the flood`);

    // ============================================================
    // Pass 2 — enclosed pockets (letter interiors)
    // Same expansion rule, but each component must NOT touch the image
    // edge to qualify (we don't want to accidentally swallow large regions
    // if the corner flood missed something).
    // ============================================================
    const COMPONENT_MAX = 80000;
    const componentBuf = new Int32Array(COMPONENT_MAX + 4);
    let pass2Pixels = 0;
    let pass2Components = 0;

    for (let idx = 0; idx < total; idx++) {
        if (visited[idx]) continue;
        if (cls[idx] !== 0) {
            visited[idx] = 1;
            continue;
        }

        // Component-bounded BFS — collect indices first, decide afterwards
        let cHead = 0;
        let cTail = 0;
        let touchesEdge = false;
        let overflow = false;
        componentBuf[cTail++] = idx;
        visited[idx] = 1;

        while (cHead < cTail) {
            const j = componentBuf[cHead++];
            const jx = j % width;
            const jy = (j - jx) / width;
            if (jx === 0 || jy === 0 || jx === width - 1 || jy === height - 1) {
                touchesEdge = true;
            }
            const neighbors = [
                jx + 1 < width ? j + 1 : -1,
                jx - 1 >= 0 ? j - 1 : -1,
                jy + 1 < height ? j + width : -1,
                jy - 1 >= 0 ? j - width : -1,
            ];
            for (const n of neighbors) {
                if (n < 0 || visited[n]) continue;
                const c = cls[n];
                if (c === 2) {
                    visited[n] = 1;
                    continue;
                }
                visited[n] = 1;
                if (cTail >= COMPONENT_MAX) {
                    overflow = true;
                    break;
                }
                componentBuf[cTail++] = n;
                // Only spread further from pure-bg
                // (fringe is terminal — already in component but we don't enqueue more from it)
                if (c !== 0) {
                    // fringe — terminal: nothing further
                    // we keep cTail growth via the outer loop, just don't re-add via this n
                }
            }
            if (overflow) break;
        }

        if (!touchesEdge && !overflow) {
            for (let k = 0; k < cTail; k++) bgMask[componentBuf[k]] = 1;
            pass2Pixels += cTail;
            pass2Components++;
        }
    }
    console.log(`Pass 2 (enclosed pockets): ${pass2Pixels.toLocaleString()} pixels in ${pass2Components} component(s)`);

    // ============================================================
    // Pass 3 — apply alpha based on color distance for every bg-region pixel
    // ============================================================
    let purelyTransparent = 0;
    let feathered = 0;
    let bgMaskCount = 0;
    for (let idx = 0; idx < total; idx++) {
        if (!bgMask[idx]) continue;
        bgMaskCount++;
        const p = idx * 4;
        const a = featheredAlpha(pixels[p], pixels[p + 1], pixels[p + 2]);
        pixels[p + 3] = a;
        if (a === 0) purelyTransparent++;
        else feathered++;
    }
    console.log(`Pass 3 (alpha): ${bgMaskCount.toLocaleString()} bg-region pixels (${purelyTransparent.toLocaleString()} pure-transparent, ${feathered.toLocaleString()} feathered)`);
    console.log(`Coverage: ${((bgMaskCount / total) * 100).toFixed(1)}% of the image is in the bg region`);

    await sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } })
        .png({ compressionLevel: 9 })
        .toFile(OUTPUT);
    console.log(`Wrote: ${OUTPUT}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
