import type { Pose } from "./world";

export const PART_WHITE = 1;
export const PART_BLACK = 2;
/** The dark patch around the eye; the eye itself is stamped on top as a single glyph. */
export const PART_PATCH = 3;
export const PART_STICK = 4;
export const PART_NODE = 5;

/**
 * Where a point landed on the panda. `nx`/`ny` give its offset from the centre of the part it hit,
 * normalised to the part's radius, for shading; `far` marks the limbs on the far side of the body.
 */
export interface PartHit {
    part: number;
    nx: number;
    ny: number;
    r: number;
    far: boolean;
}

export interface PandaPose {
    pose: Pose;
    legPhase: number;
    /** 0 standing still to 1 at a full walk: how far the legs swing. */
    stride: number;
    /** Length of the shoot in its paws, in body units; 0 when empty-pawed. */
    stick: number;
    /** Small head bob while chewing, and the slow rise and fall of breath while asleep. */
    chew: number;
    breath: number;
    lookX: number;
    lookY: number;
}

function ell(u: number, v: number, cx: number, cy: number, rx: number, ry: number, part: number, out: PartHit) {
    const dx = (u - cx) / rx;
    const dy = (v - cy) / ry;
    const r2 = dx * dx + dy * dy;
    if (r2 > 1) return false;
    out.part = part;
    out.r = Math.sqrt(r2);
    out.nx = dx;
    out.ny = dy;
    return true;
}

/** A rounded limb from (ax, ay) to (bx, by). */
function cap(
    u: number,
    v: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    rad: number,
    part: number,
    out: PartHit
) {
    const sx = bx - ax;
    const sy = by - ay;
    const t = Math.max(0, Math.min(1, ((u - ax) * sx + (v - ay) * sy) / (sx * sx + sy * sy || 1)));
    const ox = u - ax - sx * t;
    const oy = v - ay - sy * t;
    const d = Math.hypot(ox, oy);
    if (d > rad) return false;
    out.part = part;
    out.r = d / rad;
    out.nx = ox / rad;
    out.ny = oy / rad;
    return true;
}

/** Head, muzzle, eye patch, nose and ears, centred on (hx, hy), front-most part first. */
function head(u: number, v: number, hx: number, hy: number, out: PartHit) {
    return (
        ell(u, v, hx + 0.1, hy + 0.02, 0.085, 0.07, PART_PATCH, out) ||
        ell(u, v, hx + 0.32, hy - 0.05, 0.045, 0.04, PART_BLACK, out) ||
        ell(u, v, hx + 0.2, hy - 0.08, 0.14, 0.1, PART_WHITE, out) ||
        ell(u, v, hx, hy, 0.29, 0.27, PART_WHITE, out) ||
        ell(u, v, hx - 0.14, hy + 0.24, 0.1, 0.09, PART_BLACK, out) ||
        ell(u, v, hx + 0.08, hy + 0.27, 0.09, 0.085, PART_BLACK, out)
    );
}

/** The cane in its paws runs down from the mouth, ringed every so often like a real culm. */
function stick(u: number, v: number, len: number, out: PartHit) {
    const tx = 0.36;
    const ty = 1.06;
    const bx = 0.44;
    const by = ty - len;
    if (!cap(u, v, bx, by, tx, ty, 0.045, PART_STICK, out)) return false;
    if (((ty - v) / 0.28) % 1 > 0.85) out.part = PART_NODE;
    return true;
}

/** The eye in body units for a pose, so the renderer can stamp it into the patch. */
export function eyeOf(p: PandaPose) {
    if (p.pose === "sit") return { u: 0.21 + p.lookX * 0.04, v: 1.22 + p.chew + p.lookY * 0.04 };
    if (p.pose === "sleep") return { u: 0.76, v: 0.27 };
    return { u: 0.87 + p.lookX * 0.04, v: 0.84 + p.lookY * 0.05 };
}

/**
 * Classify a point in body coordinates, in body lengths: `u` forward from the body's centre
 * (toward the face), `v` up from the ground. Seen side-on, standing on all fours, sitting up
 * to eat, or curled up asleep.
 */
