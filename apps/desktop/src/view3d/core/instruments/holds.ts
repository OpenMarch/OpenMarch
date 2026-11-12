/**
 * Arm poses for carrying an instrument (docs/3d/instruments.md §5), as
 * target points in the body's rest frame: where the elbow and wrist go and
 * which way the fingers point, for each arm, plus where the instrument sits.
 * `armPose.ts` aims the bones at these. The wrists and the "elbow out"
 * direction come from the owner's reference photos; each elbow is then the
 * point 0.205 m from the shoulder and 0.264 m from the wrist nearest that
 * direction (the arm's bone lengths), so every target is reachable. Tune
 * them here, nowhere else.
 *
 * Frame: meters, +X the performer's left, +Y up, +Z forward. Landmarks
 * (class 1.00): shoulders at (±0.185, 1.397), chest front z 0.12, chin
 * y 1.52, eye line y 1.62. Upper arm 0.205 m, forearm 0.264 m.
 * Pure: no three.js.
 */
import { brassHorn } from "./brass";
import type { Vec3 } from "./mesh";
import type { BrassModelId } from "./model";

export type HoldState = "up" | "carry" | "trail";
export const HOLD_STATES: readonly HoldState[] = ["up", "carry", "trail"];
export type HoldFamily =
    | "trumpet"
    | "mellophone"
    | "baritone"
    | "euphonium"
    | "trombone"
    | "bassTrombone"
    | "contra"
    | "sousaphone"
    | "flute"
    | "piccolo"
    | "clarinet"
    | "bassClarinet"
    | "sax"
    | "snare"
    | "tenors"
    | "bass"
    | "cymbals"
    | "flag"
    | "swingFlag"
    | "doubleSwingFlag"
    | "rifle"
    | "sabre";

export interface ArmTargets {
    elbow: Vec3;
    wrist: Vec3;
    /** Unit vector: the hand bone's +Y, wrist toward the fingertips. */
    fingers: Vec3;
}

export interface Hold {
    family: HoldFamily;
    state: HoldState;
    right: ArmTargets;
    left: ArmTargets;
    instrument: { origin: Vec3; bellAxis: Vec3; capsAxis: Vec3 };
    /**
     * The head's turn about its joint, degrees: `pitch` up (chin raised),
     * `roll` toward the performer's left shoulder, `yaw` turned toward the
     * performer's left. Absent: {@link HEAD_UP}.
     */
    head?: { pitch: number; roll: number; yaw?: number };
}

/** Every performer plays with the head up 15 degrees (owner, 2026-11-10). */
export const HEAD_UP = { pitch: 15, roll: 0 } as const;
/** The head's joint (DEF-spine006) at bind, class 1.00: the head turns about it. */
const HEAD_JOINT: Vec3 = [0, 1.565, -0.005];

/**
 * The head's turn as a world-space quaternion [x, y, z, w]: the roll about
 * the forward axis, then the pitch about the left one (a positive pitch
 * lifts the face, which is a negative turn about +X).
 */
export function headQuaternion(
    head: Hold["head"] = HEAD_UP,
): [number, number, number, number] {
    const { pitch, roll, yaw = 0 } = head;
    const p = (-pitch * Math.PI) / 360;
    const r = (-roll * Math.PI) / 360;
    const t = (yaw * Math.PI) / 360;
    // q = qYaw(about Y) * qPitch(about X) * qRoll(about Z)
    const [px, pw] = [Math.sin(p), Math.cos(p)];
    const [rz, rw] = [Math.sin(r), Math.cos(r)];
    const pr = [px * rw, -px * rz, pw * rz, pw * rw];
    const [ty, tw] = [Math.sin(t), Math.cos(t)];
    // (0, ty, 0, tw) * pr
    return [
        tw * pr[0] + ty * pr[2],
        tw * pr[1] + ty * pr[3],
        tw * pr[2] - ty * pr[0],
        tw * pr[3] - ty * pr[1],
    ];
}

/** A point of the head at bind, where the hold's head turn carries it. */
export function onTurnedHead(head: Hold["head"], p: Vec3): Vec3 {
    const [x, y, z, w] = headQuaternion(head);
    const v: Vec3 = [
        p[0] - HEAD_JOINT[0],
        p[1] - HEAD_JOINT[1],
        p[2] - HEAD_JOINT[2],
    ];
    // v + 2w(q×v) + 2q×(q×v)
    const c1: Vec3 = [
        y * v[2] - z * v[1],
        z * v[0] - x * v[2],
        x * v[1] - y * v[0],
    ];
    const c2: Vec3 = [
        y * c1[2] - z * c1[1],
        z * c1[0] - x * c1[2],
        x * c1[1] - y * c1[0],
    ];
    return [
        HEAD_JOINT[0] + v[0] + 2 * (w * c1[0] + c2[0]),
        HEAD_JOINT[1] + v[1] + 2 * (w * c1[1] + c2[1]),
        HEAD_JOINT[2] + v[2] + 2 * (w * c1[2] + c2[2]),
    ];
}

export const holdId = (family: HoldFamily, state: HoldState) =>
    `${family}:${state}`;

const unit = (v: Vec3): Vec3 => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
};
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const round3 = (v: Vec3): Vec3 => [
    Math.round(v[0] * 1000) / 1000,
    Math.round(v[1] * 1000) / 1000,
    Math.round(v[2] * 1000) / 1000,
];

/** The arm's joints at bind (class 1.00) and its bone lengths. */
const SHOULDER_L: Vec3 = [0.185, 1.397, -0.005];
const SHOULDER_R: Vec3 = [-0.185, 1.397, -0.005];
const UPPER_ARM = 0.205;
const FOREARM = 0.264;
/**
 * Where the mouthpiece's rim meets the lips, with the head at bind (read
 * off a close-up of the face; owner, 2026-11-10: the first guess, 3 cm
 * lower, put the rim on the chin). A hold turns it with the head.
 */
const LIPS: Vec3 = [0, 1.588, 0.088];
/** How far the hand's middle (where it grips) and its knuckles lie from the wrist. */
const PALM = 0.075;
const KNUCKLES = 0.1;

/**
 * The elbow for a wrist target: the point the upper arm's length from the
 * shoulder and the forearm's from the wrist, on the side `out` points to.
 * A wrist out of reach gets the elbow on the straight line to it.
 */
function elbowFor(shoulder: Vec3, wrist: Vec3, out: Vec3): Vec3 {
    const sw = sub(wrist, shoulder);
    const d = Math.hypot(...sw);
    const n = mul(sw, 1 / d);
    if (d >= UPPER_ARM + FOREARM - 1e-6)
        return round3(add(shoulder, mul(n, UPPER_ARM)));
    const a = (UPPER_ARM ** 2 - FOREARM ** 2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, UPPER_ARM ** 2 - a * a));
    const o = unit(sub(out, mul(n, dot(out, n))));
    return round3(add(add(shoulder, mul(n, a)), mul(o, h)));
}

/** An arm reaching to `wrist` with the fingers along `fingers`, the elbow toward `out`. */
function armTo(
    side: "left" | "right",
    wrist: Vec3,
    fingers: Vec3,
    out: Vec3,
): ArmTargets {
    const shoulder = side === "left" ? SHOULDER_L : SHOULDER_R;
    return {
        elbow: elbowFor(shoulder, wrist, out),
        wrist: round3(wrist),
        fingers: unit(fingers),
    };
}

/** A hold's instrument placement as a frame: origin and the axes x, y (caps), z (bell). */
interface Frame {
    o: Vec3;
    x: Vec3;
    y: Vec3;
    z: Vec3;
}
function frameOf(inst: Hold["instrument"]): Frame {
    const z = unit(inst.bellAxis);
    const y = unit(sub(inst.capsAxis, mul(z, dot(inst.capsAxis, z))));
    return { o: inst.origin, x: cross(y, z), y, z };
}
/** A point in the instrument's frame, in the body's. */
const toBody = (f: Frame, p: Vec3): Vec3 =>
    add(add(add(f.o, mul(f.x, p[0])), mul(f.y, p[1])), mul(f.z, p[2]));
/** A direction in the instrument's frame, in the body's. */
const dirToBody = (f: Frame, d: Vec3): Vec3 =>
    add(add(mul(f.x, d[0]), mul(f.y, d[1])), mul(f.z, d[2]));
