import { clamp, TAU, type Box } from "../koi-pond/world";
import type { Pose } from "./shape";

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/**
 * What a panda is up to. On the ground it wanders, stands about, sits, eats, naps or goes for a
 * tossed shoot; it can also amble over to a cane, climb it, and perch up there to eat leaves or doze.
 */
export type Activity = "wander" | "rest" | "sit" | "eat" | "sleep" | "fetch" | "approach" | "climb" | "perch";

export interface Panda {
    id: number;
    /** Body centre, in canvas space; on the ground the feet stand on the ground line for `depth`. */
    x: number;
    /** 0 at the back of the grove to 1 at the front: sets where on the ground a panda stands and how big it looks. */
    depth: number;
    depthTarget: number;
    /** Body length at the front of the grove, before perspective shrinks it. */
    size: number;
    facing: 1 | -1;
    activity: Activity;
    pose: Pose;
    /** Where it's ambling to, while wandering. */
    targetX: number;
    /** When the current behaviour ends and the panda picks another. */
    until: number;
    speed: number;
    /** Walk and climb cycle; the limbs swing on its sine. */
    legPhase: number;
    /** The shoot this panda is going for, or eating once `held`. */
    food: Shoot | null;
    /** How much of the cane in its paws is left, 1 to 0; 0 when its paws are empty. */
    holding: number;
    /** The cane it's climbing or heading for. */
    stalk: Stalk | null;
    /** How high its feet are up the cane, in px, and how high it's going. */
    climb: number;
    climbTarget: number;
    /** Which way it faces while hugging the cane, i.e. which side of the cane it's on. */
    side: 1 | -1;
    /** Up a cane: munching a sprig of leaves rather than dozing. */
    sprig: boolean;
    nextCrumb: number;
    nextZ: number;
    /** Head turn toward the cursor, smoothed, in body units. */
    lookX: number;
    lookY: number;
    /** How strongly this panda turns to watch the cursor. */
    curiosity: number;
    /** A cub tags along after its mother. */
    mother: Panda | null;
}

/** A bamboo shoot tossed into the grove: it tumbles down, lies on the ground, then a panda picks it up and eats it. */
export interface Shoot {
    x: number;
    y: number;
    vy: number;
    spin: number;
    depth: number;
    /** Ground height for `depth`, where it comes to rest. */
    landY: number;
    born: number;
    landed: boolean;
    held: boolean;
}

/** A loose leaf drifting down from the canopy, or a crumb flicked off a cane being eaten. */
export interface Leaf {
    x: number;
    y: number;
    vx: number;
    vy: number;
    born: number;
    landY: number;
    landedAt: number;
    crumb: boolean;
}

/** A Z rising off a sleeping panda. */
export interface Snore {
    x: number;
    y: number;
    born: number;
}

/** The moment a panda bites into bamboo, drawn as a brief flash at its mouth. */
export interface Bite {
    x: number;
    y: number;
    born: number;
}

export interface Stalk {
    x: number;
    depth: number;
    height: number;
    /** Cane width at the front of the grove, in px. */
    thickness: number;
    /** Distance between the rings on the cane, in px. */
    segment: number;
    /** How far the tip sways in the wind; tall, thin canes give more. */
    flex: number;
    /** Tip offset in px, sprung back toward the wind's push. */
    bend: number;
    bendV: number;
    phase: number;
    /** Older canes are a little yellower. */
    age: number;
    branches: Branch[];
}

/** A twig off a joint of the cane, ending in a fan of leaves. */
export interface Branch {
    /** How far up the cane, 0 to 1. */
    h: number;
    side: 1 | -1;
    /** Twig angle above horizontal, and its length in px. */
    angle: number;
    length: number;
    leaves: { angle: number; length: number; phase: number; shade: number }[];
}

export const SHOOT_LIFE = 40;
export const LEAF_REST = 3;
export const BITE_LIFE = 0.45;
export const SNORE_LIFE = 2.6;
const MAX_SHOOTS = 10;
const MAX_LEAVES = 50;
const GRAVITY = 900;
/** Seconds it takes a panda to finish a cane. */
const MUNCH_TIME = 9;
/** Where the cane sits against a climbing panda's body, in body lengths in front of its centre. */
export const HUG = 0.3;

