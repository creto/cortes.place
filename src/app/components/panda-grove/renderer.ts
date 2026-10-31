import { clamp, hash3, smoothstep, type Box } from "../koi-pond/world";
import {
    classify,
    eyeOf,
    PART_LEAF,
    PART_NODE,
    PART_NOSE,
    PART_PATCH,
    PART_PAW,
    PART_STICK,
    PART_WHITE,
    type PandaPose,
    type PartHit,
} from "./shape";
import { BITE_LIFE, LEAF_REST, SHOOT_LIFE, SNORE_LIFE, type Panda, type Stalk, type World } from "./world";

type Rgb = [number, number, number];

// How visible the grove stays behind page content.
const DIM_UNDER_CONTENT = 0.15;

interface Palette {
    /** Page background, which tiles are mixed toward. */
    bg: Rgb;
    white: Rgb;
    black: Rgb;
    /** Darkens the fur around the eye. */
    patch: Rgb;
    /** The eye's glint. */
    eye: Rgb;
    /** Bamboo from the shaded side of a cane to its lit side. */
    cane: Rgb[];
    /** Older canes drift toward this straw colour. */
    straw: Rgb;
    /** The pale waxy bloom just under each joint. */
    wax: Rgb;
    /** Leaves from a shaded blade to one catching the light. */
    leaf: Rgb[];
    shoot: Rgb;
    grass: Rgb;
    soil: Rgb;
    snore: Rgb;
    shadow: Rgb;
    shadowAlpha: number;
    alpha: number;
    /** How much the back of the grove fades, as the alpha it keeps at depth 0. */
    depthFloor: number;
    /** How much fur colour a tile carries, from shadow (0) to lit (1); the rest is page background. */
    tile: [number, number];
    /** How much of the cane colour a bamboo tile carries. */
    caneTile: number;
    /** Glyph brightness relative to the tile under it. */
    ink: number;
}

const DARK: Palette = {
    bg: [26, 25, 33],
    white: [236, 228, 218],
    black: [88, 86, 104],
    patch: [12, 12, 16],
    eye: [246, 240, 230],
    cane: [
        [28, 58, 40],
        [44, 92, 54],
        [70, 128, 68],
        [108, 164, 86],
        [168, 206, 122],
    ],
    straw: [150, 150, 84],
    wax: [176, 196, 168],
    leaf: [
        [38, 82, 48],
        [64, 122, 66],
        [102, 160, 88],
        [146, 196, 112],
    ],
    shoot: [196, 214, 120],
    grass: [92, 132, 82],
    soil: [96, 84, 74],
    snore: [206, 202, 226],
    shadow: [0, 0, 0],
    shadowAlpha: 0.5,
    alpha: 0.85,
    depthFloor: 0.35,
    tile: [0.66, 0.98],
    caneTile: 0.85,
    ink: 0.42,
};

// Paper page: tiles are pale washes of the fur colour with dark glyphs etched on top.
const LIGHT: Palette = {
    bg: [245, 244, 241],
    white: [112, 108, 104],
    black: [36, 33, 40],
    patch: [12, 12, 16],
    eye: [245, 244, 241],
    cane: [
        [34, 80, 46],
        [54, 112, 60],
        [84, 144, 74],
        [122, 174, 94],
        [170, 204, 130],
    ],
    straw: [160, 150, 80],
    wax: [190, 206, 186],
    leaf: [
        [36, 90, 48],
        [58, 120, 60],
        [92, 152, 78],
        [138, 186, 106],
    ],
    shoot: [120, 150, 50],
    grass: [96, 130, 84],
    soil: [150, 132, 112],
    snore: [70, 68, 80],
    shadow: [60, 58, 56],
    shadowAlpha: 0.2,
    alpha: 0.92,
    depthFloor: 0.45,
    tile: [0.8, 0.5],
    caneTile: 0.72,
    ink: 0.45,
};

// Fur texture from shadow to light: dense strokes in the folds, a few soft ticks where it catches the light.
const WHITE_GLYPHS = "%=;:,'.";
const BLACK_GLYPHS = "#&%*+~'";
const SUBSAMPLES = [0.25, 0.25, 0.75, 0.25, 0.25, 0.75, 0.75, 0.75];
// Body-space reach of every pose, in body lengths: behind, ahead, below, above.
const BOUNDS = [-0.85, 1.2, -0.05, 1.7];