/** A body point in the instrument's frame. */
const toInstrument = (f: Frame, p: Vec3): Vec3 => {
    const d = sub(p, f.o);
    return [dot(d, f.x), dot(d, f.y), dot(d, f.z)];
};

/** Horns up are played 15 degrees above level (owner, 2026-11-10). */
export const HORN_PITCH_DEG = 15;
const PITCH = (HORN_PITCH_DEG * Math.PI) / 180;
/** The bell's way when a horn is up: forward, raised by the pitch. */
const BELL_UP: Vec3 = [0, Math.sin(PITCH), Math.cos(PITCH)];
const CAPS_UP: Vec3 = [0, Math.cos(PITCH), -Math.sin(PITCH)];

/** The placement that puts `rim` (in the instrument frame) at the lips, pitched up. */
/** Where the lips are with the head turned as `head` says. */
export function playingLips(head: Hold["head"] = HEAD_UP): Vec3 {
    return onTurnedHead(head, LIPS);
}

function atLips(
    rim: Vec3,
    head: Hold["head"] = HEAD_UP,
    /** Degrees the bell turns toward the performer's left (negative: right), about the vertical. */
    yawDeg = 0,
    /** Degrees the horn rolls about its own axis, its left side down. */
    rollDeg = 0,
    /** How far the mouthpiece sits left of the lips' center, meters. */
    offCenter = 0,
): Hold["instrument"] {
    const lips = add(playingLips(head), [offCenter, 0, 0]);
    const a = (yawDeg * Math.PI) / 180;
    const r = (rollDeg * Math.PI) / 180;
    const turn = (v: Vec3): Vec3 => [
        v[0] * Math.cos(a) + v[2] * Math.sin(a),
        v[1],
        -v[0] * Math.sin(a) + v[2] * Math.cos(a),
    ];
    // the caps rolled toward the left, then pitched up with the bell
    const capsRolled: Vec3 = [
        Math.sin(r),
        Math.cos(r) * Math.cos(PITCH),
        -Math.cos(r) * Math.sin(PITCH),
    ];
    const bellAxis = yawDeg ? turn(BELL_UP) : BELL_UP;
    const capsAxis = turn(rollDeg ? capsRolled : CAPS_UP);
    const f = frameOf({ origin: [0, 0, 0], bellAxis, capsAxis });
    return {
        origin: round3(sub(lips, dirToBody(f, rim))),
        bellAxis,
        capsAxis,
    };
}

const mean = (ps: Vec3[]): Vec3 =>
    mul(
        ps.reduce((a, p) => add(a, p), [0, 0, 0] as Vec3),
        1 / ps.length,
    );

/**
 * A valved horn up (owner, 2026-11-10): pitched 15 degrees above level
 * with the mouthpiece's rim at the lips. The right hand comes over the
 * valves from the performer's right, its fingertips on the buttons; the
 * left hand wraps the valve casings from the left side, its palm against
 * them halfway down, the fingers round the front. Built from the horn's
 * own valves, so each horn's hands land on its own block.
 */
function valvedUp(
    family: HoldFamily,
    id: BrassModelId,
    /** Where the left hand's middle goes and where its fingers point, in the instrument frame, when not on the casings. */
    leftHand?: { palm: Vec3; fingers: Vec3 },
    /** Where the right knuckles go from the middle button and where the fingers point, when not from the right side. */
    rightHand?: {
        knuckles?: Vec3;
        /** The palm's middle against the casings' right side, offset from its middle, in place of `knuckles`. */
        palmOnCasing?: Vec3;
        fingers: Vec3;
        out: Vec3;
    },
    /** The head's turn, when not just up. */
    head?: Hold["head"],
): Hold {
    const horn = brassHorn(id, "low");
    const instrument = atLips(horn.rim, head);
    const f = frameOf(instrument);
    const buttons = horn.valves.map((v) => v.button);
    // right: the knuckles just right of the buttons and a little below
    // their tops, the (stiff) fingers lying across them toward the left
    const casing = horn.valves[1];
    const mid = mul(add(casing.top, casing.bottom), 0.5);
    const rightFingers = dirToBody(
        f,
        unit(rightHand?.fingers ?? [0.95, 0.12, 0.12]),
    );
    const rightWrist = rightHand?.palmOnCasing
        ? sub(
              toBody(
                  f,
                  add(
                      mid,
                      add([-(casing.r + 0.022), 0, 0], rightHand.palmOnCasing),
                  ),
              ),
              mul(rightFingers, PALM),
          )
        : sub(
              toBody(
                  f,
                  add(mean(buttons), rightHand?.knuckles ?? [-0.02, -0.012, 0]),
              ),
              mul(rightFingers, KNUCKLES),
          );
    // left: palm on the casings' left side, halfway down; fingers round the front
    const palm = leftHand?.palm ?? add(mid, [casing.r + 0.022, -0.01, -0.005]);
    const leftFingers = dirToBody(
        f,
        unit(leftHand?.fingers ?? [-0.35, 0.35, 0.87]),
    );
    const leftWrist = sub(toBody(f, palm), mul(leftFingers, PALM));
    return {
        family,
        state: "up",
        right: armTo(
            "right",
            rightWrist,
            rightFingers,
            rightHand?.out ?? [-1, 0.05, 0.25],
        ),
        left: armTo("left", leftWrist, leftFingers, [1, -0.1, 0.2]),
        instrument,
        ...(head ? { head } : {}),
    };
}

/**
 * `old` moved with its instrument to `instrument`: each wrist and its
 * fingers keep their place on the instrument, and the elbows are solved
 * again for the new wrists, out the way they pointed before.
 */
function reframed(old: Hold, instrument: Hold["instrument"]): Hold {
    const from = frameOf(old.instrument);
    const to = frameOf(instrument);
    const move = (side: "left" | "right", a: ArmTargets): ArmTargets => {
        const shoulder = side === "left" ? SHOULDER_L : SHOULDER_R;
        const wrist = toBody(to, toInstrument(from, a.wrist));
        const fingers = dirToBody(
            to,
            toInstrument({ ...from, o: [0, 0, 0] }, a.fingers),
        );
        return armTo(side, wrist, fingers, sub(a.elbow, shoulder));
    };
    return {
        ...old,
        right: move("right", old.right),
        left: move("left", old.left),
        instrument,
    };
}

/**
 * The valved horns' carry and trail, shared by the trumpet, mellophone,
 * baritone, euphonium and trombones. Each horn's `up` is its own
 * (`valvedUp`, `tromboneUp`).
 */
const BRASS: Record<"carry" | "trail", Hold> = {
    carry: {
        family: "trumpet",
        state: "carry",
        // vertical in front of the torso, bell to the ground, mouthpiece at eye level
        right: {
            elbow: [-0.216, 1.305, 0.176],
            wrist: [-0.05, 1.5, 0.24],
            fingers: unit([0.3, 0.1, 0.0]),
        },
        left: {
            elbow: [0.224, 1.273, 0.154],
            wrist: [0.05, 1.46, 0.22],
            fingers: unit([-0.3, 0.2, 0.0]),
        },
        instrument: {
            origin: [0, 1.5, 0.26],
            bellAxis: [0, -1, 0],
            capsAxis: [0, 0, 1],
        },
    },
    trail: {
        family: "trumpet",
        state: "trail",
        // right arm straight down the side, bell back; left fist at the leg
        right: {
            elbow: [-0.237, 1.202, -0.041],
            wrist: [-0.27, 0.95, 0.03],
            fingers: unit([0, -1, 0]),
        },
        left: {
            elbow: [0.231, 1.202, -0.047],
            wrist: [0.25, 0.95, 0.03],
            fingers: unit([0, -1, 0]),
        },
        instrument: {
            origin: [-0.27, 0.9, 0.03],
            bellAxis: [0, 0, -1],
            capsAxis: [-1, 0, 0],
        },
    },
};

/**
 * Trombone: right hand on the moving slide brace, left at the bell brace;
 * only `up` differs. The mouthpiece tube is the slide's right-hand one and
 * its rim sits 0.135 m behind the brace, so the brace is held left of
 * center and close in for the rim to meet the lips.
 */