export class World {
    width = 0;
    height = 0;
    time = 0;
    pandas: Panda[] = [];
    stalks: Stalk[] = [];
    shoots: Shoot[] = [];
    leaves: Leaf[] = [];
    snores: Snore[] = [];
    bites: Bite[] = [];
    /** Breeze through the grove, about -1 to 1: positive blows to the right. */
    wind = 0;
    private gust = 0;
    private nextLeaf = 0;
    pointer = { x: 0, y: 0, vx: 0, speed: 0, active: false };
    /** Page content the pandas keep clear of when they pick a spot, in canvas space. */
    avoid: Box[] = [];

    /** Height of the ground line at a depth: the back of the grove sits higher on the screen. */
    groundY(depth: number) {
        return this.height * (0.82 + 0.14 * depth);
    }

    /** Perspective: things at the back of the grove are drawn smaller. */
    scale(depth: number) {
        return 0.6 + 0.4 * depth;
    }

    resize(width: number, height: number) {
        const first = this.width === 0;
        this.width = width;
        this.height = height;
        if (first) this.seed();
        for (const s of this.shoots) s.landY = this.groundY(s.depth);
    }

    private seed() {
        const { width: W, height: H } = this;
        const minSide = Math.min(W, H);
        const size = clamp(minSide * 0.22, 90, 210);

        this.stalks = [];
        // A hazy row of canes far back, then the grove proper; a few climbable canes are spread across the width.
        const far = clamp(Math.round(W / 110), 5, 16);
        for (let i = 0; i < far; i++)
            this.stalks.push(this.makeStalk((W * (i + rand(0.1, 0.9))) / far, rand(-0.6, -0.25)));
        const near = clamp(Math.round(W / 150), 4, 11);
        for (let i = 0; i < near; i++)
            this.stalks.push(this.makeStalk((W * (i + rand(0.2, 0.8))) / near, rand(0.1, 1)));

        this.pandas = [];
        const adults = clamp(Math.round((W * H) / 330000), 2, 5);
        for (let i = 0; i < adults; i++) {
            this.pandas.push(this.makePanda(i + 1, size * rand(0.85, 1), rand(W * 0.1, W * 0.9), null));
        }
        // Start mid-scene: one or two already up a cane, one with a cane in its paws.
        const climbers = W >= 700 ? 2 : 1;
        for (let i = 0; i < Math.min(climbers, adults - 1); i++) this.perchAtStart(this.pandas[i + 1]);
        this.startEating(this.pandas[0], true);
        // Wide screens get a cub that follows the first panda around.
        if (W >= 900) {
            const mother = this.pandas[0];
            this.pandas.push(this.makePanda(adults + 1, size * 0.5, mother.x - size, mother));
        }
    }

    private makeStalk(x: number, depth: number): Stalk {
        const ground = this.groundY(depth);
        // Most canes run off the top of the screen; a few end in a leafy crown inside it.
        const tall = depth < 0 || Math.random() < 0.75;
        const height = tall ? ground + rand(40, 200) : ground * rand(0.55, 0.85);
        const branches: Branch[] = [];
        const count = depth < 0 ? 2 + Math.floor(Math.random() * 2) : 4 + Math.floor(Math.random() * 4);
        for (let j = 0; j < count; j++) {
            branches.push(this.makeBranch(rand(tall ? 0.3 : 0.45, tall ? 0.97 : 0.9), Math.random() < 0.5 ? 1 : -1));
        }
        if (!tall) {
            for (let q = 0; q < 3; q++) branches.push(this.makeBranch(1, q % 2 === 0 ? 1 : -1, true));
        }
        return {
            x,
            depth,
            height,
            thickness: rand(13, 22),
            segment: rand(60, 95),
            flex: rand(0.6, 1.2) * (tall ? 1 : 0.6),
            bend: 0,
            bendV: 0,
            phase: rand(0, TAU),
            age: Math.random(),
            branches,
        };
    }

