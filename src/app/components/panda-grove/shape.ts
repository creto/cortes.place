export const PART_WHITE = 1;
export const PART_BLACK = 2;
/** The dark patch around the eye; the eye itself is stamped on top as a single glyph. */
export const PART_PATCH = 3;
export const PART_STICK = 4;
export const PART_NODE = 5;
/** The pads and claws at the end of a limb. */
export const PART_PAW = 6;
export const PART_NOSE = 7;
/** A sprig of bamboo leaves held in a paw. */
export const PART_LEAF = 8;

export type Pose = "walk" | "sit" | "sleep" | "climb";

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
    /** 0 standing still to 1 at a full walk or climb: how far the limbs swing. */
    stride: number;
    /** Length of the cane in its paws, in body units; 0 when empty-pawed. */
    stick: number;
    /** Holding a sprig of leaves to its mouth, up a cane. */
    sprig: boolean;
    /** Small head bob while chewing, and the slow rise and fall of breath while asleep. */
    chew: number;
    breath: number;
    lookX: number;
    lookY: number;
    /** Eyes shut and head drooped: dozing, on the ground or hugging a cane. */
    dozing: boolean;
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

/** A rounded limb from (ax, ay) to (bx, by); its last stretch is the paw. */
function limb(
    u: number,
    v: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    rad: number,
    out: PartHit,
    paw = true
) {
    const sx = bx - ax;
    const sy = by - ay;
    const t = Math.max(0, Math.min(1, ((u - ax) * sx + (v - ay) * sy) / (sx * sx + sy * sy || 1)));
    const ox = u - ax - sx * t;
    const oy = v - ay - sy * t;
    // Limbs taper a little toward the paw.
    const r = rad * (1 - 0.15 * t);
    const d = Math.hypot(ox, oy);
    if (d > r) return false;
    out.part = paw && t > 0.92 ? PART_PAW : PART_BLACK;
    out.r = d / r;
    out.nx = ox / r;
    out.ny = oy / r;
    return true;
}

/**
 * Head centred on (hx, hy), front-most part first: a tear-drop patch slanting down
 * toward the muzzle, a dark nose, round cheeks, and ears set high and wide.
 */
function head(u: number, v: number, hx: number, hy: number, out: PartHit) {
    return (
        ell(u, v, hx + 0.11, hy + 0.025, 0.08, 0.065, PART_PATCH, out) ||
        ell(u, v, hx + 0.085, hy - 0.025, 0.055, 0.055, PART_PATCH, out) ||
        ell(u, v, hx + 0.335, hy - 0.04, 0.05, 0.038, PART_NOSE, out) ||
        ell(u, v, hx + 0.22, hy - 0.08, 0.14, 0.105, PART_WHITE, out) ||
        ell(u, v, hx, hy, 0.29, 0.27, PART_WHITE, out) ||
        ell(u, v, hx + 0.04, hy - 0.1, 0.27, 0.2, PART_WHITE, out) ||
        ell(u, v, hx - 0.14, hy + 0.235, 0.1, 0.09, PART_BLACK, out) ||
        ell(u, v, hx + 0.08, hy + 0.27, 0.09, 0.085, PART_BLACK, out)
    );
}

/** A cane held upright with its top at the mouth, ringed every so often and fanning a few leaves at its foot. */
function heldCane(u: number, v: number, tx: number, ty: number, len: number, out: PartHit) {
    const bx = tx + 0.08;
    const by = ty - len;
    const sx = tx - bx;
    const sy = ty - by;
    const t = Math.max(0, Math.min(1, ((u - bx) * sx + (v - by) * sy) / (sx * sx + sy * sy)));
    const d = Math.hypot(u - bx - sx * t, v - by - sy * t);
    if (d < 0.045) {
        out.part = ((ty - v) / 0.26) % 1 > 0.84 ? PART_NODE : PART_STICK;
        out.r = d / 0.045;
        out.nx = (u - bx - sx * t) / 0.045;
        out.ny = 0;
        return true;
    }
    return (
        ell(u, v, bx + 0.1, by + 0.02, 0.11, 0.035, PART_LEAF, out) ||
        ell(u, v, bx + 0.05, by - 0.05, 0.035, 0.08, PART_LEAF, out)
    );
}