const TROMBONE: Record<HoldState, Hold> = {
    up: {
        family: "trombone",
        state: "up",
        right: {
            elbow: [-0.238, 1.429, 0.195],
            wrist: [-0.01, 1.555, 0.235],
            fingers: unit([0.3, 0.1, 0.2]),
        },
        left: {
            elbow: [0.347, 1.401, 0.126],
            wrist: [0.13, 1.55, 0.15],
            fingers: unit([-0.3, 0.2, 0.1]),
        },
        instrument: {
            origin: [0.043, 1.56, 0.265],
            bellAxis: [0, 0, 1],
            capsAxis: [0, 1, 0],
        },
    },
    carry: { ...BRASS.carry, family: "trombone" },
    trail: { ...BRASS.trail, family: "trombone" },
};

/**
 * Trombones up (owner, 2026-11-10): pitched 15 degrees above level with
 * the rim at the lips, the right hand on the slide brace and the left on
 * the bell section's brace by the mouthpiece, where `TROMBONE.up` has them.
 */
/**
 * Trombones are rolled a little about their own axis, the mouthpiece's
 * tube on top and the left side down, so the bell section runs beside the
 * left temple rather than through the head. Marching players roll it far
 * less than concert players (drum corps photos, 2026-11-10).
 */
const TROMBONE_ROLL_DEG = 18;
/** And turned 8 degrees, the bell a little right, so the tuning slide swings back past the left ear. */
const TROMBONE_YAW_DEG = -8;
/** And the mouthpiece a little left of the lips' center, as many players set it. */
const TROMBONE_OFF_CENTER = 0.012;
/**
 * The left arm makes the marching triangle (owner, 2026-11-10; Blue Devils
 * 2016 photos): the elbow level with the shoulder, out to the side and a
 * little forward, the forearm rising across in front of the chin to the
 * grip by the mouthpiece, the wrist straight. Concert players hang this
 * elbow low; marching players don't.
 */
const TROMBONE_LEFT = {
    wrist: [0.114, 1.521, 0.144] as Vec3,
    palm: [0.04, 1.56, 0.15] as Vec3,
    elbow: [0.346, 1.397, 0.123] as Vec3,
};
function tromboneUp(family: "trombone" | "bassTrombone"): Hold {
    const id = family === "trombone" ? "trombone" : "bassTrombone";
    const h = reframed(
        TROMBONE.up,
        atLips(
            brassHorn(id, "low").rim,
            HEAD_UP,
            TROMBONE_YAW_DEG,
            TROMBONE_ROLL_DEG,
            TROMBONE_OFF_CENTER,
        ),
    );
    const { wrist, palm, elbow } = TROMBONE_LEFT;
    return {
        ...h,
        left: armTo(
            "left",
            wrist,
            unit(sub(palm, wrist)),
            sub(elbow, SHOULDER_L),
        ),
        family,
    };
}

/**
 * The contra up (owner, 2026-11-10): pitched 15 degrees above level with
 * the rim at the lips, the right hand over the valves like the other
 * horns but coming across from above, and the left hand round the front bow, the tube that comes down
 * the front of the loops on the horn's left side (x 0.05, z 0.064 in
 * `contra.ts`). The loops lie back over the left shoulder. Carry and trail
 * are the same hold: the contra stays on the shoulder.
 */
/**
 * A contra player's head (photos, 2026-11-10): up like everyone's, leaned
 * toward the right shoulder, away from the horn, and turned a little left
 * toward the mouthpiece.
 */
const CONTRA_HEAD = { pitch: 15, roll: -12, yaw: 18 };

function contraHolds(): Record<HoldState, Hold> {
    const up = valvedUp(
        "contra",
        "contra",
        {
            palm: [0.05 + 0.03, -0.075, 0.07],
            fingers: [-0.35, 0.8, 0.35],
        },
        // the valves stand in front of the face at the forehead: the right
        // palm lies against the casings' right side and the fingers go up
        // onto the pistons (owner, 2026-11-10). The valves are only 0.37 m
        // from the right shoulder, so the arm makes its triangle with the
        // elbow dropped forward in front of the chest, the upper arm a
        // little below level and the forearm rising steeply to the valves.
        {
            palmOnCasing: [0, 0, 0],
            fingers: [0.2, 0.95, 0.15],
            out: [0, -0.6, 1],
        },
        CONTRA_HEAD,
    );
    return {
        up,
        carry: { ...up, state: "carry" },
        trail: { ...up, state: "trail" },
    };
}

/**
 * Sousaphone: the hoop hangs like a sash from the left shoulder to the right
 * hip, the bell over the head on a neck behind the left shoulder. The
 * valves sit inside the hoop's lower front, caps toward the right hand; the
 * left hand holds the body tube where it comes down the front. One hold for
 * every state, like the contra: it is worn, not lowered.
 */
const SOUSAPHONE_UP: Hold = {
    family: "sousaphone",
    state: "up",
    right: {
        elbow: [-0.293, 1.234, 0.061],
        wrist: [-0.17, 1.19, 0.29],
        fingers: unit([0.9, 0.4, 0.16]),
    },
    left: {
        elbow: [0.303, 1.244, 0.069],
        wrist: [0.235, 1.294, 0.319],
        fingers: unit([-0.6, 0.55, 0.55]),
    },
    instrument: {
        origin: [-0.0733, 1.2128, 0.3069],
        bellAxis: [0, 0, 1],
        capsAxis: [0, 1, 0],
    },
};
/**
 * The sousaphone's left hand holds the mouthpiece in place at the lips
 * (owner, 2026-11-10): the palm on the left of the leadpipe just past the
 * mouthpiece, the fingers round it toward the right and forward.
 */
const SOUSAPHONE_LEFT_PALM: Vec3 = [0.035, 1.585, 0.15];
const SOUSAPHONE_LEFT_FINGERS: Vec3 = unit([-0.75, 0.25, 0.6]);
const SOUSAPHONE_PLAYING: Hold = {
    ...SOUSAPHONE_UP,
    left: armTo(
        "left",
        sub(SOUSAPHONE_LEFT_PALM, mul(SOUSAPHONE_LEFT_FINGERS, PALM)),
        SOUSAPHONE_LEFT_FINGERS,
        // the elbow low and forward in front of the left chest, so the
        // forearm rises to the mouthpiece clear of the body tube coming down
        // from the left shoulder (owner, 2026-11-10: it clipped through)
        [-0.15, -0.4, 1],
    ),
};
const SOUSAPHONE: Record<HoldState, Hold> = {
    up: SOUSAPHONE_PLAYING,
    carry: { ...SOUSAPHONE_PLAYING, state: "carry" },
    trail: { ...SOUSAPHONE_PLAYING, state: "trail" },
};

/**
 * Woodwinds at trail (owner, 2026-10-09): the brass trail's arms. The right
 * arm hangs straight down the side with the instrument in its fist, 0.07 m
 * down the fingers from the wrist at (−0.27, 0.88, 0.03); the left arm hangs
 * straight down the leg, a closed fist with the thumb on top.
 */
const TRAIL_RIGHT: ArmTargets = BRASS.trail.right;
const TRAIL_LEFT: ArmTargets = BRASS.trail.left;

/**
 * Flutes and clarinets at carry (owner, 2026-10-09): the tube vertical in
 * front of the body, head joint up, keys forward, the first key at eye
 * level. The hands make a triangle: each wrist a hand's length out and
 * below its point on the tube, the elbows out, the forearms angled in and
 * up to it, the left hand above the right.
 */

/**
 * Flute: horizontal to the player's right at the lips, angled a little
 * forward and down. Both hands sit under the tube, wrists below it, the
 * fingers wrapping up and over onto the keys: the left hand by the face (its
 * forearm across the chest, the elbow in front), the right hand further out
 * with the elbow down and out. Carry: vertical, the first key (0.2 m along)
 * at eye level, the hands at 0.25 and 0.43 m. Trail: the head joint to the
 * ground, the fist round the body 0.5 m along.
 */
