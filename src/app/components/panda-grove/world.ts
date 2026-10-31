import { clamp, TAU, type Box } from "../koi-pond/world";

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export type Pose = "walk" | "sit" | "sleep";

export interface Panda {
    id: number;
    /** Body centre, in canvas space; the feet stand on the ground line for `depth`. */
    x: number;
    /** 0 at the back of the grove to 1 at the front: sets where on the ground a panda stands and how big it looks. */
    depth: number;
    depthTarget: number;
    /** Body length at the front of the grove, before perspective shrinks it. */
    size: number;
    facing: 1 | -1;
    pose: Pose;
    /** Where it's ambling to, or null while it stays put. */
    targetX: number | null;
    /** When the current idle behaviour ends and the panda picks another. */
    until: number;
    speed: number;
    /** Walk cycle; the legs swing on its sine. */
    legPhase: number;
    /** The shoot this panda is going for, or eating once `held`. */
    food: Shoot | null;
    /** How much of the held shoot is left, 1 to 0; 0 when its paws are empty. */
    holding: number;
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

/** A loose leaf drifting down from the canopy, or a crumb flicked off a shoot being eaten. */
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

/** The moment a panda bites into a shoot, drawn as a brief flash at its mouth. */
export interface Bite {
    x: number;
    y: number;
    born: number;
}

export interface Stalk {
    x: number;
    depth: number;
    height: number;
    /** Stalk width at the front of the grove, in px. */
    thickness: number;
    /** Distance between the rings on the cane, in px. */
    segment: number;
    /** How far the tip sways in the wind; tall, thin canes give more. */
    flex: number;
    /** Tip offset in px, sprung back toward the wind's push. */
    bend: number;
    bendV: number;
    phase: number;
    leaves: StalkLeaf[];
}

/** A leaf fixed to a stalk, at `h` up its height, angled `angle` below horizontal toward `side`. */
export interface StalkLeaf {
    h: number;
    side: 1 | -1;
    angle: number;
    length: number;
    phase: number;
}

export const SHOOT_LIFE = 40;
export const LEAF_REST = 3;
export const BITE_LIFE = 0.45;
export const SNORE_LIFE = 2.6;
const MAX_SHOOTS = 10;
const MAX_LEAVES = 40;
const GRAVITY = 900;
/** Seconds it takes a panda to finish a shoot. */
const MUNCH_TIME = 7;

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
        return this.height * (0.86 + 0.11 * depth);
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
        const size = clamp(minSide * 0.24, 100, 230);

        this.stalks = [];
        const count = clamp(Math.round(W / 130), 4, 12);
        for (let i = 0; i < count; i++) {
            const depth = Math.random();
            // Most canes run off the top of the screen; a few end in a leafy crown inside it.
            const tall = Math.random() < 0.7;
            const ground = this.groundY(depth);
            const height = tall ? ground + rand(40, 160) : ground * rand(0.45, 0.8);
            const leaves: StalkLeaf[] = [];
            const clusters = 1 + Math.floor(Math.random() * 3);
            for (let j = 0; j < clusters; j++) {
                const h = tall ? rand(0.35, 0.95) : rand(0.5, 0.9);
                const side = Math.random() < 0.5 ? 1 : -1;
                const n = 2 + Math.floor(Math.random() * 3);
                for (let q = 0; q < n; q++) {
                    leaves.push({ h, side, angle: rand(0.25, 1.1), length: rand(40, 85), phase: rand(0, TAU) });
                }
            }
            if (!tall) {
                for (let q = 0; q < 5; q++) {
                    leaves.push({
                        h: 1,
                        side: q % 2 === 0 ? 1 : -1,
                        angle: rand(-0.6, 0.6),
                        length: rand(45, 80),
                        phase: rand(0, TAU),
                    });
                }
            }
            this.stalks.push({
                x: (W * (i + rand(0.15, 0.85))) / count,
                depth,
                height,
                thickness: rand(9, 18),
                segment: rand(55, 90),
                flex: rand(0.6, 1.2) * (tall ? 1 : 0.6),
                bend: 0,
                bendV: 0,
                phase: rand(0, TAU),
                leaves,
            });
        }