    private makeBranch(h: number, side: 1 | -1, crown = false): Branch {
        const leaves = [];
        const n = 4 + Math.floor(Math.random() * 4);
        for (let q = 0; q < n; q++) {
            leaves.push({
                // Fanned from nearly level to hanging down.
                angle: rand(-0.2, 1.3),
                length: rand(50, 100),
                phase: rand(0, TAU),
                shade: Math.random(),
            });
        }
        return { h, side, angle: crown ? rand(0.6, 1.2) : rand(0.25, 0.7), length: rand(14, 34), leaves };
    }

    private makePanda(id: number, size: number, x: number, mother: Panda | null): Panda {
        const depth = mother ? Math.max(0, mother.depth - 0.1) : rand(0.25, 1);
        return {
            id,
            x,
            depth,
            depthTarget: depth,
            size,
            facing: Math.random() < 0.5 ? 1 : -1,
            activity: "rest",
            pose: "walk",
            targetX: x,
            until: rand(0.5, 3),
            speed: 0,
            legPhase: rand(0, TAU),
            food: null,
            holding: 0,
            stalk: null,
            climb: 0,
            climbTarget: 0,
            side: 1,
            sprig: false,
            nextCrumb: 0,
            nextZ: 0,
            lookX: 0,
            lookY: 0,
            curiosity: rand(0.4, 1),
            mother,
        };
    }

    /** Body length on screen, after perspective. */
    bodySize(p: Panda) {
        return p.size * this.scale(p.depth);
    }

    /** Where a stalk's cane is at `h` up its height, after sway. */
    stalkX(s: Stalk, h: number) {
        return s.x + s.bend * h * h;
    }

    /** Canes a panda can climb: in the grove proper and tall enough to be worth it. */
    private climbable(S: number) {
        return this.stalks.filter(
            (s) =>
                s.depth >= 0.1 &&
                s.height > S * 3 &&
                s.x > S &&
                s.x < this.width - S &&
                !this.pandas.some((p) => p.stalk === s)
        );
    }

    /** How high up a cane a panda may go: below its crown, on screen, and clear of the page content. */
    private climbRange(s: Stalk, S: number) {
        const base = this.groundY(s.depth);
        let top = Math.max(base - s.height * 0.85, S * 0.5);
        for (const b of this.avoid) {
            if (s.x + S > b.left && s.x - S < b.right) top = Math.max(top, b.bottom + S * 0.2);
        }
        const max = base - top - S * 1.6;
        return { min: S * 0.8, max };
    }

    private perchAtStart(p: Panda) {
        const s = pick(this.climbable(this.bodySize(p)));
        if (!s) return;
        p.depth = p.depthTarget = s.depth;
        const { min, max } = this.climbRange(s, this.bodySize(p));
        if (max < min) return;
        p.stalk = s;
        p.pose = "climb";
        p.climb = p.climbTarget = rand(min, max);
        p.side = p.facing = Math.random() < 0.5 ? 1 : -1;
        p.activity = "perch";
        p.sprig = Math.random() < 0.7;
        p.until = rand(6, 14);
    }

    private startEating(p: Panda, snack: boolean) {
        p.activity = "eat";
        p.pose = "sit";
        p.holding = 1;
        p.nextCrumb = this.time + rand(0.4, 1);
        if (snack) p.food = null;
    }

    /** A shoot tossed in at (x, y): it tumbles down to the ground under the click. */
    feed(x: number, y: number) {
        if (this.shoots.length >= MAX_SHOOTS) return;
        const back = this.groundY(0);
        const front = this.groundY(1);
        // A click on the ground drops it right there; higher up it falls somewhere into the grove below.
        const depth = y >= back ? clamp((y - back) / (front - back), 0, 1) : rand(0.25, 1);
        const landY = this.groundY(depth);
        this.shoots.push({
            x: clamp(x, 20, this.width - 20),
            y: Math.min(y, landY),
            vy: -60,
            spin: rand(0, TAU),
            depth,
            landY,
            born: this.time,
            landed: false,
            held: false,
        });
    }