/** The eye in body units for a pose, so the renderer can stamp it into the patch. */
export function eyeOf(p: PandaPose) {
    if (p.pose === "sit") {
        const doze = p.dozing ? 1 : 0;
        return { u: 0.21 + p.lookX * 0.04 + doze * 0.04, v: 1.225 + p.chew + p.lookY * 0.04 - doze * 0.07 };
    }
    if (p.pose === "sleep") return { u: 0.765, v: 0.275 };
    if (p.pose === "climb") return { u: climbHead(p).hx + 0.105, v: climbHead(p).hy + 0.025 };
    const sway = Math.cos(p.legPhase * 2) * 0.015 * p.stride;
    return { u: 0.87 + p.lookX * 0.04, v: 0.845 + walkBob(p) + p.lookY * 0.05 - sway };
}

const walkBob = (p: PandaPose) => Math.abs(Math.sin(p.legPhase)) * 0.025 * p.stride;

function climbHead(p: PandaPose) {
    const droop = p.dozing ? -0.06 : 0;
    return { hx: 0.04 + p.lookX * 0.03 + (p.dozing ? 0.06 : 0), hy: 1.24 + droop + p.lookY * 0.04 + p.chew };
}

/** Where the mouth is, in body units, for crumbs and bites. */
export function mouthOf(p: PandaPose) {
    if (p.pose === "climb") {
        const { hx, hy } = climbHead(p);
        return { u: hx + 0.3, v: hy - 0.1 };
    }
    return { u: 0.36, v: 1.08 };
}

/**
 * Classify a point in body coordinates, in body lengths: `u` forward from the body's centre
 * (toward the face, or toward the cane it's climbing), `v` up from its feet. Seen side-on:
 * ambling on all fours, sitting up to eat, curled up asleep, or hugging a bamboo cane.
 */
export function classify(u: number, v: number, p: PandaPose, out: PartHit) {
    out.far = false;
    if (p.pose === "sit") return sitting(u, v, p, out);
    if (p.pose === "sleep") return sleeping(u, v, p, out);
    if (p.pose === "climb") return climbing(u, v, p, out);
    return walking(u, v, p, out);
}

function walking(u: number, v: number, p: PandaPose, out: PartHit) {
    const b = walkBob(p);
    // The head swings low and side to side with each step, the way a bear ambles.
    const hx = 0.76 + p.lookX * 0.04;
    const hy = 0.82 + b + p.lookY * 0.05 - Math.cos(p.legPhase * 2) * 0.015 * p.stride;
    if (head(u, v, hx, hy, out)) return true;

    // Diagonal pairs swing together.
    const sw = Math.sin(p.legPhase) * 0.14 * p.stride;
    const lift = Math.max(0, Math.cos(p.legPhase)) * 0.06 * p.stride;
    const liftB = Math.max(0, -Math.cos(p.legPhase)) * 0.06 * p.stride;
    if (limb(u, v, 0.36, 0.5 + b, 0.38 + sw, 0.1 + lift, 0.125, out)) return true;
    if (limb(u, v, -0.38, 0.5 + b, -0.36 - sw, 0.1 + liftB, 0.13, out)) return true;

    // A deep chest and a rounded rump, slung low between the legs.
    if (ell(u, v, 0, 0.58 + b, 0.64, 0.34, PART_WHITE, out) || ell(u, v, -0.3, 0.6 + b, 0.36, 0.33, PART_WHITE, out)) {
        // The black saddle over the shoulders, running down into the front legs.
        const bu = u - 0.3 * (v - 0.4 - b);
        if (bu > 0.1 && bu < 0.44) out.part = PART_BLACK;
        return true;
    }

    out.far = true;
    if (limb(u, v, 0.26, 0.5 + b, 0.27 - sw, 0.1 + liftB, 0.11, out)) return true;
    if (limb(u, v, -0.48, 0.5 + b, -0.47 + sw, 0.1 + lift, 0.11, out)) return true;
    out.far = false;
    return ell(u, v, -0.68, 0.7 + b, 0.08, 0.075, PART_WHITE, out);
}