const FLUTE: Record<HoldState, Hold> = {
    up: {
        family: "flute",
        state: "up",
        // horizontal to the right, the lip plate under the lower lip, keys and
        // embouchure hole up (they are in line on a flute), tipped a little back
        right: {
            elbow: [-0.297, 1.225, 0.003],
            wrist: [-0.4, 1.332, 0.212],
            fingers: unit([0.05, 0.9, 0.42]),
        },
        left: {
            elbow: [0.067, 1.352, 0.157],
            wrist: [-0.19, 1.362, 0.172],
            fingers: unit([-0.1, 0.9, 0.42]),
        },
        instrument: {
            origin: [0, 1.512, 0.142],
            bellAxis: [-0.968, -0.151, 0.202],
            capsAxis: [0, 1, -0.25],
        },
    },
    carry: {
        family: "flute",
        state: "carry",
        // vertical in front, head joint up, the first key at eye level; the hands a triangle
        right: {
            elbow: [-0.326, 1.282, 0.089],
            wrist: [-0.085, 1.315, 0.19],
            fingers: unit([0.725, 0.64, 0.256]),
        },
        left: {
            elbow: [0.322, 1.387, 0.147],
            wrist: [0.085, 1.495, 0.19],
            fingers: unit([-0.725, 0.64, 0.256]),
        },
        instrument: {
            origin: [0, 1.82, 0.22],
            bellAxis: [0, -1, 0],
            capsAxis: [0, 0, 1],
        },
    },
    trail: {
        family: "flute",
        state: "trail",
        // in the right fist at the side, head joint to the ground
        right: TRAIL_RIGHT,
        left: TRAIL_LEFT,
        instrument: {
            origin: [-0.26, 0.38, 0.075],
            bellAxis: [0, 1, 0],
            capsAxis: [0, 0, 1],
        },
    },
};

/**
 * Piccolo: the flute's hold with both hands brought in to the short body
 * (0.32 m against the flute's 0.67): the left hand 0.12 m along it, the
 * right 0.24 m. Carry: the first key 0.101 m along at eye level, the hands
 * at 0.14 and 0.24 m. Trail: the fist round the body 0.18 m along.
 */
const PICCOLO: Record<HoldState, Hold> = {
    up: {
        family: "piccolo",
        state: "up",
        // the flute's line, hands close together
        right: {
            elbow: [-0.275, 1.214, -0.027],
            wrist: [-0.23, 1.352, 0.177],
            fingers: unit([0.05, 0.9, 0.42]),
        },
        left: {
            elbow: [0.133, 1.332, 0.183],
            wrist: [-0.11, 1.372, 0.152],
            fingers: unit([-0.1, 0.9, 0.42]),
        },
        instrument: {
            origin: [0, 1.512, 0.142],
            bellAxis: [-0.968, -0.151, 0.202],
            capsAxis: [0, 1, -0.25],
        },
    },
    carry: {
        family: "piccolo",
        state: "carry",
        // vertical in front, head joint up, the first key at eye level; the hands a triangle
        right: {
            elbow: [-0.326, 1.32, 0.123],
            wrist: [-0.085, 1.406, 0.19],
            fingers: unit([0.725, 0.64, 0.256]),
        },
        left: {
            elbow: [0.322, 1.397, 0.148],
            wrist: [0.085, 1.506, 0.19],
            fingers: unit([-0.725, 0.64, 0.256]),
        },
        instrument: {
            origin: [0, 1.721, 0.22],
            bellAxis: [0, -1, 0],
            capsAxis: [0, 0, 1],
        },
    },
    trail: {
        family: "piccolo",
        state: "trail",
        // in the right fist at the side, head joint to the ground
        right: TRAIL_RIGHT,
        left: TRAIL_LEFT,
        instrument: {
            origin: [-0.26, 0.7, 0.075],
            bellAxis: [0, 1, 0],
            capsAxis: [0, 0, 1],
        },
    },
};

/**
 * Clarinet (and the soprano sax): down the center line from the mouth. The
 * hands wrap the joints from the sides, fingers across the front onto the
 * holes, thumbs behind: left hand on the upper joint, right on the lower,
 * elbows a little out. Carry: vertical, mouthpiece up, the first key at eye
 * level (0.16 m along: the clarinet's throat Ab at 0.168, the soprano's C at
 * 0.145), the hands at 0.25 and 0.42 m. Trail: the mouthpiece to the ground,
 * the fist round the lower joint 0.5 m along, a little further forward than
 * the flute's to clear the forearm with the bell.
 */
const CLARINET: Record<HoldState, Hold> = {
    up: {
        family: "clarinet",
        state: "up",
        // angled 28 degrees out; left hand upper joint, right hand lower
        right: {
            elbow: [-0.246, 1.239, 0.11],
            wrist: [-0.075, 1.15, 0.29],
            fingers: unit([0.8, -0.2, 0.55]),
        },
        left: {
            elbow: [0.308, 1.261, 0.087],
            wrist: [0.075, 1.33, 0.19],
            fingers: unit([-0.8, -0.2, 0.55]),
        },
        instrument: {
            origin: [0, 1.52, 0.13],
            bellAxis: [0.0, -0.882, 0.471],
            capsAxis: [0.0, 0.471, 0.882],
        },
    },
    carry: {
        family: "clarinet",
        state: "carry",
        // vertical in front, mouthpiece up, the first key at eye level; the hands a triangle
        right: {
            elbow: [-0.325, 1.274, 0.081],
            wrist: [-0.085, 1.285, 0.19],
            fingers: unit([0.725, 0.64, 0.256]),
        },
        left: {
            elbow: [0.324, 1.355, 0.14],
            wrist: [0.085, 1.455, 0.19],
            fingers: unit([-0.725, 0.64, 0.256]),
        },
        instrument: {
            origin: [0, 1.78, 0.22],
            bellAxis: [0, -1, 0],
            capsAxis: [0, 0, 1],
        },
    },
    trail: {
        family: "clarinet",
        state: "trail",
        // in the right fist at the side, mouthpiece to the ground
        right: TRAIL_RIGHT,
        left: TRAIL_LEFT,
        instrument: {
            origin: [-0.26, 0.38, 0.09],
            bellAxis: [0, 1, 0],
            capsAxis: [0, 0, 1],
        },
    },
};

/**
 * Saxes hang from the neck strap in front of the body: the neck brings the
 * body out in front of the mouth and the body runs straight down to the bow
 * at the stomach, parallel to the performer. The model turns its body
 * under the neck as a sax is played (`SAX_BODY_TURN` in saxophones.ts): the
 * bell stands in front of the body tube, a little to the player's left,
 * opening forward and up, and the pearls face the player's front-right.
 * The hands wrap the body from the sides, fingers across the front: left
 * hand on the upper stack, right hand on the lower, elbows out.
 *
 * Carry (owner, 2026-10-09; turned 2026-11-09 with the model): vertical
 * just in front of the body exactly as it is played, raised so the
 * mouthpiece sits at eye level: the body tube on the center line 0.24 m
 * out, the bell in front of it. The hands stay where they play, left on
 * the upper stack from the left side, right on the lower stack from the
 * right, fingers in across the tube.
 *
 * Trail: level at the right side, front to back like the brass trail, the
 * fist round the body tube 0.37 m along with the mouthpiece in front. The
 * alto's and bari's body tubes run through the fist; the tenor's longer
 * neck puts its tube 0.07 m out. The frame is turned about the body tube by
 * the model's body turn, so the bow and bell hang below the tube and the
 * keys face out and down, away from the leg.
 */