    step(dt: number) {
        this.time += dt;
        const t = this.time;
        const p = this.pointer;
        p.speed *= Math.exp(-dt * 8);
        p.vx *= Math.exp(-dt * 8);

        // A slow breeze that comes and goes, with the odd gust on top.
        if (Math.random() < dt * 0.08) this.gust = rand(-1, 1);
        this.gust *= Math.exp(-dt * 0.5);
        this.wind = 0.35 * Math.sin(t * 0.23) + 0.2 * Math.sin(t * 0.61 + 1.3) + this.gust * 0.6;

        for (const s of this.stalks) this.stepStalk(s, dt);
        for (const panda of this.pandas) this.stepPanda(panda, dt);

        for (const s of this.shoots) {
            if (s.landed) continue;
            s.vy += GRAVITY * dt;
            s.y += s.vy * dt;
            s.spin += dt * 9;
            if (s.y >= s.landY) {
                s.y = s.landY;
                s.landed = true;
            }
        }
        this.shoots = this.shoots.filter((s) => s.held || t - s.born < SHOOT_LIFE);
        this.assignShoots();

        if (t > this.nextLeaf) {
            this.dropLeaf();
            this.nextLeaf = t + rand(0.4, 1.4);
        }
        for (const l of this.leaves) {
            if (l.landedAt) continue;
            if (l.crumb) {
                l.vy += GRAVITY * 0.5 * dt;
            } else {
                // Leaves rock side to side as they fall, and the breeze carries them.
                l.vx += (this.wind * 40 - l.vx) * dt * 0.8;
            }
            l.x += (l.vx + (l.crumb ? 0 : Math.sin(t * 2.4 + l.born * 7) * 18)) * dt;
            l.y += l.vy * dt;
            if (l.y >= l.landY) {
                l.y = l.landY;
                l.landedAt = t;
            }
        }
        this.leaves = this.leaves.filter((l) => !l.landedAt || t - l.landedAt < LEAF_REST);
        this.snores = this.snores.filter((z) => t - z.born < SNORE_LIFE);
        this.bites = this.bites.filter((b) => t - b.born < BITE_LIFE);
    }

    private stepStalk(s: Stalk, dt: number) {
        const { pointer, time } = this;
        const scale = this.scale(s.depth);
        const base = this.groundY(s.depth);
        // Spring toward the breeze, plus a little sway of its own.
        let force = (this.wind * 26 + Math.sin(time * 1.3 + s.phase) * 4) * s.flex * scale;
        // A panda up the cane weighs it over toward its side, more the higher it sits.
        for (const p of this.pandas) {
            if (p.stalk === s && p.pose === "climb") force -= p.facing * 40 * (p.climb / s.height) * (p.size / 200);
        }
        // A cursor brushing through the canes knocks them aside, like pushing through a thicket.
        if (pointer.active && pointer.y < base && pointer.y > base - s.height) {
            const h = (base - pointer.y) / s.height;
            const dx = pointer.x - this.stalkX(s, h);
            if (Math.abs(dx) < 40) force += clamp(pointer.vx, -3000, 3000) * 0.05 * h * s.flex;
        }
        s.bendV += (force - s.bend * 6 - s.bendV * 2.2) * dt * 6;
        s.bend = clamp(s.bend + s.bendV * dt, -140, 140);
    }

    private dropLeaf() {
        if (this.leaves.length >= MAX_LEAVES) return;
        const s = pick(this.stalks.filter((s) => s.depth >= 0));
        if (!s || s.branches.length === 0) return;
        const b = pick(s.branches);
        const base = this.groundY(s.depth);
        const y = base - b.h * s.height;
        if (y < -20) return;
        this.leaves.push({
            x: this.stalkX(s, b.h) + b.side * (b.length + 30) * this.scale(s.depth),
            y,
            vx: this.wind * 30,
            vy: rand(26, 44),
            born: this.time,
            landY: base,
            landedAt: 0,
            crumb: false,
        });
    }

    /** Every shoot on the ground goes to the closest panda on the ground with empty paws. */
    private assignShoots() {
        for (const s of this.shoots) {
            if (!s.landed || s.held || this.pandas.some((p) => p.food === s)) continue;
            let best: Panda | null = null;
            let bestCost = Infinity;
            for (const p of this.pandas) {
                if (p.food || p.holding > 0 || p.stalk) continue;
                const cost = Math.abs(p.x - s.x) + Math.abs(p.depth - s.depth) * this.width * 0.3;
                if (cost < bestCost) {
                    bestCost = cost;
                    best = p;
                }
            }
            if (!best) return;
            best.food = s;
            best.activity = "fetch";
        }
    }