function sitting(u: number, v: number, p: PandaPose, out: PartHit) {
    const hx = 0.1 + p.lookX * 0.04 + (p.dozing ? 0.04 : 0);
    const hy = 1.2 + p.chew + p.lookY * 0.04 - (p.dozing ? 0.07 : 0);
    const holding = p.stick > 0;
    // The near paw grips the cane in front of the face, or rests on the round belly.
    if (limb(u, v, 0.08, 0.82, holding ? 0.38 : 0.26, holding ? 0.86 + p.chew : 0.52, 0.1, out)) return true;
    if (holding && heldCane(u, v, 0.36, 1.06 + p.chew, p.stick, out)) return true;
    if (head(u, v, hx, hy, out)) return true;
    // Hind legs stretched out in front, soles showing.
    if (ell(u, v, 0.48, 0.13, 0.07, 0.11, PART_PAW, out)) return true;
    if (ell(u, v, 0.26, 0.12, 0.25, 0.12, PART_BLACK, out)) return true;
    if (ell(u, v, 0, 0.5, 0.43, 0.48, PART_WHITE, out) || ell(u, v, 0.08, 0.36, 0.38, 0.32, PART_WHITE, out)) {
        // The black band across the shoulders.
        if (v > 0.7 && v < 0.92 && u < 0.3) out.part = PART_BLACK;
        return true;
    }
    out.far = true;
    if (limb(u, v, -0.02, 0.82, holding ? 0.28 : 0.16, holding ? 0.7 : 0.5, 0.09, out)) return true;
    if (ell(u, v, 0.2, 0.08, 0.22, 0.1, PART_BLACK, out)) return true;
    out.far = false;
    return false;
}

function sleeping(u: number, v: number, p: PandaPose, out: PartHit) {
    const br = p.breath * 0.02;
    if (ell(u, v, 0.6, 0.12, 0.16, 0.07, PART_PAW, out)) return true;
    if (head(u, v, 0.66, 0.25, out)) return true;
    if (limb(u, v, 0.3, 0.2, 0.5, 0.08, 0.1, out)) return true;
    if (ell(u, v, -0.42, 0.1, 0.15, 0.09, PART_BLACK, out)) return true;
    if (ell(u, v, -0.02, 0.3 + br, 0.62, 0.28 + br, PART_WHITE, out)) {
        const bu = u - 0.2 * (v - 0.3);
        if (bu > 0.1 && bu < 0.4) out.part = PART_BLACK;
        return true;
    }
    return ell(u, v, -0.64, 0.36, 0.07, 0.07, PART_WHITE, out);
}

/**
 * Hugging a cane that runs straight up at u = 0.3: arms reach up around it, hind legs grip lower down,
 * and the limbs take turns hauling while it climbs.
 */
function climbing(u: number, v: number, p: PandaPose, out: PartHit) {
    const reach = Math.sin(p.legPhase) * 0.13 * p.stride;
    const { hx, hy } = climbHead(p);
    if (p.sprig) {
        // A sprig of leaves pulled off the cane, held up to the mouth.
        if (ell(u, v, hx + 0.36, hy - 0.02, 0.05, 0.12, PART_LEAF, out)) return true;
        if (ell(u, v, hx + 0.43, hy + 0.06, 0.04, 0.1, PART_LEAF, out)) return true;
        if (limb(u, v, 0.1, 0.98, hx + 0.3, hy - 0.16, 0.1, out)) return true;
    } else if (limb(u, v, 0.1, 0.98, 0.34, 1.3 + reach, 0.1, out)) return true;
    if (limb(u, v, 0.06, 0.3, 0.34, 0.18 - reach, 0.12, out)) return true;
    if (head(u, v, hx, hy, out)) return true;
    if (ell(u, v, 0, 0.62, 0.34, 0.48, PART_WHITE, out) || ell(u, v, -0.04, 0.36, 0.33, 0.3, PART_WHITE, out)) {
        if (v > 0.84 && v < 1.04) out.part = PART_BLACK;
        return true;
    }
    out.far = true;
    if (limb(u, v, 0.02, 0.98, 0.32, 1.1 - reach, 0.09, out)) return true;
    if (limb(u, v, -0.02, 0.3, 0.3, 0.36 + reach, 0.1, out)) return true;
    out.far = false;
    return ell(u, v, -0.32, 0.2, 0.07, 0.07, PART_WHITE, out);
}