        this.pandas = [];
        const adults = clamp(Math.round((W * H) / 650000), 1, 3);
        for (let i = 0; i < adults; i++) {
            this.pandas.push(this.makePanda(i + 1, size * rand(0.85, 1), rand(W * 0.15, W * 0.85), null));
        }
        // Wide screens get a cub that follows the first panda around.
        if (W >= 900) {
            const mother = this.pandas[0];
            this.pandas.push(this.makePanda(adults + 1, size * 0.5, mother.x - size, mother));
        }
    }

    private makePanda(id: number, size: number, x: number, mother: Panda | null): Panda {
        const depth = mother ? Math.max(0, mother.depth - 0.1) : rand(0.2, 1);
        return {
            id,
            x,
            depth,
            depthTarget: depth,
            size,
            facing: Math.random() < 0.5 ? 1 : -1,
            pose: Math.random() < 0.4 ? "sit" : "walk",
            targetX: null,
            until: rand(0.3, 2),
            speed: 0,
            legPhase: rand(0, TAU),
            food: null,
            holding: 0,
            nextCrumb: 0,
            nextZ: 0,
            lookX: 0,
            lookY: 0,
            curiosity: rand(0.4, 1),
            mother,
        };
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
            this.nextLeaf = t + rand(0.6, 2);
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

    /** Where a stalk's cane is at `h` up its height, after sway. */
    stalkX(s: Stalk, h: number) {
        return s.x + s.bend * h * h;
    }

    private stepStalk(s: Stalk, dt: number) {
        const { pointer, time } = this;
        const scale = this.scale(s.depth);
        const base = this.groundY(s.depth);
        // Spring toward the breeze, plus a little sway of its own.
        let force = (this.wind * 26 + Math.sin(time * 1.3 + s.phase) * 4) * s.flex * scale;
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
        const s = this.stalks[Math.floor(Math.random() * this.stalks.length)];
        if (!s || s.leaves.length === 0) return;
        const leaf = s.leaves[Math.floor(Math.random() * s.leaves.length)];
        const base = this.groundY(s.depth);
        const y = base - leaf.h * s.height;
        if (y < -20) return;
        this.leaves.push({
            x: this.stalkX(s, leaf.h) + leaf.side * leaf.length * 0.5,
            y,
            vx: this.wind * 30,
            vy: rand(26, 44),
            born: this.time,
            landY: base,
            landedAt: 0,
            crumb: false,
        });
    }

    /** Every shoot on the ground goes to the closest panda with empty paws. */
    private assignShoots() {
        for (const s of this.shoots) {
            if (!s.landed || s.held || this.pandas.some((p) => p.food === s)) continue;
            let best: Panda | null = null;
            let bestCost = Infinity;
            for (const p of this.pandas) {
                if (p.food) continue;
                const cost = Math.abs(p.x - s.x) + Math.abs(p.depth - s.depth) * this.width * 0.3;
                if (cost < bestCost) {
                    bestCost = cost;
                    best = p;
                }
            }
            if (!best) return;
            best.food = s;
            best.targetX = null;
            // Bamboo wakes anyone up.
            if (best.pose === "sleep") best.pose = "sit";
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
            this.pandas.some((o) => o !== p && o.mother !== p && Math.abs((o.targetX ?? o.x) - x) < S * 1.2);
        let x = rand(S * 0.7, W - S * 0.7);
        for (let tries = 0; tries < 20 && (!this.clearAt(x, p.depthTarget, S) || crowded(x)); tries++) {
            x = rand(S * 0.7, W - S * 0.7);
        }
        return x;
    }

    private stepPanda(p: Panda, dt: number) {
        const { time, pointer } = this;
        const S = p.size * this.scale(p.depth);
        const walkSpeed = S * 0.3;
        let desired = 0;
        let goal: number | null = null;

        if (p.food && !this.shoots.includes(p.food)) {
            p.food = null;
            p.holding = 0;
        }

        if (p.food && p.food.held) {
            // Sitting with the shoot in its paws, chewing it down from the top.
            p.pose = "sit";
            p.holding -= dt / MUNCH_TIME;
            if (time > p.nextCrumb) {
                const mouth = this.mouth(p);
                this.bites.push({ x: mouth.x, y: mouth.y, born: time });
                this.leaves.push({
                    x: mouth.x,
                    y: mouth.y,
                    vx: p.facing * rand(20, 90),
                    vy: rand(-160, -60),
                    born: time,
                    landY: this.groundY(p.depth),
                    landedAt: 0,
                    crumb: true,
                });
                p.nextCrumb = time + rand(0.5, 1.1);
            }
            if (p.holding <= 0) {
                this.shoots = this.shoots.filter((s) => s !== p.food);
                p.food = null;
                p.holding = 0;
                // A full belly often ends in a nap.
                p.pose = Math.random() < 0.4 ? "sleep" : "sit";
                p.until = time + (p.pose === "sleep" ? rand(8, 14) : rand(2, 4));
            }
        } else if (p.food) {
            const s = p.food;
            p.depthTarget = s.depth;
            const reach = S * 0.35;
            if (Math.abs(s.x - p.x) < reach && Math.abs(s.depth - p.depth) < 0.06) {
                s.held = true;
                p.holding = 1;
                p.nextCrumb = time + 0.8;
                p.facing = s.x >= p.x ? 1 : -1;
            } else {
                p.pose = "walk";
                goal = s.x;
                desired = S * 0.75;
            }
        } else if (p.mother) {
            const m = p.mother;
            const mS = m.size * this.scale(m.depth);
            const spot = m.x - m.facing * mS * 1.1;
            p.depthTarget = Math.max(0, m.depth - 0.1);
            if (Math.abs(spot - p.x) > S * 0.6 || Math.abs(p.depth - p.depthTarget) > 0.08) {
                p.pose = "walk";
                goal = spot;
                desired = Math.abs(spot - p.x) > S * 2 ? S * 0.9 : walkSpeed * 1.2;
            } else if (m.pose !== "walk" || m.speed < 1) {
                // Settle down beside her, the way she has.
                p.pose = m.pose === "walk" ? "walk" : m.pose;
                p.facing = m.facing;
            }
        } else {
            if (time > p.until) {
                // Pandas don't settle down behind the text; they wander off somewhere they can be seen first.
                const r = this.clearAt(p.x, p.depth, S) ? Math.random() : 0;
                if (r < 0.55) {
                    p.pose = "walk";
                    p.depthTarget = rand(0.15, 1);
                    p.targetX = this.pickSpot(p, S);
                    p.until = time + 30;
                } else if (r < 0.82) {
                    p.pose = "sit";
                    p.targetX = null;
                    p.until = time + rand(4, 9);
                } else {
                    p.pose = "sleep";
                    p.targetX = null;
                    p.until = time + rand(8, 15);
                }
            }
            if (p.pose === "walk" && p.targetX !== null) {
                goal = p.targetX;
                desired = walkSpeed;
                if (Math.abs(p.targetX - p.x) < S * 0.1) {
                    p.targetX = null;
                    p.until = time + rand(1.5, 4);
                }
            }
            // A quick swipe right by a dozing panda wakes it.
            if (p.pose === "sleep" && pointer.active && pointer.speed > 1200) {
                if (Math.abs(pointer.x - p.x) < S && Math.abs(pointer.y - (this.groundY(p.depth) - S * 0.4)) < S) {
                    p.pose = "sit";
                    p.until = time + rand(3, 6);
                }
            }
        }

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

        // Pandas that are awake watch the cursor, and turn round to face it when it's behind them.
        let lx = 0;
        let ly = 0;
        if (pointer.active && p.pose !== "sleep") {
            const hy = this.groundY(p.depth) - S;
            const dx = pointer.x - p.x;
            const dy = hy - pointer.y;
            const d = Math.hypot(dx, dy);
            if (d < S * 4) {
                const pull = p.curiosity * (1 - d / (S * 4));
                lx = clamp((dx * p.facing) / S, -1, 1) * pull;
                ly = clamp(dy / S, -1, 1) * pull;
                if (p.speed < 1 && !p.food && dx * p.facing < -S * 0.6 && pull > 0.3) p.facing = dx > 0 ? 1 : -1;
            }
        }
        p.lookX += (lx - p.lookX) * Math.min(1, dt * 4);
        p.lookY += (ly - p.lookY) * Math.min(1, dt * 4);

        if (p.pose === "sleep" && time > p.nextZ) {
            const head = this.head(p);
            this.snores.push({ x: head.x, y: head.y - S * 0.25, born: time });
            p.nextZ = time + rand(1, 1.6);
        }
    }

    /** Head position on screen for the current pose, for snores. */
    head(p: Panda) {
        const S = p.size * this.scale(p.depth);
        const gy = this.groundY(p.depth);
        if (p.pose === "sleep") return { x: p.x + p.facing * 0.66 * S, y: gy - 0.25 * S };
        if (p.pose === "sit") return { x: p.x + p.facing * 0.1 * S, y: gy - 1.2 * S };
        return { x: p.x + p.facing * 0.76 * S, y: gy - 0.82 * S };
    }

    /** Where the shoot meets the panda's mouth while it eats. */
    mouth(p: Panda) {
        const S = p.size * this.scale(p.depth);
        return { x: p.x + p.facing * 0.36 * S, y: this.groundY(p.depth) - 1.08 * S };
    }
}