    /** Whether a panda standing at x would be clear of the page content. */
    private clearAt(x: number, depth: number, S: number) {
        const gy = this.groundY(depth);
        return !this.avoid.some(
            (b) => x + S * 0.7 > b.left && x - S * 0.7 < b.right && gy > b.top && gy - S * 1.3 < b.bottom
        );
    }

    private pickSpot(p: Panda, S: number) {
        const { width: W } = this;
        // Somewhere in view, and not right on top of another panda.
        const crowded = (x: number) =>
            this.pandas.some(
                (o) => o !== p && o.mother !== p && Math.abs((o.activity === "wander" ? o.targetX : o.x) - x) < S * 1.2
            );
        let x = rand(S * 0.7, W - S * 0.7);
        for (let tries = 0; tries < 20 && (!this.clearAt(x, p.depthTarget, S) || crowded(x)); tries++) {
            x = rand(S * 0.7, W - S * 0.7);
        }
        return x;
    }

    /** Pick the next thing to do once the current one runs out. */
    private choose(p: Panda, S: number) {
        const { time } = this;
        const r = Math.random();
        p.pose = "walk";
        if (r < 0.35) {
            p.activity = "wander";
            p.depthTarget = rand(0.2, 1);
            p.targetX = this.pickSpot(p, S);
        } else if (r < 0.6) {
            const s = pick(this.climbable(S));
            if (s) {
                p.activity = "approach";
                p.stalk = s;
                p.side = Math.random() < 0.5 ? 1 : -1;
                p.depthTarget = s.depth;
                return;
            }
            p.activity = "rest";
            p.until = time + rand(2, 4);
        } else if (r < 0.8) {
            this.startEating(p, true);
        } else if (r < 0.9) {
            p.activity = "sit";
            p.pose = "sit";
            p.until = time + rand(4, 8);
        } else {
            p.activity = "sleep";
            p.pose = "sleep";
            p.until = time + rand(8, 15);
        }
    }

    private crumb(p: Panda, x: number, y: number, ground: number) {
        this.bites.push({ x, y, born: this.time });
        this.leaves.push({
            x,
            y,
            vx: p.facing * rand(20, 90),
            vy: rand(-160, -60),
            born: this.time,
            landY: ground,
            landedAt: 0,
            crumb: true,
        });
    }