const SAX: Record<HoldState, Hold> = {
    up: {
        family: "sax",
        state: "up",
        // in front, straight down to the bow at the stomach; hands wrap from the sides
        right: {
            elbow: [-0.221, 1.223, 0.097],
            wrist: [-0.07, 1.08, 0.26],
            fingers: unit([0.8, -0.1, 0.6]),
        },
        left: {
            elbow: [0.263, 1.236, 0.096],
            wrist: [0.085, 1.15, 0.27],
            fingers: unit([-0.8, -0.1, 0.6]),
        },
        instrument: {
            origin: [0, 1.52, 0.13],
            bellAxis: [0.03, -0.99, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
    carry: {
        family: "sax",
        state: "carry",
        // vertical as it is played, bell in front; mouthpiece at eye level
        right: {
            elbow: [-0.309, 1.243, 0.049],
            wrist: [-0.15, 1.12, 0.22],
            fingers: unit([0.982, 0.085, 0.171]),
        },
        left: {
            elbow: [0.342, 1.277, 0.05],
            wrist: [0.14, 1.27, 0.22],
            fingers: unit([-0.963, 0.168, 0.209]),
        },
        instrument: {
            origin: [0, 1.62, 0.13],
            bellAxis: [0, -1, 0],
            capsAxis: [0, 0, 1],
        },
    },
    trail: {
        family: "sax",
        state: "trail",
        // level at the right side, mouthpiece forward, bell hanging below
        right: TRAIL_RIGHT,
        left: TRAIL_LEFT,
        instrument: {
            origin: [-0.222, 0.978, 0.4],
            bellAxis: [0, 0, -1],
            capsAxis: [-0.423, -0.906, 0],
        },
    },
};

/**
 * Bass clarinet: its body hangs 0.124 m toward the keys from the mouthpiece
 * and runs a meter long, so it plays nearly vertical, tipped 10 degrees
 * out, the neck bringing the mouthpiece up into the lips. Left hand on the
 * upper cups (0.33 m along); the right arm hangs almost straight to reach
 * the lower ones (0.6 m along), its fingers angled down to them.
 *
 * Carry (owner, 2026-10-09): as the saxes, vertical and turned a quarter
 * with the keys to the performer's right, the mouthpiece at eye level and
 * the body tube on the center line. The crook and bell, which turn toward
 * the keys, sit low at the right side.
 *
 * Trail: level at the right side like the saxes, the fist round the body
 * 0.5 m along with the mouthpiece in front. The keys face the ground so the
 * crook and bell hang below the tube behind the leg.
 */
const BASS_CLARINET: Record<HoldState, Hold> = {
    up: {
        family: "bassClarinet",
        state: "up",
        // nearly vertical, 10 degrees out; the right arm almost straight to the lower cups
        right: {
            elbow: [-0.218, 1.218, 0.09],
            wrist: [-0.11, 1.03, 0.24],
            fingers: unit([0.496, -0.437, 0.751]),
        },
        left: {
            elbow: [0.302, 1.284, 0.12],
            wrist: [0.085, 1.227, 0.259],
            fingers: unit([-0.625, -0.101, 0.774]),
        },
        instrument: {
            origin: [0, 1.52, 0.13],
            bellAxis: [0, -0.985, 0.174],
            capsAxis: [0, 0.174, 0.985],
        },
    },
    carry: {
        family: "bassClarinet",
        state: "carry",
        // vertical, keys to the right; mouthpiece at eye level
        right: {
            elbow: [-0.268, 1.224, 0.067],
            wrist: [-0.14, 1.06, 0.23],
            fingers: unit([0.857, -0.489, 0.163]),
        },
        left: {
            elbow: [0.341, 1.281, 0.06],
            wrist: [0.14, 1.29, 0.23],
            fingers: unit([-0.98, 0.089, 0.178]),
        },
        instrument: {
            origin: [0.124, 1.62, 0.22],
            bellAxis: [0, -1, 0],
            capsAxis: [-1, 0, 0],
        },
    },
    trail: {
        family: "bassClarinet",
        state: "trail",
        // level at the right side, mouthpiece forward, crook and bell hanging below
        right: TRAIL_RIGHT,
        left: TRAIL_LEFT,
        instrument: {
            origin: [-0.27, 1.004, 0.53],
            bellAxis: [0, 0, -1],
            capsAxis: [0, -1, 0],
        },
    },
};

const SNARE: Record<HoldState, Hold> = {
    up: {
        family: "snare",
        state: "up",
        // matched grip: hands just behind the back rim, palms down, sticks angled in to meet near the center a little above the head
        right: {
            elbow: [-0.281, 1.227, -0.066],
            wrist: [-0.209, 1.068, 0.132],
            fingers: unit([0.563, 0.032, 0.826]),
        },
        left: {
            elbow: [0.281, 1.227, -0.066],
            wrist: [0.209, 1.068, 0.132],
            fingers: unit([-0.563, 0.032, 0.826]),
        },
        instrument: {
            origin: [0, 1.0, 0.36],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
    carry: {
        family: "snare",
        state: "carry",
        // matched grip: hands just behind the back rim, palms down, sticks angled in to meet near the center a little above the head
        right: {
            elbow: [-0.281, 1.227, -0.066],
            wrist: [-0.209, 1.068, 0.132],
            fingers: unit([0.563, 0.032, 0.826]),
        },
        left: {
            elbow: [0.281, 1.227, -0.066],
            wrist: [0.209, 1.068, 0.132],
            fingers: unit([-0.563, 0.032, 0.826]),
        },
        instrument: {
            origin: [0, 1.0, 0.36],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
    trail: {
        family: "snare",
        state: "trail",
        // matched grip: hands just behind the back rim, palms down, sticks angled in to meet near the center a little above the head
        right: {
            elbow: [-0.281, 1.227, -0.066],
            wrist: [-0.209, 1.068, 0.132],
            fingers: unit([0.563, 0.032, 0.826]),
        },
        left: {
            elbow: [0.281, 1.227, -0.066],
            wrist: [0.209, 1.068, 0.132],
            fingers: unit([-0.563, 0.032, 0.826]),
        },
        instrument: {
            origin: [0, 1.0, 0.36],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
};

const TENORS: Record<HoldState, Hold> = {
    up: {
        family: "tenors",
        state: "up",
        // matched grip, wider than the snare: each hand behind one of the two front drums (1 on the left, 2 on the right), reaching over the shots to that drum's head
        right: {
            elbow: [-0.273, 1.212, -0.003],
            wrist: [-0.286, 1.088, 0.23],
            fingers: unit([0.511, -0.12, 0.851]),
        },
        left: {
            elbow: [0.273, 1.212, -0.003],
            wrist: [0.286, 1.088, 0.23],
            fingers: unit([-0.511, -0.12, 0.851]),
        },
        instrument: {
            origin: [0, 0.98, 0.36],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
    carry: {
        family: "tenors",
        state: "carry",
        // matched grip, wider than the snare: each hand behind one of the two front drums (1 on the left, 2 on the right), reaching over the shots to that drum's head
        right: {
            elbow: [-0.273, 1.212, -0.003],
            wrist: [-0.286, 1.088, 0.23],
            fingers: unit([0.511, -0.12, 0.851]),
        },
        left: {
            elbow: [0.273, 1.212, -0.003],
            wrist: [0.286, 1.088, 0.23],
            fingers: unit([-0.511, -0.12, 0.851]),
        },
        instrument: {
            origin: [0, 0.98, 0.36],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
    trail: {
        family: "tenors",
        state: "trail",
        // matched grip, wider than the snare: each hand behind one of the two front drums (1 on the left, 2 on the right), reaching over the shots to that drum's head
        right: {
            elbow: [-0.273, 1.212, -0.003],
            wrist: [-0.286, 1.088, 0.23],
            fingers: unit([0.511, -0.12, 0.851]),
        },
        left: {
            elbow: [0.273, 1.212, -0.003],
            wrist: [0.286, 1.088, 0.23],
            fingers: unit([-0.511, -0.12, 0.851]),
        },
        instrument: {
            origin: [0, 0.98, 0.36],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
};

const BASS: Record<HoldState, Hold> = {
    up: {
        family: "bass",
        state: "up",
        // the drum high on the carrier; upper arms down, forearms forward at the hips, the hands beside the heads below the center, mallets angled up and forward
        right: {
            elbow: [-0.238, 1.199, 0.006],
            wrist: [-0.25, 1.12, 0.23],
            fingers: unit([0, 0.6, 0.8]),
        },
        left: {
            elbow: [0.238, 1.199, 0.006],
            wrist: [0.25, 1.12, 0.23],
            fingers: unit([0, 0.6, 0.8]),
        },
        instrument: {
            origin: [0, 1.0, 0.34],
            bellAxis: [1.0, 0.0, 0.0],
            capsAxis: [0.0, 1.0, 0.0],
        },
    },
    carry: {
        family: "bass",
        state: "carry",
        // the drum high on the carrier; upper arms down, forearms forward at the hips, the hands beside the heads below the center, mallets angled up and forward
        right: {
            elbow: [-0.238, 1.199, 0.006],
            wrist: [-0.25, 1.12, 0.23],
            fingers: unit([0, 0.6, 0.8]),
        },
        left: {
            elbow: [0.238, 1.199, 0.006],
            wrist: [0.25, 1.12, 0.23],
            fingers: unit([0, 0.6, 0.8]),
        },
        instrument: {
            origin: [0, 1.0, 0.34],
            bellAxis: [1.0, 0.0, 0.0],
            capsAxis: [0.0, 1.0, 0.0],
        },
    },
    trail: {
        family: "bass",
        state: "trail",
        // the drum high on the carrier; upper arms down, forearms forward at the hips, the hands beside the heads below the center, mallets angled up and forward
        right: {
            elbow: [-0.238, 1.199, 0.006],
            wrist: [-0.25, 1.12, 0.23],
            fingers: unit([0, 0.6, 0.8]),
        },
        left: {
            elbow: [0.238, 1.199, 0.006],
            wrist: [0.25, 1.12, 0.23],
            fingers: unit([0, 0.6, 0.8]),
        },
        instrument: {
            origin: [0, 1.0, 0.34],
            bellAxis: [1.0, 0.0, 0.0],
            capsAxis: [0.0, 1.0, 0.0],
        },
    },
};

const CYMBALS: Record<HoldState, Hold> = {
    up: {
        family: "cymbals",
        state: "up",
        // a pair at chest height, plates vertical
        right: {
            elbow: [-0.328, 1.281, 0.084],
            wrist: [-0.2, 1.2, 0.3],
            fingers: unit([0, 0, 1]),
        },
        left: {
            elbow: [0.328, 1.281, 0.084],
            wrist: [0.2, 1.2, 0.3],
            fingers: unit([0, 0, 1]),
        },
        instrument: {
            origin: [0, 1.2, 0.3],
            bellAxis: [0.0, 0.0, 1.0],
            capsAxis: [0.0, 1.0, 0.0],
        },
    },
    carry: {
        family: "cymbals",
        state: "carry",
        // a pair at chest height, plates vertical
        right: {
            elbow: [-0.328, 1.281, 0.084],
            wrist: [-0.2, 1.2, 0.3],
            fingers: unit([0, 0, 1]),
        },
        left: {
            elbow: [0.328, 1.281, 0.084],
            wrist: [0.2, 1.2, 0.3],
            fingers: unit([0, 0, 1]),
        },
        instrument: {
            origin: [0, 1.2, 0.3],
            bellAxis: [0.0, 0.0, 1.0],
            capsAxis: [0.0, 1.0, 0.0],
        },
    },
    trail: {
        family: "cymbals",
        state: "trail",
        // a pair at chest height, plates vertical
        right: {
            elbow: [-0.328, 1.281, 0.084],
            wrist: [-0.2, 1.2, 0.3],
            fingers: unit([0, 0, 1]),
        },
        left: {
            elbow: [0.328, 1.281, 0.084],
            wrist: [0.2, 1.2, 0.3],
            fingers: unit([0, 0, 1]),
        },
        instrument: {
            origin: [0, 1.2, 0.3],
            bellAxis: [0.0, 0.0, 1.0],
            capsAxis: [0.0, 1.0, 0.0],
        },
    },
};

const FLAG: Record<HoldState, Hold> = {
    up: {
        family: "flag",
        state: "up",
        // present: the pole vertical in front, right hand high, left hand low
        right: {
            elbow: [-0.289, 1.272, 0.12],
            wrist: [-0.08, 1.25, 0.28],
            fingers: unit([0, 1, 0]),
        },
        left: {
            elbow: [0.15, 1.225, 0.101],
            wrist: [0.035, 1.034, 0.242],
            fingers: unit([0, 1, 0]),
        },
        instrument: {
            origin: [-0.08, 1.25, 0.28],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
    carry: {
        family: "flag",
        state: "carry",
        // at the right side, pole vertical, left arm down
        right: {
            elbow: [-0.306, 1.233, -0.024],
            wrist: [-0.3, 1.0, 0.1],
            fingers: unit([0, 1, 0]),
        },
        left: {
            elbow: [0.231, 1.202, -0.047],
            wrist: [0.25, 0.95, 0.03],
            fingers: unit([0, -1, 0]),
        },
        instrument: {
            origin: [-0.3, 1.0, 0.1],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
    trail: {
        family: "flag",
        state: "trail",
        // at the right side, pole vertical, left arm down
        right: {
            elbow: [-0.306, 1.233, -0.024],
            wrist: [-0.3, 1.0, 0.1],
            fingers: unit([0, 1, 0]),
        },
        left: {
            elbow: [0.231, 1.202, -0.047],
            wrist: [0.25, 0.95, 0.03],
            fingers: unit([0, -1, 0]),
        },
        instrument: {
            origin: [-0.3, 1.0, 0.1],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
};

/**
 * Swing flags wait at down 45 (owner, 2026-10-09), ready to start
 * swinging: the arm straight, out and down at 45 degrees from the shoulder
 * and a little forward, the pole running on along the arm from a short tab
 * in the fist. The silk trails back from the pole and a little down, so its
 * fly clears the ground. One swing flag rides the right hand with the left
 * arm relaxed at the side; a pair puts one in each hand, mirrored.
 */
const DOWN45_RIGHT: ArmTargets = {
    elbow: [-0.327, 1.255, 0.036],
    wrist: [-0.5, 1.082, 0.086],
    fingers: unit([-0.69, -0.69, 0.2]),
};
/** The same targets on the other side of the body's center plane. */
const mirrorArm = (a: ArmTargets): ArmTargets => ({
    elbow: [-a.elbow[0], a.elbow[1], a.elbow[2]],
    wrist: [-a.wrist[0], a.wrist[1], a.wrist[2]],
    fingers: [-a.fingers[0], a.fingers[1], a.fingers[2]],
});
const DOWN45_LEFT = mirrorArm(DOWN45_RIGHT);
const SWING_INSTRUMENT: Hold["instrument"] = {
    origin: DOWN45_RIGHT.wrist,
    // the pole along the arm; the silk's face, so its fly (+X) trails back
    bellAxis: unit([-0.69, -0.69, 0.2]),
    capsAxis: [0.719, -0.687, 0.109],
};
const SWING_FLAG = (state: HoldState): Hold => ({
    family: "swingFlag",
    state,
    right: DOWN45_RIGHT,
    left: {
        elbow: [0.231, 1.202, -0.047],
        wrist: [0.25, 0.95, 0.03],
        fingers: unit([0, -1, 0]),
    },
    instrument: SWING_INSTRUMENT,
});
const DOUBLE_SWING_FLAG = (state: HoldState): Hold => ({
    family: "doubleSwingFlag",
    state,
    right: DOWN45_RIGHT,
    left: DOWN45_LEFT,
    instrument: SWING_INSTRUMENT,
});
const SWING: Record<HoldState, Hold> = {
    up: SWING_FLAG("up"),
    carry: SWING_FLAG("carry"),
    trail: SWING_FLAG("trail"),
};
const DOUBLE_SWING: Record<HoldState, Hold> = {
    up: DOUBLE_SWING_FLAG("up"),
    carry: DOUBLE_SWING_FLAG("carry"),
    trail: DOUBLE_SWING_FLAG("trail"),
};

/**
 * The rifle is always carried level (owner, 2026-10-09): across the front
 * of the body at the waist, top up, the butt out past the right hip and the
 * muzzle to the performer's left. The right hand holds the wrist of the
 * stock, the left the fore-end.
 */
const RIFLE_LEVEL = (state: HoldState): Hold => ({
    family: "rifle",
    state,
    right: {
        elbow: [-0.276, 1.217, 0.033],
        wrist: [-0.15, 1.08, 0.22],
        fingers: unit([0.5, 0, 0.85]),
    },
    left: {
        elbow: [0.301, 1.23, 0.022],
        wrist: [0.21, 1.08, 0.22],
        fingers: unit([-0.5, 0, 0.85]),
    },
    instrument: {
        origin: [-0.15, 1.08, 0.22],
        bellAxis: [1.0, 0.0, 0.0],
        capsAxis: [0.0, 1.0, 0.0],
    },
});

const RIFLE: Record<HoldState, Hold> = {
    up: RIFLE_LEVEL("up"),
    carry: RIFLE_LEVEL("carry"),
    trail: RIFLE_LEVEL("trail"),
};

const SABRE: Record<HoldState, Hold> = {
    up: {
        family: "sabre",
        state: "up",
        // present: the blade vertical in front of the right shoulder
        right: {
            elbow: [-0.301, 1.293, 0.129],
            wrist: [-0.1, 1.3, 0.3],
            fingers: unit([0, 1, 0]),
        },
        left: {
            elbow: [0.231, 1.202, -0.047],
            wrist: [0.25, 0.95, 0.03],
            fingers: unit([0, -1, 0]),
        },
        instrument: {
            origin: [-0.1, 1.3, 0.3],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
    carry: {
        family: "sabre",
        state: "carry",
        // at the right hip, blade up along the shoulder
        right: {
            elbow: [-0.306, 1.233, -0.024],
            wrist: [-0.3, 1.0, 0.1],
            fingers: unit([0, 1, 0]),
        },
        left: {
            elbow: [0.231, 1.202, -0.047],
            wrist: [0.25, 0.95, 0.03],
            fingers: unit([0, -1, 0]),
        },
        instrument: {
            origin: [-0.3, 1.0, 0.1],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
    trail: {
        family: "sabre",
        state: "trail",
        // at the right hip, blade up along the shoulder
        right: {
            elbow: [-0.306, 1.233, -0.024],
            wrist: [-0.3, 1.0, 0.1],
            fingers: unit([0, 1, 0]),
        },
        left: {
            elbow: [0.231, 1.202, -0.047],
            wrist: [0.25, 0.95, 0.03],
            fingers: unit([0, -1, 0]),
        },
        instrument: {
            origin: [-0.3, 1.0, 0.1],
            bellAxis: [0.0, 1.0, 0.0],
            capsAxis: [0.0, 0.0, 1.0],
        },
    },
};

/**
 * Flutes and piccolos up (owner, 2026-11-10): level, and parallel to the
 * shoulders, running straight out to the performer's right from the lips.
 * The hands keep their places along the tube.
 */
const LEVEL_FLUTE = (old: Hold): Hold =>
    reframed(old, {
        origin: old.instrument.origin,
        bellAxis: [-1, 0, 0],
        capsAxis: [0, 1, -0.25],
    });

/** One arm's targets as the wrist study gives them: wrist, fingers, and the elbow it solved. */
type ArmPlan = { wrist: Vec3; fingers: Vec3; elbow: Vec3 };

/**
 * `h` with both hands set from a plan (woodwind wrist study, 2026-11-10):
 * a stiff mitt reads right when it carries straight on from the forearm,
 * bent only 10 to 25 degrees toward where the fingers would curl, with the
 * tube across the knuckles, as in photos of players. Each elbow is solved
 * again toward the point the study found, so the arm stays its length.
 */
function withHands(h: Hold, right: ArmPlan, left: ArmPlan): Hold {
    const arm = (side: "left" | "right", a: ArmPlan) =>
        armTo(
            side,
            a.wrist,
            a.fingers,
            sub(a.elbow, side === "left" ? SHOULDER_L : SHOULDER_R),
        );
    return { ...h, right: arm("right", right), left: arm("left", left) };
}

/**
 * The woodwind hands up, from the wrist study (photos, 2026-11-10). The
 * flutes' right forearm rises nearly straight from an elbow at the side,
 * the left crosses the chest from an elbow low in front; the clarinets'
 * and saxes' elbows hang at the sides and the forearms come forward and in.
 */
const WOODWIND_HANDS: Record<
    "flute" | "piccolo" | "clarinet" | "bassClarinet" | "sax",
    { right: ArmPlan; left: ArmPlan }
> = {
    piccolo: {
        left: {
            wrist: [-0.058, 1.509, 0.102],
            fingers: [-0.52, 0.82, 0.25],
            elbow: [0.086, 1.292, 0.14],
        },
        right: {
            wrist: [-0.252, 1.5, 0.087],
            fingers: [0.12, 0.91, 0.4],
            elbow: [-0.306, 1.243, 0.058],
        },
    },
    flute: {
        left: {
            wrist: [-0.141, 1.514, 0.102],
            fingers: [-0.59, 0.77, 0.25],
            elbow: [0.04, 1.323, 0.12],
        },
        right: {
            wrist: [-0.415, 1.501, 0.087],
            fingers: [-0.15, 0.9, 0.4],
            elbow: [-0.326, 1.256, 0.043],
        },
    },
    clarinet: {
        left: {
            wrist: [0.069, 1.391, 0.145],
            fingers: [-0.45, 0.55, 0.7],
            elbow: [0.209, 1.197, 0.033],
        },
        right: {
            wrist: [-0.069, 1.269, 0.246],
            fingers: [0.45, 0.15, 0.88],
            elbow: [-0.206, 1.196, 0.032],
        },
    },
    bassClarinet: {
        left: {
            wrist: [0.084, 1.278, 0.2],
            fingers: [-0.65, 0.4, 0.65],
            elbow: [0.24, 1.2, 0.002],
        },
        right: {
            wrist: [-0.072, 1.075, 0.24],
            fingers: [0.5, -0.45, 0.74],
            elbow: [-0.191, 1.197, 0.038],
        },
    },
    sax: {
        left: {
            wrist: [0.063, 1.354, 0.252],
            fingers: [-0.55, 0.45, 0.7],
            elbow: [0.21, 1.214, 0.084],
        },
        right: {
            wrist: [-0.051, 1.201, 0.271],
            fingers: [0.55, 0.12, 0.83],
            elbow: [-0.194, 1.2, 0.049],
        },
    },
};
const playedBy = (family: keyof typeof WOODWIND_HANDS, h: Hold): Hold =>
    withHands(h, WOODWIND_HANDS[family].right, WOODWIND_HANDS[family].left);

/**
 * The clarinet (and soprano sax) up (photos and The Instrumentalist,
 * 2026-11-10): 37 degrees out from vertical rather than 28, the bell well
 * in front at the belt. The hands come from `WOODWIND_HANDS`.
 */
const CLARINET_ANGLE_DEG = 37;
function clarinetOut(h: Hold): Hold {
    const a = (CLARINET_ANGLE_DEG * Math.PI) / 180;
    const moved = reframed(h, {
        origin: h.instrument.origin,
        bellAxis: [0, -Math.cos(a), Math.sin(a)],
        capsAxis: [0, Math.sin(a), Math.cos(a)],
    });
    return moved;
}

/**
 * The saxes up (photos, 2026-11-10): the bottom kicked forward 12 degrees.
 * The hands come from `WOODWIND_HANDS`: the left up on the upper stack at
 * the chest, the right on the lower stack, elbows relaxed near the body.
 */
const SAX_KICK_DEG = 12;
function saxForward(h: Hold): Hold {
    const k = (SAX_KICK_DEG * Math.PI) / 180;
    const down = unit(h.instrument.bellAxis);
    const bell: Vec3 = unit([
        down[0],
        down[1] * Math.cos(k),
        -down[1] * Math.sin(k),
    ]);
    const moved = reframed(h, {
        origin: h.instrument.origin,
        bellAxis: bell,
        capsAxis: [0, Math.sin(k), Math.cos(k)],
    });
    return moved;
}

/**
 * Where the woodwinds' `up` holds first put the mouth (at the chin, as it
 * turned out): the flutes' lip plate just under (0, 1.52, 0.094), the reed
 * instruments' mouthpiece tip at (0, 1.52, 0.13), which left it 4 cm in
 * front of the face. Each hold moves by as much as that point is from where
 * it belongs once the head turns up: the flutes' under the lips, the reeds'
 * tip a centimeter inside them.
 */
const FLUTE_MOUTH: Vec3 = [0, 1.52, 0.094];
const REED_MOUTH: Vec3 = [0, 1.52, 0.13];
const REED_INTO_LIPS = 0.01;
const withMouth = (old: Hold, reed = true): Hold => {
    const lips = playingLips(old.head ?? HEAD_UP);
    const d = reed
        ? sub(add(lips, [0, 0, -REED_INTO_LIPS]), REED_MOUTH)
        : sub(lips, FLUTE_MOUTH);
    const o = old.instrument.origin;
    return reframed(old, { ...old.instrument, origin: round3(add(o, d)) });
};

/** A valved horn's holds: its own `up`, the shared carry and trail. */
const valved =
    (family: HoldFamily, id: BrassModelId): (() => Record<HoldState, Hold>) =>
    () => ({
        up: valvedUp(family, id),
        carry: { ...BRASS.carry, family },
        trail: { ...BRASS.trail, family },
    });

const fixed =
    (r: Record<HoldState, Hold>): (() => Record<HoldState, Hold>) =>
    () =>
        r;

/** Each family's holds, built on first use: the horns' come from their geometry. */
const TABLE: Record<HoldFamily, () => Record<HoldState, Hold>> = {
    trumpet: valved("trumpet", "trumpet"),
    mellophone: valved("mellophone", "mellophone"),
    baritone: valved("baritone", "baritone"),
    euphonium: valved("euphonium", "euphonium"),
    trombone: () => ({ ...TROMBONE, up: tromboneUp("trombone") }),
    bassTrombone: () => ({
        up: tromboneUp("bassTrombone"),
        carry: { ...BRASS.carry, family: "bassTrombone" },
        trail: { ...BRASS.trail, family: "bassTrombone" },
    }),
    contra: contraHolds,
    sousaphone: fixed(SOUSAPHONE),
    flute: () => ({
        ...FLUTE,
        up: playedBy("flute", withMouth(LEVEL_FLUTE(FLUTE.up), false)),
    }),
    piccolo: () => ({
        ...PICCOLO,
        up: playedBy("piccolo", withMouth(LEVEL_FLUTE(PICCOLO.up), false)),
    }),
    clarinet: () => ({
        ...CLARINET,
        up: playedBy("clarinet", clarinetOut(withMouth(CLARINET.up))),
    }),
    bassClarinet: () => ({
        ...BASS_CLARINET,
        up: playedBy("bassClarinet", withMouth(BASS_CLARINET.up)),
    }),
    sax: () => ({ ...SAX, up: playedBy("sax", saxForward(withMouth(SAX.up))) }),
    // battery (drum corps photos, 2026-11-10): the upper arms hang close to
    // the ribs, 10 to 20 degrees off vertical, the forearms reach forward
    snare: () =>
        battery(
            SNARE,
            [-0.135, 1.085, 0.26],
            [0.34, -0.04, 0.9],
            [-0.1, -1, 0.25],
            [0, 1.0, 0.45],
        ),
    tenors: () =>
        battery(
            TENORS,
            [-0.19, 1.09, 0.24],
            [0.12, -0.12, 0.95],
            [-0.15, -1, 0.3],
        ),
    // the hands at the lower ribs, mallets steep, the drum high (photos, 2026-11-10)
    bass: () => battery(BASS, [-0.255, 1.13, 0.27], undefined, [-0.3, -1, 0.2]),
    // the plates at the chest, hands 0.26 m apart, elbows only a little out
    cymbals: () =>
        battery(
            CYMBALS,
            [-0.13, 1.23, 0.3],
            undefined,
            [-0.5, -1, 0.1],
            [0, 1.23, 0.3],
        ),
    flag: () => ({ ...FLAG, up: FLAG_PRESENT }),
    swingFlag: fixed(SWING),
    doubleSwingFlag: fixed(DOUBLE_SWING),
    rifle: fixed(RIFLE),
    sabre: fixed(SABRE),
};
const built = new Map<HoldFamily, Record<HoldState, Hold>>();

/**
 * An arm whose hand carries straight on from the forearm (owner,
 * 2026-11-10: a straight line from the top of the hand to the elbow, no
 * break at the wrist), with the knuckles kept at `knuckles`: the hand
 * points along the forearm, the wrist sits a hand's length back from the
 * knuckles, and the elbow is solved again toward `out`, until they agree.
 */
function straightArm(
    side: "left" | "right",
    knuckles: Vec3,
    out: Vec3,
    start: Vec3,
): ArmTargets {
    const shoulder = side === "left" ? SHOULDER_L : SHOULDER_R;
    let fingers = unit(start);
    let wrist = sub(knuckles, mul(fingers, KNUCKLES));
    let elbow = elbowFor(shoulder, wrist, out);
    for (let i = 0; i < 12; i++) {
        fingers = unit(sub(wrist, elbow));
        wrist = sub(knuckles, mul(fingers, KNUCKLES));
        elbow = elbowFor(shoulder, wrist, out);
    }
    return { elbow, wrist: round3(wrist), fingers: unit(sub(wrist, elbow)) };
}

/** `h` with both wrists straight, each hand's knuckles where they were (`straightArm`). */
function straightWrists(h: Hold, out?: { right?: Vec3; left?: Vec3 }): Hold {
    const arm = (side: "left" | "right", a: ArmTargets, o?: Vec3) => {
        const shoulder = side === "left" ? SHOULDER_L : SHOULDER_R;
        const knuckles = add(a.wrist, mul(a.fingers, KNUCKLES));
        return straightArm(
            side,
            knuckles,
            o ?? sub(a.elbow, shoulder),
            a.fingers,
        );
    };
    return {
        ...h,
        right: arm("right", h.right, out?.right),
        left: arm("left", h.left, out?.left),
    };
}

/** The brass families whose `up` is played with straight wrists. */
const STRAIGHT_BRASS: ReadonlySet<HoldFamily> = new Set<HoldFamily>([
    "trumpet",
    "mellophone",
    "baritone",
    "euphonium",
    "trombone",
    "bassTrombone",
    "contra",
    "sousaphone",
]);
/** Elbow directions for holds with straight wrists that need their own; others keep theirs. */
const STRAIGHT_OUT: Partial<Record<HoldFamily, { right?: Vec3; left?: Vec3 }>> =
    {
        // the right elbow forward of the chest, level with the left one (owner, 2026-11-10)
        contra: { right: [-0.2, -0.2, 1] },
        // the left elbow up at the shoulder, the right a little lower at the chest
        trombone: { left: [0.161, 0, 0.128], right: [-0.03, -0.006, 0.203] },
        bassTrombone: {
            left: [0.161, 0, 0.128],
            right: [-0.03, -0.006, 0.203],
        },
        // in front of the chest, clear of the body tube
        sousaphone: { left: [-0.15, -0.4, 1.4] },
    };

/**
 * The 6 ft flag presented (Star Line and other guard instruction pages, parade
 * photos, 2026-11-10): the left hand covers the butt at the belly button,
 * the right hand grips the pole 0.6 m up it at about nose height, and the
 * pole leans 25 degrees forward and out to the performer's right, the
 * silk above and ahead of the head.
 */
const FLAG_BUTT: Vec3 = [0.0, 1.05, 0.2];
const FLAG_POLE: Vec3 = unit([-0.25, 0.9, 0.3]);
/** The flag's right-hand grip, up the pole from the butt (guard.ts: the butt is 0.6 below it). */
const FLAG_GRIP: Vec3 = add(FLAG_BUTT, mul(FLAG_POLE, 0.6));
const FLAG_PRESENT: Hold = {
    family: "flag",
    state: "up",
    right: armTo(
        "right",
        sub(FLAG_GRIP, mul(FLAG_POLE, 0.07)),
        FLAG_POLE,
        [-1, -0.3, 0.2],
    ),
    left: armTo(
        "left",
        sub(FLAG_BUTT, mul(FLAG_POLE, 0.05)),
        FLAG_POLE,
        [1, -0.6, 0],
    ),
    instrument: {
        origin: round3(FLAG_GRIP),
        bellAxis: FLAG_POLE,
        capsAxis: [0, 0, 1],
    },
};

/**
 * A battery family's hold in every state (it plays the same in each): the
 * right wrist at `wrist` with its fingers along `fingers` (unchanged when
 * absent), the elbow solved toward `out`, the left arm the mirror image,
 * and the instrument at `origin` when given.
 */
function battery(
    r: Record<HoldState, Hold>,
    wrist: Vec3,
    fingers: Vec3 | undefined,
    out: Vec3,
    origin?: Vec3,
): Record<HoldState, Hold> {
    const mirror = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
    const f = unit(fingers ?? r.up.right.fingers);
    const up: Hold = {
        ...r.up,
        right: armTo("right", wrist, f, out),
        left: armTo("left", mirror(wrist), mirror(f), mirror(out)),
        instrument: origin ? { ...r.up.instrument, origin } : r.up.instrument,
    };
    return {
        up,
        carry: { ...up, state: "carry" },
        trail: { ...up, state: "trail" },
    };
}

export function hold(family: HoldFamily, state: HoldState): Hold {
    let r = built.get(family);
    if (!r) {
        r = TABLE[family]();
        if (STRAIGHT_BRASS.has(family)) {
            const up = straightWrists(r.up, STRAIGHT_OUT[family]);
            // the worn horns play the same hold in every state
            const worn = family === "contra" || family === "sousaphone";
            r = {
                up,
                carry: worn ? { ...up, state: "carry" } : r.carry,
                trail: worn ? { ...up, state: "trail" } : r.trail,
            };
        }
        built.set(family, r);
    }
    return r[state];
}