export function classify(u: number, v: number, p: PandaPose, out: PartHit) {
    out.far = false;
    if (p.pose === "sit") return sitting(u, v, p, out);
    if (p.pose === "sleep") return sleeping(u, v, p, out);
    return walking(u, v, p, out);
}

function walking(u: number, v: number, p: PandaPose, out: PartHit) {
    const b = Math.abs(Math.sin(p.legPhase)) * 0.025 * p.stride;
    const hx = 0.76 + p.lookX * 0.04;
    const hy = 0.82 + b + p.lookY * 0.05;
    if (head(u, v, hx, hy, out)) return true;

    // Diagonal pairs swing together, the way a bear ambles.
    const sw = Math.sin(p.legPhase) * 0.14 * p.stride;
    const lift = Math.max(0, Math.cos(p.legPhase)) * 0.06 * p.stride;
    const liftB = Math.max(0, -Math.cos(p.legPhase)) * 0.06 * p.stride;
    if (cap(u, v, 0.36, 0.5 + b, 0.36 + sw, 0.12 + lift, 0.12, PART_BLACK, out)) return true;
    if (cap(u, v, -0.38, 0.5 + b, -0.38 - sw, 0.12 + liftB, 0.12, PART_BLACK, out)) return true;

    if (ell(u, v, 0, 0.58 + b, 0.64, 0.34, PART_WHITE, out)) {
        // The black saddle over the shoulders, running down into the front legs.
        const bu = u - 0.3 * (v - 0.4);
        if (bu > 0.12 && bu < 0.44) out.part = PART_BLACK;
        return true;
    }

    out.far = true;
    if (cap(u, v, 0.26, 0.5 + b, 0.26 - sw, 0.12 + liftB, 0.11, PART_BLACK, out)) return true;
    if (cap(u, v, -0.48, 0.5 + b, -0.48 + sw, 0.12 + lift, 0.11, PART_BLACK, out)) return true;
    out.far = false;
    return ell(u, v, -0.66, 0.68 + b, 0.08, 0.08, PART_WHITE, out);
}

function sitting(u: number, v: number, p: PandaPose, out: PartHit) {
    const hx = 0.1 + p.lookX * 0.04;
    const hy = 1.2 + p.chew + p.lookY * 0.04;
    if (ell(u, v, hx + 0.1, hy + 0.02, 0.085, 0.07, PART_PATCH, out)) return true;
    if (ell(u, v, hx + 0.32, hy - 0.05, 0.045, 0.04, PART_BLACK, out)) return true;
    // The near paw grips the shoot in front of the face, or rests on the belly.
    const holding = p.stick > 0;
    if (cap(u, v, 0.08, 0.82, holding ? 0.38 : 0.24, holding ? 0.86 + p.chew : 0.56, 0.1, PART_BLACK, out)) return true;
    if (holding && stick(u, v, p.stick, out)) return true;
    if (head(u, v, hx, hy, out)) return true;
    if (ell(u, v, 0.3, 0.12, 0.24, 0.12, PART_BLACK, out)) return true;
    if (ell(u, v, 0, 0.52, 0.42, 0.48, PART_WHITE, out)) {
        if (v > 0.7 && v < 0.92) out.part = PART_BLACK;
        return true;
    }
    out.far = true;
    if (cap(u, v, -0.02, 0.82, holding ? 0.28 : 0.16, holding ? 0.7 : 0.5, 0.09, PART_BLACK, out)) return true;
    out.far = false;
    return false;
}

function sleeping(u: number, v: number, p: PandaPose, out: PartHit) {
    const br = p.breath * 0.02;
    if (head(u, v, 0.66, 0.25, out)) return true;
    if (ell(u, v, 0.48, 0.08, 0.16, 0.08, PART_BLACK, out)) return true;
    if (ell(u, v, -0.42, 0.1, 0.15, 0.09, PART_BLACK, out)) return true;
    if (ell(u, v, -0.02, 0.3 + br, 0.62, 0.28 + br, PART_WHITE, out)) {
        const bu = u - 0.2 * (v - 0.3);
        if (bu > 0.1 && bu < 0.42) out.part = PART_BLACK;
        return true;
    }
    return ell(u, v, -0.64, 0.36, 0.07, 0.07, PART_WHITE, out);
}