    private stepPanda(p: Panda, dt: number) {
        const { time, pointer } = this;
        const S = this.bodySize(p);
        const ground = this.groundY(p.depth);
        const walkSpeed = S * 0.3;
        let desired = 0;
        let goal: number | null = null;

        if (p.food && !this.shoots.includes(p.food)) {
            p.food = null;
            if (p.activity === "fetch") p.activity = "rest";
        }

        // A cub keeps close to its mother: beside her on the ground, or sat at the foot of her cane looking up.
        if (p.mother && p.activity !== "eat" && p.activity !== "fetch") {
            const m = p.mother;
            const mS = this.bodySize(m);
            const up = m.stalk && m.pose === "climb";
            const spot = up ? m.x - m.facing * mS * 0.2 : m.x - m.facing * mS * 1.1;
            p.depthTarget = Math.min(1, Math.max(0, m.depth + (up ? 0.05 : -0.1)));
            if (Math.abs(spot - p.x) > S * 0.6 || Math.abs(p.depth - p.depthTarget) > 0.08) {
                p.activity = "wander";
                p.pose = "walk";
                p.targetX = spot;
            } else if ((p.activity as Activity) === "wander") {
                p.activity = up || m.pose === "sit" ? "sit" : m.pose === "sleep" ? "sleep" : "rest";
                p.pose = p.activity === "sit" ? "sit" : p.activity === "sleep" ? "sleep" : "walk";
                p.facing = up ? (m.x > p.x ? 1 : -1) : m.facing;
                p.until = time + 1e6;
            } else {
                p.pose = up || m.pose === "sit" ? "sit" : m.pose === "sleep" ? "sleep" : "walk";
            }
        }

        // Page content can move or appear after a panda picked its height; never stay up behind it.
        if (p.stalk && (p.activity === "climb" || p.activity === "perch")) {
            const { min, max } = this.climbRange(p.stalk, S);
            const ceiling = max < min ? 0 : max;
            if (p.climbTarget > ceiling || p.climb > ceiling) {
                p.climbTarget = ceiling;
                p.activity = "climb";
            }
        }

        switch (p.activity) {
            case "wander": {
                goal = p.targetX;
                desired = walkSpeed * (p.mother ? 1.3 : 1);
                if (Math.abs(p.targetX - p.x) < S * 0.1) {
                    p.activity = "rest";
                    p.until = time + rand(1.5, 4);
                }
                break;
            }
            case "fetch": {
                const s = p.food!;
                p.depthTarget = s.depth;
                if (Math.abs(s.x - p.x) < S * 0.35 && Math.abs(s.depth - p.depth) < 0.06) {
                    s.held = true;
                    p.facing = s.x >= p.x ? 1 : -1;
                    this.startEating(p, false);
                } else {
                    goal = s.x;
                    desired = S * 0.75;
                }
                break;
            }
            case "eat": {
                // Sitting with a cane in its paws, chewing it down from the top.
                p.holding -= dt / MUNCH_TIME;
                if (time > p.nextCrumb) {
                    const m = this.mouth(p);
                    this.crumb(p, m.x, m.y, ground);
                    p.nextCrumb = time + rand(0.5, 1.1);
                }
                if (p.holding <= 0) {
                    if (p.food) this.shoots = this.shoots.filter((s) => s !== p.food);
                    p.food = null;
                    p.holding = 0;
                    // A full belly often ends in a nap.
                    const nap = Math.random() < 0.4;
                    p.activity = nap ? "sleep" : "sit";
                    p.pose = nap ? "sleep" : "sit";
                    p.until = time + (nap ? rand(8, 14) : rand(2, 4));
                }
                break;
            }
            case "approach": {
                const s = p.stalk!;
                const spot = this.stalkX(s, 0) - p.side * HUG * S;
                if (Math.abs(spot - p.x) < S * 0.08 && Math.abs(p.depth - s.depth) < 0.04) {
                    p.x = spot;
                    p.depth = s.depth;
                    p.facing = p.side;
                    p.pose = "climb";
                    p.activity = "climb";
                    p.climb = 0;
                    const { min, max } = this.climbRange(s, S);
                    p.climbTarget = max > min ? rand(min, max) : 0;
                } else {
                    goal = spot;
                    desired = walkSpeed;
                }
                break;
            }
            case "climb": {
                // Hauls itself up in bursts, quicker coming down.
                const dy = p.climbTarget - p.climb;
                const v = (dy > 0 ? 0.32 : 0.5) * S;
                p.climb += clamp(dy, -v * dt, v * dt);
                p.legPhase += Math.min(Math.abs(dy), v * dt) / (S * 0.12);
                p.speed = Math.abs(dy) > 1 ? v : 0;
                if (Math.abs(p.climbTarget - p.climb) < 1) {
                    if (p.climbTarget <= 0) {
                        p.climb = 0;
                        p.stalk = null;
                        p.pose = "walk";
                        p.activity = "rest";
                        p.facing = p.facing === 1 ? -1 : 1;
                        p.until = time + rand(1, 3);
                    } else {
                        p.activity = "perch";
                        p.sprig = Math.random() < 0.65;
                        p.until = time + rand(8, 16);
                    }
                }
                break;
            }
            case "perch": {
                p.speed = 0;
                if (p.sprig && time > p.nextCrumb) {
                    const m = this.mouth(p);
                    this.crumb(p, m.x, m.y, ground);
                    p.nextCrumb = time + rand(0.6, 1.3);
                }
                if (time > p.until) {
                    // Now and then it shifts higher before heading back down.
                    const { min, max } = this.climbRange(p.stalk!, S);
                    p.activity = "climb";
                    p.sprig = false;
                    p.climbTarget = Math.random() < 0.3 && max > min ? rand(min, max) : 0;
                }
                break;
            }
            default: {
                if (time > p.until && !p.mother) this.choose(p, S);
                // Pandas don't settle down behind the text; they wander off somewhere they can be seen first.
                const settled = (p.activity as Activity) !== "wander";
                if (settled && !p.mother && !this.clearAt(p.x, p.depth, S)) {
                    p.activity = "wander";
                    p.pose = "walk";
                    p.targetX = this.pickSpot(p, S);
                }
            }
        }

        // A quick swipe right by a dozing panda wakes it.
        if (p.activity === "sleep" && pointer.active && pointer.speed > 1200) {
            if (Math.abs(pointer.x - p.x) < S && Math.abs(pointer.y - (ground - S * 0.4)) < S) {
                p.activity = "sit";
                p.pose = "sit";
                p.until = time + rand(3, 6);
            }
        }

        if (p.pose === "climb" && p.stalk) {
            // Hang on to the cane as it sways.
            const h = (p.climb + S * 0.6) / p.stalk.height;
            p.x = this.stalkX(p.stalk, h) - p.facing * HUG * S;
        } else {
            if (goal !== null) {
                const dx = goal - p.x;
                if (Math.abs(dx) > S * 0.05) p.facing = dx > 0 ? 1 : -1;
                // Ease in as it arrives instead of stopping dead.
                desired *= clamp(Math.abs(dx) / (S * 0.4), 0.3, 1);
            }
            p.speed += (desired - p.speed) * Math.min(1, dt * 3);
            if (p.pose !== "walk") p.speed = 0;
            p.x = clamp(p.x + p.facing * p.speed * dt, -S, this.width + S);
            if (p.speed > 1) p.depth += clamp(p.depthTarget - p.depth, -dt * 0.12, dt * 0.12);
            p.legPhase += (p.speed * dt) / (S * 0.16);
        }

        // Pandas that are awake watch the cursor, and turn round to face it when it's behind them.
        let lx = 0;
        let ly = 0;
        const dozing = this.dozing(p);
        if (pointer.active && !dozing) {
            const hy = ground - p.climb - S;
            const dx = pointer.x - p.x;
            const dy = hy - pointer.y;
            const d = Math.hypot(dx, dy);
            if (d < S * 4) {
                const pull = p.curiosity * (1 - d / (S * 4));
                lx = clamp((dx * p.facing) / S, -1, 1) * pull;
                ly = clamp(dy / S, -1, 1) * pull;
                const still = p.speed < 1 && p.pose !== "climb" && p.activity !== "eat";
                if (still && dx * p.facing < -S * 0.6 && pull > 0.3) p.facing = dx > 0 ? 1 : -1;
            }
        } else if (p.mother?.pose === "climb" && p.pose === "sit") {
            ly = 0.8;
        }
        p.lookX += (lx - p.lookX) * Math.min(1, dt * 4);
        p.lookY += (ly - p.lookY) * Math.min(1, dt * 4);

        if (dozing && time > p.nextZ) {
            const head = this.head(p);
            this.snores.push({ x: head.x, y: head.y - S * 0.25, born: time });
            p.nextZ = time + rand(1, 1.6);
        }
    }

    /** Asleep on the ground, or nodding off hugging a cane. */
    dozing(p: Panda) {
        return p.activity === "sleep" || (p.activity === "perch" && !p.sprig);
    }

    /** Head position on screen for the current pose, for snores. */
    head(p: Panda) {
        const S = this.bodySize(p);
        const gy = this.groundY(p.depth) - p.climb;
        if (p.pose === "sleep") return { x: p.x + p.facing * 0.66 * S, y: gy - 0.25 * S };
        if (p.pose === "sit") return { x: p.x + p.facing * 0.1 * S, y: gy - 1.2 * S };
        if (p.pose === "climb") return { x: p.x + p.facing * 0.1 * S, y: gy - 1.2 * S };
        return { x: p.x + p.facing * 0.76 * S, y: gy - 0.82 * S };
    }

    /** Where the bamboo meets the panda's mouth while it eats. */
    mouth(p: Panda) {
        const S = this.bodySize(p);
        const gy = this.groundY(p.depth) - p.climb;
        if (p.pose === "climb") return { x: p.x + p.facing * 0.4 * S, y: gy - 1.12 * S };
        return { x: p.x + p.facing * 0.36 * S, y: gy - 1.08 * S };
    }
}