// A line glyph that follows a direction in screen space, for leaves, twigs and tufts of fur.
function lineGlyph(dx: number, dy: number) {
    const d = Math.hypot(dx, dy) || 1;
    if (Math.abs(dy) < 0.38 * d) return "-";
    if (Math.abs(dx) < 0.38 * d) return "|";
    return dx * dy > 0 ? "\\" : "/";
}

const packRgb = (c: Rgb) => (c[0] << 16) | (c[1] << 8) | c[2];
/** Sample a colour ramp at t in [0, 1]. */
function ramp(stops: Rgb[], t: number): Rgb {
    const x = clamp(t, 0, 1) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    return mix(stops[i], stops[i + 1], x - i);
}

const mix = (a: Rgb, b: Rgb, k: number): Rgb => [
    (a[0] + (b[0] - a[0]) * k) | 0,
    (a[1] + (b[1] - a[1]) * k) | 0,
    (a[2] + (b[2] - a[2]) * k) | 0,
];
const shade = (c: Rgb, k: number): Rgb => [
    Math.min(255, c[0] * k) | 0,
    Math.min(255, c[1] * k) | 0,
    Math.min(255, c[2] * k) | 0,
];

export class PandaRenderer {
    private ctx: CanvasRenderingContext2D;
    private dpr = 1;
    private cw = 8;
    private ch = 12;
    private cols = 0;
    private rows = 0;
    private palette = DARK;
    private styles = new Map<number, string>();
    private fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";

    private cellGlyph = new Uint16Array(0);
    private cellColor = new Uint32Array(0);
    private cellAlpha = new Float32Array(0);
    private cellTile = new Uint32Array(0);
    private cellTileAlpha = new Float32Array(0);
    private cellDim = new Float32Array(0);
    /** Cells under a panda's shadow on the ground. */
    private cellShadow = new Uint8Array(0);
    /** Which panda last drew each cell, so the eye is only stamped onto its own face. */
    private cellOwner = new Uint16Array(0);

    private hit: PartHit = { part: 0, nx: 0, ny: 0, r: 0, far: false };
    private pose: PandaPose = {
        pose: "walk",
        legPhase: 0,
        stride: 0,
        stick: 0,
        sprig: false,
        chew: 0,
        breath: 0,
        lookX: 0,
        lookY: 0,
        dozing: false,
    };

    constructor(canvas: HTMLCanvasElement) {
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("2D canvas unavailable");
        this.ctx = ctx;
    }

    setTheme(isLight: boolean) {
        this.palette = isLight ? LIGHT : DARK;
    }

    resize(width: number, height: number, dpr: number) {
        this.dpr = dpr;
        // Finer tiles than the koi pond: the pandas and canes need the extra detail.
        this.cw = clamp(Math.round(width / 180), 6, 10);
        this.ch = this.cw + 2;
        this.cols = Math.ceil(width / this.cw);
        this.rows = Math.ceil(height / this.ch);
        this.ctx.canvas.width = Math.round(width * dpr);
        this.ctx.canvas.height = Math.round(height * dpr);

        const n = this.cols * this.rows;
        this.cellGlyph = new Uint16Array(n);
        this.cellColor = new Uint32Array(n);
        this.cellAlpha = new Float32Array(n);
        this.cellTile = new Uint32Array(n);
        this.cellTileAlpha = new Float32Array(n);
        this.cellDim = new Float32Array(n).fill(1);
        this.cellShadow = new Uint8Array(n);
        this.cellOwner = new Uint16Array(n);
    }

    /** Fade the grove under these canvas-space boxes, easing back in over a few cells around them. */
    setDimBoxes(boxes: Box[]) {
        const { cols, rows, cw, ch, cellDim } = this;
        cellDim.fill(1);
        const pad = cw * 4;
        for (const b of boxes) {
            const c0 = Math.max(0, Math.floor((b.left - pad) / cw));
            const c1 = Math.min(cols - 1, Math.floor((b.right + pad) / cw));
            const r0 = Math.max(0, Math.floor((b.top - pad) / ch));
            const r1 = Math.min(rows - 1, Math.floor((b.bottom + pad) / ch));
            for (let r = r0; r <= r1; r++) {
                for (let c = c0; c <= c1; c++) {
                    const x = c * cw + cw / 2;
                    const y = r * ch + ch / 2;
                    const d = Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom));
                    const i = r * cols + c;
                    cellDim[i] = Math.min(
                        cellDim[i],
                        DIM_UNDER_CONTENT + (1 - DIM_UNDER_CONTENT) * smoothstep(0, pad, d)
                    );
                }
            }
        }
    }

    render(world: World) {
        const { ctx, dpr, cols } = this;
        if (cols === 0) return;

        this.cellGlyph.fill(0);
        this.cellTileAlpha.fill(0);
        this.cellShadow.fill(0);
        this.cellOwner.fill(0);
        // Back of the grove first, so canes and pandas near the front stand over the ones behind;
        // a panda hugging a cane is drawn over it.
        const things: (Stalk | Panda)[] = [...world.stalks, ...world.pandas];
        const key = (t: Stalk | Panda) => t.depth + ("height" in t ? 0 : 1e-3);
        things.sort((a, b) => key(a) - key(b));
        for (const thing of things) {
            if ("height" in thing) this.rasterizeStalk(world, thing);
            else this.rasterizePanda(world, thing);
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font = `600 ${Math.round(this.ch * 0.72)}px ${this.fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        this.drawGround(world);
        this.drawShadows();
        this.drawShoots(world);
        this.drawCells();
        this.drawLeaves(world);
        this.drawSnores(world);
        this.drawBites(world);
        ctx.globalAlpha = 1;
    }

    private style(rgb: number) {
        let s = this.styles.get(rgb);
        if (!s) {
            s = `rgb(${rgb >>> 16},${(rgb >>> 8) & 255},${rgb & 255})`;
            this.styles.set(rgb, s);
        }
        return s;
    }

    private glyphAt(i: number, glyph: string, rgb: Rgb, alpha: number) {
        const { ctx, cw, ch, cols } = this;
        ctx.globalAlpha = alpha * this.cellDim[i];
        ctx.fillStyle = this.style(packRgb(rgb));
        ctx.fillText(glyph, (i % cols) * cw + cw / 2, ((i / cols) | 0) * ch + ch / 2);
    }

    private cellIndex(x: number, y: number) {
        const c = Math.floor(x / this.cw);
        const r = Math.floor(y / this.ch);
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
        return r * this.cols + c;
    }

    private put(i: number, glyph: string, rgb: Rgb, alpha: number, tile: Rgb | null, tileAlpha: number) {
        this.cellGlyph[i] = glyph.charCodeAt(0);
        this.cellColor[i] = packRgb(rgb);
        this.cellAlpha[i] = alpha;
        this.cellTile[i] = tile ? packRgb(tile) : 0;
        this.cellTileAlpha[i] = tile ? tileAlpha : 0;
        this.cellOwner[i] = 0;
    }

    /** A glyph over whatever tile is already in the cell, for thin strokes like leaves and twigs. */
    private stroke(i: number, glyph: string, rgb: Rgb, alpha: number) {
        this.cellGlyph[i] = glyph.charCodeAt(0);
        this.cellColor[i] = packRgb(rgb);
        this.cellAlpha[i] = alpha;
        this.cellOwner[i] = 0;
    }

    private depthDim(depth: number) {
        const p = this.palette;
        return p.alpha * Math.max(0.12, p.depthFloor + (1 - p.depthFloor) * depth);
    }

    // ── bamboo ──────────────────────────────────────────────────────────

    /**
     * A cane is a column of tiles shaded like a cylinder lit from the left: a bright streak down one side,
     * a dark edge on the other. Each joint is a darker, slightly swollen ring with a pale waxy band under it,
     * and from some joints a twig angles out to a fan of drooping leaves.
     */
    private rasterizeStalk(world: World, s: Stalk) {
        const { cw, ch, cols, rows, palette } = this;
        const scale = world.scale(s.depth);
        const base = world.groundY(s.depth);
        const top = base - s.height;
        const haze = s.depth < 0;
        // Canes are scenery: kept a step quieter than the pandas; the far row is barely there, like mist.
        const dim = this.depthDim(s.depth) * (haze ? 0.4 : 0.62);
        const w = Math.max(haze ? 1 : 2, Math.round((s.thickness * scale) / cw));
        const segment = s.segment * scale;
        const cane = palette.cane.map((c) => mix(c, palette.straw, s.age * 0.35));

        for (let r = Math.max(0, Math.floor(top / ch)); r <= Math.min(rows - 1, Math.floor(base / ch)); r++) {
            const y = r * ch + ch / 2;
            const up = base - y;
            const h = clamp(up / s.height, 0, 1);
            const c0 = Math.round(world.stalkX(s, h) / cw - w / 2);
            const along = (up % segment) / segment;
            const node = up % segment < ch;
            const wax = !node && along > 0.82;
            // Each internode darkens a touch toward its foot.
            const fall = 0.12 * (1 - along);
            const span = node && !haze ? 1 : 0;
            for (let j = -span; j < w + span; j++) {
                const c = c0 + j;
                if (c < 0 || c >= cols) continue;
                const f = (j + 0.5) / w;
                const lum = clamp(0.2 + 0.8 * Math.exp(-(((f - 0.3) / 0.32) ** 2)) - fall - (node ? 0.3 : 0), 0, 1);
                let tile = mix(palette.bg, ramp(cane, lum), palette.caneTile);
                if (wax) tile = mix(tile, palette.wax, 0.35);
                let glyph: string;
                if (node) glyph = j < 0 || j >= w ? "-" : "=";
                else if (haze) glyph = "|";
                else if (f < 0.4 && f > 0.15) glyph = "|";
                else if (f > 0.8) glyph = ")";
                else glyph = (hash3(c, r, 3) * 3) | 0 ? ":" : "'";
                this.put(
                    r * cols + c,
                    glyph,
                    shade(tile, palette.ink + 0.2),
                    dim,
                    tile,
                    dim * (span && (j < 0 || j >= w) ? 0.6 : 1)
                );
            }
        }

        const t = world.time;
        for (const b of s.branches) {
            const y0 = base - b.h * s.height;
            if (y0 < -60) continue;
            // The twig: a thin, darker line angling up and out from the joint.
            let x = world.stalkX(s, b.h) + b.side * w * cw * 0.5;
            let y = y0;
            const tx = b.side * Math.cos(b.angle);
            const ty = -Math.sin(b.angle);
            const twigSteps = Math.max(1, Math.round((b.length * scale) / cw));
            for (let k = 0; k < twigSteps; k++) {
                x += tx * cw;
                y += ty * cw;
                const i = this.cellIndex(x, y);
                if (i >= 0) this.stroke(i, lineGlyph(tx, ty), shade(ramp(cane, 0.35), 1), dim);
            }
            for (const leaf of b.leaves) this.drawBlade(world, s, b.side, leaf, x, y, scale, dim, t, haze);
        }
    }

    /** One lance-shaped leaf: a midrib of slanted strokes over a narrow wash of green that's widest mid-blade. */
    private drawBlade(
        world: World,
        s: Stalk,
        side: number,
        leaf: { angle: number; length: number; phase: number; shade: number },
        x0: number,
        y0: number,
        scale: number,
        dim: number,
        t: number,
        haze: boolean
    ) {
        const { cw, palette } = this;
        const flutter = Math.sin(t * 2.2 + leaf.phase) * 0.14 + s.bend * 0.004 * side;
        const a = leaf.angle + flutter;
        let dx = side * Math.cos(a) + world.wind * 0.25;
        let dy = Math.sin(a);
        const steps = Math.max(2, Math.round((leaf.length * scale) / (cw * 0.9)));
        let x = x0;
        let y = y0;
        for (let k = 1; k <= steps; k++) {
            // Each leaf droops toward its tip.
            dy += 0.07;
            const d = Math.hypot(dx, dy) || 1;
            dx /= d;
            dy /= d;
            x += dx * cw * 0.9;
            y += dy * cw * 0.9;
            const i = this.cellIndex(x, y);
            if (i < 0) continue;
            const f = k / steps;
            const green = ramp(palette.leaf, 0.15 + leaf.shade * 0.7 + (1 - f) * 0.15);
            const tip = k === steps;
            if (!haze && f > 0.2 && f < 0.8) {
                const tile = mix(palette.bg, green, 0.55);
                this.put(i, lineGlyph(dx, dy), shade(green, 1.15), dim, tile, dim * 0.5 * Math.sin(Math.PI * f));
            } else {
                this.stroke(i, tip ? "'" : lineGlyph(dx, dy), green, dim * (tip ? 0.7 : 1));
            }
        }
    }

    // ── pandas ──────────────────────────────────────────────────────────

    private rasterizePanda(world: World, p: Panda) {
        const { cw, ch, cols, rows, palette, pose, hit } = this;
        const S = world.bodySize(p);
        const gx = p.x;
        const ground = world.groundY(p.depth);
        const gy = ground - p.climb;
        const f = p.facing;
        const t = world.time;

        pose.pose = p.pose;
        pose.legPhase = p.legPhase;
        pose.stride = clamp(p.speed / (S * 0.3), 0, 1);
        pose.stick = p.activity === "eat" ? 0.2 + 0.7 * p.holding : 0;
        pose.sprig = p.activity === "perch" && p.sprig;
        pose.chew = p.activity === "eat" || pose.sprig ? Math.sin(t * 9) * 0.015 : 0;
        pose.breath = Math.sin(t * 1.6 + p.id);
        pose.lookX = p.lookX;
        pose.lookY = p.lookY;
        pose.dozing = world.dozing(p);

        const left = f > 0 ? gx + BOUNDS[0] * S : gx - BOUNDS[1] * S;
        const right = f > 0 ? gx + BOUNDS[1] * S : gx - BOUNDS[0] * S;
        const c0 = Math.max(0, Math.floor(left / cw));
        const c1 = Math.min(cols - 1, Math.floor(right / cw));
        const r0 = Math.max(0, Math.floor((gy - BOUNDS[3] * S) / ch));
        const r1 = Math.min(rows - 1, Math.floor((gy - BOUNDS[2] * S) / ch));
        if (c0 > c1 || r0 > r1) return;

        const dim = this.depthDim(p.depth);
        const [tile0, tile1] = palette.tile;
        const at = (px: number, py: number) => classify(((px - gx) * f) / S, (gy - py) / S, pose, hit);

        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
                const x = c * cw;
                const y = r * ch;
                const centerHit = at(x + cw / 2, y + ch / 2);
                let part = hit.part;
                let nx = hit.nx;
                let ny = hit.ny;
                let rr = hit.r;
                let far = hit.far;
                let hits = centerHit ? 1 : 0;
                // Points from the cell centre toward the covered side, i.e. across the outline into the body.
                let ox = 0;
                let oy = 0;
                for (let q = 0; q < SUBSAMPLES.length; q += 2) {
                    if (!at(x + SUBSAMPLES[q] * cw, y + SUBSAMPLES[q + 1] * ch)) continue;
                    ox += SUBSAMPLES[q] - 0.5;
                    oy += SUBSAMPLES[q + 1] - 0.5;
                    if (hits === 0) ({ part, nx, ny, r: rr, far } = hit);
                    hits++;
                }
                if (hits === 0) continue;
                const coverage = hits / 5;
                const i = r * cols + c;
                const key =
                    (hash3(Math.round(((x - gx) * f) / cw), Math.round((gy - y) / ch), p.id) * 4294967295) >>> 0;

                // Rounded fur lit from the top-left of the screen, falling off toward each part's edge.
                const facing = ny * 0.8 - nx * f * 0.6;
                let lum = clamp(0.22 + 0.5 * Math.sqrt(Math.max(0, 1 - rr * rr)) + 0.18 * facing, 0, 1);
                lum *= 1 - 0.45 * smoothstep(0.75, 1, rr);
                if (far) lum *= 0.55;

                let tile: Rgb;
                let glyph = " ";
                let rgb: Rgb;
                let alpha = dim;
                if (part === PART_STICK || part === PART_NODE) {
                    tile = mix(palette.bg, ramp(palette.cane, lum - (part === PART_NODE ? 0.3 : 0)), palette.caneTile);
                    glyph = part === PART_NODE ? "=" : "|";
                    rgb = shade(tile, palette.ink + 0.2);
                } else if (part === PART_LEAF) {
                    const green = ramp(palette.leaf, 0.3 + 0.6 * lum);
                    tile = mix(palette.bg, green, 0.7);
                    glyph = (key & 1) === 0 ? "/" : "\\";
                    rgb = shade(green, 1.2);
                } else {
                    const white = part === PART_WHITE;
                    const fur = white ? palette.white : palette.black;
                    tile = mix(palette.bg, fur, tile0 + (tile1 - tile0) * lum);
                    if (part === PART_PATCH || part === PART_NOSE) tile = mix(tile, palette.patch, 0.35);
                    rgb = shade(tile, white ? palette.ink : palette.ink + 0.75);
                    if (part === PART_NOSE) {
                        glyph = "v";
                    } else if (part === PART_PAW) {
                        // Pads and claws at the tip of each limb.
                        glyph = (key & 1) === 0 ? "m" : "w";
                        rgb = shade(tile, palette.ink + 0.9);
                    } else if (coverage === 1) {
                        const set = white ? WHITE_GLYPHS : BLACK_GLYPHS;
                        const jitter = (key >>> 4) % 2;
                        glyph = set[clamp(Math.round(lum * (set.length - 2)) + jitter, 0, set.length - 1)];
                        // White fur is etched lightly so the black patches carry the shape.
                        if (white) alpha *= 0.65;
                    } else if (key % 2 === 0) {
                        // Tufts of fur bristle out along the silhouette.
                        glyph = lineGlyph(-ox * f, oy);
                        rgb = shade(tile, white ? 0.9 : 1.3);
                    }
                }
                const solid = coverage === 1 || (centerHit && coverage >= 0.6);
                this.put(i, glyph, rgb, alpha, tile, solid ? dim : dim * coverage * 0.55);
                this.cellOwner[i] = p.id;
            }
        }

        // A soft shadow on the ground under the body, thrown a little right as if lit from the top-left;
        // a climbing panda's shadow lies at the foot of its cane, smaller the higher it goes.
        const sr = Math.floor(ground / ch);
        if (sr >= 0 && sr < rows) {
            const reach = S * (p.pose === "sit" ? 0.45 : p.pose === "climb" ? 0.35 / (1 + p.climb / S) : 0.7);
            const sx = gx + S * 0.08;
            for (let c = Math.max(0, Math.floor((sx - reach) / cw)); c <= Math.min(cols - 1, (sx + reach) / cw); c++) {
                this.cellShadow[sr * cols + c] = 1;
            }
        }

        // The eye is a single bright glyph in the patch, shut in sleep and for the odd blink.
        const eye = eyeOf(pose);
        const ei = this.cellIndex(gx + eye.u * S * f, gy - eye.v * S);
        if (ei >= 0 && this.cellOwner[ei] === p.id) {
            const blink = (t * 0.7 + p.id * 0.37) % 4 < 0.12;
            const shut = p.pose === "sleep" || pose.dozing || blink;
            this.cellTile[ei] = packRgb(mix(palette.black, palette.patch, 0.4));
            this.cellTileAlpha[ei] = dim;
            this.cellGlyph[ei] = (shut ? "-" : "o").charCodeAt(0);
            this.cellColor[ei] = packRgb(palette.eye);
            this.cellAlpha[ei] = Math.min(1, dim * 1.25);
        }
    }

    private drawCells() {
        const { ctx, cw, ch, cols, cellGlyph, cellColor, cellAlpha, cellTile, cellTileAlpha, cellDim } = this;
        for (let i = 0; i < cellGlyph.length; i++) {
            const code = cellGlyph[i];
            if (!code) continue;
            const x = (i % cols) * cw;
            const y = ((i / cols) | 0) * ch;
            if (cellTileAlpha[i] > 0) {
                ctx.globalAlpha = cellTileAlpha[i] * cellDim[i];
                ctx.fillStyle = this.style(cellTile[i]);
                ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
            }
            if (code === 32) continue;
            ctx.globalAlpha = cellAlpha[i] * cellDim[i];
            ctx.fillStyle = this.style(cellColor[i]);
            ctx.fillText(String.fromCharCode(code), x + cw / 2, y + ch / 2 + 1);
        }
    }

    // ── ground and loose bits ───────────────────────────────────────────

    /** The grove floor: tufts of grass leaning with the breeze, pebbles and old fallen leaves, denser toward the front. */
    private drawGround(world: World) {
        const { cols, cw, cellGlyph, palette } = this;
        const lean = world.wind > 0.3 ? 1 : world.wind < -0.3 ? -1 : 0;
        for (let lane = 0; lane <= 6; lane++) {
            const depth = lane / 6;
            const y = world.groundY(depth);
            const alpha = (0.2 + 0.35 * depth) * palette.alpha;
            for (let c = 0; c < cols; c++) {
                const roll = hash3(c, lane, 91);
                if (roll > 0.14 + 0.16 * depth) continue;
                const i = this.cellIndex(c * cw + 1, y);
                if (i < 0 || cellGlyph[i]) continue;
                if (roll < 0.05) {
                    // A tuft: three blades splayed apart, all bending the way the wind blows.
                    const blades = lean > 0 ? ["/", "/", "/"] : lean < 0 ? ["\\", "\\", "\\"] : ["\\", "|", "/"];
                    for (let k = -1; k <= 1; k++) {
                        const j = this.cellIndex((c + k) * cw + 1, y - (k === 0 ? this.ch * 0.4 : 0));
                        if (j >= 0 && !cellGlyph[j]) this.glyphAt(j, blades[k + 1], palette.grass, alpha);
                    }
                } else if (roll < 0.075) {
                    this.glyphAt(i, "o", palette.soil, alpha * 0.8);
                } else if (roll < 0.1) {
                    this.glyphAt(i, "~", ramp(palette.leaf, 0.3), alpha * 0.8);
                } else {
                    this.glyphAt(i, roll < 0.12 ? "," : ".", palette.grass, alpha * 0.7);
                }
            }
        }
    }

    private drawShadows() {
        const { cellShadow, cellGlyph, palette } = this;
        for (let i = 0; i < cellShadow.length; i++) {
            if (!cellShadow[i] || cellGlyph[i]) continue;
            this.glyphAt(i, ":", palette.shadow, palette.shadowAlpha);
        }
    }

    /** A falling shoot tumbles end over end; one on the ground lies flat as a short ringed cane with a leaf. */
    private drawShoots(world: World) {
        const { cw, palette } = this;
        for (const s of world.shoots) {
            if (s.held) continue;
            const age = world.time - s.born;
            const fade = 1 - smoothstep(SHOOT_LIFE - 4, SHOOT_LIFE, age);
            const alpha = palette.alpha * fade;
            if (!s.landed) {
                const dx = Math.cos(s.spin);
                const dy = Math.sin(s.spin);
                for (let k = -1; k <= 1; k++) {
                    const i = this.cellIndex(s.x + dx * k * cw, s.y + dy * k * cw);
                    if (i >= 0) this.glyphAt(i, lineGlyph(dx, dy), palette.shoot, alpha);
                }
                continue;
            }
            const glyphs = ["=", "-", "-", "=", "-"];
            for (let k = 0; k < glyphs.length; k++) {
                const i = this.cellIndex(s.x + (k - 2) * cw, s.y - 1);
                if (i >= 0) this.glyphAt(i, glyphs[k], palette.shoot, alpha);
            }
            const leaf = this.cellIndex(s.x + 3 * cw, s.y - this.ch);
            if (leaf >= 0) this.glyphAt(leaf, "/", ramp(palette.leaf, 0.7), alpha);
            const leaf2 = this.cellIndex(s.x + 3.5 * cw, s.y - 1);
            if (leaf2 >= 0) this.glyphAt(leaf2, "-", ramp(palette.leaf, 0.5), alpha);
        }
    }

    private drawLeaves(world: World) {
        const { palette } = this;
        for (const l of world.leaves) {
            const i = this.cellIndex(l.x, l.y);
            if (i < 0) continue;
            const rest = l.landedAt ? 1 - (world.time - l.landedAt) / LEAF_REST : 1;
            if (l.crumb) {
                this.glyphAt(i, l.landedAt ? "." : "'", palette.shoot, palette.alpha * rest);
                continue;
            }
            // A falling leaf rocks between the two slants as it sways.
            const glyph = l.landedAt ? "_" : Math.sin(world.time * 2.4 + l.born * 7) > 0 ? "/" : "\\";
            this.glyphAt(i, glyph, ramp(palette.leaf, 0.6), palette.alpha * 0.85 * rest);
        }
    }

    /** Zs drift up and away from a sleeping panda, growing as they go. */
    private drawSnores(world: World) {
        const { palette, cw } = this;
        for (const z of world.snores) {
            const k = (world.time - z.born) / SNORE_LIFE;
            const i = this.cellIndex(z.x + k * cw * 3 + Math.sin(k * 6) * cw * 0.6, z.y - k * 60);
            if (i < 0) continue;
            this.glyphAt(i, k < 0.45 ? "z" : "Z", palette.snore, palette.alpha * Math.sin(Math.PI * k));
        }
    }

    /** A bite flashes * at the panda's mouth, settling to + then a dot. */
    private drawBites(world: World) {
        const { palette } = this;
        for (const b of world.bites) {
            const i = this.cellIndex(b.x, b.y);
            if (i < 0) continue;
            const t = (world.time - b.born) / BITE_LIFE;
            const glyph = t < 0.35 ? "*" : t < 0.7 ? "+" : ".";
            this.glyphAt(i, glyph, palette.shoot, Math.min(1, palette.alpha * 1.6) * (1 - t * t));
        }
    }
}
